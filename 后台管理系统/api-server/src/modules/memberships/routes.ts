import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Agent } from '@prisma/client';
import { addDays } from '../../time.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { applyWalletDelta } from '../../billing.js';
import { assertCustomerBelongsToAgent } from '../agent-credit/service.js';

const router = Router();
type Tx = Prisma.TransactionClient;
const DEFAULT_AGENT_MEMBERSHIP_CARD_DISCOUNT_RATE = 0.3;

router.get('/plans', requireAuth, asyncHandler(async (_req, res) => {
  const plans = await prisma.membershipPlan.findMany({ orderBy: { price: 'asc' } });
  ok(res, { items: plans });
}));

const planSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().nonnegative(),
  bonusCredits: z.number().int().nonnegative().default(0),
  durationDays: z.number().int().positive(),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

router.post('/plans', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = { ...planSchema.parse(req.body), bonusCredits: 0 };
  const plan = await prisma.membershipPlan.create({ data: body });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'MEMBERSHIP_PLAN_CREATE', targetType: 'MEMBERSHIP_PLAN', targetId: plan.id, remark: plan.name } });
  ok(res, { plan });
}));

router.patch('/plans/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = { ...planSchema.partial().parse(req.body), bonusCredits: 0 };
  const plan = await prisma.membershipPlan.update({ where: { id: routeParam(req.params.id) }, data: body });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'MEMBERSHIP_PLAN_UPDATE', targetType: 'MEMBERSHIP_PLAN', targetId: plan.id, remark: plan.name } });
  ok(res, { plan });
}));

router.get('/current', requireAuth, asyncHandler(async (req, res) => {
  const membership = await prisma.userMembership.findFirst({
    where: { userId: req.user!.id, expiredAt: { gt: new Date() } },
    include: { plan: true },
    orderBy: { expiredAt: 'desc' },
  });
  ok(res, { membership });
}));

const purchaseSchema = z.object({
  planId: z.string().min(1),
});

router.post('/purchase', requireAuth, asyncHandler(async (req, res) => {
  const body = purchaseSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [plan, user] = await Promise.all([
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
      tx.user.findUnique({ where: { id: req.user!.id }, include: { agent: true } }),
    ]);
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');

    const latest = await tx.userMembership.findFirst({ where: { userId: req.user!.id, expiredAt: { gt: new Date() } }, orderBy: { expiredAt: 'desc' } });
    const startedAt = latest?.expiredAt && latest.expiredAt > new Date() ? latest.expiredAt : new Date();
    const expiredAt = addDays(startedAt, plan.durationDays);
    const walletChange = await applyWalletDelta(tx, { userId: req.user!.id, delta: -plan.price, requireNonNegative: true });
    const membership = await tx.userMembership.create({
      data: { userId: req.user!.id, planId: plan.id, source: 'DIRECT_PURCHASE', startedAt, expiredAt },
    });
    await tx.walletLog.create({
      data: {
        userId: req.user!.id,
        type: 'CONSUME',
        amount: -plan.price,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'MEMBERSHIP_PURCHASE',
        relatedId: membership.id,
        remark: `购买会员：${plan.name}`,
      },
    });

    let commission = null;
    if (user?.agent && user.agent.status === 'ACTIVE') {
      const amount = Math.ceil(plan.price * Number(user.agent.commissionRate));
      if (amount > 0) {
        commission = await tx.commissionLog.create({
          data: {
            agentId: user.agent.id,
            userId: req.user!.id,
            sourceType: 'MEMBERSHIP_PURCHASE',
            sourceId: membership.id,
            amount,
          },
        });
      }
    }
    return { membership, plan, balance: walletChange.balanceAfter, commission };
  });
  ok(res, result);
}));

router.get('/member-accounts', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const accounts = await prisma.memberAccount.findMany({ include: { plan: true, claimedAgent: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, { items: accounts });
}));

const batchSchema = z.object({
  planId: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
});

router.post('/member-accounts/batch-create', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = batchSchema.parse(req.body);
  const plan = await prisma.membershipPlan.findUnique({ where: { id: body.planId } });
  if (!plan) fail(404, '会员套餐不存在', 'PLAN_NOT_FOUND');
  const rows = Array.from({ length: body.quantity }, () => ({
    planId: body.planId,
    code: makeCode(),
  }));
  await prisma.memberAccount.createMany({ data: rows });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'MEMBER_ACCOUNT_BATCH_CREATE', targetType: 'MEMBER_ACCOUNT', targetId: body.planId, remark: `${plan.name} x ${rows.length}` } });
  ok(res, { count: rows.length });
}));

