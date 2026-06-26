import { Router } from 'express';
import { Prisma, type ModelType, type ModelUsageStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { decryptSecret, encryptSecret } from '../../security.js';
import { adminRoles } from '../../types.js';
import { buildEndpoint, testUpstreamProvider } from '../../upstream.js';
import { defaultPricingDefaults, IMAGE_PRICING_TIERS, VIDEO_PRICING } from '../../pricing.js';

const router = Router();
const GPT_IMAGE_2_MAIN_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'] as const;

function looksLikeLanguageModelName(modelName: string) {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw || /gpt[-_ ]?image|image|imagen|imagine|flux|sdxl|midjourney|niji|sora|veo/.test(raw)) return false;
  return /^(gpt[-_ ]?(?:3|4|4o|5)|gpt\d|deepseek|qwen|glm|claude|grok[-_ ]?4|gemini[-_ ]?(?:1|2|3)(?:[._-]|$))/.test(raw);
}

function normalizeClientModelType(type: ModelType, modelName: string, displayName: string, adapter: string) {
  if (type === 'IMAGE' && !/image|img|imagine|edit|gpt-image|gemini-image|grok-image/i.test(adapter) && looksLikeLanguageModelName(`${modelName} ${displayName}`)) return 'LLM' as ModelType;
  return type;
}

function normalizeRequestedModelType(value: unknown): ModelType | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (['llm', 'text', 'chat', 'language', 'large-language-model', 'large_language_model', '大语言模型', '文本模型'].includes(key)) return 'LLM';
  if (['image', 'img', 'picture', '生图模型', '图片模型'].includes(key)) return 'IMAGE';
  if (['video', 'movie', '生视频模型', '视频模型'].includes(key)) return 'VIDEO';
  const upper = raw.toUpperCase();
  return ['IMAGE', 'VIDEO', 'LLM'].includes(upper) ? upper as ModelType : null;
}

function defaultEndpointPathForClientType(type: ModelType) {
  if (type === 'LLM') return '/chat/completions';
  return undefined;
}

function normalizeClientModelSupports(supports: Prisma.JsonValue | null, adapter: string, type: ModelType) {
  const base = supports && typeof supports === 'object' && !Array.isArray(supports)
    ? { ...(supports as Record<string, unknown>) }
    : {};
  if (type === 'LLM') return { ...base, chat: base.chat !== false, text: base.text !== false };
  if (type !== 'IMAGE') return supports || base;
  if (adapter === 'grok-image') {
    return {
      ...base,
      txt2img: base.txt2img !== false,
      img2img: false,
      imageToImage: false,
      storyboard: base.storyboard !== false,
      panorama: false,
    };
  }
  if (['openai-edits', 'gpt-image-v2', 'gemini-image', 'gemini-image-edit', 'grok-image-edit'].includes(adapter)) {
    return {
      ...base,
      txt2img: adapter === 'gemini-image-edit' ? false : base.txt2img !== false,
      img2img: true,
      imageToImage: true,
      storyboard: true,
      panorama: ['gemini-image-edit', 'grok-image-edit'].includes(adapter) ? false : base.panorama === false ? false : true,
    };
  }
  if (adapter === 'gemini-image-generate') {
    return {
      ...base,
      txt2img: base.txt2img !== false,
      img2img: false,
      imageToImage: false,
      storyboard: base.storyboard !== false,
      panorama: false,
    };
  }
  return base;
}

function defaultImageSupports(adapter: string, type: ModelType): Prisma.InputJsonValue | undefined {
  if (type !== 'IMAGE') return undefined;
  if (adapter === 'grok-image') {
    return {
      txt2img: true,
      img2img: false,
      imageToImage: false,
      storyboard: true,
      panorama: false,
    } as Prisma.InputJsonValue;
  }
  if (adapter === 'gemini-image-generate') {
    return {
      txt2img: true,
      img2img: false,
      imageToImage: false,
      storyboard: true,
      panorama: false,
    } as Prisma.InputJsonValue;
  }
  const imageToImage = ['openai-edits', 'gpt-image-v2', 'gemini-image', 'gemini-image-edit', 'grok-image-edit'].includes(adapter);
  return {
    txt2img: ['grok-image-edit', 'gemini-image-edit'].includes(adapter) ? false : true,
    img2img: imageToImage,
    imageToImage,
    storyboard: true,
    panorama: ['grok-image-edit', 'gemini-image-edit'].includes(adapter) ? false : imageToImage,
  } as Prisma.InputJsonValue;
}

function videoCapabilityPreset(modelName: string, displayName = '') {
  const key = `${modelName} ${displayName}`.toLowerCase();
  if (key.includes('veo-3.1') || key.includes('veo 3.1')) {
    return {
      resolutions: ['720p', '1080p'],
      durations: [4, 6, 8],
      defaultDuration: 6,
      defaultResolution: '720p',
      aspectRatios: ['16:9', '9:16'],
      maxImages: { full: 4, smartMultiFrame: 4, firstLast: 2 },
      supportsAudio: false,
      supportsVideo: false,
    };
  }
  if (key.includes('grok-imagine') || key.includes('grok video') || key.includes('grok-video')) {
    return {
      resolutions: ['480p', '720p'],
      durations: [6, 10, 12, 15, 30],
      defaultDuration: 6,
      defaultResolution: '720p',
      aspectRatios: ['16:9', '9:16', '3:2', '2:3', '1:1'],
      maxImages: { full: 4, smartMultiFrame: 4, firstLast: 2 },
      supportsAudio: false,
      supportsVideo: false,
    };
  }
  if (key.includes('sora-2') && !key.includes('v3')) {
    return {
      resolutions: ['720p'],
      durations: [4, 8, 12],
      defaultDuration: 12,
      defaultResolution: '720p',
      maxImages: { full: 1, smartMultiFrame: 0, firstLast: 0 },
      supportsAudio: false,
      supportsVideo: false,
      supportsLastFrame: false,
      maxVideos: 0,
      maxAudios: 0,
    };
  }
  if (key.includes('sora-v3-pro') || key.includes('sora-v3-vip') || key.includes('sora-v3-fast')) {
    return { resolutions: ['720p'], durations: [5, 10, 15], defaultDuration: 15, defaultResolution: '720p', supportsAudio: false, supportsVideo: true };
  }
  if (key.includes('seedance2.0-vip') || key.includes('seedance2-vip') || key.includes('seedance-2.0-vip') || key.includes('seedance 2.0 vip') || key.includes('sora-vip3-pro')) {
    return {
      resolutions: ['720p', '1080p'],
      durations: [5, 10, 15],
      defaultDuration: 5,
      defaultResolution: '720p',
      aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
      supportsAudio: true,
      supportsVideo: true,
      supportsLastFrame: true,
      maxVideos: 1,
      maxAudios: 1,
      maxVideoDurationSeconds: 15,
      maxAudioDurationSeconds: 14.9,
    };
  }
  return { resolutions: ['720p'], durations: [5, 10, 15], defaultDuration: 5, defaultResolution: '720p', supportsAudio: false, supportsVideo: true };
}

