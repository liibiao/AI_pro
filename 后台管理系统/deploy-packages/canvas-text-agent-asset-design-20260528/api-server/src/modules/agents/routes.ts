import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { hashPassword, makeInitialPassword } from '../../security.js';
import { addDays } from '../../time.js';
import { normalizeNickname, normalizePhone } from '../../identity-normalize.js';

const router = Router();

router.get('/admin/agents', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const agents = await prisma.agent.findMany({ include: { user: true, parentAgent: true }, orderBy: { createdAt: 'desc' } });
  const stats = await Promise.all(agents.map(agent => getAgentStats(agent.id, agent.settlementDelayDays)));
  ok(res, { items: agents.map((agent, index) => ({ ...agent, stats: stats[index] })) });
}));

const createAgentSchema = z.object({
  userId: z.string().min(1),
  name: z.preprocess(value => normalizeNickname(value, ''), z.string().min(1)),
  level: z.enum(['NORMAL', 'FOUNDER']).default('NORMAL'),
  parentAgentId: z.string().optional(),
  commissionRate: z.number().min(0).max(1).default(0),
  settlementDelayDays: z.number().int().min(1).max(3).default(1),
});

router.post('/admin/agents', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = createAgentSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') fail(400, '管理员账号不能设为代理', 'ADMIN_CANNOT_BE_AGENT');
  const existingAgent = await prisma.agent.findUnique({ where: { userId: user.id } });
  if (existingAgent) fail(409, '该用户已经是代理', 'USER_ALREADY_AGENT');
  if (body.parentAgentId) await assertParentAgentExists(body.parentAgentId);
  const agent = await prisma.agent.create({ data: body });
  await prisma.user.update({ where: { id: body.userId }, data: { role: 'AGENT' } });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'AGENT_CREATE', targetType: 'AGENT', targetId: agent.id, remark: agent.name } });
  ok(res, { agent });
}));

router.patch('/admin/agents/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const body = z.object({
    name: z.string().min(1).optional(),
    level: z.enum(['NORMAL', 'FOUNDER']).optional(),
    parentAgentId: z.string().nullable().optional(),
    commissionRate: z.number().min(0).max(1).optional(),
    settlementDelayDays: z.number().int().min(1).max(3).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  }).parse(req.body);
  if (body.parentAgentId !== undefined) await assertValidParentAgent(id, body.parentAgentId);
  const agent = await prisma.agent.update({ where: { id }, data: body });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'AGENT_UPDATE', targetType: 'AGENT', targetId: agent.id, remark: agent.name } });
  ok(res, { agent });
}));

router.get('/admin/agents/:id/customers', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const agent = await prisma.agent.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!agent) fail(404, '代理不存在', 'AGENT_NOT_FOUND');
  const customers = await prisma.agentCustomer.findMany({
    where: { agentId: agent.id },
    include: { user: { include: { wallet: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const redemptionStats = await prisma.accountRedemption.groupBy({
    by: ['userId'],
    where: { agentId: agent.id },
    _count: { id: true },
    _sum: { commissionAmount: true },
  });
  const statMap = new Map(redemptionStats.map(item => [item.userId, {
    redemptionCount: item._count.id,
    commissionAmount: item._sum.commissionAmount || 0,
  }]));
  ok(res, { items: customers.map(customer => ({ ...customer, stats: statMap.get(customer.userId) || { redemptionCount: 0, commissionAmount: 0 } })) });
}));

router.get('/agent/me', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  ok(res, { agent });
}));

