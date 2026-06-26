import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';

const router = Router();

router.get('/commissions', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.commissionLog.findMany({
    include: {
      agent: true,
      redemption: { include: { account: true, plan: true, user: { select: { id: true, nickname: true, phone: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const userIds = Array.from(new Set(items.map(item => item.userId).filter(Boolean) as string[]));
  const sourceIds = Array.from(new Set(items.map(item => item.sourceId).filter(Boolean)));
  const [users, memberships] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true, phone: true, email: true } })
      : [],
    sourceIds.length
      ? prisma.userMembership.findMany({ where: { id: { in: sourceIds } }, include: { plan: true } })
      : [],
  ]);
  const usersById = new Map(users.map(user => [user.id, user]));
  const membershipsById = new Map(memberships.map(membership => [membership.id, membership]));
  ok(res, {
    items: items.map(item => withSettlementEligibility({
      ...item,
      user: item.userId ? usersById.get(item.userId) || null : null,
      membership: membershipsById.get(item.sourceId) || null,
    })),
  });
}));

router.post('/commissions/:id/settle', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const body = z.object({ remark: z.string().optional() }).parse(req.body || {});
  const existing = await prisma.commissionLog.findUnique({ where: { id }, include: { agent: true } });
  if (!existing) fail(404, '佣金记录不存在', 'COMMISSION_NOT_FOUND');
  if (existing.status !== 'PENDING') fail(400, '该佣金不是待结状态', 'COMMISSION_NOT_PENDING');
  const item = await prisma.commissionLog.update({ where: { id }, data: { status: 'SETTLED', settledAt: new Date() } });
  await prisma.adminLog.create({
    data: {
      adminUserId: req.user!.id,
      action: 'COMMISSION_SETTLE',
      targetType: 'COMMISSION',
      targetId: item.id,
      remark: body.remark,
    },
  });
  ok(res, { item });
}));

router.get('/settlements', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.settlement.findMany({ include: { agent: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, { items });
}));

const settlementSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().int().positive(),
  remark: z.string().optional(),
});

router.post('/settlements', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = settlementSchema.parse(req.body);
  const settlement = await prisma.settlement.create({ data: { ...body, status: 'SETTLED', settledAt: new Date() } });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'SETTLEMENT_CREATE', targetType: 'SETTLEMENT', targetId: settlement.id, remark: body.remark } });
  ok(res, { settlement });
}));

const settlePendingSchema = z.object({
  remark: z.string().optional(),
});

router.post('/settlements/agent/:agentId/settle-pending', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = settlePendingSchema.parse(req.body);
  const agentId = routeParam(req.params.agentId);
  const result = await prisma.$transaction(async tx => {
    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent) fail(404, '代理不存在', 'AGENT_NOT_FOUND');
    const now = new Date();
    const pending = await tx.commissionLog.findMany({ where: { agentId, status: 'PENDING' }, select: { id: true, amount: true } });
    const amount = pending.reduce((sum, item) => sum + item.amount, 0);
    if (pending.length === 0 || amount <= 0) {
      fail(400, '该代理没有待结佣金', 'NO_PENDING_COMMISSION');
    }
    const settlement = await tx.settlement.create({
      data: { agentId, amount, status: 'SETTLED', settledAt: now, remark: body.remark },
    });
    await tx.commissionLog.updateMany({
      where: { id: { in: pending.map(item => item.id) } },
      data: { status: 'SETTLED', settledAt: now },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'AGENT_PENDING_COMMISSION_SETTLE',
        targetType: 'SETTLEMENT',
        targetId: settlement.id,
        remark: body.remark || `${agent.name} ${amount}`,
      },
    });
    return { settlement, count: pending.length };
  });
  ok(res, result);
}));

function withSettlementEligibility<T extends { status: string; createdAt: Date; agent: { settlementDelayDays: number } }>(item: T) {
  const settleEligibleAt = new Date(item.createdAt.getTime() + item.agent.settlementDelayDays * 86400_000);
  return {
    ...item,
    settleEligibleAt,
    settleEligible: item.status === 'PENDING' && settleEligibleAt.getTime() <= Date.now(),
  };
}

export default router;
