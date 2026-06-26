import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Prisma, type AiModel, type ModelType, type UpstreamProvider } from '@prisma/client';
import { HttpError, fail } from '../../../http.js';
import { config } from '../../../config.js';
import { uploadObjectStorageBuffer } from '../../../object-storage.js';
import { decryptSecret } from '../../../security.js';
import { buildEndpoint, callUpstreamGetJson, callUpstreamJson, callUpstreamMultipart, extractChatText, extractImageResult, extractUpstreamTaskId, extractVideoResultUrl, extractVideoTask } from '../../../upstream.js';
import { getUploadedFileFallbackUrl, getUploadedFileFallbackUrlAsync } from '../file-fallback-store.js';
import { normalizeMidjourneyPromptSyntax } from '../midjourney-prompt.js';

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

type ImageResponseType = 'object_storage' | 'server_object_storage' | 'server_async_object_storage' | 'server_base64_object_storage' | 'server_base64_async_object_storage' | 'provider_url' | 'base64';
type MidjourneySubmitKind = 'imagine' | 'describe' | 'blend' | 'action' | 'modal';

const MIDJOURNEY_SPECIAL_ENDPOINTS: Record<Exclude<MidjourneySubmitKind, 'imagine'>, string> = {
  describe: '/mj/submit/describe',
  blend: '/mj/submit/blend',
  action: '/mj/submit/action',
  modal: '/mj/submit/modal',
};
const AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH = '/v1/chat/completions';

const registry: Record<string, GenerationAdapter> = {
  'openai-image': { submit: submitOpenAiImage },
  'openai-generations': { submit: submitOpenAiImage },
  'openai-edits': { submit: submitOpenAiEdits, query: queryGenericImage },
  'openai-responses-image': { submit: submitOpenAiResponsesImage, query: queryOpenAiResponsesImage },
  'openai-chat-image': { submit: submitOpenAiChatImage, query: queryGenericImage },
  'openai-chat': { submit: submitOpenAiChat },
  'aiyunzhi-firefly-gpt-image': { submit: submitAiyunzhiFireflyGptImage },
  'aiyunzhi-gpt-image-2': { submit: submitAiyunzhiGptImage2, query: queryGenericImage },
  'grok_image': { submit: submitGrokUnifiedImage, query: queryGrokImage },
  'grok-image-unified': { submit: submitGrokUnifiedImage, query: queryGrokImage },
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
  'midjourney-imagine': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
  'midjourney': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
  'mj-imagine': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
  'sora-video': { submit: submitSoraVideo, query: queryGenericVideo },
  'sora-video-pro': { submit: submitSoraVideoPro, query: queryGenericVideo },
  'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },
  'seedance2': { submit: submitSeedance2Video, query: querySeedance2Video },
  'seedance2.0': { submit: submitSeedance2Video, query: querySeedance2Video },
  'seedance2-sd': { submit: submitSeedance2Video, query: querySeedance2Video },
  'sd-seedance2': { submit: submitSeedance2Video, query: querySeedance2Video },
  'sd-video': { submit: submitSeedance2Video, query: querySeedance2Video },
  'lingdong-sd-2-vip': { submit: submitLingdongSd2VipVideo, query: queryLingdongSd2VipVideo },
  'sd-2-vip': { submit: submitLingdongSd2VipVideo, query: queryLingdongSd2VipVideo },
  'zaomeng-seedance2': { submit: submitZaomengSeedance2Video, query: queryGenericVideo },
  'zaomeng-seedance2-svip': { submit: submitZaomengSeedance2Video, query: queryGenericVideo },
  'zaomeng-seedance2-fast': { submit: submitZaomengSeedance2Video, query: queryGenericVideo },
  'toapis-seedance2': { submit: submitToapisSeedance2Video, query: queryGenericVideo },
  'seedance-full': { submit: submitSeedanceFullVideo, query: querySeedanceFullVideo },
  'seedance2-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
  'seedance2.0-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
  'grok-video': { submit: submitGrokVideo, query: queryGenericVideo },
  'gemini-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
  'veo-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
  'fullblood-video': { submit: submitFullbloodVideo, query: queryFullbloodVideo },
  'notevideo': { submit: submitGenericVideo, query: queryGenericVideo },
  'seedance': { submit: submitGenericVideo, query: queryGenericVideo },
  'jimeng': { submit: submitGenericVideo, query: queryGenericVideo },
  'runninghub': { submit: submitGenericVideo, query: queryGenericVideo },
  'cli-proxy': { submit: submitCliProxy, query: queryGenericVideo },
  'veo-chat': { submit: submitVeoChatVideo },
  'veo-3.1': { submit: submitVeoChatVideo },
};

const GENERATED_IMAGE_DIR = path.join(os.tmpdir(), 'ai-admin-generated-images');
const CANVAS_LOCAL_ASSET_DIRS = uniqueResolvedPaths([
  process.env.CANVAS_LOCAL_ASSET_DIR,
  process.env.CANVAS_LOCAL_ASSET_ROOT,
  process.env.WORKBENCH_LOCAL_ASSET_DIR,
  process.env.WORKBENCH_LOCAL_ASSET_ROOT,
  path.resolve(process.cwd(), 'runninghub_outputs', 'image-studio-v3'),
  path.resolve(process.cwd(), '..', 'runninghub_outputs', 'image-studio-v3'),
  path.resolve(process.cwd(), '..', '..', 'runninghub_outputs', 'image-studio-v3'),
  path.resolve(process.cwd(), '..', '..', '..', 'runninghub_outputs', 'image-studio-v3'),
  '/var/www/ai-admin/runninghub_outputs/image-studio-v3',
  '/var/www/runninghub_outputs/image-studio-v3',
]);
const LOCAL_IMAGE_FILE_REF_PREFIX = 'local-image-file:';
const generatedResultObjectStorageCache = new Map<string, string>();
const remoteImageObjectStorageCache = new Map<string, string>();
const remoteMediaObjectStorageCache = new Map<string, string>();
const IMAGE_RESULT_MATERIALIZE_TIMEOUT_MS = 120000;
const MEDIA_RESULT_MATERIALIZE_TIMEOUT_MS = 300000;
const GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 160 * 1024 * 1024;
const MEDIA_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 800 * 1024 * 1024;
const OPENAI_RESPONSES_IMAGE_RETRY_DELAYS_MS = [3000, 8000];
const MIDJOURNEY_SUBMIT_MIN_INTERVAL_MS = Math.max(0, Number(process.env.MIDJOURNEY_SUBMIT_MIN_INTERVAL_MS || 8000));
const MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS = parseDelayMsList(process.env.MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS, [20000, 45000, 90000]);
let midjourneySubmitQueue: Promise<void> = Promise.resolve();
let midjourneyLastSubmitAt = 0;

function uniqueResolvedPaths(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const resolved = path.resolve(raw);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

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

function openAiImageGeometryOptions(params: Record<string, unknown>) {
  const aspectRatio = resolveOpenAiImageAspectRatio(params);
  return compactJson({
    size: resolveOpenAiImageSize(params, aspectRatio),
    aspect_ratio: aspectRatio,
  }) as Record<string, unknown>;
}

function resolveOpenAiImageSize(params: Record<string, unknown>, aspectRatio?: string) {
  const raw = String(firstDefined(params.requestedPixelSize, params.pixelSize, params.imageSize, params.size) || '').trim().toLowerCase().replace('×', 'x');
  if (raw === 'auto') return 'auto';
  if (/^\d{3,5}\s*x\s*\d{3,5}$/.test(raw)) return raw.replace(/\s+/g, '');
  return openAiImageSizeFromRatioResolution(aspectRatio || resolveOpenAiImageAspectRatio(params), resolveOpenAiImageResolution(params)) || '1024x1024';
}

function resolveOpenAiImageAspectRatio(params: Record<string, unknown>) {
  const raw = String(firstDefined(params.aspect_ratio, params.aspectRatio, params.requestedRatio, params.ratio, params.size) || '').trim().toLowerCase().replace('×', 'x');
  if (!raw || raw === 'auto') return undefined;
  if (/^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?$/.test(raw)) return raw.replace(/\s+/g, '');
  const ratio = ratioFromSize(raw);
  return ratio || undefined;
}

function resolveOpenAiImageResolution(params: Record<string, unknown>) {
  const raw = String(firstDefined(params.requestedResolution, params.resolution, params.imageSize, params.quality, params.size) || '').trim().toLowerCase().replace(/\s+/g, '');
  if (/^[1-4]k$/.test(raw)) return raw.toUpperCase();
  const match = raw.match(/(\d{3,5})[x×](\d{3,5})/i);
  if (match) {
    const longSide = Math.max(Number(match[1]), Number(match[2]));
    if (longSide >= 3500) return '4K';
    if (longSide >= 2500) return '3K';
    if (longSide >= 1500) return '2K';
  }
  return '1K';
}

function openAiImageSizeFromRatioResolution(aspectRatio: string | undefined, resolution: string) {
  const map: Record<string, Record<string, string>> = {
    '1K': { '1:1': '1024x1024', '3:2': '1152x768', '2:3': '768x1152', '4:3': '1024x768', '3:4': '768x1024', '5:4': '1280x1024', '4:5': '1024x1280', '16:9': '1280x720', '9:16': '720x1280', '2:1': '1152x576', '1:2': '576x1152', '21:9': '1568x672', '9:21': '672x1568', '3:1': '1536x512', '1:3': '512x1536' },
    '2K': { '1:1': '2048x2048', '3:2': '1920x1280', '2:3': '1280x1920', '4:3': '2048x1536', '3:4': '1536x2048', '5:4': '1920x1536', '4:5': '1536x1920', '16:9': '2048x1152', '9:16': '1152x2048', '2:1': '2048x1024', '1:2': '1024x2048', '21:9': '2240x960', '9:21': '960x2240', '3:1': '2560x853', '1:3': '853x2560' },
    '3K': { '1:1': '2560x2560', '3:2': '2880x1920', '2:3': '1920x2880', '4:3': '2560x1920', '3:4': '1920x2560', '5:4': '2560x2048', '4:5': '2048x2560', '16:9': '3072x1728', '9:16': '1728x3072', '2:1': '3072x1536', '1:2': '1536x3072', '21:9': '3136x1344', '9:21': '1344x3136' },
    '4K': { '1:1': '2880x2880', '3:2': '3456x2304', '2:3': '2304x3456', '4:3': '3200x2400', '3:4': '2400x3200', '5:4': '3200x2560', '4:5': '2560x3200', '16:9': '3840x2160', '9:16': '2160x3840', '2:1': '3840x1920', '1:2': '1920x3840', '21:9': '3808x1632', '9:21': '1632x3808', '3:1': '3840x1280', '1:3': '1280x3840' },
  };
  return map[resolution]?.[aspectRatio || ''] || map['1K'][aspectRatio || ''] || '';
}

async function submitOpenAiImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const responseFormat = openAiImageResponseFormat(ctx);
  const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt,
    ...openAiImageGeometryOptions(ctx.params),
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
    ...openAiImageGeometryOptions(ctx.params),
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
    ...openAiImageGeometryOptions(ctx.params),
    n: ctx.params.n || ctx.params.quantity || 1,
    ...openAiImageUpstreamOptions(ctx.params, { allowBackground }),
    response_format: responseFormat,
  }));
  const upstream = await callOpenAiImageJson(ctx, endpoint, requestJson);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitOpenAiResponsesImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const references = await collectOpenAiResponsesImageReferences(ctx);
  if (!references.length && generationModeRequiresImageReference(ctx)) {
    fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
  }
  const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
  const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
  if (!references.length) delete imageOptions.input_fidelity;
  delete imageOptions.user;
  const imageGeometry = openAiResponsesImageGeometryOptions(ctx);
  const tool = compactJson({
    type: 'image_generation',
    model: ctx.model.name,
    ...imageGeometry,
    ...imageOptions,
  });
  const content = [
    { type: 'input_text', text: promptText },
    ...references.map(ref => openAiResponsesInputImageContent(ref)),
  ];
  const requestJson = shouldUseDirectOpenAiResponsesImageModel(ctx)
    ? compactJson({
      model: ctx.model.name,
      input: references.length ? [{ role: 'user', content }] : promptText,
      ...imageGeometry,
      ...imageOptions,
      response_format: openAiImageResponseFormat(ctx),
      stream: false,
    })
    : compactJson({
      model: resolveOpenAiResponsesImageMainModel(ctx),
      input: [{ role: 'user', content }],
      tools: [tool],
      tool_choice: { type: 'image_generation' },
      stream: false,
    });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/responses', ctx);
  const upstream = await callOpenAiResponsesImageJson(ctx, endpoint, requestJson);
  return normalizeOpenAiResponsesImageSubmit(ctx, upstream, requestJson);
}

function openAiResponsesImageGeometryOptions(ctx: AdapterContext) {
  const geometry = openAiImageGeometryOptions(ctx.params);
  const size = String(geometry.size || ctx.params.size || ctx.params.imageSize || '1024x1024').trim() || '1024x1024';
  return compactJson({ size }) as Record<string, unknown>;
}

async function queryOpenAiResponsesImage(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  return {
    status: 'FAILED',
    progress: 100,
    upstreamTaskId: ctx.upstreamTaskId,
    upstreamRequestId: ctx.upstreamTaskId,
    responseJson: { upstreamTaskId: ctx.upstreamTaskId } as Prisma.InputJsonValue,
    resultJson: { url: '', outputs: [] } as Prisma.InputJsonValue,
    resultUrls: [],
    errorCode: 'OPENAI_RESPONSES_IMAGE_RESULT_MISSING',
    errorMessage: 'openai-responses-image 是同步生图适配器，提交阶段未拿到图片结果；已停止错误轮询 /image/status。请检查上游是否返回 image_generation_call/result 或图片 URL。',
  };
}

function shouldUseDirectOpenAiResponsesImageModel(ctx: AdapterContext) {
  const hint = [
    ctx.model.name,
    ctx.model.modelKey,
    ctx.model.displayName,
    ctx.provider.defaultModel,
    ctx.params.model,
    ctx.params.modelNick,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
  return /\bnano[-_ ]?banana(?:[-_ ]?pro)?\b/.test(hint);
}

async function normalizeOpenAiResponsesImageSubmit(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const normalized = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (normalized.status !== 'RUNNING') return normalized;
  return {
    ...normalized,
    status: 'FAILED',
    progress: 100,
    upstreamTaskId: undefined,
    resultJson: { url: '', outputs: [] } as Prisma.InputJsonValue,
    resultUrls: [],
    errorCode: 'OPENAI_RESPONSES_IMAGE_RESULT_MISSING',
    errorMessage: openAiResponsesImageMissingResultMessage(upstream),
  };
}

function openAiResponsesImageMissingResultMessage(upstream: unknown) {
  const message = extractErrorMessage(upstream);
  if (message && message !== '上游任务失败') return message;
  const outputTypes = Array.isArray((upstream as any)?.output)
    ? (upstream as any).output.map((item: any) => String(item?.type || item?.role || '').trim()).filter(Boolean).join(', ')
    : '';
  const suffix = outputTypes ? `；上游 output 类型：${outputTypes}` : '';
  return `openai-responses-image 上游响应未包含 image_generation_call/result、图片 URL 或 b64_json${suffix}。如果返回的是 message 文本，说明该渠道没有执行图片生成。`;
}

async function callOpenAiResponsesImageJson(ctx: AdapterContext, endpoint: string, requestJson: Prisma.InputJsonValue) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= OPENAI_RESPONSES_IMAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt >= OPENAI_RESPONSES_IMAGE_RETRY_DELAYS_MS.length || !shouldRetryOpenAiResponsesImageError(err)) throw err;
      const delayMs = OPENAI_RESPONSES_IMAGE_RETRY_DELAYS_MS[attempt] || 0;
      console.warn(`[generation openai-responses-image] transient upstream error, retry ${attempt + 1}/${OPENAI_RESPONSES_IMAGE_RETRY_DELAYS_MS.length} after ${delayMs}ms: ${formatOpenAiResponsesImageRetryError(err)}`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function shouldRetryOpenAiResponsesImageError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  if (/chatgpt service unavailable|service unavailable|temporarily unavailable|bad gateway|gateway timeout|upstream request timeout|timeout|socket hang up|connection reset|stream disconnected|premature close/i.test(message)) return true;
  if (err instanceof HttpError) {
    const upstreamStatus = Number((err as HttpError & { upstreamStatus?: number }).upstreamStatus || 0);
    return err.status >= 500 || [502, 503, 504].includes(upstreamStatus);
  }
  return false;
}

function formatOpenAiResponsesImageRetryError(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err || 'unknown error');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseDelayMsList(value: unknown, fallback: number[]) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const parsed = raw.split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item) && item >= 0);
  return parsed.length ? parsed : fallback;
}

async function withMidjourneySubmitSlot<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const previous = midjourneySubmitQueue.catch(() => undefined);
  midjourneySubmitQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    const waitMs = Math.max(0, midjourneyLastSubmitAt + MIDJOURNEY_SUBMIT_MIN_INTERVAL_MS - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    midjourneyLastSubmitAt = Date.now();
    return await fn();
  } finally {
    release();
  }
}

async function callMidjourneySubmitJson(ctx: AdapterContext, endpoint: string, requestJson: Prisma.InputJsonValue, label: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const upstream = await withMidjourneySubmitSlot(label, () => callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs));
      if (!midjourneySubmitRejected(upstream)) return upstream;
      if (attempt >= MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS.length || !isMidjourneySubmitRetryablePayload(upstream)) return upstream;
      const delayMs = MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS[attempt] || 0;
      console.warn(`[generation midjourney] submit rejected, retry ${attempt + 1}/${MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS.length} after ${delayMs}ms (${label}): ${extractErrorMessage(upstream) || 'unknown rejection'}`);
      await sleep(delayMs);
    } catch (err) {
      lastError = err;
      if (attempt >= MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS.length || !isMidjourneySubmitRetryableError(err)) throw err;
      const delayMs = MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS[attempt] || 0;
      console.warn(`[generation midjourney] transient submit error, retry ${attempt + 1}/${MIDJOURNEY_SUBMIT_RETRY_DELAYS_MS.length} after ${delayMs}ms (${label}): ${formatMidjourneySubmitRetryError(err)}`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function isMidjourneySubmitRetryablePayload(payload: unknown) {
  const parts = [
    extractErrorMessage(payload),
    (payload as any)?.description,
    (payload as any)?.data?.description,
    (payload as any)?.code,
    (payload as any)?.data?.code,
  ].map(item => String(item || '').trim()).filter(Boolean);
  return isMidjourneySubmitRetryableMessage(parts.join(' '));
}

function isMidjourneySubmitRetryableError(err: unknown) {
  if (err instanceof HttpError) {
    const upstreamStatus = Number((err as HttpError & { upstreamStatus?: number }).upstreamStatus || 0);
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(upstreamStatus) || err.status >= 500) return true;
    if (isMidjourneySubmitRetryablePayload((err as HttpError & { responseJson?: unknown }).responseJson)) return true;
  }
  return isMidjourneySubmitRetryableMessage(formatMidjourneySubmitRetryError(err));
}

function isMidjourneySubmitRetryableMessage(message: string) {
  return /请求过于频繁|过于频繁|稍后再试|请稍后|too many requests|too frequent|rate limit|rate_limit|429|temporarily unavailable|busy|capacity|timeout|timed out|socket hang up|connection reset|econnreset|upstream_network_error|network request failed|fetch failed|bad gateway|gateway timeout|service unavailable/i.test(String(message || ''));
}

function formatMidjourneySubmitRetryError(err: unknown) {
  const responseMessage = extractErrorMessage((err as { responseJson?: unknown })?.responseJson);
  const message = err instanceof Error ? err.message : String(err || 'unknown error');
  return [message, responseMessage].filter(Boolean).join(' | ');
}

async function submitOpenAiChatImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const references = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
  if (!references.length && generationModeRequiresImageReference(ctx)) {
    fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
  }
  const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
  const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
  if (!references.length) delete imageOptions.input_fidelity;
  delete imageOptions.user;
  if (!imageOptions.output_format) imageOptions.output_format = 'png';
  const tool = compactJson({
    type: 'image_generation',
    model: resolveOpenAiChatImageToolModel(ctx),
    size: normalizeOpenAiChatImageToolSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio),
    ...imageOptions,
  });
  const content = [
    { type: 'text', text: promptText || ctx.prompt || 'Generate image' },
    ...references.map(url => ({ type: 'image_url', image_url: { url } })),
  ];
  const requestJson = compactJson({
    model: resolveOpenAiChatImageMainModel(ctx),
    messages: [{ role: 'user', content }],
    tools: [tool],
    tool_choice: { type: 'image_generation' },
    stream: false,
    reasoning_effort: ctx.params.reasoning_effort || ctx.params.reasoningEffort,
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/chat/completions', ctx);
  try {
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (!shouldFallbackOpenAiChatImageResult(result)) return result;
    return submitOpenAiChatImageViaImagesEndpoint(ctx, references);
  } catch (err) {
    if (!shouldFallbackOpenAiChatImageError(err)) throw err;
    return submitOpenAiChatImageViaImagesEndpoint(ctx, references);
  }
}

async function submitOpenAiChatImageViaImagesEndpoint(ctx: AdapterContext, references: string[]): Promise<AdapterSubmitResult> {
  const requestJson = buildOpenAiChatImageImagesRequest(ctx, references);
  const endpoint = resolveEndpointPath(resolveOpenAiChatImageImagesEndpoint(ctx), ctx);
  try {
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  } catch (err) {
    const running = submitRunningImageTaskFromTransientError(err, requestJson);
    if (running) return running;
    if (!shouldRetryOpenAiImageWithUrlResult(err, requestJson)) throw err;
    const requestBody = isRecord(requestJson) ? requestJson as Record<string, unknown> : {};
    const fallbackJson = compactJson({
      ...requestBody,
      response_format: 'url',
    });
    const upstream = await callUpstreamJson(ctx.provider, endpoint, fallbackJson, ctx.timeoutMs);
    return normalizeImageSubmit(ctx.provider, upstream, fallbackJson, resolveImageResponseType(ctx));
  }
}

function buildOpenAiChatImageImagesRequest(ctx: AdapterContext, references: string[]) {
  const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
  const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
  if (!references.length) delete imageOptions.input_fidelity;
  return withOpenAiImageRequestOptions(ctx, compactJson({
    model: resolveOpenAiChatImageToolModel(ctx),
    prompt: promptText || ctx.prompt || 'Generate image',
    ...(references.length ? { image: references } : {}),
    mask: ctx.params.mask,
    size: normalizeOpenAiChatImageToolSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio),
    n: ctx.params.n || ctx.params.quantity || 1,
    ...imageOptions,
    response_format: openAiImageResponseFormat(ctx),
  }));
}