router.post('/member-accounts/:id/void', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const existing = await prisma.memberAccount.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!existing) fail(404, '会员账号不存在', 'MEMBER_ACCOUNT_NOT_FOUND');
  if (existing.status === 'REDEEMED') fail(400, '已核销账号不能作废', 'MEMBER_ACCOUNT_REDEEMED');
  const account = existing.status === 'VOIDED'
    ? existing
    : await prisma.memberAccount.update({ where: { id: existing.id }, data: { status: 'VOIDED' } });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'MEMBER_ACCOUNT_VOID', targetType: 'MEMBER_ACCOUNT', targetId: account.id } });
  ok(res, { account });
}));

const offlineMembershipSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/admin/membership/offline-code', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = offlineMembershipSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [user, plan] = await Promise.all([
      tx.user.findUnique({ where: { id: body.userId } }),
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const account = await tx.memberAccount.create({ data: { planId: plan.id, code: makeCode() }, include: { plan: true } });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'ADMIN_MEMBERSHIP_CODE_CREATE',
        targetType: 'MEMBER_ACCOUNT',
        targetId: account.id,
        remark: body.remark || `线下收款后生成会员兑换码：${user.nickname || user.phone || user.id} ${plan.name}`,
      },
    });
    return { account, code: account.code };
  });
  ok(res, result);
}));

router.post('/admin/membership/direct-open', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = offlineMembershipSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [user, plan] = await Promise.all([
      tx.user.findUnique({ where: { id: body.userId }, include: { agent: true } }),
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const membership = await createMembershipInTx(tx, { userId: user.id, plan, source: 'ADMIN_OFFLINE_OPEN' });
    const commission = await createBoundAgentMembershipCommission(tx, { user, plan, sourceType: 'ADMIN_MEMBERSHIP_OFFLINE_OPEN', sourceId: membership.id });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'ADMIN_MEMBERSHIP_DIRECT_OPEN',
        targetType: 'USER_MEMBERSHIP',
        targetId: membership.id,
        remark: body.remark || `线下收款后直接开通会员：${user.nickname || user.phone || user.id} ${plan.name}`,
      },
    });
    return { membership, plan, commission };
  });
  ok(res, result);
}));

const renewMembershipSchema = z.object({
  planId: z.string().min(1),
  remark: z.string().optional(),
});

router.post('/admin/membership/users/:userId/renew', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = renewMembershipSchema.parse(req.body);
  const userId = routeParam(req.params.userId);
  const result = await prisma.$transaction(async tx => {
    const now = new Date();
    const [user, plan, latestMembership] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, include: { agent: true } }),
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
      tx.userMembership.findFirst({
        where: { userId, expiredAt: { gt: now } },
        include: { plan: true },
        orderBy: { expiredAt: 'desc' },
      }),
    ]);
    if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
    if (user.status !== 'ACTIVE') fail(400, '禁用用户不能直接续期会员', 'USER_DISABLED');
    if (!latestMembership) fail(400, '当前用户不是有效会员，请先开通会员', 'USER_MEMBERSHIP_NOT_ACTIVE');
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');

    const membership = await createMembershipInTx(tx, { userId: user.id, plan, source: 'ADMIN_MEMBERSHIP_RENEW' });
    const commission = await createBoundAgentMembershipCommission(tx, { user, plan, sourceType: 'ADMIN_MEMBERSHIP_RENEW', sourceId: membership.id });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'ADMIN_MEMBERSHIP_RENEW',
        targetType: 'USER_MEMBERSHIP',
        targetId: membership.id,
        remark: body.remark || `超级管理员直接续期会员：${user.nickname || user.phone || user.id} ${plan.name}，原到期 ${latestMembership.expiredAt.toISOString()}，续期至 ${membership.expiredAt.toISOString()}`,
      },
    });
    return {
      user: { id: user.id, nickname: user.nickname, phone: user.phone, email: user.email },
      previousMembership: latestMembership,
      membership,
      plan,
      commission,
    };
  });
  ok(res, result);
}));

const batchDirectOpenSchema = z.object({
  userIds: z.array(z.string().min(1)).max(1000).default([]),
  allNonMember: z.boolean().default(false),
  keyword: z.string().optional(),
  planId: z.string().min(1),
  remark: z.string().optional(),
});

