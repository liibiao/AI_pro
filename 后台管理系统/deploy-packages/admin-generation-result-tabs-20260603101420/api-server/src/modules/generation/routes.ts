import crypto from 'node:crypto';
import { Prisma, type GenerationRefundSource, type ModelType } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { applyWalletDelta, assertEnoughBalance, calculateCreditsForPrincipal, estimateTextTokens } from '../../billing.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles, type OpenApiPrincipal } from '../../types.js';
import { buildEndpoint, callUpstreamJson, extractChatText } from '../../upstream.js';
import { getGenerationRuntimeSettings } from '../system-settings/service.js';
import { generatedImageFilePath, getGenerationAdapter, materializeImageResultUrl } from './adapters/registry.js';

const router = Router();
type RuntimeGenerationTask = Prisma.GenerationTaskGetPayload<{ include: { provider: true; model: true } }>;
const SERVER_OBJECT_STORAGE_MAX_ATTEMPTS = 3;
type ImmediateImageSubmitResult = {
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  progress?: number;
  upstreamTaskId?: string;
  upstreamRequestId?: string;
  requestJson: Prisma.InputJsonValue;
  responseJson: Prisma.InputJsonValue;
  resultJson?: Prisma.InputJsonValue;
  resultUrls?: string[];
  errorCode?: string;
  errorMessage?: string;
};
let generationReconcilerTimer: ReturnType<typeof setInterval> | null = null;
type LlmDebugLogStatus = 'running' | 'success' | 'failed' | 'info';
type LlmDebugSession = {
  id: string;
  userId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  text?: string;
  requestJson?: Prisma.InputJsonValue;
  responseJson?: Prisma.InputJsonValue;
  error?: string;
  logs: Array<{ at: string; status: LlmDebugLogStatus; step: string; message: string; detail?: unknown }>;
};
const llmDebugSessions = new Map<string, LlmDebugSession>();

const taskSchema = z.object({
  channelKey: z.string().min(1),
  modelId: z.string().min(1),
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']),
  mode: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  inputFiles: z.array(z.unknown()).default([]),
  params: z.record(z.unknown()).default({}),
  clientRequestId: z.string().trim().min(1).max(160).optional(),
});
const taskRecordSchema = z.object({
  channelKey: z.string().trim().optional(),
  modelId: z.string().min(1),
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']).default('LLM'),
  mode: z.string().min(1),
  prompt: z.string().default(''),
  negativePrompt: z.string().optional(),
  inputFiles: z.array(z.unknown()).default([]),
  params: z.record(z.unknown()).default({}),
  requestJson: z.unknown().optional(),
  responseJson: z.unknown().optional(),
  resultJson: z.unknown().optional(),
  resultUrls: z.array(z.string()).default([]),
  upstreamTaskId: z.string().optional(),
  upstreamRequestId: z.string().optional(),
  clientRequestId: z.string().trim().min(1).max(160).optional(),
});
const llmDebugSchema = z.object({
  channelKey: z.string().min(1),
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

router.get('/results/:name', asyncHandler(async (req, res) => {
  const filePath = generatedImageFilePath(routeParam(req.params.name));
  if (!filePath) fail(404, '图片不存在', 'GENERATED_IMAGE_NOT_FOUND');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath, err => {
    if (err && !res.headersSent) res.status(404).json({ ok: false, error: '图片不存在', code: 'GENERATED_IMAGE_NOT_FOUND' });
  });
}));

router.post('/tasks', requireAuth, asyncHandler(async (req, res) => {
  const principal = personalPrincipalFromUser(req.user!.id, 'CANVAS');
  const result = await createGenerationTaskForPrincipal(req, principal);
  ok(res, result);
}));

router.post('/tasks/record', requireAuth, asyncHandler(async (req, res) => {
  const body = taskRecordSchema.parse(req.body || {});
  const clientRequestId = normalizeClientRequestId(
    body.clientRequestId ||
    req.get('Idempotency-Key') ||
    req.get('X-Idempotency-Key') ||
    body.params.clientRequestId ||
    body.params.requestId,
  );
  if (clientRequestId) {
    const existing = await findIdempotentTask(req.user!.id, clientRequestId);
    if (existing) {
      ok(res, { task: existing, idempotent: true });
      return;
    }
  }
  const { provider, model } = await getProviderAndModel(body.channelKey || '', body.modelId, body.type);
  const now = new Date();
  const task = await prisma.generationTask.create({
    data: {
      userId: req.user!.id,
      clientRequestId,
      providerId: provider.id,
      modelId: model.id,
      channelKey: provider.providerKey,
      type: body.type,
      mode: body.mode,
      status: 'SUCCESS',
      progress: 100,
      prompt: body.prompt || '-',
      negativePrompt: body.negativePrompt,
      inputFilesJson: body.inputFiles as Prisma.InputJsonValue,
      paramsJson: body.params as Prisma.InputJsonValue,
      requestJson: body.requestJson as Prisma.InputJsonValue,
      responseJson: body.responseJson as Prisma.InputJsonValue,
      upstreamTaskId: body.upstreamTaskId,
      upstreamRequestId: body.upstreamRequestId,
      resultJson: (body.resultJson || {}) as Prisma.InputJsonValue,
      resultUrlsJson: body.resultUrls as Prisma.InputJsonValue,
      chargedCredits: 0,
      costAmount: 0,
      costUsd: new Prisma.Decimal(0),
      startedAt: now,
      completedAt: now,
    },
    include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
  });
  ok(res, { task });
}));

router.get('/tasks', requireAuth, asyncHandler(async (req, res) => {
  const result = await listGenerationTasksForPrincipal(personalPrincipalFromUser(req.user!.id, 'CANVAS'), req.query.limit, req.query.offset);
  ok(res, result);
}));

router.get('/tasks/:id', requireAuth, asyncHandler(async (req, res) => {
  const task = await getGenerationTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user!.id, 'CANVAS'));
  ok(res, { task });
}));

router.post('/tasks/:id/query', requireAuth, asyncHandler(async (req, res) => {
  const result = await queryGenerationTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user!.id, 'CANVAS'));
  ok(res, result);
}));

router.post('/tasks/:id/storage/retry', requireAuth, asyncHandler(async (req, res) => {
  const task = await prisma.generationTask.findFirst({
    where: { id: routeParam(req.params.id), userId: req.user!.id },
    include: { provider: true, model: true },
  });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  if (!isMaterializableResultType(task.type)) fail(400, '只有图片/视频任务支持重新保存到 COS', 'GENERATION_STORAGE_RETRY_UNSUPPORTED');
  if (!shouldAsyncServerObjectStorageResults(task)) fail(400, '当前任务不是 124 异步转存 COS 类型', 'GENERATION_STORAGE_RETRY_NOT_ASYNC');
  const urls = collectAsyncServerObjectStorageTemporaryUrls(task);
  if (!urls.length) fail(400, '当前任务没有可重新保存的临时资源地址', 'GENERATION_STORAGE_RETRY_NO_TEMP_URL');
  const resultJson = markServerStorageResultJson(task.resultJson, urls, 'uploading');
  const updated = await prisma.generationTask.update({
    where: { id: task.id },
    data: { resultJson, updatedAt: new Date() },
    include: { provider: true, model: true },
  });
  scheduleServerObjectStorageMaterialize(task.id);
  ok(res, { task: updated });
}));

router.post('/debug/llm-chat', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  cleanupLlmDebugSessions();
  const body = llmDebugSchema.parse(req.body);
  const session: LlmDebugSession = {
    id: crypto.randomUUID(),
    userId: req.user!.id,
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
  };
  llmDebugSessions.set(session.id, session);
  pushLlmDebugLog(session.id, 'running', 'frontdoor', '124 API 已收到语言模型调试请求', {
    channelKey: body.channelKey,
    modelId: body.modelId,
    promptLength: body.prompt.length,
  });
  void runLlmDebugSession(session.id, body);
  ok(res, { session: publicLlmDebugSession(session) });
}));