function resolveOpenAiChatImageImagesEndpoint(ctx: AdapterContext) {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const explicit = String(firstDefined(
    ctx.params.imageEndpointPath,
    ctx.params.image_endpoint_path,
    ctx.params.imagesEndpointPath,
    ctx.params.images_endpoint_path,
    ctx.params.fallbackEndpointPath,
    ctx.params.fallback_endpoint_path,
    protocol.imageEndpointPath,
    protocol.image_endpoint_path,
    protocol.imagesEndpointPath,
    protocol.images_endpoint_path,
    protocol.fallbackEndpointPath,
    protocol.fallback_endpoint_path,
    modelProtocol.imageEndpointPath,
    modelProtocol.image_endpoint_path,
    modelProtocol.imagesEndpointPath,
    modelProtocol.images_endpoint_path,
    modelProtocol.fallbackEndpointPath,
    modelProtocol.fallback_endpoint_path,
    defaults.imageEndpointPath,
    defaults.image_endpoint_path,
    defaults.imagesEndpointPath,
    defaults.images_endpoint_path,
    defaults.fallbackEndpointPath,
    defaults.fallback_endpoint_path,
    providerDefaults.imageEndpointPath,
    providerDefaults.image_endpoint_path,
    providerDefaults.imagesEndpointPath,
    providerDefaults.images_endpoint_path,
    providerDefaults.fallbackEndpointPath,
    providerDefaults.fallback_endpoint_path,
  ) || '').trim();
  if (explicit) return explicit;
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (/\/images\//i.test(configured)) return configured;
  return '/v1/images/edits';
}

function shouldFallbackOpenAiChatImageResult(result: AdapterSubmitResult) {
  if (result.status === 'SUCCESS' || result.status === 'RUNNING') return false;
  const reason = `${result.errorCode || ''} ${result.errorMessage || ''}`;
  return /IMAGE_RESULT_MISSING|chatgpt service unavailable|auth_unavailable|image_generation|tool_choice|\btools?\b|chat\/completions|no image result/i.test(reason);
}

function shouldFallbackOpenAiChatImageError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  if (/chatgpt service unavailable|auth_unavailable|no auth available/i.test(message)) return true;
  if (/image_generation|tool_choice|\btools?\b|unsupported|not supported|unknown field|chat\/completions/i.test(message)) return true;
  if (err instanceof HttpError) {
    if (err.status >= 500 && /service unavailable|temporarily unavailable|bad gateway|gateway timeout|upstream request timeout|timeout/i.test(message)) return true;
    if (err.status === 400 && /invalid.*(?:tool|tools|tool_choice)|unsupported|not supported|unknown field/i.test(message)) return true;
  }
  return false;
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

async function submitAiyunzhiFireflyGptImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const references = await buildAiyunzhiFireflyImageContent(ctx);
  if (!references.length && generationModeRequiresImageReference(ctx)) {
    fail(400, 'Firefly GPT Image 图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'AIYUNZHI_FIREFLY_REFERENCE_REQUIRED');
  }
  const requestJson = compactJson({
    model: resolveAiyunzhiFireflyModelName(ctx),
    stream: resolveImageUpstreamStream(ctx) ?? true,
    messages: [{
      role: 'user',
      content: [
        ...references,
        { type: 'text', text: ctx.prompt || 'Generate image' },
      ],
    }],
  });
  const endpoint = resolveEndpointPath(resolveAiyunzhiFireflyEndpointPath(ctx), ctx);
  const upstream = await callAiyunzhiFireflyJson(ctx, endpoint, requestJson);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

function resolveAiyunzhiFireflyEndpointPath(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.endpointPath,
    ctx.params.endpoint_path,
    protocol.endpointPath,
    protocol.endpoint_path,
    ctx.model.endpointPath,
    ctx.provider.endpointPath,
    providerDefaults.endpointPath,
    providerDefaults.endpoint_path,
  ) || '').trim();
  if (!configured) return AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH;
  if (/\/(?:v1\/)?images\/(?:generations|edits)(?:[?#].*)?$/i.test(configured)) return AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH;
  if (/\/v1\/chat\/completions(?:[?#].*)?$/i.test(configured)) return configured;
  if (/\/chat\/completions(?:[?#].*)?$/i.test(configured) && /aiyunzhi\.top/i.test(String(ctx.provider.baseUrl || configured))) {
    return AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH;
  }
  return configured;
}

async function buildAiyunzhiFireflyImageContent(ctx: AdapterContext) {
  const groups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  if (groups.length > 6) fail(400, `当前模型最多支持 6 张参考图，当前 ${groups.length} 张`, 'AIYUNZHI_FIREFLY_TOO_MANY_REFERENCES');
  const content: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  for (const group of groups) {
    const directUrl = resolveAiyunzhiFireflyDirectReferenceUrl(group);
    if (directUrl) {
      content.push({ type: 'image_url', image_url: { url: directUrl } });
      continue;
    }
    const file = await imageRefCandidatesToBlob(group, ctx.timeoutMs, (ref, timeoutMs) => compatibleImageRefToBlob(ref, timeoutMs, 'Firefly GPT Image'));
    const dataUrl = await imageBlobToDataUrl(file.blob);
    if (dataUrl) content.push({ type: 'image_url', image_url: { url: dataUrl } });
  }
  return content;
}

function resolveAiyunzhiFireflyDirectReferenceUrl(refs: string[]) {
  for (const ref of refs || []) {
    const raw = String(ref || '').trim();
    if (!raw) continue;
    if (/^data:image\//i.test(raw)) return raw;
    if (isPublicHttpUrl(raw)) return normalizeAiyunzhiFireflyImageUrl(raw);
  }
  return '';
}

async function imageBlobToDataUrl(blob: Blob) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (!bytes.length) return '';
  const mime = normalizeImageMime(blob.type || 'image/png');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function resolveAiyunzhiFireflyModelName(ctx: AdapterContext) {
  const base = fireflyGptImageBaseModel(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || 'firefly-gpt-image');
  if (aiyunzhiFireflyModelNameMode(ctx) === 'literal') return base;
  const resolution = resolveOpenAiImageResolution(ctx.params).toLowerCase();
  const aspectRatio = resolveOpenAiImageAspectRatio(ctx.params) || '1:1';
  return `${base}-${resolution}-${aspectRatio.replace(':', 'x')}`;
}

function aiyunzhiFireflyModelNameMode(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const modelAssembly = isRecord(ctx.model.modelAssembly) ? ctx.model.modelAssembly : {};
  const raw = String(firstDefined(
    ctx.params.modelNameMode,
    ctx.params.model_name_mode,
    protocol.modelNameMode,
    protocol.model_name_mode,
    modelAssembly.type,
  ) || '').trim().toLowerCase();
  if (['literal', 'base', 'passthrough', 'pass-through', 'none'].includes(raw)) return 'literal';
  return 'template';
}

function fireflyGptImageBaseModel(value: unknown) {
  const raw = String(value || 'firefly-gpt-image').trim() || 'firefly-gpt-image';
  return raw.replace(/-(?:1|2|4)k-\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:-(?:1|2|4)k)*$/i, '') || 'firefly-gpt-image';
}

async function submitAiyunzhiGptImage2(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const refGroups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  if (refGroups.length > 3) fail(400, `Aiyunzhi GPT Image 2 最多支持 3 张参考图，当前 ${refGroups.length} 张`, 'AIYUNZHI_GPT_IMAGE2_TOO_MANY_REFERENCES');
  if (!refGroups.length && generationModeRequiresImageReference(ctx)) {
    fail(400, 'Aiyunzhi GPT Image 2 图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'AIYUNZHI_GPT_IMAGE2_REFERENCE_REQUIRED');
  }
  const size = resolveAiyunzhiGptImage2Size(ctx);
  const n = resolveAiyunzhiGptImage2Count(ctx);
  const imageModel = resolveAiyunzhiGptImage2ModelName(ctx);
  const responseType = resolveAiyunzhiGptImage2ResponseType(ctx);
  const responseFormat = resolveAiyunzhiGptImage2ResponseFormat(ctx);
  const requestJson = compactJson({
    model: imageModel,
    prompt: ctx.prompt,
    size,
    n,
    response_format: responseFormat,
  });
  if (!refGroups.length) {
    const upstream = normalizeAiyunzhiGptImage2Response(await callUpstreamJson(ctx.provider, resolveEndpointPath(resolveAiyunzhiGptImage2Endpoint(ctx, 'generation'), ctx), requestJson, ctx.timeoutMs));
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, responseType);
  }

  const form = new FormData();
  form.set('model', imageModel);
  form.set('prompt', ctx.prompt);
  form.set('size', size);
  form.set('n', String(n));
  form.set('response_format', responseFormat);
  for (let i = 0; i < refGroups.length; i += 1) {
    const file = await imageRefCandidatesToBlob(refGroups[i], ctx.timeoutMs, (ref, timeoutMs) => compatibleImageRefToBlob(ref, timeoutMs, 'Aiyunzhi GPT Image 2 图生图'));
    form.append(refGroups.length === 1 ? 'image' : 'image[]', file.blob, file.filename);
  }
  const requestPreview = compactJson({
    ...(requestJson as Record<string, unknown>),
    image_count: refGroups.length,
    images: refGroups.map(group => group.map((ref, index) => redactLargeInlineRef(ref, index))),
  });
  const upstream = normalizeAiyunzhiGptImage2Response(await callUpstreamMultipart(ctx.provider, resolveEndpointPath(resolveAiyunzhiGptImage2Endpoint(ctx, 'edit'), ctx), form, ctx.timeoutMs));
  return normalizeImageSubmit(ctx.provider, upstream, requestPreview, responseType);
}

function resolveAiyunzhiGptImage2ModelName(ctx: AdapterContext) {
  const raw = String(firstDefined(
    ctx.params.model,
    ctx.params.imageModel,
    ctx.params.image_model,
    ctx.model.name,
    ctx.model.displayName,
    ctx.provider.defaultModel,
    'gpt-image-2',
  ) || '').trim();
  return normalizeGptImageV2BaseModel(raw) || 'gpt-image-2';
}

function normalizeAiyunzhiGptImage2Response(payload: unknown) {
  const image = extractAiyunzhiGptImage2ImageResult(payload);
  if (!image) return payload;
  return compactJson({
    data: [image],
    rawResponse: payload,
  });
}

function extractAiyunzhiGptImage2ImageResult(payload: unknown, depth = 0): null | { url?: string; b64_json?: string; mime_type?: string; mimeType?: string } {
  if (payload == null || depth > 8) return null;
  if (typeof payload === 'string') {
    const raw = payload.trim();
    if (!raw) return null;
    if (/^data:image\//i.test(raw)) return { url: raw, mime_type: inferImageMimeType(raw) };
    if (/^[A-Za-z0-9+/=\s]{800,}$/.test(raw) && /^(?:iVBOR|\/9j\/|UklGR|R0lGOD)/.test(raw.replace(/\s+/g, ''))) return { b64_json: raw, mime_type: 'image/png' };
    const jsonLike = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
    if (jsonLike) {
      try {
        return extractAiyunzhiGptImage2ImageResult(JSON.parse(jsonLike), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractAiyunzhiGptImage2ImageResult(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(payload)) return null;
  const url = firstStringValue(payload, ['url', 'image_url', 'imageUrl', 'output_url', 'outputUrl', 'result_url', 'resultUrl', 'assetPreviewUrl', 'previewUrl']);
  if (url) return { url, mime_type: inferImageMimeType(url) };
  const b64 = firstStringValue(payload, ['b64_json', 'b64', 'base64', 'image_base64', 'imageBase64', 'imageData', 'image_data', 'data']);
  const mimeType = firstStringValue(payload, ['mime_type', 'mimeType', 'contentType', 'content_type']) || 'image/png';
  if (b64 && (/^data:image\//i.test(b64) || /^[A-Za-z0-9+/=\s]{800,}$/.test(b64))) {
    return /^data:image\//i.test(b64)
      ? { url: b64, mime_type: inferImageMimeType(b64) }
      : { b64_json: b64, mime_type: normalizeImageMime(mimeType) };
  }
  const candidates = [
    payload.data,
    payload.output,
    payload.outputs,
    payload.result,
    payload.results,
    payload.image,
    payload.images,
    payload.response,
    isRecord(payload.message) ? payload.message.content : undefined,
    isRecord(payload.delta) ? payload.delta.content : undefined,
    isRecord(payload.choices) ? undefined : payload.choices,
  ];
  for (const candidate of candidates) {
    const found = extractAiyunzhiGptImage2ImageResult(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}

function firstStringValue(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function resolveAiyunzhiGptImage2Size(ctx: AdapterContext) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const raw = firstDefined(
    ctx.params.imageSize,
    ctx.params.requestedResolution,
    ctx.params.resolution,
    defaults.imageSize,
    defaults.resolution,
    ctx.params.size,
    defaults.size,
    providerDefaults.size,
    providerDefaults.imageSize,
    providerDefaults.resolution,
  );
  const resolution = normalizeGptImageV2Resolution(raw);
  if (!['1K', '2K', '4K'].includes(resolution)) {
    fail(400, `Aiyunzhi GPT Image 2 只支持 size=1k、2k、4k，当前为 ${String(raw || resolution || '').trim() || '空'}`, 'AIYUNZHI_GPT_IMAGE2_SIZE_UNSUPPORTED');
  }
  return resolution.toLowerCase();
}

function resolveAiyunzhiGptImage2Count(ctx: AdapterContext) {
  const raw = ctx.params.n ?? ctx.params.quantity ?? 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.floor(value));
}

function resolveAiyunzhiGptImage2ResponseFormat(ctx: AdapterContext) {
  const explicit = String(ctx.params.response_format || ctx.params.responseFormat || '').trim().toLowerCase();
  if (explicit === 'b64_json' || explicit === 'url') return explicit;
  const responseType = resolveAiyunzhiGptImage2ResponseType(ctx);
  if (responseType === 'base64' || responseType === 'server_base64_object_storage' || responseType === 'server_base64_async_object_storage') return 'b64_json';
  return 'url';
}

function resolveAiyunzhiGptImage2ResponseType(ctx: AdapterContext): ImageResponseType {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  return normalizeImageResponseTypeValue(firstDefined(
    modelProtocol.response_type,
    defaults.response_type,
    providerDefaults.response_type,
    ctx.params.response_type,
    protocol.response_type,
    modelProtocol.responseType,
    defaults.responseType,
    providerDefaults.responseType,
    ctx.params.responseType,
    protocol.responseType,
  )) || resolveImageResponseType(ctx);
}

function resolveAiyunzhiGptImage2Endpoint(ctx: AdapterContext, kind: 'generation' | 'edit') {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const explicit = String(firstDefined(
    kind === 'generation' ? ctx.params.generationEndpointPath : ctx.params.editEndpointPath,
    kind === 'generation' ? ctx.params.generation_endpoint_path : ctx.params.edit_endpoint_path,
    kind === 'generation' ? protocol.generationEndpointPath : protocol.editEndpointPath,
    kind === 'generation' ? protocol.generation_endpoint_path : protocol.edit_endpoint_path,
    kind === 'generation' ? modelProtocol.generationEndpointPath : modelProtocol.editEndpointPath,
    kind === 'generation' ? modelProtocol.generation_endpoint_path : modelProtocol.edit_endpoint_path,
    kind === 'generation' ? defaults.generationEndpointPath : defaults.editEndpointPath,
    kind === 'generation' ? defaults.generation_endpoint_path : defaults.edit_endpoint_path,
    kind === 'generation' ? providerDefaults.generationEndpointPath : providerDefaults.editEndpointPath,
    kind === 'generation' ? providerDefaults.generation_endpoint_path : providerDefaults.edit_endpoint_path,
  ) || '').trim();
  if (explicit) return explicit;
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (kind === 'generation' && /\/images\/generations(?:$|[?#])/i.test(configured)) return configured;
  if (kind === 'edit' && /\/images\/edits(?:$|[?#])/i.test(configured)) return configured;
  return kind === 'generation' ? '/v1/images/generations' : '/v1/images/edits';
}

async function callAiyunzhiFireflyJson(ctx: AdapterContext, endpointPath: string, requestJson: Prisma.InputJsonValue) {
  const apiKey = decryptSecret(ctx.provider.apiKeyEncrypted || '');
  if (!apiKey) fail(400, '上游 API Key 未配置', 'PROVIDER_KEY_MISSING');
  const url = buildEndpoint(ctx.provider.baseUrl, endpointPath);
  const useTimeout = Number.isFinite(ctx.timeoutMs) && ctx.timeoutMs > 0;
  const controller = useTimeout ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ctx.timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream, */*',
      },
      body: JSON.stringify(requestJson || {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const rawText = await resp.text();
    const upstream = normalizeAiyunzhiFireflyResponse(rawText);
    if (!resp.ok) {
      const message = extractErrorMessage(upstream) || `Firefly GPT Image 上游请求失败 HTTP ${resp.status}`;
      fail(resp.status >= 500 ? 502 : 400, message, 'UPSTREAM_ERROR');
    }
    return upstream;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') fail(504, `Firefly GPT Image 上游请求超时（${ctx.timeoutMs}ms）`, 'UPSTREAM_TIMEOUT');
    const message = err instanceof Error ? err.message : String(err || '未知网络错误');
    fail(502, `Firefly GPT Image 上游网络请求失败：${message}`, 'UPSTREAM_NETWORK_ERROR');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeAiyunzhiFireflyResponse(rawText: string) {
  const text = String(rawText || '').trim();
  if (!text) return { errorMessage: 'Firefly GPT Image 返回为空' };
  try {
    const payload = JSON.parse(text);
    const imageUrl = extractAiyunzhiFireflyImageUrlFromText(JSON.stringify(payload));
    if (imageUrl) return { data: [{ url: imageUrl }], rawResponse: payload };
    return payload;
  } catch {
    // Fall through to Server-Sent Events/plain-text parsing.
  }
  const chunks: string[] = [];
  const contentParts: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let raw = line.trim();
    if (!raw) continue;
    if (raw.startsWith('data:')) raw = raw.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const item = JSON.parse(raw);
      chunks.push(JSON.stringify(item));
      collectAiyunzhiFireflyContentParts(item, contentParts);
    } catch {
      chunks.push(raw);
      contentParts.push(raw);
    }
  }
  const imageUrl = extractAiyunzhiFireflyImageUrlFromText(contentParts.join(''))
    || extractAiyunzhiFireflyImageUrlFromText(chunks.join('\n'))
    || extractAiyunzhiFireflyImageUrlFromText(text);
  if (imageUrl) return { data: [{ url: imageUrl }], rawResponse: { streamText: text } };
  return { errorMessage: `Firefly GPT Image 返回中未找到图片 URL：${text.slice(0, 500)}`, rawResponse: { streamText: text } };
}

function collectAiyunzhiFireflyContentParts(value: unknown, parts: string[]) {
  if (!value) return;
  if (typeof value === 'string') {
    parts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectAiyunzhiFireflyContentParts(item, parts));
    return;
  }
  if (typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  [
    item.content,
    item.text,
    item.delta,
    item.message,
    item.output,
    item.result,
  ].forEach(child => collectAiyunzhiFireflyContentParts(child, parts));
  if (Array.isArray(item.choices)) item.choices.forEach(choice => collectAiyunzhiFireflyContentParts(choice, parts));
}

function extractAiyunzhiFireflyImageUrlFromText(value: unknown) {
  const source = String(value || '');
  const markdown = source.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (markdown?.[1]) return normalizeAiyunzhiFireflyImageUrl(markdown[1]);
  const matches = source.match(/https?:\/\/[^\s"'<>),]+/gi) || [];
  const urls = matches.map(normalizeAiyunzhiFireflyImageUrl).filter(Boolean);
  const imageUrl = urls.find(isAiyunzhiFireflyPresignedImageUrl)
    || urls.find(url => /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url));
  return (imageUrl || urls[0] || '').trim();
}

function normalizeAiyunzhiFireflyImageUrl(value: unknown) {
  const raw = decodeUrlEntityEscapes(value).replace(/[.;，。]+$/g, '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}

function isAiyunzhiFireflyPresignedImageUrl(value: unknown) {
  const raw = decodeUrlEntityEscapes(value);
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return /pre-signed-firefly-prod\.s3-accelerate\.amazonaws\.com$/i.test(url.hostname)
      && /^\/images\//i.test(url.pathname)
      && /(?:^|&)x-amz-(?:algorithm|credential|signature)=/i.test(url.search.slice(1));
  } catch {
    return false;
  }
}

function decodeUrlEntityEscapes(value: unknown) {
  // FIREFLY_URL_ENTITY_DECODE_ADAPTER: Firefly S3 signatures may arrive with HTML-escaped ampersands.
  let out = String(value || '').trim();
  for (let i = 0; i < 4; i += 1) {
    const next = out
      .replace(/&amp;/gi, '&')
      .replace(/&#0*38;/gi, '&')
      .replace(/&#x0*26;/gi, '&')
      .replace(/\\u0026/gi, '&');
    if (next === out) break;
    out = next;
  }
  return out;
}

async function submitGrokImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const geometry = resolveGrokImageRequestGeometry(ctx);
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: normalizeGrokImageCount(ctx.params.n || ctx.params.quantity),
    size: geometry.size,
    aspect_ratio: geometry.aspectRatio,
    resolution: geometry.resolution,
    stream: false,
    response_format: 'url',
    ...withoutKeys(ctx.params, [
      'model', 'prompt', 'image', 'images', 'input_image', 'reference_images', 'referenceImages',
      'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
      'resolution', 'requestedResolution', 'n', 'quantity', 'stream',
    ]),
  });
  const endpoint = resolveEndpointPath(resolveGrokImageEndpoint(ctx, 'generation'), ctx);
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

async function submitGrokUnifiedImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const refGroups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  const requiresReference = generationModeRequiresImageReference(ctx);
  if (refGroups.length) return submitGrokImageEdit(ctx);
  if (requiresReference) {
    fail(400, 'Grok 图生图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'GROK_IMAGE_REFERENCE_REQUIRED');
  }
  return submitGrokImage(ctx);
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
  const failed = isFinalFailedTaskStatus(upstream, statusText, ctx.upstreamTaskId);
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
  const refGroups = (await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true })).slice(-3);
  if (!refGroups.length) fail(400, 'Grok 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_REQUIRED');
  const geometry = resolveGrokImageRequestGeometry(ctx);
  const form = new FormData();
  form.set('model', ctx.model.name || 'grok-imagine-image');
  form.set('prompt', ctx.prompt);
  form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
  form.set('size', geometry.size);
  form.set('aspect_ratio', geometry.aspectRatio);
  form.set('resolution', geometry.resolution);
  form.set('response_format', 'url');
  for (let i = 0; i < refGroups.length; i += 1) {
    const file = await imageRefCandidatesToBlob(refGroups[i], ctx.timeoutMs, grokImageRefToBlob);
    form.append('image', file.blob, file.filename);
  }
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: ctx.params.n || ctx.params.quantity || 1,
    size: geometry.size,
    aspect_ratio: geometry.aspectRatio,
    resolution: geometry.resolution,
    response_format: 'url',
    image_count: refGroups.length,
    images: refGroups.map(group => group.map((ref, index) => redactLargeInlineRef(ref, index))),
  });
  const endpoint = resolveEndpointPath(resolveGrokImageEndpoint(ctx, 'edit'), ctx);
  const upstream = await callUpstreamMultipart(ctx.provider, endpoint, form, ctx.timeoutMs);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

async function submitGptImageV2(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
  const resolution = normalizeGptImageV2Resolution(ctx.params.resolution || ctx.params.requestedResolution || ctx.params.imageSize || defaults.resolution || defaults.imageSize);
  const requestModel = resolveGptImageV2ModelName(ctx.params.model || ctx.model.name, resolution);
  const referenceImages = await buildGptImageV2ReferenceImages(ctx);
  if (generationModeRequiresImageReference(ctx) && !referenceImages.length) {
    fail(400, 'GPT-Image2 图生图/修图/全景任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'GPT_IMAGE_V2_REFERENCE_REQUIRED');
  }
  const requestJson = compactJson({
    model: requestModel,
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
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(resolveGptImageV2Endpoint(ctx), ctx), requestJson, ctx.timeoutMs);
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
  const refGroups = (await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true })).slice(-4);
  if (!refGroups.length) fail(400, 'Gemini 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GEMINI_IMAGE_REFERENCE_REQUIRED');
  const size = normalizeGeminiUnifiedImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
  const responseFormat = String(ctx.params.response_format || ctx.params.responseFormat || 'b64_json');
  const form = new FormData();
  form.set('model', ctx.model.name || 'gemini-3.1-flash-image-preview');
  form.set('prompt', ctx.prompt);
  form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
  form.set('size', size);
  form.set('response_format', responseFormat);
  for (let i = 0; i < refGroups.length; i += 1) {
    const file = await imageRefCandidatesToBlob(refGroups[i], ctx.timeoutMs, (ref, timeoutMs) => compatibleImageRefToBlob(ref, timeoutMs, 'Gemini 图生图'));
    form.append('image', file.blob, file.filename);
  }
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    n: ctx.params.n || ctx.params.quantity || 1,
    size,
    response_format: responseFormat,
    image_count: refGroups.length,
    images: refGroups.map(group => group.map((ref, index) => redactLargeInlineRef(ref, index))),
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

async function submitMidjourneyImagine(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const submitKind = normalizeMidjourneySubmitKind(ctx);
  if (submitKind !== 'imagine') return submitMidjourneySpecialTask(ctx, submitKind);
  const refs = await collectMidjourneyImagineReferences(ctx);
  if (generationModeRequiresImageReference(ctx) && !refs.promptUrls.length && !refs.base64Array.length) {
    fail(400, 'Midjourney 图生图/分镜任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'MIDJOURNEY_REFERENCE_REQUIRED');
  }
  const requestJson = buildMidjourneyImagineRequest(ctx, refs);
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/mj/submit/imagine', ctx);
  const upstream = await callMidjourneySubmitJson(ctx, endpoint, requestJson, 'imagine');
  const taskId = extractMidjourneyTaskId(upstream);
  const rejected = midjourneySubmitRejected(upstream);
  if (rejected) {
    return {
      status: 'FAILED',
      progress: 100,
      upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [], taskId } as Prisma.InputJsonValue,
      resultUrls: [],
      errorCode: 'MIDJOURNEY_SUBMIT_FAILED',
      errorMessage: extractErrorMessage(upstream) || String((upstream as any)?.description || 'Midjourney Imagine 提交失败'),
    };
  }

  const directResult = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (directResult.status === 'SUCCESS' || directResult.resultUrls?.length) return directResult;
  if (taskId) {
    return {
      status: 'RUNNING',
      progress: extractGenericImageProgress(upstream) || 1,
      upstreamTaskId: taskId,
      upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
      requestJson,
      responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [], taskId } as Prisma.InputJsonValue,
      resultUrls: [],
    };
  }
  return {
    ...directResult,
    status: 'FAILED',
    errorCode: directResult.errorCode || 'MIDJOURNEY_TASK_MISSING',
    errorMessage: directResult.errorMessage || extractErrorMessage(upstream) || 'Midjourney Imagine 上游响应未包含 result 任务 ID 或图片结果',
  };
}

async function submitMidjourneySpecialTask(ctx: AdapterContext, kind: Exclude<MidjourneySubmitKind, 'imagine'>): Promise<AdapterSubmitResult> {
  let requestJson = await buildMidjourneySpecialTaskRequest(ctx, kind);
  let upstream: unknown;
  let responseJson: Prisma.InputJsonValue | undefined;
  if (kind === 'modal') {
    const customId = String(firstDefined(ctx.params.customId, ctx.params.custom_id, ctx.params.mjCustomId, ctx.params.mj_custom_id, '') || '').trim();
    if (customId) {
      const actionRequest = buildMidjourneyActionRequest(ctx);
      const actionEndpoint = resolveEndpointPath(MIDJOURNEY_SPECIAL_ENDPOINTS.action, ctx);
      const actionUpstream = await callMidjourneySubmitJson(ctx, actionEndpoint, actionRequest, 'modal-action');
      const actionTaskId = extractMidjourneyTaskId(actionUpstream);
      if (midjourneySubmitRejected(actionUpstream) || !actionTaskId) {
        return {
          status: 'FAILED',
          progress: 100,
          upstreamTaskId: actionTaskId,
          upstreamRequestId: String((actionUpstream as any)?.request_id || (actionUpstream as any)?.requestId || (actionUpstream as any)?.id || actionTaskId || ''),
          requestJson: { action: actionRequest, modal: requestJson } as Prisma.InputJsonValue,
          responseJson: sanitizeUpstreamPayload(actionUpstream) as Prisma.InputJsonValue,
          resultJson: { url: '', outputs: [], taskId: actionTaskId, taskKind: kind } as Prisma.InputJsonValue,
          resultUrls: [],
          errorCode: 'MIDJOURNEY_MODAL_ACTION_PREPARE_FAILED',
          errorMessage: extractErrorMessage(actionUpstream) || 'Midjourney 局部重绘交互初始化失败',
        };
      }
      requestJson = compactJson({ ...(requestJson as Record<string, unknown>), taskId: actionTaskId });
      const modalEndpoint = resolveEndpointPath(MIDJOURNEY_SPECIAL_ENDPOINTS.modal, ctx);
      upstream = await callMidjourneySubmitJson(ctx, modalEndpoint, requestJson, 'modal');
      responseJson = {
        regionAction: sanitizeUpstreamPayload(actionUpstream),
        modal: sanitizeUpstreamPayload(upstream),
      } as Prisma.InputJsonValue;
    }
  }
  if (!upstream) {
    const endpoint = resolveEndpointPath(resolveMidjourneySpecialEndpoint(ctx, kind), ctx);
    upstream = await callMidjourneySubmitJson(ctx, endpoint, requestJson, kind);
  }
  const taskId = extractMidjourneyTaskId(upstream);
  const rejected = midjourneySubmitRejected(upstream);
  if (rejected) {
    return {
      status: 'FAILED',
      progress: 100,
      upstreamTaskId: taskId,
      upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
      requestJson,
      responseJson: responseJson || sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [], taskId, taskKind: kind } as Prisma.InputJsonValue,
      resultUrls: [],
      errorCode: `MIDJOURNEY_${kind.toUpperCase()}_SUBMIT_FAILED`,
      errorMessage: extractErrorMessage(upstream) || String((upstream as any)?.description || `Midjourney ${kind} 提交失败`),
    };
  }

  const directResult = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
  if (directResult.status === 'SUCCESS' || directResult.resultUrls?.length) return withMidjourneySpecialResultJson(directResult, upstream, kind);
  if (taskId) {
    return {
      status: 'RUNNING',
      progress: extractGenericImageProgress(upstream) || 1,
      upstreamTaskId: taskId,
      upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
      requestJson,
      responseJson: responseJson || sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
      resultJson: { url: '', outputs: [], taskId, taskKind: kind, mjActions: extractMidjourneyActionButtons(upstream) } as Prisma.InputJsonValue,
      resultUrls: [],
    };
  }
  return {
    ...directResult,
    status: 'FAILED',
    errorCode: directResult.errorCode || `MIDJOURNEY_${kind.toUpperCase()}_TASK_MISSING`,
    errorMessage: directResult.errorMessage || extractErrorMessage(upstream) || `Midjourney ${kind} 上游响应未包含 result 任务 ID 或图片结果`,
    resultJson: mergeResultJson(directResult.resultJson, { taskKind: kind, mjActions: extractMidjourneyActionButtons(upstream) }),
  };
}

async function queryMidjourneyImagine(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  let lastErr: unknown;
  for (const endpointPath of midjourneyStatusEndpointCandidates(ctx)) {
    const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
    try {
      const method = resolveMidjourneyStatusMethod(ctx);
      const upstream = method === 'POST'
        ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs)
        : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs);
      return await normalizeMidjourneyImagineQueryResult(ctx, upstream);
    } catch (err) {
      lastErr = err;
      if (!isRetryableVideoStatusEndpointError(err)) throw err;
    }
  }
  throw lastErr;
}

function normalizeMidjourneySubmitKind(ctx: AdapterContext): MidjourneySubmitKind {
  const explicit = String(firstDefined(
    ctx.params.mjTaskKind,
    ctx.params.mj_task_kind,
    ctx.params.midjourneyTaskKind,
    ctx.params.midjourney_task_kind,
    ctx.params.submitKind,
    ctx.params.submit_kind,
    ctx.params.actionKind,
    ctx.params.action_kind,
  ) || '').trim().toLowerCase();
  if (isMidjourneySubmitKind(explicit)) return explicit;
  const mode = String(ctx.mode || ctx.params.mode || '').trim().toLowerCase();
  const modeMatch = mode.match(/(?:midjourney|mj)[-_ ]?(describe|blend|action|modal)$/) || mode.match(/^(describe|blend|action|modal)$/);
  if (modeMatch && isMidjourneySubmitKind(modeMatch[1])) return modeMatch[1];
  const endpoint = String(firstDefined(ctx.params.endpointPath, ctx.params.endpoint_path, ctx.model.endpointPath, ctx.provider.endpointPath) || '').toLowerCase();
  const endpointMatch = endpoint.match(/\/mj\/submit\/(describe|blend|action|modal)(?:$|[?#])/);
  if (endpointMatch && isMidjourneySubmitKind(endpointMatch[1])) return endpointMatch[1];
  return 'imagine';
}

function isMidjourneySubmitKind(value: string): value is MidjourneySubmitKind {
  return ['imagine', 'describe', 'blend', 'action', 'modal'].includes(String(value || ''));
}

function resolveMidjourneySpecialEndpoint(ctx: AdapterContext, kind: Exclude<MidjourneySubmitKind, 'imagine'>) {
  const explicit = String(firstDefined(ctx.params.endpointPath, ctx.params.endpoint_path, '') || '').trim();
  if (explicit && /\/mj\/submit\/(?:describe|blend|action|modal)\b/i.test(explicit)) return explicit;
  return MIDJOURNEY_SPECIAL_ENDPOINTS[kind];
}

async function buildMidjourneySpecialTaskRequest(ctx: AdapterContext, kind: Exclude<MidjourneySubmitKind, 'imagine'>) {
  if (kind === 'describe') return buildMidjourneyDescribeRequest(ctx);
  if (kind === 'blend') return buildMidjourneyBlendRequest(ctx);
  if (kind === 'modal') return buildMidjourneyModalRequest(ctx);
  return buildMidjourneyActionRequest(ctx);
}

function midjourneyCommonSubmitFields(ctx: AdapterContext) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  return {
    state: firstDefined(ctx.params.state, defaults.state, providerDefaults.state),
    notifyHook: firstDefined(ctx.params.notifyHook, ctx.params.notify_hook, defaults.notifyHook, providerDefaults.notifyHook),
  };
}

function midjourneyBotType(ctx: AdapterContext) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  return String(firstDefined(ctx.params.botType, ctx.params.bot_type, defaults.botType, providerDefaults.botType, 'MID_JOURNEY') || 'MID_JOURNEY').trim() || 'MID_JOURNEY';
}

async function buildMidjourneyDescribeRequest(ctx: AdapterContext) {
  const image = await collectMidjourneyDescribeImage(ctx);
  if (!image.link && !image.base64) fail(400, 'Midjourney Describe 需要当前图片或参考图 URL/base64', 'MIDJOURNEY_DESCRIBE_IMAGE_REQUIRED');
  const accountFilter = buildMidjourneyAccountFilter(ctx);
  return compactJson({
    ...midjourneyCommonSubmitFields(ctx),
    botType: midjourneyBotType(ctx),
    ...(image.link ? { link: image.link } : {}),
    ...(image.base64 ? { base64: image.base64 } : {}),
    ...(accountFilter ? { accountFilter } : {}),
    language: firstDefined(ctx.params.language, ctx.params.lang, 'en'),
  });
}

async function buildMidjourneyBlendRequest(ctx: AdapterContext) {
  const base64Array = await collectMidjourneyBlendBase64Array(ctx);
  if (base64Array.length < 2) fail(400, 'Midjourney Blend 至少需要 2 张参考图', 'MIDJOURNEY_BLEND_IMAGES_REQUIRED');
  const accountFilter = buildMidjourneyAccountFilter(ctx);
  return compactJson({
    ...midjourneyCommonSubmitFields(ctx),
    botType: midjourneyBotType(ctx),
    base64Array,
    dimensions: normalizeMidjourneyBlendDimensions(ctx.params.dimensions || ctx.params.dimension || ctx.params.aspect || ctx.params.aspectRatio),
    ...(accountFilter ? { accountFilter } : {}),
  });
}

function buildMidjourneyActionRequest(ctx: AdapterContext) {
  const taskId = String(firstDefined(ctx.params.taskId, ctx.params.task_id, ctx.params.sourceTaskId, ctx.params.source_task_id, ctx.params.upstreamTaskId, '') || '').trim();
  const customId = String(firstDefined(ctx.params.customId, ctx.params.custom_id, ctx.params.mjCustomId, ctx.params.mj_custom_id, '') || '').trim();
  if (!taskId) fail(400, 'Midjourney Action 缺少 taskId', 'MIDJOURNEY_ACTION_TASK_ID_REQUIRED');
  if (!customId) fail(400, 'Midjourney Action 缺少 customId，请先刷新任务或选择带有上游按钮数据的 MJ 结果', 'MIDJOURNEY_ACTION_CUSTOM_ID_REQUIRED');
  return compactJson({
    ...midjourneyCommonSubmitFields(ctx),
    taskId,
    customId,
    enableRemix: parseOptionalBoolean(firstDefined(ctx.params.enableRemix, ctx.params.enable_remix, ctx.params.remix)),
    strong: parseOptionalBoolean(ctx.params.strong),
  });
}

function buildMidjourneyModalRequest(ctx: AdapterContext) {
  const taskId = String(firstDefined(ctx.params.taskId, ctx.params.task_id, ctx.params.sourceTaskId, ctx.params.source_task_id, ctx.params.upstreamTaskId, '') || '').trim();
  if (!taskId) fail(400, 'Midjourney Modal 缺少 taskId', 'MIDJOURNEY_MODAL_TASK_ID_REQUIRED');
  const prompt = String(firstDefined(ctx.params.modalPrompt, ctx.params.modal_prompt, ctx.params.prompt, ctx.prompt, '') || '').trim();
  return compactJson({
    ...midjourneyCommonSubmitFields(ctx),
    prompt,
    taskId,
    maskBase64: firstDefined(ctx.params.maskBase64, ctx.params.mask_base64),
  });
}

async function collectMidjourneyDescribeImage(ctx: AdapterContext) {
  const explicitLink = String(firstDefined(ctx.params.link, ctx.params.imageLink, ctx.params.image_link, ctx.params.imageUrl, ctx.params.image_url, '') || '').trim();
  const explicitBase64 = String(firstDefined(ctx.params.base64, ctx.params.imageBase64, ctx.params.image_base64, '') || '').trim();
  if (explicitLink || explicitBase64) return { link: explicitLink, base64: explicitBase64 };
  const groups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  for (const group of groups) {
    const link = group.find(ref => isPublicHttpUrl(ref));
    if (link) return { link, base64: '' };
  }
  for (const group of groups) {
    for (const ref of group) {
      const base64 = await midjourneyBase64DataUriFromReference(ref, ctx.timeoutMs);
      if (base64) return { link: '', base64 };
    }
  }
  return { link: '', base64: '' };
}

async function collectMidjourneyBlendBase64Array(ctx: AdapterContext) {
  const explicit = ctx.params.base64Array || ctx.params.base64_array;
  if (Array.isArray(explicit)) return uniqueStrings(explicit).slice(0, 6);
  const groups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  const out: string[] = [];
  for (const group of groups) {
    for (const ref of group) {
      const base64 = await midjourneyBase64DataUriFromReference(ref, ctx.timeoutMs);
      if (base64 && !out.includes(base64)) {
        out.push(base64);
        break;
      }
    }
    if (out.length >= 6) break;
  }
  return out;
}

function normalizeMidjourneyBlendDimensions(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (['portrait', '竖图', '竖版', '2:3', '3:4', '9:16'].includes(raw)) return 'PORTRAIT';
  if (['landscape', '横图', '横版', '3:2', '4:3', '16:9'].includes(raw)) return 'LANDSCAPE';
  return 'SQUARE';
}

async function midjourneyBase64DataUriFromReference(ref: string, timeoutMs: number) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (isLocalImageFileRef(raw)) {
    const filePath = localImageFileRefPath(raw);
    if (!filePath) return '';
    try {
      const buffer = await fs.readFile(filePath);
      const mime = normalizeImageMime(inferImageMimeType(filePath));
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }
  if (!isPublicHttpUrl(raw)) return '';
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal, headers: imageReferenceFetchHeaders() });
    if (!resp.ok) fail(400, `Midjourney Blend 参考图下载失败 HTTP ${resp.status}`, 'MIDJOURNEY_BLEND_REFERENCE_FETCH_FAILED');
    const mime = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(raw));
    const bytes = Buffer.from(await resp.arrayBuffer());
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mergeResultJson(base: unknown, patch: Record<string, unknown>) {
  const cleaned = Object.fromEntries(Object.entries(patch).filter(([, item]) => item !== undefined && item !== null && item !== ''));
  return { ...(isRecord(base) ? base : {}), ...cleaned } as Prisma.InputJsonValue;
}

function withMidjourneySpecialResultJson(result: AdapterSubmitResult, upstream: unknown, kind: MidjourneySubmitKind): AdapterSubmitResult {
  return {
    ...result,
    resultJson: mergeResultJson(result.resultJson, { taskKind: kind, mjActions: extractMidjourneyActionButtons(upstream), descriptions: extractMidjourneyDescribeTexts(upstream) }),
  };
}

function extractMidjourneyDescribeTexts(payload: unknown) {
  const out: string[] = [];
  const visit = (value: unknown, key = '', depth = 0) => {
    if (value == null || depth > 6) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text && /description|descriptions|prompt|prompts|imagine/i.test(key) && !/提交成功|success|completed/i.test(text)) out.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    Object.entries(value).forEach(([childKey, child]) => visit(child, childKey, depth + 1));
  };
  visit(payload);
  return uniqueStrings(out).slice(0, 12);
}

function extractMidjourneyActionButtons(payload: unknown) {
  const out: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 8) return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    const customId = String(firstDefined(value.customId, value.custom_id, value.id, '') || '').trim();
    if (customId && /MJ::|variation|upsample|upscale|reroll|zoom|pan|vary|animate|modal/i.test(customId) && !seen.has(customId)) {
      seen.add(customId);
      out.push(compactJson({
        customId,
        label: firstDefined(value.label, value.name, value.title, value.emoji, value.type, customId),
        type: firstDefined(value.type, value.style, value.action),
      }) as Record<string, string>);
    }
    Object.values(value).forEach(child => visit(child, depth + 1));
  };
  visit(payload);
  return out.slice(0, 80);
}

function buildMidjourneyImagineRequest(ctx: AdapterContext, refs: { promptUrls: string[]; base64Array: string[] }) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const botType = String(firstDefined(ctx.params.botType, ctx.params.bot_type, defaults.botType, providerDefaults.botType, 'MID_JOURNEY') || 'MID_JOURNEY').trim() || 'MID_JOURNEY';
  const accountFilter = buildMidjourneyAccountFilter(ctx);
  return compactJson({
    state: firstDefined(ctx.params.state, defaults.state, providerDefaults.state),
    notifyHook: firstDefined(ctx.params.notifyHook, ctx.params.notify_hook, defaults.notifyHook, providerDefaults.notifyHook),
    botType,
    prompt: buildMidjourneyImaginePrompt(ctx, refs.promptUrls),
    ...(refs.base64Array.length ? { base64Array: refs.base64Array } : {}),
    ...(accountFilter ? { accountFilter } : {}),
  });
}

function buildMidjourneyImaginePrompt(ctx: AdapterContext, promptUrls: string[]) {
  const paramsValue = firstDefined(ctx.params.mjParams, ctx.params.midjourneyParams, ctx.params.midjourney_params, '');
  const basePrompt = stripManagedMidjourneyPromptParams(normalizeMidjourneyPromptSyntax(cleanMidjourneyPromptText(ctx.prompt)));
  const promptParams = buildMidjourneyParamSuffix(paramsValue);
  const joined = cleanMidjourneyPromptText([...promptUrls, basePrompt].filter(Boolean).join(' '));
  const aspectRatio = normalizeMidjourneyAspectRatio(firstDefined(ctx.params.aspectRatio, ctx.params.aspect_ratio, ctx.params.requestedRatio, ctx.params.size));
  const suffixes = [promptParams, aspectRatio ? `--ar ${aspectRatio}` : ''].filter(Boolean);
  return normalizeMidjourneyPromptSyntax(cleanMidjourneyPromptText([joined, ...suffixes].filter(Boolean).join(' ')));
}

function cleanMidjourneyPromptText(value: unknown) {
  return String(value || '')
    .replace(/\{argument\b([^{}]*)\}/gi, (_match, attrs) => {
      const raw = String(attrs || '');
      const defaultMatch = raw.match(/\bdefault\s*=\s*(["'])(.*?)\1/i) || raw.match(/\bdefault\s*=\s*([^\s}]+)/i);
      if (defaultMatch) return String(defaultMatch[2] ?? defaultMatch[1] ?? '').trim();
      const valueMatch = raw.match(/\bvalue\s*=\s*(["'])(.*?)\1/i) || raw.match(/\bvalue\s*=\s*([^\s}]+)/i);
      if (valueMatch) return String(valueMatch[2] ?? valueMatch[1] ?? '').trim();
      const nameMatch = raw.match(/\bname\s*=\s*(["'])(.*?)\1/i) || raw.match(/\bname\s*=\s*([^\s}]+)/i);
      return nameMatch ? String(nameMatch[2] ?? nameMatch[1] ?? '').trim() : '';
    })
    .replace(/\[object Object\]/gi, '')
    .replace(/^(?:\/imagine\b\s*)+/i, '')
    .replace(/\s+([，。！？、；：,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMidjourneyParamSuffix(value: unknown) {
  if (value == null) return '';
  const source = isRecord(value) ? value : {};
  const command = cleanMidjourneyPromptText(isRecord(value)
    ? firstDefined(value.command, value.promptParams, value.prompt_params, '')
    : value);
  const versionValue = firstDefined(
    source.version,
    source.modelVersion,
    source.model_version,
    source.v,
    midjourneyVersionFromPrompt(command),
    'v7',
  );
  const version = String(versionValue || 'v7').trim().toLowerCase().replace(/\s+/g, '');
  const isNiji = version.startsWith('niji');
  const supportsHd = version === 'v8.1';
  const promptSuffix = stripManagedMidjourneyPromptParams(cleanMidjourneyPromptText(firstDefined(source.promptSuffix, source.prompt_suffix, '')));
  const styleRawRequested = firstDefined(source.styleRaw, source.style_raw, source.raw, source.style) === true
    || String(firstDefined(source.style, source.styleMode, source.style_mode, '') || '').trim().toLowerCase() === 'raw'
    || /--style\s+raw\b/i.test(command);
  const styleRaw = !isNiji && styleRawRequested;
  const stylize = firstDefined(source.stylize, source.s, source.styleStrength, source.style_strength, midjourneyNumericParamFromPrompt(command, 's|stylize'), 100);
  const chaos = firstDefined(source.chaos, source.c, midjourneyNumericParamFromPrompt(command, 'c|chaos'), 8);
  const quality = normalizeMidjourneyQualityForVersion(firstDefined(source.quality, source.q, midjourneyNumericParamFromPrompt(command, 'q|quality'), 1), version);
  const hdRequested = firstDefined(source.hd, source.highDefinition, source.high_definition) === true
    || String(firstDefined(source.hd, source.highDefinition, source.high_definition, '') || '').trim().toLowerCase() === 'true'
    || /--hd\b/i.test(command);
  return cleanMidjourneyPromptText([
    promptSuffix,
    midjourneyVersionFlagFromValue(version),
    styleRaw ? '--style raw' : '',
    stylize != null && stylize !== '' ? `--s ${stylize}` : '',
    !isNiji && chaos != null && chaos !== '' ? `--c ${chaos}` : '',
    quality != null && quality !== '' ? `--q ${quality}` : '',
    supportsHd && hdRequested ? '--hd' : '',
  ].filter(Boolean).join(' '));
}

function stripManagedMidjourneyPromptParams(value: unknown) {
  return (` ${String(value || '')}`)
    .replace(/\s+--(?:v|niji)\s+\S+/gi, ' ')
    .replace(/\s+--style\s+raw\b/gi, ' ')
    .replace(/\s+--(?:s|stylize)\s+-?\d+(?:\.\d+)?/gi, ' ')
    .replace(/\s+--(?:c|chaos)\s+-?\d+(?:\.\d+)?/gi, ' ')
    .replace(/\s+--(?:q|quality)\s+-?\d+(?:\.\d+)?/gi, ' ')
    .replace(/\s+--hd\b/gi, ' ')
    .replace(/\s+--(?:ar|aspect)\s+\d+(?:\.\d+)?\s*[:/x×]\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function midjourneyVersionFromPrompt(value: unknown) {
  const match = String(value || '').match(/--(niji|v)\s+(\d+(?:\.\d+)?)/i);
  return match ? `${match[1].toLowerCase()}${match[2]}` : '';
}

function midjourneyNumericParamFromPrompt(value: unknown, names: string) {
  const match = String(value || '').match(new RegExp(`--(?:${names})\\s+(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return match ? match[1] : undefined;
}

function normalizeMidjourneyQualityForVersion(value: unknown, version: string) {
  const raw = String(value ?? '1').trim();
  const major = Number(String(version || '').match(/(?:v|niji)(\d+(?:\.\d+)?)/i)?.[1] || 7);
  const allowed = major >= 7 ? ['0.25', '0.5', '1', '2', '4'] : ['0.25', '0.5', '1', '2'];
  return allowed.includes(raw) ? raw : '1';
}

function midjourneyVersionFlagFromValue(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.startsWith('niji')) return `--niji ${raw.replace(/^niji/, '') || '7'}`;
  return `--v ${raw.replace(/^v/, '') || '7'}`;
}

function escapeRegExp(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendMissingMidjourneyPromptSuffixes(suffixes: string[], prompt: string, suffix: string) {
  const base = String(prompt || '');
  const pieces = String(suffix || '').split(/\s+(?=--[a-z0-9-]+\b)/i).map(item => item.trim()).filter(Boolean);
  for (const piece of pieces) {
    const flag = piece.match(/^--[a-z0-9-]+/i)?.[0];
    if (flag && new RegExp(`${escapeRegExp(flag)}\\b`, 'i').test(base)) continue;
    if (!flag && base.toLowerCase().includes(piece.toLowerCase())) continue;
    suffixes.push(piece);
  }
}

function buildMidjourneyAccountFilter(ctx: AdapterContext) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const raw = isRecord(ctx.params.accountFilter)
    ? ctx.params.accountFilter
    : (isRecord(ctx.params.account_filter) ? ctx.params.account_filter : {});
  const modes = normalizeMidjourneySpeedModes(firstDefined(
    ctx.params.modes,
    ctx.params.mode,
    ctx.params.speedMode,
    ctx.params.speed_mode,
    ctx.params.mjSpeedMode,
    ctx.params.mj_speed_mode,
    raw.modes,
    defaults.modes,
    defaults.speedMode,
    providerDefaults.modes,
    providerDefaults.speedMode,
  ));
  const accountFilter = compactJson({
    instanceId: firstDefined(ctx.params.instanceId, ctx.params.instance_id, raw.instanceId, raw.instance_id, defaults.instanceId, providerDefaults.instanceId),
    ...(modes.length ? { modes } : {}),
    remix: firstDefined(ctx.params.remix, raw.remix, defaults.remix, providerDefaults.remix),
    nijiRemix: firstDefined(ctx.params.nijiRemix, ctx.params.niji_remix, raw.nijiRemix, raw.niji_remix, defaults.nijiRemix, providerDefaults.nijiRemix),
    remixAutoConsidered: firstDefined(
      ctx.params.remixAutoConsidered,
      ctx.params.remix_auto_considered,
      raw.remixAutoConsidered,
      raw.remix_auto_considered,
      defaults.remixAutoConsidered,
      providerDefaults.remixAutoConsidered,
    ),
    remark: firstDefined(ctx.params.remark, raw.remark, defaults.remark, providerDefaults.remark),
  }) as Record<string, unknown>;
  return Object.keys(accountFilter).length ? accountFilter : null;
}

async function collectMidjourneyImagineReferences(ctx: AdapterContext) {
  const promptUrls: string[] = [];
  const base64Array: string[] = [];
  const groups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
  for (const group of groups) {
    let used = false;
    for (const ref of group) {
      const raw = String(ref || '').trim();
      if (!raw) continue;
      if (isPublicHttpUrl(raw)) {
        if (!promptUrls.includes(raw)) promptUrls.push(raw);
        used = true;
        break;
      }
    }
    if (used) continue;
    for (const ref of group) {
      const raw = String(ref || '').trim();
      const b64 = await midjourneyBase64FromReference(raw);
      if (b64 && !base64Array.includes(b64)) {
        base64Array.push(b64);
        break;
      }
    }
  }
  return { promptUrls, base64Array };
}

async function midjourneyBase64FromReference(ref: string) {
  if (!ref) return '';
  if (/^data:image\//i.test(ref)) {
    return ref.split(',', 2)[1]?.replace(/\s+/g, '') || '';
  }
  if (isLocalImageFileRef(ref)) {
    const filePath = localImageFileRefPath(ref);
    if (!filePath) return '';
    try {
      const buffer = await fs.readFile(filePath);
      return buffer.toString('base64');
    } catch {
      return '';
    }
  }
  return '';
}

function normalizeMidjourneySpeedModes(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  const modes = rawValues.map(item => String(item || '').trim().toUpperCase()).filter(item => ['RELAX', 'FAST', 'TURBO'].includes(item));
  return Array.from(new Set(modes));
}

function normalizeMidjourneyAspectRatio(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!raw || raw === 'auto') return '';
  const direct = raw.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (direct) return `${trimAspectNumber(direct[1])}:${trimAspectNumber(direct[2])}`;
  const size = raw.match(/^(\d+)x(\d+)$/);
  if (!size) return '';
  const width = Number(size[1]);
  const height = Number(size[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const gcd = greatestCommonDivisor(width, height);
  return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
}

function trimAspectNumber(value: string) {
  return String(Number(value)).replace(/\.0+$/, '');
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function extractMidjourneyTaskId(payload: unknown) {
  const data = (payload as any)?.data;
  const result = (payload as any)?.result;
  const dataResult = data?.result;
  const candidates = [
    result,
    dataResult,
    (payload as any)?.taskId,
    (payload as any)?.task_id,
    (payload as any)?.id,
    (payload as any)?.properties?.taskId,
    (payload as any)?.properties?.task_id,
    data?.taskId,
    data?.task_id,
    data?.id,
    isRecord(result) ? result.taskId : undefined,
    isRecord(result) ? result.task_id : undefined,
    isRecord(result) ? result.id : undefined,
    isRecord(dataResult) ? dataResult.taskId : undefined,
    isRecord(dataResult) ? dataResult.task_id : undefined,
    isRecord(dataResult) ? dataResult.id : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' && typeof candidate !== 'number' && typeof candidate !== 'bigint') continue;
    const value = String(candidate).trim();
    if (value && !/^https?:\/\//i.test(value)) return value;
  }
  return extractUpstreamTaskId(payload);
}

function midjourneySubmitRejected(payload: unknown) {
  const code = (payload as any)?.code ?? (payload as any)?.data?.code;
  if (code === undefined || code === null || code === '') return false;
  const raw = String(code).trim().toLowerCase();
  if (isMidjourneyAcceptedPendingSubmit(payload, raw)) return false;
  return !['0', '1', '200', 'success', 'ok'].includes(raw);
}

function isMidjourneyAcceptedPendingSubmit(payload: unknown, code: string) {
  if (!['21'].includes(code)) return false;
  const taskId = extractMidjourneyTaskId(payload);
  if (!taskId) return false;
  const description = String((payload as any)?.description || (payload as any)?.data?.description || '').toLowerCase();
  return /waiting|confirm|modal|submitted|queue|pending/.test(description);
}

function midjourneyStatusEndpointCandidates(ctx: AdapterContext) {
  return uniqueStrings([
    ctx.params.statusEndpointPath,
    ctx.model.statusEndpointPath,
    ctx.provider.statusEndpointPath,
    '/mj/task/{taskId}/fetch',
    '/mj/task/{taskId}',
    '/mj/task/fetch',
  ]);
}

function resolveMidjourneyStatusMethod(ctx: AdapterContext) {
  const explicit = String(ctx.params.statusMethod || ctx.params.status_method || '').trim().toUpperCase();
  if (explicit === 'GET' || explicit === 'POST') return explicit;
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const protocolMethod = String(protocol.statusMethod || protocol.status_method || '').trim().toUpperCase();
  if (protocolMethod === 'GET' || protocolMethod === 'POST') return protocolMethod;
  const providerMethod = String(ctx.provider.requestMethod || '').trim().toUpperCase();
  if (providerMethod === 'GET' || providerMethod === 'POST') return providerMethod;
  return 'GET';
}

async function normalizeMidjourneyImagineQueryResult(ctx: AdapterContext & { upstreamTaskId: string }, upstream: unknown): Promise<AdapterQueryResult> {
  const normalized = withMidjourneyStatusAliases(upstream);
  const taskKind = normalizeMidjourneySubmitKind(ctx);
  const result = await normalizeGenericImageQueryResult(ctx.provider, ctx.upstreamTaskId, normalized, resolveImageResponseType(ctx));
  if (taskKind === 'describe') {
    const descriptions = extractMidjourneyDescribeTexts(upstream);
    const statusText = extractGenericTaskStatus(normalized);
    const done = ['completed', 'success', 'succeeded', 'done', 'finished'].includes(statusText);
    if ((descriptions.length || done) && !result.resultUrls?.length) {
      return {
        ...result,
        status: 'SUCCESS',
        progress: 100,
        responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
        resultJson: mergeResultJson(result.resultJson, { taskKind, descriptions, outputs: [] }),
        resultUrls: [],
        errorCode: undefined,
        errorMessage: undefined,
      };
    }
  }
  return {
    ...result,
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: mergeResultJson(result.resultJson, { taskKind, mjActions: extractMidjourneyActionButtons(upstream) }),
    errorCode: result.status === 'FAILED' ? result.errorCode || 'MIDJOURNEY_TASK_FAILED' : result.errorCode,
    errorMessage: result.status === 'FAILED' ? result.errorMessage || extractErrorMessage(upstream) : result.errorMessage,
  };
}

function withMidjourneyStatusAliases(payload: unknown) {
  const status = extractGenericTaskStatus(payload);
  const mapped = ({
    fail: 'failed',
    failure: 'failed',
    in_progress: 'processing',
    not_start: 'processing',
    submitted: 'processing',
    waiting: 'processing',
    queued: 'processing',
    running: 'processing',
  } as Record<string, string>)[status] || status;
  if (!mapped || mapped === status) return payload;
  return isRecord(payload) ? { ...payload, status: mapped } : { status: mapped, result: payload };
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

async function collectOpenAiResponsesImageReferences(ctx: AdapterContext) {
  const publicUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
  if (publicUrls.length) return publicUrls;
  const rawReferences = [
    ctx.params.images,
    ctx.params.reference_images,
    ctx.params.referenceImages,
    ctx.params.image,
    ctx.params.input_image,
    ctx.inputFiles,
  ].filter(value => value != null);
  return Array.from(new Set(rawReferences.flatMap(value => collectOpenAiPrimaryFileRefs(value))));
}

function openAiResponsesInputImageContent(ref: string) {
  const raw = String(ref || '').trim();
  if (/^file-[\w-]+$/i.test(raw)) return { type: 'input_image', file_id: raw };
  return { type: 'input_image', image_url: raw };
}

function isPublicHttpUrl(value: string) {
  return /^https?:\/\//i.test(value) && !/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(value);
}

function resolvePublicReferenceImageUrl(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const unwrapped = unwrapWorkbenchProxyImageUrl(raw);
  if (unwrapped && unwrapped !== raw) return resolvePublicReferenceImageUrl(unwrapped);
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

function unwrapWorkbenchProxyImageUrl(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(raw, 'http://local');
    if (parsed.pathname !== '/api/workbench/image-studio/proxy-image') return raw;
    return parsed.searchParams.get('remoteUrl') || parsed.searchParams.get('url') || raw;
  } catch {
    return raw;
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
  if (responseType === 'base64' || responseType === 'server_base64_object_storage' || responseType === 'server_base64_async_object_storage') return 'b64_json';
  if (responseType === 'provider_url' || responseType === 'object_storage' || responseType === 'server_object_storage' || responseType === 'server_async_object_storage') return 'url';
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
  if (['server_async_object_storage', 'server-async-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', '124_async_cos', '124-async-cos', '124异步转存cos', '后台异步转存cos'].includes(raw)) return 'server_async_object_storage';
  if (['server_object_storage', 'server-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_cos', 'server_cos', '124_cos', '124-server-cos', '124服务器转存cos', '后台转存cos'].includes(raw)) return 'server_object_storage';
  if (['server_base64_object_storage', 'server-base64-object-storage', 'base64_object_storage', 'base64-object-storage', 'b64_object_storage', 'b64-object-storage', 'base64_to_object_storage', 'base64-to-object-storage', 'base64_to_cos', 'base64-to-cos', 'b64_to_cos', 'b64-to-cos', '124_base64_cos', '124-base64-cos', '124_base64_to_cos', '124-base64-to-cos', '124_base64_object_storage', '124-base64-object-storage', '124服务器base64转存cos', '124base64转存cos', 'base64转存cos', 'b64转存cos', '后台base64转存cos'].includes(raw)) return 'server_base64_object_storage';
  if (['server_base64_async_object_storage', 'server-base64-async-object-storage', 'server_async_base64_object_storage', 'server-async-base64-object-storage', 'base64_async_object_storage', 'base64-async-object-storage', 'b64_async_object_storage', 'b64-async-object-storage', 'base64_async_to_object_storage', 'base64-async-to-object-storage', 'base64_async_to_cos', 'base64-async-to-cos', 'b64_async_to_cos', 'b64-async-to-cos', '124_base64_async_cos', '124-base64-async-cos', '124_async_base64_cos', '124-async-base64-cos', '124_base64_async_to_cos', '124-base64-async-to-cos', '124_base64_async_object_storage', '124-base64-async-object-storage', '124服务器base64异步转存cos', '124base64异步转存cos', 'base64异步转存cos', 'b64异步转存cos', '后台base64异步转存cos'].includes(raw)) return 'server_base64_async_object_storage';
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
  const request = withGptImage2LargeAsyncTaskHint(ctx, withGptImage2MainModel(ctx, withGptImage2ResolutionModel(ctx, requestJson)));
  const stream = resolveImageUpstreamStream(ctx);
  if (stream === undefined) return request;
  return compactJson({ ...(isRecord(request) ? request : {}), stream });
}

function withGptImage2ResolutionModel(ctx: AdapterContext, requestJson: Prisma.InputJsonValue) {
  if (!shouldUseGptImage2ResolutionTierModel(ctx)) return requestJson;
  const request = isRecord(requestJson) ? { ...(requestJson as Record<string, unknown>) } : {};
  const requestSize = firstDefined(ctx.params.requestedPixelSize, ctx.params.pixelSize, request.size);
  return compactJson({
    ...request,
    model: resolveGptImage2ResolutionModelName(ctx, request.model, requestSize),
    size: requestSize,
    aspect_ratio: resolveGptImage2AspectRatio(ctx, requestSize),
    resolution: resolveGptImage2Resolution(ctx, requestSize),
    reasoning_effort: ctx.params.reasoning_effort || ctx.params.reasoningEffort || 'medium',
  });
}

function resolveGptImage2ResolutionModelName(ctx: AdapterContext, requestModel: unknown, requestSize: unknown) {
  const preferredModel = shouldUseGptImage2FullResolutionSuffixModel(ctx)
    ? (ctx.params.model || requestModel || ctx.model.name || ctx.provider.defaultModel)
    : (requestModel || ctx.params.model || ctx.model.name || ctx.provider.defaultModel);
  const baseModel = normalizeGptImageV2BaseModel(preferredModel);
  const resolution = resolveGptImage2Resolution(ctx, requestSize);
  if (shouldUseGptImage2FullResolutionSuffixModel(ctx)) return `${baseModel}-${resolution}`;
  if (resolution === '1K') return baseModel;
  return resolveGptImageV2ModelName(baseModel, resolution);
}

function resolveGptImage2Resolution(ctx: AdapterContext, requestSize: unknown) {
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const resolution = normalizeGptImageV2Resolution(firstDefined(
    ctx.params.resolution,
    ctx.params.requestedResolution,
    ctx.params.imageSize,
    ctx.params.requestedPixelSize,
    ctx.params.size,
    requestSize,
    defaults.resolution,
    defaults.imageSize,
    providerDefaults.resolution,
    providerDefaults.imageSize,
  ));
  if (!isGptImage2ProOfficialProxyRequest(ctx)) return resolution;
  return resolution === '1K' ? '1K' : '2K';
}

function resolveGptImage2AspectRatio(ctx: AdapterContext, requestSize: unknown) {
  const raw = String(firstDefined(ctx.params.aspect_ratio, ctx.params.aspectRatio, ctx.params.requestedRatio, ctx.params.ratio, requestSize, ctx.params.size) || '').trim().toLowerCase().replace('×', 'x');
  if (isGptImage2ProOfficialProxyRequest(ctx)) return resolveGptImage2ProOfficialProxyAspectRatio(raw);
  if (/^\d{1,2}:\d{1,2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{3,5})\s*x\s*(\d{3,5})$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width === height) return '1:1';
      return width > height ? '16:9' : '9:16';
    }
  }
  if (raw === 'landscape' || raw === 'wide') return '16:9';
  if (raw === 'portrait' || raw === 'vertical') return '9:16';
  if (raw === 'square') return '1:1';
  return '16:9';
}

function resolveGptImage2ProOfficialProxyAspectRatio(rawValue: string) {
  const raw = String(rawValue || '').trim().toLowerCase().replace('×', 'x');
  if (!raw || raw === 'auto') return undefined;
  const allowed = new Set(['1:1', '3:2', '2:3']);
  if (allowed.has(raw)) return raw;
  const normalized = ratioFromSize(raw);
  if (allowed.has(normalized)) return normalized;
  const numeric = aspectRatioNumberFromValue(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const candidates = [
    ['1:1', 1],
    ['3:2', 3 / 2],
    ['2:3', 2 / 3],
  ] as const;
  return candidates.reduce((best, item) => Math.abs(item[1] - numeric) < Math.abs(best[1] - numeric) ? item : best, candidates[0])[0];
}

function aspectRatioNumberFromValue(value: string) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return NaN;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : NaN;
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

function resolveOpenAiResponsesImageMainModel(ctx: AdapterContext) {
  const gptImage2MainModel = resolveGptImage2MainModel(ctx);
  if (gptImage2MainModel) return gptImage2MainModel;
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.main_model,
    ctx.params.mainModel,
    ctx.params.responses_model,
    ctx.params.responsesModel,
    ctx.params.codex_model,
    ctx.params.codexModel,
    ctx.params.imageMainModel,
    protocol.imageMainModel,
    protocol.responsesModel,
    protocol.codexModel,
    defaults.imageMainModel,
    defaults.responsesModel,
    defaults.codexModel,
    providerDefaults.imageMainModel,
    providerDefaults.responsesModel,
    providerDefaults.codexModel,
  ) || '').trim();
  if (configured) return configured;
  const providerDefault = String(ctx.provider.defaultModel || '').trim();
  return looksLikeLanguageModelName(providerDefault) ? providerDefault : 'gpt-5.4-mini';
}

function resolveOpenAiChatImageMainModel(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.main_model,
    ctx.params.mainModel,
    ctx.params.responses_model,
    ctx.params.responsesModel,
    ctx.params.codex_model,
    ctx.params.codexModel,
    ctx.params.imageMainModel,
    protocol.imageMainModel,
    protocol.responsesModel,
    protocol.codexModel,
    defaults.imageMainModel,
    defaults.responsesModel,
    defaults.codexModel,
    providerDefaults.imageMainModel,
    providerDefaults.responsesModel,
    providerDefaults.codexModel,
  ) || '').trim();
  if (configured) return configured;
  const modelName = String(ctx.model.name || '').trim();
  if (looksLikeLanguageModelName(modelName)) return modelName;
  const providerDefault = String(ctx.provider.defaultModel || '').trim();
  if (looksLikeLanguageModelName(providerDefault)) return providerDefault;
  return 'gpt-5.4-mini';
}

function resolveOpenAiChatImageToolModel(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.image_tool_model,
    ctx.params.imageToolModel,
    ctx.params.image_model,
    ctx.params.imageModel,
    ctx.params.imageGenerationModel,
    ctx.params.toolModel,
    protocol.imageToolModel,
    protocol.image_model,
    protocol.imageModel,
    protocol.imageGenerationModel,
    defaults.imageToolModel,
    defaults.image_model,
    defaults.imageModel,
    defaults.imageGenerationModel,
    providerDefaults.imageToolModel,
    providerDefaults.image_model,
    providerDefaults.imageModel,
    providerDefaults.imageGenerationModel,
  ) || '').trim();
  if (looksLikeImageGenerationModelName(configured)) return configured;
  const paramsModel = String(ctx.params.model || '').trim();
  if (looksLikeImageGenerationModelName(paramsModel)) return paramsModel;
  const modelName = String(ctx.model.name || '').trim();
  if (looksLikeImageGenerationModelName(modelName)) return modelName;
  return 'gpt-image-2';
}

function looksLikeImageGenerationModelName(modelName: string) {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw) return false;
  return /gpt[-_ ]?image[-_ ]?2|image|imagen|imagine|flux|sdxl|midjourney|niji/.test(raw);
}

function normalizeOpenAiChatImageToolSize(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  if (!raw || raw === 'auto' || raw === '1:1' || raw === 'square') return '1024x1024';
  if (raw === '16:9' || raw === 'landscape' || raw === 'wide') return '1792x1024';
  if (raw === '9:16' || raw === 'portrait' || raw === 'vertical') return '1024x1792';
  const match = raw.match(/^(\d{3,5})\s*x\s*(\d{3,5})$/);
  if (!match) return '1024x1024';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '1024x1024';
  if (width === height) return '1024x1024';
  if (width === 1792 && height === 1024) return '1792x1024';
  if (width === 1024 && height === 1792) return '1024x1792';
  return width > height ? '1792x1024' : '1024x1792';
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

function isHongniaoGptImage2GenerationRequest(ctx: AdapterContext) {
  if (!isGptImage2Request(ctx)) return false;
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const hint = [
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.baseUrl,
    ctx.provider.adapter,
    ctx.provider.endpointPath,
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
  return hint.includes('hongniaoai.com') || hint.includes('hongniao') || hint.includes('gpt-image-2(pro)');
}

function shouldUseGptImage2GenerationsEndpoint(ctx: AdapterContext) {
  if (!isGptImage2Request(ctx)) return false;
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const hint = [
    ctx.provider.adapter,
    ctx.provider.endpointPath,
    ctx.model.adapter,
    ctx.model.endpointPath,
    protocol.adapter,
    protocol.endpointPath,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return isHongniaoGptImage2GenerationRequest(ctx)
    || hint.includes('openai-generations')
    || /\/images\/generations(?:$|[?#/\s])/.test(hint);
}

function shouldUseGptImage2FullResolutionSuffixModel(ctx: AdapterContext) {
  return isHongniaoGptImage2GenerationRequest(ctx);
}

function shouldUseGptImage2ResolutionTierModel(ctx: AdapterContext) {
  if (!isGptImage2Request(ctx)) return false;
  const hint = [
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.baseUrl,
    ctx.provider.defaultModel,
    ctx.model.id,
    ctx.model.modelKey,
    ctx.model.name,
    ctx.model.displayName,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return isHongniaoGptImage2GenerationRequest(ctx) || hint.includes('api.aiid.edu.kg') || isGptImage2ProOfficialProxyRequest(ctx);
}

function isGptImage2ProOfficialProxyRequest(ctx: AdapterContext) {
  if (!isGptImage2Request(ctx)) return false;
  if (isHongniaoGptImage2GenerationRequest(ctx)) return false;
  const hint = [
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.baseUrl,
    ctx.provider.defaultModel,
    ctx.model.id,
    ctx.model.modelKey,
    ctx.model.name,
    ctx.model.displayName,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return hint.includes('45.77.211.38:8317')
    || hint.includes('localhost:8317')
    || hint.includes('127.0.0.1:8317')
    || hint.includes('canvas_gpt-image-2-pro')
    || hint.includes('canvas-gpt-image-2-pro');
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
  if (shouldUseGptImage2ResolutionTierModel(ctx) || shouldUseGptImage2GenerationsEndpoint(ctx)) return '/v1/images/generations';
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured) return '/images/edits';
  return configured;
}

function resolveOpenAiEditsEndpoint(ctx: AdapterContext) {
  if (shouldUseGptImage2GenerationsEndpoint(ctx)) return '/v1/images/generations';
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
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingPollTarget = !taskId && !urls.length;
  const responseKeys = upstream && typeof upstream === 'object' && !Array.isArray(upstream)
    ? Object.keys(upstream as Record<string, unknown>).slice(0, 20).join(', ')
    : typeof upstream;
  return {
    status: failed || missingPollTarget ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: missingPollTarget ? 'SORA_VIDEO_TASK_MISSING' : undefined,
    errorMessage: failed
      ? extractErrorMessage(upstream)
      : (missingPollTarget ? `Veo/Sora 上游响应未包含任务 ID 或结果 URL（响应字段：${responseKeys || '空响应'}）` : undefined),
  };
}

async function submitFullbloodVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p'], '720p');
  const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 15, [15]);
  const requestJson = compactJson({
    size: resolveFullbloodVideoSize(ctx, aspectRatio),
    model: ctx.model.name || ctx.provider.defaultModel || ctx.params.model,
    ...(imageUrls.length ? { images: imageUrls } : {}),
    prompt: ctx.prompt,
    seconds: String(secondsNumber),
    aspectRatio,
  });
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(resolveFullbloodVideoSubmitEndpointPath(ctx), ctx), requestJson, ctx.timeoutMs);
  return normalizeFullbloodVideoSubmitResult(ctx, upstream, requestJson);
}

async function queryFullbloodVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(resolveFullbloodVideoStatusEndpointPath(ctx), { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeVideoQueryResult(ctx, upstream);
}

async function normalizeFullbloodVideoSubmitResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || String((upstream as any)?.id || (upstream as any)?.data?.id || (upstream as any)?.data?.taskId || (upstream as any)?.data?.task_id || '');
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingPollTarget = !taskId && !urls.length;
  return {
    status: failed || missingPollTarget ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'FULLBLOOD_VIDEO_TASK_FAILED' : (missingPollTarget ? 'FULLBLOOD_VIDEO_TASK_MISSING' : undefined),
    errorMessage: failed
      ? extractErrorMessage(upstream)
      : (missingPollTarget ? `fullblood-video 上游响应未包含任务 ID 或结果 URL：${extractErrorMessage(upstream) || JSON.stringify(summarizeObjectKeys(upstream))}` : undefined),
  };
}

function resolveFullbloodVideoSubmitEndpointPath(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const configured = String(firstDefined(
    protocol.endpoint_path,
    protocol.endpointPath,
    ctx.model.endpointPath,
    ctx.provider.endpointPath,
    '/videos',
  ) || '').trim();
  return /\/videos(?:$|[?#])/i.test(configured) ? configured : '/videos';
}

function resolveFullbloodVideoStatusEndpointPath(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const configured = String(firstDefined(
    protocol.status_endpoint_path,
    protocol.statusEndpointPath,
    ctx.model.statusEndpointPath,
    ctx.provider.statusEndpointPath,
    '/videos/{taskId}',
  ) || '').trim();
  return /\/videos\/\{?taskId\}?(?:$|[?#])/i.test(configured) ? configured : '/videos/{taskId}';
}

function resolveFullbloodVideoSize(ctx: AdapterContext, aspectRatio: string) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const sizeByAspectRatio = isRecord(protocol.sizeByAspectRatio) ? protocol.sizeByAspectRatio : {};
  return String(firstDefined(
    ctx.params.size,
    sizeByAspectRatio[aspectRatio],
    defaults.size,
    '1280x720',
  ) || '1280x720');
}

function summarizeObjectKeys(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { keys: Object.keys(value as Record<string, unknown>).slice(0, 20) }
    : { type: typeof value };
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
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
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
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, maxSoraV3ReferenceImages(ctx));
  const mediaRefs = buildVideoMediaReferences(ctx);
  const rawAspectRatio = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || '16:9').trim();
  const aspectRatio = normalizeAllowedString(rawAspectRatio, ['16:9', '9:16', '1:1'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p', '4k'], '720p');
  const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 5, [5, 6, 8, 10]);
  const requestJson = compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'sora-v3-pro',
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    resolution,
    seconds: String(secondsNumber),
    ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
    ...(mediaRefs.videoUrl ? { video_url: mediaRefs.videoUrl } : {}),
    ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
    ...('generateAudio' in ctx.params || 'generate_audio' in ctx.params ? { generate_audio: ctx.params.generateAudio ?? ctx.params.generate_audio } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}

async function submitSoraVideoPro(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProImageUrls(ctx), 9);
  const explicitImageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, ['image_url', 'imageUrl', 'firstFrame', 'first_frame'], 'image', 1), 1);
  const explicitImageUrl = resolveSoraVideoProExplicitImageUrl(explicitImageUrls[0], imageUrls);
  const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'extra_videos', 'extraVideos', 'reference_video_urls', 'referenceVideoUrls',
    'reference_videos', 'referenceVideos', 'reference_video', 'referenceVideo',
    'video', 'videoUrl', 'refVideo', 'video_url',
  ], 'video', 3), 'video', 3);
  const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'extra_audios', 'extraAudios', 'reference_audio_urls', 'referenceAudioUrls',
    'reference_audios', 'referenceAudios', 'reference_audio', 'referenceAudio',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ], 'audio', 3), 'audio', 3);
  const duration = resolveVideoDurationSeconds(
    ctx,
    '720p',
    ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds,
    6,
    Array.from({ length: 12 }, (_, index) => index + 4),
  );
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'], '16:9');
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'firstFrame', 'first_frame', 'first_frame_image_url', 'last_frame_image_url',
    'extra_images', 'extraImages',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
    'extra_videos', 'extraVideos',
    'audio', 'audioUrl', 'refAudio', 'audio_url', 'reference_audio', 'referenceAudio', 'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
    'extra_audios', 'extraAudios',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'video-pro-720p',
    prompt: ctx.prompt,
    duration,
    aspect_ratio: aspectRatio,
    ...videoParams,
    ...(explicitImageUrl ? { image_url: explicitImageUrl } : {}),
    ...(imageUrls.length ? { extra_images: imageUrls } : {}),
    ...(videoUrls.length ? { extra_videos: videoUrls } : {}),
    ...(audioUrls.length ? { extra_audios: audioUrls } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED')),
    progress: failed || urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId || String((upstream as any)?.task_id || (upstream as any)?.taskId || (upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SORA_VIDEO_PRO_TASK_FAILED' : (!taskId && !urls.length ? 'SORA_VIDEO_PRO_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'sora-video-pro 上游响应未包含任务 ID 或视频 URL' : undefined),
  };
}

async function submitSeedance2Video(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const modelName = resolveSeedance2ModelName(ctx);
  const usesAiyunzhiProtocol = isAiyunzhiSeedance2Protocol(ctx, modelName);
  if (!usesAiyunzhiProtocol) return submitLegacySeedance2Video(ctx, modelName);
  if (!isSeedance2FullModelName(modelName)) return submitOfficialSd2Video(ctx, modelName);

  const prompt = resolveSeedance2Prompt(ctx);
  if (!prompt) fail(400, 'Seedance 2.0 prompt is required', 'SEEDANCE2_PROMPT_REQUIRED');
  const resolution = resolveSeedance2SdResolution(ctx, modelName);
  const duration = resolveSeedance2SdDuration(ctx, modelName);
  const aspectRatio = resolveSeedance2SdAspectRatio(ctx, modelName);
  const references = await collectSeedance2SdReferences(ctx);
  const generateAudio = resolveSeedance2GenerateAudio(ctx);
  const content = buildSeedance2SdContent(prompt, references);
  const requestJson = compactJson({
    model: modelName,
    prompt,
    ...(content.length > 1 ? { content } : {}),
    aspect_ratio: aspectRatio,
    resolution,
    duration,
    ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
    referenceImageCount: references.images.length,
    referenceVideoCount: references.videos.length,
    referenceAudioCount: references.audios.length,
  });

  const multipartRefs = seedance2MultipartReferences(references);
  let upstream: unknown;
  if (multipartRefs.total > 0) {
    upstream = await callUpstreamMultipart(ctx.provider, resolveSeedance2MultipartEndpoint(ctx), await buildSeedance2VideoForm(requestJson, multipartRefs, ctx.timeoutMs), ctx.timeoutMs);
  } else {
    try {
      upstream = await callUpstreamJson(ctx.provider, resolveSeedance2SubmitEndpoint(ctx), requestJson, ctx.timeoutMs);
    } catch (err) {
      const fallbackRefs = seedance2AllUrlReferences(references);
      if (!isSeedance2PromptRequiredError(err) || fallbackRefs.total === 0) throw err;
      upstream = await callUpstreamMultipart(ctx.provider, resolveSeedance2MultipartEndpoint(ctx), await buildSeedance2VideoForm(requestJson, fallbackRefs, ctx.timeoutMs), ctx.timeoutMs);
    }
  }
  return await normalizeSeedance2VideoTaskResult(ctx, upstream, requestJson);
}

function resolveSeedance2Prompt(ctx: AdapterContext) {
  const direct = [
    ctx.prompt,
    ctx.params.prompt,
    ctx.params.text,
    ctx.params.positive,
  ].map(value => String(value || '').trim()).find(Boolean);
  if (direct) return direct;
  const content = Array.isArray(ctx.params.content) ? ctx.params.content : [];
  const text = content.find(item => isRecord(item) && item.type === 'text');
  return isRecord(text) ? String(text.text || '').trim() : '';
}

function isSeedance2PromptRequiredError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '');
  return /prompt\s+is\s+required|提示词.{0,12}(?:必填|不能为空|缺失)/i.test(message);
}

async function submitOfficialSd2Video(ctx: AdapterContext, modelName: string): Promise<AdapterSubmitResult> {
  const resolution = resolveSeedance2SdResolution(ctx, modelName);
  const duration = resolveSeedance2SdDuration(ctx, modelName);
  const aspectRatio = resolveSeedance2SdAspectRatio(ctx, modelName);
  const references = await collectSeedance2SdReferences(ctx);
  const modeType = resolveOfficialSd2ModeType(ctx, references.images);
  const generateAudio = resolveOfficialSd2GenerateAudio(ctx);
  const requestJson = compactJson({
    model: modelName,
    prompt: ctx.prompt,
    duration,
    generate_audio: generateAudio,
    ...(references.images.length ? { images: references.images.map(ref => ref.url).filter(Boolean) } : {}),
    ...(references.audios.length ? { audios: references.audios.map(ref => ref.url).filter(Boolean) } : {}),
    ...(references.videos.length ? { videos: references.videos.map(ref => ref.url).filter(Boolean) } : {}),
    metadata: {
      modeType,
      ratio: aspectRatio,
      enableSound: generateAudio ? 'on' : 'off',
    },
  });
  const upstream = await callUpstreamJson(ctx.provider, resolveOfficialSd2SubmitEndpoint(ctx), requestJson, ctx.timeoutMs);
  return await normalizeSeedance2VideoTaskResult(ctx, upstream, requestJson);
}

async function submitZaomengSeedance2Video(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const prompt = resolveSeedance2Prompt(ctx);
  if (!prompt) fail(400, '造梦 Seedance 2.0 prompt 为必填。', 'ZAOMENG_SEEDANCE2_PROMPT_REQUIRED');
  const maxPromptLength = normalizePositiveInt((isRecord(ctx.model.capabilities) ? ctx.model.capabilities.maxPromptLength : undefined) ?? 4000) || 4000;
  if (prompt.length > maxPromptLength) {
    fail(400, `造梦 Seedance 2.0 prompt 最多 ${maxPromptLength} 个字符，当前 ${prompt.length} 个。`, 'ZAOMENG_SEEDANCE2_PROMPT_TOO_LONG');
  }
  const modelName = resolveZaomengSeedance2ModelName(ctx);
  const resolution = resolveZaomengSeedance2Resolution(ctx);
  const duration = resolveZaomengSeedance2Duration(ctx, resolution);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16', '1:1'], '16:9');
  const references = await collectZaomengSeedance2References(ctx);
  assertZaomengSeedance2References(ctx, references);
  const files = zaomengSeedance2Files(references);
  const requestJson = compactJson({
    model: modelName,
    prompt: zaomengSeedance2PromptWithMarkers(prompt, references),
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    ...(files.length ? { files } : {}),
    referenceImageCount: references.images.length,
    referenceVideoCount: references.videos.length,
    referenceAudioCount: references.audios.length,
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/video/generations', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeZaomengSeedance2SubmitResult(ctx, upstream, requestJson);
}

async function submitToapisSeedance2Video(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const prompt = resolveSeedance2Prompt(ctx);
  if (!prompt) fail(400, 'ToAPIs Seedance 2 prompt 为必填。', 'TOAPIS_SEEDANCE2_PROMPT_REQUIRED');
  const modelName = resolveToapisSeedance2ModelName(ctx);
  const resolution = resolveToapisSeedance2Resolution(ctx, modelName);
  const duration = resolveToapisSeedance2Duration(ctx);
  const aspectRatio = normalizeAllowedString(
    ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.ratio,
    ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    '16:9',
  );
  const refs = await collectToapisSeedance2References(ctx);
  const imageWithRoles = buildToapisSeedance2ImageRoles(ctx, refs.images);
  const videoWithRoles = refs.videos.map(ref => ({ url: toapisSeedance2ReferenceUrl(ref), role: 'reference_video' }));
  const audioWithRoles = refs.audios.map(ref => ({ url: toapisSeedance2ReferenceUrl(ref), role: 'reference_audio' }));
  assertToapisSeedance2References(imageWithRoles, videoWithRoles, audioWithRoles);
  const callbackUrl = String(ctx.params.callback_url || ctx.params.callbackUrl || '').trim();
  const traceId = String(ctx.params.trace_id || ctx.params.traceId || '').trim();
  const requestJson = compactJson({
    model: modelName,
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    resolution,
    ...(imageWithRoles.length ? { image_with_roles: imageWithRoles } : {}),
    ...(videoWithRoles.length ? { video_with_roles: videoWithRoles } : {}),
    ...(audioWithRoles.length ? { audio_with_roles: audioWithRoles } : {}),
    generate_audio: resolveToapisSeedance2GenerateAudio(ctx),
    ...(toapisSeedance2Seed(ctx) !== undefined ? { seed: toapisSeedance2Seed(ctx) } : {}),
    ...(callbackUrl && traceId ? { callback_url: callbackUrl, trace_id: traceId } : {}),
    ...(ctx.params.client_business_id || ctx.params.clientBusinessId ? { client_business_id: ctx.params.client_business_id || ctx.params.clientBusinessId } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/videos/generations', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeToapisSeedance2Result(ctx, upstream, requestJson);
}

function resolveToapisSeedance2ModelName(ctx: AdapterContext) {
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
  if (raw === 'seedance-2-fast') return 'seedance-2-fast';
  if (raw === 'seedance-2') return 'seedance-2';
  const hint = [
    ctx.model.modelKey,
    ctx.model.name,
    ctx.model.displayName,
    ctx.provider.defaultModel,
    ctx.provider.providerKey,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return hint.includes('fast') || hint.includes('快速') ? 'seedance-2-fast' : 'seedance-2';
}

function resolveToapisSeedance2Resolution(ctx: AdapterContext, modelName: string) {
  const requested = String(ctx.params.resolution || ctx.params.quality || ctx.params.requestedResolution || '').trim().toLowerCase();
  if (modelName === 'seedance-2-fast' && requested === '1080p') {
    fail(400, 'ToAPIs seedance-2-fast 不支持 1080p，请选择 480p 或 720p。', 'TOAPIS_SEEDANCE2_FAST_1080P_UNSUPPORTED');
  }
  const allowed = modelName === 'seedance-2-fast' ? ['480p', '720p'] : ['480p', '720p', '1080p'];
  return normalizeAllowedString(requested, allowed, '720p');
}

function resolveToapisSeedance2Duration(ctx: AdapterContext) {
  const raw = firstDefined(ctx.params.duration, ctx.params.durationSeconds, ctx.params.duration_seconds, ctx.params.seconds);
  if (raw === undefined) return 5;
  const duration = Number.parseInt(String(raw).replace(/s$/i, ''), 10);
  if (duration === 0 || duration === -1) return duration;
  if (!Number.isFinite(duration) || duration < 4 || duration > 15) {
    fail(400, 'ToAPIs Seedance 2 duration 仅支持 4-15 秒，或 0/-1 自动时长。', 'TOAPIS_SEEDANCE2_DURATION_INVALID');
  }
  return duration;
}

async function collectToapisSeedance2References(ctx: AdapterContext): Promise<Seedance2SdReferences> {
  const refs = await collectSeedance2SdReferences(ctx);
  const assetRefs = collectToapisSeedance2AssetUrlReferences(ctx);
  return {
    images: dedupeSeedance2References([...refs.images, ...assetRefs.images]).slice(0, 9),
    videos: dedupeSeedance2References([...refs.videos, ...assetRefs.videos]).slice(0, 3),
    audios: dedupeSeedance2References([...refs.audios, ...assetRefs.audios]).slice(0, 3),
  };
}

function collectToapisSeedance2AssetUrlReferences(ctx: AdapterContext): Seedance2SdReferences {
  const refs: Seedance2SdReferences = { images: [], videos: [], audios: [] };
  const visit = (value: unknown, expectedKind?: 'image' | 'video' | 'audio') => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, expectedKind));
      return;
    }
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!/^asset:\/\//i.test(raw)) return;
      if (expectedKind === 'image') refs.images.push({ kind: 'image', url: raw });
      if (expectedKind === 'video') refs.videos.push({ kind: 'video', url: raw });
      if (expectedKind === 'audio') refs.audios.push({ kind: 'audio', url: raw });
      return;
    }
    if (!isRecord(value)) return;
    const kind = inferReferenceMediaType(value) || expectedKind || '';
    const assetId = String(firstDefined(value.assetId, value.asset_id, value.url) || '').trim();
    const url = /^asset:\/\//i.test(assetId) ? assetId : (assetId ? `asset://${assetId}` : '');
    if (!url) return;
    if (kind === 'image') refs.images.push({ kind: 'image', url });
    if (kind === 'video') refs.videos.push({ kind: 'video', url });
    if (kind === 'audio') refs.audios.push({ kind: 'audio', url });
  };
  const assetSources: Array<['image' | 'video' | 'audio', unknown]> = [
    ['image' as const, ctx.params.image_assets], ['image' as const, ctx.params.imageAssets],
    ['video' as const, ctx.params.video_assets], ['video' as const, ctx.params.videoAssets],
    ['audio' as const, ctx.params.audio_assets], ['audio' as const, ctx.params.audioAssets],
    ['image' as const, ctx.params.image_with_roles], ['video' as const, ctx.params.video_with_roles], ['audio' as const, ctx.params.audio_with_roles],
  ];
  assetSources.forEach(([kind, value]) => visit(value, kind));
  ctx.inputFiles.forEach(value => visit(value));
  return refs;
}

function buildToapisSeedance2ImageRoles(ctx: AdapterContext, images: Seedance2SdReference[]) {
  const roleByUrl = explicitToapisSeedance2ImageRoleMap(ctx.params.image_with_roles || ctx.params.imageWithRoles);
  const imageRefs = images.map(ref => {
    const url = toapisSeedance2ReferenceUrl(ref);
    return { url, role: roleByUrl.get(url) || '' };
  }).filter(item => item.url);
  const refMode = String(ctx.params.refMode || ctx.params.ref_mode || ctx.params.modeType || ctx.params.mode_type || '').trim().toLowerCase();
  const firstLast = /first[-_ ]?last|frames2video|首尾/.test(refMode);
  if (firstLast && imageRefs.length >= 2) {
    return imageRefs.slice(0, 2).map((item, index) => ({ url: item.url, role: index === 0 ? 'first_frame' : 'last_frame' }));
  }
  return imageRefs.map((item, index) => {
    if (item.role) return { url: item.url, role: item.role };
    if (imageRefs.length === 1 && !/reference|参考/.test(refMode)) return { url: item.url, role: 'first_frame' };
    if (index === 0 && (ctx.params.first_frame_image_url || ctx.params.firstFrameImageUrl)) return { url: item.url, role: 'first_frame' };
    if (index === 1 && (ctx.params.last_frame_image_url || ctx.params.lastFrameImageUrl)) return { url: item.url, role: 'last_frame' };
    return { url: item.url, role: 'reference_image' };
  });
}

function explicitToapisSeedance2ImageRoleMap(value: unknown) {
  const map = new Map<string, string>();
  const visit = (item: unknown) => {
    if (!isRecord(item)) return;
    const url = String(item.url || item.imageUrl || item.image_url || '').trim();
    const role = String(item.role || '').trim();
    if (url && ['first_frame', 'last_frame', 'reference_image'].includes(role)) map.set(url, role);
  };
  if (Array.isArray(value)) value.forEach(visit);
  else visit(value);
  return map;
}

function toapisSeedance2ReferenceUrl(ref: Seedance2SdReference) {
  const url = String(ref.url || '').trim();
  if (url) return url;
  const assetId = String(ref.assetId || '').trim();
  if (!assetId) return '';
  return /^asset:\/\//i.test(assetId) ? assetId : `asset://${assetId}`;
}

function assertToapisSeedance2References(
  imageWithRoles: Array<{ url: string; role: string }>,
  videoWithRoles: Array<{ url: string; role: string }>,
  audioWithRoles: Array<{ url: string; role: string }>,
) {
  const firstFrameCount = imageWithRoles.filter(item => item.role === 'first_frame').length;
  const lastFrameCount = imageWithRoles.filter(item => item.role === 'last_frame').length;
  const referenceImageCount = imageWithRoles.filter(item => item.role === 'reference_image').length;
  const hasFrameMode = firstFrameCount > 0 || lastFrameCount > 0;
  if (firstFrameCount > 1) fail(400, 'ToAPIs Seedance 2 first_frame 最多 1 张。', 'TOAPIS_SEEDANCE2_TOO_MANY_FIRST_FRAMES');
  if (lastFrameCount > 1) fail(400, 'ToAPIs Seedance 2 last_frame 最多 1 张。', 'TOAPIS_SEEDANCE2_TOO_MANY_LAST_FRAMES');
  if (referenceImageCount > 9) fail(400, 'ToAPIs Seedance 2 reference_image 最多 9 张。', 'TOAPIS_SEEDANCE2_TOO_MANY_REFERENCE_IMAGES');
  if (hasFrameMode && referenceImageCount) fail(400, 'ToAPIs Seedance 2 首帧/首尾帧模式不能与 reference_image 混用。', 'TOAPIS_SEEDANCE2_FRAME_REFERENCE_MIXED');
  if (videoWithRoles.length > 3) fail(400, 'ToAPIs Seedance 2 reference_video 最多 3 条。', 'TOAPIS_SEEDANCE2_TOO_MANY_VIDEOS');
  if (audioWithRoles.length > 3) fail(400, 'ToAPIs Seedance 2 reference_audio 最多 3 段。', 'TOAPIS_SEEDANCE2_TOO_MANY_AUDIOS');
  if (audioWithRoles.length && !imageWithRoles.length && !videoWithRoles.length) {
    fail(400, 'ToAPIs Seedance 2 音频参考不能单独使用，请至少搭配图片或视频参考。', 'TOAPIS_SEEDANCE2_AUDIO_REQUIRES_VISUAL');
  }
}

function resolveToapisSeedance2GenerateAudio(ctx: AdapterContext) {
  const explicit = firstDefined(
    ctx.params.generate_audio,
    ctx.params.generateAudio,
    ctx.params.enableSound,
    ctx.params.enable_sound,
  );
  if (explicit === undefined) return true;
  return normalizeBooleanValue(explicit);
}

function toapisSeedance2Seed(ctx: AdapterContext) {
  const raw = firstDefined(ctx.params.seed, ctx.params.randomSeed, ctx.params.random_seed);
  if (raw === undefined) return undefined;
  const seed = Number.parseInt(String(raw), 10);
  return Number.isFinite(seed) ? seed : undefined;
}

async function normalizeToapisSeedance2Result(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractSeedanceTaskId(upstream) || extractVideoTask(upstream) || extractUpstreamTaskId(upstream);
  const resultUrl = extractSeedanceTaskVideoUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractSeedanceTaskStatus(upstream) || extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingDoneResult = done && !urls.length;
  return {
    status: failed || missingDoneResult ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED')),
    progress: failed || missingDoneResult || urls.length ? 100 : extractSeedanceTaskProgress(upstream) || extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId || String((upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'TOAPIS_SEEDANCE2_TASK_FAILED' : (!taskId && !urls.length ? 'TOAPIS_SEEDANCE2_TASK_MISSING' : (missingDoneResult ? 'TOAPIS_SEEDANCE2_RESULT_MISSING' : undefined)),
    errorMessage: failed
      ? extractSeedanceTaskError(upstream)
      : (!taskId && !urls.length ? 'ToAPIs Seedance 2 上游响应未包含任务 ID 或视频 URL' : (missingDoneResult ? 'ToAPIs Seedance 2 任务完成但未返回视频 URL' : undefined)),
  };
}

function resolveZaomengSeedance2ModelName(ctx: AdapterContext) {
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
  if (raw === 'seedance-2.0-fast') return 'seedance-2.0-fast';
  if (raw === 'seedance-2.0-svip') return 'seedance-2.0-svip';
  const hint = [
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.modelKey,
    ctx.provider.defaultModel,
    ctx.provider.providerKey,
    ctx.params.model,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return hint.includes('fast') || hint.includes('快速') ? 'seedance-2.0-fast' : 'seedance-2.0-svip';
}

function resolveZaomengSeedance2Resolution(ctx: AdapterContext) {
  return normalizeAllowedString(ctx.params.resolution || ctx.params.quality || ctx.params.requestedResolution, ['720p', '1080p'], '720p');
}

function resolveZaomengSeedance2Duration(ctx: AdapterContext, resolution: string) {
  const maxSeconds = resolution === '1080p' ? 12 : 15;
  return resolveVideoDurationSeconds(
    ctx,
    resolution,
    ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds,
    5,
    Array.from({ length: maxSeconds }, (_, index) => index + 1),
  );
}

async function collectZaomengSeedance2References(ctx: AdapterContext): Promise<Seedance2SdReferences> {
  const typedRefs = await collectSeedance2SdReferences(ctx);
  const genericRefs = zaomengGenericFileReferences(ctx);
  return {
    images: dedupeSeedance2References([
      ...typedRefs.images.filter(ref => ref.url),
      ...genericRefs.images,
    ]),
    videos: dedupeSeedance2References([
      ...typedRefs.videos.filter(ref => ref.url),
      ...genericRefs.videos,
    ]),
    audios: dedupeSeedance2References([
      ...typedRefs.audios.filter(ref => ref.url),
      ...genericRefs.audios,
    ]),
  };
}

function zaomengGenericFileReferences(ctx: AdapterContext): Seedance2SdReferences {
  const refs: Seedance2SdReferences = { images: [], videos: [], audios: [] };
  const push = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    if (isRecord(value)) {
      const saved = isRecord(value.saved) ? value.saved : {};
      [
        value.remoteUrl,
        value.publicUrl,
        value.objectStorageUrl,
        value.contentUrl,
        value.downloadUrl,
        value.url,
        value.dataUrl,
        value.data_url,
        value.imageUrl,
        value.image_url,
        value.videoUrl,
        value.video_url,
        value.audioUrl,
        value.audio_url,
        saved.remoteUrl,
        saved.url,
        saved.publicUrl,
        saved.objectStorageUrl,
        saved.contentUrl,
        saved.downloadUrl,
      ].forEach(push);
      return;
    }
    const url = String(value || '').trim();
    if (!url) return;
    const kind = inferReferenceMediaTypeFromString(url);
    if (kind === 'image') refs.images.push({ kind, url });
    else if (kind === 'video') refs.videos.push({ kind, url });
    else if (kind === 'audio') refs.audios.push({ kind, url });
  };
  push(ctx.params.files);
  return refs;
}

function assertZaomengSeedance2References(ctx: AdapterContext, refs: Seedance2SdReferences) {
  const total = refs.images.length + refs.videos.length + refs.audios.length;
  if (refs.images.length > 9) fail(400, `造梦 Seedance 2.0 参考图最多 9 张，当前 ${refs.images.length} 张。`, 'ZAOMENG_SEEDANCE2_TOO_MANY_IMAGES');
  if (refs.videos.length > 3) fail(400, `造梦 Seedance 2.0 参考视频最多 3 条，当前 ${refs.videos.length} 条。`, 'ZAOMENG_SEEDANCE2_TOO_MANY_VIDEOS');
  if (refs.audios.length > 3) fail(400, `造梦 Seedance 2.0 参考音频最多 3 条，当前 ${refs.audios.length} 条。`, 'ZAOMENG_SEEDANCE2_TOO_MANY_AUDIOS');
  if (total > 9) fail(400, `造梦 Seedance 2.0 files 最多 9 个，当前 ${total} 个。`, 'ZAOMENG_SEEDANCE2_TOO_MANY_FILES');
  const badVideo = refs.videos.find(ref => ref.url && !isZaomengMp4Url(ref.url));
  if (badVideo?.url) fail(400, '造梦 Seedance 2.0 参考视频 URL 必须以 .mp4 结尾。', 'ZAOMENG_SEEDANCE2_VIDEO_URL_NOT_MP4');
  assertZaomengAudioDurations(ctx);
}

function assertZaomengAudioDurations(ctx: AdapterContext) {
  const values = [...ctx.inputFiles, ctx.params.files].flat();
  const tooShort = values.find(item => {
    if (!isRecord(item) || inferReferenceMediaType(item) !== 'audio') return false;
    const metadata = isRecord(item.metadata) ? item.metadata : {};
    const seconds = Number(firstDefined(
      item.duration,
      item.durationSeconds,
      item.duration_seconds,
      item.rawDuration,
      metadata.duration,
      metadata.durationSeconds,
      metadata.duration_seconds,
    ) || 0);
    return Number.isFinite(seconds) && seconds > 0 && seconds < 3;
  });
  if (tooShort) fail(400, '造梦 Seedance 2.0 参考音频每条不少于 3 秒。', 'ZAOMENG_SEEDANCE2_AUDIO_TOO_SHORT');
}

function zaomengSeedance2Files(refs: Seedance2SdReferences) {
  return [...refs.images, ...refs.videos, ...refs.audios]
    .map(ref => String(ref.url || '').trim())
    .filter(Boolean);
}

function zaomengSeedance2PromptWithMarkers(prompt: string, refs: Seedance2SdReferences) {
  const missingMarkers: string[] = [];
  const addMissing = (prefix: 'IMG' | 'VID' | 'AUD', count: number) => {
    for (let index = 1; index <= count; index += 1) {
      const pattern = new RegExp(`@${prefix}_?${index}\\b`, 'i');
      if (!pattern.test(prompt)) missingMarkers.push(`@${prefix}${index}`);
    }
  };
  addMissing('IMG', refs.images.length);
  addMissing('VID', refs.videos.length);
  addMissing('AUD', refs.audios.length);
  return missingMarkers.length ? `${missingMarkers.join(' ')} ${prompt}` : prompt;
}

function isZaomengMp4Url(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return /\.mp4$/i.test(url.pathname);
  } catch {
    return /\.mp4(?:[?#].*)?$/i.test(raw);
  }
}

async function normalizeZaomengSeedance2SubmitResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractZaomengSeedance2PollTaskId(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingDoneResult = done && !urls.length;
  return {
    status: failed || missingDoneResult ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED')),
    progress: failed || missingDoneResult || urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.task_id || (upstream as any)?.taskId || (upstream as any)?.request_id || (upstream as any)?.requestId || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'ZAOMENG_SEEDANCE2_TASK_FAILED' : (!taskId && !urls.length ? 'ZAOMENG_SEEDANCE2_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? '造梦 Seedance 2.0 上游响应未包含用于轮询的 id 或视频 URL' : undefined),
  };
}

function extractZaomengSeedance2PollTaskId(upstream: unknown) {
  if (isRecord(upstream)) {
    const data = isRecord(upstream.data) ? upstream.data : {};
    const response = isRecord(upstream.response) ? upstream.response : {};
    const direct = [upstream.id, data.id, response.id]
      .map(value => String(value || '').trim())
      .find(Boolean);
    if (direct) return direct;
  }
  return extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || '';
}

async function submitLegacySeedance2Video(ctx: AdapterContext, modelName = resolveSeedance2ModelName(ctx)): Promise<AdapterSubmitResult> {
  const prompt = String(ctx.prompt || '').trim();
  if (!prompt) fail(400, 'Seedance 2 prompt is required', 'SEEDANCE2_PROMPT_REQUIRED');
  const usesArtifexSeedance2Channel = isArtifexSeedance2Channel(ctx, modelName);
  if (usesArtifexSeedance2Channel && prompt.length > 2500) {
    fail(400, 'Seedance 2 prompt 最多 2500 个字符', 'SEEDANCE2_PROMPT_TOO_LONG');
  }
  if (usesArtifexSeedance2Channel) {
    const oversized = ctx.inputFiles.find(item => {
      if (!isRecord(item)) return false;
      const bytes = Number(item.size || item.bytes || item.fileSize || item.file_size || 0);
      return Number.isFinite(bytes) && bytes > 25 * 1024 * 1024;
    });
    if (oversized) fail(400, 'Seedance 2 单个参考素材不能超过 25MB', 'SEEDANCE2_MATERIAL_TOO_LARGE');
    if (ctx.inputFiles.length > 12) {
      fail(400, `Seedance 2 参考素材合计最多 12 个，当前 ${ctx.inputFiles.length} 个`, 'SEEDANCE2_TOO_MANY_MATERIALS');
    }
  }
  const resolution = modelName.includes('1080p') ? '1080p' : (modelName.includes('480p') ? '480p' : '720p');
  const rawBaseImageUrls = buildSoraVideoProImageUrls(ctx);
  const rawExplicitImageUrls = buildSoraVideoProUrlList(ctx, ['image_url', 'imageUrl', 'firstFrame', 'first_frame'], 'image', 100);
  const rawImageUrls = usesArtifexSeedance2Channel
    ? Array.from(new Set([...rawBaseImageUrls, ...rawExplicitImageUrls]))
    : rawBaseImageUrls;
  const rawVideoUrls = buildSoraVideoProUrlList(ctx, [
    'extra_videos', 'extraVideos', 'reference_video_urls', 'referenceVideoUrls',
    'reference_videos', 'referenceVideos', 'reference_video', 'referenceVideo',
    'video', 'videoUrl', 'refVideo', 'video_url',
  ], 'video', 100);
  const rawAudioUrls = buildSoraVideoProUrlList(ctx, [
    'extra_audios', 'extraAudios', 'reference_audio_urls', 'referenceAudioUrls',
    'reference_audios', 'referenceAudios', 'reference_audio', 'referenceAudio',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ], 'audio', 100);
  if (usesArtifexSeedance2Channel) {
    if (rawImageUrls.length > 9) fail(400, 'Seedance 2 extra_images 最多 9 个', 'SEEDANCE2_TOO_MANY_IMAGES');
    if (rawVideoUrls.length > 3) fail(400, 'Seedance 2 extra_videos 最多 3 个', 'SEEDANCE2_TOO_MANY_VIDEOS');
    if (rawAudioUrls.length > 3) fail(400, 'Seedance 2 extra_audios 最多 3 个', 'SEEDANCE2_TOO_MANY_AUDIOS');
  }
  const imageUrls = await materializeSoraVideoProImageUrls(ctx, rawImageUrls, 9);
  const explicitImageUrls = usesArtifexSeedance2Channel
    ? []
    : await materializeSoraVideoProImageUrls(ctx, rawExplicitImageUrls, 1);
  const explicitImageUrl = resolveSoraVideoProExplicitImageUrl(explicitImageUrls[0], imageUrls);
  const videoUrls = await materializeSoraVideoProMediaUrls(ctx, rawVideoUrls, 'video', 3);
  const audioUrls = await materializeSoraVideoProMediaUrls(ctx, rawAudioUrls, 'audio', 3);
  const materialCount = imageUrls.length + (explicitImageUrl ? 1 : 0) + videoUrls.length + audioUrls.length;
  if (usesArtifexSeedance2Channel && materialCount > 12) {
    fail(400, `Seedance 2 参考素材合计最多 12 个，当前 ${materialCount} 个`, 'SEEDANCE2_TOO_MANY_MATERIALS');
  }
  const duration = resolveVideoDurationSeconds(
    ctx,
    resolution,
    ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds,
    5,
    Array.from({ length: 12 }, (_, index) => index + 4),
  );
  const aspectRatio = normalizeAllowedString(
    ctx.params.aspectRatio || ctx.params.aspect_ratio,
    usesArtifexSeedance2Channel ? ['16:9', '9:16', '1:1'] : ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'],
    '16:9',
  );
  const requestJson = compactJson({
    model: modelName,
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    ...(explicitImageUrl ? { image_url: explicitImageUrl } : {}),
    ...(imageUrls.length ? { extra_images: imageUrls } : {}),
    ...(videoUrls.length ? { extra_videos: videoUrls } : {}),
    ...(audioUrls.length ? { extra_audios: audioUrls } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return await normalizeSeedance2VideoTaskResult(ctx, upstream, requestJson);
}

async function querySeedance2Video(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const modelName = resolveSeedance2ModelName(ctx);
  if (!isAiyunzhiSeedance2Protocol(ctx, modelName)) return queryGenericVideo(ctx);
  const isFull = isSeedance2FullModelName(modelName);
  const endpoint = resolveEndpointPath(resolveSeedance2StatusEndpoint(ctx, modelName), { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  const normalized = await normalizeSeedance2VideoTaskResult(ctx, upstream, { taskId: ctx.upstreamTaskId } as Prisma.InputJsonValue);
  if (!isFull && normalized.errorCode === 'SEEDANCE2_RESULT_MISSING') {
    const contentResult = await queryOfficialSd2ContentResult(ctx, endpoint, upstream);
    if (contentResult) return contentResult;
  }
  return normalized;
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
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
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

async function submitSeedanceFullVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const prompt = String(ctx.prompt || '').trim();
  if (!prompt) fail(400, 'Seedance2.0 满血 prompt is required', 'SEEDANCE_FULL_PROMPT_REQUIRED');
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const mediaRefs = buildVideoMediaReferences(ctx);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'], '16:9');
  const resolution = normalizeSeedanceFullResolution(ctx.params.resolution || ctx.params.quality || ctx.params.requestedResolution);
  const seconds = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 10, [10, 11, 12, 13, 14, 15]);
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality', 'requestedResolution',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'endpoint_path', 'statusEndpointPath', 'status_endpoint_path', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo',
    'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
    'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
  ]);
  const requestJson = compactJson({
    model: resolveSeedanceFullModelName(ctx, resolution),
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    seconds,
    ...videoParams,
    ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
    ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls.slice(1) } : {}),
    ...(mediaRefs.videoUrl ? { reference_video: mediaRefs.videoUrl, reference_videos: [mediaRefs.videoUrl] } : {}),
    ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl, audio_urls: [mediaRefs.audioUrl] } : {}),
  });
  const endpoint = resolveEndpointPath(resolveSeedanceFullSubmitEndpointPath(ctx), ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeSeedanceFullTaskResult(ctx, upstream, requestJson);
}

async function querySeedanceFullVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(resolveSeedanceFullStatusEndpointPath(ctx), { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeSeedanceFullTaskResult(ctx, upstream, { taskId: ctx.upstreamTaskId } as Prisma.InputJsonValue);
}

async function normalizeSeedanceFullTaskResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult>;
async function normalizeSeedanceFullTaskResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstream: unknown, requestJson?: undefined): Promise<AdapterQueryResult>;
async function normalizeSeedanceFullTaskResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstream: unknown, requestJson?: Prisma.InputJsonValue): Promise<AdapterSubmitResult | AdapterQueryResult> {
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || String((upstream as any)?.taskId || (upstream as any)?.task_id || (upstream as any)?.id || ctx.upstreamTaskId || '');
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingDoneResult = done && !urls.length;
  const base = {
    status: failed || missingDoneResult ? 'FAILED' as const : (done && urls.length ? 'SUCCESS' as const : (taskId ? 'RUNNING' as const : 'FAILED' as const)),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.taskId || (upstream as any)?.task_id || (upstream as any)?.id || taskId || ''),
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SEEDANCE_FULL_TASK_FAILED' : (missingDoneResult || (!taskId && !urls.length) ? 'SEEDANCE_FULL_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (missingDoneResult || (!taskId && !urls.length) ? 'Seedance2.0 满血上游响应未包含任务 ID 或视频 URL' : undefined),
  };
  return requestJson ? { ...base, requestJson } : base;
}

async function submitLingdongSd2VipVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertLingdongSd2VipRequest(ctx);
  const imageUrls = lingdongSd2VipReferenceUrls(ctx, 'image', [
    'images', 'image', 'image_url', 'imageUrl',
    'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
  ], 9);
  const videoUrls = lingdongSd2VipReferenceUrls(ctx, 'video', [
    'videos', 'video', 'video_url', 'videoUrl',
    'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
    'extra_videos', 'extraVideos',
  ], 3);
  const audioUrls = lingdongSd2VipReferenceUrls(ctx, 'audio', [
    'audios', 'audio', 'audio_url', 'audioUrl',
    'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
    'extra_audios', 'extraAudios',
  ], 3);
  if (audioUrls.length && !imageUrls.length && !videoUrls.length) {
    fail(400, 'sd-2-vip 音频参考不要单独使用，请至少搭配 1 张图片或 1 段视频。', 'LINGDONG_SD2_VIP_AUDIO_REQUIRES_VISUAL');
  }
  const duration = resolveVideoDurationSeconds(
    ctx,
    '720p',
    ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds,
    15,
    [15],
  );
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'orientation', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'size', 'quality', 'resolution',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'videos', 'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo',
    'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls', 'extra_videos', 'extraVideos',
    'audios', 'audio', 'audioUrl', 'refAudio', 'audio_url',
    'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls', 'extra_audios', 'extraAudios',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'sd-2-vip',
    prompt: ctx.prompt,
    orientation: resolveLingdongSd2VipOrientation(ctx),
    size: resolveLingdongSd2VipSize(ctx),
    duration,
    ...videoParams,
    ...(imageUrls.length ? { images: imageUrls } : {}),
    ...(videoUrls.length ? { videos: videoUrls } : {}),
    ...(audioUrls.length ? { audios: audioUrls } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || String((upstream as any)?.id || '');
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'LINGDONG_SD2_VIP_TASK_FAILED' : (!taskId && !urls.length ? 'LINGDONG_SD2_VIP_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'sd-2-vip 上游响应未包含 task_id 或视频 URL' : undefined),
  };
}

async function queryLingdongSd2VipVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const taskParam = String(ctx.params.taskParam || 'taskId');
  const endpoints = videoStatusEndpointCandidates(ctx);
  let bestRunning: AdapterQueryResult | null = null;
  let lastEndpointError: unknown;
  for (const endpointPath of endpoints) {
    const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
    const method = resolveVideoStatusMethod(ctx);
    try {
      const upstream = method === 'POST'
        ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs)
        : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs);
      const normalized = await normalizeVideoQueryResult(ctx, upstream);
      if (normalized.status !== 'RUNNING') return normalized;
      if (!bestRunning || Number(normalized.progress || 0) > Number(bestRunning.progress || 0)) bestRunning = normalized;
    } catch (err) {
      if (!isRetryableVideoStatusEndpointError(err)) throw err;
      lastEndpointError = err;
    }
  }
  if (bestRunning) return bestRunning;
  throw lastEndpointError;
}

async function submitSeedanceTaskVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const requestJson = await buildSeedanceTaskRequestJson(ctx);
  const endpoint = resolveEndpointPath(resolveSeedanceTaskSubmitEndpointPath(ctx), ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeSeedanceTaskSubmitResult(ctx, upstream, requestJson);
}

async function querySeedanceTaskVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(resolveSeedanceTaskStatusEndpointPath(ctx), { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeSeedanceTaskQueryResult(ctx, upstream, ctx.upstreamTaskId);
}

function resolveSeedanceTaskSubmitEndpointPath(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured || configured === '/video/generations') return '/api/v3/contents/generations/tasks';
  return configured;
}

function resolveSeedanceTaskStatusEndpointPath(ctx: AdapterContext) {
  const configured = String(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '').trim();
  if (!configured || configured === '{taskId}' || configured === '/{taskId}' || configured === '/video/status') return '/api/v3/contents/generations/tasks/{taskId}';
  return configured;
}

export async function buildSeedanceTaskRequestJson(ctx: AdapterContext) {
  const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'image_urls',
    'imageUrls',
    'reference_image_urls',
    'referenceImageUrls',
    'reference_images',
    'referenceImages',
    'images',
    'image',
    'imageUrl',
    'image_url',
    'first_frame_image_url',
    'last_frame_image_url',
  ], 'image', 9), 9);
  const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'video_urls',
    'videoUrls',
    'reference_video_urls',
    'referenceVideoUrls',
    'reference_videos',
    'referenceVideos',
    'videos',
    'video',
    'videoUrl',
    'video_url',
    'refVideo',
  ], 'video', 3), 'video', 3);
  const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'audio_urls',
    'audioUrls',
    'reference_audio_urls',
    'referenceAudioUrls',
    'reference_audios',
    'referenceAudios',
    'audios',
    'audio',
    'audioUrl',
    'audio_url',
    'refAudio',
  ], 'audio', 3), 'audio', 3);
  const mode = normalizeSeedanceTaskMode(ctx, imageUrls, videoUrls, audioUrls);
  const refMode = String(ctx.params.refMode || ctx.params.ref_mode || '').trim().toLowerCase();
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: ctx.prompt }];
  let nameIndex = 1;
  imageUrls.forEach((url, index) => {
    const firstLast = mode === 'i2v_first_last' || ['firstlast', 'first-last', 'i2v_first_last'].includes(refMode);
    content.push({
      type: 'image_url',
      image_url: { url },
      role: firstLast ? (index === 0 ? 'first_frame' : index === 1 ? 'last_frame' : 'reference_image') : 'reference_image',
      name: String(nameIndex++),
    });
  });
  videoUrls.forEach(url => {
    content.push({ type: 'video_url', video_url: { url }, role: 'reference_video', name: String(nameIndex++) });
  });
  audioUrls.forEach(url => {
    content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio', name: String(nameIndex++) });
  });

  const duration = resolveVideoDurationSeconds(ctx, ctx.params.resolution || ctx.params.quality || '720p', ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds, 5, [4, 5, 6, 8, 10]);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.ratio, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], '16:9');
  const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
  const size = String(ctx.params.size || ctx.params.pixelSize || '').trim().replace('×', 'x') || seedanceTaskSizeFromRatio(aspectRatio, resolution);
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'ratio', 'requestedRatio',
    'resolution', 'quality', 'size', 'pixelSize',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'videoMode', 'video_mode', 'generateAudio', 'generate_audio',
    'workspaceId', 'workspace_id', 'workspaceName', 'workspace_name',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_urls', 'imageUrls', 'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos',
    'video_urls', 'videoUrls', 'reference_video_urls', 'referenceVideoUrls',
    'audio', 'audioUrl', 'refAudio', 'audio_url', 'reference_audio', 'referenceAudio', 'reference_audios', 'referenceAudios',
    'audio_urls', 'audioUrls', 'reference_audio_urls', 'referenceAudioUrls',
    'seedanceMode', 'seedance_mode',
  ]);

  return compactJson({
    model: ctx.model.name || ctx.provider.defaultModel || 'doubao-seedance-2-0-260128',
    mode,
    prompt: ctx.prompt,
    content,
    duration,
    size,
    ...videoParams,
    ...(ctx.params.function_mode || ctx.params.functionMode ? { function_mode: ctx.params.function_mode || ctx.params.functionMode } : {}),
    aspect_ratio: aspectRatio,
    ratio: aspectRatio,
    resolution,
    quality: resolution,
    ...(ctx.params.fps ? { fps: ctx.params.fps } : {}),
    ...('generateAudio' in ctx.params || 'generate_audio' in ctx.params ? { generate_audio: ctx.params.generateAudio ?? ctx.params.generate_audio } : {}),
    ...('watermark' in ctx.params ? { watermark: Boolean(ctx.params.watermark) } : {}),
  });
}

function normalizeSeedanceTaskMode(ctx: AdapterContext, imageUrls: string[], videoUrls: string[], audioUrls: string[]) {
  const explicit = String(ctx.params.mode || ctx.params.seedanceMode || ctx.params.seedance_mode || '').trim();
  if (explicit) return explicit;
  const refMode = String(ctx.params.refMode || ctx.params.ref_mode || '').trim().toLowerCase();
  const hasReference = Boolean(imageUrls.length || videoUrls.length || audioUrls.length);
  if (ctx.model.name === 'gemini-omni') return videoUrls.length ? 'edit' : hasReference ? 'r2v' : 't2v';
  if (['firstlast', 'first-last', 'i2v_first_last'].includes(refMode) && imageUrls.length >= 2) return 'i2v_first_last';
  return hasReference ? 'reference_material' : 't2v';
}

function seedanceTaskSizeFromRatio(ratio: string, resolution: string) {
  const quality = resolution === '1080p' ? '1080p' : '720p';
  const table720: Record<string, string> = {
    '21:9': '1280x544',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '960x960',
    '4:3': '960x720',
    '3:4': '720x960',
  };
  const table1080: Record<string, string> = {
    '21:9': '1920x816',
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1': '1536x1536',
    '4:3': '1440x1080',
    '3:4': '1080x1440',
  };
  const table = quality === '1080p' ? table1080 : table720;
  return table[ratio] || table['16:9'];
}

async function normalizeSeedanceTaskSubmitResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const normalized = await normalizeSeedanceTaskResult(ctx, upstream);
  return { ...normalized, requestJson };
}

async function normalizeSeedanceTaskQueryResult(ctx: AdapterContext, upstream: unknown, fallbackTaskId = ''): Promise<AdapterQueryResult> {
  return normalizeSeedanceTaskResult(ctx, upstream, fallbackTaskId);
}

async function normalizeSeedanceTaskResult(ctx: AdapterContext, upstream: unknown, fallbackTaskId = ''): Promise<AdapterQueryResult> {
  const taskId = extractSeedanceTaskId(upstream) || fallbackTaskId;
  const statusText = extractSeedanceTaskStatus(upstream);
  const failed = isFinalSeedanceTaskFailed(upstream, statusText, taskId);
  const videoUrl = extractSeedanceTaskVideoUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, videoUrl ? [videoUrl] : extractUrls(upstream));
  const done = isSeedanceTaskDone(statusText) || Boolean(urls.length);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
    progress: done && urls.length ? 100 : extractSeedanceTaskProgress(upstream),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SEEDANCE_TASK_FAILED' : (!taskId && !urls.length ? 'SEEDANCE_TASK_MISSING' : undefined),
    errorMessage: failed ? extractSeedanceTaskError(upstream) : (!taskId && !urls.length ? seedanceTaskMissingResultMessage(ctx, upstream) : undefined),
  };
}

function seedanceTaskMissingResultMessage(ctx: AdapterContext, upstream: unknown) {
  const emptyResponse = isRecord(upstream) && Object.keys(upstream).length === 0;
  const configured = `${ctx.model.endpointPath || ''} ${ctx.provider.endpointPath || ''} ${ctx.model.statusEndpointPath || ''} ${ctx.provider.statusEndpointPath || ''}`;
  if (emptyResponse && configured.includes('/video/')) {
    return 'Seedance Task 上游返回空响应：seedance-task 适配器应使用 /api/v3/contents/generations/tasks，请检查渠道 endpointPath/statusEndpointPath 配置。';
  }
  if (emptyResponse) return 'Seedance Task 上游返回空响应，未包含任务 ID 或视频 URL';
  return 'Seedance Task 上游响应未包含任务 ID 或视频 URL';
}

function parseSeedanceTaskItems(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  let items = payload.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (Array.isArray(items)) return items.filter(isRecord);
  if (isRecord(items)) return [items];
  const data = payload.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) return parseSeedanceTaskItems(data).length ? parseSeedanceTaskItems(data) : [data];
  return [];
}

function extractSeedanceTaskId(payload: unknown) {
  const data = isRecord((payload as any)?.data) ? (payload as any).data : {};
  const direct = String((payload as any)?.id || (payload as any)?.task_id || (payload as any)?.taskId || data.id || data.task_id || data.taskId || '').trim();
  if (direct) return direct;
  for (const item of parseSeedanceTaskItems(payload)) {
    const id = String(item.id || item.task_id || item.taskId || '').trim();
    if (id) return id;
  }
  return '';
}

function extractSeedanceTaskStatus(payload: unknown) {
  const data = isRecord((payload as any)?.data) ? (payload as any).data : {};
  const direct = String((payload as any)?.status || data.status || '').trim().toLowerCase();
  if (direct) return direct;
  for (const item of parseSeedanceTaskItems(payload)) {
    const status = String(item.status || '').trim().toLowerCase();
    if (status) return status;
  }
  return '';
}

function extractSeedanceTaskProgress(payload: unknown) {
  const data = isRecord((payload as any)?.data) ? (payload as any).data : {};
  const candidates = [(payload as any)?.progress, data.progress, ...parseSeedanceTaskItems(payload).map(item => item.progress)];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const parsed = Number(String(candidate).replace('%', ''));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(parsed)));
  }
  return 0;
}

function extractSeedanceTaskVideoUrl(payload: unknown) {
  for (const item of parseSeedanceTaskItems(payload)) {
    const content = isRecord(item.content) ? item.content : {};
    const candidates = [content.video_url, item.video_url, item.url];
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (/^https?:\/\//i.test(raw)) return raw;
    }
  }
  return extractVideoResultUrl(payload);
}

function isSeedanceTaskDone(status: string) {
  return ['completed', 'succeeded', 'success', 'done'].includes(String(status || '').trim().toLowerCase()) || isDoneTaskStatus(status);
}

function isSeedanceTaskFailed(status: string) {
  return ['failed', 'error', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase()) || isFailedTaskStatus(status);
}

function isFinalSeedanceTaskFailed(payload: unknown, status: string, taskId?: string) {
  if (!isSeedanceTaskFailed(status)) return false;
  if (!taskId) return true;
  return !isQueuedOrBusyTaskPayload(payload) && !isQueuedOrBusyTaskMessage(extractSeedanceTaskError(payload));
}

function extractSeedanceTaskError(payload: unknown) {
  const format = (value: unknown) => {
    if (isRecord(value)) {
      const code = String(value.code || value.type || '').trim();
      const message = String(value.message || value.msg || value.error || '').trim();
      return code && message ? `${code}: ${message}` : message || code || JSON.stringify(value);
    }
    return String(value || '').trim();
  };
  const data = isRecord((payload as any)?.data) ? (payload as any).data : {};
  const candidates = [
    (payload as any)?.error,
    (payload as any)?.message,
    (payload as any)?.msg,
    data.error,
    data.message,
    data.msg,
    ...parseSeedanceTaskItems(payload).map(item => item.error || item.message || item.msg),
  ];
  for (const candidate of candidates) {
    const text = format(candidate);
    if (text) return text;
  }
  return extractErrorMessage(payload);
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
  const referenceCandidates = buildGrokVideoReferenceCandidates(ctx).slice(0, 7);
  const references = await resolveGrokVideoReferenceUrls(referenceCandidates);
  if (referenceCandidates.length && !references.length) {
    throw new Error('Grok 视频参考图必须是 HTTPS URL 或 base64 data URL；当前 HTTP 参考图未能转存为 COS，请重新上传参考图后重试');
  }
  const workflowMode = resolveGrokVideoWorkflowMode(ctx, references);
  const inputImageUrl = workflowMode === 'image-to-video' ? references[0] : '';
  const referenceImages = workflowMode === 'reference-to-video' ? references : [];
  const aspectRatio = normalizeGrokVideoAspectRatio(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.size);
  const size = normalizeGrokVideoSize(ctx.params.size || aspectRatio);
  const resolution = normalizeGrokVideoResolution(ctx.params.resolution || ctx.params.quality);
  const seconds = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 6, grokVideoDefaultDurations(ctx));
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'quality', 'size',
    'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
    'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url', 'image_reference',
    'video', 'videoUrl', 'refVideo', 'video_url',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ]);
  const requestJson = compactJson({
    model: ctx.model.name || 'grok-imagine-video',
    prompt: ctx.prompt,
    aspect_ratio: aspectRatio,
    size,
    duration: seconds,
    seconds: String(seconds),
    resolution,
    ...videoParams,
    ...(inputImageUrl ? { image: grokVideoImageReferencePayload(inputImageUrl) } : {}),
    ...(referenceImages.length ? { reference_images: referenceImages.map(grokVideoImageReferencePayload) } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream) || String((upstream as any)?.id || (upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.task_id || '');
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const status = failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED'));
  return {
    status,
    progress: failed || urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: urls.length || failed ? undefined : 'GROK_VIDEO_RESULT_MISSING',
    errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'Grok 视频上游响应未包含任务 ID 或视频 URL' : undefined),
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
  const failed = isFinalFailedTaskStatus(upstream, statusText, ctx.upstreamTaskId);
  const done = isDoneTaskStatus(statusText);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const missingDoneResult = done && !urls.length;
  const coverUrl = extractSeedance2CoverUrl(upstream);
  return {
    status: failed || missingDoneResult ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: ctx.upstreamTaskId,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls, ...(coverUrl ? { coverUrl } : {}) } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'VIDEO_TASK_FAILED' : (missingDoneResult ? 'VIDEO_RESULT_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (missingDoneResult ? '视频任务已完成，但上游没有返回可用的视频 URL。若响应里只有图片/封面 URL，系统不会把它当作视频结果。' : undefined),
  };
}

async function normalizeGeminiVideoResult(ctx: AdapterContext, upstreamTaskId: string, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult>;
async function normalizeGeminiVideoResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstreamTaskId: string, upstream: unknown, requestJson?: undefined): Promise<AdapterQueryResult>;
async function normalizeGeminiVideoResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstreamTaskId: string, upstream: unknown, requestJson?: Prisma.InputJsonValue): Promise<AdapterSubmitResult | AdapterQueryResult> {
  const statusText = extractGeminiVideoStatus(upstream);
  const taskId = upstreamTaskId || extractGeminiVideoTask(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const done = ['success', 'succeeded', 'completed', 'done'].includes(statusText) || (!!urls.length && !['queued', 'processing', 'running'].includes(statusText));
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

function grokVideoDefaultDurations(ctx: AdapterContext) {
  const key = [
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.modelKey,
    ctx.provider.defaultModel,
    ctx.params.model,
  ].map(item => String(item || '').toLowerCase()).join(' ');
  const maxSeconds = key.includes('grok-imagine-video-1.5-preview') || key.includes('grok-imagine-video-1.5-2026-05-30') ? 15 : 10;
  return Array.from({ length: maxSeconds }, (_, index) => index + 1);
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

function normalizeSeedanceFullResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1080' || raw === '1080p') return '1080p';
  return '720p';
}

function resolveSeedanceFullModelName(ctx: AdapterContext, resolution: string) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const modelByResolution = firstDefined(
    ctx.params.modelByResolution,
    ctx.params.model_by_resolution,
    protocol.modelByResolution,
    protocol.model_by_resolution,
    defaults.modelByResolution,
    defaults.model_by_resolution,
    providerDefaults.modelByResolution,
    providerDefaults.model_by_resolution,
  );
  if (isRecord(modelByResolution)) {
    const mapped = String(modelByResolution[resolution] || modelByResolution[resolution.toLowerCase()] || '').trim();
    if (mapped) return mapped;
  }
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || 'sz-seedance2').trim();
  const base = raw.replace(/-(?:480p|720p|1080p)$/i, '') || 'sz-seedance2';
  return resolution === '1080p' ? `${base}-1080p` : base;
}

function resolveSeedanceFullSubmitEndpointPath(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.endpointPath,
    ctx.params.endpoint_path,
    protocol.endpoint_path,
    protocol.endpointPath,
    ctx.model.endpointPath,
    ctx.provider.endpointPath,
    providerDefaults.endpointPath,
    providerDefaults.endpoint_path,
    '/seedance-full/generate',
  )).trim();
  return /\/seedance-full\/generate(?:\/test)?(?:$|[?#])/i.test(configured) ? configured : '/seedance-full/generate';
}

function resolveSeedanceFullStatusEndpointPath(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.statusEndpointPath,
    ctx.params.status_endpoint_path,
    protocol.status_endpoint_path,
    protocol.statusEndpointPath,
    ctx.model.statusEndpointPath,
    ctx.provider.statusEndpointPath,
    providerDefaults.statusEndpointPath,
    providerDefaults.status_endpoint_path,
    '/seedance-full/task/{taskId}',
  )).trim();
  return /\/seedance-full\/task\/\{?taskId\}?(?:$|[?#])/i.test(configured) ? configured : '/seedance-full/task/{taskId}';
}

function resolveSeedance2ModelName(ctx: AdapterContext) {
  const sdModel = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim();
  const providerKey = String(ctx.provider.providerKey || '').trim().toLowerCase();
  if (providerKey === 'artifex-seedance2' && /^seedance-2$/i.test(sdModel)) return 'video-pro-720p';
  if (providerKey === 'artifex-seedance2-fast' && /^seedance-2-fast$/i.test(sdModel)) return 'video-fast-720p';
  if (isArtifexSeedance2ModelName(sdModel)) return sdModel.toLowerCase();
  if (/^(?:sd2-(?:720p|1080p)(?:-fast)?|seedance-2)$/i.test(sdModel)) return sdModel.toLowerCase();
  const requestedResolution = [
    ctx.params.resolution,
    ctx.params.quality,
    ctx.params.videoResolution,
    ctx.params.requestedResolution,
  ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '720p' || item === '1080p') || '720p';
  if (/^sd2-fast$/i.test(sdModel)) return `sd2-${requestedResolution}-fast`;
  if (/^sd2-full$/i.test(sdModel)) return `sd2-${requestedResolution}`;
  if (/^sd2$/i.test(sdModel)) return 'seedance-2';
  const allowed = ['video-fast-480p', 'video-fast-720p', 'video-pro-480p', 'video-pro-720p'];
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
  const exact = allowed.find(item => item === raw);
  const legacyRequestedResolution = [
    ctx.params.resolution,
    ctx.params.quality,
    ctx.params.videoResolution,
    ctx.params.requestedResolution,
  ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '480p' || item === '720p');
  if (exact && !legacyRequestedResolution) return exact;
  const key = [
    ctx.params.model,
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.modelKey,
    ctx.provider.defaultModel,
    ctx.provider.name,
  ].map(item => String(item || '').toLowerCase()).join(' ');
  const quality = (exact || raw).includes('pro') || key.includes('pro') || key.includes('高质量') ? 'pro' : 'fast';
  const resolution = legacyRequestedResolution || (key.includes('480p') ? '480p' : '720p');
  return `video-${quality}-${resolution}`;
}

function isArtifexSeedance2ModelName(modelName: string) {
  return ['seedance-2-fast', 'seedance-2', 'seedance-2-pro-1080p'].includes(String(modelName || '').trim().toLowerCase());
}

function isArtifexSeedance2Channel(ctx: AdapterContext, modelName = resolveSeedance2ModelName(ctx)) {
  const providerKey = String(ctx.provider.providerKey || '').trim().toLowerCase();
  return ['artifex-seedance2-fast', 'artifex-seedance2', 'artifex-seedance2-pro-1080p'].includes(providerKey)
    || isArtifexSeedance2ModelName(modelName);
}

function isSeedance2FullModelName(modelName: string) {
  return String(modelName || '').trim().toLowerCase() === 'seedance-2';
}

function isAiyunzhiSeedance2Protocol(ctx: AdapterContext, modelName = resolveSeedance2ModelName(ctx)) {
  const hay = [
    modelName,
    ctx.provider.baseUrl,
    ctx.provider.providerKey,
    ctx.provider.name,
    ctx.provider.adapter,
    ctx.provider.endpointPath,
    ctx.model.endpointPath,
    ctx.model.statusEndpointPath,
    ctx.model.adapter,
    ctx.model.modelKey,
    ctx.model.displayName,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  return /(?:^|\s)(?:sd2-(?:720p|1080p)(?:-fast)?|seedance-2)(?:\s|$)/.test(` ${hay} `)
    || hay.includes('aiyunzhi.top')
    || hay.includes('seedance2-sd')
    || hay.includes('sd-seedance2')
    || hay.includes('sd-video')
    || hay.includes('/video/generations');
}

function resolveSeedance2SdResolution(ctx: AdapterContext, modelName: string) {
  const model = String(modelName || '').toLowerCase();
  if (model === 'seedance-2') return '720p';
  if (model.includes('1080p')) return '1080p';
  if (model.includes('720p')) return '720p';
  return normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
}

function resolveSeedance2SdDuration(ctx: AdapterContext, modelName: string) {
  if (String(modelName || '').toLowerCase() === 'seedance-2') return 15;
  return resolveVideoDurationSeconds(
    ctx,
    resolveSeedance2SdResolution(ctx, modelName),
    ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds,
    5,
    Array.from({ length: 12 }, (_, index) => index + 4),
  );
}

function resolveSeedance2SdAspectRatio(ctx: AdapterContext, modelName: string) {
  const seedance2Ratios = ['16:9', '9:16', '1:1', '4:3', '21:9'];
  const sd2Ratios = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
  const allowed = String(modelName || '').toLowerCase() === 'seedance-2' ? seedance2Ratios : sd2Ratios;
  return normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, allowed, '16:9');
}

function resolveOfficialSd2ModeType(ctx: AdapterContext, imageRefs: Seedance2SdReference[]) {
  const metadata = isRecord(ctx.params.metadata) ? ctx.params.metadata : {};
  const raw = [
    metadata.modeType,
    metadata.mode_type,
    ctx.params.modeType,
    ctx.params.mode_type,
    ctx.params.videoMode,
    ctx.params.video_mode,
    ctx.params.refMode,
    ctx.params.ref_mode,
    ctx.mode,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
  if (/frames2video|first[-_ ]?last|start[-_ ]?end|首尾/.test(raw) && imageRefs.length >= 2) return 'frames2video';
  if (/image2video|image[-_ ]?to[-_ ]?video|img2video|i2v|首帧/.test(raw) && imageRefs.length >= 1) return 'image2video';
  if (/text2video|text[-_ ]?to[-_ ]?video|t2v|文生/.test(raw)) return 'text2video';
  return imageRefs.length ? 'image2video' : 'text2video';
}

function resolveOfficialSd2EnableSound(ctx: AdapterContext) {
  return resolveOfficialSd2GenerateAudio(ctx) ? 'on' : 'off';
}

function resolveOfficialSd2GenerateAudio(ctx: AdapterContext) {
  const metadata = isRecord(ctx.params.metadata) ? ctx.params.metadata : {};
  const explicit = firstDefined(
    ctx.params.generate_audio,
    ctx.params.generateAudio,
    metadata.generate_audio,
    metadata.generateAudio,
    metadata.enableSound,
    metadata.enable_sound,
    ctx.params.enableSound,
    ctx.params.enable_sound,
  );
  if (explicit == null) return true;
  return normalizeBooleanValue(explicit);
}

type Seedance2SdReference = {
  kind: 'image' | 'video' | 'audio';
  url?: string;
  assetId?: string;
};

type Seedance2SdReferences = {
  images: Seedance2SdReference[];
  videos: Seedance2SdReference[];
  audios: Seedance2SdReference[];
};

async function collectSeedance2SdReferences(ctx: AdapterContext): Promise<Seedance2SdReferences> {
  const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'image_urls', 'imageUrls', 'reference_image_urls', 'referenceImageUrls',
    'reference_images', 'referenceImages', 'images', 'image', 'imageUrl', 'image_url',
    'first_frame_image_url', 'last_frame_image_url', 'content',
  ], 'image', 9), 9);
  const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'video_urls', 'videoUrls', 'reference_video_urls', 'referenceVideoUrls',
    'reference_videos', 'referenceVideos', 'videos', 'video', 'videoUrl', 'video_url', 'refVideo',
    'content',
  ], 'video', 3), 'video', 3);
  const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'audio_urls', 'audioUrls', 'reference_audio_urls', 'referenceAudioUrls',
    'reference_audios', 'referenceAudios', 'audios', 'audio', 'audioUrl', 'audio_url', 'refAudio',
    'content',
  ], 'audio', 3), 'audio', 3);
  const assets = collectSeedance2AssetReferences(ctx);
  return {
    images: dedupeSeedance2References([
      ...imageUrls.map(url => ({ kind: 'image' as const, url })),
      ...assets.filter(item => item.kind === 'image'),
    ]).slice(0, 9),
    videos: dedupeSeedance2References([
      ...videoUrls.map(url => ({ kind: 'video' as const, url })),
      ...assets.filter(item => item.kind === 'video'),
    ]).slice(0, 3),
    audios: dedupeSeedance2References([
      ...audioUrls.map(url => ({ kind: 'audio' as const, url })),
      ...assets.filter(item => item.kind === 'audio'),
    ]).slice(0, 3),
  };
}

function collectSeedance2AssetReferences(ctx: AdapterContext) {
  const refs: Seedance2SdReference[] = [];
  const visit = (value: unknown, expectedKind?: 'image' | 'video' | 'audio') => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, expectedKind));
      return;
    }
    if (typeof value === 'string') {
      const raw = value.trim();
      if (expectedKind && /^asset[_:-][\w.-]+$/i.test(raw)) refs.push({ kind: expectedKind, assetId: raw });
      return;
    }
    if (!isRecord(value)) return;
    const inferred = inferReferenceMediaType(value) || expectedKind || '';
    const assetId = String(firstDefined(
      value.assetId,
      value.asset_id,
      isRecord(value.image_asset) ? value.image_asset.asset_id : undefined,
      isRecord(value.video_asset) ? value.video_asset.asset_id : undefined,
      isRecord(value.audio_asset) ? value.audio_asset.asset_id : undefined,
    ) || '').trim();
    const kind = value.image_asset ? 'image' : value.video_asset ? 'video' : value.audio_asset ? 'audio' : inferred;
    if (assetId && (kind === 'image' || kind === 'video' || kind === 'audio')) refs.push({ kind, assetId });
  };
  ctx.inputFiles.forEach(item => visit(item));
  const assetSources: Array<['image' | 'video' | 'audio' | undefined, unknown]> = [
    ['image', ctx.params.image_assets], ['image', ctx.params.imageAssets],
    ['video', ctx.params.video_assets], ['video', ctx.params.videoAssets],
    ['audio', ctx.params.audio_assets], ['audio', ctx.params.audioAssets],
    [undefined, ctx.params.content],
  ];
  assetSources.forEach(([kind, value]) => visit(value, kind));
  return dedupeSeedance2References(refs);
}

function dedupeSeedance2References(refs: Seedance2SdReference[]) {
  const seen = new Set<string>();
  return refs.filter(ref => {
    const key = `${ref.kind}:${ref.url || ''}:${ref.assetId || ''}`;
    if (!ref.url && !ref.assetId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSeedance2SdContent(prompt: string, refs: Seedance2SdReferences) {
  const content: Array<Record<string, unknown>> = [];
  refs.images.forEach(ref => content.push(seedance2ContentReference(ref)));
  refs.videos.forEach(ref => content.push(seedance2ContentReference(ref)));
  refs.audios.forEach(ref => content.push(seedance2ContentReference(ref)));
  content.push({ type: 'text', text: prompt });
  return content;
}

function seedance2ContentReference(ref: Seedance2SdReference) {
  if (ref.assetId) {
    const type = `${ref.kind}_asset`;
    return { type, [type]: { asset_id: ref.assetId } };
  }
  const type = `${ref.kind}_url`;
  return { type, [type]: { url: ref.url } };
}

function seedance2MultipartReferences(refs: Seedance2SdReferences) {
  const needsMultipart = [...refs.images, ...refs.videos, ...refs.audios]
    .some(ref => ref.url && !/^https?:\/\//i.test(ref.url));
  if (!needsMultipart) return { images: [], videos: [], audios: [], total: 0 };
  const withUrl = (items: Seedance2SdReference[]) => items.filter(ref => ref.url);
  const images = withUrl(refs.images);
  const videos = withUrl(refs.videos);
  const audios = withUrl(refs.audios);
  return { images, videos, audios, total: images.length + videos.length + audios.length };
}

function seedance2AllUrlReferences(refs: Seedance2SdReferences) {
  const withUrl = (items: Seedance2SdReference[]) => items.filter(ref => ref.url);
  const images = withUrl(refs.images);
  const videos = withUrl(refs.videos);
  const audios = withUrl(refs.audios);
  return { images, videos, audios, total: images.length + videos.length + audios.length };
}

function resolveSeedance2GenerateAudio(ctx: AdapterContext) {
  if ('generate_audio' in ctx.params) return normalizeBooleanValue(ctx.params.generate_audio);
  if (ctx.params.generateAudio === true) return true;
  return undefined;
}

function normalizeBooleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  return Boolean(value);
}

function resolveSeedance2SubmitEndpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured || configured === '/videos') return '/video/generations';
  if (/\/video\/generations\/multipart$/i.test(configured)) return configured.replace(/\/multipart$/i, '');
  return configured;
}

function resolveOfficialSd2SubmitEndpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured || /\/video\/generations(?:\/multipart)?$/i.test(configured)) return '/videos';
  return resolveEndpointPath(configured, ctx);
}

function resolveSeedance2StatusEndpoint(ctx: AdapterContext, modelName: string) {
  const configured = String(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '').trim();
  if (isSeedance2FullModelName(modelName)) return configured || '/video/generations/{taskId}';
  if (!configured || /\/video\/generations\/\{taskId\}$/i.test(configured)) return '/videos/{taskId}';
  return configured;
}

function resolveSeedance2MultipartEndpoint(ctx: AdapterContext) {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const configured = String(firstDefined(
    ctx.params.multipartEndpointPath,
    ctx.params.multipart_endpoint_path,
    protocol.multipartEndpointPath,
    protocol.multipart_endpoint_path,
    providerDefaults.multipartEndpointPath,
    providerDefaults.multipart_endpoint_path,
  ) || '').trim();
  if (configured) return resolveEndpointPath(configured, ctx);
  const submit = resolveSeedance2SubmitEndpoint(ctx);
  if (/\/video\/generations$/i.test(submit)) return resolveEndpointPath(`${submit}/multipart`, ctx);
  return resolveEndpointPath('/video/generations/multipart', ctx);
}

async function buildSeedance2VideoForm(
  requestJson: Prisma.InputJsonValue,
  refs: { images: Seedance2SdReference[]; videos: Seedance2SdReference[]; audios: Seedance2SdReference[] },
  timeoutMs: number,
) {
  const request: Record<string, unknown> = isRecord(requestJson) ? requestJson as Record<string, unknown> : {};
  const form = new FormData();
  form.set('model', String(request.model || 'seedance-2'));
  form.set('prompt', seedance2RequestPrompt(request));
  form.set('aspect_ratio', String(request.aspect_ratio || '16:9'));
  form.set('resolution', String(request.resolution || '720p'));
  form.set('duration', String(request.duration || 15));
  if ('generate_audio' in request) form.set('generate_audio', String(Boolean(request.generate_audio)));
  for (const ref of refs.images) {
    const file = await compatibleMediaRefToBlob(String(ref.url || ''), timeoutMs, 'image', 'Seedance 2.0 图片参考');
    form.append('images', file.blob, file.filename);
  }
  for (const ref of refs.videos) {
    const file = await compatibleMediaRefToBlob(String(ref.url || ''), timeoutMs, 'video', 'Seedance 2.0 视频参考');
    form.append('videos', file.blob, file.filename);
  }
  for (const ref of refs.audios) {
    const file = await compatibleMediaRefToBlob(String(ref.url || ''), timeoutMs, 'audio', 'Seedance 2.0 音频参考');
    form.append('audios', file.blob, file.filename);
  }
  return form;
}

function seedance2RequestPrompt(request: Record<string, unknown>) {
  const direct = String(request.prompt || '').trim();
  if (direct) return direct;
  const content = Array.isArray(request.content) ? request.content : [];
  const text = content.find(item => isRecord(item) && item.type === 'text');
  return isRecord(text) ? String(text.text || '') : '';
}

async function queryOfficialSd2ContentResult(ctx: AdapterContext & { upstreamTaskId: string }, statusEndpoint: string, statusPayload: unknown): Promise<AdapterQueryResult | null> {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const configured = String(protocol.contentEndpointPath || protocol.content_endpoint_path || '').trim();
  const endpointPath = configured ? resolveEndpointPath(configured, { ...ctx, taskId: ctx.upstreamTaskId }) : `${statusEndpoint.replace(/\/+$/, '')}/content`;
  try {
    const upstream = await callUpstreamGetJson(ctx.provider, endpointPath, {}, ctx.timeoutMs);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    if (!urls.length) return null;
    return {
      status: 'SUCCESS',
      progress: 100,
      upstreamTaskId: ctx.upstreamTaskId,
      responseJson: { status: statusPayload, content: upstream } as Prisma.InputJsonValue,
      resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
      resultUrls: urls,
    };
  } catch (err) {
    console.warn('[generation] official SD2 content fallback failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function normalizeSeedance2VideoTaskResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const missingDoneResult = done && !urls.length;
  const coverUrl = extractSeedance2CoverUrl(upstream);
  return {
    status: failed || missingDoneResult ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED')),
    progress: failed || missingDoneResult || urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId || String((upstream as any)?.task_id || (upstream as any)?.taskId || (upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls, ...(coverUrl ? { coverUrl } : {}) } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SEEDANCE2_TASK_FAILED' : (!taskId && !urls.length ? 'SEEDANCE2_TASK_MISSING' : (missingDoneResult ? 'SEEDANCE2_RESULT_MISSING' : undefined)),
    errorMessage: failed
      ? extractErrorMessage(upstream)
      : (!taskId && !urls.length ? 'Seedance 2.0 上游响应未包含任务 ID 或视频 URL' : (missingDoneResult ? 'Seedance 2.0 任务完成但未返回视频 URL' : undefined)),
  };
}

function extractSeedance2CoverUrl(upstream: unknown) {
  const source = isRecord(upstream) ? upstream : {};
  const data = isRecord(source.data) ? source.data : {};
  const result = isRecord(source.result) ? source.result : {};
  return String(
    source.cover_url
    || source.coverUrl
    || data.cover_url
    || data.coverUrl
    || result.cover_url
    || result.coverUrl
    || '',
  ).trim();
}

function normalizeSeedance2VipResolution(value: unknown) {
  return normalizeAllowedString(value, ['720p', '1080p'], '720p');
}

function normalizeSeedance2VipSeconds(value: unknown) {
  return String(normalizeAllowedNumber(value, [5, 10, 15], 5));
}

function assertLingdongSd2VipRequest(ctx: AdapterContext) {
  const prompt = String(ctx.prompt || '').trim();
  const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
  const maxPromptLength = normalizePositiveInt(caps.maxPromptLength ?? caps.max_prompt_length) || 4000;
  if (!prompt) fail(400, 'sd-2-vip prompt 为必填。', 'LINGDONG_SD2_VIP_PROMPT_REQUIRED');
  if (prompt.length > maxPromptLength) {
    fail(400, `sd-2-vip prompt 建议最多 ${maxPromptLength} 个字符，当前 ${prompt.length} 个。`, 'LINGDONG_SD2_VIP_PROMPT_TOO_LONG');
  }
  assertLingdongSd2VipMaterialSizes(ctx);
}

function lingdongSd2VipReferenceUrls(
  ctx: AdapterContext,
  mediaType: 'image' | 'video' | 'audio',
  keys: string[],
  limit: number,
) {
  const urls = buildSoraVideoProUrlList(ctx, keys, mediaType, limit)
    .map(item => String(item || '').trim())
    .filter(item => isPublicHttpUrl(item));
  const unique = Array.from(new Set(urls));
  if (unique.length > limit) {
    const label = mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频';
    fail(400, `sd-2-vip ${label}参考最多 ${limit} 个，当前 ${unique.length} 个。`, 'LINGDONG_SD2_VIP_TOO_MANY_REFERENCES');
  }
  return unique;
}

function resolveLingdongSd2VipOrientation(ctx: AdapterContext) {
  const raw = String(ctx.params.orientation || '').trim().toLowerCase();
  if (['portrait', 'landscape', 'square'].includes(raw)) return raw;
  const ratio = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || '').trim();
  if (/^1\s*:\s*1$/.test(ratio)) return 'square';
  const parts = ratio.split(':').map(item => Number(item));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[0] > 0 && parts[1] > 0) {
    return parts[0] < parts[1] ? 'portrait' : 'landscape';
  }
  return 'portrait';
}

function resolveLingdongSd2VipSize(ctx: AdapterContext) {
  const raw = String(ctx.params.size || ctx.params.quality || ctx.params.resolution || '').trim().toLowerCase();
  if (raw === 'small' || raw.includes('480')) return 'small';
  if (raw === 'large' || raw.includes('720')) return 'large';
  return 'large';
}

function assertLingdongSd2VipMaterialSizes(ctx: AdapterContext) {
  const limitsMb = { image: 30, video: 50, audio: 15 } as const;
  const oversize = ctx.inputFiles.find(item => {
    if (!isRecord(item)) return false;
    const kind = inferReferenceMediaType(item);
    if (!kind) return false;
    const limitMb = limitsMb[kind];
    const size = Number(
      item.bytes
      ?? item.size
      ?? item.fileSize
      ?? item.file_size
      ?? (isRecord(item.metadata) ? item.metadata.size ?? item.metadata.fileSize ?? item.metadata.file_size : 0)
      ?? 0,
    );
    return Number.isFinite(size) && size > limitMb * 1024 * 1024;
  });
  if (!oversize || !isRecord(oversize)) return;
  const kind = inferReferenceMediaType(oversize);
  if (!kind) return;
  const label = kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频';
  fail(400, `sd-2-vip ${label}参考素材单文件不能超过 ${limitsMb[kind]}MB。`, 'LINGDONG_SD2_VIP_MATERIAL_TOO_LARGE');
}

function normalizeGrokImageCount(value: unknown) {
  const raw = Number.parseInt(String(value || 1), 10);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.min(10, raw));
}

const GROK_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20', 'auto'] as const;
const GROK_IMAGE_ASPECT_RATIO_SET = new Set<string>(GROK_IMAGE_ASPECT_RATIOS);

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

function resolveGrokImageRequestGeometry(ctx: AdapterContext) {
  const explicitAspectRatio = normalizeGrokImageAspectRatio(firstDefined(
    ctx.params.aspect_ratio,
    ctx.params.aspectRatio,
    ctx.params.requestedRatio,
    ctx.params.ratio,
  ), '');
  const aspectRatio = explicitAspectRatio || normalizeGrokImageAspectRatio(firstDefined(
    ctx.params.requestedPixelSize,
    ctx.params.imageSize,
    ctx.params.size,
  ), '1:1');
  const sizeCandidate = explicitAspectRatio
    ? firstGrokImageSizeMatchingAspectRatio(aspectRatio, ctx.params.requestedPixelSize, ctx.params.imageSize) || aspectRatio
    : firstDefined(ctx.params.requestedPixelSize, ctx.params.imageSize, ctx.params.size, aspectRatio);
  return {
    size: normalizeGrokImageRequestSize(ctx, sizeCandidate),
    aspectRatio,
    resolution: normalizeGrokImageResolution(ctx.params.resolution || ctx.params.requestedResolution || ctx.params.quality),
  };
}

function firstGrokImageSizeMatchingAspectRatio(aspectRatio: string, ...values: unknown[]) {
  for (const value of values) {
    if (!value) continue;
    if (normalizeGrokImageAspectRatio(value, '') === aspectRatio) return value;
  }
  return '';
}

function resolveGrokImageEndpoint(ctx: AdapterContext, kind: 'generation' | 'edit') {
  const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
  const specific = kind === 'edit'
    ? ctx.params.editEndpointPath || ctx.params.imageEditEndpointPath || protocol.editEndpointPath || protocol.edit_endpoint_path || providerDefaults.editEndpointPath || providerDefaults.imageEditEndpointPath
    : ctx.params.generationEndpointPath || ctx.params.imageGenerationEndpointPath || protocol.generationEndpointPath || protocol.generation_endpoint_path || providerDefaults.generationEndpointPath || providerDefaults.imageGenerationEndpointPath;
  const configured = String(specific || ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (kind === 'edit') {
    if (!configured || /\/images\/generations(?:\?|$|\/)?/i.test(configured)) return '/images/edits';
    return configured;
  }
  if (!configured || /\/images\/edits(?:\?|$|\/)?/i.test(configured)) return '/images/generations';
  return configured;
}

function normalizeGrokImageSize(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  if (GROK_IMAGE_ASPECT_RATIO_SET.has(raw)) return raw;
  const direct = ['1024x1024', '2048x2048', '1792x1024', '1024x1792', '1536x1024', '1024x1536', '1280x720', '720x1280'].find(size => size === raw);
  if (direct) return direct;
  const ratio = ratioFromSize(raw);
  switch (ratio) {
    case '16:9': return '1792x1024';
    case '9:16': return '1024x1792';
    case '4:3': return '4:3';
    case '3:4': return '3:4';
    case '3:2': return '1536x1024';
    case '2:3': return '1024x1536';
    case '2:1': return '2:1';
    case '1:2': return '1:2';
    case '19.5:9': return '19.5:9';
    case '9:19.5': return '9:19.5';
    case '20:9': return '20:9';
    case '9:20': return '9:20';
    case '1:1': return '1024x1024';
    default: return '1:1';
  }
}

function normalizeGrokImageAspectRatio(value: unknown, fallback = '1:1') {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  if (GROK_IMAGE_ASPECT_RATIO_SET.has(raw)) return raw;
  const ratio = ratioFromSize(raw);
  return GROK_IMAGE_ASPECT_RATIO_SET.has(ratio) ? ratio : fallback;
}

function normalizeGrokImageResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '2k') return '2K';
  return '1K';
}

function normalizeGrokVideoSize(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const direct = ['1280x720', '720x1280', '1792x1024', '1024x1792'].find(size => size === raw);
  if (direct) return direct;
  if (raw === '3:4') return '720x1280';
  if (raw === '4:3') return '1280x720';
  switch (ratioFromSize(raw)) {
    case '9:16':
      return '720x1280';
    case '2:3':
      return '1024x1792';
    case '3:2':
      return '1792x1024';
    default:
      return '1280x720';
  }
}

function normalizeGrokVideoResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '480p') return '480p';
  return '720p';
}

function normalizeGrokVideoAspectRatio(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
  const direct = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].find(item => item === raw);
  if (direct) return direct;
  const ratio = ratioFromSize(raw);
  return ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].includes(ratio) ? ratio : '16:9';
}

function resolveGrokVideoWorkflowMode(ctx: AdapterContext, references: string[]) {
  const raw = [
    ctx.mode,
    ctx.params.videoMode,
    ctx.params.grokVideoMode,
    ctx.params.xaiVideoMode,
    ctx.params.mode,
    ctx.params.referenceMode,
    ctx.params.reference_mode,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
  if (/reference[-_ ]?to[-_ ]?video|reference/.test(raw)) return 'reference-to-video';
  if (/image[-_ ]?to[-_ ]?video|img2video|i2v/.test(raw) && references.length) return 'image-to-video';
  if (references.length === 1) return 'image-to-video';
  if (references.length > 1) return 'reference-to-video';
  return 'text-to-video';
}

function grokVideoImageReferencePayload(url: string) {
  return { url };
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
    ['3:1', 3],
    ['1:3', 1 / 3],
    ['21:9', 21 / 9],
    ['9:21', 9 / 21],
    ['20:9', 20 / 9],
    ['19.5:9', 19.5 / 9],
    ['9:19.5', 9 / 19.5],
    ['9:20', 9 / 20],
    ['2:1', 2],
    ['1:2', 1 / 2],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
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

function extractGenericVideoProgress(payload: unknown, statusText = ''): number {
  const data = (payload as any)?.data;
  const first = Array.isArray(data) ? data[0] : data;
  const explicit = [
    (payload as any)?.progress,
    (payload as any)?.progress_percent,
    (payload as any)?.progressPercent,
    (payload as any)?.percentage,
    (payload as any)?.percent,
    (payload as any)?.task?.progress,
    (payload as any)?.result?.progress,
    (payload as any)?.video?.progress,
    first?.progress,
    first?.progress_percent,
    first?.progressPercent,
    first?.data?.progress,
    findGenericProgressValue(payload, 0),
  ].map(normalizeGenericProgressValue).find((value): value is number => value !== null && value > 0);
  if (explicit !== undefined) return explicit;

  const normalized = normalizeTaskStatusValue(statusText) || extractTaskStatusText(payload);
  if (['pending', 'queued', 'queue', 'created', 'submitted'].includes(normalized)) return 8;
  if (['dispatched', 'dispatching'].includes(normalized)) return 18;
  if (['processing', 'running', 'in_progress', 'generating'].includes(normalized)) return 35;
  return extractVideoTask(payload) ? 5 : 0;
}

function normalizeGenericProgressValue(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).trim().replace('%', ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(99, Math.round(parsed)));
}

function findGenericProgressValue(value: unknown, depth: number): unknown {
  if (!value || depth > 5 || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGenericProgressValue(item, depth + 1);
      if (found !== undefined && found !== null && found !== '') return found;
    }
    return undefined;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(progress|progress_percent|progressPercent|percentage|percent)$/i.test(key)) return item;
    if (item && typeof item === 'object') {
      const found = findGenericProgressValue(item, depth + 1);
      if (found !== undefined && found !== null && found !== '') return found;
    }
  }
  return undefined;
}

function publicImageReferenceCandidateValues(value: unknown): unknown[][] {
  if (!value) return [];
  if (typeof value === 'string') return [[value]];
  if (Array.isArray(value)) return value.flatMap(item => publicImageReferenceCandidateValues(item));
  if (!isRecord(value)) return [];
  const saved = isRecord(value.saved) ? value.saved : {};
  const imageUrl = value.image_url;
  const camelImageUrl = value.imageUrl;
  return [[
    value.fallbackRemoteUrl,
    value.remoteFallbackUrl,
    value.objectStorageUrl,
    value.publicUrl,
    value.contentUrl,
    value.downloadUrl,
    value.cosUrl,
    value.cos_url,
    saved.fallbackRemoteUrl,
    saved.remoteFallbackUrl,
    saved.objectStorageUrl,
    saved.publicUrl,
    saved.contentUrl,
    saved.downloadUrl,
    value.remoteUrl,
    value.url,
    value.localUrl,
    value.localPath,
    value.path,
    value.dataUrl,
    isRecord(camelImageUrl) ? camelImageUrl.url : camelImageUrl,
    isRecord(imageUrl) ? imageUrl.url : imageUrl,
    saved.remoteUrl,
    saved.url,
    saved.localUrl,
    saved.localPath,
    saved.path,
    value.uploadRef,
    value.providerRef,
    value.fileId,
    value.file_id,
    value.id,
    saved.fileId,
    saved.file_id,
    saved.id,
  ]];
}

async function resolvePublicImageReferenceCandidate(value: unknown, timeoutMs: number, options: { allowLocalFiles?: boolean } = {}) {
  if (!value) return '';
  if (isRecord(value)) {
    return resolvePublicImageReferenceCandidate(value.url || value.image_url || value.imageUrl || value.remoteUrl || value.localUrl, timeoutMs, options);
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  if (isGenerationResultPath(raw)) return materializeGenerationResultReferenceUrl(raw);
  if (options.allowLocalFiles) {
    const localPath = resolveSafeLocalImageReferencePath(raw);
    if (localPath) return localImageFileRef(localPath);
  }
  if (/^file-[\w-]+$/i.test(raw)) {
    const fallbackUrl = await getUploadedFileFallbackUrlAsync(raw, timeoutMs);
    return fallbackUrl ? materializeGenerationResultReferenceUrl(fallbackUrl) : '';
  }
  const publicUrl = resolvePublicReferenceImageUrl(raw);
  return publicUrl ? materializeGenerationResultReferenceUrl(publicUrl) : '';
}

async function resolvePublicImageReferenceCandidateGroup(values: unknown[], timeoutMs: number, options: { allowLocalFiles?: boolean } = {}) {
  const refs: string[] = [];
  for (const value of values) {
    const ref = await resolvePublicImageReferenceCandidate(value, timeoutMs, options);
    if (ref) refs.push(ref);
  }
  return Array.from(new Set(refs));
}

async function collectPublicImageReferenceUrlGroups(ctx: AdapterContext, timeoutMs = 15000, options: { allowLocalFiles?: boolean } = {}) {
  const rawGroups: unknown[][] = [];
  const push = (value: unknown) => {
    rawGroups.push(...publicImageReferenceCandidateValues(value));
  };
  ctx.inputFiles.forEach(push);
  const rawImages = ctx.params.reference_images || ctx.params.referenceImages || ctx.params.images || ctx.params.image || ctx.params.input_image;
  if (Array.isArray(rawImages)) rawImages.forEach(push);
  else push(rawImages);

  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const rawGroup of rawGroups) {
    const group = await resolvePublicImageReferenceCandidateGroup(rawGroup, timeoutMs, options);
    if (!group.length) continue;
    const key = group.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(group);
  }
  return groups;
}

async function collectPublicImageReferenceUrls(ctx: AdapterContext, timeoutMs = 15000) {
  const groups = await collectPublicImageReferenceUrlGroups(ctx, timeoutMs);
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

async function collectGrokImageRefs(ctx: AdapterContext) {
  return collectPublicImageReferenceUrls(ctx);
}

function localImageFileRef(filePath: string) {
  return `${LOCAL_IMAGE_FILE_REF_PREFIX}${filePath}`;
}

function isLocalImageFileRef(value: string) {
  return String(value || '').startsWith(LOCAL_IMAGE_FILE_REF_PREFIX);
}

function localImageFileRefPath(value: string) {
  return isLocalImageFileRef(value) ? String(value || '').slice(LOCAL_IMAGE_FILE_REF_PREFIX.length) : '';
}

function resolveSafeLocalImageReferencePath(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidates: string[] = [];
  try {
    const parsed = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(raw, 'http://local');
    if (parsed.pathname === '/api/workbench/image-studio/file') {
      const filePath = parsed.searchParams.get('path') || '';
      if (filePath) candidates.push(filePath);
    }
  } catch {
    // fall through to direct path handling
  }
  candidates.push(raw);
  if (!path.isAbsolute(raw)) {
    candidates.push(
      path.resolve(process.cwd(), raw),
      path.resolve(process.cwd(), '..', raw),
      path.resolve(process.cwd(), '..', '..', raw),
      path.resolve(process.cwd(), '..', '..', '..', raw)
    );
  }
  const allowedRoots = [GENERATED_IMAGE_DIR, ...CANVAS_LOCAL_ASSET_DIRS].map(root => path.resolve(root));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const normalized = resolved.split(path.sep).join('/');
    const allowed = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep))
      || normalized.includes('/runninghub_outputs/image-studio-v3/');
    if (allowed && /\.(?:png|jpe?g|webp|gif)$/i.test(resolved)) return resolved;
  }
  return '';
}

async function localImageFileRefToBlob(ref: string) {
  const filePath = localImageFileRefPath(ref);
  const safePath = resolveSafeLocalImageReferencePath(filePath);
  if (!safePath) fail(400, '参考图本地文件不在允许目录内，已拒绝读取', 'IMAGE_REFERENCE_LOCAL_FILE_INVALID');
  try {
    const bytes = await fs.readFile(safePath);
    const mime = normalizeImageMime(inferImageMimeType(safePath));
    return { blob: new Blob([bytes], { type: mime }), filename: path.basename(safePath) || `reference.${imageExtFromMime(mime)}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(400, `参考图本地文件读取失败：${message}`, 'IMAGE_REFERENCE_LOCAL_FILE_READ_FAILED');
  }
}

const imageReferenceBaseFetchHeaders = {
  'User-Agent': 'Mozilla/5.0 (compatible; CanvasGenerationBot/1.0)',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*',
};

function imageReferenceFetchHeaders() {
  const headers: Record<string, string> = { ...imageReferenceBaseFetchHeaders };
  const origin = imageReferenceRequestOrigin();
  if (origin) {
    headers.Origin = origin;
    headers.Referer = `${origin}/`;
  }
  return headers;
}

function imageReferenceRequestOrigin() {
  const candidates = [
    config.publicBaseUrl,
    config.objectStorage.publicBaseUrl,
    ...config.corsOrigins.filter(item => item && item !== '*'),
  ];
  for (const candidate of candidates) {
    try {
      return new URL(String(candidate || '').trim()).origin;
    } catch {
      // keep scanning configured origins
    }
  }
  return '';
}

async function imageRefCandidatesToBlob(refs: string[], timeoutMs: number, toBlob: (ref: string, timeoutMs: number) => Promise<{ blob: Blob; filename: string }>) {
  const candidates = Array.from(new Set((refs || []).map(ref => String(ref || '').trim()).filter(Boolean)));
  let lastError: unknown = null;
  for (const ref of candidates) {
    try {
      return await toBlob(ref, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof HttpError) throw lastError;
  if (lastError) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    fail(400, `参考图下载失败：${message}`, 'IMAGE_REFERENCE_FETCH_FAILED');
  }
  fail(400, '参考图必须是公网 URL 或 data URI', 'IMAGE_REFERENCE_INVALID');
}

async function grokImageRefToBlob(ref: string, timeoutMs: number) {
  const raw = String(ref || '').trim();
  if (/^data:image\//i.test(raw)) return dataUriToBlob(raw);
  if (isLocalImageFileRef(raw)) return localImageFileRefToBlob(raw);
  if (!/^https?:\/\//i.test(raw)) fail(400, 'Grok 图生图参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_INVALID');

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal, headers: imageReferenceFetchHeaders() });
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
  if (isLocalImageFileRef(raw)) return localImageFileRefToBlob(raw);
  if (!/^https?:\/\//i.test(raw)) fail(400, `${label}参考图必须是公网 URL 或 data URI`, 'IMAGE_REFERENCE_INVALID');

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal, headers: imageReferenceFetchHeaders() });
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

async function compatibleMediaRefToBlob(ref: string, timeoutMs: number, mediaType: 'image' | 'video' | 'audio', label: string) {
  const raw = String(ref || '').trim();
  if (mediaType === 'image') return compatibleImageRefToBlob(raw, timeoutMs, label);
  const dataMatch = raw.match(/^data:((?:video|audio)\/[^;]+);base64,(.+)$/i);
  if (dataMatch) {
    const mime = dataMatch[1].toLowerCase();
    if (!mime.startsWith(`${mediaType}/`)) fail(400, `${label}类型不匹配`, 'MEDIA_REFERENCE_TYPE_MISMATCH');
    const bytes = Buffer.from(dataMatch[2].replace(/\s+/g, ''), 'base64');
    return { blob: new Blob([bytes], { type: mime }), filename: `reference.${mediaExtensionFromMime(mime, mediaType)}` };
  }
  if (!/^https?:\/\//i.test(raw)) fail(400, `${label}必须是公网 URL 或 data URI`, 'MEDIA_REFERENCE_INVALID');

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(raw, { signal: controller.signal });
    if (!resp.ok) fail(400, `${label}下载失败 HTTP ${resp.status}`, 'MEDIA_REFERENCE_FETCH_FAILED');
    const mime = String(resp.headers.get('content-type') || inferMediaMimeType(raw, mediaType)).split(';')[0].trim().toLowerCase();
    if (mime && !mime.startsWith(`${mediaType}/`) && mime !== 'application/octet-stream') {
      fail(400, `${label}返回类型不正确：${mime}`, 'MEDIA_REFERENCE_TYPE_MISMATCH');
    }
    const bytes = await resp.arrayBuffer();
    const safeMime = mime || inferMediaMimeType(raw, mediaType);
    return { blob: new Blob([bytes], { type: safeMime }), filename: `reference.${mediaExtensionFromMime(safeMime, mediaType)}` };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    fail(400, `${label}下载失败：${message}`, 'MEDIA_REFERENCE_FETCH_FAILED');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mediaExtensionFromMime(mime: string, mediaType: 'video' | 'audio') {
  const raw = String(mime || '').toLowerCase();
  if (raw.includes('webm')) return 'webm';
  if (raw.includes('quicktime')) return 'mov';
  if (raw.includes('wav')) return 'wav';
  if (raw.includes('aac')) return 'aac';
  if (raw.includes('mp4') || raw.includes('m4a')) return mediaType === 'video' ? 'mp4' : 'm4a';
  return mediaType === 'video' ? 'mp4' : 'mp3';
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
    if (result.b64 && isUrlOnlyImageResponseType(responseType)) {
      return {
        status: 'FAILED',
        progress: 100,
        upstreamRequestId: String((upstream as any)?.id || (upstream as any)?.request_id || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
        resultJson: { url: '', mimeType: result.mimeType, outputs: [] } as Prisma.InputJsonValue,
        resultUrls: [],
        errorCode: 'UPSTREAM_IMAGE_URL_UNAVAILABLE',
        errorMessage: '上游未按 response_format=url 返回图片 URL，只返回了 b64_json；当前渠道配置要求使用中转站 URL 预览，已阻止下发 base64。请确认上游是否支持 URL 返回，或改用 base64 异步转存模式。',
      };
    }
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

function isUrlOnlyImageResponseType(responseType: ImageResponseType) {
  return responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'server_async_object_storage';
}

function extractImageOutputUrls(payload: unknown) {
  return Array.from(new Set([
    ...extractGptImageV2Urls(payload),
    ...extractUrls(payload),
  ]));
}

function imageOutputMissingErrorCode(payload: unknown) {
  const message = extractErrorMessage(payload);
  if (/policy|safety|safe|moderation|blocked|refusal|refused|content|can(?:not|'?t|’t)\s+generate|unable\s+to\s+generate/i.test(message)) return 'UPSTREAM_IMAGE_REJECTED';
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
  if (responseType === 'server_async_object_storage') {
    if (directUrl && !/^data:image\//i.test(directUrl)) return directUrl;
    return '';
  }
  if (responseType === 'server_base64_async_object_storage') {
    if (result.b64) {
      const inline = inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
      return await persistInlineImageLocalPreview(inline, result.mimeType || 'image/png') || inline;
    }
    if (/^data:image\//i.test(directUrl)) {
      return await persistInlineImageLocalPreview(directUrl, result.mimeType || 'image/png') || directUrl;
    }
    return directUrl || '';
  }
  if (responseType === 'server_base64_object_storage') {
    if (result.b64) return persistInlineImage(result.b64, result.mimeType || 'image/png');
    if (/^data:image\//i.test(directUrl)) return persistInlineImage(directUrl, result.mimeType || 'image/png');
    if (directUrl) return materializeImageResultUrl(provider, directUrl);
    return '';
  }
  if (responseType === 'base64') {
    if (result.b64) return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
    if (/^data:image\//i.test(directUrl)) return directUrl;
    return directUrl || '';
  }
  if (responseType === 'provider_url' || responseType === 'server_object_storage') {
    if (directUrl) return directUrl;
    return '';
  }
  if (/^data:image\//i.test(directUrl)) return persistInlineImage(directUrl, result.mimeType || 'image/png');
  if (directUrl) return materializeImageResultUrl(provider, directUrl);
  if (result.b64) return persistInlineImage(result.b64, result.mimeType || 'image/png');
  return '';
}

async function resolveImageResultUrls(provider: UpstreamProvider, urls: string[], responseType: ImageResponseType) {
  if (responseType === 'server_base64_object_storage') return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, urls));
  if (responseType === 'server_base64_async_object_storage') return absolutizeProviderUrls(provider, urls);
  const clean = urls.filter(url => !/^data:image\//i.test(url));
  if (responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'server_async_object_storage' || responseType === 'base64') return absolutizeProviderUrls(provider, clean);
  return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
}

async function resolveVideoResultUrls(ctx: AdapterContext, urls: string[]) {
  const clean = urls.filter(isVideoResultUrlCandidate);
  const responseType = resolveImageResponseType(ctx);
  const absolute = absolutizeProviderUrls(ctx.provider, clean);
  const hasProtectedProviderUrl = absolute.some(url => isProtectedProviderResultUrl(ctx.provider, url));
  if ((responseType === 'provider_url' || responseType === 'base64') && !hasProtectedProviderUrl) return absolute;
  return materializeMediaResultUrls(ctx.provider, absolute, 'video');
}

function isVideoResultUrlCandidate(url: unknown) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (/^data:video\//i.test(raw)) return true;
  if (/^data:/i.test(raw)) return false;
  if (/\/v1\/images\/results\//i.test(raw)) return false;
  if (/\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(raw)) return false;
  return true;
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
  const raw = decodeUrlEntityEscapes(value);
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
  const parsed = parseInlineImageValue(value, mimeType);
  if (!parsed) return '';
  const objectStorageUrl = await uploadImageBufferToObjectStorageBestEffort(parsed.bytes, `generated.${parsed.ext}`, parsed.mime);
  if (objectStorageUrl) return objectStorageUrl;
  const fallbackUrl = await persistInlineImageLocalFallback(parsed.bytes, parsed.ext);
  if (fallbackUrl) return fallbackUrl;
  return '';
}

async function persistInlineImageLocalPreview(value: string, mimeType = 'image/png') {
  const parsed = parseInlineImageValue(value, mimeType);
  if (!parsed) return '';
  return persistInlineImageLocalFallback(parsed.bytes, parsed.ext);
}

function parseInlineImageValue(value: string, mimeType = 'image/png') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  const mime = match?.[1] || mimeType || 'image/png';
  const b64 = (match?.[2] || raw).replace(/\s+/g, '');
  const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('gif') ? 'gif' : 'png';
  const bytes = Buffer.from(b64, 'base64');
  if (!bytes.length) return null;
  return { bytes, ext, mime };
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
    const resp = await fetch(rawUrl, { signal: controller.signal, headers: providerResultFetchHeaders(provider, rawUrl) });
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

export async function materializeMediaResultUrl(provider: UpstreamProvider, value: string, mediaType: 'video' | 'audio' = 'video') {
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
    const resp = await fetch(rawUrl, { signal: controller.signal, headers: providerResultFetchHeaders(provider, rawUrl) });
    if (!resp.ok) return '';
    const rawContentType = String(resp.headers.get('content-type') || inferMediaMimeType(rawUrl, mediaType)).split(';')[0].trim().toLowerCase();
    if (mediaType === 'video' && !/^video\//i.test(rawContentType)) return '';
    if (mediaType === 'audio' && !/^audio\//i.test(rawContentType)) return '';
    const contentType = normalizeMediaMime(rawContentType, mediaType);
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

function providerResultFetchHeaders(provider: UpstreamProvider, rawUrl: string): Record<string, string> | undefined {
  try {
    const target = new URL(rawUrl);
    const base = new URL(String(provider.baseUrl || '').trim().replace(/\/+$/, '') || rawUrl);
    if (target.origin !== base.origin) return undefined;
    const apiKey = decryptSecret(provider.apiKeyEncrypted || '');
    return apiKey ? { Authorization: `Bearer ${apiKey}`, Accept: '*/*' } : undefined;
  } catch {
    return undefined;
  }
}

export function isProtectedProviderResultUrl(provider: UpstreamProvider, rawUrl: string) {
  try {
    const target = new URL(String(rawUrl || '').trim());
    const base = new URL(String(provider.baseUrl || '').trim().replace(/\/+$/, '') || rawUrl);
    if (target.origin !== base.origin) return false;
    const hint = [
      provider.providerKey,
      provider.name,
      provider.adapter,
      provider.baseUrl,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return /lingdong|灵动/.test(hint) && /^\/v1\/videos\/[^/]+\/content\/?$/i.test(target.pathname);
  } catch {
    return false;
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

function normalizeGptImageV2Resolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (/^[1-4]k$/.test(raw)) return raw.toUpperCase();
  const sizeMatch = raw.match(/(\d{3,5})[x×](\d{3,5})/i);
  if (sizeMatch) {
    const longSide = Math.max(Number(sizeMatch[1]), Number(sizeMatch[2]));
    if (longSide >= 3500) return '4K';
    if (longSide >= 2500) return '3K';
    if (longSide >= 1500) return '2K';
    return '1K';
  }
  if (/^(?:uhd|4k|4096|3840|2160p)$/.test(raw)) return '4K';
  if (/^(?:3k|3072|2880|1800p)$/.test(raw)) return '3K';
  if (/^(?:qhd|2k|2048|1920|1440p)$/.test(raw)) return '2K';
  return '1K';
}

function resolveGptImageV2ModelName(modelName: unknown, resolution: unknown) {
  const baseModel = normalizeGptImageV2BaseModel(modelName);
  const normalizedResolution = normalizeGptImageV2Resolution(resolution);
  if (normalizedResolution === '1K' || normalizedResolution === '3K') return baseModel;
  return `${baseModel}-${normalizedResolution.toLowerCase()}`;
}

function normalizeGptImageV2BaseModel(modelName: unknown) {
  const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
  return raw.replace(/-(?:1|2|3|4)k$/i, '');
}

async function buildGptImageV2ReferenceImages(ctx: AdapterContext) {
  return collectPublicImageReferenceUrls(ctx);
}

function addGrokVideoReferenceCandidate(refs: Set<string>, value: unknown) {
  if (!value) return;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return;
    if (/^data:image\//i.test(raw) || isGenerationResultPath(raw)) {
      refs.add(raw);
      return;
    }
    const publicUrl = resolvePublicReferenceImageUrl(raw);
    if (publicUrl) refs.add(publicUrl);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => addGrokVideoReferenceCandidate(refs, item));
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const saved = isRecord(obj.saved) ? obj.saved : {};
    [
      obj.image_url,
      isRecord(obj.image_url) ? obj.image_url.url : undefined,
      obj.imageUrl,
      isRecord(obj.imageUrl) ? obj.imageUrl.url : undefined,
      obj.remoteUrl,
      obj.providerRef,
      obj.uploadRef,
      obj.fileId,
      obj.file_id,
      obj.id,
      obj.url,
      obj.dataUrl,
      saved.remoteUrl,
      saved.url,
      saved.cachedDataUrl,
    ].forEach(item => addGrokVideoReferenceCandidate(refs, item));
  }
}

function buildGrokVideoReferenceCandidates(ctx: AdapterContext) {
  const refs = new Set<string>();
  [
    ctx.params.image_url,
    ctx.params.imageUrl,
    ctx.params.image,
    ctx.params.input_image,
    ctx.params.image_reference,
    ctx.params.first_frame_image_url,
    ctx.params.last_frame_image_url,
    ctx.params.reference_image_urls,
    ctx.params.referenceImageUrls,
    ctx.params.reference_images,
    ctx.params.referenceImages,
    ctx.params.images,
  ].forEach(value => addGrokVideoReferenceCandidate(refs, value));
  if (!refs.size) ctx.inputFiles.forEach(item => addGrokVideoReferenceCandidate(refs, item));
  return Array.from(refs);
}

async function resolveGrokVideoReferenceUrls(candidates: string[]) {
  const refs: string[] = [];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    let resolved = raw;
    if (isGenerationResultPath(raw)) resolved = await materializeGenerationResultReferenceUrl(raw);
    if (/^(https:|data:image\/)/i.test(resolved) && !refs.includes(resolved)) refs.push(resolved);
  }
  return refs;
}

function buildVideoReferenceUrls(ctx: AdapterContext) {
  const refs = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (!referenceMatchesMediaType(value, 'image')) return;
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

function buildSoraVideoProImageUrls(ctx: AdapterContext) {
  return buildSoraVideoProUrlList(ctx, [
    'extra_images',
    'extraImages',
    'reference_image_urls',
    'referenceImageUrls',
    'reference_images',
    'referenceImages',
    'images',
    'image',
  ], 'image', 9);
}

async function materializeSoraVideoProImageUrls(ctx: AdapterContext, urls: string[], limit: number) {
  const resolved: string[] = [];
  for (const url of urls) {
    if (resolved.length >= limit) break;
    const next = await materializeImageResultUrl(ctx.provider, url);
    if (next && !resolved.includes(next)) resolved.push(next);
  }
  return resolved;
}

async function materializeSoraVideoProMediaUrls(ctx: AdapterContext, urls: string[], mediaType: 'video' | 'audio', limit: number) {
  const resolved: string[] = [];
  for (const url of urls) {
    if (resolved.length >= limit) break;
    const next = await materializeMediaResultUrl(ctx.provider, url, mediaType);
    if (next && !resolved.includes(next)) resolved.push(next);
  }
  return resolved;
}

function resolveSoraVideoProExplicitImageUrl(explicitImageUrl: string | undefined, extraImageUrls: string[]) {
  const explicit = String(explicitImageUrl || '').trim();
  if (!explicit) return '';
  if (!extraImageUrls.length) return explicit;
  if (extraImageUrls.includes(explicit)) return '';
  return extraImageUrls.length < 9 ? explicit : '';
}

function buildSoraVideoProUrlList(ctx: AdapterContext, keys: string[], mediaType: 'image' | 'video' | 'audio', _limit: number) {
  const refs = new Set<string>();
  const push = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    if (!referenceMatchesMediaType(value, mediaType)) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return;
      if (mediaType === 'image') {
        const publicUrl = resolvePublicReferenceImageUrl(raw);
        if (publicUrl) refs.add(publicUrl);
      } else if (isPublicHttpUrl(raw) || new RegExp(`^data:${mediaType}/`, 'i').test(raw)) {
        refs.add(raw);
      }
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
        obj.publicUrl,
        obj.objectStorageUrl,
        obj.contentUrl,
        obj.downloadUrl,
        saved.remoteUrl,
        saved.url,
        saved.publicUrl,
        saved.objectStorageUrl,
        saved.contentUrl,
        saved.downloadUrl,
        obj.url,
        obj.dataUrl,
        obj.data_url,
        obj.imageUrl,
        obj.image_url,
        obj.videoUrl,
        obj.video_url,
        obj.audioUrl,
        obj.audio_url,
        isRecord(obj.image_url) ? obj.image_url.url : undefined,
        isRecord(obj.video_url) ? obj.video_url.url : undefined,
        isRecord(obj.audio_url) ? obj.audio_url.url : undefined,
      ].forEach(push);
    }
  };
  keys.forEach(key => push(ctx.params[key]));
  ctx.inputFiles.forEach(push);
  return Array.from(refs);
}

function referenceMatchesMediaType(value: unknown, expected: 'image' | 'video' | 'audio') {
  const actual = inferReferenceMediaType(value);
  return !actual || actual === expected;
}

function inferReferenceMediaType(value: unknown): 'image' | 'video' | 'audio' | '' {
  if (!value) return '';
  if (Array.isArray(value)) {
    const kinds = Array.from(new Set(value.map(inferReferenceMediaType).filter(Boolean)));
    return kinds.length === 1 ? kinds[0] : '';
  }
  if (typeof value === 'string') return inferReferenceMediaTypeFromString(value);
  if (!isRecord(value)) return '';

  const declared = [
    value.mediaType,
    value.media_type,
    value.kind,
    value.contentType,
    value.content_type,
    value.mimeType,
    value.mime_type,
    value.type,
  ].map(item => String(item || '').trim().toLowerCase()).find(Boolean);
  if (declared) {
    if (declared === 'image' || declared.startsWith('image/') || declared === 'image_url' || declared === 'image_asset') return 'image';
    if (declared === 'video' || declared.startsWith('video/') || declared === 'video_url' || declared === 'video_asset') return 'video';
    if (declared === 'audio' || declared.startsWith('audio/') || declared === 'audio_url' || declared === 'audio_asset') return 'audio';
  }
  if (value.audioUrl || value.audio_url) return 'audio';
  if (value.videoUrl || value.video_url) return 'video';
  if (value.imageUrl || value.image_url) return 'image';

  const saved = isRecord(value.saved) ? value.saved : {};
  const candidates = [
    value.remoteUrl,
    value.publicUrl,
    value.objectStorageUrl,
    value.contentUrl,
    value.downloadUrl,
    value.url,
    saved.remoteUrl,
    saved.url,
    saved.publicUrl,
    saved.objectStorageUrl,
    saved.contentUrl,
    saved.downloadUrl,
  ];
  for (const candidate of candidates) {
    const kind = inferReferenceMediaTypeFromString(candidate);
    if (kind) return kind;
  }
  return '';
}

function inferReferenceMediaTypeFromString(value: unknown): 'image' | 'video' | 'audio' | '' {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return 'image';
  if (raw.startsWith('data:video/')) return 'video';
  if (raw.startsWith('data:audio/')) return 'audio';
  const path = raw.split(/[?#]/, 1)[0];
  if (/\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(path)) return 'image';
  if (/\.(?:mp4|mov|webm|m4v|avi|mkv|mpeg|mpg)$/i.test(path)) return 'video';
  if (/\.(?:mp3|wav|m4a|aac|ogg|oga|flac|opus|wma)$/i.test(path)) return 'audio';
  return '';
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
    if (/^(https?:\/\/|\/?v1\/(?:images\/results|files|videos)\/|\/?(?:images\/results|files|videos)\/)/i.test(raw)) urls.add(raw);
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
  if (/\/v1\/images\/edits$/i.test(configured)) return '/v1/images/generations';
  if (/\/images\/edits$/i.test(configured)) return '/v1/images/generations';
  return configured;
}

function absolutizeProviderUrl(provider: UpstreamProvider, value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/)/i.test(raw)) return raw;
  const providerRelative = normalizeProviderRelativeResultPath(raw);
  if (!providerRelative) return raw;
  try {
    return new URL(providerRelative, provider.baseUrl.replace(/\/+$/, '') + '/').toString();
  } catch {
    return raw;
  }
}

function normalizeProviderRelativeResultPath(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/?v1\/(?:images\/results|files|videos)\//i.test(raw)) return raw.startsWith('/') ? raw : `/${raw}`;
  if (/^\/?(?:images\/results|files|videos)\//i.test(raw)) return `/v1/${raw.replace(/^\/+/, '')}`;
  if (raw.startsWith('/')) return raw;
  return '';
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
      if (/^(https?:\/\/|\/?v1\/(?:images\/results|files|videos)\/|\/?(?:images\/results|files|videos)\/)/i.test(value)) urls.add(value);
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
  if (/^(pending|queued|queue|dispatched|dispatching|processing|running|in_progress|generating|submitted|created)$/i.test(raw) || /排队|等待|处理中|进行中|生成中/.test(raw)) return raw;
  return '';
}

function isFailedTaskStatus(status: string) {
  return normalizeTaskStatusValue(status) === 'failed';
}

function isFinalFailedTaskStatus(payload: unknown, status: string, taskId?: string) {
  if (!isFailedTaskStatus(status)) return false;
  if (!taskId) return true;
  return !isQueuedOrBusyTaskPayload(payload);
}

function isDoneTaskStatus(status: string) {
  return normalizeTaskStatusValue(status) === 'completed';
}

function isQueuedOrBusyTaskPayload(payload: unknown) {
  const status = extractTaskStatusText(payload);
  if (isQueuedOrRunningTaskStatus(status)) return true;
  const message = extractErrorMessage(payload);
  return isQueuedOrBusyTaskMessage(message);
}

function isQueuedOrRunningTaskStatus(status: string) {
  const normalized = normalizeTaskStatusValue(status);
  return ['pending', 'queued', 'queue', 'dispatched', 'dispatching', 'processing', 'running', 'in_progress', 'generating', 'submitted', 'created'].includes(normalized);
}

function isQueuedOrBusyTaskMessage(message: string) {
  return /当前繁忙|系统繁忙|服务繁忙|服务器繁忙|请求繁忙|任务繁忙|排队|队列|等待|稍后.*重试|请稍后|资源紧张|暂时不可用|temporarily unavailable|busy|capacity|queued?|queue|pending|try again later|please try again|submitted|processing/i.test(String(message || ''));
}

function extractErrorMessage(payload: unknown) {
  const responsesOutputMessage = extractResponsesOutputTextMessage(payload);
  if (responsesOutputMessage) return responsesOutputMessage;
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
    if (isNonUserFacingErrorMetadataKey(key)) continue;
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

function extractResponsesOutputTextMessage(payload: unknown): string {
  const outputs = Array.isArray((payload as any)?.output) ? (payload as any).output : [];
  for (const item of outputs) {
    const itemType = String(item?.type || '').trim();
    if (itemType && itemType !== 'message') continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = formatErrorMessageValue(part?.text);
      if (text) return text;
    }
  }
  return '';
}

function isNonUserFacingErrorMetadataKey(key: string) {
  return /^(?:id|user|safety_identifier|safetyIdentifier|prompt_cache_key|promptCacheKey|previous_response_id|previousResponseId|request_id|requestId|response_id|responseId)$/i.test(String(key || ''));
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
