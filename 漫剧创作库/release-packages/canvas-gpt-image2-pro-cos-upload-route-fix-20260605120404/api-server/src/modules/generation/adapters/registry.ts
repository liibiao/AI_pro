import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Prisma, type AiModel, type ModelType, type UpstreamProvider } from '@prisma/client';
import { HttpError, fail } from '../../../http.js';
import { config } from '../../../config.js';
import { uploadObjectStorageBuffer } from '../../../object-storage.js';
import { callUpstreamGetJson, callUpstreamJson, callUpstreamMultipart, extractChatText, extractImageResult, extractUpstreamTaskId, extractVideoResultUrl, extractVideoTask } from '../../../upstream.js';
import { getUploadedFileFallbackUrl, getUploadedFileFallbackUrlAsync } from '../file-fallback-store.js';

type ProviderWithModel = UpstreamProvider & { models?: AiModel[] };

type AdapterContext = {
  provider: ProviderWithModel;
  model: AiModel;
  type: ModelType;
  mode: string;
  prompt: string;
  negativePrompt?: string;
  inputFiles: unknown[];
  params: Record<string, unknown>;
  timeoutMs: number;
};

type AdapterSubmitResult = {
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

type AdapterQueryResult = Omit<AdapterSubmitResult, 'requestJson'> & {
  requestJson?: Prisma.InputJsonValue;
};

type GenerationAdapter = {
  submit(ctx: AdapterContext): Promise<AdapterSubmitResult>;
  query?(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult>;
};

type ImageResponseType = 'object_storage' | 'server_object_storage' | 'provider_url' | 'base64';

const registry: Record<string, GenerationAdapter> = {
  'openai-image': { submit: submitOpenAiImage },
  'openai-generations': { submit: submitOpenAiImage },
  'openai-edits': { submit: submitOpenAiEdits, query: queryGenericImage },
  'openai-chat': { submit: submitOpenAiChat },
  'grok-image': { submit: submitGrokImage, query: queryGrokImage },
  'grok-image-edit': { submit: submitGrokImageEdit },
  'grok-chat': { submit: submitOpenAiChat },
  'grok-llm': { submit: submitOpenAiChat },
  'gemini-chat': { submit: submitOpenAiChat },
  'gemini-llm': { submit: submitOpenAiChat },
  'gpt-image-v2': { submit: submitGptImageV2, query: queryGenericImage },
  'gemini-image': { submit: submitGeminiImage },
  'gemini-image-generate': { submit: submitGeminiUnifiedImage },
  'gemini-image-edit': { submit: submitGeminiUnifiedImageEdit },
  'sora-video': { submit: submitSoraVideo, query: queryGenericVideo },
  'seedance2-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
  'seedance2.0-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
  'grok-video': { submit: submitGrokVideo },
  'gemini-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
  'veo-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
  'notevideo': { submit: submitGenericVideo, query: queryGenericVideo },
  'seedance': { submit: submitGenericVideo, query: queryGenericVideo },
  'jimeng': { submit: submitGenericVideo, query: queryGenericVideo },
  'runninghub': { submit: submitGenericVideo, query: queryGenericVideo },
  'cli-proxy': { submit: submitCliProxy, query: queryGenericVideo },
  'veo-chat': { submit: submitVeoChatVideo },
  'veo-3.1': { submit: submitVeoChatVideo },
};

const GENERATED_IMAGE_DIR = path.join(os.tmpdir(), 'ai-admin-generated-images');
const generatedResultObjectStorageCache = new Map<string, string>();
const remoteImageObjectStorageCache = new Map<string, string>();
const remoteMediaObjectStorageCache = new Map<string, string>();
const IMAGE_RESULT_MATERIALIZE_TIMEOUT_MS = 120000;
const MEDIA_RESULT_MATERIALIZE_TIMEOUT_MS = 300000;
const GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 160 * 1024 * 1024;
const MEDIA_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 800 * 1024 * 1024;

export function getGenerationAdapter(adapterName: string) {
  const adapter = registry[adapterName];
  if (!adapter) fail(400, `未支持的生成适配器：${adapterName}`, 'ADAPTER_NOT_SUPPORTED');
  return adapter;
}

export function listGenerationAdapters() {
  return Object.keys(registry);
}

function openAiImageUpstreamOptions(params: Record<string, unknown>, options: { allowBackground?: boolean } = {}) {
  // Canvas tasks keep audit/UI metadata in paramsJson. Only provider fields belong upstream.
  return compactJson({
    ...(options.allowBackground ? { background: params.background } : {}),
    quality: params.quality,
    output_format: params.output_format ?? params.outputFormat,
    output_compression: params.output_compression ?? params.outputCompression,
    moderation: params.moderation,
    input_fidelity: params.input_fidelity ?? params.inputFidelity,
    partial_images: params.partial_images ?? params.partialImages,
    user: params.user,
  }) as Record<string, unknown>;
}

async function submitOpenAiImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const responseFormat = openAiImageResponseFormat(ctx);
  const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt,
    size: ctx.params.size || ctx.params.imageSize || '1024x1024',
    n: ctx.params.n || ctx.params.quantity || 1,
    ...openAiImageUpstreamOptions(ctx.params, { allowBackground: true }),
    response_format: responseFormat,
  }));
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(resolveGptImageV2Endpoint(ctx), ctx), requestJson, ctx.timeoutMs);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitOpenAiEdits(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  if (!shouldUseOpenAiEditsInputImage(ctx)) {
    if (generationModeRequiresImageReference(ctx)) fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
    return submitOpenAiTextImage(ctx);
  }
  const references = await buildOpenAiEditsReferencePayload(ctx);
  const responseFormat = openAiImageResponseFormat(ctx);
  const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    ...references,
    mask: ctx.params.mask,
    size: ctx.params.size || ctx.params.imageSize || '1024x1024',
    n: ctx.params.n || ctx.params.quantity || 1,
    ...openAiImageUpstreamOptions(ctx.params, { allowBackground: false }),
    response_format: responseFormat,
  }));
  const endpoint = resolveEndpointPath(resolveOpenAiEditsEndpoint(ctx), ctx);
  if (!collectOpenAiPrimaryFileRefs(requestJson).length) {
    const imageUrlRequestJson = await buildOpenAiEditsImageUrlFallbackRequest(ctx, requestJson);
    if (imageUrlRequestJson) {
      const upstream = await callOpenAiImageJson(ctx, endpoint, imageUrlRequestJson);
      return normalizeImageSubmit(ctx.provider, upstream, imageUrlRequestJson, resolveImageResponseType(ctx));
    }
  }
  try {
    const upstream = await callOpenAiImageJson(ctx, endpoint, requestJson);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  } catch (err) {
    const running = submitRunningImageTaskFromTransientError(err, requestJson);
    if (running) return running;
    if (!isFileIdRejectedImageUrlError(err)) throw err;
    const fallbackRequestJson = await buildOpenAiEditsImageUrlFallbackRequest(ctx, requestJson);
    if (!fallbackRequestJson) {
      fail(400, '上游拒绝 file_id，且当前请求没有可用的 COS 兜底 URL。请刷新页面后重新上传参考图再生成。', 'OPENAI_EDITS_FILE_FALLBACK_MISSING');
    }
    try {
      const fallbackUpstream = await callOpenAiImageJson(ctx, endpoint, fallbackRequestJson);
      return normalizeImageSubmit(ctx.provider, fallbackUpstream, fallbackRequestJson, resolveImageResponseType(ctx));
    } catch (fallbackErr) {
      const runningFallback = submitRunningImageTaskFromTransientError(fallbackErr, fallbackRequestJson);
      if (runningFallback) return runningFallback;
      throw fallbackErr;
    }
  }
}

async function submitOpenAiTextImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const responseFormat = openAiImageResponseFormat(ctx);
  const endpoint = resolveEndpointPath(resolveOpenAiTextImageEndpoint(ctx), ctx);
  const allowBackground = !/\/images\/edits(?:$|[?#])/i.test(endpoint);
  const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt,
    size: ctx.params.size || ctx.params.imageSize || '1024x1024',
    n: ctx.params.n || ctx.params.quantity || 1,
    ...openAiImageUpstreamOptions(ctx.params, { allowBackground }),
    response_format: responseFormat,
  }));
  const upstream = await callOpenAiImageJson(ctx, endpoint, requestJson);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitOpenAiChat(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const maxTokens = ctx.params.max_tokens || ctx.params.maxOutputTokens || ctx.params.outputTokens || ctx.params.completionTokens;
  const requestJson = compactJson({
    model: ctx.model.name,
    messages: ctx.params.messages || [{ role: 'user', content: ctx.prompt }],
    temperature: ctx.params.temperature,
    max_tokens: maxTokens,
    ...withoutKeys(ctx.params, ['messages', 'temperature', 'max_tokens', 'maxOutputTokens', 'outputTokens', 'completionTokens']),
  });
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/chat/completions', ctx), requestJson, ctx.timeoutMs);
  const text = extractChatText(upstream);
  return {
    status: 'SUCCESS',
    progress: 100,
    upstreamRequestId: String((upstream as any)?.id || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: compactJson({ text, upstream }),
  };
}

async function submitGrokImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const size = normalizeGrokImageRequestSize(ctx, ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: normalizeGrokImageCount(ctx.params.n || ctx.params.quantity),
    size,
    stream: false,
    response_format: 'url',
    ...withoutKeys(ctx.params, [
      'model', 'prompt', 'image', 'images', 'input_image', 'reference_images', 'referenceImages',
      'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
      'resolution', 'requestedResolution', 'n', 'quantity', 'stream',
    ]),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/generations', ctx);
  let upstream: unknown;
  try {
    upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  } catch (err) {
    if (err instanceof HttpError) return grokImageSubmitFailure(err, requestJson);
    throw err;
  }
  const asyncTaskId = extractGrokAsyncTaskId(upstream);
  const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (result.resultUrls?.length) return result;
  if (asyncTaskId) {
    return {
      status: 'RUNNING',
      progress: extractGrokTaskProgress(upstream),
      upstreamTaskId: asyncTaskId,
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { outputs: [] } as Prisma.InputJsonValue,
      resultUrls: [],
    };
  }
  return {
    status: 'FAILED',
    progress: 100,
    upstreamRequestId: result.upstreamRequestId,
    requestJson,
    responseJson: result.responseJson,
    resultJson: result.resultJson,
    resultUrls: [],
    errorCode: 'GROK_IMAGE_RESULT_MISSING',
    errorMessage: extractErrorMessage(upstream) || 'Grok 文生图上游响应未包含图片 URL',
  };
}

function grokImageSubmitFailure(err: HttpError, requestJson: Prisma.InputJsonValue): AdapterSubmitResult {
  const rawMessage = String(err.message || 'Grok 上游请求失败');
  const errorMessage = normalizeGrokImageFailureMessage(rawMessage);
  return {
    status: 'FAILED',
    progress: 100,
    requestJson,
    responseJson: {
      error: {
        message: rawMessage,
        status: err.status,
        code: err.code,
      },
    } as Prisma.InputJsonValue,
    resultJson: { outputs: [] } as Prisma.InputJsonValue,
    resultUrls: [],
    errorCode: /connection|timeout|timed out|fetch failed|websocket|grok_connection_failed/i.test(rawMessage)
      ? 'GROK_IMAGE_UPSTREAM_UNREACHABLE'
      : 'GROK_IMAGE_UPSTREAM_FAILED',
    errorMessage,
  };
}

function normalizeGrokImageFailureMessage(rawMessage: string) {
  if (/Image generation blocked or no valid final image/i.test(rawMessage)) {
    return (
      'Grok 本地适配器没有拿到最终成图。当前失败通常不是文生图参考图问题，' +
      '更可能是 grok2api 到 grok.com 的 App Chat 或 WebSocket 连接失败、代理未配置、' +
      '登录 Token 失效，或上游审核未返回最终图。原始错误：' + rawMessage
    );
  }
  if (/connection|timeout|timed out|fetch failed|websocket|grok_connection_failed/i.test(rawMessage)) {
    return (
      'Grok 上游连接失败。请检查 grok2api 代理配置、登录 Token、当前网络能否访问 grok.com，' +
      '然后重试。原始错误：' + rawMessage
    );
  }
  return rawMessage;
}

async function queryGrokImage(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/v1/tasks/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, { language: 'en' }, ctx.timeoutMs);
  const statusText = extractGrokTaskStatus(upstream);
  const urls = await materializeImageResultUrls(ctx.provider, absolutizeProviderUrls(ctx.provider, extractUrls(upstream).filter(url => !/^data:image\//i.test(url))));
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
  const done = ['completed', 'success', 'succeeded', 'done'].includes(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGrokTaskProgress(upstream),
    upstreamTaskId: ctx.upstreamTaskId,
    upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || (upstream as any)?.data?.id || ''),
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'GROK_IMAGE_TASK_FAILED' : undefined,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function queryGenericImage(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  let lastErr: unknown;
  for (const endpointPath of imageStatusEndpointCandidates(ctx)) {
    const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
    try {
      const method = resolveVideoStatusMethod(ctx);
      const upstream = method === 'POST'
        ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs)
        : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs);
      return await normalizeGenericImageQueryResult(ctx.provider, ctx.upstreamTaskId, upstream, resolveImageResponseType(ctx));
    } catch (err) {
      lastErr = err;
      if (!isRetryableVideoStatusEndpointError(err)) throw err;
    }
  }
  throw lastErr;
}

async function normalizeGenericImageQueryResult(provider: UpstreamProvider, upstreamTaskId: string, upstream: unknown, responseType: ImageResponseType = 'object_storage'): Promise<AdapterQueryResult> {
  const statusText = extractGenericTaskStatus(upstream);
  const result = extractImageResult(upstream);
  const resultUrl = await imageResultUrl(provider, result, responseType);
  const urls = resultUrl ? [resultUrl] : await resolveImageResultUrls(provider, extractImageOutputUrls(upstream), responseType);
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
  const done = ['completed', 'success', 'succeeded', 'done', 'finished'].includes(statusText);
  const missingDoneResult = done && !urls.length;
  return {
    status: failed || missingDoneResult ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericImageProgress(upstream),
    upstreamTaskId,
    upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || (upstream as any)?.data?.id || ''),
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'IMAGE_TASK_FAILED' : (missingDoneResult ? imageOutputMissingErrorCode(upstream) : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (missingDoneResult ? imageOutputMissingErrorMessage(upstream) : undefined),
  };
}

function submitRunningImageTaskFromTransientError(err: unknown, requestJson: Prisma.InputJsonValue): AdapterSubmitResult | null {
  if (!(err instanceof HttpError) || err.status < 500) return null;
  const responseJson = (err as HttpError & { responseJson?: unknown }).responseJson;
  const taskId = extractUpstreamTaskId(responseJson);
  if (!taskId) return null;
  return {
    status: 'RUNNING',
    progress: extractGenericImageProgress(responseJson),
    upstreamTaskId: taskId,
    upstreamRequestId: String((responseJson as any)?.id || (responseJson as any)?.request_id || ''),
    requestJson,
    responseJson: sanitizeUpstreamPayload(responseJson) as Prisma.InputJsonValue,
    resultJson: { url: '', outputs: [] } as Prisma.InputJsonValue,
    resultUrls: [],
  };
}

async function submitGrokImageEdit(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const refs = (await collectGrokImageRefs(ctx)).slice(-3);
  if (!refs.length) fail(400, 'Grok 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_REQUIRED');
  const form = new FormData();
  form.set('model', ctx.model.name || 'grok-imagine-1.0-edit');
  form.set('prompt', ctx.prompt);
  form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
  form.set('size', normalizeGrokImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio));
  form.set('response_format', 'url');
  for (let i = 0; i < refs.length; i += 1) {
    const file = await grokImageRefToBlob(refs[i], ctx.timeoutMs);
    form.append('image', file.blob, file.filename);
  }
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: ctx.params.n || ctx.params.quantity || 1,
    size: normalizeGrokImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio),
    response_format: 'url',
    image_count: refs.length,
    images: refs.map((ref, index) => redactLargeInlineRef(ref, index)),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/edits', ctx);
  const upstream = await callUpstreamMultipart(ctx.provider, endpoint, form, ctx.timeoutMs);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitGptImageV2(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
  const resolution = String(ctx.params.resolution || ctx.params.requestedResolution || '1K').toUpperCase();
  const referenceImages = await buildGptImageV2ReferenceImages(ctx);
  if (generationModeRequiresImageReference(ctx) && !referenceImages.length) {
    fail(400, 'GPT-Image2 图生图/修图/全景任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'GPT_IMAGE_V2_REFERENCE_REQUIRED');
  }
  const requestJson = compactJson({
    model: normalizeGptImageV2BaseModel(ctx.model.name),
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    resolution,
    reasoning_effort: ctx.params.reasoning_effort || ctx.params.reasoningEffort || 'medium',
    ...(referenceImages.length ? { reference_images: referenceImages } : {}),
    response_format: 'url',
    ...withoutKeys(ctx.params, [
      'model', 'prompt', 'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
      'resolution', 'requestedResolution', 'n', 'quantity', 'quality', 'image', 'images', 'reference_images', 'referenceImages',
      'response_format', 'background',
    ]),
  });
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/v1/images/generations', ctx), requestJson, ctx.timeoutMs);
  const urls = await materializeImageResultUrls(ctx.provider, absolutizeProviderUrls(ctx.provider, extractGptImageV2Urls(upstream)));
  if (urls.length) {
    return {
      status: 'SUCCESS',
      progress: 100,
      upstreamTaskId: String((upstream as any)?.task?.task_id || (upstream as any)?.task_id || ''),
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: urls[0], outputs: urls } as Prisma.InputJsonValue,
      resultUrls: urls,
    };
  }
  const fallback = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (fallback.resultUrls?.length || (fallback.resultJson as any)?.b64) return fallback;
  const taskId = extractUpstreamTaskId(upstream);
  if (taskId) {
    return {
      status: 'RUNNING',
      progress: extractGenericImageProgress(upstream),
      upstreamTaskId: taskId,
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [] } as Prisma.InputJsonValue,
      resultUrls: [],
    };
  }
  return {
    status: 'FAILED',
    progress: 100,
    upstreamTaskId: String((upstream as any)?.task?.task_id || (upstream as any)?.task_id || ''),
    upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
    requestJson,
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: fallback.resultJson,
    resultUrls: [],
    errorCode: fallback.errorCode || 'GPT_IMAGE_V2_RESULT_MISSING',
    errorMessage: fallback.errorMessage || extractErrorMessage(upstream) || 'GPT-Image-v2 上游响应未包含 data[0].url、task.result_urls 或可轮询任务 ID',
  };
}

