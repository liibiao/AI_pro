import fs from 'node:fs/promises';
import { statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { assertEnoughBalance, calculateCreditsForUser, recordUsageAndCharge, refundUsageCharge } from '../../billing.js';
import { callUpstreamGetJson, callUpstreamJson, callUpstreamMultipart, extractImageResult, extractVideoResultUrl, extractVideoTask } from '../../upstream.js';
import { mockImageResponse, mockVideoStartResponse, mockVideoStatusResponse } from '../generate/mock.js';
import { getGenerationRuntimeSettings } from '../system-settings/service.js';
import { createObjectStorageBrowserUploadTarget, readUploadFile, uploadObjectStorageBuffer, uploadRequestFileToObjectStorage } from '../../object-storage.js';
import { getGenerationAdapter } from '../generation/adapters/registry.js';
import { rememberUploadedFileFallback, rememberUploadedFileFallbackPromise } from '../generation/file-fallback-store.js';

type CompatModelType = 'IMAGE' | 'VIDEO' | 'LLM';

type VideoTaskState = {
  taskId: string;
  modelId: string;
  usageId: string;
  endpointPath: string;
  taskParam: string;
  status: string;
  resultUrl: string;
  upstream: unknown;
  updatedAt: number;
};

const router = Router();
export const fileUploadCompatRouter = Router();

const videoTasks = new Map<string, VideoTaskState>();
const canvasLocalAssetRoot = path.resolve(process.cwd(), '..', '..', 'runninghub_outputs', 'image-studio-v3');

const imageGenerateSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  size: z.string().default('1024x1024'),
  n: z.union([z.string(), z.number()]).optional(),
  response_format: z.string().optional(),
  image: z.unknown().optional(),
  images: z.unknown().optional(),
  background: z.string().optional(),
  resolution: z.string().optional(),
  aspectRatio: z.string().optional(),
  imageSize: z.string().optional(),
  protocol: z.record(z.unknown()).optional(),
}).passthrough();

const videoStartSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  duration: z.union([z.string(), z.number()]).optional(),
  seconds: z.union([z.string(), z.number()]).optional(),
  durationSeconds: z.union([z.string(), z.number()]).optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  quality: z.string().optional(),
  endpointPath: z.string().optional(),
  taskParam: z.string().optional(),
  images: z.unknown().optional(),
  videoMode: z.string().optional(),
  generateAudio: z.boolean().optional(),
}).passthrough();

const ensureLocalImageSchema = z.object({
  localPath: z.string().optional(),
  path: z.string().optional(),
  remoteUrl: z.string().optional(),
  url: z.string().optional(),
  dataUrl: z.string().optional(),
  data_url: z.string().optional(),
  outputDir: z.string().optional(),
}).passthrough();

const localFileUploadSchema = z.object({
  localPath: z.string().optional(),
  path: z.string().optional(),
}).passthrough();

const objectStorageUploadTargetSchema = z.object({
  filename: z.string().optional(),
  name: z.string().optional(),
  contentType: z.string().optional(),
  type: z.string().optional(),
  size: z.union([z.string(), z.number()]).optional(),
}).passthrough();

router.get('/workbench/image-studio/models', requireAuth, asyncHandler(async (_req, res) => {
  const models = await prisma.aiModel.findMany({
    where: { status: 'ACTIVE', provider: { status: 'ACTIVE' } },
    include: { provider: true },
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  });

  ok(res, {
    models: models.map(model => {
      const type = model.type.toLowerCase();
      const isImage = model.type === 'IMAGE';
      const isVideo = model.type === 'VIDEO';
      const endpointPath = model.endpointPath || String(asRecord(model.protocol).endpointPath || '') || defaultEndpointPath(model.adapter || String(asRecord(model.protocol).adapter || ''), model.type);
      const protocol = {
        ...asRecord(model.protocol),
        adapter: model.adapter || String(asRecord(model.protocol).adapter || '') || (isImage ? 'openai-edits' : isVideo ? 'notevideo' : 'openai-chat'),
        method: String(asRecord(model.protocol).method || '') || (isVideo ? 'async-poll' : undefined),
        endpointPath,
        uploadMode: model.uploadMode || String(asRecord(model.protocol).uploadMode || '') || (isImage ? 'object_storage' : undefined),
      };
      return {
        id: model.id,
        configId: model.id,
        modelKey: model.id,
        identityKey: model.id,
        channelKey: model.provider.providerKey,
        providerKey: model.provider.providerKey,
        provider: {
          id: model.provider.id,
          providerKey: model.provider.providerKey,
          name: model.provider.name,
          baseUrl: model.provider.baseUrl,
          adapter: model.provider.adapter,
          uploadMode: model.provider.uploadMode,
        },
        name: model.displayName,
        nick: model.displayName,
        displayName: model.displayName,
        model: model.id,
        upstreamModel: model.name,
        realModelName: model.name,
        type,
        kind: type,
        url: model.provider.baseUrl,
        baseUrl: model.provider.baseUrl,
        key: 'platform-user',
        apiKey: 'platform-user',
        unit: model.unit,
        salePrice: model.salePrice,
        pricePerSecond: model.pricePerSecond,
        inputPriceUsdPer1m: Number(model.inputPriceUsdPer1m),
        outputPriceUsdPer1m: Number(model.outputPriceUsdPer1m),
        cnyPerUsdCost: Number(model.cnyPerUsdCost),
        creditsPerUsdCost: Number(model.creditsPerUsdCost),
        markupRate: Number(model.markupRate),
        endpointPath,
        statusEndpointPath: model.statusEndpointPath,
        adapter: protocol.adapter,
        uploadMode: protocol.uploadMode,
        protocol,
        supports: model.supports || (isImage
          ? { txt2img: true, img2img: true, imageToImage: true }
          : isVideo
            ? { txt2video: true, img2video: true }
            : { chat: true }),
        defaults: model.defaults || {},
        capabilities: model.capabilities || {},
        modelAssembly: model.modelAssembly || undefined,
        ui: model.ui || { label: model.displayName },
      };
    }),
  });
}));

