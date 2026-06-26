import { Router } from 'express';
import { z } from 'zod';
import { addDays } from '../../time.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';

const router = Router();

router.get('/trial-cards', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  await expireTrialCards();
  const items = await prisma.trialCard.findMany({ include: { agent: { include: { user: true } }, plan: true, usedUser: true }, orderBy: { expiredAt: 'desc' }, take: 200 });
  ok(res, { items });
}));

const createSchema = z.object({
  planId: z.string().min(1),
  agentId: z.string().optional(),
  quantity: z.number().int().min(1).max(500).default(1),
  expiredAt: z.string().datetime(),
});

router.post('/trial-cards', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const expiredAt = new Date(body.expiredAt);
  if (expiredAt <= new Date()) fail(400, '过期时间必须晚于当前时间', 'TRIAL_CARD_EXPIRE_TIME_INVALID');
  const rows = Array.from({ length: body.quantity }, () => ({
    planId: body.planId,
    agentId: body.agentId,
    expiredAt,
    code: makeTrialCode(),
  }));
  await prisma.trialCard.createMany({ data: rows });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'TRIAL_CARD_CREATE', targetType: 'TRIAL_CARD', targetId: body.agentId || 'SYSTEM', remark: `${rows.length} cards` },
  });
  ok(res, { count: rows.length });
}));

router.patch('/trial-cards/:id/void', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const existing = await prisma.trialCard.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!existing) fail(404, '体验卡不存在', 'TRIAL_CARD_NOT_FOUND');
  if (existing.status === 'USED') fail(400, '已使用的体验卡不能作废', 'TRIAL_CARD_ALREADY_USED');
  const card = await prisma.trialCard.update({ where: { id: existing.id }, data: { status: 'VOIDED' }, include: { plan: true, agent: true, usedUser: true } });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'TRIAL_CARD_VOID', targetType: 'TRIAL_CARD', targetId: card.id, remark: card.code },
  });
  ok(res, { card });
}));

router.get('/agent/trial-cards', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  await expireTrialCards();
  const items = await prisma.trialCard.findMany({
    where: { agentId: agent.id, status: 'AVAILABLE' },
    include: { plan: true, usedUser: true },
    orderBy: { expiredAt: 'desc' },
    take: 200,
  });
  ok(res, { items });
}));

const agentCreateSchema = z.object({
  planId: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
  validDays: z.number().int().min(1).max(90).default(7),
});

router.post('/agent/trial-cards', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  if (agent.level !== 'FOUNDER') fail(403, '只有初创/一级代理可以自主生成体验卡', 'FOUNDER_AGENT_REQUIRED');
  const body = agentCreateSchema.parse(req.body);
  const plan = await prisma.membershipPlan.findUnique({ where: { id: body.planId } });
  if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
  const expiredAt = addDays(new Date(), body.validDays);
  const rows = Array.from({ length: body.quantity }, () => ({
    planId: plan.id,
    agentId: agent.id,
    expiredAt,
    code: makeTrialCode(),
  }));
  await prisma.trialCard.createMany({ data: rows });
  ok(res, { count: rows.length, codes: rows.map(row => row.code), expiredAt });
}));

router.post('/trial-cards/redeem', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ code: z.string().min(1) }).parse(req.body);
  await expireTrialCards();
  const result = await prisma.$transaction(async tx => {
    const card = await tx.trialCard.findUnique({ where: { code: body.code }, include: { plan: true, agent: true } });
    if (!card || card.status !== 'AVAILABLE') fail(400, '体验卡不可用', 'TRIAL_CARD_INVALID');
    if (card.expiredAt < new Date()) fail(400, '体验卡已过期', 'TRIAL_CARD_EXPIRED');
    const user = await tx.user.findUnique({ where: { id: req.user!.id } });
    if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
    if (card.agentId) {
      if (!card.agent || card.agent.status !== 'ACTIVE') fail(400, '体验卡所属代理不可用', 'TRIAL_CARD_AGENT_DISABLED');
      if (user.agentId && user.agentId !== card.agentId) {
        const owner = await tx.agent.findUnique({ where: { id: user.agentId } });
        fail(409, `用户已绑定代理：${owner?.name || '其他代理'}`, 'USER_BOUND_TO_OTHER_AGENT');
      }
      const existingCustomer = await tx.agentCustomer.findUnique({ where: { userId: user.id } });
      if (existingCustomer && existingCustomer.agentId !== card.agentId) {
        const owner = await tx.agent.findUnique({ where: { id: existingCustomer.agentId } });
        fail(409, `用户已绑定代理：${owner?.name || '其他代理'}`, 'USER_BOUND_TO_OTHER_AGENT');
      }
      if (!user.agentId) await tx.user.update({ where: { id: user.id }, data: { agentId: card.agentId } });
      if (!existingCustomer) {
        await tx.agentCustomer.create({
          data: {
            agentId: card.agentId,
            userId: user.id,
            customerPhone: user.phone,
            customerName: user.nickname,
          },
        });
      }
    }
    const now = new Date();
    const latest = await tx.userMembership.findFirst({ where: { userId: req.user!.id, expiredAt: { gt: now } }, orderBy: { expiredAt: 'desc' } });
    const startedAt = latest?.expiredAt && latest.expiredAt > now ? latest.expiredAt : now;
    const expiredAt = addDays(startedAt, card.plan.durationDays);
    const changed = await tx.trialCard.updateMany({
      where: { id: card.id, status: 'AVAILABLE' },
      data: { status: 'USED', usedUserId: req.user!.id, usedAt: now },
    });
    if (changed.count !== 1) fail(409, '体验卡已被使用或状态已变化', 'TRIAL_CARD_REDEEM_CONFLICT');
    const usedCard = await tx.trialCard.findUnique({ where: { id: card.id } });
    if (!usedCard) fail(404, '体验卡不存在', 'TRIAL_CARD_NOT_FOUND');
    const membership = await tx.userMembership.create({
      data: { userId: req.user!.id, planId: card.planId, source: 'TRIAL_CARD', startedAt, expiredAt },
    });
    return { card: usedCard, membership, agent: card.agent || null };
  });
  ok(res, result);
}));

function makeTrialCode() {
  return `TRY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function expireTrialCards() {
  await prisma.trialCard.updateMany({
    where: { status: 'AVAILABLE', expiredAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

async function currentAgent(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent || agent.status !== 'ACTIVE') fail(403, '当前账号不是有效代理', 'AGENT_REQUIRED');
  return agent;
}

export default router;
