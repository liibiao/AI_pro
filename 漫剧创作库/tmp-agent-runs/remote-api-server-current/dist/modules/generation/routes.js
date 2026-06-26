import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { applyWalletDelta, assertEnoughBalance, calculateCreditsForPrincipal, estimateTextTokens } from '../../billing.js';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { fail, HttpError, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { buildEndpoint, callUpstreamGetJson, callUpstreamJson, extractChatText } from '../../upstream.js';
import { getGenerationRuntimeSettings } from '../system-settings/service.js';
import { generatedImageFilePath, getGenerationAdapter, isProtectedProviderResultUrl, materializeImageResultUrl, materializeMediaResultUrl } from './adapters/registry.js';
const router = Router();
const SERVER_OBJECT_STORAGE_MAX_ATTEMPTS = 3;
const GENERATION_TASK_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const ADMIN_GENERATION_RESULT_PAGE_SIZE = 20;
const GENERATION_TASK_READ_QUERY_THROTTLE_MS = 5000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
let generationReconcilerTimer = null;
const GENERATION_TASK_LIST_READ_REFRESH_LIMIT = 20;
const GENERATION_TASK_ADMIN_LIST_REFRESH_WAIT_MS = 8000;
const GENERATION_TASK_RECONCILE_LIMIT = 50;
const generationTaskListReadRefreshInFlight = new Set();
const llmDebugSessions = new Map();
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
const mjTaskOperationSchema = z.object({
    taskId: z.preprocess(value => Array.isArray(value) ? value[0] : value, z.string().trim().optional()),
    upstreamTaskId: z.preprocess(value => Array.isArray(value) ? value[0] : value, z.string().trim().optional()),
});
router.get('/results/:name', asyncHandler(async (req, res) => {
    const filePath = generatedImageFilePath(routeParam(req.params.name));
    if (!filePath)
        fail(404, '图片不存在', 'GENERATED_IMAGE_NOT_FOUND');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath, err => {
        if (err && !res.headersSent)
            res.status(404).json({ ok: false, error: '图片不存在', code: 'GENERATED_IMAGE_NOT_FOUND' });
    });
}));
router.post('/tasks', requireAuth, asyncHandler(async (req, res) => {
    const principal = personalPrincipalFromUser(req.user.id, 'CANVAS');
    const result = await createGenerationTaskForPrincipal(req, principal);
    ok(res, sanitizeGenerationTaskResponse(result));
}));
router.post('/tasks/record', requireAuth, asyncHandler(async (req, res) => {
    const body = taskRecordSchema.parse(req.body || {});
    const clientRequestId = normalizeClientRequestId(body.clientRequestId ||
        req.get('Idempotency-Key') ||
        req.get('X-Idempotency-Key') ||
        body.params.clientRequestId ||
        body.params.requestId);
    if (clientRequestId) {
        const existing = await findIdempotentTask(req.user.id, clientRequestId);
        if (existing) {
            ok(res, sanitizeGenerationTaskResponse({ task: existing, idempotent: true }));
            return;
        }
    }
    const { provider, model } = await getProviderAndModel(body.channelKey || '', body.modelId, body.type);
    const now = new Date();
    const task = await prisma.generationTask.create({
        data: {
            userId: req.user.id,
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
            inputFilesJson: body.inputFiles,
            paramsJson: body.params,
            requestJson: body.requestJson,
            responseJson: body.responseJson,
            upstreamTaskId: body.upstreamTaskId,
            upstreamRequestId: body.upstreamRequestId,
            resultJson: (body.resultJson || {}),
            resultUrlsJson: body.resultUrls,
            chargedCredits: 0,
            costAmount: 0,
            costUsd: new Prisma.Decimal(0),
            startedAt: now,
            completedAt: now,
        },
        include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
    });
    ok(res, sanitizeGenerationTaskResponse({ task }));
}));
router.get('/tasks', requireAuth, asyncHandler(async (req, res) => {
    const result = await listGenerationTasksForPrincipal(personalPrincipalFromUser(req.user.id, 'CANVAS'), req.query.limit, req.query.offset, {
        clientRequestId: req.query.clientRequestId,
    });
    ok(res, result);
}));
router.get('/tasks/:id', requireAuth, asyncHandler(async (req, res) => {
    const task = await getGenerationTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user.id, 'CANVAS'));
    ok(res, sanitizeGenerationTaskResponse({ task }));
}));
router.post('/tasks/:id/query', requireAuth, asyncHandler(async (req, res) => {
    const result = await queryGenerationTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user.id, 'CANVAS'));
    ok(res, sanitizeGenerationTaskResponse(result));
}));
router.get('/tasks/:id/mj/fetch', requireAuth, asyncHandler(async (req, res) => {
    const input = mjTaskOperationSchema.parse(req.query || {});
    const result = await manageMidjourneyTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user.id, 'CANVAS'), 'fetch', input);
    ok(res, result);
}));
router.post('/tasks/:id/mj/seed', requireAuth, asyncHandler(async (req, res) => {
    const input = mjTaskOperationSchema.parse(req.body || {});
    const result = await manageMidjourneyTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user.id, 'CANVAS'), 'seed', input);
    ok(res, result);
}));
router.post('/tasks/:id/mj/cancel', requireAuth, asyncHandler(async (req, res) => {
    const input = mjTaskOperationSchema.parse(req.body || {});
    const result = await manageMidjourneyTaskForPrincipal(routeParam(req.params.id), personalPrincipalFromUser(req.user.id, 'CANVAS'), 'cancel', input);
    ok(res, result);
}));
router.post('/tasks/:id/storage/retry', requireAuth, asyncHandler(async (req, res) => {
    const task = await prisma.generationTask.findFirst({
        where: { id: routeParam(req.params.id), userId: req.user.id },
        include: { provider: true, model: true },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    if (!isMaterializableResultType(task.type))
        fail(400, '只有图片/视频任务支持重新保存到 COS', 'GENERATION_STORAGE_RETRY_UNSUPPORTED');
    if (!shouldAsyncServerObjectStorageResults(task))
        fail(400, '当前任务不是 124 异步转存 COS 类型', 'GENERATION_STORAGE_RETRY_NOT_ASYNC');
    const urls = collectAsyncServerObjectStorageTemporaryUrls(task);
    if (!urls.length)
        fail(400, '当前任务没有可重新保存的临时资源地址', 'GENERATION_STORAGE_RETRY_NO_TEMP_URL');
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
    const session = {
        id: crypto.randomUUID(),
        userId: req.user.id,
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
    if (!session || session.userId !== req.user.id)
        fail(404, '调试会话不存在或已过期', 'LLM_DEBUG_SESSION_NOT_FOUND');
    ok(res, { session: publicLlmDebugSession(session) });
}));
async function runLlmDebugSession(sessionId, body) {
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
            messageCount: Array.isArray(requestJson.messages) ? requestJson.messages.length : 0,
            maxTokens: requestJson.max_tokens,
        });
        pushLlmDebugLog(sessionId, 'running', 'upstream.call', '开始请求上游：124 -> 中转站/模型服务', { endpoint });
        const upstream = await callUpstreamJson(provider, endpointPath, requestJson, timeoutMs);
        const latencyMs = Date.now() - startedAt;
        const text = extractChatText(upstream);
        patchLlmDebugSession(sessionId, {
            status: 'SUCCESS',
            completedAt: new Date().toISOString(),
            text,
            responseJson: upstream,
        });
        pushLlmDebugLog(sessionId, 'success', 'upstream.response', '上游已返回，文本已解析完成', {
            latencyMs,
            upstreamRequestId: String(upstream?.id || ''),
            upstreamModel: String(upstream?.model || ''),
            hasChoices: Array.isArray(upstream?.choices),
            textPreview: text.slice(0, 220),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patchLlmDebugSession(sessionId, {
            status: 'FAILED',
            completedAt: new Date().toISOString(),
            error: message,
        });
        pushLlmDebugLog(sessionId, 'failed', 'error', '调用链路失败', {
            message,
            code: err?.code || '',
            status: err?.status || err?.upstreamStatus || '',
            responseJson: err?.responseJson || null,
        });
    }
}
function buildLlmDebugRequestJson(body, modelName) {
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
function publicLlmDebugSession(session) {
    return {
        ...session,
        responseJson: sanitizeLlmDebugJson(session.responseJson),
    };
}
function pushLlmDebugLog(sessionId, status, step, message, detail) {
    const session = llmDebugSessions.get(sessionId);
    if (!session)
        return;
    session.updatedAt = new Date().toISOString();
    session.logs.push({ at: session.updatedAt, status, step, message, ...(detail !== undefined ? { detail: sanitizeLlmDebugJson(detail) } : {}) });
}
function patchLlmDebugSession(sessionId, patch) {
    const session = llmDebugSessions.get(sessionId);
    if (!session)
        return;
    Object.assign(session, patch, { updatedAt: new Date().toISOString() });
}
function cleanupLlmDebugSessions() {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, session] of llmDebugSessions.entries()) {
        if (new Date(session.updatedAt || session.createdAt).getTime() < cutoff)
            llmDebugSessions.delete(id);
    }
}
function compactDebugJson(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}
function withoutDebugKeys(value, keys) {
    const blocked = new Set(keys);
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => !blocked.has(key) && item !== undefined));
}
function sanitizeLlmDebugJson(value) {
    if (typeof value === 'string')
        return value.length > 5000 ? `${value.slice(0, 5000)}...` : value;
    if (Array.isArray(value))
        return value.map(item => sanitizeLlmDebugJson(item));
    if (!isRecord(value))
        return value;
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
        if (/api[-_]?key|authorization|token|secret|password/i.test(key)) {
            out[key] = item ? '***REDACTED***' : item;
            return;
        }
        out[key] = sanitizeLlmDebugJson(item);
    });
    return out;
}
function personalPrincipalFromUser(userId, apiTokenId) {
    return { type: 'PERSONAL_API', billingUserId: userId, userId, apiTokenId, discountMode: 'FOLLOW_USER_MEMBERSHIP' };
}
export async function createGenerationTaskForPrincipal(req, principal) {
    const body = taskSchema.parse(req.body);
    const clientRequestId = resolveClientRequestId(req, body);
    if (clientRequestId) {
        const existing = await findIdempotentTask(principal.billingUserId, clientRequestId);
        if (existing)
            return { task: existing, chargedCredits: existing.chargedCredits, idempotent: true };
    }
    const { provider, model } = await getProviderAndModel(body.channelKey, body.modelId, body.type);
    const normalizedParams = normalizeGenerationTaskParamsForModel(body.params, provider, model, body.type);
    const taskBody = { ...body, params: normalizedParams };
    const costInput = estimateTaskCostInput(taskBody);
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
                prompt: taskBody.prompt,
                negativePrompt: taskBody.negativePrompt,
                inputFilesJson: taskBody.inputFiles,
                paramsJson: taskBody.params,
                chargedCredits: 0,
                costAmount: 0,
                costUsd: new Prisma.Decimal(0),
            },
        });
    }
    catch (err) {
        const existing = clientRequestId ? await recoverIdempotentCreate(principal.billingUserId, clientRequestId, err) : null;
        if (existing)
            return { task: existing, chargedCredits: existing.chargedCredits, idempotent: true };
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
            type: taskBody.type,
            mode: taskBody.mode,
            prompt: taskBody.prompt,
            negativePrompt: taskBody.negativePrompt,
            inputFiles: taskBody.inputFiles,
            params: taskBody.params,
            timeoutMs: resolveGenerationTimeoutMs(body.type, provider.timeoutMs, runtime.upstreamTimeoutMs),
        });
        const shouldAsyncStore = isMaterializableResultType(body.type) && shouldAsyncServerObjectStorageResults({
            type: body.type,
            paramsJson: taskBody.params,
            requestJson: submit.requestJson,
            resultJson: submit.resultJson,
            responseJson: submit.responseJson,
        });
        if (isMaterializableResultType(body.type) && !shouldAsyncStore) {
            submit = await materializeImmediateImageSubmitResults(provider, submit, taskBody.params, body.type);
        }
        if (shouldAsyncStore)
            submit = markImageSubmitServerStoragePending(submit);
        const hasDirectResults = (submit.resultUrls || []).length > 0;
        const missingPollTarget = submit.status === 'RUNNING' && !submit.upstreamTaskId && !hasDirectResults;
        const status = submit.status === 'SUCCESS' || (submit.status === 'RUNNING' && !submit.upstreamTaskId && hasDirectResults)
            ? 'SUCCESS'
            : submit.status === 'FAILED' || missingPollTarget ? 'FAILED' : 'RUNNING';
        const billableCredits = status === 'FAILED' ? 0 : cost.chargedCredits;
        const updated = await prisma.$transaction(async (tx) => {
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
                    resultUrlsJson: submit.resultUrls,
                    errorCode: status === 'FAILED' ? submit.errorCode || (missingPollTarget ? 'UPSTREAM_TASK_ID_MISSING' : undefined) : null,
                    errorMessage: status === 'FAILED' ? submit.errorMessage || (missingPollTarget ? '上游响应没有返回任务 ID 或结果 URL，无法继续轮询；请检查该模型渠道的 adapter、statusEndpointPath 或响应字段映射' : undefined) : null,
                    startedAt: task.createdAt,
                    completedAt: status === 'SUCCESS' ? new Date() : undefined,
                    failedAt: status === 'FAILED' ? new Date() : null,
                },
            });
            let balance;
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
            return { generationTask, balance };
        }, GENERATION_TASK_TRANSACTION_OPTIONS);
        await writeProviderHealthLog({
            providerId: provider.id,
            modelId: model.id,
            taskId: task.id,
            status,
            latencyMs: Date.now() - startedAt,
            errorCode: submit.errorCode,
            errorMessage: submit.errorMessage,
        });
        if (status === 'SUCCESS' && shouldAsyncStore)
            scheduleServerObjectStorageMaterialize(updated.generationTask.id);
        return { task: updated.generationTask, balance: updated.balance, chargedCredits: billableCredits };
    }
    catch (err) {
        const adapterName = resolveGenerationAdapterName(provider, model);
        const baseMessage = err instanceof Error ? err.message : String(err);
        const message = `${baseMessage} [generation-route channel=${provider.providerKey} requestedModelId=${body.modelId} dbModel=${model.id}/${model.name}/${model.type} adapter=${adapterName}]`;
        const errorCode = err instanceof HttpError && err.code ? err.code : 'GENERATION_SUBMIT_FAILED';
        const failedTask = await prisma.generationTask.update({
            where: { id: task.id },
            data: {
                status: 'FAILED',
                chargedCredits: 0,
                costAmount: 0,
                costUsd: new Prisma.Decimal(0),
                errorCode,
                errorMessage: message,
                failedAt: new Date(),
            },
        });
        await writeProviderHealthLog({
            providerId: provider.id,
            modelId: model.id,
            taskId: task.id,
            status: 'FAILED',
            latencyMs: Date.now() - startedAt,
            errorCode,
            errorMessage: message,
        });
        return { task: failedTask, chargedCredits: 0 };
    }
    finally {
        stopSubmitHeartbeat();
    }
}
export async function listGenerationTasksForPrincipal(principal, limit, offset = 0, filters = {}) {
    const take = Math.min(Math.max(Number(limit || 100), 1), 300);
    const skip = Math.min(Math.max(Number(offset || 0), 0), 100000);
    const ownerUserId = principal.billingUserId;
    const clientRequestId = normalizeClientRequestId(filters.clientRequestId);
    const where = {
        userId: ownerUserId,
        ...(clientRequestId ? { clientRequestId } : {}),
    };
    const [tasks, total] = await Promise.all([
        prisma.generationTask.findMany({
            where,
            select: generationTaskListSelect({ includeUser: false, includeRefunds: false }),
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        }),
        prisma.generationTask.count({ where }),
    ]);
    let pageTasks = tasks;
    if (await refreshGenerationTaskListOnRead(tasks, ownerUserId)) {
        pageTasks = await prisma.generationTask.findMany({
            where,
            select: generationTaskListSelect({ includeUser: false, includeRefunds: false }),
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        });
    }
    const items = pageTasks.filter(task => task.userId === ownerUserId).map(task => sanitizeGenerationTaskListItem(task));
    return { items, pagination: { limit: take, offset: skip, total, hasMore: skip + items.length < total } };
}
export async function getGenerationTaskForPrincipal(id, principal) {
    const task = await prisma.generationTask.findFirst({
        where: { id, userId: principal.billingUserId },
        include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    if (await refreshGenerationTaskOnRead(task, principal.billingUserId)) {
        const latest = await prisma.generationTask.findFirst({
            where: { id, userId: principal.billingUserId },
            include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
        });
        if (latest)
            return latest;
    }
    return task;
}
export async function queryGenerationTaskForPrincipal(id, principal) {
    const task = await prisma.generationTask.findFirst({
        where: { id, userId: principal.billingUserId },
        include: { provider: true, model: true },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    return queryAndUpdateGenerationTask(task);
}
async function refreshGenerationTaskOnRead(task, ownerUserId) {
    if (!shouldRefreshGenerationTaskOnRead(task))
        return false;
    try {
        const runtimeTask = await prisma.generationTask.findFirst({
            where: { id: task.id, ...(ownerUserId ? { userId: ownerUserId } : {}) },
            include: { provider: true, model: true },
        });
        if (!runtimeTask || !shouldRefreshGenerationTaskOnRead(runtimeTask))
            return false;
        await queryAndUpdateGenerationTask(runtimeTask);
        return true;
    }
    catch (err) {
        console.warn(`[generation-read-refresh] task ${task.id} skipped:`, err instanceof Error ? err.message : err);
        return false;
    }
}
async function refreshGenerationTaskListOnRead(tasks, ownerUserId, options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || GENERATION_TASK_LIST_READ_REFRESH_LIMIT), GENERATION_TASK_LIST_READ_REFRESH_LIMIT));
    const candidates = tasks
        .filter(task => shouldRefreshGenerationTaskOnRead(task))
        .filter(task => !generationTaskListReadRefreshInFlight.has(task.id))
        .slice(0, limit);
    if (!candidates.length)
        return false;
    if (options.wait) {
        const results = await Promise.all(candidates.map(task => {
            const refresh = refreshGenerationTaskListCandidate(task, ownerUserId);
            return options.maxWaitMs
                ? waitForGenerationTaskListRefresh(refresh, options.maxWaitMs)
                : refresh;
        }));
        return results.some(Boolean);
    }
    for (const task of candidates) {
        refreshGenerationTaskListCandidate(task, ownerUserId)
            .catch(err => {
            console.warn(`[generation-read-refresh] async task ${task.id} skipped:`, err instanceof Error ? err.message : err);
        });
    }
    return false;
}
async function refreshGenerationTaskListCandidate(task, ownerUserId) {
    if (generationTaskListReadRefreshInFlight.has(task.id))
        return false;
    generationTaskListReadRefreshInFlight.add(task.id);
    try {
        return await refreshGenerationTaskOnRead(task, ownerUserId);
    }
    finally {
        generationTaskListReadRefreshInFlight.delete(task.id);
    }
}
function waitForGenerationTaskListRefresh(promise, maxWaitMs) {
    return new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            resolve(false);
        }, Math.max(1, maxWaitMs));
        timer.unref?.();
        promise
            .then(value => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        })
            .catch(err => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(false);
            }
            console.warn('[generation-read-refresh] waited task skipped:', err instanceof Error ? err.message : err);
        });
    });
}
function shouldRefreshGenerationTaskOnRead(task) {
    if (isTerminalStatus(String(task.status || '')) && !canRecoverRefundedQueryFailure(task))
        return false;
    if (!task.upstreamTaskId)
        return false;
    const updatedAt = task.updatedAt instanceof Date ? task.updatedAt.getTime() : new Date(task.updatedAt).getTime();
    return !Number.isFinite(updatedAt) || Date.now() - updatedAt >= GENERATION_TASK_READ_QUERY_THROTTLE_MS;
}
function generationTaskListSelect(options) {
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
    };
}
function generationTaskCategoryScanSelect() {
    return {
        id: true,
        type: true,
        mode: true,
        paramsJson: true,
    };
}
function generationTaskReportSelect() {
    return {
        id: true,
        createdAt: true,
        type: true,
        mode: true,
        status: true,
        chargedCredits: true,
        refundCredits: true,
        paramsJson: true,
        resultJson: true,
    };
}
function generationTaskLightListSelect(options) {
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
        upstreamTaskId: true,
        upstreamRequestId: true,
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
    };
}
function queryText(value) {
    if (Array.isArray(value))
        return String(value[0] || '').trim();
    return String(value || '').trim();
}
function adminGenerationResultPageParams(query) {
    const offset = Math.min(Math.max(Number(query.offset || 0), 0), 100000);
    return { take: ADMIN_GENERATION_RESULT_PAGE_SIZE, skip: offset };
}
function currentShanghaiDateParts() {
    const local = new Date(Date.now() + SHANGHAI_UTC_OFFSET_MS);
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
    };
}
function formatDateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function formatMonthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}
function parseDateKey(value) {
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day))
        return null;
    if (year < 2000 || year > 2100 || month < 1 || month > 12)
        return null;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > days)
        return null;
    return { year, month, day };
}
function parseMonthKey(value) {
    const match = value.match(/^(\d{4})-(\d{1,2})$/);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month))
        return null;
    if (year < 2000 || year > 2100 || month < 1 || month > 12)
        return null;
    return { year, month };
}
function shanghaiLocalStartUtc(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MS);
}
function addShanghaiDays(year, month, day, days) {
    const local = new Date(Date.UTC(year, month - 1, day + days));
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
    };
}
function buildMonthBucketKeys(year, month) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: days }, (_, index) => formatDateKey(year, month, index + 1));
}
function shanghaiDateKey(date) {
    const local = new Date(date.getTime() + SHANGHAI_UTC_OFFSET_MS);
    return formatDateKey(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}
function adminGenerationDateRange(query, fallbackToCurrentMonth = false) {
    const periodRaw = queryText(query.period);
    const hasDay = Boolean(queryText(query.date) || queryText(query.day));
    const hasMonth = Boolean(queryText(query.month));
    const period = periodRaw === 'day' || periodRaw === 'month'
        ? periodRaw
        : hasDay
            ? 'day'
            : hasMonth || fallbackToCurrentMonth
                ? 'month'
                : '';
    if (!period)
        return null;
    const now = currentShanghaiDateParts();
    if (period === 'day') {
        const parsed = parseDateKey(queryText(query.date) || queryText(query.day)) || now;
        const endParts = addShanghaiDays(parsed.year, parsed.month, parsed.day, 1);
        const label = formatDateKey(parsed.year, parsed.month, parsed.day);
        return {
            period,
            start: shanghaiLocalStartUtc(parsed.year, parsed.month, parsed.day),
            end: shanghaiLocalStartUtc(endParts.year, endParts.month, endParts.day),
            label,
            bucketKeys: [label],
        };
    }
    const parsedMonth = parseMonthKey(queryText(query.month)) || { year: now.year, month: now.month };
    const endMonth = parsedMonth.month === 12
        ? { year: parsedMonth.year + 1, month: 1 }
        : { year: parsedMonth.year, month: parsedMonth.month + 1 };
    return {
        period,
        start: shanghaiLocalStartUtc(parsedMonth.year, parsedMonth.month, 1),
        end: shanghaiLocalStartUtc(endMonth.year, endMonth.month, 1),
        label: formatMonthKey(parsedMonth.year, parsedMonth.month),
        bucketKeys: buildMonthBucketKeys(parsedMonth.year, parsedMonth.month),
    };
}
function buildAdminGenerationTaskFilters(query, fallbackToCurrentMonth = false) {
    const status = queryText(query.status);
    const channelKey = queryText(query.channelKey);
    const userId = queryText(query.userId);
    const type = queryText(query.type);
    const mode = queryText(query.mode);
    const category = queryText(query.category);
    const requestedCategory = resolveAdminGenerationResultCategory(category, mode, type);
    const dateRange = adminGenerationDateRange(query, fallbackToCurrentMonth);
    const where = {};
    if (status)
        where.status = status;
    if (channelKey)
        where.channelKey = channelKey;
    if (userId)
        where.userId = userId;
    if (type) {
        where.type = type;
    }
    else if (requestedCategory === 'VIDEO') {
        where.type = 'VIDEO';
    }
    else if (requestedCategory) {
        where.type = 'IMAGE';
    }
    if (mode && !requestedCategory)
        where.mode = { contains: mode, mode: 'insensitive' };
    if (dateRange)
        where.createdAt = { gte: dateRange.start, lt: dateRange.end };
    return { where, requestedCategory, dateRange };
}
function reportStatusKind(status) {
    const raw = String(status || '').toUpperCase();
    if (raw === 'SUCCESS')
        return 'success';
    if (['FAILED', 'TIMEOUT', 'CANCELLED'].includes(raw))
        return 'failed';
    if (raw === 'REFUNDED')
        return 'refunded';
    return 'pending';
}
function emptyGenerationReportBucket(date) {
    return {
        key: date,
        date,
        label: date.slice(5),
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        refundedCount: 0,
        imageCount: 0,
        videoCount: 0,
        chargedCredits: 0,
        refundCredits: 0,
    };
}
function aggregateGenerationReport(tasks, dateRange) {
    const byDate = new Map(dateRange.bucketKeys.map(key => [key, emptyGenerationReportBucket(key)]));
    const summary = {
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        refundedCount: 0,
        imageCount: 0,
        videoCount: 0,
        chargedCredits: 0,
        refundCredits: 0,
    };
    const statusBreakdown = new Map();
    for (const task of tasks) {
        const key = shanghaiDateKey(task.createdAt);
        const bucket = byDate.get(key);
        if (!bucket)
            continue;
        const kind = reportStatusKind(task.status);
        summary.totalCount += 1;
        bucket.totalCount += 1;
        if (task.type === 'VIDEO') {
            summary.videoCount += 1;
            bucket.videoCount += 1;
        }
        else if (task.type === 'IMAGE') {
            summary.imageCount += 1;
            bucket.imageCount += 1;
        }
        if (kind === 'success') {
            summary.successCount += 1;
            bucket.successCount += 1;
        }
        else if (kind === 'failed') {
            summary.failedCount += 1;
            bucket.failedCount += 1;
        }
        else if (kind === 'refunded') {
            summary.refundedCount += 1;
            bucket.refundedCount += 1;
        }
        else {
            summary.pendingCount += 1;
            bucket.pendingCount += 1;
        }
        const chargedCredits = Number(task.chargedCredits || 0);
        const refundCredits = Number(task.refundCredits || 0);
        summary.chargedCredits += chargedCredits;
        summary.refundCredits += refundCredits;
        bucket.chargedCredits += chargedCredits;
        bucket.refundCredits += refundCredits;
        statusBreakdown.set(task.status, (statusBreakdown.get(task.status) || 0) + 1);
    }
    return {
        summary,
        daily: Array.from(byDate.values()),
        statusBreakdown: Array.from(statusBreakdown.entries())
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    };
}
function numberFromSqlAggregate(value) {
    if (typeof value === 'bigint')
        return Number(value);
    const num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
}
function aggregateGenerationReportRows(rows, dateRange) {
    const byDate = new Map(dateRange.bucketKeys.map(key => [key, emptyGenerationReportBucket(key)]));
    const summary = {
        totalCount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
        refundedCount: 0,
        imageCount: 0,
        videoCount: 0,
        chargedCredits: 0,
        refundCredits: 0,
    };
    const statusBreakdown = new Map();
    for (const row of rows) {
        const bucket = byDate.get(row.date_key);
        if (!bucket)
            continue;
        const totalCount = numberFromSqlAggregate(row.total_count);
        const chargedCredits = numberFromSqlAggregate(row.charged_credits);
        const refundCredits = numberFromSqlAggregate(row.refund_credits);
        const status = String(row.status || '');
        const type = String(row.type || '').toUpperCase();
        const kind = reportStatusKind(status);
        summary.totalCount += totalCount;
        bucket.totalCount += totalCount;
        if (type === 'VIDEO') {
            summary.videoCount += totalCount;
            bucket.videoCount += totalCount;
        }
        else if (type === 'IMAGE') {
            summary.imageCount += totalCount;
            bucket.imageCount += totalCount;
        }
        if (kind === 'success') {
            summary.successCount += totalCount;
            bucket.successCount += totalCount;
        }
        else if (kind === 'failed') {
            summary.failedCount += totalCount;
            bucket.failedCount += totalCount;
        }
        else if (kind === 'refunded') {
            summary.refundedCount += totalCount;
            bucket.refundedCount += totalCount;
        }
        else {
            summary.pendingCount += totalCount;
            bucket.pendingCount += totalCount;
        }
        summary.chargedCredits += chargedCredits;
        summary.refundCredits += refundCredits;
        bucket.chargedCredits += chargedCredits;
        bucket.refundCredits += refundCredits;
        statusBreakdown.set(status, (statusBreakdown.get(status) || 0) + totalCount);
    }
    return {
        summary,
        daily: Array.from(byDate.values()),
        statusBreakdown: Array.from(statusBreakdown.entries())
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    };
}
function needsAdminGenerationCategoryScan(category) {
    return Boolean(category && !['IMAGE', 'VIDEO'].includes(category));
}
router.get('/admin/tasks', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
    const { take, skip } = adminGenerationResultPageParams(req.query);
    const { where, requestedCategory } = buildAdminGenerationTaskFilters(req.query);
    if (requestedCategory) {
        if (requestedCategory === 'IMAGE' || requestedCategory === 'VIDEO') {
            const [tasks, total] = await Promise.all([
                prisma.generationTask.findMany({
                    where,
                    select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take,
                }),
                prisma.generationTask.count({ where }),
            ]);
            let pageTasks = tasks;
            if (await refreshGenerationTaskListOnRead(tasks, undefined, {
                wait: true,
                limit: ADMIN_GENERATION_RESULT_PAGE_SIZE,
                maxWaitMs: GENERATION_TASK_ADMIN_LIST_REFRESH_WAIT_MS,
            })) {
                pageTasks = await prisma.generationTask.findMany({
                    where,
                    select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take,
                });
            }
            ok(res, {
                items: pageTasks.map(task => sanitizeGenerationTaskListItem(task, requestedCategory)),
                pagination: adminGenerationPagination(take, skip, total, skip + tasks.length < total),
            });
            return;
        }
        const result = await findAdminGenerationTaskPage(where, skip, take, task => generationTaskAdminCategory(task) === requestedCategory);
        ok(res, {
            items: result.items.map(task => sanitizeGenerationTaskListItem(task, requestedCategory)),
            pagination: result.pagination,
        });
        return;
    }
    const [tasks, total] = await Promise.all([
        prisma.generationTask.findMany({
            where,
            select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        }),
        prisma.generationTask.count({ where }),
    ]);
    let pageTasks = tasks;
    if (await refreshGenerationTaskListOnRead(tasks, undefined, {
        wait: true,
        limit: ADMIN_GENERATION_RESULT_PAGE_SIZE,
        maxWaitMs: GENERATION_TASK_ADMIN_LIST_REFRESH_WAIT_MS,
    })) {
        pageTasks = await prisma.generationTask.findMany({
            where,
            select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        });
    }
    ok(res, {
        items: pageTasks.map(task => sanitizeGenerationTaskListItem(task)),
        pagination: adminGenerationPagination(take, skip, total, skip + pageTasks.length < total),
    });
}));
function adminGenerationPagination(limit, offset, total, hasMore) {
    return { limit, offset, total, hasMore };
}
async function findAdminGenerationTaskPage(where, offset, take, predicate) {
    const ids = [];
    const chunkSize = 100;
    const maxScanned = 10000;
    let scanned = 0;
    let matched = 0;
    while (ids.length < take + 1 && scanned < maxScanned) {
        const tasks = await prisma.generationTask.findMany({
            where,
            select: generationTaskCategoryScanSelect(),
            orderBy: { createdAt: 'desc' },
            skip: scanned,
            take: Math.min(chunkSize, maxScanned - scanned),
        });
        if (!tasks.length)
            break;
        tasks.forEach(task => {
            if (!predicate(task))
                return;
            if (matched >= offset)
                ids.push(String(task.id));
            matched += 1;
        });
        scanned += tasks.length;
    }
    const hasMore = ids.length > take;
    const uniqueIds = Array.from(new Set(ids.slice(0, take)));
    const total = offset + uniqueIds.length + (hasMore ? take : 0);
    if (!uniqueIds.length) {
        return { items: [], pagination: adminGenerationPagination(take, offset, total, hasMore) };
    }
    let tasks = await prisma.generationTask.findMany({
        where: { id: { in: uniqueIds } },
        select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
    });
    if (await refreshGenerationTaskListOnRead(tasks, undefined, {
        wait: true,
        limit: ADMIN_GENERATION_RESULT_PAGE_SIZE,
        maxWaitMs: GENERATION_TASK_ADMIN_LIST_REFRESH_WAIT_MS,
    })) {
        tasks = await prisma.generationTask.findMany({
            where: { id: { in: uniqueIds } },
            select: generationTaskLightListSelect({ includeUser: true, includeRefunds: true }),
        });
    }
    const byId = new Map(tasks.map(task => [task.id, task]));
    const items = uniqueIds.map(id => byId.get(id)).filter(Boolean);
    return { items, pagination: adminGenerationPagination(take, offset, total, hasMore) };
}
function adminGenerationReportSqlWhere(query, dateRange, requestedCategory) {
    const status = queryText(query.status);
    const channelKey = queryText(query.channelKey);
    const userId = queryText(query.userId);
    const rawType = queryText(query.type).toUpperCase();
    const mode = queryText(query.mode);
    const conditions = [
        Prisma.sql `"created_at" >= ${dateRange.start}`,
        Prisma.sql `"created_at" < ${dateRange.end}`,
    ];
    if (status)
        conditions.push(Prisma.sql `"status" = ${status}::"GenerationTaskStatus"`);
    if (channelKey)
        conditions.push(Prisma.sql `"channel_key" = ${channelKey}`);
    if (userId)
        conditions.push(Prisma.sql `"user_id" = ${userId}`);
    const type = rawType || (requestedCategory === 'VIDEO' ? 'VIDEO' : requestedCategory ? 'IMAGE' : '');
    if (type)
        conditions.push(Prisma.sql `"type" = ${type}::"ModelType"`);
    if (mode && !requestedCategory)
        conditions.push(Prisma.sql `"mode" ILIKE ${`%${mode}%`}`);
    return Prisma.join(conditions, ' AND ');
}
async function aggregateAdminGenerationReportWithSql(query, dateRange, requestedCategory) {
    if (needsAdminGenerationCategoryScan(requestedCategory))
        return null;
    const whereSql = adminGenerationReportSqlWhere(query, dateRange, requestedCategory);
    const rows = await prisma.$queryRaw `
    SELECT
      to_char(("created_at" + interval '8 hours')::date, 'YYYY-MM-DD') AS date_key,
      "type"::text AS type,
      "status"::text AS status,
      COUNT(*)::bigint AS total_count,
      COALESCE(SUM("charged_credits"), 0)::bigint AS charged_credits,
      COALESCE(SUM("refund_credits"), 0)::bigint AS refund_credits
    FROM "generation_tasks"
    WHERE ${whereSql}
    GROUP BY 1, 2, 3
    ORDER BY 1 ASC
  `;
    return aggregateGenerationReportRows(rows, dateRange);
}
router.get('/admin/tasks/report', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
    const { where, requestedCategory, dateRange } = buildAdminGenerationTaskFilters(req.query, true);
    if (!dateRange)
        fail(400, '统计周期参数无效', 'GENERATION_REPORT_PERIOD_INVALID');
    const sqlReport = await aggregateAdminGenerationReportWithSql(req.query, dateRange, requestedCategory);
    const report = sqlReport || aggregateGenerationReport((needsAdminGenerationCategoryScan(requestedCategory)
        ? (await prisma.generationTask.findMany({
            where,
            select: generationTaskReportSelect(),
            orderBy: { createdAt: 'asc' },
        })).filter(task => generationTaskAdminCategory(task) === requestedCategory)
        : []), dateRange);
    ok(res, {
        category: requestedCategory,
        scope: 'range',
        period: dateRange.period,
        label: dateRange.label,
        startAt: dateRange.start.toISOString(),
        endAt: dateRange.end.toISOString(),
        ...report,
    });
}));
router.get('/admin/tasks/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
    let task = await prisma.generationTask.findUnique({
        where: { id: routeParam(req.params.id) },
        include: { user: { select: { id: true, nickname: true, phone: true } }, model: true, provider: { select: { id: true, providerKey: true, name: true } }, refunds: true },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    if (await refreshGenerationTaskOnRead(task)) {
        task = await prisma.generationTask.findUnique({
            where: { id: routeParam(req.params.id) },
            include: { user: { select: { id: true, nickname: true, phone: true } }, model: true, provider: { select: { id: true, providerKey: true, name: true } }, refunds: true },
        });
        if (!task)
            fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    }
    ok(res, { task: sanitizeGenerationTaskDetailItem(task) });
}));
const refundSchema = z.object({
    reason: z.string().optional(),
});
router.post('/admin/tasks/:id/refund', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
    const body = refundSchema.parse(req.body || {});
    const refund = await prisma.$transaction(tx => refundGenerationTask(tx, {
        taskId: routeParam(req.params.id),
        source: 'ADMIN',
        operatorId: req.user.id,
        reason: body.reason || '后台人工退款',
    }));
    ok(res, refund);
}));
export function startGenerationTaskReconciler() {
    if (!config.generationReconcileEnabled || generationReconcilerTimer)
        return;
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
    const queryBefore = new Date(Date.now() - GENERATION_TASK_READ_QUERY_THROTTLE_MS);
    const tasks = await prisma.generationTask.findMany({
        where: {
            status: { in: ['CREATED', 'PENDING', 'RUNNING'] },
            OR: [
                {
                    AND: [
                        { upstreamTaskId: { not: null } },
                        { upstreamTaskId: { not: '' } },
                        { updatedAt: { lt: queryBefore } },
                    ],
                },
                {
                    OR: [
                        { upstreamTaskId: null },
                        { upstreamTaskId: '' },
                    ],
                    updatedAt: { lt: staleBefore },
                },
            ],
        },
        include: { provider: true, model: true },
        orderBy: { updatedAt: 'asc' },
        take: GENERATION_TASK_RECONCILE_LIMIT,
    });
    let queried = 0;
    let closed = 0;
    let refunded = 0;
    for (const task of tasks) {
        try {
            if (task.upstreamTaskId) {
                queried += 1;
                const result = await queryAndUpdateGenerationTask(task);
                if ('refund' in result && result.refund?.refundedCredits)
                    refunded += Number(result.refund.refundedCredits || 0);
                continue;
            }
            if (isFreshGenerationSubmit(task))
                continue;
            const result = await closeInterruptedGenerationTask(task);
            closed += 1;
            if (result.refund?.refundedCredits)
                refunded += Number(result.refund.refundedCredits || 0);
        }
        catch (err) {
            console.warn(`[generation-reconciler] task ${task.id} skipped:`, err instanceof Error ? err.message : err);
        }
    }
    return { checked: tasks.length, queried, closed, refunded };
}
async function getProviderAndModel(channelKey, modelId, type) {
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
    if (!provider)
        fail(404, `渠道不可用：找不到 channelKey=${channelKey || '-'}，modelId=${modelId || '-'}，type=${type}`, 'PROVIDER_NOT_FOUND');
    const candidates = provider.models.filter(item => item.status === 'ACTIVE' && item.type === type);
    const model = candidates.find(item => item.id === modelId)
        || candidates.find(item => item.modelKey === modelId)
        || candidates.find(item => item.name === modelId)
        || candidates.find(item => item.displayName === modelId);
    if (!model)
        fail(404, `模型不可用：channelKey=${channelKey || '-'} 下找不到 ACTIVE ${type} 模型 modelId=${modelId || '-'}`, 'MODEL_NOT_FOUND');
    if (provider.status !== 'ACTIVE' && type !== 'LLM')
        fail(404, `渠道不可用：channelKey=${channelKey || '-'} 当前状态为 ${provider.status}，modelId=${modelId || '-'}，type=${type}`, 'PROVIDER_DISABLED');
    return { provider, model };
}
function resolveGenerationAdapterName(provider, model) {
    const configured = String(model.adapter || provider.adapter || '').trim();
    const configuredLower = configured.toLowerCase();
    const modelProtocol = model.protocol && typeof model.protocol === 'object' && !Array.isArray(model.protocol) ? model.protocol : {};
    const modelHint = [
        provider.providerKey,
        provider.name,
        model.modelKey,
        model.name,
        model.displayName,
        model.endpointPath,
        model.statusEndpointPath,
        modelProtocol.endpointPath,
        modelProtocol.endpoint_path,
        modelProtocol.statusEndpointPath,
        modelProtocol.status_endpoint_path,
    ].join(' ').toLowerCase();
    const hint = [
        provider.providerKey,
        provider.name,
        provider.baseUrl,
        provider.endpointPath,
        provider.statusEndpointPath,
        model.modelKey,
        model.name,
        model.displayName,
        model.endpointPath,
        model.statusEndpointPath,
        modelProtocol.endpointPath,
        modelProtocol.endpoint_path,
        modelProtocol.statusEndpointPath,
        modelProtocol.status_endpoint_path,
        configured,
    ].join(' ').toLowerCase();
    if (configuredLower === 'aiyunzhi-gpt-image-2' || isAiyunzhiGptImage2Hint(modelHint, hint, configuredLower))
        return 'aiyunzhi-gpt-image-2';
    if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image')
        return configuredLower;
    if (configuredLower === 'aiyunzhi-firefly-gpt-image')
        return 'aiyunzhi-firefly-gpt-image';
    if (hint.includes('aiyunzhi-firefly-gpt-image') || hint.includes('firefly-gpt-image'))
        return 'aiyunzhi-firefly-gpt-image';
    if (configuredLower === 'gpt-image-v2')
        return 'gpt-image-v2';
    if (configuredLower === 'openai-image' || configuredLower === 'openai-generations' || configuredLower === 'openai-edits')
        return configuredLower;
    if (configuredLower === 'gpt-image' || configuredLower === 'gpt-image-2')
        return 'openai-edits';
    if (hint.includes('gpt-image-v2') || hint.includes('gpt image v2') || hint.includes('gpt-image- v2'))
        return 'gpt-image-v2';
    if (isGptImage2GenerationHint(modelHint, hint, configuredLower))
        return 'openai-edits';
    if (configuredLower === 'aistartlab-video'
        || configuredLower === 'aistarslab-video'
        || configuredLower === 'ai-start-lab-video'
        || hint.includes('aistartlab')
        || hint.includes('aistarslab')
        || hint.includes('api.video.aistarslab.com'))
        return 'aistartlab-video';
    if (configuredLower === 'seedance-full'
        || hint.includes('seedance-full')
        || hint.includes('sz-seedance2')
        || hint.includes('103.236.54.113:8081')
        || hint.includes('/seedance-full/generate')
        || hint.includes('/seedance-full/task'))
        return 'seedance-full';
    if (configuredLower === 'seedance-task' || hint.includes('seedance-task') || hint.includes('aiid-seedance') || hint.includes('doubao-seedance-2-0'))
        return 'seedance-task';
    if (configuredLower === 'lingdong-sd-2-vip' || configuredLower === 'sd-2-vip' || hint.includes('lingdong-sd-2-vip') || hint.includes('lingdongapi.com') || /\bsd-2-vip\b/.test(hint))
        return 'lingdong-sd-2-vip';
    if (configuredLower === 'zaomeng-seedance2'
        || configuredLower === 'zaomeng-seedance2-svip'
        || configuredLower === 'zaomeng-seedance2-fast'
        || hint.includes('zaomeng-seedance2')
        || hint.includes('造梦')
        || hint.includes('winter-cell-1964.as522254919.workers.dev')
        || hint.includes('seedance-2.0-svip')
        || hint.includes('seedance-2.0-fast'))
        return 'zaomeng-seedance2';
    if (configuredLower === 'toapis-seedance2'
        || configuredLower === 'toapis-seedance-2'
        || configuredLower === 'seedance2-toapis'
        || hint.includes('toapis-seedance')
        || hint.includes('toapis.com'))
        return 'toapis-seedance2';
    if (hint.includes('seedance2.0-vip') || hint.includes('seedance2-vip') || hint.includes('seedance 2.0 vip'))
        return 'seedance2-vip';
    if (configuredLower === 'seedance2-vip' || configuredLower === 'seedance2.0-vip')
        return 'seedance2-vip';
    if (configuredLower === 'seedance2-sd' || configuredLower === 'sd-seedance2' || configuredLower === 'sd-video' || /\bsd2-(?:720p|1080p)(?:-fast)?\b/.test(hint) || (hint.includes('aiyunzhi.top') && /seedance|sd2|\/video\/generations/.test(hint)))
        return 'seedance2-sd';
    if (configuredLower === 'seedance2' || configuredLower === 'seedance2.0' || hint.includes('seedance2') || hint.includes('seedance 2') || hint.includes('seedance-2'))
        return 'seedance2';
    if (configuredLower === 'sora-video-pro' || hint.includes('sora-video-pro') || hint.includes('video-pro-720p') || hint.includes('artifex'))
        return 'sora-video-pro';
    if (['gemini-image-generate', 'gemini-image-edit', 'gemini-video', 'veo-video', 'gemini-chat', 'gemini-llm', 'veo-chat', 'veo-3.1', 'grok-video', 'grok_image', 'grok-image-unified', 'grok-image', 'grok-image-edit', 'grok-chat', 'grok-llm', 'openai-responses-image', 'openai-chat-image', 'aiyunzhi-firefly-gpt-image', 'aiyunzhi-gpt-image-2', 'sora-video-pro', 'seedance-task', 'seedance-full', 'fullblood-video', 'seedance2', 'seedance2.0', 'seedance2-sd', 'sd-seedance2', 'sd-video', 'toapis-seedance2'].includes(configuredLower))
        return configuredLower;
    if (modelHint.includes('sora-v3') || modelHint.includes('sora v3') || modelHint.includes('sora-2') || modelHint.includes('sora 2'))
        return 'sora-video';
    if (configuredLower === 'sora-video' || configuredLower === 'notevideo')
        return 'sora-video';
    if (configuredLower === 'gemini-image')
        return 'gemini-image';
    if (hint.includes('gemini') && hint.includes('image') && (hint.includes('edit') || hint.includes('图生图')))
        return 'gemini-image-edit';
    if (hint.includes('gemini') && hint.includes('image') && (hint.includes('unified') || hint.includes('统一') || hint.includes('/images/generations')))
        return 'gemini-image-generate';
    if (hint.includes('gemini') && hint.includes('image'))
        return 'gemini-image';
    if (hint.includes('grok-imagine') && hint.includes('video'))
        return 'grok-video';
    if (hint.includes('grok-imagine') && (hint.includes('unified') || hint.includes('统一') || configuredLower === 'grok_image' || configuredLower === 'grok-image-unified'))
        return configuredLower || 'grok_image';
    if (hint.includes('grok-imagine') && (hint.includes('edit') || configuredLower === 'grok-image-edit'))
        return 'grok-image-edit';
    if (hint.includes('grok-imagine'))
        return 'grok-image';
    if (hint.includes('grok-4') || configuredLower === 'grok-chat' || configuredLower === 'grok-llm')
        return 'grok-chat';
    if (hint.includes('gemini-') || configuredLower === 'gemini-chat' || configuredLower === 'gemini-llm')
        return 'gemini-chat';
    if (hint.includes('veo-3.1') || hint.includes('veo 3.1') || configuredLower === 'veo-chat' || configuredLower === 'veo-3.1')
        return 'veo-chat';
    if (hint.includes('veo-') || configuredLower === 'gemini-video' || configuredLower === 'veo-video')
        return 'gemini-video';
    return configuredLower || configured;
}
function isGptImage2GenerationHint(modelHint, hint, configuredLower) {
    const looksGptImage2 = /gpt[-_ ]?image[-_ ]?2/.test(modelHint)
        || hint.includes('canvas_gpt-image-2-pro')
        || hint.includes('canvas-gpt-image-2-pro');
    if (!looksGptImage2)
        return false;
    if (!configuredLower)
        return true;
    return ['openai-edits', 'openai-image', 'openai-generations', 'openai-responses-image', 'openai-chat-image', 'gpt-image', 'gpt-image-v2'].includes(configuredLower)
        || configuredLower.includes('gpt-image');
}
function isAiyunzhiGptImage2Hint(modelHint, hint, configuredLower) {
    const text = `${modelHint} ${hint} ${configuredLower}`;
    if (/seedance|sd2|\/video\//.test(text))
        return false;
    if (isLegacyAiyunzhiGptImage2LowPriceHint(text))
        return true;
    return text.includes('gpt-image-2-max')
        || text.includes('gpt-image-2-plus')
        || text.includes('model_gtp-2-max')
        || text.includes('model_gpt-2-plus')
        || text.includes('gpt 2 稳定max')
        || text.includes('gpt 2 优化plus');
}
function isLegacyAiyunzhiGptImage2LowPriceHint(text) {
    return text.includes('aiyunzhi-gpt-image-2-api')
        || text.includes('canvas-aiyunzhi-gpt-image-2-api')
        || text.includes('canvas_aiyunzhi-gpt-image-2-api')
        || text.includes('gpt 2 低价')
        || text.includes('gpt2 低价')
        || text.includes('gpt-image-2 lowprice')
        || text.includes('gpt-image-2 low-price');
}
function resolveUpstreamTimeoutMs(providerTimeoutMs, runtimeTimeoutMs) {
    return Math.max(Number(providerTimeoutMs || 0), Number(runtimeTimeoutMs || 0), 600000);
}
function resolveGenerationTimeoutMs(type, providerTimeoutMs, runtimeTimeoutMs) {
    if (type === 'IMAGE' || type === 'VIDEO')
        return 0;
    return resolveUpstreamTimeoutMs(providerTimeoutMs, runtimeTimeoutMs);
}
function resolveClientRequestId(req, body) {
    return normalizeClientRequestId(body.clientRequestId ||
        req.get('Idempotency-Key') ||
        req.get('X-Idempotency-Key') ||
        body.params.clientRequestId ||
        body.params.requestId);
}
function resolveAdminGenerationResultCategory(category, mode, type) {
    const explicit = normalizeAdminGenerationResultCategory(category);
    if (explicit)
        return explicit;
    const modeCategory = normalizeAdminGenerationResultCategory(mode);
    if (modeCategory)
        return modeCategory;
    if (String(type || '').trim().toUpperCase() === 'VIDEO')
        return 'VIDEO';
    return null;
}
function normalizeAdminGenerationResultCategory(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return null;
    const key = normalizeGenerationNodeTypeKey(raw);
    if (['image', 'images', 'img', 'picture', 'pictures', '普通图片', '图片'].includes(key))
        return 'IMAGE';
    if (['asset', 'assetimage', 'assetimages', '资产', '资产设计', '角色资产'].includes(key) || key.includes('assetdesign'))
        return 'ASSET_DESIGN';
    if (['shot', 'storyboardedit', '分镜', '分镜图', '生成分镜', '编辑分镜', '分镜节点'].includes(key) || key.includes('shotstoryboard') || key.includes('storyboardimage'))
        return 'SHOT_STORYBOARD';
    if (['storyboard', 'storyboardboard', 'storyboardcanvas', '故事板'].includes(key) || key.startsWith('storyboard'))
        return 'STORYBOARD';
    if (['video', 'videos', 'singlevideo', '生视频', '视频'].includes(key) || key.includes('seedancevideo'))
        return 'VIDEO';
    return null;
}
function matchesAssetDesignText(text) {
    return /asset[-_\s]?design|assetdesign|资产设计/i.test(String(text || ''));
}
function matchesShotStoryboardText(text) {
    return /shot[-_\s]?story[-_\s]?board|shotstoryboard|story[-_\s]?board[-_\s]?image|storyboardimage|分镜节点|分镜表|分镜图|编辑分镜|生成分镜/i.test(String(text || ''));
}
function matchesStoryboardText(text) {
    return /(?:^|[^a-z0-9])story[-_\s]?board(?:$|[-_\s]|[^a-z0-9])|故事板/i.test(String(text || ''));
}
function generationTaskClassifierText(task) {
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    const result = isRecord(task.resultJson) ? task.resultJson : {};
    const paramsExtra = isRecord(params.extra) ? params.extra : {};
    const resultExtra = isRecord(result.extra) ? result.extra : {};
    const paramsMetadata = isRecord(params.metadata) ? params.metadata : {};
    const resultMetadata = isRecord(result.metadata) ? result.metadata : {};
    const fields = [
        task.mode,
        params.mode,
        result.mode,
        params.category,
        result.category,
        params.generationCategory,
        params.generation_category,
        result.generationCategory,
        result.generation_category,
        params.taskCategory,
        params.task_category,
        result.taskCategory,
        result.task_category,
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
        paramsExtra.canvasNodeType,
        paramsExtra.canvas_node_type,
        resultExtra.canvasNodeType,
        resultExtra.canvas_node_type,
        paramsMetadata.canvasNodeType,
        paramsMetadata.canvas_node_type,
        resultMetadata.canvasNodeType,
        resultMetadata.canvas_node_type,
        params.sourceType,
        params.source_type,
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
function generationTaskAdminCategory(task) {
    const nodeCategory = generationTaskNodeCategory(task);
    if (nodeCategory)
        return nodeCategory;
    const type = String(task.type || '').trim().toUpperCase();
    if (type === 'VIDEO')
        return 'VIDEO';
    const classifierText = generationTaskClassifierText(task);
    if (matchesAssetDesignText(classifierText))
        return 'ASSET_DESIGN';
    if (matchesShotStoryboardText(classifierText))
        return 'SHOT_STORYBOARD';
    if (matchesStoryboardText(classifierText) || String(task.mode || '').trim().toLowerCase() === 'storyboard')
        return 'STORYBOARD';
    return type === 'VIDEO' ? 'VIDEO' : 'IMAGE';
}
function generationTaskNodeCategory(task) {
    for (const key of generationTaskNodeTypeKeys(task)) {
        if (key === 'assetdesign')
            return 'ASSET_DESIGN';
        if (key === 'shotstoryboard' || key === 'storyboardimage')
            return 'SHOT_STORYBOARD';
        if (key === 'storyboard')
            return 'STORYBOARD';
        if (key === 'seedancevideo' || key === 'singlevideo' || key === 'video')
            return 'VIDEO';
        if (['txt2img', 'img2imgall', 'imagetopanorama', 'singleimage'].includes(key))
            return 'IMAGE';
    }
    return null;
}
function generationTaskNodeTypeKeys(task) {
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    const result = isRecord(task.resultJson) ? task.resultJson : {};
    const paramsExtra = isRecord(params.extra) ? params.extra : {};
    const resultExtra = isRecord(result.extra) ? result.extra : {};
    const paramsMetadata = isRecord(params.metadata) ? params.metadata : {};
    const resultMetadata = isRecord(result.metadata) ? result.metadata : {};
    const fields = [
        params.nodeType,
        params.node_type,
        result.nodeType,
        result.node_type,
        params.sourceNodeType,
        params.source_node_type,
        result.sourceNodeType,
        result.source_node_type,
        params.workflowNodeType,
        params.workflow_node_type,
        result.workflowNodeType,
        result.workflow_node_type,
        params.canvasNodeType,
        params.canvas_node_type,
        result.canvasNodeType,
        result.canvas_node_type,
        paramsExtra.canvasNodeType,
        paramsExtra.canvas_node_type,
        resultExtra.canvasNodeType,
        resultExtra.canvas_node_type,
        paramsMetadata.canvasNodeType,
        paramsMetadata.canvas_node_type,
        resultMetadata.canvasNodeType,
        resultMetadata.canvas_node_type,
        params.taskType,
        params.task_type,
        result.taskType,
        result.task_type,
    ];
    return fields.map(normalizeGenerationNodeTypeKey).filter(Boolean);
}
function normalizeGenerationNodeTypeKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[-_\s/]+/g, '');
}
function isAssetDesignGenerationTask(task) {
    const nodeCategory = generationTaskNodeCategory(task);
    if (nodeCategory)
        return nodeCategory === 'ASSET_DESIGN';
    return matchesAssetDesignText(generationTaskClassifierText(task));
}
function isShotStoryboardGenerationTask(task) {
    const nodeCategory = generationTaskNodeCategory(task);
    if (nodeCategory)
        return nodeCategory === 'SHOT_STORYBOARD';
    return matchesShotStoryboardText(generationTaskClassifierText(task));
}
function isStoryboardGenerationTask(task) {
    const nodeCategory = generationTaskNodeCategory(task);
    if (nodeCategory)
        return nodeCategory === 'STORYBOARD';
    if (isAssetDesignGenerationTask(task))
        return false;
    if (isShotStoryboardGenerationTask(task))
        return false;
    const text = generationTaskClassifierText(task);
    if (matchesStoryboardText(text))
        return true;
    return String(task.mode || '').trim().toLowerCase() === 'storyboard';
}
function normalizeClientRequestId(value) {
    const text = String(value || '').trim();
    return text ? text.slice(0, 160) : null;
}
async function findIdempotentTask(userId, clientRequestId) {
    return prisma.generationTask.findFirst({
        where: { userId, clientRequestId },
        include: { model: { select: { id: true, displayName: true, name: true, type: true } }, provider: { select: { id: true, providerKey: true, name: true } } },
    });
}
async function recoverIdempotentCreate(userId, clientRequestId, err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002')
        return null;
    return findIdempotentTask(userId, clientRequestId);
}
async function queryAndUpdateGenerationTask(task) {
    if (isTerminalStatus(task.status) && task.status === 'SUCCESS') {
        const completed = await completeTaskFromStoredResultUrls(task);
        if (completed)
            return { task: completed };
        return { task };
    }
    if (isTerminalStatus(task.status) && task.status !== 'SUCCESS') {
        const completed = await completeTaskFromStoredResultUrls(task);
        if (completed)
            return { task: completed };
    }
    if (isTerminalStatus(task.status) && !canRecoverRefundedQueryFailure(task))
        return { task };
    if (!task.upstreamTaskId) {
        const completed = await completeTaskFromStoredResultUrls(task);
        if (completed)
            return { task: completed };
        if (isFreshGenerationSubmit(task))
            return { task };
        return closeInterruptedGenerationTask(task);
    }
    const locallyCompleted = await completeTaskFromStoredResultUrls(task);
    if (locallyCompleted)
        return { task: locallyCompleted };
    const expired = await closeExpiredRunningGenerationTask(task);
    if (expired)
        return expired;
    const adapter = getGenerationAdapter(resolveGenerationAdapterName(task.provider, task.model));
    if (!adapter.query)
        fail(400, '当前渠道不支持查询', 'ADAPTER_QUERY_NOT_SUPPORTED');
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isTransientGenerationFailureMessage(message))
            throw err;
        return closeInterruptedGenerationTask(task, `上游任务状态查询失败，任务已自动关闭并退款：${message}`, 'GENERATION_QUERY_FAILED');
    }
    const status = result.status === 'SUCCESS' ? 'SUCCESS' : result.status === 'FAILED' ? 'FAILED' : 'RUNNING';
    const shouldAsyncStore = status === 'SUCCESS' && shouldAsyncServerObjectStorageResults({
        ...task,
        resultJson: result.resultJson,
        responseJson: result.responseJson,
    });
    const nextResult = shouldAsyncStore ? markImageQueryServerStoragePending(result) : result;
    const nextProgress = resolveGenerationQueryProgress(task, nextResult, status);
    const updated = await prisma.generationTask.update({
        where: { id: task.id },
        data: {
            status,
            progress: nextProgress,
            responseJson: nextResult.responseJson,
            resultJson: nextResult.resultJson,
            resultUrlsJson: nextResult.resultUrls,
            errorCode: status === 'SUCCESS' ? null : nextResult.errorCode,
            errorMessage: status === 'SUCCESS' ? null : nextResult.errorMessage,
            completedAt: status === 'SUCCESS' ? new Date() : undefined,
            failedAt: status === 'FAILED' ? new Date() : status === 'SUCCESS' ? null : undefined,
        },
        include: { provider: true, model: true },
    });
    if (shouldAsyncStore)
        scheduleServerObjectStorageMaterialize(updated.id);
    const refund = status === 'FAILED'
        ? await prisma.$transaction(tx => refundGenerationTask(tx, {
            taskId: updated.id,
            source: 'AUTO',
            reason: result.errorMessage || '上游任务失败，已自动退款',
        }))
        : null;
    return { task: refund?.task || updated, ...(refund ? { refund } : {}) };
}
function canRecoverRefundedQueryFailure(_task) {
    return false;
}
async function manageMidjourneyTaskForPrincipal(id, principal, action, input) {
    const task = await prisma.generationTask.findFirst({
        where: { id, userId: principal.billingUserId },
        include: { provider: true, model: true },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    if (!isMidjourneyGenerationTask(task))
        fail(400, '当前任务不是 Midjourney 图片任务', 'MIDJOURNEY_TASK_REQUIRED');
    const upstreamTaskId = resolveMidjourneyUpstreamTaskId(task, input);
    if (!upstreamTaskId)
        fail(400, '缺少 Midjourney 上游 taskId', 'MIDJOURNEY_TASK_ID_MISSING');
    const endpointPath = action === 'fetch'
        ? `/mj/task/${encodeURIComponent(upstreamTaskId)}/fetch`
        : action === 'seed'
            ? `/mj/task/${encodeURIComponent(upstreamTaskId)}/image-seed`
            : `/mj/task/${encodeURIComponent(upstreamTaskId)}/cancel`;
    const runtime = await getGenerationRuntimeSettings();
    const timeoutMs = resolveGenerationTimeoutMs(task.type, task.provider.timeoutMs, runtime.upstreamTimeoutMs);
    const upstream = action === 'cancel'
        ? await callUpstreamJson(task.provider, endpointPath, {}, timeoutMs)
        : await callUpstreamGetJson(task.provider, endpointPath, {}, timeoutMs);
    const mjTask = normalizeMidjourneyManagedTask(upstream, task, { action, upstreamTaskId });
    const resultJson = mergeMidjourneyManagedTaskResultJson(task.resultJson, mjTask, action, upstream);
    const data = {
        resultJson,
        updatedAt: new Date(),
    };
    if (action === 'cancel') {
        data.status = 'CANCELLED';
        data.progress = 100;
        data.errorCode = 'MIDJOURNEY_TASK_CANCELLED';
        data.errorMessage = 'Midjourney 任务已取消';
        data.failedAt = new Date();
    }
    else if (action === 'fetch') {
        const nextProgress = Number(mjTask.progress);
        if (Number.isFinite(nextProgress))
            data.progress = Math.max(0, Math.min(100, nextProgress));
    }
    const updated = await prisma.generationTask.update({
        where: { id: task.id },
        data,
        include: { provider: true, model: true },
    });
    return { task: updated, mjTask, upstream: sanitizeGenerationListJson(upstream) };
}
function isMidjourneyGenerationTask(task) {
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    const result = isRecord(task.resultJson) ? task.resultJson : {};
    const adapter = resolveGenerationAdapterName(task.provider, task.model);
    const hay = [
        adapter,
        task.channelKey,
        task.mode,
        task.provider.providerKey,
        task.provider.name,
        task.provider.adapter,
        task.model.adapter,
        task.model.modelKey,
        task.model.name,
        task.model.displayName,
        params.adapter,
        params.protocolAdapter,
        isRecord(params.protocol) ? params.protocol.adapter : '',
        params.mjParams ? 'mjParams' : '',
        params.midjourneyParams ? 'midjourneyParams' : '',
        result.mjTask ? 'mjTask' : '',
    ].map(value => String(value || '')).join(' ').toLowerCase();
    return /midjourney|mj[-_\s]*imagine|niji/.test(hay);
}
function resolveMidjourneyUpstreamTaskId(task, input) {
    const result = isRecord(task.resultJson) ? task.resultJson : {};
    const response = isRecord(task.responseJson) ? task.responseJson : {};
    const mjTask = isRecord(result.mjTask) ? result.mjTask : {};
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    return firstNonEmptyString(input.upstreamTaskId, input.taskId, task.upstreamTaskId, mjTask.upstreamTaskId, mjTask.taskId, mjTask.id, result.upstreamTaskId, result.taskId, isRecord(result.result) ? result.result.taskId : '', isRecord(result.result) ? result.result.id : '', response.taskId, isRecord(response.result) ? response.result.taskId : '', isRecord(response.result) ? response.result.id : '', params.upstreamTaskId, params.taskId);
}
function normalizeMidjourneyManagedTask(upstream, task, meta) {
    const root = isRecord(upstream) ? upstream : {};
    const resultValue = root.result;
    const properties = isRecord(root.properties) ? root.properties : {};
    const payload = firstRecord(root.result, root.data, root.task, root.properties, root);
    const previous = isRecord(task.resultJson) && isRecord(task.resultJson.mjTask) ? task.resultJson.mjTask : {};
    const imageUrls = uniqueStrings([
        ...arrayStringValues(payload.imageUrls),
        ...arrayStringValues(payload.image_urls),
        ...arrayStringValues(payload.images),
        payload.imageUrl,
        payload.image_url,
        payload.proxyUrl,
        payload.proxy_url,
        payload.url,
        payload.uri,
    ]);
    const seed = firstNonEmptyString(payload.seed, properties.seed, root.seed, meta.action === 'seed' && (typeof resultValue === 'string' || typeof resultValue === 'number') ? resultValue : '', previous.seed);
    const buttons = Array.isArray(payload.buttons)
        ? payload.buttons
        : Array.isArray(properties.buttons)
            ? properties.buttons
            : Array.isArray(previous.buttons)
                ? previous.buttons
                : [];
    const normalized = {
        id: firstNonEmptyString(payload.id, payload.taskId, payload.task_id, meta.upstreamTaskId),
        taskId: firstNonEmptyString(payload.taskId, payload.task_id, payload.id, meta.upstreamTaskId),
        upstreamTaskId: meta.upstreamTaskId,
        localTaskId: task.id,
        parentId: firstNonEmptyString(payload.parentId, payload.parent_id, previous.parentId),
        action: firstNonEmptyString(payload.action, previous.action, meta.action),
        status: firstNonEmptyString(payload.status, root.status, previous.status, meta.action === 'cancel' ? 'CANCELLED' : ''),
        progress: normalizeMidjourneyProgress(payload.progress ?? root.progress ?? previous.progress),
        prompt: firstNonEmptyString(payload.prompt, previous.prompt, task.prompt),
        promptEn: firstNonEmptyString(payload.promptEn, payload.prompt_en, previous.promptEn),
        promptFull: firstNonEmptyString(payload.promptFull, payload.prompt_full, previous.promptFull),
        description: firstNonEmptyString(payload.description, root.description, previous.description),
        imageUrl: imageUrls[0] || firstNonEmptyString(previous.imageUrl),
        baseImageUrl: firstNonEmptyString(payload.baseImageUrl, payload.base_image_url, previous.baseImageUrl),
        imageUrls,
        thumbnailUrl: firstNonEmptyString(payload.thumbnailUrl, payload.thumbnail_url, previous.thumbnailUrl),
        seed,
        seedMessageId: firstNonEmptyString(payload.seedMessageId, payload.seed_message_id, previous.seedMessageId),
        jobId: firstNonEmptyString(payload.jobId, payload.job_id, previous.jobId),
        messageId: firstNonEmptyString(payload.messageId, payload.message_id, previous.messageId),
        interactionMetadataId: firstNonEmptyString(payload.interactionMetadataId, payload.interaction_metadata_id, previous.interactionMetadataId),
        mode: firstNonEmptyString(payload.mode, previous.mode),
        requestMode: firstNonEmptyString(payload.requestMode, payload.request_mode, previous.requestMode),
        buttons,
        fetchedAt: new Date().toISOString(),
        lastManagementAction: meta.action,
    };
    Object.keys(normalized).forEach(key => {
        const value = normalized[key];
        if (value == null || value === '' || (Array.isArray(value) && !value.length))
            delete normalized[key];
    });
    return normalized;
}
function mergeMidjourneyManagedTaskResultJson(current, mjTask, action, upstream) {
    const base = isRecord(current) ? { ...current } : {};
    const previousTasks = Array.isArray(base.mjTasks) ? base.mjTasks.filter(isRecord) : [];
    const key = firstNonEmptyString(mjTask.upstreamTaskId, mjTask.taskId, mjTask.id);
    const mergedTasks = previousTasks.filter(item => firstNonEmptyString(item.upstreamTaskId, item.taskId, item.id) !== key);
    mergedTasks.unshift(mjTask);
    base.mjTask = { ...(isRecord(base.mjTask) ? base.mjTask : {}), ...mjTask };
    base.mjTasks = mergedTasks.slice(0, 80);
    base.lastMjTaskAction = action;
    base.lastMjTaskManagedAt = new Date().toISOString();
    base.lastMjTaskResponse = sanitizeGenerationListJson(upstream);
    return base;
}
function firstNonEmptyString(...values) {
    for (const value of values) {
        const raw = String(value ?? '').trim();
        if (raw)
            return raw;
    }
    return '';
}
function firstRecord(...values) {
    for (const value of values) {
        if (isRecord(value))
            return value;
    }
    return {};
}
function arrayStringValues(value) {
    if (!Array.isArray(value))
        return [];
    return value.map(item => String(item || '').trim()).filter(Boolean);
}
function uniqueStrings(values) {
    const out = [];
    values.forEach(value => {
        const raw = String(value || '').trim();
        if (raw && !out.includes(raw))
            out.push(raw);
    });
    return out;
}
function normalizeMidjourneyProgress(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.min(100, value));
    const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
    if (!match)
        return undefined;
    return Math.max(0, Math.min(100, Number(match[1])));
}
function resolveGenerationQueryProgress(task, result, status) {
    if (status !== 'RUNNING')
        return result.progress ?? task.progress;
    const current = normalizeMidjourneyProgress(task.progress) ?? 0;
    const explicit = normalizeMidjourneyProgress(result.progress);
    const base = explicit === undefined ? current : Math.max(current, explicit);
    if (!isMidjourneyActionGenerationTask(task))
        return base;
    return Math.max(base, slowMidjourneyActionFallbackProgress(task));
}
function isMidjourneyActionGenerationTask(task) {
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    const hay = [
        task.mode,
        params.mjTaskKind,
        params.taskType,
        params.kind,
        params.actionCode,
        params.customId,
        params.custom_id,
    ].map(value => String(value || '')).join(' ').toLowerCase();
    return /midjourney[-_\s]*action|\baction\b|mj::job::|mj::inpaint|mj::outpaint|mj::customzoom/.test(hay);
}
function slowMidjourneyActionFallbackProgress(task) {
    const started = task.startedAt || task.createdAt || task.updatedAt || new Date();
    const elapsedSeconds = Math.max(0, (Date.now() - new Date(started).getTime()) / 1000);
    const progress = 8 + Math.log1p(elapsedSeconds / 6) * 15;
    return Math.max(8, Math.min(96, Math.round(progress)));
}
async function closeInterruptedGenerationTask(task, reason, errorCode = 'GENERATION_TASK_INTERRUPTED') {
    const completed = await completeTaskFromStoredResultUrls(task);
    if (completed)
        return { task: completed };
    const finalReason = reason || interruptedGenerationTaskReason(task);
    const updated = await prisma.generationTask.update({
        where: { id: task.id },
        data: {
            status: 'FAILED',
            errorCode,
            errorMessage: finalReason,
            failedAt: new Date(),
        },
        include: { provider: true, model: true },
    });
    const refund = updated.chargedCredits > 0
        ? await prisma.$transaction(tx => refundGenerationTask(tx, {
            taskId: updated.id,
            source: 'AUTO',
            reason: finalReason,
        }))
        : null;
    return { task: refund?.task || updated, ...(refund ? { refund } : {}) };
}
async function closeExpiredRunningGenerationTask(task) {
    if (task.status !== 'RUNNING' && task.status !== 'PENDING' && task.status !== 'CREATED')
        return null;
    if (!isGrokVideoGenerationTask(task))
        return null;
    const maxMs = grokVideoMaxRunningWindowMs();
    const startedAt = task.startedAt || task.createdAt || task.updatedAt;
    const elapsedMs = Date.now() - startedAt.getTime();
    if (elapsedMs < maxMs)
        return null;
    const maxMinutes = Math.max(1, Math.ceil(maxMs / 60_000));
    const reason = `Grok 视频任务超过 ${maxMinutes} 分钟仍未返回最终视频结果，系统已自动关闭并退款。常见原因是 xAI 上游任务卡住、任务 ID 查询一直保持处理中，或上游未返回可用视频 URL；请稍后重新生成。`;
    return closeInterruptedGenerationTask(task, reason, 'GROK_VIDEO_TASK_TIMEOUT');
}
function isGrokVideoGenerationTask(task) {
    if (task.type !== 'VIDEO')
        return false;
    const params = isRecord(task.paramsJson) ? task.paramsJson : {};
    const text = [
        task.provider.providerKey,
        task.provider.name,
        task.provider.adapter,
        task.model.id,
        task.model.modelKey,
        task.model.name,
        task.model.displayName,
        task.model.adapter,
        params.adapter,
        params.model,
        params.videoMode,
        params.grokVideoMode,
        params.xaiVideoMode,
    ].map(value => String(value || '')).join(' ').toLowerCase();
    return /grok.*video|xai.*video|grok-imagine-video/.test(text);
}
function grokVideoMaxRunningWindowMs() {
    const configured = Number(config.grokVideoMaxRunningMinutes);
    const minutes = Number.isFinite(configured) && configured > 0 ? configured : 20;
    return Math.max(1, minutes) * 60_000;
}
function interruptedGenerationTaskReason(task) {
    const minutes = Math.max(1, Math.ceil(generationSubmitStaleTaskWindowMs(task) / 60_000));
    return `任务提交中断：后台在 ${minutes} 分钟内仍未拿到上游任务 ID 或同步生成结果。常见原因是后台发布/重启、请求连接中断，或上游没有按当前模型渠道配置返回任务 ID / 结果 URL；任务已自动关闭并退款，请检查渠道配置后重新生成。`;
}
async function completeTaskFromStoredResultUrls(task) {
    if (shouldAsyncServerObjectStorageResults(task)) {
        if (task.status === 'SUCCESS')
            scheduleServerObjectStorageMaterialize(task.id);
        return null;
    }
    const urls = await materializeStoredGenerationResultUrls(task, collectStoredGenerationResultUrls(task));
    if (!urls.length)
        return null;
    const resultJson = normalizeStoredGenerationResultJson(task.resultJson, urls);
    return prisma.generationTask.update({
        where: { id: task.id },
        data: {
            status: 'SUCCESS',
            progress: 100,
            resultUrlsJson: urls,
            resultJson,
            errorCode: null,
            errorMessage: null,
            completedAt: task.completedAt || new Date(),
            failedAt: null,
        },
        include: { provider: true, model: true },
    });
}
async function materializeStoredGenerationResultUrls(task, urls) {
    if (!isMaterializableResultType(task.type))
        return urls;
    if (task.type === 'VIDEO') {
        if (!shouldMaterializeVideoResults(task, urls))
            return urls;
        const resolved = [];
        for (const url of urls) {
            const materialized = await materializeMediaResultUrl(task.provider, url, 'video').catch(() => '');
            const next = materialized || url;
            if (next && !resolved.includes(next))
                resolved.push(next);
        }
        return resolved;
    }
    if (!shouldMaterializeImageResults(task))
        return urls;
    const resolved = [];
    for (const url of urls) {
        const materialized = await materializeImageResultUrl(task.provider, url).catch(() => '');
        const next = materialized || url;
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
function shouldMaterializeVideoResults(task, urls) {
    if (task.type !== 'VIDEO')
        return false;
    if (urls.some(url => isProtectedProviderResultUrl(task.provider, url)))
        return true;
    const responseType = findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson);
    return responseType === 'object_storage' || responseType === 'server_base64_object_storage';
}
async function materializeImmediateImageSubmitResults(provider, submit, paramsJson, type = 'IMAGE') {
    if (!shouldMaterializeImageResults({ type, provider, paramsJson, requestJson: submit.requestJson, resultJson: submit.resultJson, responseJson: submit.responseJson })) {
        return submit;
    }
    const urls = await materializeStoredGenerationResultUrls({ type, provider }, collectStoredGenerationResultUrls({
        resultUrlsJson: submit.resultUrls,
        resultJson: submit.resultJson,
        responseJson: submit.responseJson,
    }));
    if (!urls.length)
        return submit;
    return {
        ...submit,
        resultUrls: urls,
        resultJson: normalizeStoredGenerationResultJson(submit.resultJson, urls),
    };
}
function shouldMaterializeImageResults(task) {
    if (!isMaterializableResultType(task.type))
        return false;
    const responseType = findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson);
    if (task.type === 'VIDEO' && !responseType)
        return false;
    return !responseType || responseType === 'object_storage' || responseType === 'server_base64_object_storage';
}
function shouldAsyncServerObjectStorageResults(task) {
    if (!isMaterializableResultType(task.type))
        return false;
    const responseType = findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson);
    return responseType === 'server_object_storage' || responseType === 'server_async_object_storage' || responseType === 'server_base64_async_object_storage';
}
function isMaterializableResultType(type) {
    return type === 'IMAGE' || type === 'VIDEO';
}
function markImageSubmitServerStoragePending(submit) {
    const urls = collectStoredGenerationResultUrls({
        resultUrlsJson: submit.resultUrls,
        resultJson: submit.resultJson,
        responseJson: submit.responseJson,
    });
    if (!urls.length)
        return submit;
    const publicUrls = generationResultPublicUrls(urls);
    return {
        ...submit,
        resultJson: markServerStorageResultJson(submit.resultJson, publicUrls, 'uploading'),
        resultUrls: publicUrls,
    };
}
function markImageQueryServerStoragePending(result) {
    const urls = collectStoredGenerationResultUrls({
        resultUrlsJson: result.resultUrls,
        resultJson: result.resultJson,
        responseJson: result.responseJson,
    });
    if (!urls.length)
        return result;
    const publicUrls = generationResultPublicUrls(urls);
    return {
        ...result,
        resultJson: markServerStorageResultJson(result.resultJson, publicUrls, 'uploading'),
        resultUrls: publicUrls,
    };
}
function markServerStorageResultJson(resultJson, urls, status, extra = {}) {
    const base = isRecord(resultJson) ? { ...resultJson } : {};
    const publicUrls = generationResultPublicUrls(urls);
    const temporaryUrls = normalizeAsyncStorageTemporaryUrls(base, publicUrls);
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
        url: publicUrls[0] || base.url || '',
        outputs: publicUrls,
        temporaryUrl: temporaryUrls[0] || publicUrls[0] || base.temporaryUrl || '',
        temporaryUrls,
        storageStatus: status,
        storage_status: status,
        storageMode: 'server_async_object_storage',
        storage_mode: 'server_async_object_storage',
        ...cleanupMeta,
        ...extra,
    };
}
function normalizeAsyncStorageTemporaryUrls(source, fallbackUrls) {
    const values = [
        source.temporaryUrls,
        source.temporary_urls,
        source.temporaryUrl,
        source.temporary_url,
        fallbackUrls,
    ];
    const urls = [];
    for (const value of values) {
        const list = Array.isArray(value) ? value : [value];
        for (const item of list) {
            const raw = generationResultPublicUrl(item);
            if (raw && !urls.includes(raw))
                urls.push(raw);
        }
    }
    return urls;
}
function collectAsyncServerObjectStorageTemporaryUrls(task) {
    const resultJson = isRecord(task.resultJson) ? task.resultJson : {};
    const urls = normalizeAsyncStorageTemporaryUrls(resultJson, collectStoredGenerationResultUrls(task));
    const responseType = findConfiguredImageResponseType(task.requestJson, task.paramsJson, task.resultJson, task.responseJson);
    return urls.filter(url => {
        const raw = String(url || '').trim();
        if (/^data:(?:image|video|audio)\//i.test(raw))
            return responseType === 'server_base64_async_object_storage';
        if (isGenerationResultPreviewUrl(raw))
            return responseType === 'server_base64_async_object_storage';
        return !isLikelyPermanentStorageUrl(raw);
    });
}
function scheduleServerObjectStorageMaterialize(taskId) {
    const timer = setTimeout(() => {
        materializeServerObjectStorageTask(taskId).catch(err => {
            console.warn(`[generation-storage] async materialize ${taskId} failed:`, err instanceof Error ? err.message : err);
        });
    }, 100);
    timer.unref?.();
}
async function materializeServerObjectStorageTask(taskId) {
    const task = await prisma.generationTask.findUnique({ where: { id: taskId }, include: { provider: true, model: true } });
    if (!task || !isMaterializableResultType(task.type) || task.status !== 'SUCCESS' || !shouldAsyncServerObjectStorageResults(task))
        return;
    const sourceUrls = collectAsyncServerObjectStorageTemporaryUrls(task);
    if (!sourceUrls.length)
        return;
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
        const resolved = [];
        failedReason = '';
        for (const url of sourceUrls) {
            try {
                const next = task.type === 'VIDEO'
                    ? await materializeMediaResultUrl(task.provider, url, 'video')
                    : await materializeImageResultUrl(task.provider, url);
                if (next && !resolved.includes(next))
                    resolved.push(next);
            }
            catch (err) {
                failedReason = err instanceof Error ? err.message : String(err);
            }
        }
        const storedUrls = resolved.filter(isLikelyPermanentStorageUrl);
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
                    resultUrlsJson: storedUrls,
                },
            });
            return;
        }
        if (attempt < SERVER_OBJECT_STORAGE_MAX_ATTEMPTS)
            await sleep(900 * attempt);
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
        data: { resultJson, resultUrlsJson: generationResultPublicUrls(sourceUrls) },
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function isLikelyPermanentStorageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return false;
    const publicBase = String(config.objectStorage.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (publicBase && raw.startsWith(`${publicBase}/`))
        return true;
    if (config.objectStorage.endpointUrl && config.objectStorage.bucket) {
        try {
            const url = new URL(raw);
            const endpoint = new URL(config.objectStorage.endpointUrl);
            if (url.hostname === endpoint.hostname || url.hostname === `${config.objectStorage.bucket}.${endpoint.hostname}`)
                return true;
        }
        catch {
            // Fall through to common CDN/COS host checks below.
        }
    }
    return /(?:^|[./-])cos(?:[.-]|$)/i.test(raw)
        || /myqcloud\.com/i.test(raw)
        || /cloudfront\.net/i.test(raw);
}
function isGenerationResultPreviewUrl(value) {
    const raw = String(value || '').trim();
    if (/^\/api\/generation\/results\//i.test(raw))
        return true;
    try {
        const parsed = new URL(raw);
        return /^\/api\/generation\/results\//i.test(parsed.pathname);
    }
    catch {
        return false;
    }
}
function findConfiguredImageResponseType(...values) {
    for (const value of values) {
        const found = findImageResponseType(value);
        if (found)
            return found;
    }
    return '';
}
function findImageResponseType(value) {
    if (!value)
        return '';
    if (typeof value === 'string')
        return normalizeImageResponseTypeValue(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findImageResponseType(item);
            if (found)
                return found;
        }
        return '';
    }
    if (!isRecord(value))
        return '';
    const direct = normalizeImageResponseTypeValue(value.responseType ?? value.response_type);
    if (direct)
        return direct;
    const protocol = isRecord(value.protocol) ? findImageResponseType(value.protocol) : '';
    if (protocol)
        return protocol;
    return '';
}
function normalizeImageResponseTypeValue(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'default' || raw === 'auto')
        return '';
    if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos'].includes(raw))
        return 'object_storage';
    if (['server_async_object_storage', 'server-async-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', '124_async_cos', '124-async-cos', '124异步转存cos', '后台异步转存cos'].includes(raw))
        return 'server_async_object_storage';
    if (['server_object_storage', 'server-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_cos', 'server_cos', '124_cos', '124-server-cos', '124服务器转存cos', '后台转存cos'].includes(raw))
        return 'server_object_storage';
    if (['server_base64_object_storage', 'server-base64-object-storage', 'base64_object_storage', 'base64-object-storage', 'b64_object_storage', 'b64-object-storage', 'base64_to_object_storage', 'base64-to-object-storage', 'base64_to_cos', 'base64-to-cos', 'b64_to_cos', 'b64-to-cos', '124_base64_cos', '124-base64-cos', '124_base64_to_cos', '124-base64-to-cos', '124_base64_object_storage', '124-base64-object-storage', '124服务器base64转存cos', '124base64转存cos', 'base64转存cos', 'b64转存cos', '后台base64转存cos'].includes(raw))
        return 'server_base64_object_storage';
    if (['server_base64_async_object_storage', 'server-base64-async-object-storage', 'server_async_base64_object_storage', 'server-async-base64-object-storage', 'base64_async_object_storage', 'base64-async-object-storage', 'b64_async_object_storage', 'b64-async-object-storage', 'base64_async_to_object_storage', 'base64-async-to-object-storage', 'base64_async_to_cos', 'base64-async-to-cos', 'b64_async_to_cos', 'b64-async-to-cos', '124_base64_async_cos', '124-base64-async-cos', '124_async_base64_cos', '124-async-base64-cos', '124_base64_async_to_cos', '124-base64-async-to-cos', '124_base64_async_object_storage', '124-base64-async-object-storage', '124服务器base64异步转存cos', '124base64异步转存cos', 'base64异步转存cos', 'b64异步转存cos', '后台base64异步转存cos'].includes(raw))
        return 'server_base64_async_object_storage';
    if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw))
        return 'provider_url';
    if (['base64', 'b64', 'b64_json'].includes(raw))
        return 'base64';
    return '';
}
function sanitizeGenerationTaskListItem(task, adminCategory) {
    const sanitized = {
        ...task,
        adminCategory: adminCategory ?? generationTaskAdminCategory(task),
    };
    if (Object.prototype.hasOwnProperty.call(task, 'inputFilesJson'))
        sanitized.inputFilesJson = sanitizeGenerationListJson(task.inputFilesJson, 'inputFilesJson');
    if (Object.prototype.hasOwnProperty.call(task, 'paramsJson'))
        sanitized.paramsJson = sanitizeGenerationListJson(task.paramsJson, 'paramsJson');
    if (Object.prototype.hasOwnProperty.call(task, 'resultJson'))
        sanitized.resultJson = sanitizeGenerationListJson(task.resultJson, 'resultJson');
    if (Object.prototype.hasOwnProperty.call(task, 'resultUrlsJson'))
        sanitized.resultUrlsJson = sanitizeGenerationListJson(task.resultUrlsJson, 'resultUrlsJson');
    return sanitized;
}
function sanitizeGenerationTaskDetailItem(task) {
    return {
        ...task,
        adminCategory: generationTaskAdminCategory(task),
        inputFilesJson: sanitizeGenerationListJson(task.inputFilesJson, 'inputFilesJson'),
        paramsJson: sanitizeGenerationListJson(task.paramsJson, 'paramsJson'),
        requestJson: sanitizeGenerationListJson(task.requestJson, 'requestJson'),
        responseJson: sanitizeGenerationListJson(task.responseJson, 'responseJson'),
        resultJson: sanitizeGenerationListJson(task.resultJson, 'resultJson'),
        resultUrlsJson: sanitizeGenerationListJson(task.resultUrlsJson, 'resultUrlsJson'),
    };
}
function sanitizeGenerationTaskResponse(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return payload;
    const task = payload.task;
    if (!task || typeof task !== 'object' || Array.isArray(task))
        return payload;
    return {
        ...payload,
        task: sanitizeGenerationTaskDetailItem(task),
    };
}
function sanitizeGenerationListJson(value, key = '') {
    if (value == null)
        return value;
    if (typeof value === 'string')
        return sanitizeGenerationListString(value, key);
    if (Array.isArray(value))
        return value.map(item => sanitizeGenerationListJson(item, key));
    if (!isRecord(value))
        return value;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
        if (isLargeInlineGenerationField(key, item)) {
            next[key] = `[inline omitted: ${String(item || '').length} chars]`;
            continue;
        }
        next[key] = sanitizeGenerationListJson(item, key);
    }
    return next;
}
function sanitizeGenerationListString(value, key = '') {
    const raw = String(value || '');
    if (!raw)
        return raw;
    if (/^data:(?:image|video|audio)\//i.test(raw)) {
        return `[inline data omitted: ${raw.length} chars]`;
    }
    if (isLikelyInlineBase64Value(key, raw)) {
        return `[base64 omitted: ${raw.length} chars]`;
    }
    return raw.length > 180_000 ? `${raw.slice(0, 4000)}...[omitted ${raw.length - 4000} chars]` : raw;
}
function isLargeInlineGenerationField(key, value) {
    if (typeof value !== 'string')
        return false;
    const name = key.toLowerCase();
    if (/(b64|base64|inline)/.test(name))
        return value.length > 128;
    if (/(image|video|audio|url|uri|output|result)/.test(name) && isPlainBase64Payload(value, 2048))
        return true;
    if (!/data/.test(name))
        return false;
    return /^data:(?:image|video|audio)\//i.test(value) || isPlainBase64Payload(value, 2048);
}
function isLikelyInlineBase64Value(key, value) {
    const name = String(key || '').toLowerCase();
    if (/(b64|base64|inline)/.test(name) && value.length > 128)
        return true;
    if (/(image|video|audio|url|uri|output|result)/.test(name) && isPlainBase64Payload(value, 2048))
        return true;
    if (/data/.test(name) && isPlainBase64Payload(value, 2048))
        return true;
    return isPlainBase64Payload(value, 16_384);
}
function isPlainBase64Payload(value, minLength) {
    const compact = String(value || '').replace(/\s+/g, '');
    if (compact.length < minLength)
        return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact))
        return false;
    return compact.length % 4 === 0 || /={1,2}$/.test(compact);
}
function normalizeStoredGenerationResultJson(resultJson, urls) {
    const publicUrls = generationResultPublicUrls(urls);
    if (isRecord(resultJson) && Object.keys(resultJson).length) {
        return {
            ...resultJson,
            url: publicUrls[0],
            outputs: publicUrls,
        };
    }
    return { url: publicUrls[0], outputs: publicUrls };
}
function generationResultPublicUrls(urls) {
    const resolved = [];
    for (const url of urls) {
        const next = generationResultPublicUrl(url);
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
function generationResultPublicUrl(value) {
    const raw = decodeGenerationResultUrlEntities(value);
    if (!raw)
        return '';
    const publicBase = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (!publicBase)
        return raw;
    if (/^\/api\/generation\/results\//i.test(raw))
        return `${publicBase}${raw}`;
    return raw;
}
function decodeGenerationResultUrlEntities(value) {
    // FIREFLY_URL_ENTITY_DECODE_STORAGE: preserve presigned query params before preview/storage.
    let out = String(value || '').trim();
    for (let i = 0; i < 4; i += 1) {
        const next = out
            .replace(/&amp;/gi, '&')
            .replace(/&#0*38;/gi, '&')
            .replace(/&#x0*26;/gi, '&')
            .replace(/\\u0026/gi, '&');
        if (next === out)
            break;
        out = next;
    }
    return out;
}
function collectStoredGenerationResultUrls(task) {
    const urls = [];
    const push = (value) => {
        const raw = decodeGenerationResultUrlEntities(value);
        if (!raw)
            return;
        if (!/^data:image\//i.test(raw) && !/^https?:\/\//i.test(raw) && !/^\/api\/generation\/results\//i.test(raw) && !/^\/v1\/(?:images\/results|files|videos)\//i.test(raw))
            return;
        if (!urls.includes(raw))
            urls.push(raw);
    };
    const visit = (value, key = '') => {
        if (!value)
            return;
        if (typeof value === 'string') {
            if (/url|uri|output|image|video|result|b64|base64/i.test(key) || /^data:image\//i.test(value) || /^https?:\/\//i.test(value) || /^\/api\//i.test(value) || /^\/v1\//i.test(value))
                push(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => visit(item, key));
            return;
        }
        if (isRecord(value)) {
            const inline = value.inlineData || value.inline_data;
            if (inline)
                visit(inline, 'inlineData');
            Object.entries(value).forEach(([itemKey, item]) => {
                if (/url|uri|output|image|video|result/i.test(itemKey))
                    visit(item, itemKey);
                else if (isRecord(item) || Array.isArray(item))
                    visit(item, itemKey);
            });
        }
    };
    visit(task.resultUrlsJson, 'resultUrlsJson');
    visit(task.resultJson, 'resultJson');
    visit(task.responseJson, 'responseJson');
    return urls;
}
function isTerminalStatus(status) {
    return ['SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED', 'TIMEOUT', 'MANUAL_REVIEW'].includes(status);
}
function isTransientGenerationFailureMessage(message) {
    return /stream disconnected before completion|HTTP\s*502|internal_server_error|server_error|bad gateway|gateway timeout|upstream|timeout|timed out|failed to fetch|network|502|503|504|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|premature close/i.test(String(message || ''));
}
async function writeProviderHealthLog(data) {
    await prisma.providerHealthLog.create({ data }).catch(err => {
        console.warn('[generation-route] provider health log write failed:', err instanceof Error ? err.message : err);
    });
}
async function markGenerationSubmitStarted(taskId, startedAt) {
    await prisma.generationTask.update({
        where: { id: taskId },
        data: {
            status: 'RUNNING',
            startedAt,
        },
    });
}
function startGenerationSubmitHeartbeat(taskId) {
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
function isFreshGenerationSubmit(task) {
    if (!['CREATED', 'PENDING', 'RUNNING'].includes(task.status))
        return false;
    return Date.now() - task.updatedAt.getTime() < generationSubmitStaleTaskWindowMs(task);
}
function generationStaleTaskWindowMs() {
    return Math.max(1, config.generationStaleTaskMinutes) * 60_000;
}
function generationSubmitStaleTaskWindowMs(task) {
    const fallbackMinutes = task.type === 'IMAGE' || task.type === 'VIDEO'
        ? 60
        : Math.max(1, config.generationStaleTaskMinutes);
    const configuredMinutes = Number.isFinite(config.generationSubmitStaleTaskMinutes) && config.generationSubmitStaleTaskMinutes > 0
        ? config.generationSubmitStaleTaskMinutes
        : fallbackMinutes;
    return Math.max(Math.max(1, config.generationStaleTaskMinutes), configuredMinutes) * 60_000;
}
function normalizeGenerationTaskParamsForModel(params, provider, model, type) {
    if (type !== 'IMAGE' || !isGptImage2ProOfficialProxyModel(provider, model))
        return params;
    const resolution = normalizeGptImage2ProResolutionParam(firstNonEmpty(params.requestedResolution, params.resolution, params.imageSize, params.image_size, params.requestedPixelSize, params.pixelSize, params.size));
    const ratio = normalizeGptImage2ProRatioParam(firstNonEmpty(params.aspect_ratio, params.aspectRatio, params.requestedRatio, params.ratio, params.size, params.requestedPixelSize, params.pixelSize));
    const pixelSize = gptImage2ProPixelSize(ratio, resolution);
    return {
        ...params,
        size: ratio,
        aspectRatio: ratio,
        aspect_ratio: ratio,
        requestedRatio: ratio,
        requested_ratio: ratio,
        resolution,
        requestedResolution: resolution,
        imageSize: resolution,
        image_size: resolution,
        pixelSize,
        requestedPixelSize: pixelSize,
    };
}
function isGptImage2ProOfficialProxyModel(provider, model) {
    const hint = [
        provider.providerKey,
        provider.name,
        provider.baseUrl,
        provider.defaultModel,
        model.id,
        model.modelKey,
        model.name,
        model.displayName,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    if (hint.includes('hongniaoai.com') || hint.includes('hongniao') || hint.includes('gpt-image-2(pro)'))
        return false;
    return /gpt[-_ ]?image[-_ ]?2/.test(hint)
        && (hint.includes('45.77.211.38:8317')
            || hint.includes('localhost:8317')
            || hint.includes('127.0.0.1:8317')
            || hint.includes('canvas_gpt-image-2-pro')
            || hint.includes('canvas-gpt-image-2-pro'));
}
function normalizeGptImage2ProResolutionParam(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace('×', 'x');
    if (raw === '1k')
        return '1k';
    if (/^[2-4]k$/.test(raw))
        return '2k';
    const match = raw.match(/(\d{3,5})x(\d{3,5})/i);
    if (match) {
        const longSide = Math.max(Number(match[1]), Number(match[2]));
        if (longSide >= 1500)
            return '2k';
    }
    return '1k';
}
function normalizeGptImage2ProRatioParam(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    if (!raw || raw === 'auto')
        return 'auto';
    const allowed = new Set(['1:1', '3:2', '2:3']);
    if (allowed.has(raw))
        return raw;
    const ratio = aspectRatioNumberFromParam(raw);
    if (!Number.isFinite(ratio) || ratio <= 0)
        return 'auto';
    const candidates = [
        ['1:1', 1],
        ['3:2', 3 / 2],
        ['2:3', 2 / 3],
    ];
    return candidates.reduce((best, item) => Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best, candidates[0])[0];
}
function aspectRatioNumberFromParam(value) {
    const match = String(value || '').trim().toLowerCase().replace('×', 'x').match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/);
    if (!match)
        return NaN;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : NaN;
}
function gptImage2ProPixelSize(ratio, resolution) {
    const map = {
        'auto|1k': 'auto',
        '1:1|1k': '1024x1024',
        '3:2|1k': '1536x1024',
        '2:3|1k': '1024x1536',
        'auto|2k': 'auto',
        '1:1|2k': '2048x2048',
        '3:2|2k': '3072x2048',
        '2:3|2k': '2048x3072',
    };
    return map[`${ratio}|${resolution}`] || 'auto';
}
function firstNonEmpty(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '') ?? '';
}
function estimateTaskCostInput(body) {
    const quantity = numberParam(body.params, ['n', 'quantity'], 1);
    const durationSeconds = numberParam(body.params, ['durationSeconds', 'duration', 'seconds'], 0);
    if (body.type !== 'LLM') {
        return {
            quantity,
            durationSeconds,
            inputTokens: 0,
            outputTokens: 0,
            size: stringParam(body.params, ['size']),
            resolution: stringParam(body.params, ['resolution', 'requestedResolution', 'videoResolution', 'video_resolution', 'quality', 'size', 'pixelSize', 'pixel_size']),
            imageSize: stringParam(body.params, ['imageSize', 'image_size', 'requestedPixelSize', 'requested_pixel_size']),
            params: body.params,
            inputFiles: body.inputFiles,
        };
    }
    const inputTokens = numberParam(body.params, ['inputTokens', 'promptTokens'], estimateTextTokens(body.prompt));
    const outputTokens = numberParam(body.params, ['outputTokens', 'completionTokens', 'maxOutputTokens', 'max_tokens'], 4096);
    return { quantity: 1, durationSeconds: 0, inputTokens, outputTokens };
}
function stringParam(params, keys) {
    for (const key of keys) {
        const value = params[key];
        if (typeof value === 'string' && value.trim())
            return value;
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return undefined;
}
function numberParam(params, keys, fallback) {
    for (const key of keys) {
        const value = params[key];
        const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
        if (Number.isFinite(numberValue) && numberValue >= 0)
            return numberValue;
    }
    return fallback;
}
async function refundGenerationTask(tx, input) {
    const task = await tx.generationTask.findUnique({
        where: { id: input.taskId },
        include: { model: true, provider: true },
    });
    if (!task)
        fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
    if (task.refundStatus === 'SUCCESS' || task.refundCredits > 0) {
        const wallet = await tx.wallet.findUnique({ where: { userId: task.userId } });
        if (!wallet)
            fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
        const normalizedTask = task.status === 'REFUNDED'
            ? task
            : await tx.generationTask.update({
                where: { id: task.id },
                data: {
                    status: 'REFUNDED',
                    refundStatus: 'SUCCESS',
                    refundReason: task.refundReason || input.reason,
                    refundedAt: task.refundedAt || new Date(),
                },
                include: { model: true, provider: true, refunds: true },
            });
        return { task: normalizedTask, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: true };
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
        if (!wallet)
            fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
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
        if (!wallet)
            fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
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
function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
export default router;
