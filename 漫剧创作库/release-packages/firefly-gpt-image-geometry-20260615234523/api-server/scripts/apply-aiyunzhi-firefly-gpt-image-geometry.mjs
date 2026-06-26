import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';

const CONFIG_FILES = [
  process.env.AIYUNZHI_GPT_IMAGE2_JSON || '/var/www/ai-admin/workbench-web/models/aiyunzhi-gpt-image-2.json',
  process.env.AIYUNZHI_FIREFLY_GPT_IMAGE_JSON || '/var/www/ai-admin/workbench-web/models/aiyunzhi-firefly-gpt-image.json',
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function textForModel(model = {}) {
  const provider = model.provider || {};
  return [
    model.id,
    model.modelKey,
    model.name,
    model.displayName,
    model.adapter,
    model.endpointPath,
    provider.providerKey,
    provider.name,
    provider.adapter,
    provider.defaultModel,
    provider.baseUrl,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
}

async function findTargetModel(config) {
  const ids = [config.id, config.configId, config.modelKey, config.channelKey].filter(Boolean);
  const exact = await prisma.aiModel.findFirst({
    where: {
      OR: ids.flatMap(value => [{ id: value }, { modelKey: value }]),
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  if (exact) return exact;
  const wanted = String(config.modelKey || config.id || '').toLowerCase();
  if (wanted.includes('gpt-image-2')) {
    const strict = await prisma.aiModel.findFirst({
      where: {
        OR: [
          { modelKey: { contains: 'gpt-image-2', mode: 'insensitive' } },
        ],
      },
      include: { provider: true },
      orderBy: { createdAt: 'asc' },
    });
    if (strict && !String(strict.id || '').toLowerCase().includes('gpt-image-2-pro')) return strict;
    return null;
  }
  if (wanted.includes('firefly')) {
    return prisma.aiModel.findFirst({
      where: {
        OR: [
          { modelKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
          { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
          { displayName: { contains: 'Firefly GPT Image', mode: 'insensitive' } },
        ],
      },
      include: { provider: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  return null;
}

function isGptImage2ProProvider(provider = {}) {
  const text = [
    provider.id,
    provider.providerKey,
    provider.name,
    provider.adapter,
    provider.defaultModel,
    provider.baseUrl,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
  return text.includes('gpt-image-2-pro') || text.includes('canvas_gpt-image-2-pro');
}

async function reusableAiyunzhiProvider(targetModels) {
  const linked = targetModels
    .map(model => model?.provider)
    .filter(provider => provider?.apiKeyEncrypted && !isGptImage2ProProvider(provider));
  if (linked.length) return ensureFireflyProvider(linked[0]);
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
        { providerKey: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { name: { contains: 'aiyunzhi', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const preferred = providers.find(provider => {
    if (isGptImage2ProProvider(provider)) return false;
    const text = [
      provider.providerKey,
      provider.name,
      provider.adapter,
      provider.defaultModel,
      provider.baseUrl,
    ].map(value => String(value || '').trim().toLowerCase()).join(' ');
    return text.includes('firefly') || text.includes('gpt-image');
  });
  if (preferred) return ensureFireflyProvider(preferred);
  const nonPro = providers.find(provider => !isGptImage2ProProvider(provider));
  if (nonPro) return ensureFireflyProvider(nonPro);
  throw new Error('No reusable Aiyunzhi provider/apiKeyEncrypted found. Refusing to create a new channel.');
}

async function ensureFireflyProvider(sourceProvider) {
  if (!sourceProvider?.apiKeyEncrypted) throw new Error('Reusable Aiyunzhi provider has no apiKeyEncrypted');
  const existing = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { providerKey: 'canvas_aiyunzhi-firefly-gpt-image' },
        { providerKey: 'aiyunzhi-firefly-gpt-image' },
        { providerKey: 'canvas_aiyunzhi-gpt-image-2' },
        { providerKey: 'aiyunzhi-gpt-image-2' },
        { providerKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const providerId = existing?.id || 'canvas-provider-aiyunzhi-firefly-gpt-image';
  const providerKey = existing?.providerKey || 'canvas_aiyunzhi-firefly-gpt-image';
  return prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: existing?.name || 'Aiyunzhi Firefly GPT Image',
      type: 'IMAGE',
      adapter: 'aiyunzhi-firefly-gpt-image',
      baseUrl: 'https://aiyunzhi.top',
      endpointPath: '/v1/chat/completions',
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: 'firefly-gpt-image',
      apiKeyEncrypted: existing?.apiKeyEncrypted || sourceProvider.apiKeyEncrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: 'Aiyunzhi Firefly GPT Image',
      type: 'IMAGE',
      adapter: 'aiyunzhi-firefly-gpt-image',
      baseUrl: 'https://aiyunzhi.top',
      endpointPath: '/v1/chat/completions',
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: 'firefly-gpt-image',
      apiKeyEncrypted: sourceProvider.apiKeyEncrypted,
      status: 'ACTIVE',
    },
  });
}

function pricingDefaults(existing = {}) {
  const previous = isObject(existing.pricing) ? existing.pricing : {};
  const tiers = [
    ['1K', 8],
    ['2K', 12],
    ['4K', 18],
  ].map(([resolution, credits]) => ({
    resolution,
    memberCreditsPerGeneration: credits,
    chargedCreditsPerGeneration: credits,
    originalCreditsPerGeneration: credits,
    costCreditsPerGeneration: credits,
  }));
  return {
    ...previous,
    unit: 'generation',
    billingMode: 'per_generation',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    memberCreditsPerGeneration: 8,
    chargedCreditsPerGeneration: 8,
    originalCreditsPerGeneration: 8,
    costCreditsPerGeneration: 8,
    resolutionTiers: tiers,
  };
}

function mergedConfig(config, existing = {}) {
  const existingDefaults = isObject(existing.defaults) ? existing.defaults : {};
  return {
    modelName: 'firefly-gpt-image',
    displayName: config.displayName || config.label || existing.displayName || 'Aiyunzhi GPT Image 2',
    supports: jsonValue(config.supports, { txt2img: true, img2img: true }),
    capabilities: {
      ...(isObject(config.capabilities) ? config.capabilities : {}),
      imageSizes: ['1K', '2K', '4K'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16'],
      maxImages: 6,
    },
    defaults: {
      ...existingDefaults,
      ...(isObject(config.defaults) ? config.defaults : {}),
      imageSize: '1K',
      resolution: '1K',
      aspectRatio: '16:9',
      size: '16:9',
      pricing: pricingDefaults(existingDefaults),
    },
    modelAssembly: { type: 'template', template: 'firefly-gpt-image-{resolution}-{aspectRatioSlug}' },
    protocol: {
      ...(isObject(config.protocol) ? config.protocol : {}),
      adapter: 'aiyunzhi-firefly-gpt-image',
      endpointPath: '/v1/chat/completions',
      endpoint_path: '/v1/chat/completions',
      method: 'sync',
      uploadMode: 'object_storage',
      upload_mode: 'object_storage',
    },
    ui: {
      ...(isObject(config.ui) ? config.ui : {}),
      label: config.ui?.label || config.displayName || 'GPT Image 2',
      badge: 'Image',
    },
  };
}

function shouldPatchProvider(provider) {
  const text = [
    provider.providerKey,
    provider.name,
    provider.adapter,
    provider.defaultModel,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
  return text.includes('gpt-image') || text.includes('firefly');
}

async function patchProvider(provider) {
  const update = shouldPatchProvider(provider)
    ? {
      type: 'IMAGE',
      adapter: 'aiyunzhi-firefly-gpt-image',
      baseUrl: 'https://aiyunzhi.top',
      endpointPath: '/v1/chat/completions',
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: 'firefly-gpt-image',
      status: 'ACTIVE',
    }
    : {
      baseUrl: provider.baseUrl || 'https://aiyunzhi.top',
      status: 'ACTIVE',
    };
  return prisma.upstreamProvider.update({
    where: { id: provider.id },
    data: update,
  });
}

async function upsertModel(config, provider, existing) {
  const merged = mergedConfig(config, existing || {});
  const modelKey = config.modelKey || config.configId || config.id;
  const id = existing?.id || (modelKey ? `canvas-${modelKey}` : '');
  if (!id || !modelKey) throw new Error(`Missing model id/modelKey for ${config.displayName || config.model}`);
  const common = {
    providerId: provider.id,
    modelKey,
    name: merged.modelName,
    displayName: merged.displayName,
    type: 'IMAGE',
    unit: 'generation',
    salePrice: Number(existing?.salePrice || 8),
    costPrice: Number(existing?.costPrice || 8),
    pricePerSecond: 0,
    inputPriceUsdPer1m: 0,
    outputPriceUsdPer1m: 0,
    cnyPerUsdCost: 0,
    creditsPerUsdCost: 0,
    markupRate: 1,
    adapter: 'aiyunzhi-firefly-gpt-image',
    endpointPath: '/v1/chat/completions',
    uploadMode: 'object_storage',
    protocol: merged.protocol,
    supports: merged.supports,
    defaults: merged.defaults,
    capabilities: merged.capabilities,
    modelAssembly: merged.modelAssembly,
    ui: merged.ui,
    status: 'ACTIVE',
  };
  const model = await prisma.aiModel.upsert({
    where: { id },
    update: common,
    create: { id, ...common },
  });
  await prisma.aiModel.updateMany({
    where: { modelKey },
    data: common,
  });
  return model;
}

async function restoreGptImage2Pro() {
  const provider = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { providerKey: 'canvas_gpt-image-2-pro' },
        { providerKey: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!provider) {
    console.log('[gpt-image-2-pro] provider not found, skip restore');
    return null;
  }
  const restoredProvider = await prisma.upstreamProvider.update({
    where: { id: provider.id },
    data: {
      providerKey: provider.providerKey || 'canvas_gpt-image-2-pro',
      name: provider.name || 'GPT Image 2 Pro',
      type: 'IMAGE',
      adapter: 'openai-edits',
      baseUrl: 'http://localhost:8317/v1',
      endpointPath: '/images/edits',
      uploadMode: 'files',
      requestMethod: 'sync',
      defaultModel: 'gpt-image-2',
      status: 'ACTIVE',
    },
  });
  const defaults = {
    imageMainModel: 'gpt-5.4-mini',
    responsesModel: 'gpt-5.4-mini',
    codexModel: 'gpt-5.4-mini',
    pricing: {
      unit: 'image_resolution_tier',
      currency: 'credits',
      creditsPerCny: 100,
      memberDiscountRate: 0.4,
      tiers: [
        { tier: '1K', chargedCredits: 5, originalCredits: 12, costCredits: 3.5, grossMarginRate: 0.3 },
        { tier: '2K', chargedCredits: 8, originalCredits: 20, costCredits: 5.6, grossMarginRate: 0.3 },
        { tier: '3K', chargedCredits: 20, originalCredits: 50, costCredits: 14, grossMarginRate: 0.3 },
        { tier: '4K', chargedCredits: 40, originalCredits: 100, costCredits: 28, grossMarginRate: 0.3 },
      ],
    },
  };
  const protocol = {
    adapter: 'openai-edits',
    endpointPath: '/images/edits',
    uploadMode: 'files',
    imageMainModel: 'gpt-5.4-mini',
    responsesModel: 'gpt-5.4-mini',
    codexModel: 'gpt-5.4-mini',
  };
  const restoredModel = await prisma.aiModel.upsert({
    where: { id: 'canvas-gpt-image-2-pro' },
    update: {
      providerId: restoredProvider.id,
      modelKey: 'canvas-gpt-image-2-pro',
      name: 'gpt-image-2',
      displayName: 'GPT-Image-2-pro',
      type: 'IMAGE',
      unit: 'generation',
      salePrice: 5,
      costPrice: 3.5,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'openai-edits',
      endpointPath: '/images/edits',
      uploadMode: 'files',
      protocol,
      supports: { txt2img: true, img2img: true },
      defaults,
      capabilities: { imageSizes: ['1K', '2K', '3K', '4K'], maxImages: 1 },
      modelAssembly: {},
      ui: { label: 'GPT-Image-2-pro', badge: 'V1', badgeColor: '#10b981' },
      status: 'ACTIVE',
    },
    create: {
      id: 'canvas-gpt-image-2-pro',
      providerId: restoredProvider.id,
      modelKey: 'canvas-gpt-image-2-pro',
      name: 'gpt-image-2',
      displayName: 'GPT-Image-2-pro',
      type: 'IMAGE',
      unit: 'generation',
      salePrice: 5,
      costPrice: 3.5,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'openai-edits',
      endpointPath: '/images/edits',
      uploadMode: 'files',
      protocol,
      supports: { txt2img: true, img2img: true },
      defaults,
      capabilities: { imageSizes: ['1K', '2K', '3K', '4K'], maxImages: 1 },
      modelAssembly: {},
      ui: { label: 'GPT-Image-2-pro', badge: 'V1', badgeColor: '#10b981' },
      status: 'ACTIVE',
    },
  });
  console.log(`[gpt-image-2-pro] restored ${restoredModel.id} modelKey=${restoredModel.modelKey} provider=${restoredProvider.providerKey}`);
  return restoredModel;
}

async function main() {
  const configs = [];
  for (const file of CONFIG_FILES) configs.push(await readJson(file));
  await restoreGptImage2Pro();
  const existingModels = [];
  for (const config of configs) existingModels.push(await findTargetModel(config));
  const provider = await reusableAiyunzhiProvider(existingModels);
  const patchedProvider = await patchProvider(provider);
  const results = [];
  for (let index = 0; index < configs.length; index += 1) {
    results.push(await upsertModel(configs[index], patchedProvider, existingModels[index]));
  }
  for (const model of results) {
    console.log(`[firefly-gpt-image] ${model.id} modelKey=${model.modelKey} model=${model.name} adapter=${model.adapter}`);
  }
  console.log(`[firefly-gpt-image] provider=${patchedProvider.providerKey} baseUrl=${patchedProvider.baseUrl} key=reused`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
