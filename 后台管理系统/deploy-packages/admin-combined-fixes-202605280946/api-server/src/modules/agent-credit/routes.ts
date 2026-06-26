import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { getPaymentRuntimeSettings } from '../system-settings/service.js';
import {
  agentVoucherRequestInclude,
  approveAgentCreditGrantRequest,
  approveAgentVoucherRequest,
  cancelAdminRechargeVoucher,
  cancelAgentVoucher,
  createAgentCreditGrantRequest,
  createAdminRechargeVoucher,
  createAgentVoucher,
  createAgentVoucherRequest,
  ensureAgentCreditAccount,
  expireAgentCreditVouchers,
  grantAgentCredits,
  grantSubAgentCredits,
  normalizeVoucherCode,
  redeemAgentVoucher,
  rejectAgentCreditGrantRequest,
  rejectAgentVoucherRequest,
  revealAgentVoucherRequestCode,
  withCodeAvailability,
  withVoucherCode,
} from './service.js';

const router = Router();

router.get('/admin/agent-credit/accounts', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const agents = await prisma.agent.findMany({
    include: {
      user: { select: { id: true, nickname: true, phone: true, email: true } },
      creditAccount: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, { items: agents.map(agent => ({ ...agent, creditAccount: agent.creditAccount || emptyCreditAccount(agent.id) })) });
}));

router.get('/admin/agent-credit/agents/:id/accounting', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const agentId = routeParam(req.params.id);
  await expireAgentCreditVouchers(prisma, agentId);
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      user: { select: { id: true, nickname: true, phone: true, email: true } },
      parentAgent: { select: { id: true, name: true } },
      creditAccount: true,
    },
  });
  if (!agent) fail(404, '代理不存在', 'AGENT_NOT_FOUND');
  await prisma.$transaction(tx => ensureAgentCreditAccount(tx, agent.id));
  const [freshAgent, voucherStats, requestStats, reconciliationStats, commissionStats, customerCount, ledger, vouchers, voucherRequests, reconciliationOrders, customers] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agent.id },
      include: {
        user: { select: { id: true, nickname: true, phone: true, email: true } },
        parentAgent: { select: { id: true, name: true } },
        creditAccount: true,
      },
    }),
    prisma.agentCreditVoucher.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { credits: true, amountCents: true } }),
    prisma.agentCreditVoucherRequest.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { credits: true, amountCents: true } }),
    prisma.agentReconciliationOrder.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { credits: true, amountCents: true } }),
    prisma.commissionLog.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { amount: true } }),
    prisma.agentCustomer.count({ where: { agentId: agent.id } }),
    prisma.agentCreditLedger.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.agentCreditVoucher.findMany({
      where: { agentId: agent.id },
      include: { user: { select: { id: true, nickname: true, phone: true } }, rechargeOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.agentCreditVoucherRequest.findMany({
      where: { agentId: agent.id },
      include: agentVoucherRequestInclude(),
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.agentReconciliationOrder.findMany({
      where: { agentId: agent.id },
      include: { confirmedByAdmin: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.agentCustomer.findMany({
      where: { agentId: agent.id },
      include: { user: { select: { id: true, nickname: true, phone: true, email: true, createdAt: true, wallet: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  ok(res, {
    agent: freshAgent ? { ...freshAgent, creditAccount: freshAgent.creditAccount || emptyCreditAccount(freshAgent.id) } : { ...agent, creditAccount: agent.creditAccount || emptyCreditAccount(agent.id) },
    stats: {
      customerCount,
      vouchers: summarizeGroup(voucherStats, 'status'),
      voucherRequests: summarizeGroup(requestStats, 'status'),
      reconciliation: summarizeGroup(reconciliationStats, 'status'),
      commissions: summarizeGroup(commissionStats, 'status'),
    },
    ledger,
    vouchers: vouchers.map(withVoucherCode),
    voucherRequests: voucherRequests.map(withCodeAvailability),
    reconciliationOrders,
    customers,
  });
}));

const grantSchema = z.object({
  agentId: z.string().min(1),
  credits: z.number().int().positive().optional(),
  amountCents: z.number().int().positive(),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/admin/agent-credit/grants', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = grantSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await grantAgentCredits({ adminUserId: req.user!.id, ...payload });
  ok(res, result);
}));

router.post('/admin/agent-credit/grant-requests/:id/approve', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = z.object({ remark: z.string().optional() }).parse(req.body || {});
  const result = await approveAgentCreditGrantRequest({ adminUserId: req.user!.id, orderId: routeParam(req.params.id), remark: body.remark });
  ok(res, result);
}));

router.post('/admin/agent-credit/grant-requests/:id/reject', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = z.object({ reason: z.string().optional(), remark: z.string().optional() }).parse(req.body || {});
  const result = await rejectAgentCreditGrantRequest({ adminUserId: req.user!.id, orderId: routeParam(req.params.id), reason: body.reason || body.remark });
  ok(res, result);
}));

const adminRechargeVoucherSchema = z.object({
  userId: z.string().min(1),
  credits: z.number().int().positive().optional(),
  amountCents: z.number().int().positive(),
  validDays: z.number().int().min(1).max(365).default(30),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.get('/admin/recharge-vouchers', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  await expireAgentCreditVouchers(prisma);
  const items = await prisma.agentCreditVoucher.findMany({
    include: {
      user: { select: { id: true, nickname: true, phone: true, email: true, agent: { select: { id: true, name: true } } } },
      agent: { include: { user: { select: { id: true, nickname: true, phone: true } } } },
      createdByAdmin: { select: { id: true, nickname: true } },
      rechargeOrder: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  ok(res, { items: items.map(withVoucherCode) });
}));

router.post('/admin/recharge-vouchers', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = adminRechargeVoucherSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await createAdminRechargeVoucher({ adminUserId: req.user!.id, ...payload });
  ok(res, result);
}));

router.post('/admin/recharge-vouchers/:id/cancel', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = z.object({ remark: z.string().optional() }).parse(req.body || {});
  const result = await cancelAdminRechargeVoucher({ adminUserId: req.user!.id, voucherId: routeParam(req.params.id), remark: body.remark });
  ok(res, result);
}));

router.get('/admin/agent-credit/voucher-requests', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.agentCreditVoucherRequest.findMany({
    include: agentVoucherRequestInclude(),
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  ok(res, { items: items.map(withCodeAvailability) });
}));

const reviewVoucherRequestSchema = z.object({
  remark: z.string().optional(),
  reason: z.string().optional(),
});

router.post('/admin/agent-credit/voucher-requests/:id/approve', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = reviewVoucherRequestSchema.parse(req.body);
  const result = await approveAgentVoucherRequest({
    adminUserId: req.user!.id,
    requestId: routeParam(req.params.id),
    remark: body.remark,
  });
  ok(res, result);
}));

router.post('/admin/agent-credit/voucher-requests/:id/reject', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = reviewVoucherRequestSchema.parse(req.body);
  const result = await rejectAgentVoucherRequest({
    adminUserId: req.user!.id,
    requestId: routeParam(req.params.id),
    reason: body.reason || body.remark,
  });
  ok(res, result);
}));

