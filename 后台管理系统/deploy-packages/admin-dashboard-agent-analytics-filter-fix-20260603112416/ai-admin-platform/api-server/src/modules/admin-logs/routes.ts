import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';

const router = Router();

type DashboardGranularity = 'day' | 'month';

type DashboardAggregateRow = {
  credits: bigint | number | null;
  count: bigint | number | null;
  amount_cents?: bigint | number | null;
};

type DashboardSeriesRow = {
  period: string;
  credits: bigint | number | null;
  count: bigint | number | null;
  amount_cents?: bigint | number | null;
};

type DashboardAgentBreakdownRow = {
  agent_id: string;
  agent_name: string;
  owner_name: string | null;
  owner_phone: string | null;
  customer_count: bigint | number | null;
  wallet_balance: bigint | number | null;
  recharge_credits: bigint | number | null;
  recharge_count: bigint | number | null;
  recharge_amount_cents: bigint | number | null;
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

function boolQuery(value: unknown, fallback: boolean) {
  const raw = firstQueryValue(value).trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
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

function getDashboardRequest(query: Record<string, unknown>) {
  const rawGranularity = firstQueryValue(query.granularity);
  const granularity: DashboardGranularity = rawGranularity === 'month' ? 'month' : 'day';
  const agentId = firstQueryValue(query.agentId).trim();
  if (agentId.length > 128) fail(400, '代理筛选参数异常', 'DASHBOARD_AGENT_FILTER_INVALID');
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setHours(0, 0, 0, 0);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultStart.getDate() - 30);
  const start = dateQuery(query.start, defaultStart);
  const end = dateQuery(query.end, defaultEnd);
  if (end <= start) fail(400, '统计结束时间必须晚于开始时间', 'DASHBOARD_RANGE_INVALID');
  const maxRangeDays = 370;
  if ((end.getTime() - start.getTime()) / 86400000 > maxRangeDays + 1) {
    fail(400, '统计区间最多支持 370 天', 'DASHBOARD_RANGE_TOO_LARGE');
  }
  return {
    granularity,
    start,
    end,
    agentId,
    excludeSuperAdminSelfRecharge: boolQuery(query.excludeSuperAdminSelfRecharge, true),
    excludeAgentQuota: boolQuery(query.excludeAgentQuota, false),
  };
}

function walletAgentFilterSql(agentId: string) {
  if (!agentId || agentId === 'all') return Prisma.empty;
  if (agentId === '__unassigned') return Prisma.sql`AND u."agent_id" IS NULL`;
  return Prisma.sql`AND u."agent_id" = ${agentId}`;
}

function ledgerAgentFilterSql(agentId: string) {
  if (!agentId || agentId === 'all') return Prisma.empty;
  if (agentId === '__unassigned') return Prisma.sql`AND 1 = 0`;
  return Prisma.sql`AND acl."agent_id" = ${agentId}`;
}

function superAdminSelfRechargeSql() {
  return Prisma.sql`
    wl."amount" > 0
    AND u."role"::text = 'SUPER_ADMIN'
    AND (
      (
        wl."type"::text = 'ADMIN_ADD'
        AND COALESCE(wl."related_type", '') IN ('ADMIN_DIRECT_RECHARGE', 'ADMIN_ADJUST', 'ADMIN_SET_BALANCE')
      )
      OR (
        wl."type"::text = 'RECHARGE'
        AND COALESCE(ro."channel"::text, '') IN ('ADMIN_MANUAL', 'MOCK')
      )
    )
  `;
}

function rechargeFilterSql(start: Date, end: Date, excludeSuperAdminSelfRecharge: boolean, agentId = '') {
  return Prisma.sql`
    wl."created_at" >= ${start}
    AND wl."created_at" < ${end}
    AND wl."amount" > 0
    AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
    ${excludeSuperAdminSelfRecharge ? Prisma.sql`
      AND NOT (${superAdminSelfRechargeSql()})
    ` : Prisma.empty}
    ${walletAgentFilterSql(agentId)}
  `;
}

function periodFormat(granularity: DashboardGranularity) {
  return granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
}

function walletPeriodBucketSql(granularity: DashboardGranularity) {
  return granularity === 'month'
    ? Prisma.sql`to_char(date_trunc('month', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${periodFormat(granularity)})`
    : Prisma.sql`to_char(date_trunc('day', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${periodFormat(granularity)})`;
}

function ledgerPeriodBucketSql(granularity: DashboardGranularity) {
  return granularity === 'month'
    ? Prisma.sql`to_char(date_trunc('month', acl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${periodFormat(granularity)})`
    : Prisma.sql`to_char(date_trunc('day', acl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${periodFormat(granularity)})`;
}

function mergeSeries(input: {
  rechargeRows: DashboardSeriesRow[];
  consumeRows: DashboardSeriesRow[];
  quotaRows: DashboardSeriesRow[];
  excludeAgentQuota: boolean;
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
    };
    byPeriod.set(period, row);
    return row;
  };

  input.rechargeRows.forEach(item => {
    const row = ensure(item.period);
    row.rechargeCredits = numberOf(item.credits);
    row.rechargeCount = numberOf(item.count);
    row.rechargeAmountCents = numberOf(item.amount_cents);
  });
  input.consumeRows.forEach(item => {
    const row = ensure(item.period);
    row.consumeCredits = numberOf(item.credits);
    row.consumeCount = numberOf(item.count);
  });
  if (!input.excludeAgentQuota) {
    input.quotaRows.forEach(item => {
      const row = ensure(item.period);
      row.agentQuotaCredits = numberOf(item.credits);
      row.agentQuotaCount = numberOf(item.count);
    });
  }

  return Array.from(byPeriod.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(row => ({
      ...row,
      netCredits: row.rechargeCredits + row.agentQuotaCredits - row.consumeCredits,
    }));
}

function mapAgentBreakdown(rows: DashboardAgentBreakdownRow[], excludeAgentQuota: boolean) {
  return rows.map(row => {
    const agentQuotaCreditsRaw = numberOf(row.agent_quota_credits);
    const agentQuotaCredits = excludeAgentQuota ? 0 : agentQuotaCreditsRaw;
    const rechargeCredits = numberOf(row.recharge_credits);
    const consumeCredits = numberOf(row.consume_credits);
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
      consumeCredits,
      consumeCount: numberOf(row.consume_count),
      agentQuotaCredits,
      agentQuotaCreditsRaw,
      agentQuotaCount: excludeAgentQuota ? 0 : numberOf(row.agent_quota_count),
      agentQuotaCountRaw: numberOf(row.agent_quota_count),
      availableCredits: numberOf(row.available_credits),
      frozenCredits: numberOf(row.frozen_credits),
      usedCredits: numberOf(row.used_credits),
      receivableCredits: numberOf(row.receivable_credits),
      netCredits: rechargeCredits + agentQuotaCredits - consumeCredits,
    };
  });
}