async function submitGeminiImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const aspectRatio = normalizeGeminiImageAspectRatio(
    ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.size || defaults.aspectRatio,
  );
  const resolution = normalizeGeminiImageSizeToken(
    ctx.params.imageSize || ctx.params.requestedResolution || ctx.params.resolution || ctx.params.quality || defaults.imageSize || defaults.resolution,
  );
  const parts = [{ text: ctx.prompt }, ...buildGeminiImageParts(ctx)];
  const buildRequestJson = (imageSize: string) => compactJson({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: compactJson({
        ...(aspectRatio && aspectRatio !== 'auto' ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
      }),
    },
    ...withoutKeys(ctx.params, ['model', 'messages', 'stream', 'contents', 'generationConfig', 'config', 'size', 'n', 'quantity', 'imageSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio', 'resolution', 'requestedResolution', 'quality', 'image', 'images', 'reference_images', 'referenceImages']),
  });
  let requestJson = buildRequestJson(resolution);
  const configuredEndpoint = String(ctx.provider.endpointPath || ctx.model.endpointPath || '').trim();
  const endpoint = resolveEndpointPath(!configuredEndpoint || /chat\/completions/i.test(configuredEndpoint) ? '/v1beta/models/{model}:generateContent' : configuredEndpoint, ctx);
  let upstream: unknown;
  try {
    upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  } catch (err) {
    if (!resolution || !isGeminiImageSizeUnsupportedError(err)) throw err;
    const lowerResolution = resolution.toLowerCase();
    if (lowerResolution === resolution) throw err;
    requestJson = buildRequestJson(lowerResolution);
    upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  }
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitGeminiUnifiedImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const size = normalizeGeminiUnifiedImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
  const requestJson = compactJson({
    model: ctx.model.name || 'gemini-3.1-flash-image-preview',
    prompt: ctx.prompt,
    n: normalizeGrokImageCount(ctx.params.n || ctx.params.quantity),
    size,
    response_format: ctx.params.response_format || ctx.params.responseFormat || 'b64_json',
    ...withoutKeys(ctx.params, [
      'model', 'prompt', 'image', 'images', 'input_image', 'reference_images', 'referenceImages',
      'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
      'resolution', 'requestedResolution', 'n', 'quantity', 'stream', 'response_format', 'responseFormat',
    ]),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/generations', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (result.resultUrls?.length) return result;
  return {
    ...result,
    status: 'FAILED',
    errorCode: 'GEMINI_IMAGE_RESULT_MISSING',
    errorMessage: extractErrorMessage(upstream) || 'Gemini 统一生图上游响应未包含图片 URL 或 b64_json',
  };
}

async function submitGeminiUnifiedImageEdit(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const refs = (await collectGrokImageRefs(ctx)).slice(-4);
  if (!refs.length) fail(400, 'Gemini 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GEMINI_IMAGE_REFERENCE_REQUIRED');
  const size = normalizeGeminiUnifiedImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
  const responseFormat = String(ctx.params.response_format || ctx.params.responseFormat || 'b64_json');
  const form = new FormData();
  form.set('model', ctx.model.name || 'gemini-3.1-flash-image-preview');
  form.set('prompt', ctx.prompt);
  form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
  form.set('size', size);
  form.set('response_format', responseFormat);
  for (let i = 0; i < refs.length; i += 1) {
    const file = await compatibleImageRefToBlob(refs[i], ctx.timeoutMs, 'Gemini 图生图');
    form.append('image', file.blob, file.filename);
  }
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: ctx.params.n || ctx.params.quantity || 1,
    size,
    response_format: responseFormat,
    image_count: refs.length,
    images: refs.map((ref, index) => redactLargeInlineRef(ref, index)),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/edits', ctx);
  const upstream = await callUpstreamMultipart(ctx.provider, endpoint, form, ctx.timeoutMs);
  const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (result.resultUrls?.length) return result;
  return {
    ...result,
    status: 'FAILED',
    errorCode: 'GEMINI_IMAGE_EDIT_RESULT_MISSING',
    errorMessage: extractErrorMessage(upstream) || 'Gemini 统一图生图上游响应未包含图片 URL 或 b64_json',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFileIdRejectedImageUrlError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  return /file[_ -]?id.*not supported|file_id.*not supported|images\[\]\.image_url|image_url.*required/i.test(message);
}

function isGeminiImageSizeUnsupportedError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  return /size\s*参数取值不受支持|unsupported\s+(?:image\s*)?size|imageSize|image_size|invalid\s+size/i.test(message);
}

async function buildOpenAiEditsImageUrlFallbackRequest(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  const imageUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx);
  if (!imageUrls.length) return null;
  const base = isRecord(requestJson) ? requestJson : {};
  return compactJson({
    ...withoutKeys(base, ['image', 'images', 'input_image']),
    ...buildOpenAiEditsUrlReferencePayload(imageUrls),
  });
}

function collectOpenAiEditsFallbackReferences(ctx: AdapterContext) {
  const urls = new Set<string>();
  const fileIds = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      const publicUrl = resolvePublicReferenceImageUrl(raw);
      if (publicUrl) urls.add(publicUrl);
      else if (/^file-[\w-]+$/i.test(raw)) {
        const fallbackUrl = getUploadedFileFallbackUrl(raw);
        if (fallbackUrl) urls.add(fallbackUrl);
        else fileIds.add(raw);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => push(item));
      return;
    }
    if (!isRecord(value)) return;
    const saved = isRecord(value.saved) ? value.saved : {};
    const imageUrl = value.image_url;
    [
      value.fallbackRemoteUrl,
      value.remoteFallbackUrl,
      value.objectStorageUrl,
      value.publicUrl,
      value.cosUrl,
      value.cos_url,
      saved.fallbackRemoteUrl,
      saved.remoteFallbackUrl,
      saved.objectStorageUrl,
      saved.publicUrl,
      saved.remoteUrl,
      saved.url,
      isRecord(imageUrl) ? imageUrl.url : imageUrl,
      value.url,
      value.remoteUrl,
    ].forEach(item => push(item));
  };
  ctx.inputFiles.forEach(item => push(item));
  [
    ctx.params.images,
    ctx.params.reference_images,
    ctx.params.referenceImages,
    ctx.params.input_image,
    ctx.params.image,
  ].forEach(item => push(item));
  return { urls: Array.from(urls), fileIds: Array.from(fileIds) };
}

async function collectOpenAiEditsFallbackImageUrlsForRequest(ctx: AdapterContext, fileIdTimeoutMs = 15000) {
  const refs = collectOpenAiEditsFallbackReferences(ctx);
  const resolved: string[] = [];
  const fallbackUrls = await Promise.all(refs.fileIds.map(fileId => getUploadedFileFallbackUrlAsync(fileId, fileIdTimeoutMs)));
  for (const fallbackUrl of fallbackUrls) {
    if (fallbackUrl) refs.urls.push(fallbackUrl);
  }
  for (const url of refs.urls) {
    resolved.push(await materializeGenerationResultReferenceUrl(url));
  }
  return Array.from(new Set(resolved.filter(Boolean)));
}

function isPublicHttpUrl(value: string) {
  return /^https?:\/\//i.test(value) && !/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(value);
}

function resolvePublicReferenceImageUrl(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isPublicHttpUrl(raw)) return raw;
  if (!isGenerationResultPath(raw)) return '';
  const base = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  try {
    const parsed = new URL(raw, base);
    return parsed.toString();
  } catch {
    return '';
  }
}

