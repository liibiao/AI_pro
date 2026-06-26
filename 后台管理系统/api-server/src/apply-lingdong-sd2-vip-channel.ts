import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { decryptSecret, encryptSecret } from './security.js';

const providerId = 'canvas-provider-lingdong-sd-2-vip';
const modelId = 'canvas-lingdong-sd-2-vip';
const providerKey = 'lingdong-sd-2-vip';
const modelKey = 'lingdong-sd-2-vip';
const modelName = 'sd-2-vip';
const displayName = 'SD 2 VIP 专属折扣';
const baseUrl = String(process.env.LINGDONG_BASE_URL || 'https://www.lingdongapi.com/v1').trim().replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.LINGDONG_API_KEY || '').trim();

const supports = {
  txt2video: true,
  img2video: true,
  referenceImages: true,
  referenceVideo: true,
  referenceAudio: true,
};

const capabilities = {
  resolutions: ['480p', '720p'],
  sizes: ['480p', '720p'],
  defaultResolution: '720p',
  defaultSize: '720p',
  durations: [15],
  defaultDuration: 15,
  aspectRatios: ['9:16', '16:9', '1:1'],
  orientations: ['portrait', 'landscape', 'square'],
  defaultOrientation: 'portrait',
  maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
  maxVideos: 3,
  maxAudios: 3,
  maxPromptLength: 4000,
  maxImageSizeMb: 30,
  maxVideoSizeMb: 50,
  maxAudioSizeMb: 15,
  maxVideoDurationSeconds: 15,
  maxAudioDurationSeconds: 15,
  supportsVideo: true,
  supportsAudio: true,
  supportsLastFrame: false,
};

const defaults = {
  pricing: {
    unit: 'second',
    billingMode: 'per_second',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    chargedCreditsPerSecond: 0,
    originalCreditsPerSecond: 0,
    costCreditsPerSecond: 0,
    resolutionTiers: [
      { resolution: '480p', chargedCreditsPerSecond: 0, originalCreditsPerSecond: 0, costCreditsPerSecond: 0 },
      { resolution: '720p', chargedCreditsPerSecond: 0, originalCreditsPerSecond: 0, costCreditsPerSecond: 0 },
    ],
    note: '请在后台模型管理中配置 480p / 720p 秒价后启用。',
  },
  size: '720p',
  resolution: '720p',
  orientation: 'portrait',
  duration: 15,
};

const protocol = {
  adapter: 'lingdong-sd-2-vip',
  method: 'async-poll',
  endpointPath: '/videos',
  statusEndpointPath: '/video/generations/{taskId}',
  pollIntervalSeconds: 8,
  uploadMode: 'object_storage',
};