router.get('/admin/agent-reconciliation-orders', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.agentReconciliationOrder.findMany({
    include: {
      agent: { include: { user: { select: { id: true, nickname: true, phone: true } } } },
      confirmedByAdmin: { select: { id: true, nickname: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  ok(res, { items });
}));

const reconciliationStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'SETTLED', 'CANCELLED']).default('SETTLED'),
  remark: z.string().optional(),
});

router.post('/admin/agent-reconciliation-orders/:id/settle', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = reconciliationStatusSchema.parse(req.body);
  const id = routeParam(req.params.id);
  const order = await prisma.agentReconciliationOrder.update({
    where: { id },
    data: {
      status: body.status,
      remark: body.remark,
      confirmedByAdminId: req.user!.id,
      confirmedAt: new Date(),
    },
  });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'AGENT_RECONCILIATION_SETTLE', targetType: 'AGENT_RECONCILIATION_ORDER', targetId: order.id, remark: order.orderNo },
  });
  ok(res, { order });
}));

router.get('/agent/invite', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const inviteUrl = buildCanvasInviteUrl(req, agent.id);
  ok(res, {
    agentId: agent.id,
    agentName: agent.name,
    inviteUrl,
    registerParams: { agentId: agent.id },
    note: '注册时把 agentId 提交到 /api/auth/register，用户会永久绑定到该代理。',
  });
}));

router.get('/agent/credit/summary', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  await expireAgentCreditVouchers(prisma, agent.id);
  const account = await prisma.$transaction(tx => ensureAgentCreditAccount(tx, agent.id));
  const [voucherStats, requestStats, pendingReconciliation, commission] = await Promise.all([
    prisma.agentCreditVoucher.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { credits: true } }),
    prisma.agentCreditVoucherRequest.groupBy({ by: ['status'], where: { agentId: agent.id }, _count: { id: true }, _sum: { credits: true, amountCents: true } }),
    prisma.agentReconciliationOrder.aggregate({ where: { agentId: agent.id, status: 'PENDING' }, _sum: { credits: true, amountCents: true }, _count: { id: true } }),
    prisma.commissionLog.aggregate({ where: { agentId: agent.id }, _sum: { amount: true } }),
  ]);
  ok(res, {
    agent,
    account,
    voucherStats,
    voucherRequestStats: requestStats,
    pendingReconciliation: {
      count: pendingReconciliation._count.id,
      credits: pendingReconciliation._sum.credits || 0,
      amountCents: pendingReconciliation._sum.amountCents || 0,
    },
    commissionAmount: commission._sum.amount || 0,
  });
}));

router.get('/agent/credit/ledger', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.agentCreditLedger.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, take: 300 });
  ok(res, { items });
}));

const grantRequestSchema = z.object({
  credits: z.number().int().positive().optional(),
  amountCents: z.number().int().positive(),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/agent/credit-grant-requests', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = grantRequestSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await createAgentCreditGrantRequest({ agent, ...payload });
  ok(res, result);
}));