function normalizeVideoCapabilities(capabilities: Prisma.JsonValue | null, modelName: string, displayName: string, type: ModelType) {
  if (type !== 'VIDEO') return capabilities;
  const base = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
    ? { ...(capabilities as Record<string, unknown>) }
    : {};
  const preset = videoCapabilityPreset(modelName, displayName);
  return normalizeVideoDurationCapabilities({ ...preset, ...base });
}

function normalizeVideoDurationCapabilities(source: Record<string, unknown>) {
  const next = { ...source };
  const maxSeconds = normalizePositiveInt(next.maxVideoDurationSeconds ?? next.max_video_duration_seconds);
  const maxByResolution = normalizeVideoMaxDurationByResolution(next.maxVideoDurationSecondsByResolution ?? next.max_video_duration_seconds_by_resolution);
  const rawDurations = Array.isArray(next.durations) ? next.durations : [];
  let durations = rawDurations
    .map(value => normalizePositiveInt(value))
    .filter((value): value is number => Boolean(value));
  const rawDurationsByResolution = normalizeVideoDurationsByResolution(next.durationsByResolution ?? next.durations_by_resolution);
  const resolutions = normalizeVideoResolutionList(next.resolutions);
  const durationsByResolution: Record<string, number[]> = {};
  for (const resolution of resolutions) {
    const key = normalizeVideoResolutionKey(resolution);
    const resolutionMax = maxByResolution[key] || maxSeconds;
    const configured = rawDurationsByResolution[key] || durations;
    let allowed = configured.map(value => normalizePositiveInt(value)).filter((value): value is number => Boolean(value));
    if (resolutionMax) {
      allowed = allowed.length ? allowed.filter(value => value <= resolutionMax) : defaultVideoDurationOptions(resolutionMax);
      if (!allowed.includes(resolutionMax)) allowed.push(resolutionMax);
      allowed = allowed.filter(value => value <= resolutionMax);
    }
    allowed = Array.from(new Set(allowed)).sort((a, b) => a - b);
    if (allowed.length) durationsByResolution[key] = allowed;
  }
  if (maxSeconds) {
    durations = durations.length ? durations.filter(value => value <= maxSeconds) : defaultVideoDurationOptions(maxSeconds);
    if (!durations.includes(maxSeconds)) durations.push(maxSeconds);
    durations = durations.filter(value => value <= maxSeconds);
    next.maxVideoDurationSeconds = maxSeconds;
    next.max_video_duration_seconds = maxSeconds;
  }
  durations = Array.from(new Set(durations)).sort((a, b) => a - b);
  const durationUnion = Object.values(durationsByResolution).flat();
  if (durationUnion.length) durations = Array.from(new Set([...durations, ...durationUnion])).sort((a, b) => a - b);
  if (durations.length) next.durations = durations;
  if (Object.keys(durationsByResolution).length) {
    next.durationsByResolution = durationsByResolution;
    next.durations_by_resolution = durationsByResolution;
  }
  if (Object.keys(maxByResolution).length) {
    next.maxVideoDurationSecondsByResolution = maxByResolution;
    next.max_video_duration_seconds_by_resolution = maxByResolution;
  }
  const defaultDuration = normalizePositiveInt(next.defaultDuration ?? next.default_duration);
  if (durations.length) next.defaultDuration = defaultDuration && durations.includes(defaultDuration) ? defaultDuration : durations[durations.length - 1];
  return next as Prisma.InputJsonValue;
}

function normalizePositiveInt(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}

function defaultVideoDurationOptions(maxSeconds: number) {
  return [4, 5, 8, 10, 12, 15, 20, 30, 60, 90, 120].filter(value => value <= maxSeconds);
}

function normalizeVideoResolutionKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeVideoResolutionList(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const values = source.map(item => String(item || '').trim()).filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.length ? unique : ['720p'];
}

function normalizeVideoMaxDurationByResolution(value: unknown) {
  const source = jsonObject(value) || {};
  const out: Record<string, number> = {};
  Object.entries(source).forEach(([key, raw]) => {
    const normalizedKey = normalizeVideoResolutionKey(key);
    const seconds = normalizePositiveInt(raw);
    if (normalizedKey && seconds) out[normalizedKey] = seconds;
  });
  return out;
}

function normalizeVideoDurationsByResolution(value: unknown) {
  const source = jsonObject(value) || {};
  const out: Record<string, number[]> = {};
  Object.entries(source).forEach(([key, raw]) => {
    const normalizedKey = normalizeVideoResolutionKey(key);
    const values = Array.isArray(raw)
      ? raw.map(item => normalizePositiveInt(item)).filter((item): item is number => Boolean(item))
      : [];
    if (normalizedKey && values.length) out[normalizedKey] = Array.from(new Set(values)).sort((a, b) => a - b);
  });
  return out;
}