router.get('/debug/llm-chat/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const session = llmDebugSessions.get(routeParam(req.params.id));
  if (!session || session.userId !== req.user!.id) fail(404, '调试会话不存在或已过期', 'LLM_DEBUG_SESSION_NOT_FOUND');
  ok(res, { session: publicLlmDebugSession(session) });
}));

async function runLlmDebugSession(sessionId: string, body: z.infer<typeof llmDebugSchema>) {
  const startedAt = Date.now();
  try {
    pushLlmDebugLog(sessionId, 'running', 'db.model', '读取 124 数据库中的渠道和模型配置');
    const { provider, model } = await getProviderAndModel(body.channelKey, body.modelId, 'LLM');
    const adapterName = resolveGenerationAdapterName(provider, model);
    const runtime = await getGenerationRuntimeSettings();
    const endpointPath = model.endpointPath || provider.endpointPath || '/chat/completions';
    const endpoint = buildEndpoint(provider.baseUrl, endpointPath);
    const timeoutMs = resolveGenerationTimeoutMs('LLM', provider.timeoutMs, runtime.upstreamTimeoutMs);
    pushLlmDebugLog(sessionId, 'success', 'db.model', '模型配置读取成功', {
      provider: {
        id: provider.id,
        providerKey: provider.providerKey,
        name: provider.name,
        status: provider.status,
        adapter: provider.adapter,
        baseUrl: provider.baseUrl,
      },
      model: {
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        status: model.status,
        adapter: model.adapter,
      },
      adapterName,
      endpoint,
      timeoutMs,
    });

    const requestJson = buildLlmDebugRequestJson(body, model.name);
    patchLlmDebugSession(sessionId, { requestJson });
    pushLlmDebugLog(sessionId, 'success', 'request.build', '已组装上游 OpenAI Chat 请求', {
      model: model.name,
      messageCount: Array.isArray((requestJson as any).messages) ? (requestJson as any).messages.length : 0,
      maxTokens: (requestJson as any).max_tokens,
    });

    pushLlmDebugLog(sessionId, 'running', 'upstream.call', '开始请求上游：124 -> 中转站/模型服务', { endpoint });
    const upstream = await callUpstreamJson(provider, endpointPath, requestJson, timeoutMs);
    const latencyMs = Date.now() - startedAt;
    const text = extractChatText(upstream);
    patchLlmDebugSession(sessionId, {
      status: 'SUCCESS',
      completedAt: new Date().toISOString(),
      text,
      responseJson: upstream as Prisma.InputJsonValue,
    });
    pushLlmDebugLog(sessionId, 'success', 'upstream.response', '上游已返回，文本已解析完成', {
      latencyMs,
      upstreamRequestId: String((upstream as any)?.id || ''),
      upstreamModel: String((upstream as any)?.model || ''),
      hasChoices: Array.isArray((upstream as any)?.choices),
      textPreview: text.slice(0, 220),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchLlmDebugSession(sessionId, {
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      error: message,
    });
    pushLlmDebugLog(sessionId, 'failed', 'error', '调用链路失败', {
      message,
      code: (err as any)?.code || '',
      status: (err as any)?.status || (err as any)?.upstreamStatus || '',
      responseJson: (err as any)?.responseJson || null,
    });
  }
}

function buildLlmDebugRequestJson(body: z.infer<typeof llmDebugSchema>, modelName: string): Prisma.InputJsonValue {
  const params = body.params || {};
  const maxTokens = params.max_tokens || params.maxOutputTokens || params.outputTokens || params.completionTokens;
  const messages = Array.isArray(params.messages) && params.messages.length
    ? params.messages
    : [{ role: 'user', content: body.prompt }];
  return compactDebugJson({
    model: modelName,
    messages,
    temperature: params.temperature,
    max_tokens: maxTokens,
    ...withoutDebugKeys(params, ['messages', 'temperature', 'max_tokens', 'maxOutputTokens', 'outputTokens', 'completionTokens']),
  });
}

function publicLlmDebugSession(session: LlmDebugSession) {
  return {
    ...session,
    responseJson: sanitizeLlmDebugJson(session.responseJson),
  };
}

function pushLlmDebugLog(sessionId: string, status: LlmDebugLogStatus, step: string, message: string, detail?: unknown) {
  const session = llmDebugSessions.get(sessionId);
  if (!session) return;
  session.updatedAt = new Date().toISOString();
  session.logs.push({ at: session.updatedAt, status, step, message, ...(detail !== undefined ? { detail: sanitizeLlmDebugJson(detail) } : {}) });
}

function patchLlmDebugSession(sessionId: string, patch: Partial<LlmDebugSession>) {
  const session = llmDebugSessions.get(sessionId);
  if (!session) return;
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
}

function cleanupLlmDebugSessions() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of llmDebugSessions.entries()) {
    if (new Date(session.updatedAt || session.createdAt).getTime() < cutoff) llmDebugSessions.delete(id);
  }
}

function compactDebugJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')) as Prisma.InputJsonValue;
}

function withoutDebugKeys(value: Record<string, unknown>, keys: string[]) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !blocked.has(key) && item !== undefined));
}

function sanitizeLlmDebugJson(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 5000 ? `${value.slice(0, 5000)}...` : value;
  if (Array.isArray(value)) return value.map(item => sanitizeLlmDebugJson(item));
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, item]) => {
    if (/api[-_]?key|authorization|token|secret|password/i.test(key)) {
      out[key] = item ? '***REDACTED***' : item;
      return;
    }
    out[key] = sanitizeLlmDebugJson(item);
  });
  return out;
}

function personalPrincipalFromUser(userId: string, apiTokenId: string): OpenApiPrincipal {
  return { type: 'PERSONAL_API', billingUserId: userId, userId, apiTokenId, discountMode: 'FOLLOW_USER_MEMBERSHIP' };
}

