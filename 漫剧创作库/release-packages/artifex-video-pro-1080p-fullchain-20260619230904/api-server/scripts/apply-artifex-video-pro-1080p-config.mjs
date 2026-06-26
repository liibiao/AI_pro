import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';

const SORA_CONFIG = process.env.ARTIFEX_SORA_VIDEO_PRO_JSON || '/var/www/ai-admin/workbench-web/models/sora-video-pro.json';
const SEEDANCE2_PRO_CONFIG = process.env.ARTIFEX_SEEDANCE2_PRO_JSON || '/var/www/ai-admin/workbench-web/models/seedance2-pro.json';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function textFor(model) {
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
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
}

function normalizeResolution(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('1080')) return '1080p';
  if (raw.includes('480')) return '480p';
  return '720p';
}

function uniqueResolutions(values, fallback) {
  const out = [];
  for (const value of values || []) {
    const normalized = normalizeResolution(value);
    if (!out.includes(normalized)) out.push(normalized);
  }
  for (const value of fallback) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function finiteNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return undefined;
}

function positiveNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return undefined;
}

function pricingObject(model) {
  const defaults = isObject(model?.defaults) ? model.defaults : {};
  return isObject(defaults.pricing) ? defaults.pricing : {};
}

function tierList(source) {
  const pricing = isObject(source?.defaults?.pricing) ? source.defaults.pricing : pricingObject(source);
  return Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers.map(item => (isObject(item) ? item : {})) : [];
}

function tierFor(source, resolution) {
  return tierList(source).find(item => normalizeResolution(item.resolution || item.label || item.quality) === resolution) || {};
}

function perSecondPrice(source, resolution, fallback) {
  const pricing = isObject(source?.defaults?.pricing) ? source.defaults.pricing : pricingObject(source);
  const tier = tierFor(source, resolution);
  return finiteNumber(
    tier.cnyPerSecond,
    tier.memberCnyPerSecond,
    tier.pricePerSecond,
    pricing.cnyPerSecond,
    source?.pricePerSecond,
    fallback,
  ) ?? 0;
}

function flatPrice(source, resolution, fallback) {
  const pricing = isObject(source?.defaults?.pricing) ? source.defaults.pricing : pricingObject(source);
  const tier = tierFor(source, resolution);
  const member = positiveNumber(
    tier.memberCreditsPerGeneration,
    tier.chargedCreditsPerGeneration,
    tier.creditsPerGeneration,
    tier.pricePerGeneration,
    pricing.memberCreditsPerGeneration,
    pricing.chargedCreditsPerGeneration,
    pricing.creditsPerGeneration,
    pricing.pricePerGeneration,
    source?.salePrice,
    fallback,
  ) ?? 0;
  const original = positiveNumber(tier.originalCreditsPerGeneration, pricing.originalCreditsPerGeneration, member) ?? member;
  const cost = positiveNumber(tier.costCreditsPerGeneration, pricing.costCreditsPerGeneration, source?.costPrice, member) ?? member;
  return { member, original, cost };
}

function buildSoraPricing(config, existing) {
  const fallback720 = perSecondPrice(existing, '720p', perSecondPrice(config, '720p', 0.52));
  const price720 = perSecondPrice(existing, '720p', fallback720);
  const price1080 = perSecondPrice(existing, '1080p', price720);
  return {
    unit: 'second',
    currency: 'CNY',
    cnyPerSecond: price720,
    resolutionTiers: [
      { resolution: '720p', cnyPerSecond: price720 },
      { resolution: '1080p', cnyPerSecond: price1080 },
    ],
  };
}

function buildFlatPricing(config, existing) {
  const fallback720 = flatPrice(existing, '720p', flatPrice(config, '720p', 600).member);
  const tiers = ['480p', '720p', '1080p'].map(resolution => {
    const fallback = resolution === '1080p' ? fallback720.member : fallback720.member;
    const price = flatPrice(existing, resolution, flatPrice(config, resolution, fallback).member);
    return {
      resolution,
      memberCreditsPerGeneration: price.member,
      chargedCreditsPerGeneration: price.member,
      originalCreditsPerGeneration: price.original,
      costCreditsPerGeneration: price.cost,
    };
  });
  const sale = tiers.find(item => item.resolution === '720p') || tiers[0];
  return {
    unit: 'generation',
    billingMode: 'per_generation',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    memberCreditsPerGeneration: sale.memberCreditsPerGeneration,
    chargedCreditsPerGeneration: sale.chargedCreditsPerGeneration,
    originalCreditsPerGeneration: sale.originalCreditsPerGeneration,
    costCreditsPerGeneration: sale.costCreditsPerGeneration,
    resolutionTiers: tiers,
  };
}

