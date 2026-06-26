import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { hashPassword, makeInitialPassword } from '../../security.js';
import { addDays } from '../../time.js';
import { normalizeNickname, normalizePhone } from '../../identity-normalize.js';

const router = Router();

type AgentDashboardGranularity = 'day' | 'month';

type AgentDashboardAggregateRow = {
  credits: bigint | number | null;
  count: bigint | number | null;
  amount_cents?: bigint | number | null;
  paid_credits?: bigint | number | null;
  paid_count?: bigint | number | null;
  credit_only_credits?: bigint | number | null;
  credit_only_count?: bigint | number | null;
  wallet_balance?: bigint | number | null;
};

type AgentDashboardSeriesRow = {
  period: string;
  credits: bigint | number | null;
  count: bigint | number | null;
  amount_cents?: bigint | number | null;
  paid_credits?: bigint | number | null;
  paid_count?: bigint | number | null;
  credit_only_credits?: bigint | number | null;
  credit_only_count?: bigint | number | null;
};

type AgentDashboardBreakdownRow = {
  agent_id: string;
  agent_name: string;
  owner_name: string | null;
  owner_phone: string | null;
  customer_count: bigint | number | null;
  wallet_balance: bigint | number | null;
  recharge_credits: bigint | number | null;
  recharge_count: bigint | number | null;
  recharge_amount_cents: bigint | number | null;
  paid_recharge_credits: bigint | number | null;
  paid_recharge_count: bigint | number | null;
  credit_only_recharge_credits: bigint | number | null;
  credit_only_recharge_count: bigint | number | null;
  consume_credits: bigint | number | null;
  consume_count: bigint | number | null;
  agent_quota_credits: bigint | number | null;
  agent_quota_count: bigint | number | null;
  available_credits: bigint | number | null;
  frozen_credits: bigint | number | null;
  used_credits: bigint | number | null;
  receivable_credits: bigint | number | null;
};

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : '';
}

function dateQuery(value: unknown, fallback: Date) {
  const raw = firstQueryValue(value).trim();
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function numberOf(value: unknown) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === 'function') return (value as { toNumber: () => number }).toNumber();
  return Number(value || 0);
}

function getAgentDashboardRequest(query: Record<string, unknown>) {
  const rawGranularity = firstQueryValue(query.granularity);
  const granularity: AgentDashboardGranularity = rawGranularity === 'month' ? 'month' : 'day';
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setHours(0, 0, 0, 0);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultStart.getDate() - 30);
  const start = dateQuery(query.start, defaultStart);
  const end = dateQuery(query.end, defaultEnd);
  if (end <= start) fail(400, '统计结束时间必须晚于开始时间', 'AGENT_DASHBOARD_RANGE_INVALID');
  if ((end.getTime() - start.getTime()) / 86400000 > 370 + 1) {
    fail(400, '统计区间最多支持 370 天', 'AGENT_DASHBOARD_RANGE_TOO_LARGE');
  }
  const agentId = firstQueryValue(query.agentId).trim();
  if (agentId.length > 128) fail(400, '代理筛选参数异常', 'AGENT_DASHBOARD_AGENT_FILTER_INVALID');
  return { granularity, start, end, agentId };
}

function agentPeriodFormat(granularity: AgentDashboardGranularity) {
  return granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
}

function agentWalletPeriodBucketSql(granularity: AgentDashboardGranularity) {
  return granularity === 'month'
    ? Prisma.sql`to_char(date_trunc('month', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${agentPeriodFormat(granularity)})`
    : Prisma.sql`to_char(date_trunc('day', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${agentPeriodFormat(granularity)})`;
}

function agentOrderPeriodBucketSql(granularity: AgentDashboardGranularity) {
  return granularity === 'month'
    ? Prisma.sql`to_char(date_trunc('month', aro."created_at" AT TIME ZONE 'Asia/Shanghai'), ${agentPeriodFormat(granularity)})`
    : Prisma.sql`to_char(date_trunc('day', aro."created_at" AT TIME ZONE 'Asia/Shanghai'), ${agentPeriodFormat(granularity)})`;
}

