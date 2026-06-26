import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';

const FAST_CONFIG = process.env.ARTIFEX_SD2_FAST_JSON || '/var/www/ai-admin/workbench-web/models/seedance2-fast.json';
const PRO_CONFIG = process.env.ARTIFEX_SD2_PRO_JSON || '/var/www/ai-admin/workbench-web/models/seedance2-pro.json';

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

function providerAdapter(model) {
  return String(model.provider?.adapter || model.adapter || '').trim().toLowerCase();
}

function isArtifexSeedanceModel(model) {
  const text = textFor(model);
  if (!text.includes('api.artifex.help')) return false;
  if (providerAdapter(model) === 'sora-video-pro' || text.includes('sora-video-pro')) return false;
  return providerAdapter(model) === 'seedance2'
    || providerAdapter(model) === 'seedance2.0'
    || text.includes('seedance2')
    || text.includes('seedance 2')
    || text.includes('sd2.0')
    || text.includes('sd20')
    || text.includes('video-fast-')
    || text.includes('video-pro-');
}

function modelResolution(model) {
  const text = textFor(model);
  if (text.includes('480p')) return '480p';
  if (text.includes('720p')) return '720p';
  if (text.includes('1080p')) return '1080p';
  return '';
}

function modelGroup(model) {
  const text = textFor(model);
  if (text.includes('video-fast') || text.includes('fast')) return 'fast';
  if (text.includes('video-pro') || text.includes('高质量') || text.includes(' pro') || text.includes('-pro')) return 'pro';
  return '';
}

