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