export async function createGenerationTaskForPrincipal(req: Request, principal: OpenApiPrincipal) {
  const body = taskSchema.parse(req.body);
  const clientRequestId = resolveClientRequestId(req, body);
  if (clientRequestId) {
    const existing = await findIdempotentTask(principal.billingUserId, clientRequestId);
    if (existing) return { task: existing, chargedCredits: existing.chargedCredits, idempotent: true };
  }
  const { provider, model } = await getProviderAndModel(body.channelKey, body.modelId, body.type);
  const costInput = estimateTaskCostInput(body);
  const cost = await calculateCreditsForPrincipal(prisma, principal, model, costInput);
  await assertEnoughBalance(prisma, principal.billingUserId, cost.chargedCredits);

  let task;
  try {
    task = await prisma.generationTask.create({
      data: {
        userId: principal.billingUserId,
        clientRequestId,
        providerId: provider.id,
        modelId: model.id,
        channelKey: provider.providerKey,
        type: body.type,
        mode: body.mode,
        status: 'PENDING',
        prompt: body.prompt,
        negativePrompt: body.negativePrompt,
        inputFilesJson: body.inputFiles as Prisma.InputJsonValue,
        paramsJson: body.params as Prisma.InputJsonValue,
        chargedCredits: 0,
        costAmount: 0,
        costUsd: new Prisma.Decimal(0),
      },
    });
  } catch (err) {
    const existing = clientRequestId ? await recoverIdempotentCreate(principal.billingUserId, clientRequestId, err) : null;
    if (existing) return { task: existing, chargedCredits: existing.chargedCredits, idempotent: true };
    throw err;
  }

  const startedAt = Date.now();
  await markGenerationSubmitStarted(task.id, task.createdAt);
  const stopSubmitHeartbeat = startGenerationSubmitHeartbeat(task.id);
  try {
    const runtime = await getGenerationRuntimeSettings();
    const adapter = getGenerationAdapter(resolveGenerationAdapterName(provider, model));
    let submit = await adapter.submit({
      provider,
      model,
      type: body.type,
      mode: body.mode,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      inputFiles: body.inputFiles,
      params: body.params,
      timeoutMs: resolveGenerationTimeoutMs(body.type, provider.timeoutMs, runtime.upstreamTimeoutMs),
    });
    const shouldAsyncStore = isMaterializableResultType(body.type) && shouldAsyncServerObjectStorageResults({
      type: body.type,
      paramsJson: body.params,
      requestJson: submit.requestJson,
      resultJson: submit.resultJson,
      responseJson: submit.responseJson,
    });
    if (isMaterializableResultType(body.type) && !shouldAsyncStore) {
      submit = await materializeImmediateImageSubmitResults(provider, submit, body.params, body.type);
    }
    if (shouldAsyncStore) submit = markImageSubmitServerStoragePending(submit);
    const hasDirectResults = (submit.resultUrls || []).length > 0;
    const missingPollTarget = submit.status === 'RUNNING' && !submit.upstreamTaskId && !hasDirectResults;
    const status = submit.status === 'SUCCESS' || (submit.status === 'RUNNING' && !submit.upstreamTaskId && hasDirectResults)
      ? 'SUCCESS'
      : submit.status === 'FAILED' || missingPollTarget ? 'FAILED' : 'RUNNING';
    const billableCredits = status === 'FAILED' ? 0 : cost.chargedCredits;
    const updated = await prisma.$transaction(async tx => {
      const generationTask = await tx.generationTask.update({
        where: { id: task.id },
        data: {
          status,
          chargedCredits: billableCredits,
          costAmount: status === 'FAILED' ? 0 : cost.costAmount,
          costUsd: new Prisma.Decimal(status === 'FAILED' ? 0 : cost.costUsd),
          progress: submit.progress ?? (status === 'SUCCESS' ? 100 : 0),
          requestJson: submit.requestJson,
          responseJson: submit.responseJson,
          upstreamTaskId: submit.upstreamTaskId,
          upstreamRequestId: submit.upstreamRequestId,
          resultJson: submit.resultJson,
          resultUrlsJson: submit.resultUrls as Prisma.InputJsonValue,
          errorCode: status === 'FAILED' ? submit.errorCode || (missingPollTarget ? 'UPSTREAM_TASK_ID_MISSING' : undefined) : null,
          errorMessage: status === 'FAILED' ? submit.errorMessage || (missingPollTarget ? '上游响应没有返回任务 ID 或结果 URL，无法继续轮询' : undefined) : null,
          startedAt: task.createdAt,
          completedAt: status === 'SUCCESS' ? new Date() : undefined,
          failedAt: status === 'FAILED' ? new Date() : null,
        },
      });
      let balance: number | undefined;
      if (billableCredits > 0) {
        const walletChange = await applyWalletDelta(tx, { userId: principal.billingUserId, delta: -billableCredits, requireNonNegative: true });
        balance = walletChange.balanceAfter;
        await tx.walletLog.create({
          data: {
            userId: principal.billingUserId,
            type: 'CONSUME',
            amount: -billableCredits,
            balanceBefore: walletChange.balanceBefore,
            balanceAfter: walletChange.balanceAfter,
            relatedType: 'GENERATION_TASK',
            relatedId: task.id,
            remark: `${model.displayName} 生成任务预扣`,
          },
        });
      }
      await tx.providerHealthLog.create({
        data: {
          providerId: provider.id,
          modelId: model.id,
          taskId: task.id,
          status,
          latencyMs: Date.now() - startedAt,
          errorCode: submit.errorCode,
          errorMessage: submit.errorMessage,
        },
      });
      return { generationTask, balance };
    });
    if (status === 'SUCCESS' && shouldAsyncStore) scheduleServerObjectStorageMaterialize(updated.generationTask.id);
    return { task: updated.generationTask, balance: updated.balance, chargedCredits: billableCredits };
  } catch (err) {
    const adapterName = resolveGenerationAdapterName(provider, model);
    const baseMessage = err instanceof Error ? err.message : String(err);
    const message = `${baseMessage} [generation-route channel=${provider.providerKey} requestedModelId=${body.modelId} dbModel=${model.id}/${model.name}/${model.type} adapter=${adapterName}]`;
    const failedTask = await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        chargedCredits: 0,
        costAmount: 0,
        costUsd: new Prisma.Decimal(0),
        errorCode: 'GENERATION_SUBMIT_FAILED',
        errorMessage: message,
        failedAt: new Date(),
      },
    });
    await prisma.providerHealthLog.create({
      data: { providerId: provider.id, modelId: model.id, taskId: task.id, status: 'FAILED', latencyMs: Date.now() - startedAt, errorMessage: message },
    }).catch(() => undefined);
    return { task: failedTask, chargedCredits: 0 };
  } finally {
    stopSubmitHeartbeat();
  }
}

export async function listGenerationTasksForPrincipal(principal: OpenApiPrincipal, limit: unknown, offset: unknown = 0) {
  const take = Math.min(Math.max(Number(limit || 100), 1), 300);
  const skip = Math.min(Math.max(Number(offset || 0), 0), 100000);
  const ownerUserId = principal.billingUserId;
  const [tasks, total] = await Promise.all([
    prisma.generationTask.findMany({
      where: { userId: ownerUserId },
      select: generationTaskListSelect({ includeUser: false, includeRefunds: false }),
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.generationTask.count({ where: { userId: ownerUserId } }),
  ]);
  const items = tasks.filter(task => task.userId === ownerUserId).map(sanitizeGenerationTaskListItem);
  return { items, pagination: { limit: take, offset: skip, total, hasMore: skip + items.length < total } };
}

export async function getGenerationTaskForPrincipal(id: string, principal: OpenApiPrincipal) {
  const task = await prisma.generationTask.findFirst({
    where: { id, userId: principal.billingUserId },
    include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
  });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  return task;
}

export async function queryGenerationTaskForPrincipal(id: string, principal: OpenApiPrincipal) {
  const task = await prisma.generationTask.findFirst({
    where: { id, userId: principal.billingUserId },
    include: { provider: true, model: true },
  });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  return queryAndUpdateGenerationTask(task);
}

function generationTaskListSelect(options: { includeUser: boolean; includeRefunds: boolean }) {
  return {
    id: true,
    userId: true,
    clientRequestId: true,
    providerId: true,
    modelId: true,
    channelKey: true,
    type: true,
    mode: true,
    status: true,
    prompt: true,
    negativePrompt: true,
    inputFilesJson: true,
    paramsJson: true,
    upstreamTaskId: true,
    upstreamRequestId: true,
    resultJson: true,
    resultUrlsJson: true,
    chargedCredits: true,
    costAmount: true,
    costUsd: true,
    refundCredits: true,
    refundStatus: true,
    refundReason: true,
    errorCode: true,
    errorMessage: true,
    retryCount: true,
    progress: true,
    startedAt: true,
    completedAt: true,
    failedAt: true,
    refundedAt: true,
    createdAt: true,
    updatedAt: true,
    model: { select: { id: true, displayName: true, name: true, type: true, adapter: true } },
    provider: { select: { id: true, providerKey: true, name: true } },
    ...(options.includeUser ? { user: { select: { id: true, nickname: true, phone: true } } } : {}),
    ...(options.includeRefunds ? { refunds: { select: { id: true, status: true, amount: true, reason: true, createdAt: true } } } : {}),
  } satisfies Prisma.GenerationTaskSelect;
}

router.get('/admin/tasks', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const take = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
  const status = String(req.query.status || '').trim();
  const channelKey = String(req.query.channelKey || '').trim();
  const userId = String(req.query.userId || '').trim();
  const type = String(req.query.type || '').trim();
  const mode = String(req.query.mode || '').trim();
  const category = String(req.query.category || '').trim();
  const wantsAssetDesign = isAssetDesignModeQuery(mode) || isAssetDesignModeQuery(category);
  const wantsShotStoryboard = isShotStoryboardModeQuery(mode) || isShotStoryboardModeQuery(category);
  const wantsStoryboard = !wantsShotStoryboard && isStoryboardModeQuery(mode);
  const where: Prisma.GenerationTaskWhereInput = {};
  if (status) where.status = status as any;
  if (channelKey) where.channelKey = channelKey;
  if (userId) where.userId = userId;
  if (type) where.type = type as ModelType;
  if (mode && !wantsStoryboard && !wantsAssetDesign && !wantsShotStoryboard) where.mode = { contains: mode, mode: 'insensitive' };
  if (wantsAssetDesign) {
    const tasks = await findAdminGenerationTasks(where, take, isAssetDesignGenerationTask);
    ok(res, { items: tasks.map(sanitizeGenerationTaskListItem) });
    return;
  }
  if (wantsShotStoryboard) {
    const tasks = await findAdminGenerationTasks(where, take, isShotStoryboardGenerationTask);
    ok(res, { items: tasks.map(sanitizeGenerationTaskListItem) });
    return;
  }
  if (wantsStoryboard) {
    const tasks = await findAdminGenerationTasks(where, take, isStoryboardGenerationTask);
    ok(res, { items: tasks.map(sanitizeGenerationTaskListItem) });
    return;
  }
  const tasks = await prisma.generationTask.findMany({
    where,
    select: generationTaskListSelect({ includeUser: true, includeRefunds: true }),
    orderBy: { createdAt: 'desc' },
    take,
  });
  const items = wantsStoryboard ? tasks.filter(isStoryboardGenerationTask) : tasks;
  ok(res, { items: items.map(sanitizeGenerationTaskListItem) });
}));