const subAgentGrantSchema = z.object({
  targetAgentId: z.string().min(1),
  credits: z.number().int().positive().optional(),
  amountCents: z.number().int().positive(),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/agent/sub-agent-credit/grants', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = subAgentGrantSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await grantSubAgentCredits({ actor: agent, ...payload });
  ok(res, result);
}));

const voucherSchema = z.object({
  userId: z.string().min(1),
  credits: z.number().int().positive().optional(),
  amountCents: z.number().int().positive(),
  validDays: z.number().int().min(1).max(365).default(30),
});

const voucherRequestSchema = voucherSchema.extend({
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/agent/credit-vouchers', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = voucherSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await createAgentVoucher({ agent, ...payload });
  ok(res, result);
}));

router.get('/agent/credit-vouchers', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  await expireAgentCreditVouchers(prisma, agent.id);
  const items = await prisma.agentCreditVoucher.findMany({
    where: { agentId: agent.id },
    include: { user: { select: { id: true, nickname: true, phone: true } }, rechargeOrder: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  ok(res, { items: items.map(withVoucherCode) });
}));

router.post('/agent/credit-voucher-requests', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = voucherRequestSchema.parse(req.body);
  const payload = await applyCreditsFromPaidAmount(body);
  const result = await createAgentVoucherRequest({ agent, ...payload });
  ok(res, result);
}));

router.get('/agent/credit-voucher-requests', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.agentCreditVoucherRequest.findMany({
    where: { agentId: agent.id },
    include: agentVoucherRequestInclude(),
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  ok(res, { items: items.map(withCodeAvailability) });
}));

router.post('/agent/credit-voucher-requests/:id/reveal-code', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const result = await revealAgentVoucherRequestCode({ agent, requestId: routeParam(req.params.id) });
  ok(res, result);
}));

router.post('/agent/credit-vouchers/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const result = await cancelAgentVoucher({ agent, voucherId: routeParam(req.params.id) });
  ok(res, result);
}));

router.get('/agent/reconciliation-orders', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.agentReconciliationOrder.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, take: 300 });
  ok(res, { items });
}));

router.post('/recharge/vouchers/redeem', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ code: z.string().min(1) }).parse(req.body);
  const result = await redeemAgentVoucher({ userId: req.user!.id, code: normalizeVoucherCode(body.code) });
  ok(res, result);
}));

router.get('/recharge/vouchers', requireAuth, asyncHandler(async (req, res) => {
  const items = await prisma.agentCreditVoucher.findMany({
    where: { userId: req.user!.id },
    include: { agent: { select: { id: true, name: true } }, rechargeOrder: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  ok(res, { items: items.map(withVoucherCode) });
}));

async function currentAgent(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent || agent.status !== 'ACTIVE') fail(403, '当前账号不是有效代理', 'AGENT_REQUIRED');
  return agent;
}

function emptyCreditAccount(agentId: string) {
  return {
    id: '',
    agentId,
    availableCredits: 0,
    frozenCredits: 0,
    usedCredits: 0,
    creditLimit: 0,
    receivableCredits: 0,
    createdAt: null,
    updatedAt: null,
  };
}

async function applyCreditsFromPaidAmount<T extends { amountCents: number; credits?: number }>(input: T) {
  const settings = await getPaymentRuntimeSettings();
  const credits = Math.round((input.amountCents / 100) * settings.rechargeCreditsPerCny);
  if (credits <= 0) fail(400, '线下实付金额过低，无法生成有效积分', 'OFFLINE_AMOUNT_TOO_LOW');
  return { ...input, credits };
}

function buildCanvasInviteUrl(req: { protocol?: string; headers: Record<string, string | string[] | undefined> }, agentId: string) {
  const configured = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
  const forwardedProto = firstHeader(req.headers['x-forwarded-proto']);
  const forwardedHost = firstHeader(req.headers['x-forwarded-host']);
  const host = forwardedHost || firstHeader(req.headers.host);
  const origin = configured || (host ? `${forwardedProto || req.protocol || 'http'}://${host}` : '');
  if (!origin) return '';
  const url = new URL('/image-studio-canvas-next.html', origin);
  url.searchParams.set('agentId', agentId);
  return url.toString();
}

function firstHeader(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').split(',')[0].trim();
}

function summarizeGroup<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const byStatus = Object.fromEntries(rows.map(row => {
    const status = String(row[key] || 'UNKNOWN');
    const count = Number((row._count as { id?: number } | undefined)?.id || 0);
    const sum = row._sum as Record<string, number | null> | undefined;
    return [status, {
      count,
      credits: Number(sum?.credits || 0),
      amountCents: Number(sum?.amountCents || 0),
      amount: Number(sum?.amount || 0),
    }];
  }));
  return {
    byStatus,
    totalCount: Object.values(byStatus).reduce((sum, item) => sum + item.count, 0),
    totalCredits: Object.values(byStatus).reduce((sum, item) => sum + item.credits, 0),
    totalAmountCents: Object.values(byStatus).reduce((sum, item) => sum + item.amountCents, 0),
    totalAmount: Object.values(byStatus).reduce((sum, item) => sum + item.amount, 0),
  };
}

export default router;