function isPlaceholderSecret(value?: string | null) {
  if (!value) return true;
  try {
    const decrypted = decryptSecret(value).trim().toLowerCase();
    return !decrypted
      || decrypted === 'replace-me'
      || decrypted === 'your-api-key'
      || decrypted.startsWith('replace-with-');
  } catch {
    return false;
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isLegacyLingdongPricing(model?: { unit?: string | null; defaults?: Prisma.JsonValue | null } | null) {
  const existingDefaults = jsonObject(model?.defaults);
  const pricing = jsonObject(existingDefaults.pricing);
  const unit = String(pricing.unit || model?.unit || '').trim().toLowerCase();
  const mode = String(pricing.billingMode || pricing.billing_mode || '').trim().toLowerCase();
  return unit === 'generation' || mode === 'per_generation';
}

function isLegacyLingdongCapabilities(model?: { capabilities?: Prisma.JsonValue | null } | null) {
  const existingCapabilities = jsonObject(model?.capabilities);
  const resolutions = Array.isArray(existingCapabilities.resolutions) ? existingCapabilities.resolutions.map(value => String(value).toLowerCase()) : [];
  return resolutions.includes('small') || resolutions.includes('large');
}

function normalizeExistingLingdongDefaults(model?: { unit?: string | null; defaults?: Prisma.JsonValue | null; pricePerSecond?: number | null } | null) {
  const existingDefaults = jsonObject(model?.defaults);
  const existingPricing = jsonObject(existingDefaults.pricing);
  if (!isLegacyLingdongPricing(model) && Object.keys(existingPricing).length) return existingDefaults;
  const currentSecondPrice = Number(
    existingPricing.chargedCreditsPerSecond ??
    existingPricing.memberCreditsPerSecond ??
    model?.pricePerSecond ??
    0,
  );
  const perSecondPrice = Number.isFinite(currentSecondPrice) && currentSecondPrice >= 0 ? currentSecondPrice : 0;
  return {
    ...existingDefaults,
    ...defaults,
    pricing: {
      ...existingPricing,
      unit: 'second',
      billingMode: 'per_second',
      currency: String(existingPricing.currency || defaults.pricing.currency),
      creditsPerCny: Number(existingPricing.creditsPerCny || defaults.pricing.creditsPerCny),
      memberDiscountRate: Number(existingPricing.memberDiscountRate || defaults.pricing.memberDiscountRate),
      chargedCreditsPerSecond: perSecondPrice,
      originalCreditsPerSecond: perSecondPrice,
      costCreditsPerSecond: perSecondPrice,
      resolutionTiers: [
        { resolution: '480p', chargedCreditsPerSecond: perSecondPrice, originalCreditsPerSecond: perSecondPrice, costCreditsPerSecond: perSecondPrice },
        { resolution: '720p', chargedCreditsPerSecond: perSecondPrice, originalCreditsPerSecond: perSecondPrice, costCreditsPerSecond: perSecondPrice },
      ],
    },
    size: '720p',
    resolution: '720p',
  };
}

async function main() {
  const existingProvider = await prisma.upstreamProvider.findFirst({
    where: { OR: [{ id: providerId }, { providerKey }] },
  });
  const providerStatus = apiKeyFromEnv ? 'ACTIVE' : (existingProvider?.status || 'DISABLED');
  const provider = existingProvider
    ? await prisma.upstreamProvider.update({
      where: { id: existingProvider.id },
      data: {
        providerKey: existingProvider.providerKey || providerKey,
        name: existingProvider.name || '灵动 sd-2-vip 专属折扣',
        type: existingProvider.type || 'VIDEO',
        adapter: existingProvider.adapter || 'lingdong-sd-2-vip',
        baseUrl: existingProvider.baseUrl || baseUrl,
        endpointPath: existingProvider.endpointPath || '/videos',
        statusEndpointPath: existingProvider.statusEndpointPath || '/video/generations/{taskId}',
        uploadMode: existingProvider.uploadMode || 'object_storage',
        requestMethod: existingProvider.requestMethod || 'async-poll',
        defaultModel: existingProvider.defaultModel || modelName,
        timeoutMs: existingProvider.timeoutMs || 900000,
        ...(apiKeyFromEnv && isPlaceholderSecret(existingProvider.apiKeyEncrypted) ? { apiKeyEncrypted: encryptSecret(apiKeyFromEnv) } : {}),
        status: existingProvider.status || providerStatus,
      },
    })
    : await prisma.upstreamProvider.create({
      data: {
        id: providerId,
        providerKey,
        name: '灵动 sd-2-vip 专属折扣',
        type: 'VIDEO',
        adapter: 'lingdong-sd-2-vip',
        baseUrl,
        endpointPath: '/videos',
        statusEndpointPath: '/video/generations/{taskId}',
        uploadMode: 'object_storage',
        requestMethod: 'async-poll',
        defaultModel: modelName,
        apiKeyEncrypted: encryptSecret(apiKeyFromEnv || 'replace-me'),
        timeoutMs: 900000,
        status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
      },
    });

  const existingModel = await prisma.aiModel.findFirst({
    where: { OR: [{ id: modelId }, { modelKey }] },
  });
  const createData: Prisma.AiModelUncheckedCreateInput = {
    id: modelId,
    providerId: provider.id,
    modelKey,
    name: modelName,
    displayName,
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: 0,
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
    ui: { label: displayName, badge: '专属', badgeColor: '#f59e0b', provider: '灵动' },
    status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
  };

  if (existingModel) {
    const legacyPricing = isLegacyLingdongPricing(existingModel);
    const legacyCapabilities = isLegacyLingdongCapabilities(existingModel);
    await prisma.aiModel.update({
      where: { id: existingModel.id },
      data: {
        providerId: existingModel.providerId || provider.id,
        modelKey: existingModel.modelKey || modelKey,
        name: existingModel.name || modelName,
        displayName: existingModel.displayName || displayName,
        type: existingModel.type || 'VIDEO',
        unit: legacyPricing ? 'second' : existingModel.unit || 'second',
        salePrice: existingModel.salePrice ?? 0,
        costPrice: existingModel.costPrice ?? 0,
        pricePerSecond: existingModel.pricePerSecond ?? 0,
        adapter: existingModel.adapter || 'lingdong-sd-2-vip',
        endpointPath: existingModel.endpointPath || '/videos',
        statusEndpointPath: existingModel.statusEndpointPath || '/video/generations/{taskId}',
        uploadMode: existingModel.uploadMode || 'object_storage',
        protocol: (existingModel.protocol || protocol) as Prisma.InputJsonValue,
        supports: (existingModel.supports || supports) as Prisma.InputJsonValue,
        defaults: normalizeExistingLingdongDefaults(existingModel) as Prisma.InputJsonValue,
        capabilities: (legacyCapabilities ? capabilities : existingModel.capabilities || capabilities) as Prisma.InputJsonValue,
        modelAssembly: (existingModel.modelAssembly || { type: 'passthrough' }) as Prisma.InputJsonValue,
        ui: (existingModel.ui || { label: displayName, badge: '专属', badgeColor: '#f59e0b', provider: '灵动' }) as Prisma.InputJsonValue,
        status: existingModel.status || (apiKeyFromEnv ? 'ACTIVE' : 'DISABLED'),
      },
    });
    console.log(`${existingModel.id} exists; preserved admin-edited fields.`);
    return;
  }

  await prisma.aiModel.create({ data: createData });
  console.log(`${modelId} created -> ${provider.providerKey} ${provider.baseUrl}/videos (${apiKeyFromEnv ? 'ACTIVE' : 'DISABLED until LINGDONG_API_KEY/pricing is configured'})`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