router.get('/admin-logs', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.adminLog.findMany({ include: { adminUser: { select: { id: true, nickname: true, phone: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, { items });
}));

router.get('/dashboard', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const dashboardRequest = getDashboardRequest(req.query as Record<string, unknown>);
  const {
    granularity,
    start,
    end,
    agentId,
    excludeSuperAdminSelfRecharge,
    excludeAgentQuota,
  } = dashboardRequest;
  const walletBucket = walletPeriodBucketSql(granularity);
  const ledgerBucket = ledgerPeriodBucketSql(granularity);
  const [users, agents, usageStatus, taskStatus, usageTotals, taskTotals, redemptions, commissions, rechargeSummaryRows, consumeSummaryRows, quotaSummaryRows, superAdminSelfRechargeRows, rechargeRows, consumeRows, quotaRows, agentBreakdownRows] = await Promise.all([
    prisma.user.count(),
    prisma.agent.count(),
    prisma.modelUsage.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.generationTask.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.modelUsage.aggregate({ where: { status: 'SUCCESS' }, _sum: { chargedCredits: true, costAmount: true, costUsd: true } }),
    prisma.generationTask.aggregate({ where: { status: 'SUCCESS' }, _sum: { chargedCredits: true, costAmount: true, costUsd: true } }),
    prisma.accountRedemption.count(),
    prisma.commissionLog.aggregate({ _sum: { amount: true } }),
    prisma.$queryRaw<DashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count,
        COALESCE(SUM(COALESCE(ro."amount_cents", 0)), 0) AS amount_cents
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      LEFT JOIN "recharge_orders" ro
        ON wl."related_type" = 'RECHARGE_ORDER'
        AND wl."related_id" = ro."id"
      WHERE ${rechargeFilterSql(start, end, excludeSuperAdminSelfRecharge, agentId)}
    `,
    prisma.$queryRaw<DashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      WHERE wl."created_at" >= ${start}
        AND wl."created_at" < ${end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
        ${walletAgentFilterSql(agentId)}
    `,
    prisma.$queryRaw<DashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(acl."amount"), 0) AS credits,
        COUNT(acl."id") AS count
      FROM "agent_credit_ledgers" acl
      WHERE acl."created_at" >= ${start}
        AND acl."created_at" < ${end}
        AND acl."type"::text = 'ADMIN_GRANT'
        AND acl."amount" > 0
        ${ledgerAgentFilterSql(agentId)}
    `,
    prisma.$queryRaw<DashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count,
        COALESCE(SUM(COALESCE(ro."amount_cents", 0)), 0) AS amount_cents
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      LEFT JOIN "recharge_orders" ro
        ON wl."related_type" = 'RECHARGE_ORDER'
        AND wl."related_id" = ro."id"
      WHERE wl."created_at" >= ${start}
        AND wl."created_at" < ${end}
        AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
        AND ${superAdminSelfRechargeSql()}
        ${walletAgentFilterSql(agentId)}
    `,
    prisma.$queryRaw<DashboardSeriesRow[]>`
      SELECT
        ${walletBucket} AS period,
        COALESCE(SUM(wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count,
        COALESCE(SUM(COALESCE(ro."amount_cents", 0)), 0) AS amount_cents
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      LEFT JOIN "recharge_orders" ro
        ON wl."related_type" = 'RECHARGE_ORDER'
        AND wl."related_id" = ro."id"
      WHERE ${rechargeFilterSql(start, end, excludeSuperAdminSelfRecharge, agentId)}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DashboardSeriesRow[]>`
      SELECT
        ${walletBucket} AS period,
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      JOIN "users" u ON u."id" = wl."user_id"
      WHERE wl."created_at" >= ${start}
        AND wl."created_at" < ${end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
        ${walletAgentFilterSql(agentId)}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DashboardSeriesRow[]>`
      SELECT
        ${ledgerBucket} AS period,
        COALESCE(SUM(acl."amount"), 0) AS credits,
        COUNT(acl."id") AS count
      FROM "agent_credit_ledgers" acl
      WHERE acl."created_at" >= ${start}
        AND acl."created_at" < ${end}
        AND acl."type"::text = 'ADMIN_GRANT'
        AND acl."amount" > 0
        ${ledgerAgentFilterSql(agentId)}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DashboardAgentBreakdownRow[]>`
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
        GROUP BY a."id", a."name", au."nickname", au."phone"
      ),
      recharges AS (
        SELECT
          u."agent_id" AS agent_id,
          COALESCE(SUM(wl."amount"), 0) AS recharge_credits,
          COUNT(wl."id") AS recharge_count,
          COALESCE(SUM(COALESCE(ro."amount_cents", 0)), 0) AS recharge_amount_cents
        FROM "wallet_logs" wl
        JOIN "users" u ON u."id" = wl."user_id"
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE ${rechargeFilterSql(start, end, excludeSuperAdminSelfRecharge)}
          AND u."agent_id" IS NOT NULL
        GROUP BY u."agent_id"
      ),
      consumes AS (
        SELECT
          u."agent_id" AS agent_id,
          COALESCE(SUM(-wl."amount"), 0) AS consume_credits,
          COUNT(wl."id") AS consume_count
        FROM "wallet_logs" wl
        JOIN "users" u ON u."id" = wl."user_id"
        WHERE wl."created_at" >= ${start}
          AND wl."created_at" < ${end}
          AND wl."type"::text = 'CONSUME'
          AND wl."amount" < 0
          AND u."agent_id" IS NOT NULL
        GROUP BY u."agent_id"
      ),
      quotas AS (
        SELECT
          acl."agent_id" AS agent_id,
          COALESCE(SUM(acl."amount"), 0) AS agent_quota_credits,
          COUNT(acl."id") AS agent_quota_count
        FROM "agent_credit_ledgers" acl
        WHERE acl."created_at" >= ${start}
          AND acl."created_at" < ${end}
          AND acl."type"::text = 'ADMIN_GRANT'
          AND acl."amount" > 0
        GROUP BY acl."agent_id"
      )
      SELECT
        agent_base.*,
        COALESCE(recharges.recharge_credits, 0) AS recharge_credits,
        COALESCE(recharges.recharge_count, 0) AS recharge_count,
        COALESCE(recharges.recharge_amount_cents, 0) AS recharge_amount_cents,
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
      ) DESC, agent_base.agent_name ASC
      LIMIT 300
    `,
  ]);
  const usageSummary = Object.fromEntries(usageStatus.map(item => [item.status, item._count.id]));
  const taskSummary = Object.fromEntries(taskStatus.map(item => [item.status, item._count.id]));
  const rechargeSummary = rechargeSummaryRows[0] || { credits: 0, count: 0, amount_cents: 0 };
  const consumeSummary = consumeSummaryRows[0] || { credits: 0, count: 0 };
  const quotaSummary = quotaSummaryRows[0] || { credits: 0, count: 0 };
  const superAdminSelfRechargeSummary = superAdminSelfRechargeRows[0] || { credits: 0, count: 0, amount_cents: 0 };
  const rechargeCredits = numberOf(rechargeSummary.credits);
  const consumeCredits = numberOf(consumeSummary.credits);
  const agentQuotaCreditsRaw = numberOf(quotaSummary.credits);
  const agentQuotaCredits = excludeAgentQuota ? 0 : agentQuotaCreditsRaw;
  const creditSummary = {
    rechargeCredits,
    rechargeCount: numberOf(rechargeSummary.count),
    rechargeAmountCents: numberOf(rechargeSummary.amount_cents),
    consumeCredits,
    consumeCount: numberOf(consumeSummary.count),
    agentQuotaCredits,
    agentQuotaCreditsRaw,
    agentQuotaCount: excludeAgentQuota ? 0 : numberOf(quotaSummary.count),
    agentQuotaCountRaw: numberOf(quotaSummary.count),
    superAdminSelfRechargeCredits: numberOf(superAdminSelfRechargeSummary.credits),
    superAdminSelfRechargeCount: numberOf(superAdminSelfRechargeSummary.count),
    superAdminSelfRechargeAmountCents: numberOf(superAdminSelfRechargeSummary.amount_cents),
    netCredits: rechargeCredits + agentQuotaCredits - consumeCredits,
  };
  const successTaskCount = taskSummary.SUCCESS || 0;
  const failedTaskCount = (taskSummary.FAILED || 0) + (taskSummary.TIMEOUT || 0);
  const pendingTaskCount = (taskSummary.CREATED || 0) + (taskSummary.PENDING || 0) + (taskSummary.RUNNING || 0) + (taskSummary.MANUAL_REVIEW || 0);
  const chargedCredits = numberOf(usageTotals._sum.chargedCredits) + numberOf(taskTotals._sum.chargedCredits);
  const usageCostAmount = numberOf(usageTotals._sum.costAmount) + numberOf(taskTotals._sum.costAmount);
  const usageCostUsd = numberOf(usageTotals._sum.costUsd) + numberOf(taskTotals._sum.costUsd);
  ok(res, {
    users,
    agents,
    usages: (usageSummary.SUCCESS || 0) + successTaskCount,
    failedUsages: (usageSummary.FAILED || 0) + failedTaskCount,
    pendingUsages: (usageSummary.PENDING || 0) + pendingTaskCount,
    redemptions,
    chargedCredits,
    usageCostAmount,
    usageCostUsd,
    rechargeCredits,
    rechargeAmountCents: creditSummary.rechargeAmountCents,
    commissionAmount: numberOf(commissions._sum.amount),
    creditSummary,
    series: mergeSeries({ rechargeRows, consumeRows, quotaRows, excludeAgentQuota }),
    agentBreakdown: mapAgentBreakdown(agentBreakdownRows, excludeAgentQuota),
    filters: {
      agentId,
      excludeSuperAdminSelfRecharge,
      excludeAgentQuota,
    },
    range: {
      granularity,
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: 'Asia/Shanghai',
    },
  });
}));

export default router;