router.post('/admin/membership/batch-direct-open', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = batchDirectOpenSchema.parse(req.body);
  const userIds = Array.from(new Set(body.userIds));
  if (!body.allNonMember && userIds.length === 0) {
    fail(400, '请先选择用户，或选择当前筛选下全部非会员用户', 'BATCH_TARGET_REQUIRED');
  }
  const result = await prisma.$transaction(async tx => {
    const now = new Date();
    const plan = await tx.membershipPlan.findUnique({ where: { id: body.planId } });
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');

    const keyword = String(body.keyword || '').trim();
    const keywordWhere: Prisma.UserWhereInput = keyword
      ? { OR: [{ phone: { contains: keyword } }, { email: { contains: keyword } }, { nickname: { contains: keyword } }] }
      : {};
    const nonMemberWhere: Prisma.UserWhereInput = {
      ...keywordWhere,
      status: 'ACTIVE',
      memberships: { none: { expiredAt: { gt: now } } },
    };

    const totalMatchedNonMembers = body.allNonMember ? await tx.user.count({ where: nonMemberWhere }) : 0;
    if (body.allNonMember && totalMatchedNonMembers > 1000) {
      fail(400, '一次最多批量开通 1000 个用户，请增加搜索条件缩小范围', 'BATCH_TOO_LARGE');
    }

    const users = body.allNonMember
      ? await tx.user.findMany({ where: nonMemberWhere, include: { agent: true }, orderBy: { createdAt: 'desc' } })
      : await tx.user.findMany({ where: { id: { in: userIds } }, include: { agent: true } });
    const foundIds = new Set(users.map(user => user.id));
    const missingUserIds = body.allNonMember ? [] : userIds.filter(id => !foundIds.has(id));
    const activeMemberships = body.allNonMember ? [] : await tx.userMembership.findMany({
      where: { userId: { in: users.map(user => user.id) }, expiredAt: { gt: now } },
      select: { userId: true },
    });
    const activeUserIds = new Set(activeMemberships.map(item => item.userId));
    const targetUsers = body.allNonMember ? users : users.filter(user => user.status === 'ACTIVE' && !activeUserIds.has(user.id));

    const opened: Array<{ userId: string; membershipId: string; expiredAt: Date }> = [];
    const commissions = [];
    const startedAt = now;
    const expiredAt = addDays(startedAt, plan.durationDays);
    for (const user of targetUsers) {
      const membership = await tx.userMembership.create({
        data: { userId: user.id, planId: plan.id, source: 'ADMIN_BATCH_DIRECT_OPEN', startedAt, expiredAt },
      });
      const commission = await createBoundAgentMembershipCommission(tx, { user, plan, sourceType: 'ADMIN_MEMBERSHIP_BATCH_OPEN', sourceId: membership.id });
      opened.push({ userId: user.id, membershipId: membership.id, expiredAt: membership.expiredAt });
      if (commission) commissions.push(commission);
    }
    const disabledUserIds = users.filter(user => user.status !== 'ACTIVE').map(user => user.id);

    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'ADMIN_MEMBERSHIP_BATCH_DIRECT_OPEN',
        targetType: 'MEMBERSHIP_PLAN',
        targetId: plan.id,
        remark: body.remark || `批量直接开通会员：${plan.name}，范围 ${body.allNonMember ? `当前筛选非会员${keyword ? `(${keyword})` : ''}` : '已选用户'}，成功 ${opened.length}，已是会员跳过 ${activeUserIds.size}，禁用跳过 ${disabledUserIds.length}，不存在 ${missingUserIds.length}`,
      },
    });

    return {
      plan,
      opened,
      openedCount: opened.length,
      scope: body.allNonMember ? 'allNonMember' : 'selected',
      totalMatchedNonMembers,
      skippedActiveUserIds: users.filter(user => activeUserIds.has(user.id)).map(user => user.id),
      skippedDisabledUserIds: disabledUserIds,
      missingUserIds,
      commissionCount: commissions.length,
    };
  });
  ok(res, result);
}));

router.post('/agent/membership-vouchers', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = offlineMembershipSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [plan] = await Promise.all([
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
      assertCustomerBelongsToAgent(tx, { agentId: agent.id, userId: body.userId }),
    ]);
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const account = await takeAgentMembershipCard(tx, { agentId: agent.id, planId: plan.id, reserveUserId: body.userId });
    return { account, code: account.code };
  });
  ok(res, result);
}));

