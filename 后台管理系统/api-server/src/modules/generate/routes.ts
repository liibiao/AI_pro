import { Router, type Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { assertEnoughBalance, calculateCreditsForUser, estimateTextTokens, recordUsageAndCharge, refundUsageCharge } from '../../billing.js';
import { callUpstreamGetJson, callUpstreamJson, extractChatText, extractImageResult, extractVideoResultUrl, extractVideoTask } from '../../upstream.js';
import { mockChatResponse, mockImageResponse, mockVideoStartResponse, mockVideoStatusResponse } from './mock.js';
import { getGenerationRuntimeSettings } from '../system-settings/service.js';

const router = Router();
const positiveIntOption = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : value;
}, z.number().int().positive().optional());

const imageSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  size: z.string().default('1024x1024'),
  quantity: z.number().int().min(1).max(10).default(1),
  endpointPath: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});

router.post('/image', requireAuth, asyncHandler(async (req, res) => {
  const body = imageSchema.parse(req.body);
  const model = await getModel(body.modelId, 'IMAGE');
  const cost = await calculateCreditsForUser(prisma, req.user!.id, model, { quantity: body.quantity, durationSeconds: 0, inputTokens: 0, outputTokens: 0, size: body.size, params: body.extra });
  await assertEnoughBalance(prisma, req.user!.id, cost.chargedCredits);

  const requestPayload = {
    model: model.name,
    prompt: body.prompt,
    size: body.size,
    n: body.quantity,
    response_format: 'url',
    ...(body.extra || {}),
  };
  const runtime = await getGenerationRuntimeSettings();

  try {
    const endpointPath = resolveEndpointPath(body.endpointPath || model.endpointPath || '/images/generations', { model: model.name });
    const upstream = runtime.generationMockMode
      ? mockImageResponse({ prompt: body.prompt, size: body.size, quantity: body.quantity })
      : await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
    const result = extractImageResult(upstream);
    const record = await prisma.$transaction(tx => recordUsageAndCharge(tx, {
      userId: req.user!.id,
      model,
      status: 'SUCCESS',
      quantity: body.quantity,
      durationSeconds: 0,
      inputTokens: 0,
      outputTokens: 0,
      size: body.size,
      params: body.extra,
      prompt: body.prompt,
      requestJson: requestPayload as Prisma.InputJsonValue,
      responseJson: upstream as Prisma.InputJsonValue,
      resultUrl: result.url,
      upstreamTaskId: String(upstream?.id || ''),
    }));
    ok(res, { result, upstream, usage: record.usage, balance: record.balance, chargedCredits: record.chargedCredits });
  } catch (err) {
    await recordFailedUsage(req.user!.id, model, body.prompt, requestPayload, err);
    throw err;
  }
}));

const videoSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(120),
  aspectRatio: z.string().default('9:16'),
  resolution: z.string().default('720p'),
  endpointPath: z.string().optional(),
  extra: z.record(z.unknown()).optional(),
});