router.post('/workbench/image-studio/generate', requireAuth, asyncHandler(async (req, res) => {
  const body = imageGenerateSchema.parse(req.body);
  const model = await getCompatModel(body.model, 'IMAGE');
  const quantity = clampInt(body.n, 1, 1, 10);
  const cost = await calculateCreditsForUser(prisma, req.user!.id, model, {
    quantity,
    durationSeconds: 0,
    inputTokens: 0,
    outputTokens: 0,
    size: body.size,
    resolution: body.resolution,
    imageSize: body.imageSize,
    params: pickCompatParams(body),
  });
  await assertEnoughBalance(prisma, req.user!.id, cost.chargedCredits);

  const requestPayload = {
    model: model.name,
    prompt: body.prompt,
    size: body.size,
    n: quantity,
    response_format: body.response_format || 'url',
    ...(body.background ? { background: body.background } : {}),
    ...(body.resolution ? { resolution: body.resolution } : {}),
    ...(body.aspectRatio ? { aspect_ratio: body.aspectRatio } : {}),
    ...(body.imageSize ? { image_size: body.imageSize } : {}),
    ...(body.image ? { image: body.image } : {}),
    ...(body.images ? { images: body.images } : {}),
  };
  const runtime = await getGenerationRuntimeSettings();

  try {
    let upstream: unknown;
    let requestJsonForRecord: unknown = requestPayload;
    let saved: ReturnType<typeof buildImageSaved>;
    let resultB64 = '';
    const adapterName = compatAdapterName(model);
    if (runtime.generationMockMode) {
      upstream = mockImageResponse({ prompt: body.prompt, size: body.size, quantity });
      const result = extractImageResult(upstream);
      resultB64 = result.b64;
      saved = buildImageSaved(result, upstream);
    } else if (isCompatGenerationAdapter(adapterName, 'IMAGE')) {
      const adapter = getGenerationAdapter(adapterName);
      const submit = await adapter.submit({
        provider: model.provider,
        model,
        type: 'IMAGE',
        mode: resolveCompatImageMode(body),
        prompt: body.prompt,
        inputFiles: extractCompatInputLinks(body),
        params: {
          ...pickCompatParams(body),
          size: body.size,
          imageSize: body.imageSize,
          aspectRatio: body.aspectRatio,
          background: body.background,
          n: quantity,
          quantity,
          image: body.image,
          images: body.images,
        },
        timeoutMs: runtime.upstreamTimeoutMs,
      });
      if (submit.status === 'FAILED') fail(502, submit.errorMessage || '上游生图失败', submit.errorCode || 'UPSTREAM_IMAGE_FAILED');
      upstream = submit.responseJson;
      requestJsonForRecord = submit.requestJson;
      const resultUrl = submit.resultUrls?.[0] || String((submit.resultJson as { url?: unknown } | undefined)?.url || '');
      saved = buildImageSaved({ url: resultUrl, b64: '' }, upstream);
    } else {
      const endpointPath = resolveEndpointPath(getEndpointPath(body.protocol, model, '/images/generations'), { model: model.name });
      upstream = await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
      const result = extractImageResult(upstream);
      resultB64 = result.b64;
      saved = buildImageSaved(result, upstream);
    }
    const resultUrl = saved.remoteUrl || saved.url || '';
    const record = await prisma.$transaction(async tx => {
      const usageRecord = await recordUsageAndCharge(tx, {
        userId: req.user!.id,
        model,
        status: 'SUCCESS',
        quantity,
        durationSeconds: 0,
        inputTokens: 0,
        outputTokens: 0,
        size: body.size,
        resolution: body.resolution,
        imageSize: body.imageSize,
        params: pickCompatParams(body),
        prompt: body.prompt,
        requestJson: requestJsonForRecord as Prisma.InputJsonValue,
        responseJson: upstream as Prisma.InputJsonValue,
        resultUrl,
        upstreamTaskId: String((upstream as { id?: unknown })?.id || ''),
      });
      await tx.generationTask.create({
        data: {
          userId: req.user!.id,
          providerId: model.providerId,
          modelId: model.id,
          channelKey: model.provider.providerKey,
          type: 'IMAGE',
          mode: resolveCompatImageMode(body),
          status: 'SUCCESS',
          progress: 100,
          prompt: body.prompt,
          inputFilesJson: extractCompatInputLinks(body) as Prisma.InputJsonValue,
          paramsJson: pickCompatParams(body) as Prisma.InputJsonValue,
          requestJson: requestJsonForRecord as Prisma.InputJsonValue,
          responseJson: upstream as Prisma.InputJsonValue,
          upstreamTaskId: String((upstream as { id?: unknown })?.id || ''),
          resultJson: { url: resultUrl } as Prisma.InputJsonValue,
          resultUrlsJson: resultUrl ? [resultUrl] : [],
          chargedCredits: usageRecord.chargedCredits,
          costAmount: usageRecord.costAmount,
          costUsd: new Prisma.Decimal(usageRecord.costUsd),
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      return usageRecord;
    });

    ok(res, {
      result: {
        url: saved.url || saved.cachedDataUrl || saved.remoteUrl || '',
        b64: resultB64,
        saved,
      },
      upstream,
      usage: record.usage,
      balance: record.balance,
      chargedCredits: record.chargedCredits,
    });
  } catch (err) {
    await recordFailedUsage(req.user!.id, model, body.prompt, requestPayload, err);
    throw err;
  }
}));

router.get('/workbench/image-studio/image/status', requireAuth, asyncHandler(async (req, res) => {
  const taskId = String(req.query.taskId || '').trim();
  if (!taskId) fail(400, '缺少 taskId', 'TASK_ID_REQUIRED');
  ok(res, {
    taskId,
    status: 'completed',
    progress: 100,
    localUrl: '',
    saved: { imageTaskId: taskId, downloadStatus: 'completed', downloadProgress: 100 },
  });
}));

router.post('/workbench/image-studio/video/start', requireAuth, asyncHandler(async (req, res) => {
  const body = videoStartSchema.parse(req.body);
  const model = await getCompatModel(body.model, 'VIDEO');
  const durationSeconds = clampInt(body.durationSeconds ?? body.seconds ?? body.duration, 5, 1, 120);
  const cost = await calculateCreditsForUser(prisma, req.user!.id, model, { quantity: 1, durationSeconds, inputTokens: 0, outputTokens: 0, resolution: body.resolution || body.quality, params: pickCompatParams(body) });
  await assertEnoughBalance(prisma, req.user!.id, cost.chargedCredits);

  const requestPayload = {
    model: resolveUpstreamModelName(model, body.model),
    prompt: body.prompt,
    duration: durationSeconds,
    seconds: durationSeconds,
    aspect_ratio: body.aspectRatio || '9:16',
    resolution: body.resolution || body.quality || '720p',
    ...(body.images ? { images: body.images } : {}),
    ...(body.videoMode ? { video_mode: body.videoMode } : {}),
    ...(body.generateAudio != null ? { generate_audio: body.generateAudio } : {}),
  };
  const runtime = await getGenerationRuntimeSettings();

  try {
    let upstream: unknown;
    let requestJsonForRecord: unknown = requestPayload;
    let taskId = '';
    let resultUrl = '';
    let status = 'processing';
    const adapterName = compatAdapterName(model);
    if (runtime.generationMockMode) {
      upstream = mockVideoStartResponse({ prompt: body.prompt, durationSeconds });
      taskId = extractVideoTask(upstream);
      resultUrl = extractVideoResultUrl(upstream);
      status = normalizeVideoStatus(upstream, resultUrl);
    } else if (isCompatGenerationAdapter(adapterName, 'VIDEO')) {
      const adapter = getGenerationAdapter(adapterName);
      const submit = await adapter.submit({
        provider: model.provider,
        model,
        type: 'VIDEO',
        mode: resolveCompatVideoMode(body),
        prompt: body.prompt,
        inputFiles: extractCompatInputLinks(body),
        params: {
          ...pickCompatParams(body),
          duration: durationSeconds,
          durationSeconds,
          seconds: durationSeconds,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution || body.quality,
          quality: body.quality || body.resolution,
          images: body.images,
          videoMode: body.videoMode,
          generateAudio: body.generateAudio,
        },
        timeoutMs: runtime.upstreamTimeoutMs,
      });
      if (submit.status === 'FAILED') fail(502, submit.errorMessage || '上游视频生成失败', submit.errorCode || 'UPSTREAM_VIDEO_FAILED');
      upstream = submit.responseJson;
      requestJsonForRecord = submit.requestJson;
      taskId = submit.upstreamTaskId || submit.upstreamRequestId || `compat-video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      resultUrl = submit.resultUrls?.[0] || String((submit.resultJson as { url?: unknown } | undefined)?.url || '');
      status = submit.status === 'SUCCESS' ? 'completed' : 'processing';
    } else {
      const endpointPath = resolveEndpointPath(body.endpointPath || getEndpointPath(undefined, model, '/video/generations'), { model: requestPayload.model });
      upstream = await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
      taskId = extractVideoTask(upstream);
      if (!taskId) fail(502, '视频接口未返回 taskId', 'UPSTREAM_TASK_ID_MISSING');
      resultUrl = extractVideoResultUrl(upstream);
      status = normalizeVideoStatus(upstream, resultUrl);
    }
    if (!taskId) fail(502, '视频接口未返回 taskId', 'UPSTREAM_TASK_ID_MISSING');
    const record = await prisma.$transaction(async tx => {
      const usageRecord = await recordUsageAndCharge(tx, {
        userId: req.user!.id,
        model,
        status: 'SUCCESS',
        quantity: 1,
        durationSeconds,
        inputTokens: 0,
        outputTokens: 0,
        resolution: body.resolution || body.quality,
        params: pickCompatParams(body),
        prompt: body.prompt,
        requestJson: requestJsonForRecord as Prisma.InputJsonValue,
        responseJson: upstream as Prisma.InputJsonValue,
        upstreamTaskId: taskId,
        resultUrl,
      });
      const generationTask = await tx.generationTask.create({
        data: {
          userId: req.user!.id,
          providerId: model.providerId,
          modelId: model.id,
          channelKey: model.provider.providerKey,
          type: 'VIDEO',
          mode: resolveCompatVideoMode(body),
          status: status === 'completed' ? 'SUCCESS' : status === 'failed' ? 'FAILED' : 'RUNNING',
          progress: status === 'completed' || status === 'failed' ? 100 : 0,
          prompt: body.prompt,
          inputFilesJson: extractCompatInputLinks(body) as Prisma.InputJsonValue,
          paramsJson: pickCompatParams(body) as Prisma.InputJsonValue,
          requestJson: requestJsonForRecord as Prisma.InputJsonValue,
          responseJson: upstream as Prisma.InputJsonValue,
          upstreamTaskId: taskId,
          resultJson: resultUrl ? ({ url: resultUrl } as Prisma.InputJsonValue) : undefined,
          resultUrlsJson: resultUrl ? [resultUrl] : [],
          chargedCredits: usageRecord.chargedCredits,
          costAmount: usageRecord.costAmount,
          costUsd: new Prisma.Decimal(usageRecord.costUsd),
          startedAt: new Date(),
          completedAt: status === 'completed' ? new Date() : undefined,
          failedAt: status === 'failed' ? new Date() : undefined,
        },
      });
      return { ...usageRecord, generationTask };
    });

    videoTasks.set(taskId, {
      taskId,
      modelId: model.id,
      usageId: record.usage.id,
      endpointPath: resolveEndpointPath(model.statusEndpointPath || model.provider.statusEndpointPath || '/video/status', { model: requestPayload.model, taskId }),
      taskParam: body.taskParam || 'taskId',
      status,
      resultUrl,
      upstream,
      updatedAt: Date.now(),
    });

    ok(res, buildVideoCompatResponse({ taskId, status, resultUrl, upstream, usage: record.usage, balance: record.balance, chargedCredits: record.chargedCredits }));
  } catch (err) {
    await recordFailedUsage(req.user!.id, model, body.prompt, requestPayload, err);
    throw err;
  }
}));

router.get('/workbench/image-studio/video/status', requireAuth, asyncHandler(async (req, res) => {
  const taskId = String(req.query.taskId || '').trim();
  if (!taskId) fail(400, '缺少 taskId', 'TASK_ID_REQUIRED');
  const cached = videoTasks.get(taskId);
  if (!cached) fail(404, '视频任务不存在或服务已重启', 'VIDEO_TASK_NOT_FOUND');

  const runtime = await getGenerationRuntimeSettings();
  if (runtime.generationMockMode) {
    const upstream = mockVideoStatusResponse(taskId);
    const resultUrl = extractVideoResultUrl(upstream) || cached.resultUrl;
    const status = normalizeVideoStatus(upstream, resultUrl);
    videoTasks.set(taskId, { ...cached, status, resultUrl, upstream, updatedAt: Date.now() });
    let refund: Awaited<ReturnType<typeof refundUsageCharge>> | null = null;
    if (status === 'failed') {
      refund = await prisma.$transaction(tx => refundUsageCharge(tx, {
        userId: req.user!.id,
        usageId: cached.usageId,
        responseJson: upstream as Prisma.InputJsonValue,
        resultUrl: resultUrl || undefined,
        errorMessage: extractVideoFailureMessage(upstream),
      }));
    }
    ok(res, { ...buildVideoCompatResponse({ taskId, status, resultUrl, upstream }), ...(refund ? { refund } : {}) });
    return;
  }

  const model = await prisma.aiModel.findUnique({ where: { id: cached.modelId }, include: { provider: true } });
  if (!model || model.status !== 'ACTIVE' || model.type !== 'VIDEO') fail(404, '模型不可用', 'MODEL_NOT_FOUND');
  const upstream = await callUpstreamGetJson(model.provider, resolveEndpointPath(cached.endpointPath, { model: model.name, taskId }), { [cached.taskParam]: taskId, taskId }, runtime.upstreamTimeoutMs);
  const resultUrl = extractVideoResultUrl(upstream) || cached.resultUrl;
  const status = normalizeVideoStatus(upstream, resultUrl);
  videoTasks.set(taskId, { ...cached, status, resultUrl, upstream, updatedAt: Date.now() });

  let refund: Awaited<ReturnType<typeof refundUsageCharge>> | null = null;
  if (status === 'failed') {
    refund = await prisma.$transaction(tx => refundUsageCharge(tx, {
      userId: req.user!.id,
      usageId: cached.usageId,
      responseJson: upstream as Prisma.InputJsonValue,
      resultUrl: resultUrl || undefined,
      errorMessage: extractVideoFailureMessage(upstream),
    }));
  } else if (resultUrl) {
    await prisma.$transaction(async tx => {
      await tx.modelUsage.updateMany({
        where: { id: cached.usageId, userId: req.user!.id },
        data: { responseJson: upstream as Prisma.InputJsonValue, resultUrl },
      });
      await tx.generationTask.updateMany({
        where: { upstreamTaskId: taskId, userId: req.user!.id },
        data: {
          status: 'SUCCESS',
          progress: 100,
          responseJson: upstream as Prisma.InputJsonValue,
          resultJson: { url: resultUrl } as Prisma.InputJsonValue,
          resultUrlsJson: [resultUrl],
          completedAt: new Date(),
        },
      });
    });
  }

  ok(res, { ...buildVideoCompatResponse({ taskId, status, resultUrl, upstream }), ...(refund ? { refund } : {}) });
}));

router.get('/workbench/image-studio/video/content', requireAuth, asyncHandler(async (req, res) => {
  const taskId = String(req.query.taskId || '').trim();
  const cached = taskId ? videoTasks.get(taskId) : null;
  if (cached?.resultUrl && await sendVideoResultUrl(req, res, cached.resultUrl)) {
    return;
  }
  const task = taskId ? await prisma.generationTask.findFirst({
    where: {
      userId: req.user!.id,
      type: 'VIDEO',
      OR: [{ id: taskId }, { upstreamTaskId: taskId }],
    },
    select: { resultUrlsJson: true, resultJson: true, responseJson: true },
  }) : null;
  const resultUrl = task ? firstGenerationVideoResultUrl(task) : '';
  if (resultUrl && await sendVideoResultUrl(req, res, resultUrl)) {
    return;
  }
  fail(404, '当前任务没有可代理的视频地址', 'VIDEO_CONTENT_NOT_FOUND');
}));

router.get('/workbench/image-studio/video/proxy', requireAuth, asyncHandler(async (req, res) => {
  const remoteUrl = String(req.query.remoteUrl || req.query.url || '').trim();
  if (!/^https?:\/\//i.test(remoteUrl)) fail(400, '缺少可代理的视频地址', 'VIDEO_PROXY_URL_MISSING');
  await sendRemoteVideo(req, res, remoteUrl);
}));

router.post('/workbench/image-studio/video/extract-audio', requireAuth, asyncHandler(async (req, res) => {
  const remoteUrl = String(req.body?.remoteUrl || req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(remoteUrl)) fail(400, '缺少可分离音频的视频地址', 'VIDEO_AUDIO_SOURCE_MISSING');
  const name = String(req.body?.name || 'video-audio').trim() || 'video-audio';
  const result = await extractAudioFromRemoteVideo(remoteUrl, name);
  ok(res, result);
}));

router.post('/workbench/image-studio/video/extract-audio-file', requireAuth, asyncHandler(async (req, res) => {
  const maxBytes = Number(process.env.WORKBENCH_VIDEO_UPLOAD_EXTRACT_MAX_BYTES || 0) || 500 * 1024 * 1024;
  const file = await readUploadFile(req, maxBytes);
  if (!file.contentType.startsWith('video/') && file.contentType !== 'application/octet-stream') {
    fail(400, `上传文件不是视频：${file.contentType}`, 'VIDEO_AUDIO_UPLOAD_TYPE_INVALID');
  }
  const name = String(file.fields.name || file.filename || 'video-audio').trim() || 'video-audio';
  const result = await extractAudioFromUploadedVideo(file.buffer, file.filename, file.contentType, name);
  ok(res, result);
}));

async function handleAudioToMp4(req: Request, res: Response) {
  const name = String(req.body?.name || req.body?.filename || 'audio-reference').trim() || 'audio-reference';
  const dataUrl = String(req.body?.dataUrl || req.body?.data_url || '').trim();
  const remoteUrl = String(req.body?.remoteUrl || req.body?.url || '').trim();
  const maxBytes = Number(process.env.WORKBENCH_AUDIO_TO_MP4_MAX_BYTES || 0) || 30 * 1024 * 1024;
  let result: Awaited<ReturnType<typeof convertAudioBufferToMp4>>;
  if (dataUrl) {
    const source = audioDataUrlToBuffer(dataUrl);
    if (source.buffer.length > maxBytes) fail(413, '音频文件过大，无法转换为 mp4', 'AUDIO_TO_MP4_TOO_LARGE');
    result = await convertAudioBufferToMp4(source.buffer, name, source.contentType);
  } else if (/^https?:\/\//i.test(remoteUrl)) {
    const source = await downloadAudioToTempFile(remoteUrl);
    try {
      result = await convertAudioFileToMp4(source.input, name);
    } finally {
      await fs.rm(source.dir, { recursive: true, force: true }).catch(() => undefined);
    }
  } else {
    fail(400, '缺少可转换的音频 dataUrl 或 remoteUrl', 'AUDIO_TO_MP4_SOURCE_MISSING');
  }
  ok(res, result);
}

router.post('/workbench/image-studio/convert/audio-to-mp4', requireAuth, asyncHandler(handleAudioToMp4));
router.post('/convert/audio-to-mp4', requireAuth, asyncHandler(handleAudioToMp4));

router.post('/workbench/image-studio/video/frame', requireAuth, asyncHandler(async (req, res) => {
  const remoteUrl = String(req.body?.remoteUrl || req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(remoteUrl)) fail(400, '缺少可截帧的视频地址', 'VIDEO_FRAME_SOURCE_MISSING');
  const at = Number(req.body?.at || req.body?.time || 0);
  const maxWidth = Number(req.body?.maxWidth || 0);
  const result = await captureFrameFromRemoteVideo(remoteUrl, Number.isFinite(at) ? at : 0, Number.isFinite(maxWidth) ? maxWidth : 0);
  ok(res, result);
}));

router.get('/workbench/image-studio/proxy-image', requireAuth, asyncHandler(async (req, res) => {
  const remoteUrl = String(req.query.remoteUrl || req.query.url || '').trim();
  if (!/^https?:\/\//i.test(remoteUrl)) fail(400, '缺少可代理的图片地址', 'REMOTE_IMAGE_PROXY_URL_MISSING');
  await sendRemoteImage(res, remoteUrl);
}));

router.post('/workbench/image-studio/proxy-image', requireAuth, asyncHandler(async (req, res) => {
  const remoteUrl = String(req.body?.remoteUrl || req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(remoteUrl)) fail(400, '缺少可代理的图片地址', 'REMOTE_IMAGE_PROXY_URL_MISSING');
  await sendRemoteImage(res, remoteUrl);
}));

router.post('/workbench/image-studio/ensure-local-image', requireAuth, asyncHandler(async (req, res) => {
  const body = ensureLocalImageSchema.parse(req.body);
  const existingPath = resolveExistingLocalFile(body.localPath || pathFromWorkbenchFileUrl(body.remoteUrl || body.url || ''));
  if (existingPath) {
    ok(res, buildLocalImageResponse(existingPath, body.remoteUrl || body.url || '', 'existing_local_image'));
    return;
  }
  const dataUrl = String(body.dataUrl || body.data_url || '').trim();
  if (dataUrl) {
    const decoded = decodeImageDataUrl(dataUrl);
    const target = await writeCanvasLocalAsset(decoded.buffer, decoded.ext);
    ok(res, buildLocalImageResponse(target, '', 'data_url_reference_image'));
    return;
  }
  const remoteUrl = String(body.remoteUrl || body.url || '').trim();
  if (remoteUrl) {
    const downloaded = await downloadImageToBuffer(remoteUrl);
    const target = await writeCanvasLocalAsset(downloaded.buffer, downloaded.ext);
    ok(res, buildLocalImageResponse(target, remoteUrl, 'downloaded_reference_image'));
    return;
  }
  fail(400, '缺少可用图片来源：本地路径不存在，且没有 dataUrl 或在线地址', 'LOCAL_IMAGE_SOURCE_MISSING');
}));

router.post('/workbench/image-studio/upload-local-file-to-object-storage', requireAuth, asyncHandler(async (req, res) => {
  const body = localFileUploadSchema.parse(req.body);
  const filePath = resolveExistingLocalFile(body.localPath || body.path || '');
  if (!filePath) fail(400, '本地图片不存在或不可读', 'LOCAL_IMAGE_NOT_FOUND');
  const buffer = await fs.readFile(filePath);
  const uploaded = await uploadObjectStorageBuffer({
    userId: req.user!.id,
    buffer,
    filename: path.basename(filePath),
    contentType: inferLocalContentType(filePath),
  });
  ok(res, {
    id: uploaded.url,
    fileId: uploaded.url,
    uploadRef: uploaded.url,
    providerRef: uploaded.url,
    remoteUrl: uploaded.url,
    url: uploaded.url,
    uploaded: true,
    uploadMode: 'object_storage',
    provider: uploaded.provider,
    key: uploaded.key,
    contentType: uploaded.contentType,
    bytes: uploaded.size,
    size: uploaded.size,
    filename: uploaded.filename,
  });
}));

router.post('/workbench/image-studio/upload-reference', requireAuth, asyncHandler(async (req, res) => {
  const uploaded = await uploadRequestFileToObjectStorage(req, { userId: req.user!.id, mode: 'object_storage' });
  ok(res, {
    id: uploaded.url,
    fileId: uploaded.url,
    uploadRef: uploaded.url,
    providerRef: uploaded.url,
    remoteUrl: uploaded.url,
    url: uploaded.url,
    uploaded: true,
    uploadMode: 'object_storage',
    provider: uploaded.provider,
    key: uploaded.key,
    contentType: uploaded.contentType,
    bytes: uploaded.size,
    size: uploaded.size,
    filename: uploaded.filename,
  });
}));

router.post('/workbench/image-studio/object-storage-upload-target', requireAuth, asyncHandler(async (req, res) => {
  const body = objectStorageUploadTargetSchema.parse(req.body || {});
  const target = createObjectStorageBrowserUploadTarget({
    userId: req.user!.id,
    filename: body.filename || body.name || 'reference.png',
    contentType: body.contentType || body.type || 'application/octet-stream',
    size: Number(body.size || 0),
  });
  ok(res, {
    ...target,
    id: target.publicUrl,
    fileId: target.publicUrl,
    uploadRef: target.publicUrl,
    providerRef: target.publicUrl,
    remoteUrl: target.publicUrl,
    url: target.publicUrl,
    uploadMode: 'object_storage',
    directUpload: true,
  });
}));

router.post('/workbench/image-studio/upload-provider-file', requireAuth, asyncHandler(async (req, res) => {
  const file = await readUploadFile(req);
  const modelId = String(file.fields.modelId || file.fields.model || req.query.modelId || req.query.model || '').trim();
  const channelKey = String(file.fields.channelKey || file.fields.providerKey || req.query.channelKey || req.query.providerKey || '').trim();
  const target = await getProviderFileUploadTarget(modelId, channelKey);
  const fallbackUpload = uploadObjectStorageBuffer({
    userId: req.user!.id,
    buffer: file.buffer,
    filename: file.filename,
    contentType: file.contentType,
  }).catch(() => null);
  const form = new FormData();
  form.append('purpose', String(file.fields.purpose || req.query.purpose || 'vision'));
  const fileBody = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer;
  form.append('file', new Blob([fileBody], { type: file.contentType }), file.filename);
  const upstreamTimeoutMs = Math.max(15000, Math.min(Number(target.provider.timeoutMs || 60000), 90000));
  const upstream = await callUpstreamMultipart(target.provider, '/v1/files', form, upstreamTimeoutMs);
  const fileId = extractProviderFileId(upstream);
  if (!/^file-[\w-]+$/i.test(fileId)) fail(502, '中转站 /v1/files 未返回 file-xxx', 'PROVIDER_FILE_ID_MISSING');
  rememberUploadedFileFallbackPromise(fileId, fallbackUpload.then(fallback => fallback?.url || ''));
  ok(res, {
    id: fileId,
    fileId,
    uploadRef: fileId,
    providerRef: fileId,
    object: 'file',
    purpose: 'vision',
    uploaded: true,
    uploadMode: 'files',
    filename: file.filename,
    contentType: file.contentType,
    bytes: file.size,
    size: file.size,
    providerKey: target.provider.providerKey,
    baseUrl: target.provider.baseUrl,
    fallbackRemoteUrl: '',
    objectStorageUrl: '',
  });
}));

fileUploadCompatRouter.post('/', requireAuth, asyncHandler(async (req, res) => {
  const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const uploaded = await uploadRequestFileToObjectStorage(req, { userId: req.user!.id, mode: 'files' });
  rememberUploadedFileFallback(fileId, uploaded.url);
  ok(res, {
    id: fileId,
    fileId,
    uploadRef: fileId,
    providerRef: fileId,
    remoteUrl: uploaded.url,
    url: uploaded.url,
    object: 'file',
    purpose: 'vision',
    uploaded: true,
    uploadMode: 'files',
    provider: uploaded.provider,
    key: uploaded.key,
    contentType: uploaded.contentType,
    bytes: uploaded.size,
    size: uploaded.size,
    filename: uploaded.filename,
  });
}));

async function getCompatModel(modelCode: string, type: CompatModelType) {
  const code = String(modelCode || '').trim();
  let model = await prisma.aiModel.findFirst({
    where: {
      status: 'ACTIVE',
      type,
      OR: [
        { id: code },
        { name: code },
        { displayName: code },
      ],
    },
    include: { provider: true },
  });
  if (!model && type === 'VIDEO') {
    const candidates = await prisma.aiModel.findMany({ where: { status: 'ACTIVE', type }, include: { provider: true } });
    model = candidates.find(candidate => matchesModelAssembly(candidate.modelAssembly, code)) || null;
  }
  if (!model) fail(404, '模型不可用', 'MODEL_NOT_FOUND');
  return model;
}

async function getProviderFileUploadTarget(modelCode: string, channelKey: string) {
  const code = String(modelCode || '').trim();
  const providerKey = String(channelKey || '').trim();
  if (code) {
    const model = await prisma.aiModel.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { id: code },
          { modelKey: code },
          { name: code },
          { displayName: code },
        ],
      },
      include: { provider: true },
    });
    if (model) return { model, provider: model.provider };
  }
  if (providerKey) {
    const provider = await prisma.upstreamProvider.findFirst({
      where: { providerKey, status: 'ACTIVE' },
    });
    if (provider) return { model: null, provider };
  }
  fail(404, '参考图上传渠道不可用：缺少有效 modelId/channelKey', 'PROVIDER_UPLOAD_TARGET_NOT_FOUND');
}

function extractProviderFileId(upstream: unknown) {
  const root = asRecord(upstream);
  const data = asRecord(root.data);
  const file = asRecord(root.file);
  return String(root.id || root.fileId || root.file_id || root.uploadRef || data.id || data.fileId || data.file_id || file.id || '').trim();
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getEndpointPath(_protocol: Record<string, unknown> | undefined, model: Awaited<ReturnType<typeof getCompatModel>>, fallback: string) {
  const modelProtocol = asRecord(model.protocol);
  const storedPath = String(model.endpointPath || modelProtocol.endpointPath || modelProtocol.endpoint_path || '').trim();
  return storedPath || defaultEndpointPath(model.adapter || String(modelProtocol.adapter || ''), model.type) || fallback;
}

function compatAdapterName(model: Awaited<ReturnType<typeof getCompatModel>>) {
  const modelProtocol = asRecord(model.protocol);
  return String(model.adapter || model.provider.adapter || modelProtocol.adapter || '').trim();
}

function isCompatGenerationAdapter(adapter: string, type: CompatModelType) {
  const value = String(adapter || '').trim();
  if (type === 'IMAGE') return ['openai-edits', 'openai-responses-image', 'gpt-image-v2', 'grok-image', 'grok-image-edit', 'gemini-image-generate', 'gemini-image-edit'].includes(value);
  if (type === 'VIDEO') return ['sora-video', 'seedance2-vip', 'seedance2.0-vip', 'notevideo', 'grok-video', 'gemini-video', 'veo-video'].includes(value);
  return false;
}

function defaultEndpointPath(adapter: string, type: CompatModelType) {
  switch (adapter) {
    case 'openai-edits': return '/images/edits';
    case 'openai-responses-image': return '/responses';
    case 'openai-chat': return '/chat/completions';
    case 'gpt-image-v2': return '/images/generations';
    case 'grok-image': return '/images/generations';
    case 'grok-image-edit': return '/images/edits';
    case 'grok-chat':
    case 'grok-llm': return '/chat/completions';
    case 'sora-video':
    case 'seedance2-vip':
    case 'seedance2.0-vip':
    case 'notevideo': return '/videos';
    case 'grok-video': return '/videos';
    case 'gemini-image': return '/v1beta/models/{model}:generateContent';
    case 'gemini-image-generate': return '/images/generations';
    case 'gemini-image-edit': return '/images/edits';
    case 'gemini-chat':
    case 'gemini-llm': return '/chat/completions';
    case 'gemini-video':
    case 'veo-video': return '/videos';
    case 'veo-chat':
    case 'veo-3.1': return '/v1/chat/completions';
    case 'notevideo':
    case 'seedance':
    case 'jimeng':
    case 'runninghub':
    case 'cli-proxy': return '/video/generations';
    default: return type === 'VIDEO' ? '/video/generations' : type === 'LLM' ? '/chat/completions' : '/images/generations';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveEndpointPath(endpointPath: string, tokens: { model?: string; taskId?: string }) {
  return String(endpointPath || '')
    .replaceAll('{model}', encodeURIComponent(tokens.model || ''))
    .replaceAll('{baseModel}', encodeURIComponent(tokens.model || ''))
    .replaceAll('{taskId}', encodeURIComponent(tokens.taskId || ''))
    .replaceAll('{task_id}', encodeURIComponent(tokens.taskId || ''));
}

function resolveUpstreamModelName(model: Awaited<ReturnType<typeof getCompatModel>>, requested: string) {
  const value = String(requested || '').trim();
  const exact = [model.id, model.name, model.displayName].includes(value);
  if (model.type === 'VIDEO' && value && !exact) return value;
  return model.name;
}

function matchesModelAssembly(modelAssembly: unknown, modelCode: string) {
  const template = String(asRecord(modelAssembly).template || '').trim();
  if (!template || !modelCode) return false;
  const pattern = escapeRegExp(template).replace(/\\\{(?:baseModel|model|resolution|duration|aspectRatio)\\\}/g, '[^/]+');
  return new RegExp(`^${pattern}$`).test(modelCode);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildImageSaved(result: { url: string; b64: string }, upstream: unknown) {
  const filename = `img-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.png`;
  const upstreamId = String((upstream as { id?: unknown })?.id || '');
  if (result.b64) {
    return {
      cachedDataUrl: `data:image/png;base64,${result.b64}`,
      url: '',
      remoteUrl: '',
      filename,
      imageTaskId: upstreamId,
    };
  }
  return {
    url: result.url,
    remoteUrl: /^https?:\/\//i.test(result.url) ? result.url : '',
    localUrl: result.url && !/^https?:\/\//i.test(result.url) ? result.url : '',
    filename,
    imageTaskId: upstreamId,
  };
}

function resolveCompatImageMode(body: z.infer<typeof imageGenerateSchema>) {
  const text = [body.mode, body.taskType, body.template].filter(Boolean).join(' ').toLowerCase();
  if (/storyboard|故事板/.test(text)) return 'storyboard';
  return body.image || body.images ? 'image-to-image' : 'text-to-image';
}

function resolveCompatVideoMode(body: z.infer<typeof videoStartSchema>) {
  return body.images || body.image || body.reference_image_urls || body.referenceImages || body.reference_images ? 'image-to-video' : 'text-to-video';
}

function extractCompatInputLinks(body: Record<string, unknown>) {
  const values = [
    body.image,
    body.images,
    body.reference_image_urls,
    body.referenceImageUrls,
    body.reference_images,
    body.referenceImages,
    body.video_url,
    body.videoUrl,
    body.reference_video,
    body.referenceVideo,
    body.reference_videos,
    body.referenceVideos,
    body.audio_url,
    body.audioUrl,
  ].flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  return values.map(value => {
    if (typeof value === 'string') return value;
    const record = asRecord(value);
    return record.url || record.remoteUrl || record.fileId || record.id || value;
  });
}

function pickCompatParams(body: Record<string, unknown>) {
  const params: Record<string, unknown> = {};
  [
    'size', 'n', 'background', 'resolution', 'aspectRatio', 'imageSize',
    'duration', 'seconds', 'durationSeconds', 'duration_seconds', 'quality',
    'videoMode', 'generateAudio', 'mode', 'taskType', 'template',
    'image', 'images', 'reference_image_urls', 'referenceImageUrls', 'reference_images', 'referenceImages',
    'video_url', 'videoUrl', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos', 'refVideo', 'video',
    'audio_url', 'audioUrl', 'refAudio', 'audio', 'soraV3ReferenceVideoUrl', 'referenceVideoUrl', 'audioReferenceVideoUrl',
    'reference_mode', 'referenceMode', 'audio_mode', 'audioMode',
  ].forEach(key => {
    if (body[key] != null) params[key] = body[key];
  });
  return params;
}
function normalizeVideoStatus(upstream: unknown, resultUrl = '') {
  const raw = extractVideoTaskStatus(upstream);
  if (resultUrl) return 'completed';
  if (isCompatVideoDoneStatus(raw)) return 'completed';
  if (isCompatVideoFailedStatus(raw)) return 'failed';
  return raw || 'processing';
}

function extractVideoFailureMessage(upstream: unknown) {
  const recursive = findCompatVideoErrorMessage(upstream, 0);
  return recursive || '上游视频任务失败';
}

function extractVideoTaskStatus(payload: unknown) {
  const data = payload as any;
  const candidates = [
    data?.data?.status,
    data?.data?.state,
    data?.data?.task_status,
    data?.data?.taskStatus,
    data?.data?.task?.status,
    data?.data?.task?.state,
    data?.data?.result?.status,
    data?.data?.video?.status,
    data?.task?.status,
    data?.task?.state,
    data?.result?.status,
    data?.state,
    data?.task_status,
    data?.taskStatus,
    data?.status,
  ].map(normalizeCompatVideoStatusValue).filter(Boolean);
  if (candidates.length) return candidates[0];
  return findCompatVideoStatus(payload, 0);
}

function findCompatVideoStatus(value: unknown, depth: number): string {
  if (!value || depth > 5 || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCompatVideoStatus(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(status|state|task_status|taskStatus|status_text|statusText)$/i.test(key)) {
      const normalized = normalizeCompatVideoStatusValue(item);
      if (normalized) return normalized;
    }
    if (item && typeof item === 'object') {
      const found = findCompatVideoStatus(item, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function normalizeCompatVideoStatusValue(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || /^\d+$/.test(raw)) return '';
  if (/^(success|succeeded|completed|complete|done|finished|finish)$/i.test(raw) || /成功|完成/.test(raw)) return 'completed';
  if (/^(failed|failure|fail|error|errored|cancelled|canceled|rejected|blocked|denied)$/i.test(raw) || /失败|错误|拒绝|拦截|审核失败/.test(raw)) return 'failed';
  if (/^(pending|queued|queue|processing|running|in_progress|generating|submitted|created)$/i.test(raw) || /排队|等待|处理中|进行中|生成中/.test(raw)) return raw;
  return '';
}

function isCompatVideoFailedStatus(status: string) {
  return normalizeCompatVideoStatusValue(status) === 'failed';
}

function isCompatVideoDoneStatus(status: string) {
  return normalizeCompatVideoStatusValue(status) === 'completed';
}

function findCompatVideoErrorMessage(value: unknown, depth: number): string {
  if (!value || depth > 6) return '';
  if (typeof value === 'string' || typeof value === 'number') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCompatVideoErrorMessage(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries) {
    if (/error|message|msg|reason|fail|reject|audit|moderation|policy|copyright|safety|blocked/i.test(key)) {
      const formatted = formatCompatVideoErrorValue(item);
      if (formatted) return formatted;
    }
  }
  for (const [, item] of entries) {
    if (item && typeof item === 'object') {
      const found = findCompatVideoErrorMessage(item, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function formatCompatVideoErrorValue(value: unknown): string {
  if (value === undefined || value === null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value).trim();
    if (!raw || /^(failed|failure|fail|error|cancelled|canceled)$/i.test(raw)) return '';
    return raw.length > 800 ? `${raw.slice(0, 800)}...` : raw;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const formatted = formatCompatVideoErrorValue(item);
      if (formatted) return formatted;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  const message = formatCompatVideoErrorValue(item.message ?? item.error_message ?? item.errorMessage ?? item.msg ?? item.reason ?? item.fail_reason ?? item.failed_reason ?? item.failure_reason ?? item.detail ?? item.description);
  const code = formatCompatVideoErrorValue(item.code ?? item.error_code ?? item.errorCode ?? item.type);
  if (message && code && !message.includes(code)) return `${message}（${code}）`;
  return message || code || '';
}

function isLikelyVideoResultUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (/^data:video\//i.test(raw)) return true;
  try {
    const url = new URL(raw, 'http://local');
    const path = String(url.pathname || '').toLowerCase();
    return /\.(mp4|webm|mov|m4v|mkv)(?:$|[?#])/i.test(path) || /\/(?:video|videos)\//i.test(path);
  } catch {
    return /\.(mp4|webm|mov|m4v|mkv)(?:$|[?#])/i.test(raw) || /\/(?:video|videos)\//i.test(raw);
  }
}

function collectGenerationVideoResultUrls(value: unknown, urls: string[] = []) {
  const push = (item: unknown) => {
    const raw = String(item || '').trim();
    if (!raw) return;
    if (!/^data:video\//i.test(raw) && !/^https?:\/\//i.test(raw) && !/^\/api\//i.test(raw) && !/^\/v1\/(?:files|videos)\//i.test(raw)) return;
    if (!urls.includes(raw)) urls.push(raw);
  };
  const visit = (item: unknown, key = '') => {
    if (!item) return;
    if (typeof item === 'string') {
      if (/url|uri|output|video|result|content|download/i.test(key) || /^data:video\//i.test(item) || /^https?:\/\//i.test(item) || /^\/api\//i.test(item) || /^\/v1\//i.test(item)) push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(child => visit(child, key));
      return;
    }
    if (typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const inline = record.inlineData || record.inline_data;
      if (inline) visit(inline, 'inlineData');
      Object.entries(record).forEach(([itemKey, child]) => {
        if (/url|uri|output|video|result|content|download/i.test(itemKey)) visit(child, itemKey);
        else if (child && typeof child === 'object') visit(child, itemKey);
      });
    }
  };
  visit(value);
  return urls;
}

function firstGenerationVideoResultUrl(task: { resultUrlsJson?: unknown; resultJson?: unknown; responseJson?: unknown }) {
  const urls: string[] = [];
  collectGenerationVideoResultUrls(task.resultUrlsJson, urls);
  collectGenerationVideoResultUrls(task.resultJson, urls);
  collectGenerationVideoResultUrls(task.responseJson, urls);
  return urls.find(isLikelyVideoResultUrl) || urls[0] || '';
}

function buildVideoCompatResponse(input: {
  taskId: string;
  status: string;
  resultUrl: string;
  upstream: unknown;
  usage?: unknown;
  balance?: number;
  chargedCredits?: number;
}) {
  const done = input.status === 'completed';
  const saved = input.resultUrl
    ? { url: input.resultUrl, remoteUrl: /^https?:\/\//i.test(input.resultUrl) ? input.resultUrl : '', taskId: input.taskId }
    : { taskId: input.taskId };
  return {
    taskId: input.taskId,
    providerTaskId: input.taskId,
    status: input.status,
    progress: done ? 100 : 20,
    contentUrl: input.resultUrl,
    downloadUrl: input.resultUrl,
    localUrl: '',
    saved,
    upstream: input.upstream,
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.balance != null ? { balance: input.balance } : {}),
    ...(input.chargedCredits != null ? { chargedCredits: input.chargedCredits } : {}),
  };
}

function resolveExistingLocalFile(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidates = [
    path.resolve(raw),
    path.resolve(process.cwd(), raw),
    path.resolve(process.cwd(), '..', '..', raw),
  ];
  for (const candidate of candidates) {
    try {
      const stat = requireFsStat(candidate);
      if (stat?.isFile()) return candidate;
    } catch {
      // keep scanning common deployment roots
    }
  }
  return '';
}

function requireFsStat(filePath: string) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function pathFromWorkbenchFileUrl(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(raw, 'http://local');
    if (url.pathname !== '/api/workbench/image-studio/file') return '';
    return url.searchParams.get('path') || '';
  } catch {
    return '';
  }
}

function decodeImageDataUrl(value: string) {
  const match = String(value || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) fail(400, '图片数据格式不正确，无法落盘', 'IMAGE_DATA_URL_INVALID');
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) fail(400, '图片数据为空，无法落盘', 'IMAGE_DATA_EMPTY');
  return { buffer, contentType, ext: extFromContentType(contentType) };
}

async function writeCanvasLocalAsset(buffer: Buffer, ext = '.png') {
  await fs.mkdir(canvasLocalAssetRoot, { recursive: true });
  const filename = `canvas-asset-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 10)}${safeLocalExt(ext)}`;
  const target = path.join(canvasLocalAssetRoot, filename);
  await fs.writeFile(target, buffer);
  return target;
}

function buildLocalImageResponse(filePath: string, remoteUrl = '', sourceType = 'local_image') {
  const filename = path.basename(filePath);
  const saved = {
    filename,
    path: filePath,
    localPath: filePath,
    localUrl: '',
    url: '',
    remoteUrl,
    sourceType,
    downloadStatus: 'completed',
    downloadProgress: 100,
  };
  return {
    exists: true,
    downloaded: sourceType === 'downloaded_reference_image',
    localPath: filePath,
    localUrl: '',
    remoteUrl,
    saved,
  };
}

async function downloadImageToBuffer(remoteUrl: string) {
  const resp = await fetch(remoteUrl, { headers: { Accept: 'image/*,*/*' } });
  if (!resp.ok) fail(resp.status >= 500 ? 502 : 400, `在线图片下载失败 HTTP ${resp.status}`, 'REMOTE_IMAGE_DOWNLOAD_FAILED');
  const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith('image/')) fail(400, `在线地址不是图片：${contentType}`, 'REMOTE_IMAGE_CONTENT_TYPE_INVALID');
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!buffer.length) fail(400, '在线图片内容为空', 'REMOTE_IMAGE_EMPTY');
  return { buffer, contentType, ext: extFromContentType(contentType || 'image/png') };
}

async function sendRemoteImage(res: Response, remoteUrl: string) {
  const { buffer, contentType } = await downloadImageToBuffer(remoteUrl);
  const maxBytes = Number(process.env.WORKBENCH_IMAGE_PROXY_MAX_BYTES || 0) || 80 * 1024 * 1024;
  if (buffer.length > maxBytes) fail(413, '在线图片过大，无法代理加载全景图', 'REMOTE_IMAGE_TOO_LARGE');
  res.setHeader('Content-Type', contentType || inferLocalContentType(remoteUrl));
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.end(buffer);
}

async function sendVideoResultUrl(req: Request, res: Response, resultUrl: string) {
  const raw = String(resultUrl || '').trim();
  if (!raw) return false;
  if (/^https?:\/\//i.test(raw)) {
    await sendRemoteVideo(req, res, raw);
    return true;
  }
  if (/^\/(?:api|v1)\//i.test(raw)) {
    res.redirect(raw);
    return true;
  }
  return false;
}

async function sendRemoteVideo(req: Request, res: Response, remoteUrl: string) {
  const range = String(req.headers.range || '').trim();
  const headers: Record<string, string> = { Accept: 'video/*,*/*', 'User-Agent': 'Mozilla/5.0 CanvasVideoProxy/1.0' };
  if (range) headers.Range = range;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.WORKBENCH_VIDEO_PROXY_TIMEOUT_MS || 0) || 120000);
  let resp: globalThis.Response | null = null;
  try {
    resp = await fetch(remoteUrl, { headers, signal: controller.signal });
  } catch (err) {
    fail(502, `在线视频代理读取失败：${err instanceof Error ? err.message : String(err)}`, 'REMOTE_VIDEO_PROXY_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }
  if (!resp) fail(502, '在线视频代理读取失败', 'REMOTE_VIDEO_PROXY_FETCH_FAILED');
  if (!resp.ok) fail(resp.status >= 500 ? 502 : 400, `在线视频代理失败 HTTP ${resp.status}`, 'REMOTE_VIDEO_PROXY_FAILED');
  const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    fail(400, `在线地址不是视频：${contentType}`, 'REMOTE_VIDEO_CONTENT_TYPE_INVALID');
  }
  const maxBytes = Number(process.env.WORKBENCH_VIDEO_PROXY_MAX_BYTES || 0) || 500 * 1024 * 1024;
  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (!range && contentLength > maxBytes) fail(413, '在线视频过大，无法代理截帧', 'REMOTE_VIDEO_TOO_LARGE');
  res.setHeader('Content-Type', contentType || inferRemoteVideoContentType(remoteUrl));
  res.setHeader('Accept-Ranges', resp.headers.get('accept-ranges') || 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=300');
  for (const key of ['content-range', 'content-length', 'etag', 'last-modified']) {
    const value = resp.headers.get(key);
    if (value) res.setHeader(key.replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase()), value);
  }
  res.status(resp.status === 206 ? 206 : 200);
  if (resp.body) {
    const stream = Readable.fromWeb(resp.body as unknown as import('node:stream/web').ReadableStream);
    stream.on('error', () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    stream.pipe(res);
    return;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (!buffer.length) fail(400, '在线视频内容为空', 'REMOTE_VIDEO_EMPTY');
  if (!range && buffer.length > maxBytes) fail(413, '在线视频过大，无法代理截帧', 'REMOTE_VIDEO_TOO_LARGE');
  if (!res.getHeader('Content-Length')) res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}

async function downloadVideoToTempFile(remoteUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.WORKBENCH_VIDEO_EXTRACT_DOWNLOAD_TIMEOUT_MS || 0) || 120000);
  try {
    const resp = await fetch(remoteUrl, { headers: { Accept: 'video/*,*/*' }, signal: controller.signal });
    if (!resp.ok) fail(resp.status >= 500 ? 502 : 400, `在线视频下载失败 HTTP ${resp.status}`, 'REMOTE_VIDEO_DOWNLOAD_FAILED');
    const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
      fail(400, `在线地址不是视频：${contentType}`, 'REMOTE_VIDEO_CONTENT_TYPE_INVALID');
    }
    const maxBytes = Number(process.env.WORKBENCH_VIDEO_EXTRACT_MAX_BYTES || 0) || 300 * 1024 * 1024;
    const contentLength = Number(resp.headers.get('content-length') || 0);
    if (contentLength > maxBytes) fail(413, '在线视频过大，无法在线分离音频', 'REMOTE_VIDEO_TOO_LARGE_FOR_AUDIO_EXTRACT');
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (!buffer.length) fail(400, '在线视频内容为空', 'REMOTE_VIDEO_EMPTY');
    if (buffer.length > maxBytes) fail(413, '在线视频过大，无法在线分离音频', 'REMOTE_VIDEO_TOO_LARGE_FOR_AUDIO_EXTRACT');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-video-audio-'));
    const input = path.join(dir, 'input' + safeLocalExt(extFromContentType(contentType || inferRemoteVideoContentType(remoteUrl)) || '.mp4'));
    await fs.writeFile(input, buffer);
    return { dir, input };
  } finally {
    clearTimeout(timer);
  }
}

function runFfmpegExtractAudio(input: string, output: string) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
    const child = spawn(ffmpeg, ['-y', '-i', input, '-vn', '-acodec', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk || '').slice(0, 8000); });
    child.on('error', err => reject(new Error(`ffmpeg 不可用：${err.message}`)));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg 分离音频失败，退出码 ${code}`));
    });
  });
}