function isGenerationResultPath(value: string) {
  const raw = String(value || '').trim();
  if (/^\/api\/generation\/results\//i.test(raw)) return true;
  try {
    const parsed = new URL(raw);
    return /^\/api\/generation\/results\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function materializeGenerationResultReferenceUrl(value: string) {
  const raw = String(value || '').trim();
  if (!isGenerationResultPath(raw)) return raw;
  const filename = generationResultFilename(raw);
  if (!filename) return raw;
  const filePath = generatedImageFilePath(filename);
  if (!filePath) return raw;
  const cached = generatedResultObjectStorageCache.get(filename);
  if (cached) return cached;
  try {
    const buffer = await fs.readFile(filePath);
    const publicUrl = await uploadImageBufferToObjectStorageBestEffort(buffer, filename, inferImageMimeType(filename));
    if (publicUrl) {
      generatedResultObjectStorageCache.set(filename, publicUrl);
      return publicUrl;
    }
  } catch {
    return raw;
  }
  return raw;
}

function generationResultFilename(value: string) {
  const raw = String(value || '').trim();
  try {
    const parsed = new URL(raw, config.publicBaseUrl || 'http://localhost');
    if (!/^\/api\/generation\/results\//i.test(parsed.pathname)) return '';
    return path.basename(decodeURIComponent(parsed.pathname));
  } catch {
    if (!/^\/api\/generation\/results\//i.test(raw)) return '';
    return path.basename(raw.split(/[?#]/)[0]);
  }
}

function assertImageModelName(ctx: AdapterContext) {
  if (ctx.type !== 'IMAGE') return;
  const modelName = String(ctx.model.name || '').trim();
  if (!looksLikeLanguageModelName(modelName)) return;
  fail(400, `图片模型配置错误：真实模型名称 ${modelName} 看起来是语言模型，不是生图模型。请在后台模型管理中把该模型移到 LLM 类型，或改成真实生图模型名。`, 'IMAGE_MODEL_NAME_INVALID');
}

function looksLikeLanguageModelName(modelName: string) {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw || /gpt[-_ ]?image|image|imagen|imagine|flux|sdxl|midjourney|niji|sora|veo/.test(raw)) return false;
  return /^(gpt[-_ ]?(?:3|4|4o|5)|gpt\d|deepseek|qwen|glm|claude|grok[-_ ]?4|gemini[-_ ]?(?:1|2|3)(?:[._-]|$))/.test(raw);
}

function shouldUseOpenAiEditsInputImage(ctx: AdapterContext) {
  const mode = String(ctx.mode || '').trim().toLowerCase();
  if (/^(txt2img|text-to-image|text2image|generate|generation|文生图)$/.test(mode)) return false;
  return hasOpenAiEditsInputImage(ctx);
}

function generationModeRequiresImageReference(ctx: AdapterContext) {
  if (ctx.type !== 'IMAGE') return false;
  const mode = String(ctx.mode || ctx.params.mode || '').trim().toLowerCase();
  return /img2img|image[-_ ]?to[-_ ]?image|edit|repair|refine|panorama|storyboard-img2img/.test(mode);
}

function openAiImageResponseFormat(ctx: AdapterContext) {
  const responseType = resolveImageResponseType(ctx);
  if (responseType === 'base64') return 'b64_json';
  if (responseType === 'provider_url' || responseType === 'object_storage' || responseType === 'server_object_storage') return 'url';
  const explicit = String(ctx.params.response_format || ctx.params.responseFormat || '').trim();
  if (explicit) return explicit;
  if (shouldUseProviderUrlImageResult(ctx)) return 'url';
  if (shouldPreferInlineImageResult(ctx)) return 'b64_json';
  return 'url';
}

function resolveImageResponseType(ctx: AdapterContext): ImageResponseType {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const mode = normalizeResponseTypeMode(
    modelProtocol.responseTypeMode ??
    modelProtocol.response_type_mode ??
    defaults.responseTypeMode ??
    defaults.response_type_mode ??
    ctx.params.responseTypeMode ??
    ctx.params.response_type_mode ??
    protocol.responseTypeMode ??
    protocol.response_type_mode ??
    providerDefaults.responseTypeMode ??
    providerDefaults.response_type_mode,
  );
  const uniform = normalizeImageResponseTypeValue(
    modelProtocol.responseType ??
    modelProtocol.response_type ??
    defaults.responseType ??
    defaults.response_type ??
    ctx.params.responseType ??
    ctx.params.response_type ??
    protocol.responseType ??
    protocol.response_type ??
    providerDefaults.responseType ??
    providerDefaults.response_type,
  ) || 'object_storage';
  if (mode === 'by_resolution') {
    const map = firstRecord(
      modelProtocol.responseTypes,
      modelProtocol.response_types,
      defaults.responseTypes,
      defaults.response_types,
      ctx.params.responseTypes,
      ctx.params.response_types,
      protocol.responseTypes,
      protocol.response_types,
      providerDefaults.responseTypes,
      providerDefaults.response_types,
    );
    const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ?? ctx.params.resolution ?? ctx.params.imageSize ?? ctx.params.size);
    const mapped = resolution ? normalizeImageResponseTypeValue(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : '';
    return mapped || uniform;
  }
  return uniform;
}

function firstRecord(...values: unknown[]) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) as Record<string, unknown> | undefined;
}

function normalizeResponseTypeMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'by_resolution' || raw === 'by-resolution' || raw === 'resolution' || raw === 'per_resolution') return 'by_resolution';
  return 'uniform';
}

function normalizeResponseTypeResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (/^[1-4]k$/.test(raw)) return raw;
  const match = raw.match(/(\d{3,5})\s*x\s*(\d{3,5})/i);
  if (match) {
    const longSide = Math.max(Number(match[1]), Number(match[2]));
    if (longSide >= 3500) return '4k';
    if (longSide >= 2500) return '3k';
    if (longSide >= 1500) return '2k';
    return '1k';
  }
  return '';
}

function normalizeImageResponseTypeValue(value: unknown): ImageResponseType | '' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos'].includes(raw)) return 'object_storage';
  if (['server_object_storage', 'server-object-storage', 'server_async_object_storage', 'server-async-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', 'backend_cos', 'server_cos', '124_cos', '124_async_cos', '124-server-cos', '124服务器转存cos', '124异步转存cos', '后台转存cos', '后台异步转存cos'].includes(raw)) return 'server_object_storage';
  if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw)) return 'provider_url';
  if (['base64', 'b64', 'b64_json'].includes(raw)) return 'base64';
  return '';
}

function shouldUseProviderUrlImageResult(ctx: AdapterContext) {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const hint = [
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.baseUrl,
    ctx.provider.adapter,
    ctx.provider.defaultModel,
    ctx.model.id,
    ctx.model.modelKey,
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.adapter,
    ctx.model.endpointPath,
    protocol.adapter,
    protocol.endpointPath,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return (
    /gpt[-_ ]?image[-_ ]?2/.test(hint) ||
    hint.includes('canvas_gpt-image-2-pro') ||
    hint.includes('canvas-gpt-image-2-pro')
  );
}

function withGptImage2MainModel(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  const request = isRecord(requestJson) ? { ...requestJson } : {};
  const mainModel = resolveGptImage2MainModel(ctx);
  if (!mainModel) return requestJson;
  return compactJson({
    ...request,
    main_model: mainModel,
    responses_model: mainModel,
    codex_model: mainModel,
    imageMainModel: mainModel,
  });
}

function withOpenAiImageRequestOptions(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  const request = withGptImage2LargeAsyncTaskHint(ctx, withGptImage2MainModel(ctx, requestJson));
  const stream = resolveImageUpstreamStream(ctx);
  if (stream === undefined) return request;
  return compactJson({ ...(isRecord(request) ? request : {}), stream });
}

function withGptImage2LargeAsyncTaskHint(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  if (!resolveGptImage2AsyncTask(ctx, requestJson)) return requestJson;
  const request = isRecord(requestJson) ? { ...requestJson } : {};
  return compactJson({
    ...request,
    async_task: true,
    asyncTask: true,
  });
}

function resolveGptImage2AsyncTask(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  if (!isGptImage2Request(ctx)) return false;
  const explicit = parseOptionalAsyncTaskMode(ctx.params.async_task ?? ctx.params.asyncTask);
  if (explicit !== undefined) return explicit;
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configMode = normalizeResponseTypeMode(firstDefined(
    ctx.params.asyncTaskConfigMode,
    ctx.params.async_task_config_mode,
    protocol.asyncTaskConfigMode,
    protocol.async_task_config_mode,
    modelProtocol.asyncTaskConfigMode,
    modelProtocol.async_task_config_mode,
    defaults.asyncTaskConfigMode,
    defaults.async_task_config_mode,
    providerDefaults.asyncTaskConfigMode,
    providerDefaults.async_task_config_mode,
  ));
  const rawMode = firstDefined(
    ctx.params.asyncTaskMode,
    ctx.params.async_task_mode,
    protocol.asyncTaskMode,
    protocol.async_task_mode,
    modelProtocol.asyncTaskMode,
    modelProtocol.async_task_mode,
    defaults.asyncTaskMode,
    defaults.async_task_mode,
    providerDefaults.asyncTaskMode,
    providerDefaults.async_task_mode,
  );
  if (configMode === 'by_resolution') {
    const map = firstRecord(
      ctx.params.asyncTaskModes,
      ctx.params.async_task_modes,
      protocol.asyncTaskModes,
      protocol.async_task_modes,
      modelProtocol.asyncTaskModes,
      modelProtocol.async_task_modes,
      defaults.asyncTaskModes,
      defaults.async_task_modes,
      providerDefaults.asyncTaskModes,
      providerDefaults.async_task_modes,
    );
    const request = isRecord(requestJson) ? requestJson as Record<string, unknown> : {};
    const resolution = normalizeResponseTypeResolution(
      ctx.params.requestedResolution ??
      ctx.params.resolution ??
      ctx.params.imageSize ??
      ctx.params.size ??
      request.requestedResolution ??
      request.resolution ??
      request.size,
    );
    const mappedMode = resolution ? normalizeGptImage2AsyncTaskMode(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : 'sync';
    return mappedMode === 'async';
  }
  return normalizeGptImage2AsyncTaskMode(rawMode) === 'async';
}

function isLargeGptImage2Request(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  const request = isRecord(requestJson) ? requestJson as Record<string, unknown> : {};
  const resolution = normalizeResponseTypeResolution(
    ctx.params.requestedResolution ??
    ctx.params.resolution ??
    request.requestedResolution ??
    request.resolution,
  );
  if (resolution === '4k') return true;
  const rawSize = String(
    request.size ??
    ctx.params.size ??
    ctx.params.imageSize ??
    ctx.params.requestedPixelSize ??
    request.requestedPixelSize ??
    '',
  ).trim();
  const match = rawSize.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  return width * height >= 5_800_000 || Math.max(width, height) >= 3500;
}

function resolveImageUpstreamStream(ctx: AdapterContext): boolean | undefined {
  const explicit = parseOptionalBoolean(ctx.params.stream);
  if (explicit !== undefined) return explicit;
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configMode = normalizeResponseTypeMode(firstDefined(
    ctx.params.upstreamStreamConfigMode,
    ctx.params.upstream_stream_config_mode,
    protocol.upstreamStreamConfigMode,
    protocol.upstream_stream_config_mode,
    modelProtocol.upstreamStreamConfigMode,
    modelProtocol.upstream_stream_config_mode,
    defaults.upstreamStreamConfigMode,
    defaults.upstream_stream_config_mode,
    providerDefaults.upstreamStreamConfigMode,
    providerDefaults.upstream_stream_config_mode,
  ));
  const rawMode = firstDefined(
    ctx.params.upstreamStreamMode,
    ctx.params.upstream_stream_mode,
    protocol.upstreamStreamMode,
    protocol.upstream_stream_mode,
    modelProtocol.upstreamStreamMode,
    modelProtocol.upstream_stream_mode,
    defaults.upstreamStreamMode,
    defaults.upstream_stream_mode,
    providerDefaults.upstreamStreamMode,
    providerDefaults.upstream_stream_mode,
  );
  if (configMode === 'by_resolution') {
    const map = firstRecord(
      ctx.params.upstreamStreamModes,
      ctx.params.upstream_stream_modes,
      protocol.upstreamStreamModes,
      protocol.upstream_stream_modes,
      modelProtocol.upstreamStreamModes,
      modelProtocol.upstream_stream_modes,
      defaults.upstreamStreamModes,
      defaults.upstream_stream_modes,
      providerDefaults.upstreamStreamModes,
      providerDefaults.upstream_stream_modes,
    );
    const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ?? ctx.params.resolution ?? ctx.params.imageSize ?? ctx.params.size);
    const mappedMode = resolution ? normalizeUpstreamStreamMode(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : 'auto';
    if (mappedMode === 'stream') return true;
    if (mappedMode === 'non_stream') return false;
  }
  const mode = normalizeUpstreamStreamMode(rawMode);
  if (mode === 'stream') return true;
  if (mode === 'non_stream') return false;
  return undefined;
}

function firstDefined(...values: unknown[]) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function parseOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (['true', '1', 'yes', 'y', 'on', 'stream'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off', 'non_stream', 'non-stream', 'nonstream'].includes(raw)) return false;
  return undefined;
}

function parseOptionalAsyncTaskMode(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeGptImage2AsyncTaskMode(value) === 'async';
}

function normalizeGptImage2AsyncTaskMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (['async', 'async_task', 'async-task', 'background', 'background_task', 'background-task', 'true', '1', 'yes', '异步'].includes(raw)) return 'async';
  if (['sync', 'normal', 'synchronous', 'false', '0', 'no', '同步', 'off'].includes(raw)) return 'sync';
  return 'sync';
}

function normalizeUpstreamStreamMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'stream' || raw === 'streaming' || raw === 'true') return 'stream';
  if (raw === 'non_stream' || raw === 'non-stream' || raw === 'nonstream' || raw === 'false') return 'non_stream';
  return 'auto';
}