function mergeAgentDashboardSeries(input: {
  rechargeRows: AgentDashboardSeriesRow[];
  consumeRows: AgentDashboardSeriesRow[];
  quotaRows: AgentDashboardSeriesRow[];
}) {
  const byPeriod = new Map<string, {
    period: string;
    rechargeCredits: number;
    consumeCredits: number;
    agentQuotaCredits: number;
    rechargeCount: number;
    consumeCount: number;
    agentQuotaCount: number;
    rechargeAmountCents: number;
    paidRechargeCredits: number;
    paidRechargeCount: number;
    creditOnlyRechargeCredits: number;
    creditOnlyRechargeCount: number;
  }>();
  const ensure = (period: string) => {
    const existing = byPeriod.get(period);
    if (existing) return existing;
    const row = {
      period,
      rechargeCredits: 0,
      consumeCredits: 0,
      agentQuotaCredits: 0,
      rechargeCount: 0,
      consumeCount: 0,
      agentQuotaCount: 0,
      rechargeAmountCents: 0,
      paidRechargeCredits: 0,
      paidRechargeCount: 0,
      creditOnlyRechargeCredits: 0,
      creditOnlyRechargeCount: 0,
    };
    byPeriod.set(period, row);
    return row;
  };
  input.rechargeRows.forEach(item => {
    const row = ensure(item.period);
    row.rechargeCredits = numberOf(item.credits);
    row.rechargeCount = numberOf(item.count);
    row.rechargeAmountCents = numberOf(item.amount_cents);
    row.paidRechargeCredits = numberOf(item.paid_credits);
    row.paidRechargeCount = numberOf(item.paid_count);
    row.creditOnlyRechargeCredits = numberOf(item.credit_only_credits);
    row.creditOnlyRechargeCount = numberOf(item.credit_only_count);
  });
  input.consumeRows.forEach(item => {
    const row = ensure(item.period);
    row.consumeCredits = numberOf(item.credits);
    row.consumeCount = numberOf(item.count);
  });
  input.quotaRows.forEach(item => {
    const row = ensure(item.period);
    row.agentQuotaCredits = numberOf(item.credits);
    row.agentQuotaCount = numberOf(item.count);
  });
  return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period)).map(row => ({
    ...row,
    netCredits: row.rechargeCredits + row.agentQuotaCredits - row.consumeCredits,
  }));
}

function mapAgentDashboardBreakdown(rows: AgentDashboardBreakdownRow[]) {
  return rows.map(row => {
    const rechargeCredits = numberOf(row.recharge_credits);
    const consumeCredits = numberOf(row.consume_credits);
    const agentQuotaCredits = numberOf(row.agent_quota_credits);
    return {
      agentId: row.agent_id,
      agentName: row.agent_name,
      ownerName: row.owner_name || '',
      ownerPhone: row.owner_phone || '',
      customerCount: numberOf(row.customer_count),
      walletBalance: numberOf(row.wallet_balance),
      rechargeCredits,
      rechargeCount: numberOf(row.recharge_count),
      rechargeAmountCents: numberOf(row.recharge_amount_cents),
      paidRechargeCredits: numberOf(row.paid_recharge_credits),
      paidRechargeCount: numberOf(row.paid_recharge_count),
      creditOnlyRechargeCredits: numberOf(row.credit_only_recharge_credits),
      creditOnlyRechargeCount: numberOf(row.credit_only_recharge_count),
      consumeCredits,
      consumeCount: numberOf(row.consume_count),
      agentQuotaCredits,
      agentQuotaCreditsRaw: agentQuotaCredits,
      agentQuotaCount: numberOf(row.agent_quota_count),
      agentQuotaCountRaw: numberOf(row.agent_quota_count),
      availableCredits: numberOf(row.available_credits),
      frozenCredits: numberOf(row.frozen_credits),
      usedCredits: numberOf(row.used_credits),
      receivableCredits: numberOf(row.receivable_credits),
      netCredits: rechargeCredits + agentQuotaCredits - consumeCredits,
    };
  });
}

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