router.get('/agent/customers', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const visibleAgentIds = await getVisibleCustomerAgentIds(agent);
  const customers = await prisma.agentCustomer.findMany({
    where: { agentId: { in: visibleAgentIds } },
    include: { user: true, agent: { select: { id: true, name: true, level: true, parentAgentId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, { items: customers });
}));

const customerSchema = z.object({
  userId: z.string().min(1).optional(),
  customerPhone: z.preprocess(normalizePhone, z.string().min(6).optional()),
  customerName: z.preprocess(value => normalizeNickname(value, ''), z.string().optional()),
});

router.post('/agent/customers', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = customerSchema.parse(req.body);
  if (!body.userId && !body.customerPhone) fail(400, '必须填写客户用户ID或手机号', 'CUSTOMER_REQUIRED');
  const result = await prisma.$transaction(async tx => {
    let initialPassword: string | undefined;
    let user = body.userId
      ? await tx.user.findUnique({ where: { id: body.userId } })
      : await tx.user.findUnique({ where: { phone: body.customerPhone } });
    if (!user && body.customerPhone) {
      initialPassword = makeInitialPassword();
      user = await tx.user.create({
        data: {
          phone: body.customerPhone,
          nickname: body.customerName || `客户${body.customerPhone.slice(-4)}`,
          passwordHash: await hashPassword(initialPassword),
          wallet: { create: { balance: 0 } },
        },
      });
    }
    if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
    if (user.agentId && user.agentId !== agent.id) {
      const owner = await tx.agent.findUnique({ where: { id: user.agentId } });
      fail(409, `客户已绑定代理：${owner?.name || '其他代理'}`, 'CUSTOMER_BOUND_TO_OTHER_AGENT');
    }
    const existing = await tx.agentCustomer.findFirst({
      where: { OR: [{ userId: user.id }, ...(body.customerPhone ? [{ customerPhone: body.customerPhone }] : [])] },
      include: { agent: true, user: true },
    });
    if (existing?.agentId === agent.id) {
      return { customer: existing, initialPassword, alreadyBound: true };
    }
    if (existing) fail(409, `客户已绑定代理：${existing.agent.name}`, 'CUSTOMER_BOUND_TO_OTHER_AGENT');
    await tx.user.update({ where: { id: user.id }, data: { agentId: agent.id } });
    const customer = await tx.agentCustomer.create({ data: { agentId: agent.id, userId: user.id, customerPhone: body.customerPhone || user.phone, customerName: body.customerName || user.nickname } });
    return { customer, initialPassword };
  });
  ok(res, result);
}));

const claimSchema = z.object({ quantity: z.number().int().min(1).max(10) });

router.post('/agent/accounts/claim', requireAuth, asyncHandler(async (req, res) => {
  claimSchema.parse(req.body);
  fail(400, '代理不能免费领取会员账号，请通过会员卡资格申请或由管理员分配', 'AGENT_MEMBER_ACCOUNT_CLAIM_DISABLED');
}));

router.get('/agent/accounts/claimed', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const accounts = await prisma.memberAccount.findMany({
    where: { claimedAgentId: agent.id, status: 'CLAIMED', redeemedUserId: null },
    include: { plan: true },
    orderBy: { claimedAt: 'desc' },
    take: 200,
  });
  ok(res, { items: accounts });
}));

router.get('/agent/accounts/claims', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const claims = await prisma.accountClaim.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  ok(res, { items: claims });
}));

const redeemSchema = z.object({
  code: z.string().min(1),
  userId: z.string().min(1),
});

router.post('/agent/accounts/redeem', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = redeemSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const account = await tx.memberAccount.findUnique({ where: { code: body.code }, include: { plan: true } });
    if (!account) fail(404, '会员账号不存在', 'ACCOUNT_NOT_FOUND');
    if (account.status !== 'CLAIMED' || account.claimedAgentId !== agent.id) fail(400, '账号不可核销', 'ACCOUNT_NOT_REDEEMABLE');
    const customer = await tx.agentCustomer.findUnique({ where: { userId: body.userId } });
    if (!customer || customer.agentId !== agent.id) fail(400, '该客户不属于当前代理', 'CUSTOMER_NOT_BOUND_TO_AGENT');
    const commissionAmount = Math.ceil(account.plan.price * Number(agent.commissionRate));
    const now = new Date();
    const changed = await tx.memberAccount.updateMany({
      where: { id: account.id, status: 'CLAIMED', claimedAgentId: agent.id },
      data: { status: 'REDEEMED', redeemedUserId: body.userId, redeemedAt: now },
    });
    if (changed.count !== 1) fail(409, '会员账号已被核销或状态已变化', 'ACCOUNT_REDEEM_CONFLICT');
    const redemption = await tx.accountRedemption.create({
      data: { accountId: account.id, agentId: agent.id, userId: body.userId, planId: account.planId, commissionAmount },
    });
    const latest = await tx.userMembership.findFirst({ where: { userId: body.userId, expiredAt: { gt: now } }, orderBy: { expiredAt: 'desc' } });
    const startedAt = latest?.expiredAt && latest.expiredAt > now ? latest.expiredAt : now;
    const expiredAt = addDays(startedAt, account.plan.durationDays);
    await tx.userMembership.create({
      data: { userId: body.userId, planId: account.planId, source: 'AGENT_REDEEM', startedAt, expiredAt },
    });
    const commission = await tx.commissionLog.create({
      data: { agentId: agent.id, userId: body.userId, sourceType: 'REDEMPTION', sourceId: redemption.id, redemptionId: redemption.id, amount: commissionAmount },
    });
    return { redemption, commission };
  });
  ok(res, result);
}));

