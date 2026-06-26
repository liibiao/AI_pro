import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret, encryptSecret } from '../dist/security.js';

const CONFIG_PATH = process.env.AISTARTLAB_MODEL_JSON || '/var/www/ai-admin/workbench-web/models/aistartlab-video-test.json';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
}

function text(value) {
  return String(value || '').trim();
}

function pickText(value, fallback) {
  const raw = text(value);
  return raw || fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const raw = text(value);
    if (raw) return raw;
  }
  return '';
}

function mergeJsonDefaults(defaultValue, existingValue) {
  return {
    ...jsonObject(defaultValue),
    ...jsonObject(existingValue),
  };
}

function isPlaceholderSecret(value) {
  const normalized = text(value).toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized === 'your-api-key'
    || normalized === 'your_api_key'
    || normalized.startsWith('replace-with-')
    || normalized.includes('placeholder');
}

function decryptIfUsable(encrypted) {
  try {
    const value = decryptSecret(encrypted || '').trim();
    return isPlaceholderSecret(value) ? '' : value;
  } catch {
    return '';
  }
}

function encryptedKeyFor(existingProvider) {
  if (existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)) {
    return { encrypted: existingProvider.apiKeyEncrypted, source: 'existing-provider' };
  }
  const envKey = text(process.env.AISTARTLAB_API_KEY);
  if (!isPlaceholderSecret(envKey)) {
    return { encrypted: encryptSecret(envKey), source: 'AISTARTLAB_API_KEY' };
  }
  return { encrypted: existingProvider?.apiKeyEncrypted || '', source: 'empty' };
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function defaultConfig() {
  return {
    id: 'aistartlab-video-test',
    configId: 'aistartlab-video-test',
    modelKey: 'aistartlab-video-test',
    providerKey: 'aistartlab-video',
    channelKey: 'aistartlab-video',
    name: 'test-video',
    model: 'test-video',
    displayName: 'AIStartLab 视频测试线路',
    label: 'AIStartLab 视频测试线路',
    type: 'video',
    adapter: 'aistartlab-video',
    baseUrl: 'https://api.video.aistarslab.com/openapi',
    endpointPath: '/video/task/v2',
    statusEndpointPath: '/video/task/status',
    uploadMode: 'object_storage',
    supports: {
      txt2video: true,
      img2video: true,
      referenceVideo: true,
      referenceAudio: true,
    },
    capabilities: {
      resolutions: ['720p'],
      durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      defaultDuration: 5,
      defaultResolution: '720p',
      aspectRatios: ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'],
      secondsMin: 4,
      secondsMax: 15,
      supportedModeTypes: ['text2video', 'image2video', 'frames2video'],
      frames2VideoSupportsAudio: false,
      maxImages: {
        full: 9,
        smartMultiFrame: 9,
        firstLast: 2,
      },
      maxVideos: 3,
      maxAudios: 3,
      supportsAudio: true,
      supportsVideo: true,
    },
    defaults: {
      channel: 'test',
      modeType: 'text2video',
      duration: '5',
      seconds: '5',
      resolution: '720p',
      aspectRatio: '16:9',
      size: '16:9',
      pricing: {
        unit: 'generation',
        billingMode: 'free',
        currency: 'credits',
        memberCreditsPerGeneration: 0,
        chargedCreditsPerGeneration: 0,
        originalCreditsPerGeneration: 0,
        costCreditsPerGeneration: 0,
      },
    },
    modelAssembly: {
      type: 'passthrough',
    },
    protocol: {
      adapter: 'aistartlab-video',
      method: 'async-poll',
      endpointPath: '/video/task/v2',
      statusEndpointPath: '/video/task/status',
      channel: 'test',
      model: 'test-video',
      uploadMode: 'object_storage',
      pollInitialDelaySeconds: 3,
      pollIntervalSeconds: 5,
    },
    ui: {
      label: 'AIStartLab 视频测试',
      badge: 'TEST',
      badgeColor: '#0f766e',
    },
  };
}