router.post('/video/start', requireAuth, asyncHandler(async (req, res) => {
  const body = videoSchema.parse(req.body);
  const model = await getModel(body.modelId, 'VIDEO');
  const cost = await calculateCreditsForUser(prisma, req.user!.id, model, { quantity: 1, durationSeconds: body.durationSeconds, inputTokens: 0, outputTokens: 0, resolution: body.resolution, params: body.extra });
  await assertEnoughBalance(prisma, req.user!.id, cost.chargedCredits);

  const requestPayload = {
    model: model.name,
    prompt: body.prompt,
    duration: body.durationSeconds,
    seconds: body.durationSeconds,
    aspect_ratio: body.aspectRatio,
    resolution: body.resolution,
    ...(body.extra || {}),
  };
  const runtime = await getGenerationRuntimeSettings();

  try {
    const endpointPath = resolveEndpointPath(body.endpointPath || model.endpointPath || '/video/generations', { model: model.name });
    const upstream = runtime.generationMockMode
      ? mockVideoStartResponse({ prompt: body.prompt, durationSeconds: body.durationSeconds })
      : await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
    const taskId = extractVideoTask(upstream);
    if (!taskId) fail(502, '视频接口未返回 taskId', 'UPSTREAM_TASK_ID_MISSING');
    const record = await prisma.$transaction(tx => recordUsageAndCharge(tx, {
      userId: req.user!.id,
      model,
      status: 'SUCCESS',
      quantity: 1,
      durationSeconds: body.durationSeconds,
      inputTokens: 0,
      outputTokens: 0,
      resolution: body.resolution,
      params: body.extra,
      prompt: body.prompt,
      requestJson: requestPayload as Prisma.InputJsonValue,
      responseJson: upstream as Prisma.InputJsonValue,
      upstreamTaskId: taskId,
      resultUrl: String(upstream?.url || upstream?.video_url || ''),
    }));
    ok(res, { taskId, upstream, usage: record.usage, balance: record.balance, chargedCredits: record.chargedCredits });
  } catch (err) {
    await recordFailedUsage(req.user!.id, model, body.prompt, requestPayload, err);
    throw err;
  }
}));