router.get('/models', requireAuth, asyncHandler(async (req, res) => {
  const requestedType = normalizeRequestedModelType(req.query.type);
  const where: Prisma.AiModelWhereInput = {
    status: 'ACTIVE',
    ...(requestedType && requestedType !== 'LLM' ? { type: requestedType } : {}),
    ...(requestedType === 'LLM' ? {} : { provider: { status: 'ACTIVE' } }),
  };
  const models = await prisma.aiModel.findMany({
    where,
    select: {
      id: true,
      name: true,
      displayName: true,
      modelKey: true,
      type: true,
      unit: true,
      salePrice: true,
      pricePerSecond: true,
      creditsPerUsdCost: true,
      markupRate: true,
      supports: true,
      defaults: true,
	      capabilities: true,
	      modelAssembly: true,
	      adapter: true,
	      endpointPath: true,
	      statusEndpointPath: true,
	      uploadMode: true,
	      protocol: true,
	      ui: true,
      status: true,
      provider: {
        select: {
          id: true,
          providerKey: true,
          name: true,
          adapter: true,
          baseUrl: true,
          endpointPath: true,
          statusEndpointPath: true,
          uploadMode: true,
          requestMethod: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const items = models.map(model => {
    const adapter = model.adapter || model.provider.adapter || (model.type === 'LLM' ? 'openai-chat' : '');
    const clientType = normalizeClientModelType(model.type, model.name, model.displayName, adapter);
    const endpointPath = model.endpointPath || model.provider.endpointPath || defaultEndpointPathForClientType(clientType);
    const statusEndpointPath = model.statusEndpointPath || model.provider.statusEndpointPath;
    return {
      ...model,
      type: clientType,
      modelType: clientType,
      model: model.name,
      modelNick: model.displayName,
      displayName: model.displayName,
      enabled: model.status === 'ACTIVE',
      isEnabled: model.status === 'ACTIVE',
      supports: normalizeClientModelSupports(model.supports, adapter, clientType),
      providerKey: model.provider.providerKey,
      channelKey: model.provider.providerKey,
      baseUrl: model.provider.baseUrl,
      endpointPath,
      statusEndpointPath,
      modelUploadMode: model.uploadMode || null,
      providerUploadMode: model.provider.uploadMode || null,
      effectiveUploadMode: model.uploadMode || model.provider.uploadMode || null,
      uploadMode: model.uploadMode || model.provider.uploadMode,
      requestMethod: model.provider.requestMethod,
      adapter,
      capabilities: normalizeVideoCapabilities(model.capabilities, model.name, model.displayName, clientType),
      provider: {
        ...model.provider,
        adapter: model.provider.adapter || adapter,
        endpointPath,
        statusEndpointPath,
      },
      protocol: {
        ...((model.protocol as Record<string, unknown> | null) || {}),
        adapter,
        endpointPath,
        statusEndpointPath: statusEndpointPath || undefined,
        uploadMode: model.uploadMode || model.provider.uploadMode || undefined,
        method: model.provider.requestMethod || undefined,
      },
    };
  }).filter(model => !requestedType || model.type === requestedType);
  ok(res, {
    items,
  });
}));

router.get('/admin/upstream-providers', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const providers = await prisma.upstreamProvider.findMany({
    orderBy: { createdAt: 'desc' },
  });
  ok(res, {
    items: providers.map(provider => ({
      id: provider.id,
      providerKey: provider.providerKey,
      name: provider.name,
      type: provider.type,
      adapter: provider.adapter,
      baseUrl: provider.baseUrl,
      endpointPath: provider.endpointPath,
      statusEndpointPath: provider.statusEndpointPath,
      uploadMode: provider.uploadMode,
      requestMethod: provider.requestMethod,
      defaultModel: provider.defaultModel,
      defaultParams: provider.defaultParams,
      timeoutMs: provider.timeoutMs,
      weight: provider.weight,
      concurrencyLimit: provider.concurrencyLimit,
      failureThreshold: provider.failureThreshold,
      status: provider.status,
      createdAt: provider.createdAt,
      apiKey: decryptSecret(provider.apiKeyEncrypted),
    })),
  });
}));

const providerSchema = z.object({
  providerKey: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1),
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']).optional().nullable(),
  adapter: z.string().min(1).default('openai-image'),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  endpointPath: z.string().optional().nullable(),
  statusEndpointPath: z.string().optional().nullable(),
  uploadMode: z.string().optional().nullable(),
  requestMethod: z.string().optional().nullable(),
  defaultModel: z.string().optional().nullable(),
  defaultParams: z.any().optional().nullable(),
  timeoutMs: z.number().int().positive().default(600000),
  weight: z.number().int().nonnegative().default(100),
  concurrencyLimit: z.number().int().nonnegative().default(0),
  failureThreshold: z.number().int().nonnegative().default(5),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

router.post('/admin/upstream-providers', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = providerSchema.parse(req.body);
  const provider = await prisma.upstreamProvider.create({
    data: {
      providerKey: body.providerKey,
      name: body.name,
      type: body.type,
      adapter: body.adapter,
      baseUrl: body.baseUrl,
      apiKeyEncrypted: encryptSecret(body.apiKey),
      endpointPath: body.endpointPath,
      statusEndpointPath: body.statusEndpointPath,
      uploadMode: body.uploadMode,
      requestMethod: body.requestMethod,
      defaultModel: body.defaultModel,
      defaultParams: body.defaultParams,
      timeoutMs: body.timeoutMs,
      weight: body.weight,
      concurrencyLimit: body.concurrencyLimit,
      failureThreshold: body.failureThreshold,
      status: body.status,
    },
    select: { id: true, providerKey: true, name: true, type: true, adapter: true, baseUrl: true, endpointPath: true, statusEndpointPath: true, uploadMode: true, requestMethod: true, defaultModel: true, defaultParams: true, timeoutMs: true, weight: true, concurrencyLimit: true, failureThreshold: true, status: true, createdAt: true },
  });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'PROVIDER_CREATE', targetType: 'UPSTREAM_PROVIDER', targetId: provider.id, remark: provider.name },
  });
  ok(res, { provider });
}));

router.patch('/admin/upstream-providers/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = providerSchema.partial().parse(req.body);
  const provider = await prisma.upstreamProvider.update({
    where: { id: routeParam(req.params.id) },
    data: {
      ...(body.providerKey ? { providerKey: body.providerKey } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.adapter ? { adapter: body.adapter } : {}),
      ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
      ...(body.apiKey ? { apiKeyEncrypted: encryptSecret(body.apiKey) } : {}),
      ...(body.endpointPath !== undefined ? { endpointPath: body.endpointPath } : {}),
      ...(body.statusEndpointPath !== undefined ? { statusEndpointPath: body.statusEndpointPath } : {}),
      ...(body.uploadMode !== undefined ? { uploadMode: body.uploadMode } : {}),
      ...(body.requestMethod !== undefined ? { requestMethod: body.requestMethod } : {}),
      ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel } : {}),
      ...(body.defaultParams !== undefined ? { defaultParams: body.defaultParams } : {}),
      ...(body.timeoutMs !== undefined ? { timeoutMs: body.timeoutMs } : {}),
      ...(body.weight !== undefined ? { weight: body.weight } : {}),
      ...(body.concurrencyLimit !== undefined ? { concurrencyLimit: body.concurrencyLimit } : {}),
      ...(body.failureThreshold !== undefined ? { failureThreshold: body.failureThreshold } : {}),
      ...(body.status ? { status: body.status } : {}),
    },
    select: { id: true, providerKey: true, name: true, type: true, adapter: true, baseUrl: true, endpointPath: true, statusEndpointPath: true, uploadMode: true, requestMethod: true, defaultModel: true, defaultParams: true, timeoutMs: true, weight: true, concurrencyLimit: true, failureThreshold: true, status: true, createdAt: true },
  });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'PROVIDER_UPDATE', targetType: 'UPSTREAM_PROVIDER', targetId: provider.id, remark: provider.name },
  });
  ok(res, { provider });
}));

const providerTestSchema = z.object({
  endpointPath: z.string().min(1).default('/models'),
  method: z.enum(['GET', 'POST']).default('GET'),
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  payload: z.unknown().optional(),
});

type AdminModelWithProvider = Prisma.AiModelGetPayload<{ include: { provider: true } }>;

function serializeAdminModel(model: AdminModelWithProvider) {
  return {
    ...model,
    provider: {
      id: model.provider.id,
      providerKey: model.provider.providerKey,
      name: model.provider.name,
      baseUrl: model.provider.baseUrl,
      adapter: model.provider.adapter,
      endpointPath: model.provider.endpointPath,
      statusEndpointPath: model.provider.statusEndpointPath,
      uploadMode: model.provider.uploadMode,
      requestMethod: model.provider.requestMethod,
      defaultModel: model.provider.defaultModel,
      status: model.provider.status,
      apiKey: decryptSecret(model.provider.apiKeyEncrypted),
    },
  };
}

router.post('/admin/upstream-providers/:id/test', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = providerTestSchema.parse(req.body);
  const provider = await prisma.upstreamProvider.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!provider) fail(404, '上游渠道不存在', 'PROVIDER_NOT_FOUND');

  const startedAt = Date.now();
  const upstream = await testUpstreamProvider(provider, body.endpointPath, {
    method: body.method,
    query: body.query,
    payload: body.payload,
  });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'PROVIDER_TEST', targetType: 'UPSTREAM_PROVIDER', targetId: provider.id, remark: `${body.method} ${body.endpointPath}` },
  });

  ok(res, {
    endpoint: buildEndpoint(provider.baseUrl, body.endpointPath),
    method: body.method,
    latencyMs: Date.now() - startedAt,
    upstream,
  });
}));