async function findAdminGenerationTasks(where: Prisma.GenerationTaskWhereInput, take: number, predicate: (task: Record<string, unknown>) => boolean) {
  const items: Record<string, unknown>[] = [];
  const chunkSize = 500;
  const maxScanned = 10000;
  let skip = 0;
  while (items.length < take && skip < maxScanned) {
    const tasks = await prisma.generationTask.findMany({
      where,
      select: generationTaskListSelect({ includeUser: true, includeRefunds: true }),
      orderBy: { createdAt: 'desc' },
      skip,
      take: Math.min(chunkSize, maxScanned - skip),
    });
    if (!tasks.length) break;
    items.push(...tasks.filter(predicate as any));
    skip += tasks.length;
  }
  return items.slice(0, take);
}

router.get('/admin/tasks/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const task = await prisma.generationTask.findUnique({
    where: { id: routeParam(req.params.id) },
    include: { user: { select: { id: true, nickname: true, phone: true } }, model: true, provider: { select: { id: true, providerKey: true, name: true } }, refunds: true },
  });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  ok(res, { task });
}));

const refundSchema = z.object({
  reason: z.string().optional(),
});

router.post('/admin/tasks/:id/refund', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = refundSchema.parse(req.body || {});
  const refund = await prisma.$transaction(tx => refundGenerationTask(tx, {
    taskId: routeParam(req.params.id),
    source: 'ADMIN',
    operatorId: req.user!.id,
    reason: body.reason || '后台人工退款',
  }));
  ok(res, refund);
}));

export function startGenerationTaskReconciler() {
  if (!config.generationReconcileEnabled || generationReconcilerTimer) return;
  const intervalMs = Math.max(10_000, config.generationReconcileIntervalMs);
  const run = () => {
    reconcileStaleGenerationTasks().catch(err => {
      console.warn('[generation-reconciler] failed:', err instanceof Error ? err.message : err);
    });
  };
  generationReconcilerTimer = setInterval(run, intervalMs);
  generationReconcilerTimer.unref?.();
  const firstRun = setTimeout(run, Math.min(5000, intervalMs));
  firstRun.unref?.();
}