router.post('/agent/membership/direct-open', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = offlineMembershipSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    await assertCustomerBelongsToAgent(tx, { agentId: agent.id, userId: body.userId });
    const plan = await tx.membershipPlan.findUnique({ where: { id: body.planId } });
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const account = await takeAgentMembershipCard(tx, { agentId: agent.id, planId: plan.id });
    return createAgentMembershipRedemption(tx, { agent, userId: body.userId, plan, accountId: account.id, source: 'AGENT_OFFLINE_DIRECT_OPEN' });
  });
  ok(res, result);
}));

const agentMembershipCardGrantSchema = z.object({
  agentId: z.string().min(1),
  planId: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
  discountRate: z.number().positive().max(1).default(DEFAULT_AGENT_MEMBERSHIP_CARD_DISCOUNT_RATE),
  amountCents: z.number().int().positive().optional(),
  transferChannel: z.string().optional(),
  transferNo: z.string().optional(),
  proofImageUrl: z.string().optional(),
  remark: z.string().optional(),
});

router.post('/admin/agent-membership/cards/grant', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = agentMembershipCardGrantSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [agent, plan] = await Promise.all([
      tx.agent.findUnique({ where: { id: body.agentId }, include: { user: true } }),
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!agent || agent.status !== 'ACTIVE') fail(404, '代理不存在或已停用', 'AGENT_NOT_FOUND');
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const amountCents = body.amountCents || calcAgentMembershipCardAmountCents(plan.price, body.quantity, body.discountRate);
    const rows = Array.from({ length: body.quantity }, () => ({
      planId: plan.id,
      code: makeCode(),
      status: 'CLAIMED' as const,
      claimedAgentId: agent.id,
      claimedAt: new Date(),
    }));
    await tx.memberAccount.createMany({ data: rows });
    const cards = await tx.memberAccount.findMany({
      where: { claimedAgentId: agent.id, status: 'CLAIMED', planId: plan.id },
      include: { plan: true, claimedAgent: true },
      orderBy: { claimedAt: 'desc' },
      take: body.quantity,
    });
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeMembershipCardOrderNo(),
        agentId: agent.id,
        type: 'PREPAID_GRANT',
        status: 'CONFIRMED',
        credits: body.quantity,
        amountCents,
        transferChannel: body.transferChannel,
        transferNo: body.transferNo,
        proofImageUrl: body.proofImageUrl,
        relatedType: 'MEMBERSHIP_CARD_GRANT',
        relatedId: plan.id,
        remark: body.remark || `${agent.name} 会员卡 ${plan.name} x ${body.quantity}，折扣 ${formatDiscountRate(body.discountRate)}`,
        confirmedByAdminId: req.user!.id,
        confirmedAt: new Date(),
      },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'AGENT_MEMBERSHIP_CARD_GRANT',
        targetType: 'AGENT',
        targetId: agent.id,
        remark: `${agent.name} ${plan.name} x ${body.quantity} amount=${amountCents}`,
      },
    });
    return { count: body.quantity, amountCents, cards, order };
  });
  ok(res, result);
}));

const subAgentMembershipCardGrantSchema = agentMembershipCardGrantSchema.omit({ agentId: true }).extend({
  targetAgentId: z.string().min(1),
});

router.post('/agent/sub-agent-membership/cards/grant', requireAuth, asyncHandler(async (req, res) => {
  const actor = await currentAgent(req.user!.id);
  const body = subAgentMembershipCardGrantSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const [target, plan] = await Promise.all([
      tx.agent.findUnique({ where: { id: body.targetAgentId }, include: { user: true } }),
      tx.membershipPlan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!target || target.status !== 'ACTIVE') fail(404, '下级代理不存在或已停用', 'SUB_AGENT_NOT_FOUND');
    if (target.parentAgentId !== actor.id) fail(403, '只能给自己的下级代理配置会员卡资格', 'SUB_AGENT_SCOPE_DENIED');
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const amountCents = body.amountCents || calcAgentMembershipCardAmountCents(plan.price, body.quantity, body.discountRate);
    await tx.memberAccount.createMany({
      data: Array.from({ length: body.quantity }, () => ({
        planId: plan.id,
        code: makeCode(),
        status: 'CLAIMED' as const,
        claimedAgentId: target.id,
        claimedAt: new Date(),
      })),
    });
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeMembershipCardOrderNo(),
        agentId: target.id,
        type: 'PREPAID_GRANT',
        status: 'CONFIRMED',
        credits: body.quantity,
        amountCents,
        transferChannel: body.transferChannel,
        transferNo: body.transferNo,
        proofImageUrl: body.proofImageUrl,
        relatedType: 'MEMBERSHIP_CARD_GRANT',
        relatedId: plan.id,
        remark: body.remark || `${actor.name} 给下级 ${target.name} 配置会员卡 ${plan.name} x ${body.quantity}，折扣 ${formatDiscountRate(body.discountRate)}`,
        confirmedAt: new Date(),
      },
    });
    return { count: body.quantity, amountCents, order };
  });
  ok(res, result);
}));

