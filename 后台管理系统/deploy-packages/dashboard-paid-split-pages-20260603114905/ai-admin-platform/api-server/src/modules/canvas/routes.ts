import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { buildCreditDiscountBenefit } from '../../billing.js';

const router = Router();

const accountUsageModelInclude = {
  model: { select: { id: true, displayName: true, name: true, type: true } },
} as const;

const accountTaskModelInclude = {
  model: { select: { id: true, displayName: true, name: true, type: true } },
  provider: { select: { id: true, providerKey: true, name: true } },
} as const;

type AccountModelUsage = Prisma.ModelUsageGetPayload<{ include: typeof accountUsageModelInclude }>;
type AccountGenerationTask = Prisma.GenerationTaskGetPayload<{ include: typeof accountTaskModelInclude }>;

type UserDashboardGranularity = 'day' | 'month';

type UserDashboardAggregateRow = {
  credits: bigint | number | null;
  count: bigint | number | null;
  amount_cents?: bigint | number | null;
  paid_credits?: bigint | number | null;
  paid_count?: bigint | number | null;
  credit_only_credits?: bigint | number | null;
  credit_only_count?: bigint | number | null;
};

type UserDashboardSeriesRow = UserDashboardAggregateRow & {
  period: string;
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

function getUserDashboardRequest(query: Record<string, unknown>) {
  const rawGranularity = firstQueryValue(query.granularity);
  const granularity: UserDashboardGranularity = rawGranularity === 'month' ? 'month' : 'day';
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setHours(0, 0, 0, 0);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultStart.getDate() - 30);
  const start = dateQuery(query.start, defaultStart);
  const end = dateQuery(query.end, defaultEnd);
  if (end <= start) fail(400, '统计结束时间必须晚于开始时间', 'USER_DASHBOARD_RANGE_INVALID');
  if ((end.getTime() - start.getTime()) / 86400000 > 370 + 1) {
    fail(400, '统计区间最多支持 370 天', 'USER_DASHBOARD_RANGE_TOO_LARGE');
  }
  return { granularity, start, end };
}

function userPeriodFormat(granularity: UserDashboardGranularity) {
  return granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
}

function userWalletPeriodBucketSql(granularity: UserDashboardGranularity) {
  return granularity === 'month'
    ? Prisma.sql`to_char(date_trunc('month', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${userPeriodFormat(granularity)})`
    : Prisma.sql`to_char(date_trunc('day', wl."created_at" AT TIME ZONE 'Asia/Shanghai'), ${userPeriodFormat(granularity)})`;
}

function mergeUserDashboardSeries(input: { rechargeRows: UserDashboardSeriesRow[]; consumeRows: UserDashboardSeriesRow[] }) {
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
  return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period)).map(row => ({
    ...row,
    netCredits: row.rechargeCredits - row.consumeCredits,
  }));
}

router.get('/account/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      phone: true,
      email: true,
      nickname: true,
      role: true,
      status: true,
      agentId: true,
      wallet: true,
      memberships: { include: { plan: true }, orderBy: { expiredAt: 'desc' }, take: 1 },
    },
  });
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  ok(res, { user });
}));

router.get('/account/wallet', requireAuth, asyncHandler(async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
  ok(res, { wallet });
}));