router.get('/agent/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const agent = await currentAgent(req.user!.id);
  const dashboardRequest = getAgentDashboardRequest(req.query as Record<string, unknown>);
  const visibleAgentIds = await getVisibleCustomerAgentIds(agent);
  const visibleSet = new Set(visibleAgentIds);
  const selectedAgentId = dashboardRequest.agentId && dashboardRequest.agentId !== 'all' ? dashboardRequest.agentId : '';
  if (selectedAgentId && !visibleSet.has(selectedAgentId)) {
    fail(403, '只能查看自己团队内代理的数据', 'AGENT_DASHBOARD_AGENT_FORBIDDEN');
  }
  const scopedAgentIds = selectedAgentId ? [selectedAgentId] : visibleAgentIds;
  const visibleIdsSql = Prisma.join(visibleAgentIds);
  const scopedIdsSql = Prisma.join(scopedAgentIds);
  const walletBucket = agentWalletPeriodBucketSql(dashboardRequest.granularity);
  const orderBucket = agentOrderPeriodBucketSql(dashboardRequest.granularity);

  const [freshAgent, scopeSummaryRows, rechargeRows, consumeRows, quotaSummaryRows, quotaRows, agentBreakdownRows, usageStatus, taskStatus, redemptions, commissions] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: agent.id },
      include: { creditAccount: true, user: { select: { id: true, nickname: true, phone: true, email: true } } },
    }),
    prisma.$queryRaw<AgentDashboardAggregateRow[]>`
      WITH scoped_users AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."agent_id" IN (${scopedIdsSql})
      ),
      recharge_logs AS (
        SELECT
          wl."id",
          wl."amount",
          ro."id" AS order_id,
          ro."status" AS order_status,
          ro."amount_cents"
        FROM "wallet_logs" wl
        JOIN scoped_users su ON su."id" = wl."user_id"
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE wl."created_at" >= ${dashboardRequest.start}
          AND wl."created_at" < ${dashboardRequest.end}
          AND wl."amount" > 0
          AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
      ),
      paid_orders AS (
        SELECT COALESCE(SUM(amount_cents), 0) AS amount_cents
        FROM (
          SELECT DISTINCT order_id, amount_cents
          FROM recharge_logs
          WHERE order_id IS NOT NULL
            AND order_status::text = 'PAID'
            AND amount_cents > 0
        ) distinct_paid_orders
      ),
      recharges AS (
        SELECT
          COALESCE(SUM(rl."amount"), 0) AS credits,
          COUNT(rl."id") AS count,
          COALESCE(MAX(paid_orders.amount_cents), 0) AS amount_cents,
          COALESCE(SUM(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN rl."amount" ELSE 0 END), 0) AS paid_credits,
          COUNT(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN 1 END) AS paid_count,
          COALESCE(SUM(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN rl."amount" ELSE 0 END), 0) AS credit_only_credits,
          COUNT(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN 1 END) AS credit_only_count
        FROM recharge_logs rl
        CROSS JOIN paid_orders
      ),
      balances AS (
        SELECT COALESCE(SUM(COALESCE(w."balance", 0)), 0) AS wallet_balance
        FROM scoped_users su
        LEFT JOIN "wallets" w ON w."user_id" = su."id"
      )
      SELECT recharges.*, balances.wallet_balance
      FROM recharges, balances
    `,
    prisma.$queryRaw<AgentDashboardSeriesRow[]>`
      WITH recharge_logs AS (
        SELECT
          ${walletBucket} AS period,
          wl."id",
          wl."amount",
          ro."id" AS order_id,
          ro."status" AS order_status,
          ro."amount_cents"
        FROM "wallet_logs" wl
        JOIN "users" u ON u."id" = wl."user_id"
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE u."agent_id" IN (${scopedIdsSql})
          AND wl."created_at" >= ${dashboardRequest.start}
          AND wl."created_at" < ${dashboardRequest.end}
          AND wl."amount" > 0
          AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
      ),
      paid_orders AS (
        SELECT
          period,
          COALESCE(SUM(amount_cents), 0) AS amount_cents
        FROM (
          SELECT DISTINCT period, order_id, amount_cents
          FROM recharge_logs
          WHERE order_id IS NOT NULL
            AND order_status::text = 'PAID'
            AND amount_cents > 0
        ) distinct_paid_orders
        GROUP BY period
      )
      SELECT
        rl.period,
        COALESCE(SUM(rl."amount"), 0) AS credits,
        COUNT(rl."id") AS count,
        COALESCE(MAX(paid_orders.amount_cents), 0) AS amount_cents,
        COALESCE(SUM(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN rl."amount" ELSE 0 END), 0) AS paid_credits,
        COUNT(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN 1 END) AS paid_count,
        COALESCE(SUM(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN rl."amount" ELSE 0 END), 0) AS credit_only_credits,
        COUNT(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN 1 END) AS credit_only_count
      FROM recharge_logs rl
      LEFT JOIN paid_orders ON paid_orders.period = rl.period
      GROUP BY rl.period
      ORDER BY rl.period
    `,
    prisma.$queryRaw<AgentDashboardSeriesRow[]>`
      SELECT
        ${walletBucket} AS period,
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      WHERE u."agent_id" IN (${scopedIdsSql})
        AND wl."created_at" >= ${dashboardRequest.start}
        AND wl."created_at" < ${dashboardRequest.end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<AgentDashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(aro."credits"), 0) AS credits,
        COUNT(aro."id") AS count,
        COALESCE(SUM(aro."amount_cents"), 0) AS amount_cents
      FROM "agent_reconciliation_orders" aro
      WHERE aro."agent_id" IN (${scopedIdsSql})
        AND aro."agent_id" <> ${agent.id}
        AND aro."related_type" = 'AGENT_TEAM_CREDIT_GRANT'
        AND aro."related_id" = ${agent.id}
        AND aro."type"::text = 'MANUAL_ADJUST'
        AND aro."status"::text IN ('CONFIRMED', 'SETTLED')
        AND aro."created_at" >= ${dashboardRequest.start}
        AND aro."created_at" < ${dashboardRequest.end}
    `,
    prisma.$queryRaw<AgentDashboardSeriesRow[]>`
      SELECT
        ${orderBucket} AS period,
        COALESCE(SUM(aro."credits"), 0) AS credits,
        COUNT(aro."id") AS count,
        COALESCE(SUM(aro."amount_cents"), 0) AS amount_cents
      FROM "agent_reconciliation_orders" aro
      WHERE aro."agent_id" IN (${scopedIdsSql})
        AND aro."agent_id" <> ${agent.id}
        AND aro."related_type" = 'AGENT_TEAM_CREDIT_GRANT'
        AND aro."related_id" = ${agent.id}
        AND aro."type"::text = 'MANUAL_ADJUST'
        AND aro."status"::text IN ('CONFIRMED', 'SETTLED')
        AND aro."created_at" >= ${dashboardRequest.start}
        AND aro."created_at" < ${dashboardRequest.end}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<AgentDashboardBreakdownRow[]>`
      WITH agent_base AS (
        SELECT
          a."id" AS agent_id,
          a."name" AS agent_name,
          au."nickname" AS owner_name,
          au."phone" AS owner_phone,
          COUNT(DISTINCT cu."id") AS customer_count,
          COALESCE(SUM(COALESCE(w."balance", 0)), 0) AS wallet_balance,
          COALESCE(MAX(aca."available_credits"), 0) AS available_credits,
          COALESCE(MAX(aca."frozen_credits"), 0) AS frozen_credits,
          COALESCE(MAX(aca."used_credits"), 0) AS used_credits,
          COALESCE(MAX(aca."receivable_credits"), 0) AS receivable_credits
        FROM "agents" a
        JOIN "users" au ON au."id" = a."user_id"
        LEFT JOIN "users" cu ON cu."agent_id" = a."id"
        LEFT JOIN "wallets" w ON w."user_id" = cu."id"
        LEFT JOIN "agent_credit_accounts" aca ON aca."agent_id" = a."id"
        WHERE a."id" IN (${visibleIdsSql})
        GROUP BY a."id", a."name", au."nickname", au."phone"
      ),
      recharge_logs AS (
        SELECT
          u."agent_id" AS agent_id,
          wl."id",
          wl."amount",
          ro."id" AS order_id,
          ro."status" AS order_status,
          ro."amount_cents"
        FROM "wallet_logs" wl
        JOIN "users" u ON u."id" = wl."user_id"
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE u."agent_id" IN (${visibleIdsSql})
          AND wl."created_at" >= ${dashboardRequest.start}
          AND wl."created_at" < ${dashboardRequest.end}
          AND wl."amount" > 0
          AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
      ),
      recharge_paid_orders AS (
        SELECT
          agent_id,
          COALESCE(SUM(amount_cents), 0) AS recharge_amount_cents
        FROM (
          SELECT DISTINCT agent_id, order_id, amount_cents
          FROM recharge_logs
          WHERE order_id IS NOT NULL
            AND order_status::text = 'PAID'
            AND amount_cents > 0
        ) distinct_paid_orders
        GROUP BY agent_id
      ),
      recharges AS (
        SELECT
          rl.agent_id,
          COALESCE(SUM(rl."amount"), 0) AS recharge_credits,
          COUNT(rl."id") AS recharge_count,
          COALESCE(MAX(recharge_paid_orders.recharge_amount_cents), 0) AS recharge_amount_cents,
          COALESCE(SUM(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN rl."amount" ELSE 0 END), 0) AS paid_recharge_credits,
          COUNT(CASE WHEN rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0 THEN 1 END) AS paid_recharge_count,
          COALESCE(SUM(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN rl."amount" ELSE 0 END), 0) AS credit_only_recharge_credits,
          COUNT(CASE WHEN NOT (rl.order_id IS NOT NULL AND rl.order_status::text = 'PAID' AND rl.amount_cents > 0) THEN 1 END) AS credit_only_recharge_count
        FROM recharge_logs rl
        LEFT JOIN recharge_paid_orders ON recharge_paid_orders.agent_id = rl.agent_id
        GROUP BY rl.agent_id
      ),
      consumes AS (
        SELECT
          u."agent_id" AS agent_id,
          COALESCE(SUM(-wl."amount"), 0) AS consume_credits,
          COUNT(wl."id") AS consume_count
        FROM "wallet_logs" wl
        JOIN "users" u ON u."id" = wl."user_id"
        WHERE u."agent_id" IN (${visibleIdsSql})
          AND wl."created_at" >= ${dashboardRequest.start}
          AND wl."created_at" < ${dashboardRequest.end}
          AND wl."type"::text = 'CONSUME'
          AND wl."amount" < 0
        GROUP BY u."agent_id"
      ),
      quotas AS (
        SELECT
          aro."agent_id" AS agent_id,
          COALESCE(SUM(aro."credits"), 0) AS agent_quota_credits,
          COUNT(aro."id") AS agent_quota_count
        FROM "agent_reconciliation_orders" aro
        WHERE aro."agent_id" IN (${visibleIdsSql})
          AND aro."agent_id" <> ${agent.id}
          AND aro."related_type" = 'AGENT_TEAM_CREDIT_GRANT'
          AND aro."related_id" = ${agent.id}
          AND aro."type"::text = 'MANUAL_ADJUST'
          AND aro."status"::text IN ('CONFIRMED', 'SETTLED')
          AND aro."created_at" >= ${dashboardRequest.start}
          AND aro."created_at" < ${dashboardRequest.end}
        GROUP BY aro."agent_id"
      )
      SELECT
        agent_base.*,
        COALESCE(recharges.recharge_credits, 0) AS recharge_credits,
        COALESCE(recharges.recharge_count, 0) AS recharge_count,
        COALESCE(recharges.recharge_amount_cents, 0) AS recharge_amount_cents,
        COALESCE(recharges.paid_recharge_credits, 0) AS paid_recharge_credits,
        COALESCE(recharges.paid_recharge_count, 0) AS paid_recharge_count,
        COALESCE(recharges.credit_only_recharge_credits, 0) AS credit_only_recharge_credits,
        COALESCE(recharges.credit_only_recharge_count, 0) AS credit_only_recharge_count,
        COALESCE(consumes.consume_credits, 0) AS consume_credits,
        COALESCE(consumes.consume_count, 0) AS consume_count,
        COALESCE(quotas.agent_quota_credits, 0) AS agent_quota_credits,
        COALESCE(quotas.agent_quota_count, 0) AS agent_quota_count
      FROM agent_base
      LEFT JOIN recharges ON recharges.agent_id = agent_base.agent_id
      LEFT JOIN consumes ON consumes.agent_id = agent_base.agent_id
      LEFT JOIN quotas ON quotas.agent_id = agent_base.agent_id
      ORDER BY (
        COALESCE(recharges.recharge_credits, 0)
        + COALESCE(consumes.consume_credits, 0)
        + COALESCE(quotas.agent_quota_credits, 0)
        + agent_base.wallet_balance
      ) DESC, agent_base.agent_name ASC
    `,
    prisma.modelUsage.groupBy({ by: ['status'], where: { user: { agentId: { in: scopedAgentIds } } }, _count: { id: true } }),
    prisma.generationTask.groupBy({ by: ['status'], where: { user: { agentId: { in: scopedAgentIds } } }, _count: { id: true } }),
    prisma.accountRedemption.count({ where: { agentId: { in: scopedAgentIds } } }),
    prisma.commissionLog.aggregate({ where: { agentId: { in: scopedAgentIds } }, _sum: { amount: true } }),
  ]);

  const scopeSummary = scopeSummaryRows[0] || { credits: 0, count: 0, amount_cents: 0, paid_credits: 0, paid_count: 0, credit_only_credits: 0, credit_only_count: 0, wallet_balance: 0 };
  const consumeCredits = consumeRows.reduce((sum, row) => sum + numberOf(row.credits), 0);
  const consumeCount = consumeRows.reduce((sum, row) => sum + numberOf(row.count), 0);
  const quotaSummary = quotaSummaryRows[0] || { credits: 0, count: 0, amount_cents: 0 };
  const rechargeCredits = numberOf(scopeSummary.credits);
  const agentQuotaCredits = numberOf(quotaSummary.credits);
  const usageSummary = Object.fromEntries(usageStatus.map(item => [item.status, item._count.id]));
  const taskSummary = Object.fromEntries(taskStatus.map(item => [item.status, item._count.id]));
  const successTaskCount = taskSummary.SUCCESS || 0;
  const failedTaskCount = (taskSummary.FAILED || 0) + (taskSummary.TIMEOUT || 0);
  const pendingTaskCount = (taskSummary.CREATED || 0) + (taskSummary.PENDING || 0) + (taskSummary.RUNNING || 0) + (taskSummary.MANUAL_REVIEW || 0);
  const agentBreakdown = mapAgentDashboardBreakdown(agentBreakdownRows);
  const selectedAgent = selectedAgentId ? agentBreakdown.find(item => item.agentId === selectedAgentId) : null;
  const account = freshAgent?.creditAccount || {
    id: '',
    agentId: agent.id,
    availableCredits: 0,
    frozenCredits: 0,
    usedCredits: 0,
    creditLimit: 0,
    receivableCredits: 0,
    createdAt: null,
    updatedAt: null,
  };

  ok(res, {
    agent: freshAgent || agent,
    team: {
      visibleAgentIds,
      scopedAgentIds,
      selectedAgentId: selectedAgentId || 'all',
      selectedAgentName: selectedAgent?.agentName || '',
      visibleAgentCount: visibleAgentIds.length,
      customerCount: agentBreakdown.reduce((sum, item) => sum + item.customerCount, 0),
      walletBalance: agentBreakdown.reduce((sum, item) => sum + item.walletBalance, 0),
      account,
    },
    users: agentBreakdown.reduce((sum, item) => sum + item.customerCount, 0),
    agents: visibleAgentIds.length,
    usages: (usageSummary.SUCCESS || 0) + successTaskCount,
    failedUsages: (usageSummary.FAILED || 0) + failedTaskCount,
    pendingUsages: (usageSummary.PENDING || 0) + pendingTaskCount,
    redemptions,
    commissionAmount: numberOf(commissions._sum.amount),
    chargedCredits: consumeCredits,
    rechargeCredits,
    rechargeAmountCents: numberOf(scopeSummary.amount_cents),
    creditSummary: {
      rechargeCredits,
      rechargeCount: numberOf(scopeSummary.count),
      rechargeAmountCents: numberOf(scopeSummary.amount_cents),
      paidRechargeCredits: numberOf(scopeSummary.paid_credits),
      paidRechargeCount: numberOf(scopeSummary.paid_count),
      creditOnlyRechargeCredits: numberOf(scopeSummary.credit_only_credits),
      creditOnlyRechargeCount: numberOf(scopeSummary.credit_only_count),
      consumeCredits,
      consumeCount,
      agentQuotaCredits,
      agentQuotaCreditsRaw: agentQuotaCredits,
      agentQuotaCount: numberOf(quotaSummary.count),
      agentQuotaCountRaw: numberOf(quotaSummary.count),
      superAdminSelfRechargeCredits: 0,
      superAdminSelfRechargeCount: 0,
      superAdminSelfRechargeAmountCents: 0,
      walletBalance: numberOf(scopeSummary.wallet_balance),
      netCredits: rechargeCredits + agentQuotaCredits - consumeCredits,
    },
    series: mergeAgentDashboardSeries({ rechargeRows, consumeRows, quotaRows }),
    agentBreakdown,
    filters: {
      agentId: selectedAgentId || 'all',
      excludeSuperAdminSelfRecharge: true,
      excludeAgentQuota: false,
    },
    range: {
      granularity: dashboardRequest.granularity,
      start: dashboardRequest.start.toISOString(),
      end: dashboardRequest.end.toISOString(),
      timezone: 'Asia/Shanghai',
    },
  });
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