const agentMembershipCardRequestSchema = agentMembershipCardGrantSchema.omit({ agentId: true }).extend({
  amountCents: z.number().int().positive().optional(),
});

router.post('/agent/membership-card-requests', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const body = agentMembershipCardRequestSchema.parse(req.body);
  const result = await prisma.$transaction(async tx => {
    const plan = await tx.membershipPlan.findUnique({ where: { id: body.planId } });
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const amountCents = body.amountCents || calcAgentMembershipCardAmountCents(plan.price, body.quantity, body.discountRate);
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeMembershipCardOrderNo(),
        agentId: agent.id,
        type: 'PREPAID_GRANT',
        status: 'PENDING',
        credits: body.quantity,
        amountCents,
        transferChannel: body.transferChannel,
        transferNo: body.transferNo,
        proofImageUrl: body.proofImageUrl,
        relatedType: 'MEMBERSHIP_CARD_REQUEST',
        relatedId: plan.id,
        remark: body.remark || `${plan.name} x ${body.quantity}，折扣 ${formatDiscountRate(body.discountRate)}`,
      },
    });
    return { order, plan, amountCents };
  });
  ok(res, result);
}));

router.get('/agent/membership-card-requests', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const items = await prisma.agentReconciliationOrder.findMany({
    where: { agentId: agent.id, relatedType: { in: ['MEMBERSHIP_CARD_REQUEST', 'MEMBERSHIP_CARD_GRANT'] } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  ok(res, { items });
}));

router.get('/admin/agent-membership/card-requests', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.agentReconciliationOrder.findMany({
    where: { relatedType: { in: ['MEMBERSHIP_CARD_REQUEST', 'MEMBERSHIP_CARD_GRANT'] } },
    include: { agent: { include: { user: { select: { id: true, nickname: true, phone: true } } } }, confirmedByAdmin: { select: { id: true, nickname: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  ok(res, { items });
}));

router.post('/admin/agent-membership/card-requests/:id/approve', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = z.object({ remark: z.string().optional() }).parse(req.body || {});
  const result = await prisma.$transaction(async tx => {
    const order = await tx.agentReconciliationOrder.findUnique({ where: { id: routeParam(req.params.id) }, include: { agent: true } });
    if (!order || order.relatedType !== 'MEMBERSHIP_CARD_REQUEST') fail(404, '会员卡申请不存在', 'MEMBERSHIP_CARD_REQUEST_NOT_FOUND');
    if (order.status !== 'PENDING') fail(400, '会员卡申请不是待审核状态', 'MEMBERSHIP_CARD_REQUEST_NOT_PENDING');
    if (!order.relatedId) fail(400, '会员卡申请缺少套餐', 'MEMBERSHIP_CARD_REQUEST_PLAN_MISSING');
    const plan = await tx.membershipPlan.findUnique({ where: { id: order.relatedId } });
    if (!plan || plan.status !== 'ACTIVE') fail(404, '会员套餐不可用', 'PLAN_NOT_FOUND');
    const quantity = Math.max(1, order.credits || 1);
    await tx.memberAccount.createMany({ data: Array.from({ length: quantity }, () => ({ planId: plan.id, code: makeCode(), status: 'CLAIMED' as const, claimedAgentId: order.agentId, claimedAt: new Date() })) });
    const updated = await tx.agentReconciliationOrder.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', relatedType: 'MEMBERSHIP_CARD_GRANT', confirmedByAdminId: req.user!.id, confirmedAt: new Date(), remark: body.remark || order.remark },
    });
    await tx.adminLog.create({ data: { adminUserId: req.user!.id, action: 'AGENT_MEMBERSHIP_CARD_REQUEST_APPROVE', targetType: 'AGENT_RECONCILIATION_ORDER', targetId: updated.id, remark: updated.orderNo } });
    return { order: updated, count: quantity };
  });
  ok(res, result);
}));