export async function reconcileStaleGenerationTasks() {
  const staleMinutes = Math.max(1, config.generationStaleTaskMinutes);
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000);
  const tasks = await prisma.generationTask.findMany({
    where: {
      status: { in: ['CREATED', 'PENDING', 'RUNNING'] },
      updatedAt: { lt: staleBefore },
    },
    include: { provider: true, model: true },
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  let queried = 0;
  let closed = 0;
  let refunded = 0;

  for (const task of tasks) {
    try {
      if (task.upstreamTaskId) {
        queried += 1;
        const result = await queryAndUpdateGenerationTask(task);
        if (result.refund?.refundedCredits) refunded += Number(result.refund.refundedCredits || 0);
        continue;
      }
      const result = await closeInterruptedGenerationTask(task);
      closed += 1;
      if (result.refund?.refundedCredits) refunded += Number(result.refund.refundedCredits || 0);
    } catch (err) {
      console.warn(`[generation-reconciler] task ${task.id} skipped:`, err instanceof Error ? err.message : err);
    }
  }

  return { checked: tasks.length, queried, closed, refunded };
}

async function getProviderAndModel(channelKey: string, modelId: string, type: ModelType) {
  let provider = channelKey ? await prisma.upstreamProvider.findUnique({ where: { providerKey: channelKey }, include: { models: true } }) : null;
  if (!provider && modelId) {
    const modelWithProvider = await prisma.aiModel.findFirst({
      where: {
        type,
        status: 'ACTIVE',
        OR: [
          { id: modelId },
          { modelKey: modelId },
          { name: modelId },
          { displayName: modelId },
        ],
      },
      include: { provider: true },
    });
    if (modelWithProvider?.providerId) {
      provider = await prisma.upstreamProvider.findUnique({ where: { id: modelWithProvider.providerId }, include: { models: true } });
    }
  }
  if (!provider) fail(404, `渠道不可用：找不到 channelKey=${channelKey || '-'}，modelId=${modelId || '-'}，type=${type}`, 'PROVIDER_NOT_FOUND');
  const candidates = provider.models.filter(item => item.status === 'ACTIVE' && item.type === type);
  const model = candidates.find(item => item.id === modelId)
    || candidates.find(item => item.modelKey === modelId)
    || candidates.find(item => item.name === modelId)
    || candidates.find(item => item.displayName === modelId);
  if (!model) fail(404, `模型不可用：channelKey=${channelKey || '-'} 下找不到 ACTIVE ${type} 模型 modelId=${modelId || '-'}`, 'MODEL_NOT_FOUND');
  if (provider.status !== 'ACTIVE' && type !== 'LLM') fail(404, `渠道不可用：channelKey=${channelKey || '-'} 当前状态为 ${provider.status}，modelId=${modelId || '-'}，type=${type}`, 'PROVIDER_DISABLED');
  return { provider, model };
}

function resolveGenerationAdapterName(provider: { adapter?: string | null; providerKey?: string | null; name?: string | null }, model: { adapter?: string | null; name?: string | null; displayName?: string | null; modelKey?: string | null }) {
  const configured = String(model.adapter || provider.adapter || '').trim();
  const configuredLower = configured.toLowerCase();
  const modelHint = [
    provider.providerKey,
    provider.name,
    model.modelKey,
    model.name,
    model.displayName,
  ].join(' ').toLowerCase();
  const hint = [
    provider.providerKey,
    provider.name,
    model.modelKey,
    model.name,
    model.displayName,
    configured,
  ].join(' ').toLowerCase();
  if (hint.includes('seedance2.0-vip') || hint.includes('seedance2-vip') || hint.includes('seedance 2.0 vip')) return 'seedance2-vip';
  if (configuredLower === 'seedance2-vip' || configuredLower === 'seedance2.0-vip') return 'seedance2-vip';
  if (['gemini-image-generate', 'gemini-image-edit', 'gemini-video', 'veo-video', 'gemini-chat', 'gemini-llm', 'veo-chat', 'veo-3.1', 'grok-video', 'grok-image', 'grok-image-edit', 'grok-chat', 'grok-llm'].includes(configuredLower)) return configuredLower;
  if (hint.includes('gpt-image-v2') || hint.includes('gpt image v2') || hint.includes('gpt-image- v2')) return 'gpt-image-v2';
  if (modelHint.includes('sora-v3') || modelHint.includes('sora v3') || modelHint.includes('sora-2') || modelHint.includes('sora 2')) return 'sora-video';
  if (configuredLower === 'sora-video' || configuredLower === 'notevideo') return 'sora-video';
  if (configuredLower === 'gemini-image') return 'gemini-image';
  if (hint.includes('gemini') && hint.includes('image') && (hint.includes('edit') || hint.includes('图生图'))) return 'gemini-image-edit';
  if (hint.includes('gemini') && hint.includes('image') && (hint.includes('unified') || hint.includes('统一') || hint.includes('/images/generations'))) return 'gemini-image-generate';
  if (hint.includes('gemini') && hint.includes('image')) return 'gemini-image';
  if (hint.includes('grok-imagine') && hint.includes('video')) return 'grok-video';
  if (hint.includes('grok-imagine') && (hint.includes('edit') || configuredLower === 'grok-image-edit')) return 'grok-image-edit';
  if (hint.includes('grok-imagine')) return 'grok-image';
  if (hint.includes('grok-4') || configuredLower === 'grok-chat' || configuredLower === 'grok-llm') return 'grok-chat';
  if (hint.includes('gemini-') || configuredLower === 'gemini-chat' || configuredLower === 'gemini-llm') return 'gemini-chat';
  if (hint.includes('veo-3.1') || hint.includes('veo 3.1') || configuredLower === 'veo-chat' || configuredLower === 'veo-3.1') return 'veo-chat';
  if (hint.includes('veo-') || configuredLower === 'gemini-video' || configuredLower === 'veo-video') return 'gemini-video';
  return configuredLower || configured;
}

function resolveUpstreamTimeoutMs(providerTimeoutMs: number | null | undefined, runtimeTimeoutMs: number) {
  return Math.max(Number(providerTimeoutMs || 0), Number(runtimeTimeoutMs || 0), 600000);
}

function resolveGenerationTimeoutMs(type: ModelType, providerTimeoutMs: number | null | undefined, runtimeTimeoutMs: number) {
  if (type === 'IMAGE' || type === 'VIDEO') return 0;
  return resolveUpstreamTimeoutMs(providerTimeoutMs, runtimeTimeoutMs);
}

function resolveClientRequestId(req: Request, body: z.infer<typeof taskSchema>) {
  return normalizeClientRequestId(
    body.clientRequestId ||
    req.get('Idempotency-Key') ||
    req.get('X-Idempotency-Key') ||
    body.params.clientRequestId ||
    body.params.requestId,
  );
}

function isStoryboardModeQuery(mode: string) {
  return /storyboard|故事板/i.test(String(mode || ''));
}

function isAssetDesignModeQuery(mode: string) {
  return /asset[-_\s]?design|assetdesign|资产设计/i.test(String(mode || ''));
}

function isShotStoryboardModeQuery(mode: string) {
  return /shot[-_\s]?storyboard|shotstoryboard|分镜节点|分镜表|分镜图/i.test(String(mode || ''));
}

function generationTaskClassifierText(task: { mode?: unknown; prompt?: unknown; paramsJson?: unknown; resultJson?: unknown }) {
  const params = isRecord(task.paramsJson) ? task.paramsJson : {};
  const result = isRecord(task.resultJson) ? task.resultJson : {};
  const fields = [
    task.mode,
    params.mode,
    result.mode,
    params.taskType,
    params.task_type,
    result.taskType,
    result.task_type,
    params.nodeType,
    params.node_type,
    result.nodeType,
    result.node_type,
    params.template,
    result.template,
    params.sourceNodeType,
    params.source_node_type,
    result.sourceNodeType,
    result.source_node_type,
    params.workflowNodeType,
    params.workflow_node_type,
    params.canvasNodeType,
    params.canvas_node_type,
    result.canvasNodeType,
    result.canvas_node_type,
    params.sourceType,
    params.source_type,
    params.category,
    result.category,
    params.resultType,
    params.result_type,
    result.resultType,
    result.result_type,
    params.outputType,
    params.output_type,
    result.outputType,
    result.output_type,
    params.kind,
    result.kind,
  ];
  return fields.filter(Boolean).join(' ').toLowerCase();
}

function isAssetDesignGenerationTask(task: { mode?: unknown; prompt?: unknown; paramsJson?: unknown; resultJson?: unknown }) {
  return /asset[-_\s]?design|assetdesign|资产设计/.test(generationTaskClassifierText(task));
}

function isShotStoryboardGenerationTask(task: { mode?: unknown; prompt?: unknown; paramsJson?: unknown; resultJson?: unknown }) {
  return /shot[-_\s]?storyboard|shotstoryboard|分镜节点|分镜表|分镜图/.test(generationTaskClassifierText(task));
}

function isStoryboardGenerationTask(task: { mode?: unknown; prompt?: unknown; paramsJson?: unknown; resultJson?: unknown }) {
  if (isShotStoryboardGenerationTask(task)) return false;
  const text = generationTaskClassifierText(task);
  if (/storyboard|故事板/.test(text)) return true;
  return String(task.mode || '').trim().toLowerCase() === 'storyboard';
}

function normalizeClientRequestId(value: unknown) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 160) : null;
}

async function findIdempotentTask(userId: string, clientRequestId: string) {
  return prisma.generationTask.findFirst({
    where: { userId, clientRequestId },
    include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
  });
}

async function recoverIdempotentCreate(userId: string, clientRequestId: string, err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  return findIdempotentTask(userId, clientRequestId);
}