router.get('/admin/models', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const models = await prisma.aiModel.findMany({ include: { provider: true }, orderBy: { createdAt: 'desc' } });
  ok(res, {
    items: models.map(serializeAdminModel),
  });
}));

const simpleModelSchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']).optional(),
  baseUrl: z.string().url(),
  adapter: z.string().min(1),
  model: z.string().min(1),
  modelNick: z.string().min(1),
  key: z.string().min(1),
  uploadMode: z.string().optional().nullable(),
  imageMainModel: z.string().optional().nullable(),
  upstreamStreamConfigMode: z.enum(['uniform', 'by_resolution']).optional().nullable(),
  upstreamStreamMode: z.enum(['auto', 'stream', 'non_stream']).optional().nullable(),
  upstreamStreamModes: z.record(z.string()).optional().nullable(),
  asyncTaskConfigMode: z.enum(['uniform', 'by_resolution']).optional().nullable(),
  asyncTaskMode: z.enum(['sync', 'async']).optional().nullable(),
  asyncTaskModes: z.record(z.string()).optional().nullable(),
  responseTypeMode: z.enum(['uniform', 'by_resolution']).optional().nullable(),
  responseType: z.string().optional().nullable(),
  responseTypes: z.record(z.string()).optional().nullable(),
  maxVideoDurationSeconds: z.coerce.number().int().positive().optional().nullable(),
  maxVideoDurationSecondsByResolution: z.record(z.coerce.number().int().positive().nullable()).optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const pricingSchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']).optional(),
  unit: z.string().min(1).optional(),
  salePrice: z.number().int().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  pricePerSecond: z.number().int().nonnegative().optional(),
  defaults: z.any().optional().nullable(),
  inputPriceUsdPer1m: z.number().nonnegative().optional(),
  outputPriceUsdPer1m: z.number().nonnegative().optional(),
  cnyPerUsdCost: z.number().nonnegative().optional(),
  creditsPerUsdCost: z.number().nonnegative().optional(),
  markupRate: z.number().positive().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const modelSchema = z.object({
  providerId: z.string().min(1),
  modelKey: z.string().optional().nullable(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(['IMAGE', 'VIDEO', 'LLM']),
  unit: z.string().min(1),
  salePrice: z.number().int().nonnegative().default(0),
  costPrice: z.number().nonnegative().default(0),
  pricePerSecond: z.number().int().nonnegative().default(0),
  inputPriceUsdPer1m: z.number().nonnegative().default(0),
  outputPriceUsdPer1m: z.number().nonnegative().default(0),
  cnyPerUsdCost: z.number().nonnegative().default(0),
  creditsPerUsdCost: z.number().nonnegative().default(0),
  markupRate: z.number().positive().default(1),
  adapter: z.string().optional().nullable(),
  endpointPath: z.string().optional().nullable(),
  statusEndpointPath: z.string().optional().nullable(),
  uploadMode: z.string().optional().nullable(),
  protocol: z.any().optional().nullable(),
  supports: z.any().optional().nullable(),
  defaults: z.any().optional().nullable(),
  capabilities: z.any().optional().nullable(),
  modelAssembly: z.any().optional().nullable(),
  ui: z.any().optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

router.post('/admin/models', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = simpleModelSchema.safeParse(req.body);
  if (body.success) {
    const normalized = normalizeSimpleModelConfig(body.data);
    const status = body.data.status || 'ACTIVE';
    const provider = await prisma.upstreamProvider.create({
      data: {
        providerKey: normalized.providerKey,
        name: `${body.data.modelNick} 渠道`,
        type: normalized.type,
        adapter: normalized.adapter,
        baseUrl: normalized.baseUrl,
        endpointPath: normalized.endpointPath,
        statusEndpointPath: normalized.statusEndpointPath,
        uploadMode: normalized.uploadMode,
        requestMethod: normalized.requestMethod,
        defaultModel: body.data.model,
        apiKeyEncrypted: encryptSecret(body.data.key),
        status,
      },
    });
    const model = await prisma.aiModel.create({
      data: {
        providerId: provider.id,
        modelKey: normalized.modelKey,
        name: body.data.model,
        displayName: body.data.modelNick,
        type: normalized.type,
        unit: defaultUnit(normalized.type),
        salePrice: normalized.type === 'IMAGE' ? IMAGE_PRICING_TIERS[0].chargedCredits : 0,
        costPrice: normalized.type === 'IMAGE' ? IMAGE_PRICING_TIERS[0].costCredits : normalized.type === 'VIDEO' ? VIDEO_PRICING.costCreditsPerSecond : 0,
        pricePerSecond: normalized.type === 'VIDEO' ? VIDEO_PRICING.chargedCreditsPerSecond : 0,
        cnyPerUsdCost: normalized.type === 'LLM' ? defaultLlmCnyPerUsd(body.data.model) : 0,
        creditsPerUsdCost: normalized.type === 'LLM' ? defaultLlmCreditsPerUsd(body.data.model) : 0,
        adapter: normalized.adapter,
        endpointPath: normalized.endpointPath,
        statusEndpointPath: normalized.statusEndpointPath,
        uploadMode: normalized.uploadMode,
        protocol: normalized.protocol,
        supports: normalized.supports,
        defaults: normalized.defaults,
        capabilities: normalized.capabilities,
        modelAssembly: { type: 'passthrough' },
        ui: { label: body.data.modelNick },
        status,
      },
      include: { provider: true },
    });
    await prisma.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'MODEL_CREATE', targetType: 'AI_MODEL', targetId: model.id, remark: model.displayName },
    });
    ok(res, { model: serializeAdminModel(model) });
    return;
  }

  const legacyBody = modelSchema.parse(req.body);
  const model = await prisma.aiModel.create({ data: legacyBody, include: { provider: true } });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'MODEL_CREATE', targetType: 'AI_MODEL', targetId: model.id, remark: model.displayName },
  });
  ok(res, { model: serializeAdminModel(model) });
}));