router.post('/admin/agent-membership/card-requests/:id/reject', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = z.object({ reason: z.string().optional(), remark: z.string().optional() }).parse(req.body || {});
  const order = await prisma.agentReconciliationOrder.update({
    where: { id: routeParam(req.params.id) },
    data: { status: 'CANCELLED', confirmedByAdminId: req.user!.id, confirmedAt: new Date(), remark: body.reason || body.remark || '管理员驳回会员卡申请' },
  });
  await prisma.adminLog.create({ data: { adminUserId: req.user!.id, action: 'AGENT_MEMBERSHIP_CARD_REQUEST_REJECT', targetType: 'AGENT_RECONCILIATION_ORDER', targetId: order.id, remark: order.orderNo } });
  ok(res, { order });
}));

router.post('/membership-vouchers/redeem', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ code: z.string().min(1) }).parse(req.body);
  const code = body.code.trim().toUpperCase();
  const result = await prisma.$transaction(async tx => {
    const account = await tx.memberAccount.findUnique({ where: { code }, include: { plan: true, claimedAgent: true } });
    if (!account) fail(404, '会员兑换码不存在', 'MEMBERSHIP_CODE_NOT_FOUND');
    if (!['AVAILABLE', 'CLAIMED'].includes(account.status)) fail(400, '会员兑换码不可用', 'MEMBERSHIP_CODE_NOT_AVAILABLE');
    if (account.plan.status !== 'ACTIVE') fail(400, '会员套餐已停用', 'PLAN_DISABLED');
    if (account.status === 'CLAIMED' && account.redeemedUserId && account.redeemedUserId !== req.user!.id) fail(403, '会员兑换码不属于当前用户', 'MEMBERSHIP_CODE_USER_MISMATCH');
    const now = new Date();
    const changed = await tx.memberAccount.updateMany({
      where: { id: account.id, status: account.status },
      data: { status: 'REDEEMED', redeemedUserId: req.user!.id, redeemedAt: now },
    });
    if (changed.count !== 1) fail(409, '会员兑换码状态已变化，请刷新后重试', 'MEMBERSHIP_CODE_CONFLICT');
    if (account.status === 'CLAIMED') {
      if (!account.claimedAgentId || !account.claimedAgent || account.claimedAgent.status !== 'ACTIVE') fail(400, '会员兑换码所属代理不可用', 'AGENT_DISABLED');
      await assertCustomerBelongsToAgent(tx, { agentId: account.claimedAgentId, userId: req.user!.id });
      return createAgentMembershipRedemption(tx, {
        agent: account.claimedAgent,
        userId: req.user!.id,
        plan: account.plan,
        accountId: account.id,
        source: 'AGENT_MEMBERSHIP_CODE',
      });
    }
    const membership = await createMembershipInTx(tx, { userId: req.user!.id, plan: account.plan, source: 'ADMIN_MEMBERSHIP_CODE' });
    const user = await tx.user.findUnique({ where: { id: req.user!.id }, include: { agent: true } });
    const commission = user ? await createBoundAgentMembershipCommission(tx, { user, plan: account.plan, sourceType: 'ADMIN_MEMBERSHIP_CODE_REDEEM', sourceId: membership.id }) : null;
    return { membership, plan: account.plan, account: { ...account, status: 'REDEEMED', redeemedUserId: req.user!.id, redeemedAt: now }, commission };
  });
  ok(res, result);
}));