async function queryAndUpdateGenerationTask(task: RuntimeGenerationTask) {
  if (isTerminalStatus(task.status) && task.status === 'SUCCESS') {
    const completed = await completeTaskFromStoredResultUrls(task);
    if (completed) return { task: completed };
    return { task };
  }
  if (isTerminalStatus(task.status) && task.status !== 'SUCCESS') {
    const completed = await completeTaskFromStoredResultUrls(task);
    if (completed) return { task: completed };
  }
  if (isTerminalStatus(task.status)) return { task };
  if (!task.upstreamTaskId) {
    const completed = await completeTaskFromStoredResultUrls(task);
    if (completed) return { task: completed };
    if (isFreshGenerationSubmit(task)) return { task };
    return closeInterruptedGenerationTask(task, '任务提交中断：后台没有收到上游任务 ID 或同步生成结果，请重新生成');
  }
  const adapter = getGenerationAdapter(resolveGenerationAdapterName(task.provider, task.model));
  if (!adapter.query) fail(400, '当前渠道不支持查询', 'ADAPTER_QUERY_NOT_SUPPORTED');
  const runtime = await getGenerationRuntimeSettings();
  let result;
  try {
    result = await adapter.query({
      provider: task.provider,
      model: task.model,
      type: task.type,
      mode: task.mode,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt || undefined,
      inputFiles: Array.isArray(task.inputFilesJson) ? task.inputFilesJson : [],
      params: isRecord(task.paramsJson) ? task.paramsJson : {},
      timeoutMs: resolveGenerationTimeoutMs(task.type, task.provider.timeoutMs, runtime.upstreamTimeoutMs),
      upstreamTaskId: task.upstreamTaskId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isTransientGenerationFailureMessage(message)) throw err;
    const updated = await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        errorCode: 'GENERATION_QUERY_FAILED',
        errorMessage: message,
        failedAt: new Date(),
      },
      include: { provider: true, model: true },
    });
    const refund = updated.chargedCredits > 0
      ? await prisma.$transaction(tx => refundGenerationTask(tx, {
        taskId: updated.id,
        source: 'AUTO',
        reason: message || '上游任务查询失败，已自动退款',
      }))
      : null;
    return { task: refund?.task || updated, ...(refund ? { refund } : {}) };
  }
  const status = result.status === 'SUCCESS' ? 'SUCCESS' : result.status === 'FAILED' ? 'FAILED' : 'RUNNING';
  const shouldAsyncStore = status === 'SUCCESS' && shouldAsyncServerObjectStorageResults({
    ...task,
    resultJson: result.resultJson,
    responseJson: result.responseJson,
  });
  const nextResult = shouldAsyncStore ? markImageQueryServerStoragePending(result) : result;
  const updated = await prisma.generationTask.update({
    where: { id: task.id },
    data: {
      status,
      progress: nextResult.progress ?? task.progress,
      responseJson: nextResult.responseJson,
      resultJson: nextResult.resultJson,
      resultUrlsJson: nextResult.resultUrls as Prisma.InputJsonValue,
      errorCode: nextResult.errorCode,
      errorMessage: nextResult.errorMessage,
      completedAt: status === 'SUCCESS' ? new Date() : undefined,
      failedAt: status === 'FAILED' ? new Date() : undefined,
    },
    include: { provider: true, model: true },
  });
  if (shouldAsyncStore) scheduleServerObjectStorageMaterialize(updated.id);
  const refund = status === 'FAILED'
    ? await prisma.$transaction(tx => refundGenerationTask(tx, {
      taskId: updated.id,
      source: 'AUTO',
      reason: result.errorMessage || '上游任务失败，已自动退款',
    }))
    : null;
  return { task: refund?.task || updated, ...(refund ? { refund } : {}) };
}

async function closeInterruptedGenerationTask(task: RuntimeGenerationTask, reason = '任务提交中断，后台自动关闭') {
  const completed = await completeTaskFromStoredResultUrls(task);
  if (completed) return { task: completed };
  const updated = await prisma.generationTask.update({
    where: { id: task.id },
    data: {
      status: 'FAILED',
      errorCode: 'GENERATION_TASK_INTERRUPTED',
      errorMessage: reason,
      failedAt: new Date(),
    },
    include: { provider: true, model: true },
  });
  const refund = updated.chargedCredits > 0
    ? await prisma.$transaction(tx => refundGenerationTask(tx, {
      taskId: updated.id,
      source: 'AUTO',
      reason,
    }))
    : null;
  return { task: refund?.task || updated, ...(refund ? { refund } : {}) };
}

async function completeTaskFromStoredResultUrls(task: RuntimeGenerationTask) {
  if (shouldAsyncServerObjectStorageResults(task)) {
    if (task.status === 'SUCCESS') scheduleServerObjectStorageMaterialize(task.id);
    return null;
  }
  const urls = await materializeStoredGenerationResultUrls(task, collectStoredGenerationResultUrls(task));
  if (!urls.length) return null;
  const resultJson = normalizeStoredGenerationResultJson(task.resultJson, urls);
  return prisma.generationTask.update({
    where: { id: task.id },
    data: {
      status: 'SUCCESS',
      progress: 100,
      resultUrlsJson: urls as Prisma.InputJsonValue,
      resultJson,
      errorCode: null,
      errorMessage: null,
      completedAt: task.completedAt || new Date(),
      failedAt: null,
    },
    include: { provider: true, model: true },
  });
}

async function materializeStoredGenerationResultUrls(task: RuntimeGenerationTask, urls: string[]) {
  if (!isMaterializableResultType(task.type)) return urls;
  if (!shouldMaterializeImageResults(task)) return urls;
  const resolved: string[] = [];
  for (const url of urls) {
    const materialized = await materializeImageResultUrl(task.provider, url).catch(() => '');
    const next = materialized || url;
    if (next && !resolved.includes(next)) resolved.push(next);
  }
  return resolved;
}

async function materializeImmediateImageSubmitResults(
  provider: RuntimeGenerationTask['provider'],
  submit: ImmediateImageSubmitResult,
  paramsJson?: unknown,
  type: ModelType = 'IMAGE',
) {
  if (!shouldMaterializeImageResults({ type, provider, paramsJson, requestJson: submit.requestJson, resultJson: submit.resultJson, responseJson: submit.responseJson } as RuntimeGenerationTask)) {
    return submit;
  }
  const urls = await materializeStoredGenerationResultUrls(
    { type, provider } as RuntimeGenerationTask,
    collectStoredGenerationResultUrls({
      resultUrlsJson: submit.resultUrls,
      resultJson: submit.resultJson,
      responseJson: submit.responseJson,
    }),
  );
  if (!urls.length) return submit;
  return {
    ...submit,
    resultUrls: urls,
    resultJson: normalizeStoredGenerationResultJson(submit.resultJson, urls),
  };
}

function shouldMaterializeImageResults(task: Pick<RuntimeGenerationTask, 'type'> & { paramsJson?: unknown; requestJson?: unknown; resultJson?: unknown; responseJson?: unknown }) {
  if (!isMaterializableResultType(task.type)) return false;
  const responseType = findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson);
  if (task.type === 'VIDEO' && !responseType) return false;
  return !responseType || responseType === 'object_storage';
}

function shouldAsyncServerObjectStorageResults(task: Pick<RuntimeGenerationTask, 'type'> & { paramsJson?: unknown; requestJson?: unknown; resultJson?: unknown; responseJson?: unknown }) {
  if (!isMaterializableResultType(task.type)) return false;
  return findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson) === 'server_object_storage';
}

function isMaterializableResultType(type: unknown): type is ModelType {
  return type === 'IMAGE' || type === 'VIDEO';
}

function markImageSubmitServerStoragePending<T extends ImmediateImageSubmitResult>(submit: T): T {
  const urls = collectStoredGenerationResultUrls({
    resultUrlsJson: submit.resultUrls,
    resultJson: submit.resultJson,
    responseJson: submit.responseJson,
  });
  if (!urls.length) return submit;
  return {
    ...submit,
    resultJson: markServerStorageResultJson(submit.resultJson, urls, 'uploading'),
    resultUrls: urls,
  };
}

function markImageQueryServerStoragePending<T extends { resultJson?: Prisma.InputJsonValue; resultUrls?: string[]; responseJson?: Prisma.InputJsonValue }>(result: T): T {
  const urls = collectStoredGenerationResultUrls({
    resultUrlsJson: result.resultUrls,
    resultJson: result.resultJson,
    responseJson: result.responseJson,
  });
  if (!urls.length) return result;
  return {
    ...result,
    resultJson: markServerStorageResultJson(result.resultJson, urls, 'uploading'),
    resultUrls: urls,
  };
}

