import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { encryptSecret } from '../dist/security.js';

const modelConfigPath = process.env.CANVAS_MODEL_CONFIG || '/var/www/ai-admin/workbench-web/models/lingdong-sd-2-vip.json';
const modelId = 'canvas-lingdong-sd-2-vip';
const providerId = 'canvas-provider-lingdong-sd-2-vip';
const displayName = '火山 SD 2.0 低价（不卡真人）';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized === 'your-api-key'
    || normalized.startsWith('replace-with-')
    || normalized.includes('placeholder');
}

function numberOr(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function normalizeResolution(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('1080') || raw === 'large') return '1080p';
  return '720p';
}

function tierPrice(tier, fallback = 0) {
  return numberOr(
    tier?.memberCreditsPerGeneration ??
      tier?.chargedCreditsPerGeneration ??
      tier?.creditsPerGeneration ??
      tier?.pricePerGeneration ??
      tier?.memberCreditsPerRequest ??
      tier?.chargedCreditsPerRequest ??
      tier?.creditsPerRequest ??
      tier?.pricePerRequest ??
      tier?.memberCredits ??
      tier?.chargedCredits ??
      tier?.credits ??
      tier?.price,
    fallback,
  );
}

function tierOriginal(tier, member) {
  return numberOr(
    tier?.originalCreditsPerGeneration ??
      tier?.listCreditsPerGeneration ??
      tier?.standardCreditsPerGeneration ??
      tier?.originalCreditsPerRequest ??
      tier?.originalCredits,
    member,
  );
}

function tierCost(tier, member) {
  return numberOr(
    tier?.costCreditsPerGeneration ??
      tier?.costCreditsPerRequest ??
      tier?.costCredits,
    member,
  );
}

function tiersByResolution(...pricingSources) {
  const out = new Map();
  for (const pricing of pricingSources) {
    const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
    for (const tier of tiers) {
      const resolution = normalizeResolution(tier?.resolution || tier?.label || tier?.quality || tier?.size);
      if (!out.has(resolution)) out.set(resolution, tier);
    }
  }
  return out;
}