const videoStatusSchema = z.object({
  modelId: z.string().min(1),
  taskId: z.string().min(1),
  usageId: z.string().optional(),
  endpointPath: z.string().optional(),
  method: z.enum(['GET', 'POST']).default('GET'),
  taskParam: z.string().default('taskId'),
  extra: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

router.post('/video/status', requireAuth, asyncHandler(async (req, res) => {
  const body = videoStatusSchema.parse(req.body);
  const model = await getModel(body.modelId, 'VIDEO');
  const runtime = await getGenerationRuntimeSettings();
  const endpointPath = resolveEndpointPath(body.endpointPath || model.statusEndpointPath || model.provider.statusEndpointPath || '/video/status', { model: model.name, taskId: body.taskId });
  const upstream = runtime.generationMockMode
    ? mockVideoStatusResponse(body.taskId)
    : body.method === 'GET'
      ? await callUpstreamGetJson(model.provider, endpointPath, { [body.taskParam]: body.taskId, ...(body.extra || {}) }, runtime.upstreamTimeoutMs)
      : await callUpstreamJson(model.provider, endpointPath, { [body.taskParam]: body.taskId, taskId: body.taskId, task_id: body.taskId, ...(body.extra || {}) }, runtime.upstreamTimeoutMs);

  const resultUrl = extractVideoResultUrl(upstream);
  const status = String(upstream?.status || upstream?.data?.status || '').toLowerCase();
  const done = ['success', 'succeeded', 'completed', 'done'].includes(status);
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(status);
  let refund: Awaited<ReturnType<typeof refundUsageCharge>> | null = null;
  if (body.usageId && failed) {
    refund = await prisma.$transaction(tx => refundUsageCharge(tx, {
      userId: req.user!.id,
      usageId: body.usageId!,
      responseJson: upstream as Prisma.InputJsonValue,
      resultUrl: resultUrl || undefined,
      errorMessage: extractVideoFailureMessage(upstream),
    }));
  } else if (body.usageId && (done || resultUrl)) {
    await prisma.modelUsage.updateMany({
      where: { id: body.usageId, userId: req.user!.id },
      data: { responseJson: upstream as Prisma.InputJsonValue, resultUrl: resultUrl || undefined },
    });
  }

  ok(res, { taskId: body.taskId, status: status || 'unknown', done, failed, resultUrl, upstream, ...(refund ? { refund } : {}) });
}));

const chatSchema = z.object({
  modelId: z.string().min(1),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(1).max(200000).default(4096),
  endpointPath: z.string().optional(),
  timeoutMs: positiveIntOption,
  upstreamTimeoutMs: positiveIntOption,
  requestTimeoutMs: positiveIntOption,
  queryTimeoutMs: positiveIntOption,
  extra: z.record(z.unknown()).default({}),
});

router.post('/llm/chat', requireAuth, asyncHandler(async (req, res) => {
  const body = chatSchema.parse(req.body);
  const model = await getModel(body.modelId, 'LLM');
  const promptText = body.messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const estimatedInputTokens = estimateTextTokens(promptText);
  const estimatedCost = await calculateCreditsForUser(prisma, req.user!.id, model, {
    quantity: 1,
    durationSeconds: 0,
    inputTokens: estimatedInputTokens,
    outputTokens: body.maxOutputTokens,
  });
  await assertEnoughBalance(prisma, req.user!.id, estimatedCost.chargedCredits);

  const runtime = await getGenerationRuntimeSettings();
  const endpointPath = resolveEndpointPath(body.endpointPath || model.endpointPath || model.provider.endpointPath || '/chat/completions', { model: model.name });
  const timeoutMs = resolveGenerateChatTimeoutMs(body, req, model.provider.timeoutMs, runtime.upstreamTimeoutMs);
  const requestPayload = buildGenerateChatPayload(model.name, endpointPath, body);

  try {
    const upstream = runtime.generationMockMode
      ? mockChatResponse(body.messages, estimatedInputTokens)
      : await callUpstreamJson(model.provider, endpointPath, requestPayload, timeoutMs);
    const text = extractGenerateChatText(upstream);
    const usage = upstream?.usage || {};
    const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || estimatedInputTokens);
    const outputTokens = Number(usage.completion_tokens || usage.output_tokens || estimateTextTokens(text));
    const record = await prisma.$transaction(tx => recordUsageAndCharge(tx, {
      userId: req.user!.id,
      model,
      status: 'SUCCESS',
      quantity: 1,
      durationSeconds: 0,
      inputTokens,
      outputTokens,
      prompt: promptText,
      requestJson: requestPayload as Prisma.InputJsonValue,
      responseJson: upstream as Prisma.InputJsonValue,
      upstreamTaskId: String(upstream?.id || ''),
    }));
    ok(res, { text, upstream, usage: record.usage, balance: record.balance, chargedCredits: record.chargedCredits });
  } catch (err) {
    await recordFailedUsage(req.user!.id, model, promptText, requestPayload, err);
    throw err;
  }
}));

async function getModel(modelId: string, type: 'IMAGE' | 'VIDEO' | 'LLM') {
  const model = await prisma.aiModel.findFirst({
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
  if (!model || (model.provider.status !== 'ACTIVE' && type !== 'LLM')) fail(404, '模型不可用', 'MODEL_NOT_FOUND');
  return model;
}

async function recordFailedUsage(userId: string, model: Awaited<ReturnType<typeof getModel>>, prompt: string, requestPayload: unknown, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.modelUsage.create({
    data: {
      userId,
      modelId: model.id,
      modelType: model.type,
      quantity: 1,
      durationSeconds: 0,
      status: 'FAILED',
      prompt,
      requestJson: requestPayload as Prisma.InputJsonValue,
      errorMessage: message,
    },
  }).catch(() => undefined);
}

function extractVideoFailureMessage(upstream: unknown) {
  const payload = upstream as { error?: { message?: unknown } | unknown; message?: unknown; data?: { error?: unknown; message?: unknown } };
  return String(
    (typeof payload.error === 'object' && payload.error && 'message' in payload.error ? payload.error.message : payload.error) ||
    payload.message ||
    payload.data?.error ||
    payload.data?.message ||
    '上游视频任务失败'
  );
}

function buildGenerateChatPayload(modelName: string, endpointPath: string, body: z.infer<typeof chatSchema>) {
  const upstreamExtra = sanitizeGenerateChatExtra(body.extra || {});
  if (isResponsesEndpoint(endpointPath)) {
    const instructions = body.messages
      .filter(message => String(message.role).toLowerCase() === 'system')
      .map(message => message.content)
      .filter(Boolean)
      .join('\n\n');
    const input = body.messages
      .filter(message => String(message.role).toLowerCase() !== 'system')
      .map(message => ({ role: normalizeResponsesRole(message.role), content: message.content }));
    return compactRequestJson({
      model: modelName,
      input: input.length ? input : body.messages.map(message => ({ role: 'user', content: message.content })),
      instructions: instructions || undefined,
      temperature: body.temperature,
      max_output_tokens: body.maxOutputTokens,
      ...upstreamExtra,
    });
  }
  return compactRequestJson({
    model: modelName,
    messages: body.messages,
    temperature: body.temperature,
    max_tokens: body.maxOutputTokens,
    ...upstreamExtra,
  });
}

function resolveGenerateChatTimeoutMs(body: z.infer<typeof chatSchema>, req: Request, providerTimeoutMs: number | null | undefined, runtimeTimeoutMs: number) {
  const requested = [
    body.timeoutMs,
    body.upstreamTimeoutMs,
    body.requestTimeoutMs,
    body.queryTimeoutMs,
    body.extra?.timeoutMs,
    body.extra?.upstreamTimeoutMs,
    req.get('X-Upstream-Timeout-Ms'),
    req.get('X-Request-Timeout-Ms'),
    req.get('X-Generation-Timeout-Ms'),
    req.get('X-Timeout-Ms'),
  ].map(asFiniteNumber).filter((value): value is number => Number.isFinite(value) && value > 0);
  const baseline = Math.max(Number(providerTimeoutMs || 0), Number(runtimeTimeoutMs || 0), 600000);
  return clampNumber(Math.max(baseline, ...requested), 1000, 1800000);
}

function sanitizeGenerateChatExtra(extra: Record<string, unknown>) {
  const blocked = new Set([
    'canvasNodeType',
    'canvasNodeId',
    'canvasPromptMode',
    'outputKind',
    'agentPackId',
    'agentMode',
    'agentTask',
    'preferStream',
    'stream',
    'streamMode',
    'timeoutMs',
    'upstreamTimeoutMs',
    'requestTimeoutMs',
    'queryTimeoutMs',
    'requireVisionInput',
    'disallowStringContentFallback',
    'visionContentFallback',
    'visionImageCount',
    'visionInlineImageCount',
    'textAgentRouteFailed',
  ]);
  return Object.fromEntries(Object.entries(extra || {}).filter(([key, value]) => !blocked.has(key) && value !== undefined));
}

function extractGenerateChatText(payload: any): string {
  return String(
    extractChatText(payload) ||
    payload?.output_text ||
    payload?.outputText ||
    payload?.content ||
    extractResponsesOutputText(payload) ||
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.text ||
    '',
  ).trim();
}

function extractResponsesOutputText(payload: any): string {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  const visit = (value: any) => {
    if (value == null) return;
    if (typeof value === 'string') {
      if (value.trim()) parts.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.text === 'string') parts.push(value.text);
    if (typeof value.content === 'string') parts.push(value.content);
    if (value.type === 'output_text' && typeof value.output_text === 'string') parts.push(value.output_text);
    visit(value.content);
  };
  output.forEach(visit);
  return parts.filter(Boolean).join('\n').trim();
}

function isResponsesEndpoint(endpointPath: string) {
  return /\/responses(?:\?|#|$)/i.test(String(endpointPath || ''));
}

function normalizeResponsesRole(role: string) {
  const value = String(role || '').toLowerCase();
  return value === 'assistant' ? 'assistant' : 'user';
}

function compactRequestJson<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')) as T;
}

function asFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(Math.floor(value), max));
}

function resolveEndpointPath(endpointPath: string, tokens: { model?: string; taskId?: string }) {
  return String(endpointPath || '')
    .replaceAll('{model}', encodeURIComponent(tokens.model || ''))
    .replaceAll('{baseModel}', encodeURIComponent(tokens.model || ''))
    .replaceAll('{taskId}', encodeURIComponent(tokens.taskId || ''))
    .replaceAll('{task_id}', encodeURIComponent(tokens.taskId || ''));
}

export default router;