router.get('/account/summary', requireAuth, asyncHandler(async (req, res) => {
  const now = new Date();
  const [user, wallet, membership, recentModelUsages, recentGenerationTasks, recentRecharges, recentWalletLogs] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, phone: true, email: true, nickname: true, role: true, status: true, agentId: true } }),
    prisma.wallet.findUnique({ where: { userId: req.user!.id } }),
    prisma.userMembership.findFirst({
      where: { userId: req.user!.id, expiredAt: { gt: now } },
      include: { plan: true },
      orderBy: { expiredAt: 'desc' },
    }),
    prisma.modelUsage.findMany({
      where: { userId: req.user!.id },
      include: accountUsageModelInclude,
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.generationTask.findMany({
      where: { userId: req.user!.id },
      include: accountTaskModelInclude,
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.rechargeOrder.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.walletLog.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  const recentUsages = mergeUsageRecords(recentModelUsages, recentGenerationTasks, 5);
  const pricingBenefit = buildCreditDiscountBenefit(membership);
  ok(res, { user, wallet, membership, pricingBenefit, recentUsages, recentRecharges, recentWalletLogs });
}));

router.get('/user/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const dashboardRequest = getUserDashboardRequest(req.query as Record<string, unknown>);
  const walletBucket = userWalletPeriodBucketSql(dashboardRequest.granularity);
  const [user, wallet, rechargeSummaryRows, consumeSummaryRows, rechargeRows, consumeRows, usageStatus, taskStatus] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, nickname: true, phone: true, email: true, role: true, status: true, agentId: true } }),
    prisma.wallet.findUnique({ where: { userId: req.user!.id } }),
    prisma.$queryRaw<UserDashboardAggregateRow[]>`
      WITH recharge_logs AS (
        SELECT
          wl."id",
          wl."amount",
          ro."id" AS order_id,
          ro."status" AS order_status,
          ro."amount_cents"
        FROM "wallet_logs" wl
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE wl."user_id" = ${req.user!.id}
          AND wl."created_at" >= ${dashboardRequest.start}
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
      )
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
    `,
    prisma.$queryRaw<UserDashboardAggregateRow[]>`
      SELECT
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      WHERE wl."user_id" = ${req.user!.id}
        AND wl."created_at" >= ${dashboardRequest.start}
        AND wl."created_at" < ${dashboardRequest.end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
    `,
    prisma.$queryRaw<UserDashboardSeriesRow[]>`
      WITH recharge_logs AS (
        SELECT
          ${walletBucket} AS period,
          wl."id",
          wl."amount",
          ro."id" AS order_id,
          ro."status" AS order_status,
          ro."amount_cents"
        FROM "wallet_logs" wl
        LEFT JOIN "recharge_orders" ro
          ON wl."related_type" = 'RECHARGE_ORDER'
          AND wl."related_id" = ro."id"
        WHERE wl."user_id" = ${req.user!.id}
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
    prisma.$queryRaw<UserDashboardSeriesRow[]>`
      SELECT
        ${walletBucket} AS period,
        COALESCE(SUM(-wl."amount"), 0) AS credits,
        COUNT(wl."id") AS count
      FROM "wallet_logs" wl
      WHERE wl."user_id" = ${req.user!.id}
        AND wl."created_at" >= ${dashboardRequest.start}
        AND wl."created_at" < ${dashboardRequest.end}
        AND wl."type"::text = 'CONSUME'
        AND wl."amount" < 0
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.modelUsage.groupBy({ by: ['status'], where: { userId: req.user!.id }, _count: { id: true } }),
    prisma.generationTask.groupBy({ by: ['status'], where: { userId: req.user!.id }, _count: { id: true } }),
  ]);
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  const rechargeSummary = rechargeSummaryRows[0] || { credits: 0, count: 0, amount_cents: 0, paid_credits: 0, paid_count: 0, credit_only_credits: 0, credit_only_count: 0 };
  const consumeSummary = consumeSummaryRows[0] || { credits: 0, count: 0 };
  const rechargeCredits = numberOf(rechargeSummary.credits);
  const consumeCredits = numberOf(consumeSummary.credits);
  const usageSummary = Object.fromEntries(usageStatus.map(item => [item.status, item._count.id]));
  const taskSummary = Object.fromEntries(taskStatus.map(item => [item.status, item._count.id]));
  const successTaskCount = taskSummary.SUCCESS || 0;
  const failedTaskCount = (taskSummary.FAILED || 0) + (taskSummary.TIMEOUT || 0);
  const pendingTaskCount = (taskSummary.CREATED || 0) + (taskSummary.PENDING || 0) + (taskSummary.RUNNING || 0) + (taskSummary.MANUAL_REVIEW || 0);
  const creditSummary = {
    rechargeCredits,
    rechargeCount: numberOf(rechargeSummary.count),
    rechargeAmountCents: numberOf(rechargeSummary.amount_cents),
    paidRechargeCredits: numberOf(rechargeSummary.paid_credits),
    paidRechargeCount: numberOf(rechargeSummary.paid_count),
    creditOnlyRechargeCredits: numberOf(rechargeSummary.credit_only_credits),
    creditOnlyRechargeCount: numberOf(rechargeSummary.credit_only_count),
    consumeCredits,
    consumeCount: numberOf(consumeSummary.count),
    agentQuotaCredits: 0,
    agentQuotaCreditsRaw: 0,
    agentQuotaCount: 0,
    agentQuotaCountRaw: 0,
    superAdminSelfRechargeCredits: 0,
    superAdminSelfRechargeCount: 0,
    superAdminSelfRechargeAmountCents: 0,
    walletBalance: wallet?.balance || 0,
    netCredits: rechargeCredits - consumeCredits,
  };
  ok(res, {
    user,
    users: 1,
    agents: 0,
    usages: (usageSummary.SUCCESS || 0) + successTaskCount,
    failedUsages: (usageSummary.FAILED || 0) + failedTaskCount,
    pendingUsages: (usageSummary.PENDING || 0) + pendingTaskCount,
    redemptions: 0,
    chargedCredits: consumeCredits,
    rechargeCredits,
    rechargeAmountCents: creditSummary.rechargeAmountCents,
    commissionAmount: 0,
    creditSummary,
    series: mergeUserDashboardSeries({ rechargeRows, consumeRows }),
    agentBreakdown: [],
    filters: {
      agentId: 'self',
      excludeSuperAdminSelfRecharge: true,
      excludeAgentQuota: true,
    },
    range: {
      granularity: dashboardRequest.granularity,
      start: dashboardRequest.start.toISOString(),
      end: dashboardRequest.end.toISOString(),
      timezone: 'Asia/Shanghai',
    },
  });
}));