router.patch('/admin/models/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const simpleBody = simpleModelSchema.partial().safeParse(req.body);
  if (simpleBody.success && ['baseUrl', 'adapter', 'model', 'modelNick', 'key', 'uploadMode', 'imageMainModel', 'upstreamStreamConfigMode', 'upstreamStreamMode', 'upstreamStreamModes', 'asyncTaskConfigMode', 'asyncTaskMode', 'asyncTaskModes', 'responseTypeMode', 'responseType', 'responseTypes', 'maxVideoDurationSeconds', 'maxVideoDurationSecondsByResolution', 'status'].some(key => key in req.body)) {
    const existing = await prisma.aiModel.findUnique({ where: { id: routeParam(req.params.id) }, include: { provider: true } });
    if (!existing) fail(404, '模型不存在', 'MODEL_NOT_FOUND');
    const next = {
      baseUrl: simpleBody.data.baseUrl || existing.provider.baseUrl,
      adapter: simpleBody.data.adapter || existing.provider.adapter || existing.adapter || 'openai-image',
      model: simpleBody.data.model || existing.name,
      modelNick: simpleBody.data.modelNick || existing.displayName,
      type: simpleBody.data.type || existing.type,
      key: simpleBody.data.key || 'keep-current-key',
      uploadMode: simpleBody.data.uploadMode !== undefined ? simpleBody.data.uploadMode : existing.uploadMode || undefined,
      imageMainModel: simpleBody.data.imageMainModel !== undefined
        ? simpleBody.data.imageMainModel
        : existingImageMainModel(existing),
      upstreamStreamConfigMode: simpleBody.data.upstreamStreamConfigMode !== undefined ? simpleBody.data.upstreamStreamConfigMode : existingUpstreamStreamConfig(existing).mode,
      upstreamStreamMode: simpleBody.data.upstreamStreamMode !== undefined ? simpleBody.data.upstreamStreamMode : existingUpstreamStreamConfig(existing).streamMode,
      upstreamStreamModes: simpleBody.data.upstreamStreamModes !== undefined ? simpleBody.data.upstreamStreamModes : existingUpstreamStreamConfig(existing).streamModes,
      asyncTaskConfigMode: simpleBody.data.asyncTaskConfigMode !== undefined ? simpleBody.data.asyncTaskConfigMode : existingAsyncTaskConfig(existing).mode,
      asyncTaskMode: simpleBody.data.asyncTaskMode !== undefined ? simpleBody.data.asyncTaskMode : existingAsyncTaskConfig(existing).asyncTaskMode,
      asyncTaskModes: simpleBody.data.asyncTaskModes !== undefined ? simpleBody.data.asyncTaskModes : existingAsyncTaskConfig(existing).asyncTaskModes,
      responseTypeMode: simpleBody.data.responseTypeMode !== undefined ? simpleBody.data.responseTypeMode : existingResponseTypeConfig(existing).mode,
      responseType: simpleBody.data.responseType !== undefined ? simpleBody.data.responseType : existingResponseTypeConfig(existing).responseType,
      responseTypes: simpleBody.data.responseTypes !== undefined ? simpleBody.data.responseTypes : existingResponseTypeConfig(existing).responseTypes,
      maxVideoDurationSeconds: simpleBody.data.maxVideoDurationSeconds !== undefined ? simpleBody.data.maxVideoDurationSeconds : existingVideoMaxDurationSeconds(existing),
      maxVideoDurationSecondsByResolution: simpleBody.data.maxVideoDurationSecondsByResolution !== undefined ? simpleBody.data.maxVideoDurationSecondsByResolution : existingVideoMaxDurationSecondsByResolution(existing),
    };
    const normalized = normalizeSimpleModelConfig(next);
    const existingProtocol = { ...(jsonObject(existing.protocol) || {}) };
    if (simpleBody.data.uploadMode !== undefined && !normalized.uploadMode) delete existingProtocol.uploadMode;
    await prisma.upstreamProvider.update({
      where: { id: existing.providerId },
      data: {
        name: `${next.modelNick} 渠道`,
        type: normalized.type,
        adapter: normalized.adapter,
        baseUrl: normalized.baseUrl,
        endpointPath: normalized.endpointPath,
        statusEndpointPath: normalized.statusEndpointPath,
        uploadMode: normalized.uploadMode,
        requestMethod: normalized.requestMethod,
        defaultModel: next.model,
        ...(simpleBody.data.key ? { apiKeyEncrypted: encryptSecret(simpleBody.data.key) } : {}),
        ...(simpleBody.data.status ? { status: simpleBody.data.status } : {}),
      },
    });
    const model = await prisma.aiModel.update({
      where: { id: existing.id },
      data: {
        modelKey: normalized.modelKey,
        name: next.model,
        displayName: next.modelNick,
        type: normalized.type,
        unit: defaultUnit(normalized.type),
        adapter: normalized.adapter,
        endpointPath: normalized.endpointPath,
        statusEndpointPath: normalized.statusEndpointPath,
        uploadMode: normalized.uploadMode,
        protocol: mergeJson(existingProtocol, jsonObject(normalized.protocol)),
        supports: normalized.supports,
        defaults: mergeJson(jsonObject(normalized.defaults), jsonObject(existing.defaults), imageMainModelJsonPatch(normalized.protocol), upstreamStreamJsonPatch(normalized.protocol), asyncTaskJsonPatch(normalized.protocol), responseTypeJsonPatch(normalized.protocol)),
        capabilities: normalized.capabilities,
        ui: { ...((existing.ui as Record<string, unknown>) || {}), label: next.modelNick },
        ...(simpleBody.data.status ? { status: simpleBody.data.status } : {}),
      },
      include: { provider: true },
    });
    await prisma.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'MODEL_UPDATE', targetType: 'AI_MODEL', targetId: model.id, remark: model.displayName },
    });
    ok(res, { model: serializeAdminModel(model) });
    return;
  }

  const body = pricingSchema.parse(req.body);
  const model = await prisma.aiModel.update({ where: { id: routeParam(req.params.id) }, data: body, include: { provider: true } });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'MODEL_UPDATE', targetType: 'AI_MODEL', targetId: model.id, remark: model.displayName },
  });
  ok(res, { model: serializeAdminModel(model) });
}));

router.delete('/admin/models/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const model = await prisma.aiModel.findUnique({ where: { id }, include: { provider: { select: { id: true, models: { select: { id: true } } } } } });
  if (!model) fail(404, '模型不存在', 'MODEL_NOT_FOUND');
  const usageCount = await prisma.modelUsage.count({ where: { modelId: id } });
  const taskCount = await prisma.generationTask.count({ where: { modelId: id } });
  const healthCount = await prisma.providerHealthLog.count({ where: { modelId: id } });
  if (usageCount || taskCount || healthCount) {
    const updated = await prisma.aiModel.update({ where: { id }, data: { status: 'DISABLED' } });
    ok(res, { model: updated, deleted: false, disabled: true });
    return;
  }
  await prisma.aiModel.delete({ where: { id } });
  if (model.provider.models.length <= 1) await prisma.upstreamProvider.delete({ where: { id: model.provider.id } }).catch(() => null);
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'MODEL_DELETE', targetType: 'AI_MODEL', targetId: id, remark: model.displayName },
  });
  ok(res, { deleted: true });
}));