function resolveGptImage2MainModel(ctx: AdapterContext) {
  if (!isGptImage2Request(ctx)) return '';
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  return normalizeGptImage2MainModel(
    ctx.params.main_model ??
    ctx.params.mainModel ??
    ctx.params.responses_model ??
    ctx.params.responsesModel ??
    ctx.params.codex_model ??
    ctx.params.codexModel ??
    ctx.params.imageMainModel ??
    protocol.imageMainModel ??
    protocol.responsesModel ??
    protocol.codexModel ??
    defaults.imageMainModel ??
    defaults.responsesModel ??
    defaults.codexModel ??
    providerDefaults.imageMainModel ??
    providerDefaults.responsesModel ??
    providerDefaults.codexModel,
  );
}

function normalizeGptImage2MainModel(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'].includes(lower)) return lower;
  return '';
}

function isGptImage2Request(ctx: AdapterContext) {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const hint = [
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.baseUrl,
    ctx.provider.adapter,
    ctx.provider.defaultModel,
    ctx.model.id,
    ctx.model.modelKey,
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.adapter,
    ctx.model.endpointPath,
    protocol.adapter,
    protocol.endpointPath,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return /gpt[-_ ]?image[-_ ]?2/.test(hint) || hint.includes('canvas_gpt-image-2-pro') || hint.includes('canvas-gpt-image-2-pro');
}

function shouldPreferInlineImageResult(ctx: AdapterContext) {
  if (!isObjectStorageConfigured()) return false;
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const mode = String(ctx.params.uploadMode || ctx.params.upload_mode || protocol.uploadMode || protocol.upload_mode || ctx.model.uploadMode || ctx.provider.uploadMode || '').trim().toLowerCase();
  return !mode || mode === 'object_storage' || mode === 'cos' || mode === 'tencent_cos' || mode === 'local_cache_async_cos' || mode === 'local-cache-async-cos';
}

async function callOpenAiImageJson(ctx: AdapterContext, endpoint: string, requestJson: Prisma.InputJsonValue) {
  const sanitizedRequestJson = sanitizeOpenAiImageRequestForEndpoint(endpoint, requestJson);
  try {
    return await callUpstreamJson(ctx.provider, endpoint, sanitizedRequestJson, ctx.timeoutMs);
  } catch (err) {
    if (!shouldRetryOpenAiImageWithUrlResult(err, sanitizedRequestJson)) throw err;
    const requestBody = isRecord(sanitizedRequestJson) ? sanitizedRequestJson as Record<string, unknown> : {};
    const fallbackJson = compactJson({
      ...requestBody,
      response_format: 'url',
    });
    return callUpstreamJson(ctx.provider, endpoint, sanitizeOpenAiImageRequestForEndpoint(endpoint, fallbackJson), ctx.timeoutMs);
  }
}

function sanitizeOpenAiImageRequestForEndpoint(endpoint: string, requestJson: Prisma.InputJsonValue) {
  if (!/\/images\/edits(?:$|[?#])/i.test(String(endpoint || ''))) return requestJson;
  if (!isRecord(requestJson)) return requestJson;
  return withoutKeys(requestJson, ['background', 'images', 'input_image', 'reference_images', 'referenceImages']) as Prisma.InputJsonValue;
}

function shouldRetryOpenAiImageWithUrlResult(err: unknown, requestJson: Prisma.InputJsonValue) {
  const requestBody = isRecord(requestJson) ? requestJson as Record<string, unknown> : null;
  if (!requestBody || String(requestBody.response_format || '') !== 'b64_json') return false;
  const message = err instanceof Error ? err.message : String(err || '');
  return /response_format|b64_json|base64|unsupported|not supported|invalid.*format|unknown field|不支持/i.test(message);
}

function hasOpenAiEditsInputImage(ctx: AdapterContext) {
  const values = [
    ctx.params.image,
    ctx.params.input_image,
    ctx.params.images,
    ctx.params.reference_images,
    ctx.params.referenceImages,
    ...ctx.inputFiles,
  ];
  return values.some(value => {
    const fallbackRefs = collectOpenAiEditsFallbackReferences({ ...ctx, inputFiles: [], params: { image: value } });
    return collectOpenAiPrimaryFileRefs(value).length > 0 || fallbackRefs.urls.length > 0 || fallbackRefs.fileIds.length > 0;
  });
}

function collectOpenAiPrimaryFileRefs(value: unknown): string[] {
  const refs = new Set<string>();
  const push = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') {
      const raw = item.trim();
      if (/^file-[\w-]+$/i.test(raw)) refs.add(raw);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(push);
      return;
    }
    if (!isRecord(item)) return;
    [
      item.fileId,
      item.file_id,
      item.uploadRef,
      item.providerRef,
      item.id,
    ].forEach(push);
  };
  push(value);
  return Array.from(refs);
}

function collectOpenAiPrimaryFileReferenceEntries(value: unknown) {
  const entries = new Map<string, Record<string, unknown>>();
  const upsert = (fileId: string, meta: Record<string, unknown> = {}) => {
    const id = String(fileId || '').trim();
    if (!/^file-[\w-]+$/i.test(id)) return;
    entries.set(id, compactJson({
      ...(entries.get(id) || {}),
      ...meta,
      id,
      fileId: id,
      remoteUrl: id,
    }) as Record<string, unknown>);
  };
  const push = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') {
      upsert(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(push);
      return;
    }
    if (!isRecord(item)) return;
    const fileId = [item.fileId, item.file_id, item.uploadRef, item.providerRef, item.id]
      .map(value => String(value || '').trim())
      .find(value => /^file-[\w-]+$/i.test(value));
    if (!fileId) return;
    upsert(fileId, {
      name: item.name,
      width: item.width,
      height: item.height,
      contentType: item.contentType || item.mime_type || item.mimeType,
      bytes: item.bytes || item.size,
    });
  };
  push(value);
  return Array.from(entries.values());
}

function buildOpenAiEditsUrlReferencePayload(urls: string[]) {
  const refs = Array.from(new Set(urls.map(url => String(url || '').trim()).filter(Boolean)));
  return {
    image: refs,
  };
}

async function buildOpenAiEditsReferencePayload(ctx: AdapterContext) {
  const rawReferences = [
    ctx.params.images,
    ctx.params.reference_images,
    ctx.params.referenceImages,
    ctx.params.image,
    ctx.params.input_image,
    ctx.inputFiles,
  ].filter(value => value != null);
  const primaryFileRefMap = new Map<string, Record<string, unknown>>();
  rawReferences.flatMap(value => collectOpenAiPrimaryFileReferenceEntries(value)).forEach(entry => {
    const fileId = String(entry.fileId || entry.id || '').trim();
    if (!/^file-[\w-]+$/i.test(fileId)) return;
    primaryFileRefMap.set(fileId, { ...(primaryFileRefMap.get(fileId) || {}), ...entry, fileId, id: fileId, remoteUrl: fileId });
  });
  const primaryFileRefs = Array.from(primaryFileRefMap.values());
  const primaryFileIds = primaryFileRefs.map(entry => String(entry.fileId || entry.id || '').trim()).filter(Boolean);
  const fallbackUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
  if (primaryFileIds.length) {
    return {
      image: primaryFileIds,
    };
  }
  if (fallbackUrls.length) {
    return buildOpenAiEditsUrlReferencePayload(fallbackUrls);
  }
  const explicit = ctx.params.image || ctx.params.input_image || ctx.params.images || ctx.params.reference_images || ctx.params.referenceImages || ctx.inputFiles;
  return { image: explicit };
}

function resolveOpenAiTextImageEndpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured) return '/images/edits';
  return configured;
}

function resolveOpenAiEditsEndpoint(ctx: AdapterContext) {
  if (isGptImage2Request(ctx)) return '/images/edits';
  return ctx.model.endpointPath || ctx.provider.endpointPath || '/images/edits';
}

async function submitGenericVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  if (isSoraV3NoteVideoProtocol(ctx)) return submitSoraV3NoteVideo(ctx);
  const imageUrls = buildVideoReferenceUrls(ctx);
  const mediaRefs = buildVideoMediaReferences(ctx);
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt,
    duration: resolveVideoDurationSeconds(ctx, ctx.params.resolution || ctx.params.quality || '720p', ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds, 5, [5, 10, 15]),
    seconds: resolveVideoDurationSeconds(ctx, ctx.params.resolution || ctx.params.quality || '720p', ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 5, [5, 10, 15]),
    aspect_ratio: ctx.params.aspectRatio || ctx.params.aspect_ratio || '16:9',
    resolution: ctx.params.resolution || ctx.params.quality || '720p',
    ...videoParams,
    ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
    ...(mediaRefs.videoUrl ? { video_url: mediaRefs.videoUrl } : {}),
    ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
  });
  const endpointPath = ctx.model.endpointPath || ctx.provider.endpointPath || '/video/generations';
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(endpointPath, ctx), requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function submitSoraV3NoteVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, maxSoraV3ReferenceImages(ctx));
  const videoUrls = buildVideoReferenceVideoUrls(ctx).slice(0, maxSoraV3ReferenceVideos(ctx));
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['480p', '720p'], '720p');
  const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 5, soraV3DefaultDurations(ctx));
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
    'referenceMode', 'reference_mode', 'audioMode', 'audio_mode',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'sora-v3-pro',
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    resolution,
    seconds: String(secondsNumber),
    ...videoParams,
    ...(imageUrls.length ? { reference_images: imageUrls } : {}),
    ...(imageUrls.length ? { reference_mode: normalizeSoraV3ReferenceMode(ctx.params.reference_mode || ctx.params.referenceMode || ctx.params.refMode || ctx.params.ref_mode) } : {}),
    ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
    ...(videoUrls.length ? { audio_mode: normalizeAllowedString(ctx.params.audio_mode || ctx.params.audioMode, ['auto', 'keep_original'], 'auto') } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function submitSoraVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  if (isSoraV3NoteVideoProtocol(ctx)) return submitSoraV3NoteVideo(ctx);
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const mediaRefs = buildVideoMediaReferences(ctx);
  const rawAspectRatio = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || '16:9').trim();
  const aspectRatio = rawAspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
  const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 5, [5, 10, 15]);
  const requestJson = compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'sora-v3-pro',
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    resolution,
    seconds: String(secondsNumber),
    ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
    ...(mediaRefs.videoUrl ? { video_url: mediaRefs.videoUrl } : {}),
    ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function submitSeedance2VipVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const mediaRefs = buildVideoMediaReferences(ctx);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
  const resolution = normalizeSeedance2VipResolution(ctx.params.resolution || ctx.params.quality);
  const seconds = String(resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 5, [5, 10, 15]));
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ]);
  const requestJson = compactJson({
    model: resolveSeedance2VipModelName(ctx, resolution),
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    resolution,
    seconds,
    ...videoParams,
    ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
    ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls.slice(1) } : {}),
    ...(mediaRefs.videoUrl ? { reference_video: mediaRefs.videoUrl } : {}),
    ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SEEDANCE2_VIP_TASK_FAILED' : (!taskId && !urls.length ? 'SEEDANCE2_VIP_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'Seedance 2.0 VIP 上游响应未包含任务 ID 或视频 URL' : undefined),
  };
}

