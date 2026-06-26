import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { imagePricingDefaults, IMAGE_PRICING_TIERS } from './pricing.js';
import { decryptSecret, encryptSecret } from './security.js';

const providerId = 'canvas-provider-aiyunzhi-gpt-image-2-api';
const providerKey = 'canvas_aiyunzhi-gpt-image-2-api';
const modelId = 'canvas-aiyunzhi-gpt-image-2-api';
const modelKey = 'aiyunzhi-gpt-image-2-api';
const displayName = 'Aiyunzhi GPT Image 2 API';
const baseUrl = String(process.env.AIYUNZHI_GPT_IMAGE2_BASE_URL || 'https://aiyunzhi.top').trim().replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.AIYUNZHI_GPT_IMAGE2_API_KEY || process.env.AIYUNZHI_API_KEY || '').trim();
const pricingTiers = IMAGE_PRICING_TIERS.filter(item => item.tier !== '3K');

const protocol = {
  adapter: 'aiyunzhi-gpt-image-2',
  method: 'sync',
  endpointPath: '/v1/images/generations',
  endpoint_path: '/v1/images/generations',
  generationEndpointPath: '/v1/images/generations',
  generation_endpoint_path: '/v1/images/generations',
  editEndpointPath: '/v1/images/edits',
  edit_endpoint_path: '/v1/images/edits',
  uploadMode: 'object_storage',
  upload_mode: 'object_storage',
  requestSchema: 'aiyunzhi-gpt-image-2',
  responseType: 'provider_url',
  maxReferenceImages: 3,
};

const supports = {
  txt2img: true,
  img2img: true,
  imageToImage: true,
  storyboard: true,
  repair: true,
  panorama: false,
  referenceImages: true,
};

const defaults = {
  ...imagePricingDefaults(pricingTiers),
  size: '1k',
  imageSize: '1k',
  image_size: '1k',
  resolution: '1k',
  aspectRatio: '1:1',
  aspect_ratio: '1:1',
  n: 1,
  response_format: 'url',
};

const capabilities = {
  resolutions: ['1k', '2k', '4k'],
  imageSizes: ['1k', '2k', '4k'],
  sizes: ['1k', '2k', '4k'],
  aspectRatios: ['1:1'],
  responseFormats: ['url', 'b64_json'],
  defaultResolution: '1k',
  defaultSize: '1k',
  maxImages: 3,
  maxReferenceImages: 3,
  supportsReferenceImages: true,
};