function pricingObject(model) {
  const defaults = isObject(model.defaults) ? model.defaults : {};
  return isObject(defaults.pricing) ? defaults.pricing : {};
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

function tierForResolution(model, resolution) {
  const pricing = pricingObject(model);
  const tiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers : [];
  return tiers.map(item => (isObject(item) ? item : {})).find(item => {
    const label = String(item.resolution || item.label || item.quality || '').trim().toLowerCase();
    return label === resolution;
  }) || {};
}

function generationPriceFromModel(model, resolution, fallback) {
  const pricing = pricingObject(model);
  const tier = tierForResolution(model, resolution);
  const costCandidate = positiveNumber(
    tier.costCreditsPerGeneration,
    pricing.costCreditsPerGeneration,
    model.costPrice,
    fallback,
  );
  const member = positiveNumber(
    tier.memberCreditsPerGeneration,
    tier.chargedCreditsPerGeneration,
    tier.creditsPerGeneration,
    tier.pricePerGeneration,
    pricing.memberCreditsPerGeneration,
    pricing.chargedCreditsPerGeneration,
    pricing.creditsPerGeneration,
    pricing.pricePerGeneration,
    model.salePrice,
    costCandidate,
    fallback,
  ) ?? 0;
  const original = positiveNumber(
    tier.originalCreditsPerGeneration,
    pricing.originalCreditsPerGeneration,
    member,
  ) ?? member;
  const cost = positiveNumber(
    tier.costCreditsPerGeneration,
    pricing.costCreditsPerGeneration,
    model.costPrice,
    member,
  ) ?? member;
  return { member, original, cost };
}

function configTier(config, resolution, fallback) {
  const pricing = isObject(config.defaults?.pricing) ? config.defaults.pricing : {};
  const tiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers : [];
  const tier = tiers.map(item => (isObject(item) ? item : {})).find(item => String(item.resolution || '').toLowerCase() === resolution) || {};
  const member = finiteNumber(
    tier.memberCreditsPerGeneration,
    tier.chargedCreditsPerGeneration,
    pricing.memberCreditsPerGeneration,
    pricing.chargedCreditsPerGeneration,
    fallback,
  ) ?? 0;
  const original = finiteNumber(tier.originalCreditsPerGeneration, pricing.originalCreditsPerGeneration, member) ?? member;
  const cost = finiteNumber(tier.costCreditsPerGeneration, pricing.costCreditsPerGeneration, member) ?? member;
  return { member, original, cost };
}

function buildPricing(config, models, fallbackPrice) {
  const byResolution = Object.fromEntries(models.map(model => [modelResolution(model), model]).filter(([resolution]) => resolution === '480p' || resolution === '720p'));
  const fallback720 = byResolution['720p']
    ? generationPriceFromModel(byResolution['720p'], '720p', fallbackPrice)
    : configTier(config, '720p', fallbackPrice);
  const tiers = ['480p', '720p'].map(resolution => {
    const sourceModel = byResolution[resolution];
    const price = sourceModel
      ? generationPriceFromModel(sourceModel, resolution, fallback720.member)
      : configTier(config, resolution, fallback720.member);
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

function pickCanonical(models, group) {
  const active = models.filter(model => model.status !== 'DISABLED');
  const preferred = active.find(model => modelResolution(model) === '720p' && textFor(model).includes(`seedance2-${group}`))
    || active.find(model => modelResolution(model) === '720p')
    || active.find(model => !modelResolution(model) && textFor(model).includes(`seedance2-${group}`))
    || active[0]
    || models[0];
  return preferred || null;
}

async function reusableArtifexKey(groupModels) {
  const fromGroup = groupModels.map(model => model.provider).find(provider => provider?.apiKeyEncrypted);
  if (fromGroup?.apiKeyEncrypted) return { encrypted: fromGroup.apiKeyEncrypted, source: fromGroup.providerKey };
  const any = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      baseUrl: { contains: 'api.artifex.help', mode: 'insensitive' },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (any?.apiKeyEncrypted) return { encrypted: any.apiKeyEncrypted, source: any.providerKey };
  throw new Error('No reusable Artifex apiKeyEncrypted found');
}

function mergedConfig(config, group, pricing) {
  const defaultModel = group === 'fast' ? 'video-fast' : 'video-pro';
  const label = group === 'fast' ? 'SD2.0 Fast' : 'SD2.0 Pro';
  const badge = group === 'fast' ? 'FAST' : 'PRO';
  const template = group === 'fast' ? 'video-fast-{resolution}' : 'video-pro-{resolution}';
  return {
    modelName: defaultModel,
    displayName: label,
    providerName: `Artifex ${label}`,
    supports: jsonValue(config.supports),
    capabilities: {
      ...(isObject(config.capabilities) ? config.capabilities : {}),
      resolutions: ['480p', '720p'],
      defaultResolution: '720p',
    },
    defaults: {
      ...(isObject(config.defaults) ? config.defaults : {}),
      pricing,
    },
    modelAssembly: { type: 'template', template },
    protocol: {
      ...(isObject(config.protocol) ? config.protocol : {}),
      adapter: 'seedance2',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      method: 'async-poll',
      uploadMode: 'object_storage',
    },
    ui: {
      ...(isObject(config.ui) ? config.ui : {}),
      label,
      badge,
    },
  };
}

async function mergeGroup({ group, config, modelKey, providerKey, fallbackPrice }) {
  const all = await prisma.aiModel.findMany({
    where: { type: 'VIDEO' },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  const groupModels = all.filter(model => isArtifexSeedanceModel(model) && modelGroup(model) === group && ['480p', '720p', ''].includes(modelResolution(model)));
  const canonical = pickCanonical(groupModels, group);
  const apiKey = await reusableArtifexKey(groupModels);
  const modelId = canonical?.id || `canvas-${modelKey}`;
  const providerByKey = await prisma.upstreamProvider.findFirst({
    where: { providerKey },
    orderBy: { createdAt: 'asc' },
  });
  const providerId = providerByKey?.id || canonical?.providerId || `canvas-provider-${modelKey}`;
  const pricing = buildPricing(config, groupModels, fallbackPrice);
  const merged = mergedConfig(config, group, pricing);
  const saleTier = pricing.resolutionTiers.find(item => item.resolution === '720p') || pricing.resolutionTiers[0];

  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: merged.providerName,
      type: 'VIDEO',
      adapter: 'seedance2',
      baseUrl: 'https://api.artifex.help/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: merged.modelName,
      apiKeyEncrypted: apiKey.encrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: merged.providerName,
      type: 'VIDEO',
      adapter: 'seedance2',
      baseUrl: 'https://api.artifex.help/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: merged.modelName,
      apiKeyEncrypted: apiKey.encrypted,
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey,
      name: merged.modelName,
      displayName: merged.displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: saleTier.chargedCreditsPerGeneration,
      costPrice: saleTier.costCreditsPerGeneration,
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
      protocol: merged.protocol,
      supports: merged.supports,
      defaults: merged.defaults,
      capabilities: merged.capabilities,
      modelAssembly: merged.modelAssembly,
      ui: merged.ui,
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey,
      name: merged.modelName,
      displayName: merged.displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: saleTier.chargedCreditsPerGeneration,
      costPrice: saleTier.costCreditsPerGeneration,
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
      protocol: merged.protocol,
      supports: merged.supports,
      defaults: merged.defaults,
      capabilities: merged.capabilities,
      modelAssembly: merged.modelAssembly,
      ui: merged.ui,
      status: 'ACTIVE',
    },
  });

  const disableModelIds = groupModels
    .filter(model => model.id !== modelId && ['480p', '720p'].includes(modelResolution(model)))
    .map(model => model.id);
  if (disableModelIds.length) {
    await prisma.aiModel.updateMany({
      where: { id: { in: disableModelIds } },
      data: { status: 'DISABLED' },
    });
  }

  const disableProviderIds = Array.from(new Set(groupModels
    .filter(model => model.id !== modelId && model.providerId && model.providerId !== provider.id)
    .map(model => model.providerId)));
  if (disableProviderIds.length) {
    await prisma.upstreamProvider.updateMany({
      where: { id: { in: disableProviderIds } },
      data: { status: 'DISABLED' },
    });
  }

  const final = await prisma.aiModel.findUnique({ where: { id: modelId }, include: { provider: true } });
  console.log(`[artifex-sd2-merge] ${group} keySource=${apiKey.source}`);
  console.log(`[artifex-sd2-merge] ${group} merged=${final?.id} provider=${final?.provider?.providerKey} model=${final?.name} adapter=${final?.adapter} status=${final?.status}`);
  console.log(`[artifex-sd2-merge] ${group} resolutions=${JSON.stringify(final?.capabilities?.resolutions || [])}`);
  console.log(`[artifex-sd2-merge] ${group} pricing=${JSON.stringify(final?.defaults?.pricing?.resolutionTiers || [])}`);
  console.log(`[artifex-sd2-merge] ${group} disabledModels=${JSON.stringify(disableModelIds)}`);
}

async function main() {
  const fastConfig = await readJson(FAST_CONFIG);
  const proConfig = await readJson(PRO_CONFIG);
  await mergeGroup({
    group: 'fast',
    config: fastConfig,
    modelKey: 'seedance2-fast',
    providerKey: 'artifex-seedance2-fast',
    fallbackPrice: 450,
  });
  await mergeGroup({
    group: 'pro',
    config: proConfig,
    modelKey: 'seedance2-pro',
    providerKey: 'artifex-seedance2',
    fallbackPrice: 600,
  });
}

main()
  .catch(err => {
    console.error('[artifex-sd2-merge] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