function normalizeSimpleModelConfig(input: { baseUrl: string; adapter: string; model: string; modelNick: string; key: string; type?: ModelType; uploadMode?: string | null; imageMainModel?: string | null; upstreamStreamConfigMode?: string | null; upstreamStreamMode?: string | null; upstreamStreamModes?: Record<string, string> | null; asyncTaskConfigMode?: string | null; asyncTaskMode?: string | null; asyncTaskModes?: Record<string, string> | null; responseTypeMode?: string | null; responseType?: string | null; responseTypes?: Record<string, string> | null; maxVideoDurationSeconds?: number | null; maxVideoDurationSecondsByResolution?: Record<string, number | null> | null }) {
  const model = input.model.trim();
  const modelNick = input.modelNick.trim();
  const adapter = input.adapter.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  const type = input.type || inferModelType(`${model} ${adapter}`);
  const adapterConfig = adapterDefaults(adapter, type);
  const uploadMode = input.uploadMode === undefined ? adapterConfig.uploadMode : normalizeUploadMode(input.uploadMode);
  const imageMainModel = normalizeGptImage2MainModel(input.imageMainModel, { model, modelNick, adapter, type });
  const upstreamStreamConfig = normalizeImageUpstreamStreamConfig(input.upstreamStreamConfigMode, input.upstreamStreamMode, input.upstreamStreamModes, { model, modelNick, adapter, type });
  const asyncTaskConfig = normalizeImageAsyncTaskConfig(input.asyncTaskConfigMode, input.asyncTaskMode, input.asyncTaskModes, { model, modelNick, adapter, type });
  const responseTypeConfig = normalizeImageResponseTypeConfig(input.responseTypeMode, input.responseType, input.responseTypes, defaultResponseTypeForModelType(type));
  const videoCapabilities = type === 'VIDEO'
    ? normalizeVideoDurationCapabilities({
      ...videoCapabilityPreset(model, modelNick),
      ...(input.maxVideoDurationSeconds ? { maxVideoDurationSeconds: input.maxVideoDurationSeconds } : {}),
      ...(input.maxVideoDurationSecondsByResolution ? { maxVideoDurationSecondsByResolution: input.maxVideoDurationSecondsByResolution } : {}),
    })
    : undefined;
  return {
    providerKey: `model_${slug(modelNick || model)}_${Date.now().toString(36)}`,
    modelKey: slug(model),
    type,
    adapter,
    baseUrl,
    endpointPath: adapterConfig.endpointPath,
    statusEndpointPath: adapterConfig.statusEndpointPath,
    uploadMode,
    requestMethod: adapterConfig.requestMethod,
    protocol: {
      adapter,
      method: adapterConfig.requestMethod,
      endpointPath: adapterConfig.endpointPath,
      ...(adapterConfig.statusEndpointPath ? { statusEndpointPath: adapterConfig.statusEndpointPath } : {}),
      ...(uploadMode ? { uploadMode } : {}),
      ...(imageMainModel ? { imageMainModel, responsesModel: imageMainModel, codexModel: imageMainModel } : {}),
      ...upstreamStreamConfig,
      ...asyncTaskConfig,
      ...responseTypeConfig,
    } as Prisma.InputJsonValue,
    supports: defaultImageSupports(adapter, type),
    defaults: mergeJson(
      defaultPricingDefaults(type),
      adapter === 'gemini-image' ? { imageSize: '2K' } : undefined,
      imageMainModel ? { imageMainModel, responsesModel: imageMainModel, codexModel: imageMainModel } : undefined,
      upstreamStreamConfig,
      asyncTaskConfig,
      responseTypeConfig,
    ),
    capabilities: videoCapabilities,
  };
}

function existingVideoMaxDurationSeconds(model: { capabilities?: Prisma.JsonValue | null }) {
  const capabilities = jsonObject(model.capabilities);
  return normalizePositiveInt(capabilities?.maxVideoDurationSeconds ?? capabilities?.max_video_duration_seconds) || undefined;
}

function existingVideoMaxDurationSecondsByResolution(model: { capabilities?: Prisma.JsonValue | null }) {
  const capabilities = jsonObject(model.capabilities);
  return normalizeVideoMaxDurationByResolution(capabilities?.maxVideoDurationSecondsByResolution ?? capabilities?.max_video_duration_seconds_by_resolution);
}

function existingResponseTypeConfig(model: { type?: ModelType; protocol?: Prisma.JsonValue | null; defaults?: Prisma.JsonValue | null }) {
  const protocol = jsonObject(model.protocol);
  const defaults = jsonObject(model.defaults);
  const source = { ...defaults, ...protocol };
  const defaultResponseType = defaultResponseTypeForModelType(model.type);
  const mode = normalizeResponseTypeMode(source.responseTypeMode ?? source.response_type_mode) || 'uniform';
  const responseType = normalizeImageResponseTypeValue(source.responseType ?? source.response_type) || defaultResponseType;
  const responseTypes = normalizeImageResponseTypes(source.responseTypes ?? source.response_types);
  return { mode, responseType, responseTypes };
}

function existingImageMainModel(model: { protocol?: Prisma.JsonValue | null; defaults?: Prisma.JsonValue | null }) {
  const protocol = jsonObject(model.protocol);
  const defaults = jsonObject(model.defaults);
  const candidate = protocol?.imageMainModel ?? protocol?.responsesModel ?? protocol?.codexModel
    ?? defaults?.imageMainModel ?? defaults?.responsesModel ?? defaults?.codexModel;
  return normalizeImageMainModelValue(candidate) || undefined;
}

function existingUpstreamStreamConfig(model: { protocol?: Prisma.JsonValue | null; defaults?: Prisma.JsonValue | null }) {
  const protocol = jsonObject(model.protocol);
  const defaults = jsonObject(model.defaults);
  const source = { ...defaults, ...protocol };
  const mode = normalizeResponseTypeMode(source.upstreamStreamConfigMode ?? source.upstream_stream_config_mode) || 'uniform';
  const streamMode = normalizeUpstreamStreamMode(source.upstreamStreamMode ?? source.upstream_stream_mode) || 'auto';
  const streamModes = normalizeUpstreamStreamModes(source.upstreamStreamModes ?? source.upstream_stream_modes);
  return { mode, streamMode, streamModes };
}

function existingAsyncTaskConfig(model: { protocol?: Prisma.JsonValue | null; defaults?: Prisma.JsonValue | null }) {
  const protocol = jsonObject(model.protocol);
  const defaults = jsonObject(model.defaults);
  const source = { ...defaults, ...protocol };
  const mode = normalizeResponseTypeMode(source.asyncTaskConfigMode ?? source.async_task_config_mode) || 'uniform';
  const asyncTaskMode = normalizeAsyncTaskMode(source.asyncTaskMode ?? source.async_task_mode ?? source.asyncTask ?? source.async_task) || 'sync';
  const asyncTaskModes = normalizeAsyncTaskModes(source.asyncTaskModes ?? source.async_task_modes);
  return { mode, asyncTaskMode, asyncTaskModes };
}

function imageMainModelJsonPatch(protocol: Prisma.InputJsonValue) {
  const source = jsonObject(protocol);
  const model = normalizeImageMainModelValue(source?.imageMainModel ?? source?.responsesModel ?? source?.codexModel);
  return model ? { imageMainModel: model, responsesModel: model, codexModel: model } : undefined;
}