router.get('/agent/redemptions', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.accountRedemption.findMany({
    where: { agentId: agent.id },
    include: { account: true, user: true, plan: true },
    orderBy: { redeemedAt: 'desc' },
    take: 200,
  });
  ok(res, { items });
}));

router.get('/agent/commissions', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.commissionLog.findMany({
    where: { agentId: agent.id },
    include: {
      redemption: { include: { account: true, plan: true, user: { select: { id: true, nickname: true, phone: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  ok(res, { items });
}));

router.get('/agent/sub-agents', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.agent.findMany({ where: { parentAgentId: agent.id }, include: { user: true }, orderBy: { createdAt: 'desc' } });
  const stats = await Promise.all(items.map(item => getAgentStats(item.id)));
  ok(res, { items: items.map((item, index) => ({ ...item, stats: stats[index] })) });
}));

const createSubAgentSchema = z.object({
  userId: z.string().min(1),
  name: z.preprocess(value => normalizeNickname(value, ''), z.string().min(1)),
  commissionRate: z.number().min(0).max(1).default(0),
  settlementDelayDays: z.number().int().min(1).max(3).default(1),
});

router.post('/agent/sub-agents', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  if (agent.level !== 'FOUNDER') fail(403, '只有一级/初创代理可以创建下级代理', 'FOUNDER_AGENT_REQUIRED');
  const body = createSubAgentSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: body.userId } });
    if (!user) fail(404, '下级代理用户不存在', 'SUB_AGENT_USER_NOT_FOUND');
    if (user.agentId !== agent.id) fail(403, '只能把已绑定到当前初创代理的客户升级为下级代理', 'SUB_AGENT_USER_NOT_BOUND_TO_PARENT');
    const customer = await tx.agentCustomer.findUnique({ where: { userId: user.id } });
    if (!customer || customer.agentId !== agent.id) fail(403, '只能从当前代理的客户列表中选择用户新增下级代理', 'SUB_AGENT_CUSTOMER_NOT_IN_PARENT_TEAM');
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') fail(400, '管理员账号不能设为下级代理', 'ADMIN_CANNOT_BE_SUB_AGENT');
    const existingAgent = await tx.agent.findUnique({ where: { userId: user.id } });
    if (existingAgent) fail(409, '该用户已经是代理', 'USER_ALREADY_AGENT');
    const subAgent = await tx.agent.create({
      data: {
        userId: user.id,
        name: body.name,
        level: 'NORMAL',
        parentAgentId: agent.id,
        commissionRate: body.commissionRate,
        settlementDelayDays: body.settlementDelayDays,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { role: 'AGENT' } });
    return { agent: subAgent };
  });
  ok(res, result);
}));

