import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { encryptSecret } from '../dist/security.js';

const modelConfigPath = process.env.CANVAS_MODEL_CONFIG || '/var/www/ai-admin/workbench-web/models/sz-seedance2.json';
const providerId = 'canvas-provider-seedance-full';
const modelId = 'canvas-sz-seedance2';
const oldModelKeys = ['seedance-full-720p', 'seedance-full-1080p'];
const sd2InternalProviderId = 'canvas-provider-sd2-internal';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function numberOr(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

async function readConfig() {
  try {
    const raw = await readFile(modelConfigPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function buildPricing(config, existingModel) {
  const configPricing = jsonObject(jsonObject(config.defaults).pricing);
  const existingPricing = jsonObject(jsonObject(existingModel?.defaults).pricing);
  const creditsPerCny = numberOr(existingPricing.creditsPerCny ?? configPricing.creditsPerCny, 100) || 100;
  const tierSources = [
    ...(Array.isArray(existingPricing.resolutionTiers) ? existingPricing.resolutionTiers : []),
    ...(Array.isArray(configPricing.resolutionTiers) ? configPricing.resolutionTiers : []),
  ].filter(isObject);
  const tierFor = (resolution, fallbackCredits, fallbackCny) => {
    const found = tierSources.find(item => String(item.resolution || item.quality || '').trim().toLowerCase() === resolution);
    const chargedCredits = numberOr(
      found?.memberCreditsPerSecond ??
        found?.chargedCreditsPerSecond ??
        found?.creditsPerSecond ??
        found?.memberCredits ??
        found?.chargedCredits,
      fallbackCredits,
    );
    const cnyPerSecond = numberOr(found?.cnyPerSecond ?? found?.memberCnyPerSecond, fallbackCny);
    const model = resolution === '1080p' ? 'sz-seedance2-1080p' : 'sz-seedance2';
    return {
      resolution,
      model,
      memberCreditsPerSecond: chargedCredits,
      chargedCreditsPerSecond: chargedCredits,
      originalCreditsPerSecond: numberOr(found?.originalCreditsPerSecond ?? found?.listCreditsPerSecond, chargedCredits),
      costCreditsPerSecond: numberOr(found?.costCreditsPerSecond, chargedCredits),
      cnyPerSecond,
    };
  };
  const tiers = [
    tierFor('720p', 45, 0.45),
    tierFor('1080p', 60, 0.60),
  ];
  return {
    ...configPricing,
    ...existingPricing,
    unit: 'second',
    billingMode: 'per_second',
    currency: 'credits',
    creditsPerCny,
    memberDiscountRate: numberOr(existingPricing.memberDiscountRate ?? configPricing.memberDiscountRate, 1) || 1,
    memberCreditsPerSecond: tiers[0].memberCreditsPerSecond,
    chargedCreditsPerSecond: tiers[0].chargedCreditsPerSecond,
    originalCreditsPerSecond: tiers[0].originalCreditsPerSecond,
    costCreditsPerSecond: tiers[0].costCreditsPerSecond,
    cnyPerSecond: tiers[0].cnyPerSecond,
    resolutionTiers: tiers,
  };
}

async function findExistingModel() {
  return prisma.aiModel.findFirst({
    where: {
      type: 'VIDEO',
      OR: [
        { id: modelId },
        { modelKey: 'sz-seedance2' },
        { name: 'sz-seedance2' },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function reusableApiKeyEncrypted(existingProvider) {
  if (existingProvider?.apiKeyEncrypted) return existingProvider.apiKeyEncrypted;
  const provider = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { adapter: 'seedance-full' },
        { providerKey: { contains: 'seedance-full', mode: 'insensitive' } },
        { providerKey: { contains: 'sz-seedance2', mode: 'insensitive' } },
        { baseUrl: { contains: '103.236.54.113', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  return provider?.apiKeyEncrypted || encryptSecret('replace-with-seedance-full-api-key');
}

async function restoreSd2InternalProviderIfNeeded() {
  const provider = await prisma.upstreamProvider.findUnique({ where: { id: sd2InternalProviderId } });
  if (!provider) return;
  const looksHijacked = provider.providerKey === 'seedance-full'
    || provider.adapter === 'seedance-full'
    || provider.endpointPath === '/seedance-full/generate'
    || provider.defaultModel === 'sz-seedance2';
  if (!looksHijacked) return;
  await prisma.upstreamProvider.update({
    where: { id: sd2InternalProviderId },
    data: {
      providerKey: 'canvas_sd2-internal',
      name: provider.name && provider.name !== 'Seedance2.0 满血' ? provider.name : 'Canvas SD2 Internal',
      type: 'VIDEO',
      adapter: 'sd2-internal',
      baseUrl: 'http://103.236.54.113:8081/api/v1',
      endpointPath: '/sd2/generate',
      statusEndpointPath: '/sd2/task/{taskId}',
      uploadMode: provider.uploadMode || 'object_storage',
      requestMethod: provider.requestMethod || 'async-poll',
      defaultModel: provider.defaultModel && provider.defaultModel !== 'sz-seedance2' ? provider.defaultModel : 'dreamina-mini',
      status: 'ACTIVE',
    },
  });
  console.log('[seedance-full-sz-seedance2] restored canvas-provider-sd2-internal metadata');
}

async function main() {
  const config = await readConfig();
  await restoreSd2InternalProviderIfNeeded();
  const existingModel = await findExistingModel();
  const existingProvider = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: providerId },
        { providerKey: 'seedance-full' },
        { adapter: 'seedance-full' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const apiKeyEncrypted = await reusableApiKeyEncrypted(existingProvider);
  const pricing = buildPricing(config, existingModel);
  const configDefaults = jsonObject(config.defaults);
  const existingDefaults = jsonObject(existingModel?.defaults);
  const capabilities = {
    ...jsonObject(config.capabilities),
    ...jsonObject(existingModel?.capabilities),
    resolutions: ['720p', '1080p'],
    durations: [10, 11, 12, 13, 14, 15],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    defaultResolution: '720p',
    defaultDuration: 10,
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
  };
  const defaults = {
    ...configDefaults,
    ...existingDefaults,
    pricing,
    resolution: '720p',
    duration: 10,
    aspectRatio: '16:9',
  };
  const protocol = {
    ...jsonObject(config.protocol),
    adapter: 'seedance-full',
    method: 'async-poll',
    endpointPath: '/seedance-full/generate',
    statusEndpointPath: '/seedance-full/task/{taskId}',
    uploadMode: 'object_storage',
    modelByResolution: {
      '720p': 'sz-seedance2',
      '1080p': 'sz-seedance2-1080p',
    },
  };
  const supports = {
    txt2video: true,
    img2video: true,
    referenceImages: true,
    referenceVideo: true,
    referenceAudio: true,
  };
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: existingProvider?.id || providerId },
    update: {
      providerKey: 'seedance-full',
      name: 'Seedance2.0 满血',
      type: 'VIDEO',
      adapter: 'seedance-full',
      baseUrl: 'http://103.236.54.113:8081/api/v1',
      endpointPath: '/seedance-full/generate',
      statusEndpointPath: '/seedance-full/task/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'sz-seedance2',
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey: 'seedance-full',
      name: 'Seedance2.0 满血',
      type: 'VIDEO',
      adapter: 'seedance-full',
      baseUrl: 'http://103.236.54.113:8081/api/v1',
      endpointPath: '/seedance-full/generate',
      statusEndpointPath: '/seedance-full/task/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'sz-seedance2',
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
  });
  const targetModelId = existingModel?.id || modelId;
  await prisma.aiModel.upsert({
    where: { id: targetModelId },
    update: {
      providerId: provider.id,
      modelKey: 'sz-seedance2',
      name: 'sz-seedance2',
      displayName: 'Seedance2.0 满血',
      type: 'VIDEO',
      unit: 'second',
      salePrice: pricing.chargedCreditsPerSecond,
      costPrice: pricing.costCreditsPerSecond,
      pricePerSecond: pricing.cnyPerSecond,
      adapter: 'seedance-full',
      endpointPath: '/seedance-full/generate',
      statusEndpointPath: '/seedance-full/task/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities,
      modelAssembly: {
        type: 'resolution-model-map',
        baseModel: 'sz-seedance2',
        modelByResolution: {
          '720p': 'sz-seedance2',
          '1080p': 'sz-seedance2-1080p',
        },
      },
      ui: { label: 'Seedance2.0 满血', badge: '满血', badgeColor: '#0f766e' },
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: 'sz-seedance2',
      name: 'sz-seedance2',
      displayName: 'Seedance2.0 满血',
      type: 'VIDEO',
      unit: 'second',
      salePrice: pricing.chargedCreditsPerSecond,
      costPrice: pricing.costCreditsPerSecond,
      pricePerSecond: pricing.cnyPerSecond,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'seedance-full',
      endpointPath: '/seedance-full/generate',
      statusEndpointPath: '/seedance-full/task/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities,
      modelAssembly: {
        type: 'resolution-model-map',
        baseModel: 'sz-seedance2',
        modelByResolution: {
          '720p': 'sz-seedance2',
          '1080p': 'sz-seedance2-1080p',
        },
      },
      ui: { label: 'Seedance2.0 满血', badge: '满血', badgeColor: '#0f766e' },
      status: 'ACTIVE',
    },
  });
  await prisma.aiModel.updateMany({
    where: {
      id: { not: targetModelId },
      OR: [
        { modelKey: { in: oldModelKeys } },
        { id: { in: oldModelKeys.map(key => 'canvas-' + key) } },
        { name: { in: oldModelKeys } },
      ],
    },
    data: { status: 'DISABLED' },
  });
  await prisma.upstreamProvider.updateMany({
    where: {
      id: { not: provider.id },
      OR: [
        { providerKey: { in: oldModelKeys } },
        { adapter: { in: oldModelKeys } },
      ],
    },
    data: { status: 'DISABLED' },
  });
  console.log('[seedance-full-sz-seedance2] provider=' + provider.id + ' model=' + targetModelId);
  console.log('[seedance-full-sz-seedance2] tiers=' + pricing.resolutionTiers.map(t => t.resolution + ':' + t.model + ':' + t.chargedCreditsPerSecond).join(','));
}

main()
  .catch(err => {
    console.error('[seedance-full-sz-seedance2] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