function runFfmpegExtractFrame(input: string, output: string, at: number, maxWidth = 0, remote = false) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
    const args = ['-y', '-ss', String(Math.max(0, Number(at) || 0))];
    if (remote) {
      args.push('-user_agent', 'Mozilla/5.0 CanvasVideoFrame/1.0');
      args.push('-headers', 'Accept: video/*,*/*\r\n');
    }
    args.push('-i', input, '-frames:v', '1');
    if (maxWidth > 0) args.push('-vf', `scale='min(${Math.round(maxWidth)},iw)':-2`);
    args.push('-q:v', '2', output);
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk || '').slice(0, 8000); });
    child.on('error', err => reject(new Error(`ffmpeg 不可用：${err.message}`)));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg 截取视频帧失败，退出码 ${code}`));
    });
  });
}

async function extractAudioFromUploadedVideo(buffer: Buffer, filename: string, contentType: string, name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-video-audio-upload-'));
  try {
    const input = path.join(dir, 'input' + safeLocalExt(extFromContentType(contentType || '') || path.extname(filename || '') || '.mp4'));
    const output = path.join(dir, 'audio.m4a');
    await fs.writeFile(input, buffer);
    await runFfmpegExtractAudio(input, output);
    const audio = await fs.readFile(output);
    if (!audio.length) fail(400, '视频没有可分离的音轨', 'VIDEO_AUDIO_TRACK_EMPTY');
    const outName = `${String(name || filename || 'video-audio').replace(/\.(mp4|webm|mov|m4v|avi|mkv)$/i, '').replace(/[^\w\u4e00-\u9fa5.-]+/g, '-').slice(0, 80) || 'video-audio'}.m4a`;
    return {
      audioUrl: `data:audio/mp4;base64,${audio.toString('base64')}`,
      dataUrl: `data:audio/mp4;base64,${audio.toString('base64')}`,
      filename: outName,
      contentType: 'audio/mp4',
      size: audio.length,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function captureFrameFromRemoteVideo(remoteUrl: string, at: number, maxWidth = 0) {
  let dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-video-frame-'));
  try {
    let output = path.join(dir, 'frame.jpg');
    try {
      await runFfmpegExtractFrame(remoteUrl, output, at, maxWidth, true);
    } catch (directErr) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      dir = '';
      const downloaded = await downloadVideoToTempFile(remoteUrl);
      dir = downloaded.dir;
      output = path.join(dir, 'frame.jpg');
      await runFfmpegExtractFrame(downloaded.input, output, at, maxWidth, false).catch(err => {
        throw new Error(`${err.message || err}; 直接截帧失败：${directErr instanceof Error ? directErr.message : String(directErr)}`);
      });
    }
    const image = await fs.readFile(output);
    if (!image.length) fail(400, '视频当前帧为空', 'VIDEO_FRAME_EMPTY');
    return {
      dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
      imageUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
      contentType: 'image/jpeg',
      size: image.length,
    };
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractAudioFromRemoteVideo(remoteUrl: string, name: string) {
  let tempDir = '';
  try {
    const downloaded = await downloadVideoToTempFile(remoteUrl);
    tempDir = downloaded.dir;
    const output = path.join(tempDir, 'audio.m4a');
    await runFfmpegExtractAudio(downloaded.input, output);
    const audio = await fs.readFile(output);
    if (!audio.length) fail(400, '视频没有可分离的音轨', 'VIDEO_AUDIO_TRACK_EMPTY');
    const filename = `${String(name || 'video-audio').replace(/\.(mp4|webm|mov|m4v|avi|mkv)$/i, '').replace(/[^\w\u4e00-\u9fa5.-]+/g, '-').slice(0, 80) || 'video-audio'}.m4a`;
    return {
      audioUrl: `data:audio/mp4;base64,${audio.toString('base64')}`,
      contentType: 'audio/mp4',
      filename,
      size: audio.length,
      sourceUrl: remoteUrl,
    };
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function audioDataUrlToBuffer(dataUrl: string) {
  const match = String(dataUrl || '').match(/^data:(audio\/[^;,]+|application\/octet-stream)(?:;[^,]*)?;base64,(.+)$/i);
  if (!match) fail(400, '音频 dataUrl 格式无效', 'AUDIO_DATA_URL_INVALID');
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) fail(400, '音频 dataUrl 内容为空', 'AUDIO_DATA_URL_EMPTY');
  return { buffer, contentType };
}

async function downloadAudioToTempFile(remoteUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.WORKBENCH_AUDIO_TO_MP4_DOWNLOAD_TIMEOUT_MS || 0) || 120000);
  try {
    const resp = await fetch(remoteUrl, { headers: { Accept: 'audio/*,application/octet-stream,*/*' }, signal: controller.signal });
    if (!resp.ok) fail(resp.status >= 500 ? 502 : 400, `在线音频下载失败 HTTP ${resp.status}`, 'REMOTE_AUDIO_DOWNLOAD_FAILED');
    const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
      fail(400, `在线地址不是音频：${contentType}`, 'REMOTE_AUDIO_CONTENT_TYPE_INVALID');
    }
    const maxBytes = Number(process.env.WORKBENCH_AUDIO_TO_MP4_MAX_BYTES || 0) || 30 * 1024 * 1024;
    const contentLength = Number(resp.headers.get('content-length') || 0);
    if (contentLength > maxBytes) fail(413, '在线音频过大，无法转换为 mp4', 'REMOTE_AUDIO_TOO_LARGE_FOR_MP4');
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (!buffer.length) fail(400, '在线音频内容为空', 'REMOTE_AUDIO_EMPTY');
    if (buffer.length > maxBytes) fail(413, '在线音频过大，无法转换为 mp4', 'REMOTE_AUDIO_TOO_LARGE_FOR_MP4');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-audio-to-mp4-'));
    const input = path.join(dir, 'input' + safeLocalExt(audioExtFromContentType(contentType || inferRemoteAudioContentType(remoteUrl))));
    await fs.writeFile(input, buffer);
    return { dir, input };
  } finally {
    clearTimeout(timer);
  }
}

async function convertAudioBufferToMp4(buffer: Buffer, name: string, contentType = 'audio/mpeg') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-audio-to-mp4-'));
  try {
    const input = path.join(dir, 'input' + safeLocalExt(audioExtFromContentType(contentType)));
    await fs.writeFile(input, buffer);
    return await convertAudioFileToMp4(input, name);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function convertAudioFileToMp4(input: string, name: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-audio-to-mp4-out-'));
  try {
    const output = path.join(dir, 'audio-reference.mp4');
    await runFfmpegAudioToMp4(input, output);
    const video = await fs.readFile(output);
    if (!video.length) fail(400, '音频转 mp4 输出为空', 'AUDIO_TO_MP4_EMPTY');
    const outName = `${String(name || 'audio-reference').replace(/\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/i, '').replace(/[^\w\u4e00-\u9fa5.-]+/g, '-').slice(0, 80) || 'audio-reference'}.mp4`;
    return {
      videoUrl: `data:video/mp4;base64,${video.toString('base64')}`,
      dataUrl: `data:video/mp4;base64,${video.toString('base64')}`,
      filename: outName,
      contentType: 'video/mp4',
      mime: 'video/mp4',
      size: video.length,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runFfmpegAudioToMp4(input: string, output: string) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
    const args = [
      '-y',
      '-i', input,
      '-f', 'lavfi',
      '-i', 'color=c=black:s=16x16:r=1',
      '-shortest',
      '-map', '1:v:0',
      '-map', '0:a:0',
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk || '').slice(0, 8000); });
    child.on('error', err => reject(new Error(`ffmpeg 不可用：${err.message}`)));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg 音频转 mp4 失败，退出码 ${code}`));
    });
  });
}