async function readModelConfig() {
  try {
    const raw = await readFile(modelConfigPath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

async function reusableApiKeyEncrypted(config, existingProvider) {
  if (existingProvider?.apiKeyEncrypted) return existingProvider.apiKeyEncrypted;
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { baseUrl: { contains: 'lingdongapi.com', mode: 'insensitive' } },
        { providerKey: { contains: 'lingdong', mode: 'insensitive' } },
        { providerKey: { contains: 'sd-2-vip', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const provider = providers.find(row => row.apiKeyEncrypted);
  if (provider) return provider.apiKeyEncrypted;
  const jsonKey = String(config.key || config.apiKey || config.api_key || '').trim();
  return encryptSecret(isPlaceholderSecret(jsonKey) ? 'replace-with-lingdong-api-key' : jsonKey);
}

function buildConfig(config, existingModel) {
  const existingDefaults = jsonObject(existingModel?.defaults);
  const existingPricing = jsonObject(existingDefaults.pricing);
  const configDefaults = jsonObject(config.defaults);
  const configPricing = jsonObject(configDefaults.pricing);
  const tierMap = tiersByResolution(existingPricing, configPricing);
  const fallbackMember = numberOr(
    existingPricing.memberCreditsPerGeneration ??
      existingPricing.chargedCreditsPerGeneration ??
      configPricing.memberCreditsPerGeneration ??
      configPricing.chargedCreditsPerGeneration,
    0,
  );
  const resolutionTiers = ['720p', '1080p'].map(resolution => {
    const existingTier = tierMap.get(resolution) || {};
    const member = tierPrice(existingTier, fallbackMember);
    return {
      resolution,
      size: resolution === '1080p' ? 'large' : 'small',
      memberCreditsPerGeneration: member,
      chargedCreditsPerGeneration: member,
      originalCreditsPerGeneration: tierOriginal(existingTier, member),
      costCreditsPerGeneration: tierCost(existingTier, member),
    };
  });
  const firstTier = resolutionTiers[0];
  const pricing = {
    ...configPricing,
    ...existingPricing,
    unit: 'generation',
    billingMode: 'per_generation',
    currency: existingPricing.currency || configPricing.currency || 'credits',
    creditsPerCny: numberOr(existingPricing.creditsPerCny ?? configPricing.creditsPerCny, 100),
    memberDiscountRate: numberOr(existingPricing.memberDiscountRate ?? configPricing.memberDiscountRate, 1),
    memberCreditsPerGeneration: firstTier.memberCreditsPerGeneration,
    chargedCreditsPerGeneration: firstTier.chargedCreditsPerGeneration,
    originalCreditsPerGeneration: firstTier.originalCreditsPerGeneration,
    costCreditsPerGeneration: firstTier.costCreditsPerGeneration,
    resolutionTiers,
    note: '火山 SD 2.0 低价渠道支持 720p/1080p 分开按次计费；请在后台模型管理中分别配置两档价格。',
  };
  const capabilities = {
    ...jsonObject(config.capabilities),
    resolutions: ['720p', '1080p'],
    sizes: ['small', 'large'],
    resolutionSizeMap: { '720p': 'small', '1080p': 'large' },
    defaultResolution: '720p',
    defaultSize: 'small',
  };
  const defaults = {
    ...configDefaults,
    ...existingDefaults,
    pricing,
    resolution: '720p',
    size: 'small',
    duration: configDefaults.duration || existingDefaults.duration || 15,
  };
  return { capabilities, defaults, pricing };
}

async function main() {
  const config = await readModelConfig();
  const existingModel = await prisma.aiModel.findFirst({
    where: {
      OR: [
        { id: modelId },
        { modelKey: 'lingdong-sd-2-vip' },
        { name: 'sd-2-vip' },
      ],
    },
  });
  const existingProvider = existingModel?.providerId
    ? await prisma.upstreamProvider.findUnique({ where: { id: existingModel.providerId } })
    : null;
  const apiKeyEncrypted = await reusableApiKeyEncrypted(config, existingProvider);
  const { capabilities, defaults, pricing } = buildConfig(config, existingModel);
  const protocol = {
    ...jsonObject(config.protocol),
    adapter: 'lingdong-sd-2-vip',
    endpointPath: '/videos',
    statusEndpointPath: '/video/generations/{taskId}',
    method: 'async-poll',
    uploadMode: 'object_storage',
  };
  const supports = {
    txt2video: true,
    img2video: true,
    referenceImages: true,
    referenceVideo: true,
    referenceAudio: true,
  };
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: existingModel?.providerId || providerId },
    update: {
      providerKey: 'canvas_lingdong_sd_2_vip',
      name: `画布渠道 ${displayName}`,
      type: 'VIDEO',
      adapter: 'lingdong-sd-2-vip',
      baseUrl: 'https://www.lingdongapi.com/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/video/generations/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'sd-2-vip',
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey: 'canvas_lingdong_sd_2_vip',
      name: `画布渠道 ${displayName}`,
      type: 'VIDEO',
      adapter: 'lingdong-sd-2-vip',
      baseUrl: 'https://www.lingdongapi.com/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/video/generations/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'sd-2-vip',
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
  });
  await prisma.aiModel.upsert({
    where: { id: existingModel?.id || modelId },
    update: {
      providerId: provider.id,
      modelKey: 'lingdong-sd-2-vip',
      name: 'sd-2-vip',
      displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: pricing.chargedCreditsPerGeneration,
      costPrice: pricing.costCreditsPerGeneration,
      pricePerSecond: 0,
      adapter: 'lingdong-sd-2-vip',
      endpointPath: '/videos',
      statusEndpointPath: '/video/generations/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities,
      modelAssembly: { type: 'passthrough' },
      ui: { label: '火山 SD 2.0 低价', badge: '低价', badgeColor: '#f59e0b' },
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: 'lingdong-sd-2-vip',
      name: 'sd-2-vip',
      displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: pricing.chargedCreditsPerGeneration,
      costPrice: pricing.costCreditsPerGeneration,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter: 'lingdong-sd-2-vip',
      endpointPath: '/videos',
      statusEndpointPath: '/video/generations/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities,
      modelAssembly: { type: 'passthrough' },
      ui: { label: '火山 SD 2.0 低价', badge: '低价', badgeColor: '#f59e0b' },
      status: 'ACTIVE',
    },
  });
  console.log('[volcano-sd2-low-cost-resolution-pricing] updated canvas-lingdong-sd-2-vip');
  console.log(`[volcano-sd2-low-cost-resolution-pricing] tiers=${pricing.resolutionTiers.map(t => `${t.resolution}:${t.chargedCreditsPerGeneration}`).join(',')}`);
}

main()
  .catch(err => {
    console.error('[volcano-sd2-low-cost-resolution-pricing] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