function markServerStorageResultJson(resultJson: unknown, urls: string[], status: 'pending' | 'uploading' | 'stored' | 'failed', extra: Record<string, unknown> = {}) {
  const base = isRecord(resultJson) ? { ...resultJson } : {};
  const temporaryUrls = normalizeAsyncStorageTemporaryUrls(base, urls);
  const now = new Date();
  const cleanupHours = status === 'stored' ? 72 : status === 'failed' ? 168 : undefined;
  const cleanupAt = cleanupHours ? new Date(now.getTime() + cleanupHours * 60 * 60 * 1000).toISOString() : undefined;
  const cleanupMeta = cleanupHours
    ? {
        temporaryCleanupAfterHours: cleanupHours,
        temporary_cleanup_after_hours: cleanupHours,
        temporaryCleanupAt: cleanupAt,
        temporary_cleanup_at: cleanupAt,
      }
    : {};
  return {
    ...base,
    url: urls[0] || base.url || '',
    outputs: urls,
    temporaryUrl: temporaryUrls[0] || urls[0] || base.temporaryUrl || '',
    temporaryUrls,
    storageStatus: status,
    storage_status: status,
    storageMode: 'server_async_object_storage',
    storage_mode: 'server_async_object_storage',
    ...cleanupMeta,
    ...extra,
  } as Prisma.InputJsonValue;
}

function normalizeAsyncStorageTemporaryUrls(source: Record<string, unknown>, fallbackUrls: string[]) {
  const values = [
    source.temporaryUrls,
    source.temporary_urls,
    source.temporaryUrl,
    source.temporary_url,
    fallbackUrls,
  ];
  const urls: string[] = [];
  for (const value of values) {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      const raw = String(item || '').trim();
      if (raw && !urls.includes(raw)) urls.push(raw);
    }
  }
  return urls;
}

function collectAsyncServerObjectStorageTemporaryUrls(task: { resultUrlsJson?: unknown; resultJson?: unknown; responseJson?: unknown }) {
  const resultJson = isRecord(task.resultJson) ? task.resultJson : {};
  const urls = normalizeAsyncStorageTemporaryUrls(resultJson, collectStoredGenerationResultUrls(task));
  return urls.filter(url => !isLikelyPermanentStorageUrl(url));
}

function scheduleServerObjectStorageMaterialize(taskId: string) {
  const timer = setTimeout(() => {
    materializeServerObjectStorageTask(taskId).catch(err => {
      console.warn(`[generation-storage] async materialize ${taskId} failed:`, err instanceof Error ? err.message : err);
    });
  }, 100);
  timer.unref?.();
}

async function materializeServerObjectStorageTask(taskId: string) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId }, include: { provider: true, model: true } });
  if (!task || !isMaterializableResultType(task.type) || task.status !== 'SUCCESS' || !shouldAsyncServerObjectStorageResults(task)) return;
  const sourceUrls = collectAsyncServerObjectStorageTemporaryUrls(task);
  if (!sourceUrls.length) return;
  let failedReason = '';
  for (let attempt = 1; attempt <= SERVER_OBJECT_STORAGE_MAX_ATTEMPTS; attempt += 1) {
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        resultJson: markServerStorageResultJson(task.resultJson, sourceUrls, 'uploading', {
          storageAttempts: attempt,
          storage_attempts: attempt,
          storageMaxAttempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
          storage_max_attempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
        }),
      },
    }).catch(() => undefined);

    const resolved: string[] = [];
    failedReason = '';
    for (const url of sourceUrls) {
      try {
        const next = await materializeImageResultUrl(task.provider, url);
        if (next && !resolved.includes(next)) resolved.push(next);
      } catch (err) {
        failedReason = err instanceof Error ? err.message : String(err);
      }
    }
    const storedUrls = resolved.filter(url => isLikelyPermanentStorageUrl(url) || !sourceUrls.includes(url));
    if (storedUrls.length) {
      const resultJson = markServerStorageResultJson(task.resultJson, storedUrls, 'stored', {
        permanentUrl: storedUrls[0],
        permanentUrls: storedUrls,
        storedAt: new Date().toISOString(),
        storageAttempts: attempt,
        storage_attempts: attempt,
        storageError: null,
        storage_error: null,
      });
      await prisma.generationTask.update({
        where: { id: task.id },
        data: {
          resultJson,
          resultUrlsJson: storedUrls as Prisma.InputJsonValue,
        },
      });
      return;
    }
    if (attempt < SERVER_OBJECT_STORAGE_MAX_ATTEMPTS) await sleep(900 * attempt);
  }
  const resultJson = markServerStorageResultJson(task.resultJson, sourceUrls, 'failed', {
    storageError: failedReason || '124 后台转存 COS 失败，已保留临时预览地址',
    storage_error: failedReason || '124 后台转存 COS 失败，已保留临时预览地址',
    storageAttempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
    storage_attempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
    storageMaxAttempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
    storage_max_attempts: SERVER_OBJECT_STORAGE_MAX_ATTEMPTS,
    storageFailedAt: new Date().toISOString(),
  });
  await prisma.generationTask.update({
    where: { id: task.id },
    data: { resultJson, resultUrlsJson: sourceUrls as Prisma.InputJsonValue },
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isLikelyPermanentStorageUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^\/api\/generation\/results\//i.test(raw)
    || /(?:^|[./-])cos(?:[.-]|$)/i.test(raw)
    || /myqcloud\.com/i.test(raw)
    || /cloudfront\.net/i.test(raw);
}

function findConfiguredImageResponseType(...values: unknown[]) {
  for (const value of values) {
    const found = findImageResponseType(value);
    if (found) return found;
  }
  return '';
}

function findImageResponseType(value: unknown): '' | 'object_storage' | 'server_object_storage' | 'provider_url' | 'base64' {
  if (!value) return '';
  if (typeof value === 'string') return normalizeImageResponseTypeValue(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageResponseType(item);
      if (found) return found;
    }
    return '';
  }
  if (!isRecord(value)) return '';
  const direct = normalizeImageResponseTypeValue(value.responseType ?? value.response_type);
  if (direct) return direct;
  const protocol = isRecord(value.protocol) ? findImageResponseType(value.protocol) : '';
  if (protocol) return protocol;
  return '';
}

function normalizeImageResponseTypeValue(value: unknown): '' | 'object_storage' | 'server_object_storage' | 'provider_url' | 'base64' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos'].includes(raw)) return 'object_storage';
  if (['server_object_storage', 'server-object-storage', 'server_async_object_storage', 'server-async-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', 'backend_cos', 'server_cos', '124_cos', '124_async_cos', '124-server-cos', '124服务器转存cos', '124异步转存cos', '后台转存cos', '后台异步转存cos'].includes(raw)) return 'server_object_storage';
  if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw)) return 'provider_url';
  if (['base64', 'b64', 'b64_json'].includes(raw)) return 'base64';
  return '';
}

function sanitizeGenerationTaskListItem<T extends Record<string, unknown>>(task: T): T {
  return {
    ...task,
    inputFilesJson: sanitizeGenerationListJson(task.inputFilesJson),
    paramsJson: sanitizeGenerationListJson(task.paramsJson),
    resultJson: sanitizeGenerationListJson(task.resultJson),
    resultUrlsJson: sanitizeGenerationListJson(task.resultUrlsJson),
  };
}

function sanitizeGenerationListJson(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeGenerationListString(value);
  if (Array.isArray(value)) return value.map(item => sanitizeGenerationListJson(item));
  if (!isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isLargeInlineGenerationField(key, item)) {
      next[key] = `[inline omitted: ${String(item || '').length} chars]`;
      continue;
    }
    next[key] = sanitizeGenerationListJson(item);
  }
  return next;
}

function sanitizeGenerationListString(value: string) {
  const raw = String(value || '');
  if (!raw) return raw;
  if (/^data:(?:image|video|audio)\//i.test(raw) && raw.length > 4096) {
    return `[inline data omitted: ${raw.length} chars]`;
  }
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(raw) && raw.length > 64_000) {
    return `[base64 omitted: ${raw.length} chars]`;
  }
  return raw.length > 180_000 ? `${raw.slice(0, 4000)}...[omitted ${raw.length - 4000} chars]` : raw;
}