function inferLocalContentType(filePath: string) {
  return ({
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  } as Record<string, string>)[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function inferRemoteVideoContentType(remoteUrl: string) {
  const pathname = (() => {
    try {
      return new URL(remoteUrl).pathname;
    } catch {
      return remoteUrl;
    }
  })();
  return ({
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
  } as Record<string, string>)[path.extname(pathname).toLowerCase()] || 'video/mp4';
}

function inferRemoteAudioContentType(remoteUrl: string) {
  const pathname = (() => {
    try {
      return new URL(remoteUrl).pathname;
    } catch {
      return remoteUrl;
    }
  })();
  return ({
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.webm': 'audio/webm',
    '.flac': 'audio/flac',
  } as Record<string, string>)[path.extname(pathname).toLowerCase()] || 'audio/mpeg';
}

function audioExtFromContentType(contentType: string) {
  return ({
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'audio/flac': '.flac',
    'application/octet-stream': '.mp3',
  } as Record<string, string>)[String(contentType || '').toLowerCase()] || '.mp3';
}

function extFromContentType(contentType: string) {
  return ({
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  } as Record<string, string>)[String(contentType || '').toLowerCase()] || '.png';
}

function safeLocalExt(ext: string) {
  const value = String(ext || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(value) ? value : '.png';
}

async function recordFailedUsage(userId: string, model: Awaited<ReturnType<typeof getCompatModel>>, prompt: string, requestPayload: unknown, err: unknown) {
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

export default router;