async function reusableApiKey(existingProvider, adapter) {
  if (existingProvider?.apiKeyEncrypted) return { encrypted: existingProvider.apiKeyEncrypted, source: existingProvider.providerKey || 'existing-provider' };
  const provider = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { adapter },
        { baseUrl: { contains: 'api.artifex.help', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (provider?.apiKeyEncrypted) return { encrypted: provider.apiKeyEncrypted, source: provider.providerKey };
  throw new Error(`No reusable Artifex apiKeyEncrypted found for ${adapter}`);
}

async function findExistingModel(predicate) {
  const models = await prisma.aiModel.findMany({
    where: { type: 'VIDEO' },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  return models.find(predicate) || null;
}

async function findBestExistingModel(predicate, score) {
  const models = await prisma.aiModel.findMany({
    where: { type: 'VIDEO' },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  const candidates = models.filter(predicate);
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] || null;
}

async function upsertProvider({ existingModel, providerId, providerKey, name, adapter, defaultModel }) {
  const existingProvider = existingModel?.provider || await prisma.upstreamProvider.findFirst({
    where: { providerKey },
    orderBy: { createdAt: 'asc' },
  });
  const apiKey = await reusableApiKey(existingProvider, adapter);
  const id = existingProvider?.id || existingModel?.providerId || providerId;
  const common = {
    providerKey,
    name,
    type: 'VIDEO',
    adapter,
    baseUrl: 'https://api.artifex.help/v1',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel,
    status: 'ACTIVE',
  };
  const provider = await prisma.upstreamProvider.upsert({
    where: { id },
    update: common,
    create: { id, ...common, apiKeyEncrypted: apiKey.encrypted },
  });
  return { provider, keySource: apiKey.source };
}

function jsonMerge(...values) {
  return Object.assign({}, ...values.filter(isObject));
}

async function upsertSoraVideoPro(config) {
  const existing = await findExistingModel(model => {
    const text = textFor(model);
    const adapter = String(model.adapter || model.provider?.adapter || '').trim().toLowerCase();
    return adapter === 'sora-video-pro' || text.includes('sora-video-pro') || text.includes('artifex::video-pro');
  });
  const pricing = buildSoraPricing(config, existing);
  const capabilities = {
    ...jsonMerge(config.capabilities, existing?.capabilities),
    resolutions: uniqueResolutions(config.capabilities?.resolutions, ['720p', '1080p']),
    defaultResolution: '720p',
  };
  const providerInfo = await upsertProvider({
    existingModel: existing,
    providerId: 'canvas-provider-sora-video-pro',
    providerKey: 'sora-video-pro',
    name: 'Artifex Sora Video Pro',
    adapter: 'sora-video-pro',
    defaultModel: 'video-pro',
  });
  const modelId = existing?.id || 'canvas-sora-video-pro';
  const salePrice = finiteNumber(existing?.salePrice, 0) ?? 0;
  const model = await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: providerInfo.provider.id,
      modelKey: 'sora-video-pro',
      name: 'video-pro',
      displayName: config.displayName || 'Sora Video Pro',
      type: 'VIDEO',
      unit: 'second',
      salePrice,
      costPrice: finiteNumber(existing?.costPrice, 0) ?? 0,
      pricePerSecond: pricing.cnyPerSecond,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'sora-video-pro',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { ...jsonMerge(config.protocol, existing?.protocol), adapter: 'sora-video-pro', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: jsonMerge(config.supports, existing?.supports),
      defaults: { ...jsonMerge(config.defaults, existing?.defaults), pricing },
      capabilities,
      modelAssembly: { type: 'template', template: 'video-pro-{resolution}' },
      ui: jsonMerge(config.ui, existing?.ui, { label: config.ui?.label || 'Sora Video Pro', badge: 'PRO' }),
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: providerInfo.provider.id,
      modelKey: 'sora-video-pro',
      name: 'video-pro',
      displayName: config.displayName || 'Sora Video Pro',
      type: 'VIDEO',
      unit: 'second',
      salePrice,
      costPrice: 0,
      pricePerSecond: pricing.cnyPerSecond,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'sora-video-pro',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { ...jsonMerge(config.protocol), adapter: 'sora-video-pro', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: jsonMerge(config.supports),
      defaults: { ...jsonMerge(config.defaults), pricing },
      capabilities,
      modelAssembly: { type: 'template', template: 'video-pro-{resolution}' },
      ui: jsonMerge(config.ui, { label: config.ui?.label || 'Sora Video Pro', badge: 'PRO' }),
      status: 'ACTIVE',
    },
    include: { provider: true },
  });
  console.log(`[artifex-video-pro-1080p] sora model=${model.id} name=${model.name} adapter=${model.adapter} provider=${model.provider?.providerKey} keySource=${providerInfo.keySource}`);
  console.log(`[artifex-video-pro-1080p] sora resolutions=${JSON.stringify(model.capabilities?.resolutions || [])}`);
  console.log(`[artifex-video-pro-1080p] sora pricing=${JSON.stringify(model.defaults?.pricing?.resolutionTiers || [])}`);
}

async function upsertSeedance2Pro(config) {
  const existing = await findBestExistingModel(model => {
    const text = textFor(model);
    const adapter = String(model.adapter || model.provider?.adapter || '').trim().toLowerCase();
    const isSeedance2 = adapter === 'seedance2' || adapter === 'seedance2.0' || text.includes('seedance2') || text.includes('seedance 2') || text.includes('sd2.0');
    const isPro = text.includes('seedance2-pro') || text.includes('video-pro') || text.includes('高质量') || text.includes(' pro') || text.includes('-pro');
    return isSeedance2 && isPro && text.includes('api.artifex.help');
  }, model => {
    const text = textFor(model);
    let score = 0;
    if (model.modelKey === 'seedance2-pro') score += 100;
    if (model.id === 'canvas-seedance2-pro' || model.id === 'seedance2-pro') score += 80;
    if (String(model.name || '').trim().toLowerCase() === 'video-pro') score += 40;
    if (!text.includes('1080p')) score += 20;
    if (model.status === 'ACTIVE') score += 10;
    return score;
  });
  const pricing = buildFlatPricing(config, existing);
  const capabilities = {
    ...jsonMerge(config.capabilities, existing?.capabilities),
    resolutions: uniqueResolutions(config.capabilities?.resolutions, ['480p', '720p', '1080p']),
    defaultResolution: '720p',
  };
  const providerInfo = await upsertProvider({
    existingModel: existing,
    providerId: 'canvas-provider-seedance2-pro',
    providerKey: 'artifex-seedance2',
    name: 'Artifex SD2.0 Pro',
    adapter: 'seedance2',
    defaultModel: 'video-pro',
  });
  const modelId = existing?.id || 'canvas-seedance2-pro';
  const sale = pricing.resolutionTiers.find(item => item.resolution === '720p') || pricing.resolutionTiers[0];
  const model = await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: providerInfo.provider.id,
      modelKey: 'seedance2-pro',
      name: 'video-pro',
      displayName: config.displayName || 'SD2.0 Pro',
      type: 'VIDEO',
      unit: 'generation',
      salePrice: sale.chargedCreditsPerGeneration,
      costPrice: sale.costCreditsPerGeneration,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'seedance2',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { ...jsonMerge(config.protocol, existing?.protocol), adapter: 'seedance2', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: jsonMerge(config.supports, existing?.supports),
      defaults: { ...jsonMerge(config.defaults, existing?.defaults), pricing },
      capabilities,
      modelAssembly: { type: 'template', template: 'video-pro-{resolution}' },
      ui: jsonMerge(config.ui, existing?.ui, { label: config.ui?.label || 'SD2.0 Pro', badge: 'PRO' }),
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: providerInfo.provider.id,
      modelKey: 'seedance2-pro',
      name: 'video-pro',
      displayName: config.displayName || 'SD2.0 Pro',
      type: 'VIDEO',
      unit: 'generation',
      salePrice: sale.chargedCreditsPerGeneration,
      costPrice: sale.costCreditsPerGeneration,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'seedance2',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { ...jsonMerge(config.protocol), adapter: 'seedance2', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: jsonMerge(config.supports),
      defaults: { ...jsonMerge(config.defaults), pricing },
      capabilities,
      modelAssembly: { type: 'template', template: 'video-pro-{resolution}' },
      ui: jsonMerge(config.ui, { label: config.ui?.label || 'SD2.0 Pro', badge: 'PRO' }),
      status: 'ACTIVE',
    },
    include: { provider: true },
  });
  console.log(`[artifex-video-pro-1080p] seedance2-pro model=${model.id} name=${model.name} adapter=${model.adapter} provider=${model.provider?.providerKey} keySource=${providerInfo.keySource}`);
  console.log(`[artifex-video-pro-1080p] seedance2-pro resolutions=${JSON.stringify(model.capabilities?.resolutions || [])}`);
  console.log(`[artifex-video-pro-1080p] seedance2-pro pricing=${JSON.stringify(model.defaults?.pricing?.resolutionTiers || [])}`);
}

async function main() {
  const soraConfig = await readJson(SORA_CONFIG);
  const seedance2ProConfig = await readJson(SEEDANCE2_PRO_CONFIG);
  await upsertSoraVideoPro(soraConfig);
  await upsertSeedance2Pro(seedance2ProConfig);
}

main()
  .catch(err => {
    console.error('[artifex-video-pro-1080p] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