async function loadConfig() {
  try {
    return { config: await readJson(CONFIG_PATH), source: CONFIG_PATH };
  } catch {
    return { config: defaultConfig(), source: 'built-in-default' };
  }
}

function displayName(config) {
  return firstNonEmpty(config.displayName, config.label, config.modelNick, config.ui?.label, config.name, config.model, 'AIStartLab 视频测试线路');
}

function pricingFrom(config, existing) {
  const configPricing = jsonObject(jsonObject(config.defaults).pricing);
  const existingPricing = jsonObject(jsonObject(existing?.defaults).pricing);
  const salePrice = Number(
    existing?.salePrice ??
    existingPricing.memberCreditsPerGeneration ??
    existingPricing.chargedCreditsPerGeneration ??
    configPricing.memberCreditsPerGeneration ??
    configPricing.chargedCreditsPerGeneration ??
    0,
  );
  const costPrice = Number(
    existing?.costPrice ??
    existingPricing.costCreditsPerGeneration ??
    configPricing.costCreditsPerGeneration ??
    salePrice,
  );
  return {
    unit: pickText(existing?.unit, pickText(configPricing.unit || configPricing.billingMode, 'generation')),
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    costPrice: Number.isFinite(costPrice) ? costPrice : 0,
    pricePerSecond: Number.isFinite(Number(existing?.pricePerSecond)) ? Number(existing.pricePerSecond) : 0,
  };
}

function protocolFor(config, existing) {
  return mergeJsonDefaults({
    ...jsonObject(config.protocol),
    adapter: 'aistartlab-video',
    method: 'async-poll',
    endpointPath: '/video/task/v2',
    statusEndpointPath: '/video/task/status',
    channel: firstNonEmpty(config.protocol?.channel, config.defaults?.channel, 'test'),
    model: firstNonEmpty(config.protocol?.model, config.model, config.name, 'test-video'),
    uploadMode: 'object_storage',
  }, existing?.protocol);
}