async function submitVeoChatVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
  const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds, 6, [4, 6, 8]);
  const content = imageUrls.length
    ? [
        { type: 'text', text: ctx.prompt },
        ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
      ]
    : ctx.prompt;
  const videoParams = withoutKeys(ctx.params, [
    'model', 'messages', 'prompt', 'stream',
    'duration', 'durationSeconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || 'veo-3.1',
    messages: [{ role: 'user', content }],
    stream: false,
    aspect_ratio: aspectRatio,
    resolution,
    duration,
    ...videoParams,
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/chat/completions', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const urls = absolutizeProviderUrls(ctx.provider, extractVeoChatVideoUrls(upstream));
  if (urls.length) {
    return {
      status: 'SUCCESS',
      progress: 100,
      upstreamRequestId: String((upstream as any)?.responseId || (upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: urls[0], outputs: urls } as Prisma.InputJsonValue,
      resultUrls: urls,
    };
  }
  return {
    status: 'FAILED',
    progress: 100,
    upstreamRequestId: String((upstream as any)?.responseId || (upstream as any)?.id || (upstream as any)?.request_id || ''),
    requestJson,
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { outputs: [] } as Prisma.InputJsonValue,
    resultUrls: [],
    errorCode: 'VEO_CHAT_RESULT_MISSING',
    errorMessage: 'Veo-3.1 上游响应未包含 choices[0].message.content 视频 URL',
  };
}

async function submitGeminiVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const references = buildVideoReferenceUrls(ctx);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
  const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds || ctx.params.duration_seconds, 8, [4, 6, 8]);
  const videoParams = withoutKeys(ctx.params, [
    'model', 'messages', 'prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || 'veo-3.1-generate-preview',
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    duration_seconds: duration,
    duration,
    seconds: duration,
    resolution,
    ...videoParams,
    ...(references.length ? { image: references[0], image_url: references[0], images: references } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeGeminiVideoResult(ctx, extractGeminiVideoTask(upstream), upstream, requestJson);
}

async function queryGeminiVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/videos/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeGeminiVideoResult(ctx, ctx.upstreamTaskId, upstream);
}

async function submitGrokVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const references = buildVideoReferenceUrls(ctx);
  const size = normalizeGrokVideoSize(ctx.params.size || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio);
  const quality = normalizeGrokVideoQuality(ctx.params.quality || ctx.params.resolution);
  const seconds = resolveVideoDurationSeconds(ctx, quality, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 6, [6, 10, 12, 15, 30]);
  const requestJson = compactJson({
    model: ctx.model.name || 'grok-imagine-1.0-video',
    prompt: ctx.prompt,
    size,
    seconds: String(seconds),
    quality,
    ...(references.length ? { image_reference: references } : {}),
    ...withoutKeys(ctx.params, [
      'model', 'prompt', 'stream',
      'duration', 'durationSeconds', 'seconds',
      'aspectRatio', 'aspect_ratio', 'requestedRatio',
      'resolution', 'quality', 'size',
      'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
      'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
      'video', 'videoUrl', 'refVideo', 'video_url',
      'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : urls.length ? 'SUCCESS' : 'FAILED',
    progress: failed || urls.length ? 100 : 0,
    upstreamTaskId: String((upstream as any)?.id || (upstream as any)?.task_id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.id || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: urls.length || failed ? undefined : 'GROK_VIDEO_RESULT_MISSING',
    errorMessage: failed ? extractErrorMessage(upstream) : urls.length ? undefined : 'Grok 视频上游响应未包含视频 URL',
  };
}

async function submitCliProxy(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  return ctx.type === 'IMAGE' ? submitOpenAiImage(ctx) : submitGenericVideo(ctx);
}

async function queryGenericVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoints = videoStatusEndpointCandidates(ctx);
  const taskParam = String(ctx.params.taskParam || 'taskId');
  let lastEndpointError: unknown;
  for (const endpointPath of endpoints) {
    const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
    const method = resolveVideoStatusMethod(ctx);
    try {
      const upstream = method === 'POST'
        ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs)
        : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs);
      return normalizeVideoQueryResult(ctx, upstream);
    } catch (err) {
      if (!isRetryableVideoStatusEndpointError(err)) throw err;
      lastEndpointError = err;
    }
  }
  throw lastEndpointError;
}

async function normalizeVideoQueryResult(ctx: AdapterContext & { upstreamTaskId: string }, upstream: unknown): Promise<AdapterQueryResult> {
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: ctx.upstreamTaskId,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function normalizeGeminiVideoResult(ctx: AdapterContext, upstreamTaskId: string, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult>;
async function normalizeGeminiVideoResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstreamTaskId: string, upstream: unknown, requestJson?: undefined): Promise<AdapterQueryResult>;
async function normalizeGeminiVideoResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstreamTaskId: string, upstream: unknown, requestJson?: Prisma.InputJsonValue): Promise<AdapterSubmitResult | AdapterQueryResult> {
  const statusText = extractGeminiVideoStatus(upstream);
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const done = ['success', 'succeeded', 'completed', 'done'].includes(statusText) || (!!urls.length && !['queued', 'processing', 'running'].includes(statusText));
  const taskId = upstreamTaskId || extractGeminiVideoTask(upstream);
  const base = {
    status: failed ? 'FAILED' as const : (done && urls.length ? 'SUCCESS' as const : (taskId ? 'RUNNING' as const : 'FAILED' as const)),
    progress: done && urls.length ? 100 : extractGeminiVideoProgress(upstream),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'GEMINI_VIDEO_TASK_FAILED' : (!taskId && !urls.length ? 'GEMINI_VIDEO_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'Gemini Veo 上游响应未包含任务 ID 或视频 URL' : undefined),
  };
  return requestJson ? { ...base, requestJson } : base;
}

function videoStatusPayload(taskId: string, taskParam: string) {
  return { [taskParam]: taskId, taskId, task_id: taskId, id: taskId };
}

function resolveVideoStatusMethod(ctx: AdapterContext) {
  const explicit = String(ctx.params.statusMethod || '').trim().toUpperCase();
  if (explicit === 'GET' || explicit === 'POST') return explicit;
  const providerMethod = String(ctx.provider.requestMethod || '').trim().toUpperCase();
  if (providerMethod === 'GET' || providerMethod === 'POST') return providerMethod;
  return 'GET';
}

function videoStatusEndpointCandidates(ctx: AdapterContext) {
  return uniqueStrings([
    ctx.params.statusEndpointPath,
    ctx.model.statusEndpointPath,
    ctx.provider.statusEndpointPath,
    '/videos/{taskId}',
    '/video/generations/{taskId}',
    '/video/status/{taskId}',
    '/video/status',
  ]);
}

function imageStatusEndpointCandidates(ctx: AdapterContext) {
  return uniqueStrings([
    ctx.params.statusEndpointPath,
    ctx.model.statusEndpointPath,
    ctx.provider.statusEndpointPath,
    '/v1/tasks/{taskId}',
    '/tasks/{taskId}',
    '/v1/images/generations/{taskId}',
    '/images/generations/{taskId}',
    '/image/status/{taskId}',
    '/image/status',
  ]);
}

function isRetryableVideoStatusEndpointError(err: unknown) {
  if (!(err instanceof HttpError) || err.code !== 'UPSTREAM_ERROR') return false;
  if (![400, 404, 405, 502].includes(err.status)) return false;
  return /Invalid URL|unsupported method|not found|cannot (?:get|post)|method not allowed|deprecated endpoint/i.test(err.message);
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach(value => {
    const raw = String(value || '').trim();
    if (!raw || seen.has(raw)) return;
    seen.add(raw);
    result.push(raw);
  });
  return result;
}

function normalizeAllowedString(value: unknown, allowed: string[], fallback: string) {
  const raw = String(value || '').trim();
  const matched = allowed.find(item => item.toLowerCase() === raw.toLowerCase());
  return matched || fallback;
}

function normalizeAllowedNumber(value: unknown, allowed: number[], fallback: number) {
  const raw = Number.parseInt(String(value || '').replace(/s$/i, ''), 10);
  return allowed.includes(raw) ? raw : fallback;
}

function resolveVideoDurationSeconds(ctx: AdapterContext, resolution: unknown, value: unknown, fallback: number, defaultAllowed: number[] = []) {
  const requested = Number.parseInt(String(value || '').replace(/s$/i, ''), 10);
  const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
  const resolutionKey = normalizeVideoResolutionKey(resolution);
  const maxByResolution = normalizeVideoNumberMap(caps.maxVideoDurationSecondsByResolution ?? caps.max_video_duration_seconds_by_resolution);
  const durationsByResolution = normalizeVideoDurationMap(caps.durationsByResolution ?? caps.durations_by_resolution);
  const maxSeconds = maxByResolution[resolutionKey] || normalizePositiveInt(caps.maxVideoDurationSeconds ?? caps.max_video_duration_seconds);
  const configuredAllowed = durationsByResolution[resolutionKey] || normalizeVideoDurationList(caps.durations);
  let allowed = (configuredAllowed.length ? configuredAllowed : defaultAllowed)
    .map(item => normalizePositiveInt(item))
    .filter((item): item is number => Boolean(item));
  if (maxSeconds) {
    allowed = allowed.length ? allowed.filter(item => item <= maxSeconds) : defaultVideoDurationOptions(maxSeconds);
    if (!allowed.includes(maxSeconds)) allowed.push(maxSeconds);
  }
  allowed = Array.from(new Set(allowed)).sort((a, b) => a - b);
  if (!Number.isFinite(requested) || requested <= 0) return allowed.includes(fallback) ? fallback : (allowed[0] || fallback);
  const capped = maxSeconds ? Math.min(requested, maxSeconds) : requested;
  if (!allowed.length) return capped;
  if (allowed.includes(capped)) return capped;
  return allowed.filter(item => item <= capped).pop() || allowed[0] || fallback;
}

function isSoraV3NoteVideoProtocol(ctx: AdapterContext) {
  const adapter = String(ctx.model.adapter || ctx.provider.adapter || '').toLowerCase();
  if (adapter && adapter !== 'notevideo') return false;
  const key = [
    ctx.model.name,
    ctx.model.displayName,
    ctx.provider.defaultModel,
    ctx.provider.name,
    ctx.provider.providerKey,
  ].map(item => String(item || '').toLowerCase()).join(' ');
  if (/sora-(?:v3|3\.0)-vip|sora-vip/i.test(key)) return false;
  const endpoint = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').toLowerCase();
  const baseUrl = String(ctx.provider.baseUrl || '').toLowerCase();
  const usesVideosEndpoint = /\/videos(?:\b|\/|$)/i.test(endpoint) || /\/videos(?:\b|\/|$)/i.test(baseUrl);
  if (key.includes('sora-v4-pro')) return true;
  return usesVideosEndpoint && (key.includes('sora-v3-pro') || key.includes('sora-v3-fast') || key.includes('sora-2'));
}

function soraV3DefaultDurations(ctx: AdapterContext) {
  const key = [ctx.model.name, ctx.model.displayName, ctx.provider.defaultModel].map(item => String(item || '').toLowerCase()).join(' ');
  if (key.includes('sora-2') && !key.includes('v3')) return [4, 8, 12];
  return Array.from({ length: 11 }, (_, index) => index + 5);
}

function maxSoraV3ReferenceImages(ctx: AdapterContext) {
  const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
  const rawMaxImages = caps.maxImages;
  if (isRecord(rawMaxImages)) {
    const full = normalizePositiveInt(rawMaxImages.full);
    if (full) return full;
  }
  const maxImages = normalizePositiveInt(caps.max_images ?? caps.maxImages);
  return maxImages || 4;
}

function maxSoraV3ReferenceVideos(ctx: AdapterContext) {
  const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
  return normalizePositiveInt(caps.maxVideos ?? caps.max_videos) || 3;
}

function normalizeSoraV3ReferenceMode(value: unknown) {
  const raw = String(value || '').trim();
  const mapped = raw === 'firstLast'
    ? 'start_end'
    : raw === 'smartMultiFrame'
      ? 'auto'
      : raw === 'full' || raw === 'text2video' || !raw
        ? 'image_reference'
        : raw;
  return normalizeAllowedString(mapped, ['auto', 'start_frame', 'start_end', 'image_reference'], 'image_reference');
}

function normalizeVideoResolutionKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeVideoNumberMap(value: unknown) {
  const source = isRecord(value) ? value : {};
  const out: Record<string, number> = {};
  Object.entries(source).forEach(([key, raw]) => {
    const normalizedKey = normalizeVideoResolutionKey(key);
    const seconds = normalizePositiveInt(raw);
    if (normalizedKey && seconds) out[normalizedKey] = seconds;
  });
  return out;
}

function normalizeVideoDurationMap(value: unknown) {
  const source = isRecord(value) ? value : {};
  const out: Record<string, number[]> = {};
  Object.entries(source).forEach(([key, raw]) => {
    const normalizedKey = normalizeVideoResolutionKey(key);
    const values = normalizeVideoDurationList(raw);
    if (normalizedKey && values.length) out[normalizedKey] = values;
  });
  return out;
}

function normalizeVideoDurationList(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map(item => normalizePositiveInt(item)).filter((item): item is number => Boolean(item)))).sort((a, b) => a - b);
}

function normalizePositiveInt(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function defaultVideoDurationOptions(maxSeconds: number) {
  return [4, 5, 6, 8, 10, 12, 15, 20, 30, 60, 90, 120].filter(value => value <= maxSeconds);
}

function resolveSeedance2VipModelName(ctx: AdapterContext, resolution: string) {
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || 'seedance2.0-vip').trim();
  const base = raw.replace(/-(?:480p|720p|1080p)$/i, '') || 'seedance2.0-vip';
  return `${base}-${resolution}`;
}

function normalizeSeedance2VipResolution(value: unknown) {
  return normalizeAllowedString(value, ['720p', '1080p'], '720p');
}

function normalizeSeedance2VipSeconds(value: unknown) {
  return String(normalizeAllowedNumber(value, [5, 10, 15], 5));
}

function normalizeGrokImageCount(value: unknown) {
  const raw = Number.parseInt(String(value || 1), 10);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.min(10, raw));
}

function isApimartGrokImageProvider(ctx: AdapterContext) {
  const hay = [
    ctx.provider.baseUrl,
    ctx.provider.name,
    ctx.provider.providerKey,
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.modelKey,
  ].map(value => String(value || '')).join(' ').toLowerCase();
  return /apimart|grok-imagine-1\.0-apimart/.test(hay);
}

function normalizeGrokImageRequestSize(ctx: AdapterContext, value: unknown) {
  if (!isApimartGrokImageProvider(ctx)) return normalizeGrokImageSize(value);
  const ratio = ratioFromSize(String(value || '').trim().toLowerCase().replace('×', 'x'));
  return ['16:9', '9:16', '1:1', '3:2', '2:3'].includes(ratio) ? ratio : '1:1';
}