function isPlaceholderSecret(value?: string | null) {
  if (!value) return true;
  const raw = value.trim().toLowerCase();
  if (!raw || raw === 'replace-me' || raw === 'your-api-key' || raw.includes('your-key') || raw.startsWith('replace-with-')) return true;
  try {
    const decrypted = decryptSecret(value).trim().toLowerCase();
    return !decrypted
      || decrypted === 'replace-me'
      || decrypted === 'your-api-key'
      || decrypted.includes('your-key')
      || decrypted.startsWith('replace-with-');
  } catch {
    return false;
  }
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function displayNameFor(existing?: { displayName?: string | null } | null) {
  const current = String(existing?.displayName || '').trim();
  if (!current || /firefly/i.test(current)) return displayName;
  return current;
}

function mergeDefaultsPreservingPricing(existing: Prisma.JsonValue | null | undefined) {
  const current = jsonObject(existing);
  const pricing = jsonObject(current.pricing);
  const currentTiers = Array.isArray(pricing.tiers) ? pricing.tiers : [];
  const filteredTiers = currentTiers
    .map(item => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter(item => ['1K', '2K', '4K'].includes(String(item.tier || item.resolution || item.label || '').trim().toUpperCase()));
  const nextPricing = Object.keys(pricing).length
    ? { ...pricing, tiers: filteredTiers.length ? filteredTiers : defaults.pricing.tiers }
    : defaults.pricing;
  return {
    ...current,
    ...defaults,
    pricing: nextPricing,
  };
}

async function main() {
  const existingModel = await prisma.aiModel.findFirst({
    where: { OR: [{ id: modelId }, { modelKey }] },
    include: { provider: true },
  });
  const existingProvider = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: providerId },
        { providerKey },
        ...(existingModel?.providerId ? [{ id: existingModel.providerId }] : []),
      ],
    },
  });
  const hasUsableExistingKey = existingProvider?.apiKeyEncrypted && !isPlaceholderSecret(existingProvider.apiKeyEncrypted);
  const providerStatus = existingProvider?.status || (apiKeyFromEnv || hasUsableExistingKey ? 'ACTIVE' : 'DISABLED');
  const provider = existingProvider
    ? await prisma.upstreamProvider.update({
      where: { id: existingProvider.id },
      data: {
        providerKey: existingProvider.providerKey || providerKey,
        name: existingProvider.name && !/firefly/i.test(existingProvider.name) ? existingProvider.name : '画布渠道 Aiyunzhi GPT Image 2',
        type: 'IMAGE',
        adapter: 'aiyunzhi-gpt-image-2',
        baseUrl: existingProvider.baseUrl || baseUrl,
        endpointPath: '/v1/images/generations',
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        requestMethod: 'sync',
        defaultModel: 'gpt-image-2',
        timeoutMs: existingProvider.timeoutMs || 900000,
        ...(apiKeyFromEnv && isPlaceholderSecret(existingProvider.apiKeyEncrypted) ? { apiKeyEncrypted: encryptSecret(apiKeyFromEnv) } : {}),
        status: providerStatus,
      },
    })
    : await prisma.upstreamProvider.create({
      data: {
        id: providerId,
        providerKey,
        name: '画布渠道 Aiyunzhi GPT Image 2',
        type: 'IMAGE',
        adapter: 'aiyunzhi-gpt-image-2',
        baseUrl,
        apiKeyEncrypted: encryptSecret(apiKeyFromEnv || 'replace-me'),
        endpointPath: '/v1/images/generations',
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        requestMethod: 'sync',
        defaultModel: 'gpt-image-2',
        timeoutMs: 900000,
        status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
      },
    });

  const createData: Prisma.AiModelUncheckedCreateInput = {
    id: modelId,
    providerId: provider.id,
    modelKey,
    name: 'gpt-image-2',
    displayName,
    type: 'IMAGE',
    unit: 'image_resolution_tier',
    salePrice: pricingTiers[0].chargedCredits,
    costPrice: pricingTiers[0].costCredits,
    pricePerSecond: 0,
    adapter: 'aiyunzhi-gpt-image-2',
    endpointPath: '/v1/images/generations',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    protocol,
    supports,
    defaults,
    capabilities,
    modelAssembly: { type: 'literal' },
    ui: { label: displayName, badge: 'GPT2', badgeColor: '#2563eb', provider: 'Aiyunzhi' },
    status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
  };

  if (existingModel) {
    await prisma.aiModel.update({
      where: { id: existingModel.id },
      data: {
        providerId: provider.id,
        modelKey,
        name: 'gpt-image-2',
        displayName: displayNameFor(existingModel),
        type: 'IMAGE',
        unit: existingModel.unit || 'image_resolution_tier',
        salePrice: existingModel.salePrice ?? pricingTiers[0].chargedCredits,
        costPrice: existingModel.costPrice ?? pricingTiers[0].costCredits,
        pricePerSecond: existingModel.pricePerSecond ?? 0,
        adapter: 'aiyunzhi-gpt-image-2',
        endpointPath: '/v1/images/generations',
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        protocol: protocol as Prisma.InputJsonValue,
        supports: supports as Prisma.InputJsonValue,
        defaults: mergeDefaultsPreservingPricing(existingModel.defaults) as Prisma.InputJsonValue,
        capabilities: capabilities as Prisma.InputJsonValue,
        modelAssembly: { type: 'literal' } as Prisma.InputJsonValue,
        ui: (Object.keys(jsonObject(existingModel.ui)).length ? existingModel.ui : createData.ui) as Prisma.InputJsonValue,
        status: existingModel.status || (apiKeyFromEnv || hasUsableExistingKey ? 'ACTIVE' : 'DISABLED'),
      },
    });
    console.log(`${existingModel.id} updated for Aiyunzhi GPT Image 2; existing key/pricing preserved.`);
    return;
  }

  await prisma.aiModel.create({ data: createData });
  console.log(`${modelId} created for Aiyunzhi GPT Image 2 (${apiKeyFromEnv ? 'ACTIVE' : 'DISABLED until API key is configured'}).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
