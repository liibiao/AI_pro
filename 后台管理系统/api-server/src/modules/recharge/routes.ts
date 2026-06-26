import { Router } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { applyWalletDelta } from '../../billing.js';
import { amountCentsToYuan, createAlipayPrecreate, verifyAlipayNotify } from './alipay.js';
import { getPaymentRuntimeSettings } from '../system-settings/service.js';

const router = Router();
export const payNotifyRouter = Router();

const createOrderSchema = z.object({
  amountYuan: z.number().positive().max(100000),
  channel: z.enum(['ALIPAY', 'MOCK']).optional(),
});

function orderNo() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `R${stamp}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function creditsFor(amountCents: number, creditsPerCny: number) {
  return Math.round((amountCents / 100) * creditsPerCny);
}

function parseAmountCents(value: string) {
  const [yuanRaw, fenRaw = ''] = value.split('.');
  const yuan = Number(yuanRaw || 0);
  const fen = Number((fenRaw + '00').slice(0, 2));
  return yuan * 100 + fen;
}

async function markOrderPaid(input: { orderNo: string; tradeNo?: string; notifyPayload?: Prisma.InputJsonValue }) {
  return prisma.$transaction(async tx => {
    const order = await tx.rechargeOrder.findUnique({ where: { orderNo: input.orderNo } });
    if (!order) fail(404, '充值订单不存在', 'RECHARGE_ORDER_NOT_FOUND');
    if (order.status === 'PAID') return { order };
    if (order.status !== 'PENDING') fail(400, '充值订单状态不可入账', 'RECHARGE_ORDER_NOT_PAYABLE');

    const changed = await tx.rechargeOrder.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), paymentTradeNo: input.tradeNo, notifyPayload: input.notifyPayload },
    });
    if (changed.count === 0) {
      const current = await tx.rechargeOrder.findUnique({ where: { id: order.id } });
      return { order: current || order };
    }

    await tx.wallet.upsert({
      where: { userId: order.userId },
      update: {},
      create: { userId: order.userId, balance: 0 },
    });
    const walletChange = await applyWalletDelta(tx, { userId: order.userId, delta: order.credits });
    await tx.walletLog.create({
      data: {
        userId: order.userId,
        type: 'RECHARGE',
        amount: order.credits,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'RECHARGE_ORDER',
        relatedId: order.id,
        remark: `充值 ${amountCentsToYuan(order.amountCents)} 元`,
      },
    });
    const paidOrder = await tx.rechargeOrder.findUnique({ where: { id: order.id } });
    return { order: paidOrder || order, balance: walletChange.balanceAfter, commission: null };
  });
}

async function closeExpiredRechargeOrders() {
  await prisma.rechargeOrder.updateMany({
    where: { status: 'PENDING', expiredAt: { lt: new Date() } },
    data: { status: 'CLOSED' },
  });
}

router.get('/orders', requireAuth, asyncHandler(async (req, res) => {
  await closeExpiredRechargeOrders();
  const isAdmin = adminRoles.includes(req.user!.role);
  const orders = await prisma.rechargeOrder.findMany({
    where: isAdmin ? {} : { userId: req.user!.id },
    include: { user: { select: { id: true, nickname: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  ok(res, { items: orders });
}));

router.post('/orders', requireAuth, asyncHandler(async (req, res) => {
  const body = createOrderSchema.parse(req.body);
  const settings = await getPaymentRuntimeSettings();
  const amountCents = Math.round(body.amountYuan * 100);
  const credits = creditsFor(amountCents, settings.rechargeCreditsPerCny);
  if (credits <= 0) fail(400, '充值金额过低', 'RECHARGE_AMOUNT_TOO_LOW');

  if (settings.paymentMode === 'voucher') {
    fail(400, '当前为兑换码线下支付模式，请通过代理或管理员获取充值兑换码后兑换', 'VOUCHER_PAYMENT_MODE');
  }

  const channel = body.channel || (settings.paymentMode === 'alipay' ? 'ALIPAY' : 'MOCK');
  if (channel === 'MOCK' && settings.paymentMode !== 'mock') {
    fail(400, '当前支付模式不允许创建模拟支付订单', 'MOCK_PAY_MODE_DISABLED');
  }
  if (channel === 'ALIPAY' && settings.paymentMode !== 'alipay') {
    fail(400, '当前支付模式不允许创建支付宝订单', 'ALIPAY_PAY_MODE_DISABLED');
  }
  const currentOrderNo = orderNo();
  const expiredAt = new Date(Date.now() + 30 * 60_000);
  const qrCode = channel === 'ALIPAY'
    ? await createAlipayPrecreate({ orderNo: currentOrderNo, amountCents, subject: `AI 平台充值 ${amountCentsToYuan(amountCents)} 元` }, settings.alipay)
    : `mock-pay://recharge/${currentOrderNo}`;

  const order = await prisma.rechargeOrder.create({
    data: {
      orderNo: currentOrderNo,
      userId: req.user!.id,
      channel,
      amountCents,
      credits,
      qrCode,
      expiredAt,
    },
  });
  ok(res, { order });
}));