function upstreamStreamJsonPatch(protocol: Prisma.InputJsonValue) {
  const source = jsonObject(protocol);
  if (!source) return undefined;
  const configMode = normalizeResponseTypeMode(source.upstreamStreamConfigMode ?? source.upstream_stream_config_mode);
  const mode = normalizeUpstreamStreamMode(source?.upstreamStreamMode ?? source?.upstream_stream_mode);
  const modes = normalizeUpstreamStreamModes(source.upstreamStreamModes ?? source.upstream_stream_modes);
  return {
    ...(configMode ? { upstreamStreamConfigMode: configMode, upstream_stream_config_mode: configMode } : {}),
    ...(mode ? { upstreamStreamMode: mode, upstream_stream_mode: mode } : {}),
    ...(Object.keys(modes).length ? { upstreamStreamModes: modes, upstream_stream_modes: modes } : {}),
  };
}

function asyncTaskJsonPatch(protocol: Prisma.InputJsonValue) {
  const source = jsonObject(protocol);
  if (!source) return undefined;
  const configMode = normalizeResponseTypeMode(source.asyncTaskConfigMode ?? source.async_task_config_mode);
  const mode = normalizeAsyncTaskMode(source.asyncTaskMode ?? source.async_task_mode ?? source.asyncTask ?? source.async_task);
  const modes = normalizeAsyncTaskModes(source.asyncTaskModes ?? source.async_task_modes);
  return {
    ...(configMode ? { asyncTaskConfigMode: configMode, async_task_config_mode: configMode } : {}),
    ...(mode ? { asyncTaskMode: mode, async_task_mode: mode } : {}),
    ...(Object.keys(modes).length ? { asyncTaskModes: modes, async_task_modes: modes } : {}),
  };
}

function normalizeImageUpstreamStreamConfig(configModeValue: unknown, uniformValue: unknown, mapValue: unknown, input: { model: string; modelNick: string; adapter: string; type: ModelType }) {
  if (!isGptImage2ModelConfig(input)) return {};
  const configMode = normalizeResponseTypeMode(configModeValue) || 'uniform';
  const streamMode = normalizeUpstreamStreamMode(uniformValue) || 'auto';
  const streamModes = normalizeUpstreamStreamModes(mapValue);
  return configMode === 'by_resolution'
    ? { upstreamStreamConfigMode: 'by_resolution', upstream_stream_config_mode: 'by_resolution', upstreamStreamMode: streamMode, upstream_stream_mode: streamMode, upstreamStreamModes: streamModes, upstream_stream_modes: streamModes }
    : { upstreamStreamConfigMode: 'uniform', upstream_stream_config_mode: 'uniform', upstreamStreamMode: streamMode, upstream_stream_mode: streamMode, upstreamStreamModes: {}, upstream_stream_modes: {} };
}

function normalizeImageAsyncTaskConfig(configModeValue: unknown, uniformValue: unknown, mapValue: unknown, input: { model: string; modelNick: string; adapter: string; type: ModelType }) {
  if (!isGptImage2ModelConfig(input)) return {};
  const configMode = normalizeResponseTypeMode(configModeValue) || 'uniform';
  const asyncTaskMode = normalizeAsyncTaskMode(uniformValue) || 'sync';
  const asyncTaskModes = normalizeAsyncTaskModes(mapValue);
  return configMode === 'by_resolution'
    ? { asyncTaskConfigMode: 'by_resolution', async_task_config_mode: 'by_resolution', asyncTaskMode: asyncTaskMode, async_task_mode: asyncTaskMode, asyncTaskModes: asyncTaskModes, async_task_modes: asyncTaskModes }
    : { asyncTaskConfigMode: 'uniform', async_task_config_mode: 'uniform', asyncTaskMode: asyncTaskMode, async_task_mode: asyncTaskMode, asyncTaskModes: {}, async_task_modes: {} };
}

function normalizeUpstreamStreamMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default') return 'auto';
  if (raw === 'auto') return 'auto';
  if (raw === 'stream' || raw === 'streaming' || raw === 'true' || raw === '流式') return 'stream';
  if (raw === 'non_stream' || raw === 'non-stream' || raw === 'nonstream' || raw === 'false' || raw === 'sync' || raw === '非流式') return 'non_stream';
  return '';
}

function normalizeAsyncTaskMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default') return 'sync';
  if (['async', 'async_task', 'async-task', 'background', 'background_task', 'background-task', 'true', '1', 'yes', '异步'].includes(raw)) return 'async';
  if (['sync', 'normal', 'synchronous', 'false', '0', 'no', '同步', 'off'].includes(raw)) return 'sync';
  return '';
}

function normalizeAsyncTaskModes(value: unknown) {
  const source = jsonObject(value);
  const out: Record<string, string> = {};
  for (const key of ['1k', '2k', '3k', '4k']) {
    const mode = normalizeAsyncTaskMode(source?.[key] ?? source?.[key.toUpperCase()]);
    if (mode) out[key] = mode;
  }
  return out;
}

function normalizeUpstreamStreamModes(value: unknown) {
  const source = jsonObject(value);
  const out: Record<string, string> = {};
  for (const key of ['1k', '2k', '3k', '4k']) {
    const mode = normalizeUpstreamStreamMode(source?.[key] ?? source?.[key.toUpperCase()]);
    if (mode) out[key] = mode;
  }
  return out;
}

function responseTypeJsonPatch(protocol: Prisma.InputJsonValue) {
  const source = jsonObject(protocol);
  if (!source) return undefined;
  const mode = normalizeResponseTypeMode(source.responseTypeMode ?? source.response_type_mode);
  const responseType = normalizeImageResponseTypeValue(source.responseType ?? source.response_type);
  const responseTypes = normalizeImageResponseTypes(source.responseTypes ?? source.response_types);
  return {
    ...(mode ? { responseTypeMode: mode } : {}),
    ...(responseType ? { responseType } : {}),
    ...(Object.keys(responseTypes).length ? { responseTypes } : {}),
  };
}

function normalizeGptImage2MainModel(value: unknown, input: { model: string; modelNick: string; adapter: string; type: ModelType }) {
  if (!isGptImage2ModelConfig(input)) return undefined;
  return normalizeImageMainModelValue(value) || 'gpt-5.4-mini';
}

function normalizeImageMainModelValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  return GPT_IMAGE_2_MAIN_MODELS.find(item => item.toLowerCase() === normalized) || '';
}

function isGptImage2ModelConfig(input: { model?: string; modelNick?: string; adapter?: string; type?: ModelType }) {
  const text = [input.model, input.modelNick, input.adapter].map(item => String(item || '').toLowerCase()).join(' ');
  return input.type === 'IMAGE' && /gpt[-_ ]?image[-_ ]?2/.test(text) && /openai-edits|gpt-image|image/.test(text);
}

function normalizeUploadMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'auto' || raw === 'default') return null;
  if (raw === 'cos' || raw === 'object_storage' || raw === 'object-storage') return 'object_storage';
  if (['local_cache_async_cos', 'local-cache-async-cos', 'async_cos', 'async-cos', 'backend_async_cos', 'backend-async-cos', '后台异步cos', '后台异步转存cos'].includes(raw)) return 'local_cache_async_cos';
  if (raw === 'files' || raw === 'file') return 'files';
  return null;
}