router.get('/agent/performance', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const stats = await getAgentStats(agent.id);
  const subAgents = await prisma.agent.findMany({ where: { parentAgentId: agent.id }, select: { id: true } });
  const subAgentStats = await Promise.all(subAgents.map(item => getAgentStats(item.id)));
  ok(res, {
    ...stats,
    subAgentCount: subAgents.length,
    subAgentCustomerCount: subAgentStats.reduce((sum, item) => sum + item.customerCount, 0),
    subAgentRedemptionCount: subAgentStats.reduce((sum, item) => sum + item.redemptionCount, 0),
    subAgentCommissionAmount: subAgentStats.reduce((sum, item) => sum + item.commissionAmount, 0),
  });
}));

async function currentAgent(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent || agent.status !== 'ACTIVE') fail(403, '当前账号不是有效代理', 'AGENT_REQUIRED');
  return agent;
}

async function assertParentAgentExists(parentAgentId: string) {
  const parent = await prisma.agent.findUnique({ where: { id: parentAgentId } });
  if (!parent) fail(404, '上级代理不存在', 'PARENT_AGENT_NOT_FOUND');
}

async function assertValidParentAgent(agentId: string, parentAgentId: string | null) {
  if (!parentAgentId) return;
  if (agentId === parentAgentId) fail(400, '上级代理不能是自己', 'AGENT_PARENT_SELF');
  const parent = await prisma.agent.findUnique({ where: { id: parentAgentId } });
  if (!parent) fail(404, '上级代理不存在', 'PARENT_AGENT_NOT_FOUND');

  let cursor: string | null = parent.parentAgentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === agentId) fail(400, '上级代理不能形成循环层级', 'AGENT_PARENT_CYCLE');
    if (visited.has(cursor)) break;
    visited.add(cursor);
    const next = await prisma.agent.findUnique({ where: { id: cursor }, select: { parentAgentId: true } });
    cursor = next?.parentAgentId || null;
  }
}

async function getVisibleCustomerAgentIds(agent: { id: string; level: string }) {
  if (agent.level !== 'FOUNDER') return [agent.id];
  const ids = new Set<string>([agent.id]);
  let frontier = [agent.id];
  while (frontier.length > 0) {
    const children = await prisma.agent.findMany({
      where: { parentAgentId: { in: frontier }, status: 'ACTIVE' },
      select: { id: true },
    });
    frontier = children.map(item => item.id).filter(id => !ids.has(id));
    frontier.forEach(id => ids.add(id));
  }
  return [...ids];
}

async function getAgentStats(agentId: string, settlementDelayDays = 1) {
  const eligibleCutoff = new Date(Date.now() - settlementDelayDays * 86400_000);
  const [customerCount, redemptionCount, commissionTotal, pendingCommission, eligibleCommission, settledCommission, accountSummary] = await Promise.all([
    prisma.agentCustomer.count({ where: { agentId } }),
    prisma.accountRedemption.count({ where: { agentId } }),
    prisma.commissionLog.aggregate({ where: { agentId }, _sum: { amount: true } }),
    prisma.commissionLog.aggregate({ where: { agentId, status: 'PENDING' }, _sum: { amount: true } }),
    prisma.commissionLog.aggregate({ where: { agentId, status: 'PENDING', createdAt: { lte: eligibleCutoff } }, _sum: { amount: true }, _count: { id: true } }),
    prisma.commissionLog.aggregate({ where: { agentId, status: 'SETTLED' }, _sum: { amount: true } }),
    prisma.memberAccount.groupBy({ by: ['status'], where: { claimedAgentId: agentId }, _count: { id: true } }),
  ]);
  const accountCounts = Object.fromEntries(accountSummary.map(item => [item.status, item._count.id]));
  return {
    customerCount,
    redemptionCount,
    commissionAmount: commissionTotal._sum.amount || 0,
    pendingCommissionAmount: pendingCommission._sum.amount || 0,
    eligibleCommissionAmount: eligibleCommission._sum.amount || 0,
    eligibleCommissionCount: eligibleCommission._count.id,
    settledCommissionAmount: settledCommission._sum.amount || 0,
    claimedAccountCount: accountCounts.CLAIMED || 0,
    redeemedAccountCount: accountCounts.REDEEMED || 0,
    voidedAccountCount: accountCounts.VOIDED || 0,
  };
}

export default router;