router.get('/orders/:orderNo', requireAuth, asyncHandler(async (req, res) => {
  await closeExpiredRechargeOrders();
  const order = await prisma.rechargeOrder.findUnique({
    where: { orderNo: routeParam(req.params.orderNo) },
    include: { user: { select: { id: true, nickname: true, phone: true } } },
  });
  if (!order) fail(404, '充值订单不存在', 'RECHARGE_ORDER_NOT_FOUND');
  const isAdmin = adminRoles.includes(req.user!.role);
  if (!isAdmin && order.userId !== req.user!.id) fail(403, '权限不足', 'FORBIDDEN');
  ok(res, { order });
}));

router.post('/orders/:orderNo/mock-pay', requireAuth, asyncHandler(async (req, res) => {
  if (config.nodeEnv === 'production') fail(403, '生产环境不允许模拟支付', 'MOCK_PAY_DISABLED');
  const settings = await getPaymentRuntimeSettings();
  if (settings.paymentMode !== 'mock') fail(403, '当前支付模式不允许模拟支付', 'MOCK_PAY_MODE_DISABLED');
  await closeExpiredRechargeOrders();
  const order = await prisma.rechargeOrder.findUnique({ where: { orderNo: routeParam(req.params.orderNo) } });
  if (!order) fail(404, '充值订单不存在', 'RECHARGE_ORDER_NOT_FOUND');
  if (order.channel !== 'MOCK') fail(400, '非模拟支付订单不能使用模拟入账', 'RECHARGE_ORDER_NOT_MOCK');
  const isAdmin = adminRoles.includes(req.user!.role);
  if (!isAdmin && order.userId !== req.user!.id) fail(403, '权限不足', 'FORBIDDEN');
  const result = await markOrderPaid({ orderNo: order.orderNo, tradeNo: `mock-${order.orderNo}` });
  ok(res, result);
}));

router.post('/orders/:orderNo/close', requireAuth, asyncHandler(async (req, res) => {
  await closeExpiredRechargeOrders();
  const order = await prisma.rechargeOrder.findUnique({ where: { orderNo: routeParam(req.params.orderNo) } });
  if (!order) fail(404, '充值订单不存在', 'RECHARGE_ORDER_NOT_FOUND');
  const isAdmin = adminRoles.includes(req.user!.role);
  if (!isAdmin && order.userId !== req.user!.id) fail(403, '权限不足', 'FORBIDDEN');
  if (order.status === 'PAID') fail(400, '已支付订单不能关闭', 'RECHARGE_ORDER_PAID');
  if (order.status !== 'PENDING') {
    ok(res, { order });
    return;
  }
  const closed = await prisma.rechargeOrder.update({ where: { id: order.id }, data: { status: 'CLOSED' } });
  if (isAdmin) {
    await prisma.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'RECHARGE_ORDER_CLOSE', targetType: 'RECHARGE_ORDER', targetId: closed.id, remark: closed.orderNo },
    });
  }
  ok(res, { order: closed });
}));

payNotifyRouter.post('/alipay/notify', asyncHandler(async (req, res) => {
  const params = Object.fromEntries(Object.entries(req.body || {}).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] || '') : String(value || '')]));
  const settings = await getPaymentRuntimeSettings();
  if (!verifyAlipayNotify(params, settings.alipay)) {
    res.type('text/plain').send('fail');
    return;
  }
  const order = await prisma.rechargeOrder.findUnique({ where: { orderNo: params.out_trade_no || '' } });
  if (!order) {
    res.type('text/plain').send('fail');
    return;
  }
  if (parseAmountCents(params.total_amount || '0') !== order.amountCents) {
    res.type('text/plain').send('fail');
    return;
  }
  if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') {
    await markOrderPaid({ orderNo: order.orderNo, tradeNo: params.trade_no, notifyPayload: params });
  }
  res.type('text/plain').send('success');
}));

export default router;