router.get('/account/wallet/logs', requireAuth, asyncHandler(async (req, res) => {
  const items = await prisma.walletLog.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, { items });
}));

router.get('/account/usages', requireAuth, asyncHandler(async (req, res) => {
  const [modelUsages, generationTasks] = await Promise.all([
    prisma.modelUsage.findMany({
      where: { userId: req.user!.id },
      include: accountUsageModelInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.generationTask.findMany({
      where: { userId: req.user!.id },
      include: accountTaskModelInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  const items = mergeUsageRecords(modelUsages, generationTasks, 200);
  ok(res, { items });
}));

const workflowSchema = z.object({
  name: z.string().min(1),
  data: z.unknown(),
});

router.get('/canvas/workflows', requireAuth, asyncHandler(async (req, res) => {
  const items = await prisma.canvasWorkflow.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' } });
  ok(res, { items });
}));

router.post('/canvas/workflows', requireAuth, asyncHandler(async (req, res) => {
  const body = workflowSchema.parse(req.body);
  const item = await prisma.canvasWorkflow.create({ data: { userId: req.user!.id, name: body.name, dataJson: body.data as Prisma.InputJsonValue } });
  ok(res, { item });
}));

router.get('/canvas/workflows/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const item = await prisma.canvasWorkflow.findFirst({ where: { id, userId: req.user!.id } });
  if (!item) fail(404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
  ok(res, { item });
}));

router.post('/canvas/workflows/:id/share', requireAuth, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const item = await prisma.canvasWorkflow.findFirst({ where: { id, userId: req.user!.id } });
  if (!item) fail(404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
  const data = workflowJsonObject(item.dataJson);
  const existing = workflowJsonObject(data.__share);
  const token = typeof existing.token === 'string' && existing.token.length >= 20
    ? existing.token
    : randomBytes(18).toString('base64url');
  const sharedAt = typeof existing.sharedAt === 'string' ? existing.sharedAt : new Date().toISOString();
  const nextData = {
    ...data,
    __share: {
      token,
      sharedAt,
      ownerUserId: req.user!.id,
    },
  };
  const updated = await prisma.canvasWorkflow.update({
    where: { id },
    data: { dataJson: nextData as Prisma.InputJsonValue },
  });
  ok(res, { item: updated, share: { id, token, sharedAt } });
}));

router.get('/canvas/workflows/shared/:id/:token', asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const token = routeParam(req.params.token);
  const item = await prisma.canvasWorkflow.findUnique({ where: { id } });
  if (!item) fail(404, '分享工作流不存在', 'WORKFLOW_SHARE_NOT_FOUND');
  const data = workflowJsonObject(item.dataJson);
  const share = workflowJsonObject(data.__share);
  if (!token || share.token !== token) fail(404, '分享链接无效', 'WORKFLOW_SHARE_INVALID');
  const cleanData = { ...data };
  delete cleanData.__share;
  ok(res, {
    item: {
      id: item.id,
      name: item.name,
      dataJson: cleanData,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      sharedAt: share.sharedAt || null,
    },
  });
}));

router.put('/canvas/workflows/:id', requireAuth, asyncHandler(async (req, res) => {
  const body = workflowSchema.partial().parse(req.body);
  const id = routeParam(req.params.id);
  const exists = await prisma.canvasWorkflow.findFirst({ where: { id, userId: req.user!.id } });
  if (!exists) fail(404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
  const item = await prisma.canvasWorkflow.update({
    where: { id },
    data: { ...(body.name ? { name: body.name } : {}), ...(body.data !== undefined ? { dataJson: body.data as Prisma.InputJsonValue } : {}) },
  });
  ok(res, { item });
}));

router.delete('/canvas/workflows/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const exists = await prisma.canvasWorkflow.findFirst({ where: { id, userId: req.user!.id } });
  if (!exists) fail(404, '工作流不存在', 'WORKFLOW_NOT_FOUND');
  await prisma.canvasWorkflow.delete({ where: { id } });
  ok(res);
}));

function mergeUsageRecords(modelUsages: AccountModelUsage[], generationTasks: AccountGenerationTask[], limit: number) {
  return [
    ...modelUsages.map(normalizeModelUsage),
    ...generationTasks.map(normalizeGenerationTask),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

function normalizeModelUsage(item: AccountModelUsage) {
  return {
    source: 'model_usage',
    id: item.id,
    model: item.model,
    modelType: item.modelType,
    type: item.modelType,
    mode: null,
    status: item.status,
    prompt: item.prompt,
    chargedCredits: item.chargedCredits,
    refundCredits: 0,
    costAmount: item.costAmount,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    totalTokens: item.totalTokens,
    resultUrl: item.resultUrl,
    requestId: item.requestId,
    upstreamTaskId: item.upstreamTaskId,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt,
  };
}

function normalizeGenerationTask(item: AccountGenerationTask) {
  return {
    source: 'generation_task',
    id: item.id,
    model: item.model,
    provider: item.provider,
    modelType: item.type,
    type: item.type,
    mode: item.mode,
    status: item.status,
    prompt: item.prompt,
    chargedCredits: item.chargedCredits,
    refundCredits: item.refundCredits,
    costAmount: item.costAmount,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    resultUrl: firstResultUrl(item.resultUrlsJson),
    requestId: item.upstreamRequestId,
    upstreamTaskId: item.upstreamTaskId,
    errorMessage: item.errorMessage,
    createdAt: item.createdAt,
  };
}

function firstResultUrl(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return null;
  const first = value.find(item => typeof item === 'string' && item.trim());
  return typeof first === 'string' ? first : null;
}

function workflowJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  return {};
}

export default router;