function isLargeInlineGenerationField(key: string, value: unknown) {
  if (typeof value !== 'string') return false;
  const name = key.toLowerCase();
  if (!/(b64|base64|data|inline)/.test(name)) return false;
  return value.length > 4096;
}

function normalizeStoredGenerationResultJson(resultJson: unknown, urls: string[]) {
  if (isRecord(resultJson) && Object.keys(resultJson).length) {
    return {
      ...resultJson,
      url: urls[0],
      outputs: urls,
    } as Prisma.InputJsonValue;
  }
  return { url: urls[0], outputs: urls } as Prisma.InputJsonValue;
}

function collectStoredGenerationResultUrls(task: { resultUrlsJson?: unknown; resultJson?: unknown; responseJson?: unknown }) {
  const urls: string[] = [];
  const push = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    if (!/^data:image\//i.test(raw) && !/^https?:\/\//i.test(raw) && !/^\/api\/generation\/results\//i.test(raw) && !/^\/v1\/(?:images\/results|files|videos)\//i.test(raw)) return;
    if (!urls.includes(raw)) urls.push(raw);
  };
  const visit = (value: unknown, key = '') => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/url|uri|output|image|video|result|b64|base64/i.test(key) || /^data:image\//i.test(value) || /^https?:\/\//i.test(value) || /^\/api\//i.test(value) || /^\/v1\//i.test(value)) push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key));
      return;
    }
    if (isRecord(value)) {
      const inline = value.inlineData || value.inline_data;
      if (inline) visit(inline, 'inlineData');
      Object.entries(value).forEach(([itemKey, item]) => {
        if (/url|uri|output|image|video|result/i.test(itemKey)) visit(item, itemKey);
        else if (isRecord(item) || Array.isArray(item)) visit(item, itemKey);
      });
    }
  };
  visit(task.resultUrlsJson, 'resultUrlsJson');
  visit(task.resultJson, 'resultJson');
  visit(task.responseJson, 'responseJson');
  return urls;
}

function isTerminalStatus(status: string) {
  return ['SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED', 'TIMEOUT', 'MANUAL_REVIEW'].includes(status);
}

function isTransientGenerationFailureMessage(message: unknown) {
  return /stream disconnected before completion|HTTP\s*502|internal_server_error|server_error|bad gateway|gateway timeout|upstream|timeout|timed out|failed to fetch|network|502|503|504|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|premature close/i.test(String(message || ''));
}

async function markGenerationSubmitStarted(taskId: string, startedAt: Date) {
  await prisma.generationTask.update({
    where: { id: taskId },
    data: {
      status: 'RUNNING',
      startedAt,
    },
  });
}

function startGenerationSubmitHeartbeat(taskId: string) {
  const intervalMs = Math.max(10_000, Math.min(60_000, Math.floor(generationStaleTaskWindowMs() / 3)));
  const timer = setInterval(() => {
    prisma.generationTask.updateMany({
      where: {
        id: taskId,
        status: { in: ['CREATED', 'PENDING', 'RUNNING'] },
      },
      data: { updatedAt: new Date() },
    }).catch(err => {
      console.warn(`[generation-submit] heartbeat for task ${taskId} failed:`, err instanceof Error ? err.message : err);
    });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function isFreshGenerationSubmit(task: Pick<RuntimeGenerationTask, 'status' | 'updatedAt'>) {
  if (!['CREATED', 'PENDING', 'RUNNING'].includes(task.status)) return false;
  return Date.now() - task.updatedAt.getTime() < generationStaleTaskWindowMs();
}

function generationStaleTaskWindowMs() {
  return Math.max(1, config.generationStaleTaskMinutes) * 60_000;
}

function estimateTaskCostInput(body: z.infer<typeof taskSchema>) {
  const quantity = numberParam(body.params, ['n', 'quantity'], 1);
  const durationSeconds = numberParam(body.params, ['durationSeconds', 'duration', 'seconds'], 0);
  if (body.type !== 'LLM') {
    return {
      quantity,
      durationSeconds,
      inputTokens: 0,
      outputTokens: 0,
      size: stringParam(body.params, ['size']),
      resolution: stringParam(body.params, ['resolution', 'requestedResolution', 'quality']),
      imageSize: stringParam(body.params, ['imageSize', 'requestedPixelSize']),
      params: body.params,
    };
  }
  const inputTokens = numberParam(body.params, ['inputTokens', 'promptTokens'], estimateTextTokens(body.prompt));
  const outputTokens = numberParam(body.params, ['outputTokens', 'completionTokens', 'maxOutputTokens', 'max_tokens'], 4096);
  return { quantity: 1, durationSeconds: 0, inputTokens, outputTokens };
}

function stringParam(params: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberParam(params: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = params[key];
    const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(numberValue) && numberValue >= 0) return numberValue;
  }
  return fallback;
}

async function refundGenerationTask(tx: Prisma.TransactionClient, input: {
  taskId: string;
  source: GenerationRefundSource;
  reason: string;
  operatorId?: string;
}) {
  const task = await tx.generationTask.findUnique({
    where: { id: input.taskId },
    include: { model: true, provider: true },
  });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  if (task.refundStatus === 'SUCCESS' || task.refundCredits > 0) {
    const wallet = await tx.wallet.findUnique({ where: { userId: task.userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    return { task, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: true };
  }
  const claimed = await tx.generationTask.updateMany({
    where: { id: task.id, refundStatus: { not: 'SUCCESS' }, refundCredits: 0 },
    data: { refundStatus: 'PROCESSING', refundReason: input.reason },
  });
  if (claimed.count !== 1) {
    const [currentTask, wallet] = await Promise.all([
      tx.generationTask.findUnique({ where: { id: task.id }, include: { model: true, provider: true, refunds: true } }),
      tx.wallet.findUnique({ where: { userId: task.userId } }),
    ]);
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    return { task: currentTask || task, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: true };
  }

  const amount = Math.max(0, task.chargedCredits);
  const refund = await tx.generationRefund.create({
    data: {
      taskId: task.id,
      userId: task.userId,
      amount,
      status: 'PENDING',
      source: input.source,
      reason: input.reason,
      operatorId: input.operatorId,
    },
  });

  if (amount <= 0) {
    const wallet = await tx.wallet.findUnique({ where: { userId: task.userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    const updatedTask = await tx.generationTask.update({
      where: { id: task.id },
      data: { refundStatus: 'SUCCESS', refundReason: input.reason, refundedAt: new Date() },
      include: { model: true, provider: true, refunds: true },
    });
    await tx.generationRefund.update({ where: { id: refund.id }, data: { status: 'SUCCESS', processedAt: new Date() } });
    return { task: updatedTask, refund, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: false };
  }

  const walletChange = await applyWalletDelta(tx, { userId: task.userId, delta: amount });
  await tx.walletLog.create({
    data: {
      userId: task.userId,
      type: 'REFUND',
      amount,
      balanceBefore: walletChange.balanceBefore,
      balanceAfter: walletChange.balanceAfter,
      relatedType: 'GENERATION_TASK',
      relatedId: task.id,
      remark: `${task.model.displayName} 生成任务退款`,
    },
  });
  const processedRefund = await tx.generationRefund.update({
    where: { id: refund.id },
    data: { status: 'SUCCESS', processedAt: new Date() },
  });
  const updatedTask = await tx.generationTask.update({
    where: { id: task.id },
    data: {
      status: 'REFUNDED',
      refundCredits: amount,
      refundStatus: 'SUCCESS',
      refundReason: input.reason,
      refundedAt: new Date(),
    },
    include: { model: true, provider: true, refunds: true },
  });
  return { task: updatedTask, refund: processedRefund, refundedCredits: amount, balance: walletChange.balanceAfter, alreadyRefunded: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export default router;
