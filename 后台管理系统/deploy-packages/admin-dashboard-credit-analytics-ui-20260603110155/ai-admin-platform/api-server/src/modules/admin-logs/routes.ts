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
    excludeSuperAdminSelfRecharge: boolQuery(query.excludeSuperAdminSelfRecharge, true),
    excludeAgentQuota: boolQuery(query.excludeAgentQuota, false),
  };
}

function rechargeFilterSql(start: Date, end: Date, excludeSuperAdminSelfRecharge: boolean) {
  return Prisma.sql`
    wl."created_at" >= ${start}
    AND wl."created_at" < ${end}
    AND wl."amount" > 0
    AND wl."type"::text IN ('RECHARGE', 'ADMIN_ADD')
    ${excludeSuperAdminSelfRecharge ? Prisma.sql`
      AND NOT (
        wl."type"::text = 'ADMIN_ADD'
        AND wl."related_id" = wl."user_id"
        AND u."role"::text = 'SUPER_ADMIN'
        AND COALESCE(wl."related_type", '') IN ('ADMIN_DIRECT_RECHARGE', 'ADMIN_ADJUST', 'ADMIN_SET_BALANCE')
      )
    ` : Prisma.empty}
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
    excludeSuperAdminSelfRecharge,
    excludeAgentQuota,
  } = dashboardRequest;
  const walletBucket = walletPeriodBucketSql(granularity);
  const ledgerBucket = ledgerPeriodBucketSql(granularity);
  const [users, agents, usageStatus, taskStatus, usageTotals, taskTotals, redemptions, commissions, rechargeSummaryRows, consumeSummaryRows, quotaSummaryRows, rechargeRows, consumeRows, quotaRows] = await Promise.all([
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
      WHERE ${rechargeFilterSql(start, end, excludeSuperAdminSelfRecharge)}
    `,
    prisma.$queryRaw<DashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      WHERE wl."created_at" >= ${start}
        AND wl."created_at" < ${end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
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
      WHERE ${rechargeFilterSql(start, end, excludeSuperAdminSelfRecharge)}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DashboardSeriesRow[]>`
      SELECT
        ${walletBucket} AS period,
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      WHERE wl."created_at" >= ${start}
        AND wl."created_at" < ${end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
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
      GROUP BY 1
      ORDER BY 1
    `,
  ]);
  const usageSummary = Object.fromEntries(usageStatus.map(item => [item.status, item._count.id]));
  const taskSummary = Object.fromEntries(taskStatus.map(item => [item.status, item._count.id]));
  const rechargeSummary = rechargeSummaryRows[0] || { credits: 0, count: 0, amount_cents: 0 };
  const consumeSummary = consumeSummaryRows[0] || { credits: 0, count: 0 };
  const quotaSummary = quotaSummaryRows[0] || { credits: 0, count: 0 };
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
    filters: {
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