function normalizeImageResponseTypeConfig(modeValue: unknown, uniformValue: unknown, mapValue: unknown, defaultResponseType = 'object_storage') {
  const mode = normalizeResponseTypeMode(modeValue) || 'uniform';
  const responseType = normalizeImageResponseTypeValue(uniformValue) || defaultResponseType;
  const responseTypes = normalizeImageResponseTypes(mapValue);
  return mode === 'by_resolution'
    ? { responseTypeMode: 'by_resolution', responseType, responseTypes }
    : { responseTypeMode: 'uniform', responseType, responseTypes: {} };
}

function defaultResponseTypeForModelType(type?: ModelType) {
  return type === 'VIDEO' ? 'provider_url' : 'object_storage';
}

function normalizeResponseTypeMode(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'by_resolution' || raw === 'by-resolution' || raw === 'resolution' || raw === 'per_resolution') return 'by_resolution';
  if (raw === 'uniform' || raw === 'same' || raw === 'single' || raw === 'default') return 'uniform';
  return '';
}

function normalizeImageResponseTypeValue(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'default' || raw === 'auto') return '';
  if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos', '转存_cos'].includes(raw)) return 'object_storage';
  if (['server_object_storage', 'server-object-storage', 'server_async_object_storage', 'server-async-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', 'backend_cos', 'server_cos', '124_cos', '124_async_cos', '124-server-cos', '124服务器转存cos', '124异步转存cos', '后台转存cos', '后台异步转存cos'].includes(raw)) return 'server_object_storage';
  if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw)) return 'provider_url';
  if (['base64', 'b64', 'b64_json'].includes(raw)) return 'base64';
  return '';
}

function normalizeImageResponseTypes(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const key of ['1k', '2k', '3k', '4k']) {
    const normalized = normalizeImageResponseTypeValue(source[key] ?? source[key.toUpperCase()]);
    if (normalized) out[key] = normalized;
  }
  return out;
}

function defaultUnit(type: ModelType) {
  if (type === 'VIDEO') return 'second';
  if (type === 'LLM') return 'token_usd_ratio';
  return 'image_resolution_tier';
}

function defaultLlmCreditsPerUsd(modelName: string) {
  const raw = modelName.toLowerCase();
  if (raw.includes('5.5')) return 80;
  if (raw.includes('5.4')) return 20;
  return 0;
}

function defaultLlmCnyPerUsd(modelName: string) {
  const raw = modelName.toLowerCase();
  if (raw.includes('5.5')) return 0.8;
  if (raw.includes('5.4')) return 0.2;
  return 0;
}

function mergeJson(...items: Array<Record<string, unknown> | undefined>): Prisma.InputJsonValue {
  return items.reduce<Record<string, unknown>>((acc, item) => {
    if (!item) return acc;
    Object.entries(item).forEach(([key, value]) => {
      const left = acc[key];
      if (left && value && typeof left === 'object' && typeof value === 'object' && !Array.isArray(left) && !Array.isArray(value)) {
        acc[key] = { ...(left as Record<string, unknown>), ...(value as Record<string, unknown>) };
        return;
      }
      acc[key] = value;
    });
    return acc;
  }, {}) as Prisma.InputJsonValue;
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function adapterDefaults(adapter: string, type: ModelType) {
  switch (adapter) {
    case 'openai-edits':
      return { endpointPath: '/images/edits', statusEndpointPath: null, uploadMode: 'files', requestMethod: 'sync' };
    case 'openai-image':
    case 'openai-generations':
      return { endpointPath: '/images/generations', statusEndpointPath: null, uploadMode: null, requestMethod: 'sync' };
    case 'gpt-image-v2':
      return { endpointPath: '/v1/images/generations', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'gemini-image':
      return { endpointPath: '/v1beta/models/{model}:generateContent', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'gemini-image-generate':
      return { endpointPath: '/images/generations', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'gemini-image-edit':
      return { endpointPath: '/images/edits', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'grok-image':
      return { endpointPath: '/images/generations', statusEndpointPath: null, uploadMode: null, requestMethod: 'sync' };
    case 'grok-image-edit':
      return { endpointPath: '/images/edits', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'openai-chat':
    case 'grok-chat':
    case 'grok-llm':
    case 'gemini-chat':
    case 'gemini-llm':
      return { endpointPath: '/chat/completions', statusEndpointPath: null, uploadMode: null, requestMethod: 'sync' };
    case 'sora-video':
      return { endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', uploadMode: 'object_storage', requestMethod: 'async-poll' };
    case 'seedance2-vip':
    case 'seedance2.0-vip':
      return { endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', uploadMode: 'object_storage', requestMethod: 'async-poll' };
    case 'grok-video':
      return { endpointPath: '/videos', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'gemini-video':
    case 'veo-video':
      return { endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', uploadMode: 'object_storage', requestMethod: 'async-poll' };
    case 'veo-chat':
    case 'veo-3.1':
      return { endpointPath: '/v1/chat/completions', statusEndpointPath: null, uploadMode: 'object_storage', requestMethod: 'sync' };
    case 'notevideo':
      return { endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', uploadMode: null, requestMethod: 'async-poll' };
    case 'seedance':
    case 'jimeng':
    case 'runninghub':
    case 'cli-proxy':
      return { endpointPath: '/video/generations', statusEndpointPath: '/video/status', uploadMode: null, requestMethod: 'async-poll' };
    default:
      return type === 'VIDEO'
        ? { endpointPath: '/video/generations', statusEndpointPath: '/video/status', uploadMode: null, requestMethod: 'async-poll' }
        : { endpointPath: '/images/generations', statusEndpointPath: null, uploadMode: null, requestMethod: 'sync' };
  }
}

function inferModelType(value: string): ModelType {
  const raw = value.toLowerCase();
  if (raw.includes('video') || raw.includes('sora') || raw.includes('veo') || raw.includes('seedance') || raw.includes('jimeng') || raw.includes('notevideo')) return 'VIDEO';
  if (raw.includes('gpt-image') || raw.includes('gpt_image') || raw.includes('image') || raw.includes('img') || raw.includes('imagen') || raw.includes('openai-edits')) return 'IMAGE';
  if (raw.includes('llm') || raw.includes('chat') || raw.includes('gpt-') || raw.includes('gemini-') || raw.includes('deepseek') || raw.includes('claude') || raw.includes('grok-4')) return 'LLM';
  return 'IMAGE';
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
}

router.get('/admin/model-usages', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const type = String(req.query.type || '').trim();
  const modelId = String(req.query.modelId || '').trim();
  const userId = String(req.query.userId || '').trim();
  const take = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
  const where: Prisma.ModelUsageWhereInput = {};
  if (['PENDING', 'SUCCESS', 'FAILED'].includes(status)) where.status = status as ModelUsageStatus;
  if (['IMAGE', 'VIDEO', 'LLM'].includes(type)) where.modelType = type as ModelType;
  if (modelId) where.modelId = modelId;
  if (userId) where.userId = userId;
  const usages = await prisma.modelUsage.findMany({
    where,
    include: { user: { select: { id: true, nickname: true, phone: true } }, model: { include: { provider: { select: { id: true, name: true, baseUrl: true } } } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
  ok(res, { items: usages });
}));

export default router;