function normalizeGrokImageSize(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const direct = ['1280x720', '720x1280', '1792x1024', '1024x1792', '1024x1024'].find(size => size === raw);
  if (direct) return direct;
  const ratio = ratioFromSize(raw);
  switch (ratio) {
    case '16:9': return '1280x720';
    case '9:16': return '720x1280';
    case '3:2': return '1792x1024';
    case '2:3': return '1024x1792';
    case '1:1': return '1024x1024';
    default: return '1024x1024';
  }
}

function normalizeGrokVideoSize(value: unknown) {
  return normalizeGrokImageSize(value || '1792x1024');
}

function normalizeGrokVideoQuality(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (['high', '720p', '1080p', '2k', '4k'].includes(raw)) return 'high';
  return 'standard';
}

function normalizeGeminiUnifiedImageSize(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const direct = ['1024x1024', '1280x720', '720x1280', '1792x1024', '1024x1792'].find(size => size === raw);
  if (direct) return direct;
  return normalizeGrokImageSize(raw || '1024x1024');
}

function normalizeGeminiImageAspectRatio(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  if (!raw || raw === 'auto') return '1:1';
  const direct = ['1:1', '2:1', '21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '1:3', '3:1'].find(item => item === raw);
  if (direct) return direct;
  const sizeMatch = raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (!sizeMatch) return '1:1';
  const width = Number(sizeMatch[1] || 0);
  const height = Number(sizeMatch[2] || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '1:1';
  const ratio = width / height;
  const candidates = [
    ['3:1', 3],
    ['21:9', 21 / 9],
    ['2:1', 2],
    ['16:9', 16 / 9],
    ['3:2', 3 / 2],
    ['4:3', 4 / 3],
    ['1:1', 1],
    ['3:4', 3 / 4],
    ['2:3', 2 / 3],
    ['9:16', 9 / 16],
    ['1:3', 1 / 3],
  ] as const;
  return candidates.reduce((best, item) => Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best, candidates[0])[0];
}

function normalizeGeminiImageSizeToken(value: unknown) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '2K';
  if (raw === '1K' || raw === '1024' || raw === '1024X1024') return '1K';
  if (raw === '2K' || raw === '2048' || raw === '2048X2048') return '2K';
  if (raw === '3K') return '2K';
  if (raw === '4K') return '4K';
  const sizeMatch = raw.match(/^(\d+)\s*X\s*(\d+)$/);
  if (sizeMatch) {
    const longSide = Math.max(Number(sizeMatch[1] || 0), Number(sizeMatch[2] || 0));
    if (longSide >= 3500) return '4K';
    if (longSide >= 2500) return '2K';
    return longSide > 1400 ? '2K' : '1K';
  }
  return '2K';
}

function extractGeminiVideoTask(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return String(
    extractVideoTask(payload as any) ||
    (payload as any)?.operation?.name ||
    (payload as any)?.operation?.id ||
    (payload as any)?.operation_id ||
    (payload as any)?.name ||
    first?.operation?.name ||
    first?.operation?.id ||
    first?.operation_id ||
    first?.name ||
    ''
  ).trim();
}

function extractGeminiVideoStatus(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return String(
    (payload as any)?.status ||
    first?.status ||
    (payload as any)?.task?.status ||
    (payload as any)?.operation?.status ||
    (payload as any)?.operation?.metadata?.state ||
    ''
  ).trim().toLowerCase();
}

function extractGeminiVideoProgress(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  const raw = Number(
    (payload as any)?.progress ??
    first?.progress ??
    (payload as any)?.task?.progress ??
    (payload as any)?.operation?.metadata?.progressPercent ??
    0
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(99, Math.round(raw)));
}

function ratioFromSize(value: string) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const ratioMatch = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratioMatch) return normalizeRatio(Number(ratioMatch[1]), Number(ratioMatch[2]));
  const sizeMatch = raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/);
  if (sizeMatch) return normalizeRatio(Number(sizeMatch[1]), Number(sizeMatch[2]));
  return '';
}

function normalizeRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const ratio = width / height;
  const candidates = [
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['3:2', 3 / 2],
    ['2:3', 2 / 3],
    ['1:1', 1],
  ] as const;
  return candidates.reduce((best, item) => Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best, candidates[0])[0];
}

function extractGrokAsyncTaskId(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return String(
    (payload as any)?.task_id ||
    (payload as any)?.taskId ||
    (payload as any)?.id ||
    first?.task_id ||
    first?.taskId ||
    first?.id ||
    ''
  ).trim();
}

function extractGrokTaskStatus(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return String(
    (payload as any)?.status ||
    first?.status ||
    (payload as any)?.task?.status ||
    ''
  ).trim().toLowerCase();
}

function extractGrokTaskProgress(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  const raw = Number(
    (payload as any)?.progress ??
    first?.progress ??
    (payload as any)?.task?.progress ??
    0
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(99, Math.round(raw)));
}

function extractGenericTaskStatus(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  return String(
    (payload as any)?.status ||
    (payload as any)?.state ||
    (payload as any)?.task?.status ||
    (payload as any)?.task?.state ||
    (payload as any)?.result?.status ||
    (payload as any)?.result?.state ||
    first?.status ||
    first?.state ||
    ''
  ).trim().toLowerCase();
}

function extractGenericImageProgress(payload: unknown) {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  const raw = Number(
    (payload as any)?.progress ??
    (payload as any)?.task?.progress ??
    (payload as any)?.result?.progress ??
    first?.progress ??
    0
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(99, Math.round(raw)));
}

async function collectPublicImageReferenceUrls(ctx: AdapterContext, timeoutMs = 15000) {
  const refs = new Set<string>();
  const fileIds = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (/^file-[\w-]+$/i.test(raw)) {
        fileIds.add(raw);
        return;
      }
      const publicUrl = resolvePublicReferenceImageUrl(raw);
      if (publicUrl) refs.add(publicUrl);
      else if (/^data:image\//i.test(raw)) refs.add(raw);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const saved = isRecord(obj.saved) ? obj.saved : {};
      [
        obj.fallbackRemoteUrl,
        obj.remoteFallbackUrl,
        obj.objectStorageUrl,
        obj.publicUrl,
        obj.cosUrl,
        obj.cos_url,
        saved.fallbackRemoteUrl,
        saved.remoteFallbackUrl,
        saved.objectStorageUrl,
        saved.publicUrl,
        obj.remoteUrl,
        obj.url,
        obj.dataUrl,
        obj.imageUrl,
        obj.image_url,
        saved.remoteUrl,
        saved.url,
        isRecord(obj.image_url) ? obj.image_url.url : undefined,
      ].forEach(push);
      [
        obj.uploadRef,
        obj.providerRef,
        obj.fileId,
        obj.file_id,
        obj.id,
        saved.fileId,
        saved.file_id,
        saved.id,
      ].forEach(push);
    }
  };
  ctx.inputFiles.forEach(push);
  const rawImages = ctx.params.reference_images || ctx.params.referenceImages || ctx.params.images || ctx.params.image || ctx.params.input_image;
  if (Array.isArray(rawImages)) rawImages.forEach(push);
  else push(rawImages);

  const fallbackUrls = await Promise.all(Array.from(fileIds).map(fileId => getUploadedFileFallbackUrlAsync(fileId, timeoutMs)));
  fallbackUrls.forEach(push);

  const resolved: string[] = [];
  for (const ref of refs) {
    if (/^data:image\//i.test(ref)) resolved.push(ref);
    else resolved.push(await materializeGenerationResultReferenceUrl(ref));
  }
  return Array.from(new Set(resolved.filter(Boolean)));
}

async function collectGrokImageRefs(ctx: AdapterContext) {
  return collectPublicImageReferenceUrls(ctx);
}

async function grokImageRefToBlob(ref: string, timeoutMs: number) {
  const raw = String(ref || '').trim();
  if (/^data:image\//i.test(raw)) return dataUriToBlob(raw);
  if (!/^https?:\/\//i.test(raw)) fail(400, 'Grok 图生图参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_INVALID');

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal });
    if (!resp.ok) fail(400, `Grok 图生图参考图下载失败 HTTP ${resp.status}`, 'GROK_IMAGE_REFERENCE_FETCH_FAILED');
    const mime = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(raw));
    const bytes = await resp.arrayBuffer();
    return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    fail(400, `Grok 图生图参考图下载失败：${message}`, 'GROK_IMAGE_REFERENCE_FETCH_FAILED');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function compatibleImageRefToBlob(ref: string, timeoutMs: number, label: string) {
  const raw = String(ref || '').trim();
  if (/^data:image\//i.test(raw)) return dataUriToBlob(raw);
  if (!/^https?:\/\//i.test(raw)) fail(400, `${label}参考图必须是公网 URL 或 data URI`, 'IMAGE_REFERENCE_INVALID');

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal });
    if (!resp.ok) fail(400, `${label}参考图下载失败 HTTP ${resp.status}`, 'IMAGE_REFERENCE_FETCH_FAILED');
    const mime = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(raw));
    const bytes = await resp.arrayBuffer();
    return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    fail(400, `${label}参考图下载失败：${message}`, 'IMAGE_REFERENCE_FETCH_FAILED');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dataUriToBlob(value: string) {
  const match = value.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) fail(400, 'Grok 图生图 data URI 格式无效', 'GROK_IMAGE_REFERENCE_INVALID');
  const mime = normalizeImageMime(match[1]);
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
}

function normalizeImageMime(value: string) {
  const raw = String(value || '').split(';')[0].trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (['image/png', 'image/jpeg', 'image/webp'].includes(raw)) return raw;
  return 'image/png';
}

function imageExtFromMime(mime: string) {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'png';
}

function normalizeMediaMime(value: string, mediaType: 'video' | 'audio' = 'video') {
  const raw = String(value || '').split(';')[0].trim().toLowerCase();
  if (mediaType === 'audio') {
    if (raw === 'audio/mp3') return 'audio/mpeg';
    if (['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg'].includes(raw)) return raw;
    return 'audio/mpeg';
  }
  if (['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg'].includes(raw)) return raw;
  return 'video/mp4';
}

function mediaExtFromMime(mime: string, mediaType: 'video' | 'audio' = 'video') {
  const raw = String(mime || '').toLowerCase();
  if (mediaType === 'audio') {
    if (raw.includes('wav')) return 'wav';
    if (raw.includes('aac')) return 'aac';
    if (raw.includes('mp4')) return 'm4a';
    if (raw.includes('webm')) return 'webm';
    if (raw.includes('ogg')) return 'ogg';
    return 'mp3';
  }
  if (raw.includes('webm')) return 'webm';
  if (raw.includes('quicktime')) return 'mov';
  if (raw.includes('mpeg')) return 'mpeg';
  return 'mp4';
}