async function findExistingProvider() {
  return prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: 'canvas-provider-aistartlab-video' },
        { providerKey: 'aistartlab-video' },
        { providerKey: { contains: 'aistartlab', mode: 'insensitive' } },
        { providerKey: { contains: 'aistarslab', mode: 'insensitive' } },
        { adapter: 'aistartlab-video' },
        { baseUrl: { contains: 'api.video.aistarslab.com', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function findExistingModel(config) {
  const modelKey = firstNonEmpty(config.modelKey, config.configId, config.id, 'aistartlab-video-test');
  return prisma.aiModel.findFirst({
    where: {
      OR: [
        { id: 'canvas-aistartlab-video-test' },
        { id: modelKey },
        { modelKey },
        { name: firstNonEmpty(config.model, config.name, 'test-video') },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function ensureProvider(config) {
  const existing = await findExistingProvider();
  const key = encryptedKeyFor(existing);
  const providerId = existing?.id || 'canvas-provider-aistartlab-video';
  const common = {
    providerKey: pickText(existing?.providerKey, 'aistartlab-video'),
    name: pickText(existing?.name, 'AIStartLab OpenAPI 视频'),
    type: 'VIDEO',
    adapter: pickText(existing?.adapter, 'aistartlab-video'),
    baseUrl: pickText(existing?.baseUrl, pickText(config.baseUrl || config.url, 'https://api.video.aistarslab.com/openapi')).replace(/\/+$/, ''),
    endpointPath: pickText(existing?.endpointPath, pickText(config.endpointPath || config.protocol?.endpointPath, '/video/task/v2')),
    statusEndpointPath: pickText(existing?.statusEndpointPath, pickText(config.statusEndpointPath || config.protocol?.statusEndpointPath, '/video/task/status')),
    uploadMode: pickText(existing?.uploadMode, pickText(config.uploadMode || config.protocol?.uploadMode, 'object_storage')),
    requestMethod: pickText(existing?.requestMethod, pickText(config.protocol?.method, 'async-poll')),
    defaultModel: pickText(existing?.defaultModel, firstNonEmpty(config.protocol?.model, config.model, config.name, 'test-video')),
    status: pickText(existing?.status, 'ACTIVE'),
  };
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      ...common,
      apiKeyEncrypted: key.encrypted,
    },
    create: {
      id: providerId,
      ...common,
      apiKeyEncrypted: key.encrypted,
    },
  });
  return { provider, keySource: key.source, existed: Boolean(existing) };
}

async function ensureModel(config, provider) {
  const existing = await findExistingModel(config);
  const modelId = existing?.id || 'canvas-aistartlab-video-test';
  const modelKey = pickText(existing?.modelKey, firstNonEmpty(config.modelKey, config.configId, config.id, 'aistartlab-video-test'));
  const realModel = pickText(existing?.name, firstNonEmpty(config.model, config.name, 'test-video'));
  const pricing = pricingFrom(config, existing);
  const protocol = protocolFor(config, existing);
  const defaults = mergeJsonDefaults(jsonValue(config.defaults), existing?.defaults);
  const model = await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey,
      name: realModel,
      displayName: pickText(existing?.displayName, displayName(config)),
      type: 'VIDEO',
      unit: pricing.unit,
      salePrice: pricing.salePrice,
      costPrice: pricing.costPrice,
      pricePerSecond: pricing.pricePerSecond,
      inputPriceUsdPer1m: Number(existing?.inputPriceUsdPer1m || 0),
      outputPriceUsdPer1m: Number(existing?.outputPriceUsdPer1m || 0),
      cnyPerUsdCost: Number(existing?.cnyPerUsdCost || 0),
      creditsPerUsdCost: Number(existing?.creditsPerUsdCost || 0),
      markupRate: Number(existing?.markupRate || 1),
      adapter: pickText(existing?.adapter, 'aistartlab-video'),
      endpointPath: pickText(existing?.endpointPath, '/video/task/v2'),
      statusEndpointPath: pickText(existing?.statusEndpointPath, '/video/task/status'),
      uploadMode: pickText(existing?.uploadMode, 'object_storage'),
      protocol,
      supports: mergeJsonDefaults(jsonValue(config.supports), existing?.supports),
      defaults,
      capabilities: mergeJsonDefaults(jsonValue(config.capabilities), existing?.capabilities),
      modelAssembly: mergeJsonDefaults(jsonValue(config.modelAssembly, { type: 'passthrough' }), existing?.modelAssembly),
      ui: mergeJsonDefaults(jsonValue(config.ui, { label: displayName(config) }), existing?.ui),
      status: pickText(existing?.status, 'ACTIVE'),
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey,
      name: realModel,
      displayName: displayName(config),
      type: 'VIDEO',
      unit: pricing.unit,
      salePrice: pricing.salePrice,
      costPrice: pricing.costPrice,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'aistartlab-video',
      endpointPath: '/video/task/v2',
      statusEndpointPath: '/video/task/status',
      uploadMode: 'object_storage',
      protocol,
      supports: jsonValue(config.supports),
      defaults,
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly, { type: 'passthrough' }),
      ui: jsonValue(config.ui, { label: displayName(config) }),
      status: 'ACTIVE',
    },
    include: { provider: true },
  });
  return { model, existed: Boolean(existing) };
}

async function main() {
  const { config, source } = await loadConfig();
  const { provider, keySource, existed: providerExisted } = await ensureProvider(config);
  const { model, existed: modelExisted } = await ensureModel(config, provider);
  console.log(`[aistartlab-admin-model-config] configSource=${source}`);
  console.log(`[aistartlab-admin-model-config] provider=${provider.providerKey} id=${provider.id} existed=${providerExisted} key=${provider.apiKeyEncrypted ? keySource : 'empty'}`);
  console.log(`[aistartlab-admin-model-config] model=${model.id} modelKey=${model.modelKey} name=${model.name} adapter=${model.adapter} existed=${modelExisted}`);
}

main()
  .catch(error => {
    console.error('[aistartlab-admin-model-config] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
