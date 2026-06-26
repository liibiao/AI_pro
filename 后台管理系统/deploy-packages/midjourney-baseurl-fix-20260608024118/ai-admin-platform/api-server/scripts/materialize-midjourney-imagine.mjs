import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });
dotenv.config();

const { Prisma } = await import('@prisma/client');
const { prisma } = await import('../dist/db.js');
const { encryptSecret } = await import('../dist/security.js');
const { defaultPricingDefaults, IMAGE_PRICING_TIERS } = await import('../dist/pricing.js');

const providerId = 'canvas-provider-midjourney-imagine';
const modelId = 'canvas-midjourney-imagine';
const providerKey = 'midjourney_imagine';
const adapter = 'midjourney-imagine';
const endpointPath = '/mj/submit/imagine';
const statusEndpointPath = '/mj/task/{taskId}/fetch';
const defaultModel = 'midjourney-imagine';
const defaultBaseUrl = normalizeMidjourneyBaseUrl(process.env.MIDJOURNEY_DEFAULT_BASE_URL || 'http://127.0.0.1:8086');

function normalizeMidjourneyBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return raw.replace(/\/v1$/i, '');
}

function isLegacyAntigravityAutofill(value) {
  return /(?:^https?:\/\/)?45\.77\.211\.38(?::8317)?(?:\/v1)?$/i.test(normalizeMidjourneyBaseUrl(value));
}

function pricingDefaults() {
  return defaultPricingDefaults('IMAGE');
}

async function main() {
  const existingProvider = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
  const existingByKey = existingProvider ? null : await prisma.upstreamProvider.findUnique({ where: { providerKey } });
  const preservedProvider = existingProvider || existingByKey;
  const providerWhereId = preservedProvider?.id || providerId;
  const envBaseUrl = normalizeMidjourneyBaseUrl(process.env.MIDJOURNEY_BASE_URL || process.env.MJ_BASE_URL);
  const preservedBaseUrl = normalizeMidjourneyBaseUrl(preservedProvider?.baseUrl);
  const wasLegacyAutofill = isLegacyAntigravityAutofill(preservedBaseUrl);
  const baseUrl = envBaseUrl || (wasLegacyAutofill ? '' : preservedBaseUrl) || defaultBaseUrl;
  const envKey = String(process.env.MIDJOURNEY_API_KEY || process.env.MJ_API_KEY || '').trim();
  const apiKeyEncrypted = envKey
    ? encryptSecret(envKey)
    : (!wasLegacyAutofill && preservedProvider?.apiKeyEncrypted ? preservedProvider.apiKeyEncrypted : encryptSecret('replace-with-midjourney-api-key'));
  const hasRealKey = Boolean(envKey || (!wasLegacyAutofill && preservedProvider?.apiKeyEncrypted));
  const preservedStatus = wasLegacyAutofill && !envKey ? '' : preservedProvider?.status;
  const providerStatus = String(process.env.MIDJOURNEY_PROVIDER_STATUS || preservedStatus || (hasRealKey ? 'ACTIVE' : 'DISABLED')).toUpperCase();
  const modelStatus = String(process.env.MIDJOURNEY_MODEL_STATUS || 'ACTIVE').toUpperCase();

  await prisma.upstreamProvider.upsert({
    where: { id: providerWhereId },
    update: {
      providerKey,
      name: 'Midjourney Imagine',
      type: 'IMAGE',
      adapter,
      baseUrl,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel,
      defaultParams: {
        botType: 'MID_JOURNEY',
        speedMode: 'FAST',
        accountFilter: { modes: ['FAST'] },
      },
      apiKeyEncrypted,
      timeoutMs: Math.max(Number(preservedProvider?.timeoutMs || 0), 900000),
      status: providerStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    },
    create: {
      id: providerWhereId,
      providerKey,
      name: 'Midjourney Imagine',
      type: 'IMAGE',
      adapter,
      baseUrl,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel,
      defaultParams: {
        botType: 'MID_JOURNEY',
        speedMode: 'FAST',
        accountFilter: { modes: ['FAST'] },
      },
      apiKeyEncrypted,
      timeoutMs: 900000,
      status: providerStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    },
  });

  const provider = await prisma.upstreamProvider.findUniqueOrThrow({ where: { id: providerWhereId } });
  const supports = {
    txt2img: true,
    img2img: true,
    imageToImage: true,
    storyboard: true,
    shotStoryboard: true,
    panorama: false,
    repair: false,
  };
  const protocol = {
    adapter,
    endpointPath,
    statusEndpointPath,
    method: 'async-poll',
    uploadMode: 'object_storage',
    statusMethod: 'GET',
  };
  const defaults = {
    ...pricingDefaults(),
    botType: 'MID_JOURNEY',
    speedMode: 'FAST',
    accountFilter: { modes: ['FAST'] },
  };

  await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey: 'midjourney-imagine',
      name: defaultModel,
      displayName: 'Midjourney Imagine',
      type: 'IMAGE',
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: new Prisma.Decimal(IMAGE_PRICING_TIERS[0].costCredits),
      adapter,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities: {
        role: 'image_generation',
        maxReferenceImages: 8,
        aspectRatios: ['16:9', '3:2', '1:1', '2:3', '9:16'],
        modes: ['txt2img', 'img2img', 'storyboard', 'shotStoryboard'],
      },
      ui: { label: 'Midjourney Imagine', badge: 'MJ', badgeColor: '#0f172a', group: 'Midjourney Image' },
      status: modelStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: 'midjourney-imagine',
      name: defaultModel,
      displayName: 'Midjourney Imagine',
      type: 'IMAGE',
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: new Prisma.Decimal(IMAGE_PRICING_TIERS[0].costCredits),
      adapter,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults,
      capabilities: {
        role: 'image_generation',
        maxReferenceImages: 8,
        aspectRatios: ['16:9', '3:2', '1:1', '2:3', '9:16'],
        modes: ['txt2img', 'img2img', 'storyboard', 'shotStoryboard'],
      },
      ui: { label: 'Midjourney Imagine', badge: 'MJ', badgeColor: '#0f172a', group: 'Midjourney Image' },
      status: modelStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
    },
  });

  const row = await prisma.aiModel.findUnique({
    where: { id: modelId },
    include: { provider: true },
  });
  console.log(JSON.stringify({
    id: row?.id,
    modelKey: row?.modelKey,
    displayName: row?.displayName,
    model: row?.name,
    type: row?.type,
    status: row?.status,
    providerKey: row?.provider.providerKey,
    providerStatus: row?.provider.status,
    adapter: row?.adapter || row?.provider.adapter,
    baseUrl: row?.provider.baseUrl,
    endpointPath: row?.endpointPath || row?.provider.endpointPath,
    statusEndpointPath: row?.statusEndpointPath || row?.provider.statusEndpointPath,
    uploadMode: row?.uploadMode || row?.provider.uploadMode,
    requestMethod: row?.provider.requestMethod,
    configuredFromEnv: Boolean(envBaseUrl || envKey) || undefined,
    replacedLegacyBaseUrl: wasLegacyAutofill || undefined,
  }, null, 2));
}

main()
  .catch(err => {
    console.error('[midjourney] materialize failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