function redactLargeInlineRef(ref: string, index: number) {
  const raw = String(ref || '');
  if (/^data:image\//i.test(raw)) return `[inline image ${index + 1} omitted: ${raw.length} chars]`;
  return raw;
}

async function normalizeImageSubmit(provider: UpstreamProvider, upstream: unknown, requestJson: Prisma.InputJsonValue, responseType: ImageResponseType = 'object_storage'): Promise<AdapterSubmitResult> {
  const result = extractImageResult(upstream);
  const resultUrl = await imageResultUrl(provider, result, responseType);
  const extractedUrls = extractImageOutputUrls(upstream);
  const urls = resultUrl ? [resultUrl] : await resolveImageResultUrls(provider, extractedUrls, responseType);
  const primaryUrl = resultUrl || urls[0] || '';
  const taskId = extractUpstreamTaskId(upstream);
  if (!primaryUrl && taskId) {
    return {
      status: 'RUNNING',
      progress: extractGenericImageProgress(upstream),
      upstreamTaskId: taskId,
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [] } as Prisma.InputJsonValue,
      resultUrls: [],
    };
  }
  if (!primaryUrl && (result.url || result.b64 || extractUrls(upstream).length)) {
    return {
      status: 'FAILED',
      progress: 100,
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', mimeType: result.mimeType, outputs: [] } as Prisma.InputJsonValue,
      resultUrls: [],
      errorCode: 'IMAGE_RESULT_MATERIALIZE_FAILED',
      errorMessage: '生图上游已返回图片，但结果没有成功转存到对象存储；已阻止下发临时中转链接，请检查 COS 配置后重试。',
    };
  }
  if (!primaryUrl) {
    return {
      status: 'FAILED',
      progress: 100,
      upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', mimeType: result.mimeType, outputs: [] } as Prisma.InputJsonValue,
      resultUrls: [],
      errorCode: imageOutputMissingErrorCode(upstream),
      errorMessage: imageOutputMissingErrorMessage(upstream),
    };
  }
  return {
    status: 'SUCCESS',
    progress: 100,
    upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
    requestJson,
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { url: primaryUrl, mimeType: result.mimeType, outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
  };
}

function extractImageOutputUrls(payload: unknown) {
  return Array.from(new Set([
    ...extractGptImageV2Urls(payload),
    ...extractUrls(payload),
  ]));
}

function imageOutputMissingErrorCode(payload: unknown) {
  const message = extractErrorMessage(payload);
  if (/policy|safety|safe|moderation|blocked|refusal|refused|content/i.test(message)) return 'UPSTREAM_IMAGE_REJECTED';
  if (/rate.?limit|too many requests|quota|capacity|429/i.test(message)) return 'UPSTREAM_RATE_LIMITED';
  if (/timeout|timed out|deadline|connection|disconnect|socket|network/i.test(message)) return 'UPSTREAM_TIMEOUT';
  return 'IMAGE_RESULT_MISSING';
}

function imageOutputMissingErrorMessage(payload: unknown) {
  const message = extractErrorMessage(payload);
  if (message && message !== '上游任务失败') return message;
  const status = extractGenericTaskStatus(payload);
  const statusSuffix = status ? `，上游状态：${status}` : '';
  return `上游响应未包含图片 URL、b64_json 或可轮询任务 ID${statusSuffix}；请检查该模型渠道的 adapter/endpointPath 与上游 responseJson.output/error。`;
}

async function imageResultUrl(provider: UpstreamProvider, result: { url?: string; b64?: string; mimeType?: string }, responseType: ImageResponseType = 'object_storage') {
  const directUrl = absolutizeProviderUrl(provider, result.url);
  if (responseType === 'base64') {
    if (result.b64) return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
    if (/^data:image\//i.test(directUrl)) return directUrl;
    return directUrl || '';
  }
  if (responseType === 'provider_url' || responseType === 'server_object_storage') {
    if (directUrl) return directUrl;
    if (result.b64) return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
    return '';
  }
  if (/^data:image\//i.test(directUrl)) return persistInlineImage(directUrl, result.mimeType || 'image/png');
  if (directUrl) return materializeImageResultUrl(provider, directUrl);
  if (result.b64) return persistInlineImage(result.b64, result.mimeType || 'image/png');
  return '';
}

async function resolveImageResultUrls(provider: UpstreamProvider, urls: string[], responseType: ImageResponseType) {
  const clean = urls.filter(url => !/^data:image\//i.test(url));
  if (responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'base64') return absolutizeProviderUrls(provider, clean);
  return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
}

async function resolveVideoResultUrls(ctx: AdapterContext, urls: string[]) {
  const clean = urls.filter(url => !/^data:/i.test(String(url || '')));
  const responseType = resolveImageResponseType(ctx);
  const absolute = absolutizeProviderUrls(ctx.provider, clean);
  if (responseType === 'provider_url' || responseType === 'base64') return absolute;
  return materializeMediaResultUrls(ctx.provider, absolute, 'video');
}

function inlineImageDataUrl(value: string, mimeType = 'image/png') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  return `data:${mimeType || 'image/png'};base64,${raw.replace(/\s+/g, '')}`;
}

async function materializeImageResultUrls(provider: UpstreamProvider, urls: string[]) {
  const resolved: string[] = [];
  for (const url of urls) {
    const next = await materializeImageResultUrl(provider, url);
    if (next && !resolved.includes(next)) resolved.push(next);
  }
  return resolved;
}

async function materializeMediaResultUrls(provider: UpstreamProvider, urls: string[], mediaType: 'video' | 'audio' = 'video') {
  const resolved: string[] = [];
  for (const url of urls) {
    const next = await materializeMediaResultUrl(provider, url, mediaType);
    if (next && !resolved.includes(next)) resolved.push(next);
  }
  return resolved;
}

export async function materializeImageResultUrl(provider: UpstreamProvider, value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return persistInlineImage(raw);
  if (isGenerationResultPath(raw)) return materializeGenerationResultReferenceUrl(raw);
  if (!/^https?:\/\//i.test(raw)) return raw;
  if (isLikelyObjectStoragePublicUrl(raw)) return raw;
  const cached = remoteImageObjectStorageCache.get(raw);
  if (cached) return cached;
  const uploaded = await uploadRemoteImageUrlToObjectStorageBestEffort(provider, raw);
  if (uploaded) {
    remoteImageObjectStorageCache.set(raw, uploaded);
    return uploaded;
  }
  if (isProviderEphemeralImageResultUrl(provider, raw)) {
    console.warn('[generation] result object storage materialize failed, using provider temporary image url fallback:', raw);
  }
  return raw;
}

async function persistInlineImage(value: string, mimeType = 'image/png') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  const mime = match?.[1] || mimeType || 'image/png';
  const b64 = (match?.[2] || raw).replace(/\s+/g, '');
  const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('gif') ? 'gif' : 'png';
  const bytes = Buffer.from(b64, 'base64');
  if (!bytes.length) return '';
  const objectStorageUrl = await uploadImageBufferToObjectStorageBestEffort(bytes, `generated.${ext}`, mime);
  if (objectStorageUrl) return objectStorageUrl;
  const fallbackUrl = await persistInlineImageLocalFallback(bytes, ext);
  if (fallbackUrl) return fallbackUrl;
  return '';
}

async function persistInlineImageLocalFallback(buffer: Buffer, ext: string) {
  try {
    await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
    const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(GENERATED_IMAGE_DIR, filename), buffer);
    return `/api/generation/results/${encodeURIComponent(filename)}`;
  } catch (err) {
    console.warn('[generation] result local fallback write failed:', err instanceof Error ? err.message : String(err));
    return '';
  }
}

async function uploadImageBufferToObjectStorageBestEffort(buffer: Buffer, filename: string, contentType: string) {
  if (!isObjectStorageConfigured()) return '';
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const uploaded = await uploadObjectStorageBuffer({
        userId: 'generation-results',
        buffer,
        filename,
        contentType,
        maxBytes: Math.max(config.generationResultObjectStorageMaxBytes, GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR),
      });
      return uploaded.url || '';
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  console.warn('[generation] result object storage upload failed:', lastErr instanceof Error ? lastErr.message : String(lastErr));
  return '';
}

async function uploadRemoteImageUrlToObjectStorageBestEffort(provider: UpstreamProvider, rawUrl: string) {
  if (!isObjectStorageConfigured()) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_RESULT_MATERIALIZE_TIMEOUT_MS);
  try {
    const resp = await fetch(rawUrl, { signal: controller.signal });
    if (!resp.ok) return '';
    const contentType = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(rawUrl));
    if (!/^image\//i.test(contentType)) return '';
    const contentLength = Number(resp.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > config.generationResultObjectStorageMaxBytes) return '';
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (!bytes.length || bytes.length > config.generationResultObjectStorageMaxBytes) return '';
    const filename = remoteImageFilename(provider, rawUrl, contentType);
    const objectStorageUrl = await uploadImageBufferToObjectStorageBestEffort(bytes, filename, contentType);
    if (objectStorageUrl) return objectStorageUrl;
    return '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function materializeMediaResultUrl(provider: UpstreamProvider, value: string, mediaType: 'video' | 'audio' = 'video') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return raw;
  if (isLikelyObjectStoragePublicUrl(raw)) return raw;
  const cacheKey = `${mediaType}:${raw}`;
  const cached = remoteMediaObjectStorageCache.get(cacheKey);
  if (cached) return cached;
  const uploaded = await uploadRemoteMediaUrlToObjectStorageBestEffort(provider, raw, mediaType);
  if (uploaded) {
    remoteMediaObjectStorageCache.set(cacheKey, uploaded);
    return uploaded;
  }
  return raw;
}

async function uploadRemoteMediaUrlToObjectStorageBestEffort(provider: UpstreamProvider, rawUrl: string, mediaType: 'video' | 'audio' = 'video') {
  if (!isObjectStorageConfigured()) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_RESULT_MATERIALIZE_TIMEOUT_MS);
  try {
    const resp = await fetch(rawUrl, { signal: controller.signal });
    if (!resp.ok) return '';
    const contentType = normalizeMediaMime(resp.headers.get('content-type') || inferMediaMimeType(rawUrl, mediaType), mediaType);
    if (mediaType === 'video' && !/^video\//i.test(contentType)) return '';
    if (mediaType === 'audio' && !/^audio\//i.test(contentType)) return '';
    const contentLength = Number(resp.headers.get('content-length') || 0);
    const maxBytes = Math.max(config.generationResultObjectStorageMaxBytes, MEDIA_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) return '';
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (!bytes.length || bytes.length > maxBytes) return '';
    const filename = remoteMediaFilename(provider, rawUrl, contentType, mediaType);
    const uploaded = await uploadObjectStorageBuffer({
      userId: 'generation-results',
      buffer: bytes,
      filename,
      contentType,
      maxBytes,
    });
    return uploaded.url || '';
  } catch (err) {
    console.warn('[generation] result media object storage upload failed:', err instanceof Error ? err.message : String(err));
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function remoteImageFilename(provider: UpstreamProvider, rawUrl: string, contentType: string) {
  try {
    const parsed = new URL(rawUrl);
    const base = path.basename(parsed.pathname).replace(/[^\w.-]+/g, '-') || `image.${imageExtFromMime(contentType)}`;
    if (/\.(png|jpe?g|webp|gif)$/i.test(base)) return base;
  } catch {
    // fall through
  }
  const providerKey = String(provider.providerKey || provider.id || 'provider').replace(/[^\w.-]+/g, '-');
  return `${providerKey}-${Date.now().toString(36)}.${imageExtFromMime(contentType)}`;
}

function remoteMediaFilename(provider: UpstreamProvider, rawUrl: string, contentType: string, mediaType: 'video' | 'audio' = 'video') {
  const ext = mediaExtFromMime(contentType, mediaType);
  try {
    const parsed = new URL(rawUrl);
    const base = path.basename(parsed.pathname).replace(/[^\w.-]+/g, '') || `${mediaType}.${ext}`;
    if (mediaType === 'audio' && /\.(mp3|m4a|aac|wav|webm|ogg)$/i.test(base)) return base;
    if (mediaType === 'video' && /\.(mp4|webm|mov|mpe?g)$/i.test(base)) return base;
  } catch {
    // fall through
  }
  const providerKey = String(provider.providerKey || provider.id || 'provider').replace(/[^\w.-]+/g, '-');
  return `${providerKey}-${mediaType}-${Date.now().toString(36)}.${ext}`;
}

function isObjectStorageConfigured() {
  return Boolean(
    config.objectStorage.endpointUrl &&
    config.objectStorage.accessKeyId &&
    config.objectStorage.secretAccessKey &&
    config.objectStorage.bucket
  );
}

function isLikelyObjectStoragePublicUrl(value: string) {
  const raw = String(value || '').trim();
  const publicBase = String(config.objectStorage.publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (publicBase && raw.startsWith(`${publicBase}/`)) return true;
  if (!config.objectStorage.endpointUrl || !config.objectStorage.bucket) return false;
  try {
    const url = new URL(raw);
    const endpoint = new URL(config.objectStorage.endpointUrl);
    return url.hostname === endpoint.hostname || url.hostname === `${config.objectStorage.bucket}.${endpoint.hostname}`;
  } catch {
    return false;
  }
}

function isProviderEphemeralImageResultUrl(provider: UpstreamProvider, value: string) {
  try {
    const resultUrl = new URL(value);
    if (!/^\/v1\/images\/results\//i.test(resultUrl.pathname)) return false;
    const providerUrl = new URL(String(provider.baseUrl || '').replace(/\/+$/, '/') || resultUrl.origin);
    return resultUrl.hostname === providerUrl.hostname;
  } catch {
    return false;
  }
}

function sanitizeUpstreamPayload(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (typeof item === 'string') {
      const raw = item.trim();
      const parentMime = String(parent?.mimeType || parent?.mime_type || parent?.mime || parent?.contentType || parent?.content_type || '');
      if (/^data:image\/[^;]+;base64,/i.test(raw)) return '[inline image omitted: url result used]';
      if (raw.length > 2048 && (/b64|base64|imageData|inlineData|inline_data/i.test(key) || (/^image\//i.test(parentMime) && /data/i.test(key)))) {
        return `[inline image omitted: ${raw.length} chars]`;
      }
      return item;
    }
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return null;
    seen.add(item);
    if (Array.isArray(item)) return item.map(child => visit(child, key, parent));
    const obj = item as Record<string, unknown>;
    return Object.fromEntries(Object.entries(obj).map(([childKey, child]) => [childKey, visit(child, childKey, obj)]));
  };
  return visit(value);
}

export function generatedImageFilePath(name: string) {
  const safeName = path.basename(String(name || ''));
  if (!/^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(safeName)) return '';
  return path.join(GENERATED_IMAGE_DIR, safeName);
}

function buildGeminiImageParts(ctx: AdapterContext) {
  const refs = new Map<string, string>();
  const push = (value: unknown, mimeHint = '') => {
    if (!value) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (raw) refs.set(raw, mimeHint || inferImageMimeType(raw));
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const mime = String(obj.mimeType || obj.mime_type || obj.contentType || obj.content_type || obj.type || '').trim();
      [
        obj.url,
        obj.remoteUrl,
        obj.imageUrl,
        obj.image_url,
        obj.uploadRef,
        obj.providerRef,
        obj.fileId,
        obj.id,
        isRecord(obj.image_url) ? obj.image_url.url : undefined,
      ].forEach(item => push(item, mime));
    }
  };
  ctx.inputFiles.forEach(item => push(item));
  const rawImages = ctx.params.images || ctx.params.image || ctx.params.reference_images || ctx.params.referenceImages;
  if (Array.isArray(rawImages)) rawImages.forEach(item => push(item));
  else push(rawImages);
  return Array.from(refs.entries()).filter(([fileUri]) => !!fileUri).map(([fileUri, mimeType]) => ({
    fileData: {
      mimeType: mimeType || inferImageMimeType(fileUri),
      fileUri,
    },
  }));
}

function inferImageMimeType(value: string) {
  const raw = String(value || '').toLowerCase();
  if (raw.startsWith('data:image/')) {
    const match = raw.match(/^data:(image\/[^;]+)/);
    if (match?.[1]) return match[1];
  }
  if (/\.webp(?:$|[?#])/.test(raw)) return 'image/webp';
  if (/\.png(?:$|[?#])/.test(raw)) return 'image/png';
  if (/\.gif(?:$|[?#])/.test(raw)) return 'image/gif';
  return 'image/jpeg';
}

function inferMediaMimeType(value: string, mediaType: 'video' | 'audio' = 'video') {
  const raw = String(value || '').toLowerCase();
  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+)/);
    if (match?.[1]) return normalizeMediaMime(match[1], mediaType);
  }
  if (mediaType === 'audio') {
    if (/\.wav(?:$|[?#])/.test(raw)) return 'audio/wav';
    if (/\.m4a(?:$|[?#])/.test(raw)) return 'audio/mp4';
    if (/\.aac(?:$|[?#])/.test(raw)) return 'audio/aac';
    if (/\.webm(?:$|[?#])/.test(raw)) return 'audio/webm';
    if (/\.ogg(?:$|[?#])/.test(raw)) return 'audio/ogg';
    return 'audio/mpeg';
  }
  if (/\.webm(?:$|[?#])/.test(raw)) return 'video/webm';
  if (/\.(mov|qt)(?:$|[?#])/.test(raw)) return 'video/quicktime';
  if (/\.mpe?g(?:$|[?#])/.test(raw)) return 'video/mpeg';
  return 'video/mp4';
}

function normalizeGptImageV2BaseModel(modelName: string) {
  const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
  return raw.replace(/-(?:1|2|4)k$/i, '');
}

async function buildGptImageV2ReferenceImages(ctx: AdapterContext) {
  return collectPublicImageReferenceUrls(ctx);
}

function buildVideoReferenceUrls(ctx: AdapterContext) {
  const refs = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      const publicUrl = resolvePublicReferenceImageUrl(raw);
      if (publicUrl) refs.add(publicUrl);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const saved = isRecord(obj.saved) ? obj.saved : {};
      [
        obj.remoteUrl,
        obj.providerRef,
        obj.uploadRef,
        obj.fileId,
        obj.file_id,
        obj.id,
        obj.imageUrl,
        obj.image_url,
        isRecord(obj.image_url) ? obj.image_url.url : undefined,
        saved.remoteUrl,
        saved.url,
        obj.url,
      ].forEach(push);
    }
  };
  ctx.inputFiles.forEach(item => push(item));
  const rawImages = ctx.params.reference_image_urls
    || ctx.params.referenceImageUrls
    || ctx.params.reference_images
    || ctx.params.referenceImages
    || ctx.params.images
    || ctx.params.image;
  if (Array.isArray(rawImages)) rawImages.forEach(item => push(item));
  else push(rawImages);
  return Array.from(refs);
}

function buildVideoMediaReferences(ctx: AdapterContext) {
  const pick = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return /^https?:\/\//i.test(value.trim()) ? value.trim() : '';
    if (typeof value !== 'object') return '';
    const obj = value as Record<string, unknown>;
    const saved = isRecord(obj.saved) ? obj.saved : {};
    const candidates = [
      obj.remoteUrl,
      obj.providerRef,
      obj.uploadRef,
      obj.fileId,
      obj.file_id,
      obj.id,
      saved.remoteUrl,
      saved.url,
      obj.url,
      obj.videoUrl,
      obj.audioUrl,
      obj.video_url,
      obj.audio_url,
    ];
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (/^https?:\/\//i.test(raw)) return raw;
    }
    return '';
  };
  return {
    videoUrl: pick(ctx.params.video_url || ctx.params.videoUrl || ctx.params.refVideo || ctx.params.video),
    audioUrl: pick(ctx.params.audio_url || ctx.params.audioUrl || ctx.params.refAudio || ctx.params.audio),
  };
}

function buildVideoReferenceVideoUrls(ctx: AdapterContext) {
  const refs = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (/^(https?:\/\/|data:video\/)/i.test(raw)) refs.add(raw);
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const saved = isRecord(obj.saved) ? obj.saved : {};
      [
        obj.soraV3ReferenceVideoUrl,
        obj.referenceVideoUrl,
        saved.soraV3ReferenceVideoUrl,
        saved.referenceVideoUrl,
        obj.remoteUrl,
        obj.providerRef,
        obj.uploadRef,
        obj.fileId,
        obj.file_id,
        obj.id,
        saved.remoteUrl,
        saved.url,
        obj.url,
        obj.videoUrl,
        obj.video_url,
      ].forEach(push);
    }
  };
  const rawVideos = ctx.params.reference_videos || ctx.params.referenceVideos || ctx.params.reference_video || ctx.params.referenceVideo;
  if (Array.isArray(rawVideos)) rawVideos.forEach(item => push(item));
  else push(rawVideos);
  const mediaRefs = buildVideoMediaReferences(ctx);
  push(mediaRefs.videoUrl);
  push(ctx.params.soraV3ReferenceVideoUrl || ctx.params.referenceVideoUrl || ctx.params.audioReferenceVideoUrl);
  return Array.from(refs);
}

function extractGptImageV2Urls(payload: unknown) {
  const urls = new Set<string>();
  const push = (value: unknown) => {
    const raw = String(value || '').trim();
    if (/^(https?:\/\/|\/v1\/(?:images\/results|files|videos)\/)/i.test(raw)) urls.add(raw);
  };
  const visit = (value: unknown, key = '') => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/url|uri|result|output|image|b64|base64/i.test(key)) push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([itemKey, item]) => {
        if (/url|uri|result|output|image|data/i.test(itemKey) || typeof item === 'object') visit(item, itemKey);
      });
    }
  };
  visit(payload);
  return Array.from(urls);
}

function extractVeoChatVideoUrls(payload: unknown) {
  const urls = new Set<string>();
  const pushText = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const matches = raw.match(/https?:\/\/[^\s"'<>)]*/gi) || [];
    matches.forEach(match => urls.add(match.replace(/[，。,.]+$/g, '')));
  };
  const choice = Array.isArray((payload as any)?.choices) ? (payload as any).choices[0] : null;
  const content = choice?.message?.content ?? choice?.text;
  if (typeof content === 'string') pushText(content);
  else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') pushText(item);
      else if (item && typeof item === 'object') {
        pushText((item as Record<string, unknown>).text);
        const videoUrl = (item as Record<string, unknown>).video_url;
        if (isRecord(videoUrl)) pushText(videoUrl.url);
        else pushText(videoUrl);
        pushText((item as Record<string, unknown>).url);
      }
    });
  }
  extractUrls(payload).forEach(url => urls.add(url));
  return Array.from(urls);
}

function resolveGptImageV2Endpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured) return '/v1/images/generations';
  if (/\/v1\/images\/generations$/i.test(configured)) return configured;
  if (/\/images\/generations$/i.test(configured)) return '/v1/images/generations';
  return configured;
}

function absolutizeProviderUrl(provider: UpstreamProvider, value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  if (!raw.startsWith('/')) return raw;
  try {
    return new URL(raw, provider.baseUrl.replace(/\/+$/, '') + '/').toString();
  } catch {
    return raw;
  }
}

function absolutizeProviderUrls(provider: UpstreamProvider, urls: string[]) {
  return Array.from(new Set(urls.map(url => absolutizeProviderUrl(provider, url)).filter(Boolean)));
}

function resolveEndpointPath(endpointPath: string, ctx: AdapterContext & { taskId?: string }) {
  return String(endpointPath || '')
    .replaceAll('{model}', encodeURIComponent(ctx.model.name))
    .replaceAll('{baseModel}', encodeURIComponent(ctx.model.name))
    .replaceAll('{taskId}', encodeURIComponent(ctx.taskId || ''))
    .replaceAll('{task_id}', encodeURIComponent(ctx.taskId || ''));
}

function compactJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')) as Prisma.InputJsonValue;
}

function withoutKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function extractUrls(payload: unknown): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/^(https?:\/\/|\/v1\/(?:images\/results|files|videos)\/)/.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        if (/url|uri/i.test(key)) visit(item);
        else if (typeof item === 'object') visit(item);
      });
    }
  };
  visit(payload);
  return Array.from(urls);
}

function extractTaskStatusText(payload: unknown) {
  const data = payload as any;
  const candidates = [
    data?.data?.status,
    data?.data?.state,
    data?.data?.task_status,
    data?.data?.taskStatus,
    data?.data?.status_text,
    data?.data?.statusText,
    data?.data?.task?.status,
    data?.data?.task?.state,
    data?.data?.task?.task_status,
    data?.data?.result?.status,
    data?.data?.result?.state,
    data?.data?.video?.status,
    data?.data?.output?.status,
    data?.task?.status,
    data?.task?.state,
    data?.result?.status,
    data?.result?.state,
    data?.state,
    data?.task_status,
    data?.taskStatus,
    data?.status,
  ].map(normalizeTaskStatusValue).filter(Boolean);
  if (candidates.length) return candidates[0];
  const recursive = findTaskStatusValue(payload, 0);
  return recursive || '';
}

function findTaskStatusValue(value: unknown, depth: number): string {
  if (!value || depth > 5 || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskStatusValue(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(status|state|task_status|taskStatus|status_text|statusText|generation_status|generationStatus)$/i.test(key)) {
      const normalized = normalizeTaskStatusValue(item);
      if (normalized) return normalized;
    }
    if (item && typeof item === 'object') {
      const found = findTaskStatusValue(item, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function normalizeTaskStatusValue(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || /^\d+$/.test(raw)) return '';
  if (/^(success|succeeded|completed|complete|done|finished|finish)$/i.test(raw) || /成功|完成/.test(raw)) return 'completed';
  if (/^(failed|failure|fail|error|errored|cancelled|canceled|rejected|blocked|denied)$/i.test(raw) || /失败|错误|拒绝|拦截|审核失败/.test(raw)) return 'failed';
  if (/^(pending|queued|queue|processing|running|in_progress|generating|submitted|created)$/i.test(raw) || /排队|等待|处理中|进行中|生成中/.test(raw)) return raw;
  return '';
}

function isFailedTaskStatus(status: string) {
  return normalizeTaskStatusValue(status) === 'failed';
}

function isDoneTaskStatus(status: string) {
  return normalizeTaskStatusValue(status) === 'completed';
}

function extractErrorMessage(payload: unknown) {
  const direct = [
    (payload as any)?.error?.message,
    (payload as any)?.error_message,
    (payload as any)?.errorMessage,
    (payload as any)?.message,
    (payload as any)?.msg,
    (payload as any)?.reason,
    (payload as any)?.fail_reason,
    (payload as any)?.failed_reason,
    (payload as any)?.failure_reason,
    (payload as any)?.data?.error?.message,
    (payload as any)?.data?.error_message,
    (payload as any)?.data?.errorMessage,
    (payload as any)?.data?.message,
    (payload as any)?.data?.msg,
    (payload as any)?.data?.reason,
    (payload as any)?.data?.fail_reason,
    (payload as any)?.data?.failed_reason,
    (payload as any)?.data?.failure_reason,
    (payload as any)?.data?.task?.error?.message,
    (payload as any)?.data?.task?.error_message,
    (payload as any)?.data?.task?.message,
    (payload as any)?.data?.task?.reason,
    (payload as any)?.data?.result?.error?.message,
    (payload as any)?.data?.result?.error_message,
    (payload as any)?.data?.result?.message,
    (payload as any)?.data?.result?.reason,
  ].map(formatErrorMessageValue).filter(Boolean);
  if (direct.length) return direct[0];
  const recursive = findErrorMessageValue(payload, 0);
  return recursive || '上游任务失败';
}

function findErrorMessageValue(value: unknown, depth: number): string {
  if (!value || depth > 6) return '';
  if (typeof value === 'string') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findErrorMessageValue(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, item] of entries) {
    if (/error|message|msg|reason|fail|reject|audit|moderation|policy|copyright|safety|blocked/i.test(key)) {
      const formatted = formatErrorMessageValue(item);
      if (formatted) return formatted;
    }
  }
  for (const [, item] of entries) {
    if (item && typeof item === 'object') {
      const found = findErrorMessageValue(item, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function formatErrorMessageValue(value: unknown): string {
  if (value === undefined || value === null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value).trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    if (/^(failed|failure|fail|error|cancelled|canceled)$/i.test(raw)) return '';
    return raw.length > 800 ? `${raw.slice(0, 800)}...` : raw;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const formatted = formatErrorMessageValue(item);
      if (formatted) return formatted;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  const message = formatErrorMessageValue(item.message ?? item.error_message ?? item.errorMessage ?? item.msg ?? item.reason ?? item.fail_reason ?? item.failed_reason ?? item.failure_reason ?? item.detail ?? item.description);
  const code = formatErrorMessageValue(item.code ?? item.error_code ?? item.errorCode ?? item.type);
  if (message && code && !message.includes(code)) return `${message}（${code}）`;
  if (message) return message;
  if (code) return code;
  return '';
}
