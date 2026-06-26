import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { applyWalletDelta } from '../../billing.js';

const router = Router();

router.get('/', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const wallets = await prisma.wallet.findMany({ include: { user: true }, orderBy: { updatedAt: 'desc' }, take: 100 });
  ok(res, { items: wallets });
}));

router.get('/:userId/logs', requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = adminRoles.includes(req.user!.role);
  const userId = routeParam(req.params.userId);
  if (!isAdmin && req.user!.id !== userId) fail(403, '权限不足', 'FORBIDDEN');
  const logs = await prisma.walletLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  ok(res, { items: logs });
}));

const adjustSchema = z.object({
  amount: z.number().int().positive(),
  type: z.enum(['ADMIN_ADD', 'ADMIN_DEDUCT']),
  remark: z.string().min(1),
});

const directRechargeSchema = z.object({
  amount: z.number().int().positive(),
  remark: z.string().optional(),
});

const setBalanceSchema = z.object({
  balance: z.number().int().min(0),
  remark: z.string().optional(),
});

router.post('/:userId/adjust', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = adjustSchema.parse(req.body);
  const userId = routeParam(req.params.userId);
  const result = await prisma.$transaction(async tx => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    const delta = body.type === 'ADMIN_ADD' ? body.amount : -body.amount;
    const walletChange = await applyWalletDelta(tx, { userId, delta, requireNonNegative: true });
    const updated = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const log = await tx.walletLog.create({
      data: {
        userId,
        type: body.type,
        amount: delta,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'ADMIN_ADJUST',
        relatedId: req.user!.id,
        remark: body.remark,
      },
    });
    await tx.adminLog.create({
      data: { adminUserId: req.user!.id, action: body.type, targetType: 'WALLET', targetId: updated.id, remark: body.remark },
    });
    return { wallet: updated, log };
  });
  ok(res, result);
}));

router.post('/:userId/direct-recharge', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = directRechargeSchema.parse(req.body);
  const userId = routeParam(req.params.userId);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') fail(400, '禁用用户不能充值积分', 'USER_DISABLED');
    await tx.wallet.upsert({ where: { userId }, update: {}, create: { userId, balance: 0 } });
    const walletChange = await applyWalletDelta(tx, { userId, delta: body.amount });
    const updated = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const remark = body.remark || `超级管理员直接充值 ${body.amount} 积分`;
    const log = await tx.walletLog.create({
      data: {
        userId,
        type: 'ADMIN_ADD',
        amount: body.amount,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'ADMIN_DIRECT_RECHARGE',
        relatedId: req.user!.id,
        remark,
      },
    });
    await tx.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'ADMIN_DIRECT_RECHARGE', targetType: 'WALLET', targetId: updated.id, remark },
    });
    return { user, wallet: updated, log };
  });
  ok(res, result);
}));

router.post('/:userId/set-balance', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = setBalanceSchema.parse(req.body);
  const userId = routeParam(req.params.userId);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');

    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
    const balanceBefore = wallet.balance;
    const balanceAfter = body.balance;
    const delta = balanceAfter - balanceBefore;
    const updated = await tx.wallet.update({
      where: { userId },
      data: { balance: balanceAfter },
    });
    const remark = body.remark || (balanceAfter === 0
      ? `超级管理员将用户积分清零，原余额 ${balanceBefore} 积分`
      : `超级管理员将用户积分从 ${balanceBefore} 调整为 ${balanceAfter}`);
    const log = await tx.walletLog.create({
      data: {
        userId,
        type: delta < 0 ? 'ADMIN_DEDUCT' : 'ADMIN_ADD',
        amount: delta,
        balanceBefore,
        balanceAfter,
        relatedType: 'ADMIN_SET_BALANCE',
        relatedId: req.user!.id,
        remark,
      },
    });
    await tx.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'ADMIN_SET_WALLET_BALANCE', targetType: 'WALLET', targetId: updated.id, remark },
    });
    return { user, wallet: updated, log, balanceBefore, balanceAfter, delta };
  });
  ok(res, result);
}));

export default router;
