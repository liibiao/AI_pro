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
  resolutions: ['small', 'large'],
  sizes: ['small', 'large'],
  defaultResolution: 'small',
  defaultSize: 'small',
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
    unit: 'generation',
    billingMode: 'per_generation',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    memberCreditsPerGeneration: 0,
    chargedCreditsPerGeneration: 0,
    originalCreditsPerGeneration: 0,
    costCreditsPerGeneration: 0,
    note: 'API 文档未提供专属折扣价格；请在后台模型管理中配置后启用。',
  },
  size: 'small',
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
    unit: 'generation',
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
    await prisma.aiModel.update({
      where: { id: existingModel.id },
      data: {
        providerId: existingModel.providerId || provider.id,
        modelKey: existingModel.modelKey || modelKey,
        name: existingModel.name || modelName,
        displayName: existingModel.displayName || displayName,
        type: existingModel.type || 'VIDEO',
        unit: existingModel.unit || 'generation',
        salePrice: existingModel.salePrice ?? 0,
        costPrice: existingModel.costPrice ?? 0,
        pricePerSecond: existingModel.pricePerSecond ?? 0,
        adapter: existingModel.adapter || 'lingdong-sd-2-vip',
        endpointPath: existingModel.endpointPath || '/videos',
        statusEndpointPath: existingModel.statusEndpointPath || '/video/generations/{taskId}',
        uploadMode: existingModel.uploadMode || 'object_storage',
        protocol: (existingModel.protocol || protocol) as Prisma.InputJsonValue,
        supports: (existingModel.supports || supports) as Prisma.InputJsonValue,
        defaults: (existingModel.defaults || defaults) as Prisma.InputJsonValue,
        capabilities: (existingModel.capabilities || capabilities) as Prisma.InputJsonValue,
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