function makeCode() {
  return `VIP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makeMembershipCardOrderNo() {
  return `MC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatDiscountRate(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function calcAgentMembershipCardAmountCents(planPriceCredits: number, quantity: number, discountRate: number) {
  return Math.ceil(Math.max(0, planPriceCredits) * Math.max(1, quantity) * Math.max(0, discountRate));
}

async function takeAgentMembershipCard(tx: Tx, input: { agentId: string; planId: string; reserveUserId?: string }) {
  const card = await tx.memberAccount.findFirst({
    where: {
      claimedAgentId: input.agentId,
      planId: input.planId,
      status: 'CLAIMED',
      redeemedUserId: null,
    },
    include: { plan: true, claimedAgent: true },
    orderBy: { claimedAt: 'asc' },
  });
  if (!card) fail(400, '代理会员卡资格不足，请先向管理员或上级代理申请配置会员卡', 'AGENT_MEMBERSHIP_CARD_STOCK_LOW');
  if (!input.reserveUserId) return card;
  const changed = await tx.memberAccount.updateMany({
    where: { id: card.id, status: 'CLAIMED', redeemedUserId: null },
    data: { redeemedUserId: input.reserveUserId },
  });
  if (changed.count !== 1) fail(409, '会员卡资格已被占用，请刷新后重试', 'AGENT_MEMBERSHIP_CARD_CONFLICT');
  const reserved = await tx.memberAccount.findUnique({ where: { id: card.id }, include: { plan: true, claimedAgent: true } });
  if (!reserved) fail(404, '会员卡资格不存在', 'AGENT_MEMBERSHIP_CARD_NOT_FOUND');
  return reserved;
}

async function currentAgent(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent || agent.status !== 'ACTIVE') fail(403, '当前账号不是有效代理', 'AGENT_REQUIRED');
  return agent;
}

async function createMembershipInTx(tx: Tx, input: { userId: string; plan: { id: string; durationDays: number }; source: string }) {
  const now = new Date();
  const latest = await tx.userMembership.findFirst({ where: { userId: input.userId, expiredAt: { gt: now } }, orderBy: { expiredAt: 'desc' } });
  const startedAt = latest?.expiredAt && latest.expiredAt > now ? latest.expiredAt : now;
  const membership = await tx.userMembership.create({
    data: { userId: input.userId, planId: input.plan.id, source: input.source, startedAt, expiredAt: addDays(startedAt, input.plan.durationDays) },
  });
  return membership;
}

async function createBoundAgentMembershipCommission(tx: Tx, input: {
  user: { id: string; agent?: Agent | null };
  plan: { price: number };
  sourceType: string;
  sourceId: string;
  redemptionId?: string;
}) {
  if (!input.user.agent || input.user.agent.status !== 'ACTIVE') return null;
  const amount = Math.ceil(input.plan.price * Number(input.user.agent.commissionRate));
  if (amount <= 0) return null;
  return tx.commissionLog.create({
    data: {
      agentId: input.user.agent.id,
      userId: input.user.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      redemptionId: input.redemptionId,
      amount,
    },
  });
}

async function createAgentMembershipRedemption(tx: Tx, input: {
  agent: Agent;
  userId: string;
  plan: { id: string; price: number; durationDays: number };
  accountId?: string;
  source: string;
}) {
  const now = new Date();
  const account = input.accountId
    ? await tx.memberAccount.findUnique({ where: { id: input.accountId }, include: { plan: true, claimedAgent: true } })
    : await tx.memberAccount.create({
      data: {
        code: makeCode(),
        planId: input.plan.id,
        status: 'REDEEMED',
        claimedAgentId: input.agent.id,
        claimedAt: now,
        redeemedUserId: input.userId,
        redeemedAt: now,
      },
      include: { plan: true, claimedAgent: true },
    });
  if (!account) fail(404, '会员兑换码不存在', 'MEMBERSHIP_CODE_NOT_FOUND');
  const commissionAmount = Math.ceil(input.plan.price * Number(input.agent.commissionRate));
  const redemption = await tx.accountRedemption.create({
    data: { accountId: account.id, agentId: input.agent.id, userId: input.userId, planId: input.plan.id, commissionAmount },
  });
  const membership = await createMembershipInTx(tx, { userId: input.userId, plan: input.plan, source: input.source });
  const commission = commissionAmount > 0
    ? await tx.commissionLog.create({
      data: {
        agentId: input.agent.id,
        userId: input.userId,
        sourceType: input.source,
        sourceId: redemption.id,
        redemptionId: redemption.id,
        amount: commissionAmount,
      },
    })
    : null;
  return { membership, plan: input.plan, account, redemption, commission };
}

export async function openMembership(userId: string, planId: string, source: string) {
  return prisma.$transaction(async tx => {
    const plan = await tx.membershipPlan.findUnique({ where: { id: planId } });
    if (!plan) fail(404, '会员套餐不存在', 'PLAN_NOT_FOUND');
    return createMembershipInTx(tx, { userId, plan, source });
  });
}

export default router;
