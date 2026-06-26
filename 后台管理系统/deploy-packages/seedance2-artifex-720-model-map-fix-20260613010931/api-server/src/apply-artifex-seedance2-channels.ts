import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { encryptSecret } from './security.js';

const baseUrl = String(process.env.ARTIFEX_BASE_URL || 'https://api.artifex.help/v1').trim().replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.ARTIFEX_API_KEY || '').trim();

const specs = [
  {
    id: 'seedance2-fast',
    providerKey: 'artifex-seedance2-fast',
    model: 'video-fast-720p',
    displayName: 'Seedance 2 Fast',
    resolution: '720p',
    credits: 450,
  },
  {
    id: 'seedance2-pro',
    providerKey: 'artifex-seedance2',
    model: 'video-pro-720p',
    displayName: 'Seedance 2 高质量',
    resolution: '720p',
    credits: 600,
  },
  {
    id: 'seedance2-pro-1080p',
    providerKey: 'artifex-seedance2-pro-1080p',
    model: 'seedance-2-pro-1080p',
    displayName: 'Seedance 2 Pro 1080p',
    resolution: '1080p',
    credits: 700,
  },
] as const;

const durations = Array.from({ length: 12 }, (_, index) => index + 4);
const supports = {
  txt2video: true,
  img2video: true,
  referenceVideo: true,
  referenceAudio: true,
};

function pricing(credits: number) {
  return {
    pricing: {
      unit: 'generation',
      billingMode: 'per_generation',
      currency: 'credits',
      creditsPerCny: 100,
      memberDiscountRate: 1,
      memberCreditsPerGeneration: credits,
      chargedCreditsPerGeneration: credits,
      originalCreditsPerGeneration: credits,
      costCreditsPerGeneration: credits,
    },
  };
}

function capabilities(resolution: '720p' | '1080p') {
  return {
    resolutions: [resolution],
    durations,
    defaultDuration: 5,
    defaultResolution: resolution,
    aspectRatios: ['16:9', '9:16', '1:1'],
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    maxMaterials: 12,
    maxMaterialSizeMb: 25,
    maxVideoDurationSeconds: 15,
    maxAudioDurationSeconds: 15,
    supportsAudio: true,
    supportsVideo: true,
    supportsLastFrame: false,
  };
}

async function main() {
  const targetProviders = await prisma.upstreamProvider.findMany({
    where: { providerKey: { in: specs.map(spec => spec.providerKey) } },
  });
  const canonicalProvider = await prisma.upstreamProvider.findUnique({
    where: { providerKey: 'seedance2' },
  });
  const reusableProvider = canonicalProvider?.apiKeyEncrypted
    ? canonicalProvider
    : targetProviders.find(provider => provider.apiKeyEncrypted)
    || await prisma.upstreamProvider.findFirst({
      where: {
        OR: [
          { baseUrl: { contains: 'api.artifex.help' } },
          { providerKey: { contains: 'seedance2' } },
          { providerKey: { contains: 'sora-video-pro' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  const sharedApiKeyEncrypted = apiKeyFromEnv
    ? encryptSecret(apiKeyFromEnv)
    : reusableProvider?.apiKeyEncrypted;
  if (!sharedApiKeyEncrypted) {
    throw new Error('未找到可复用的 Artifex API Key。请设置 ARTIFEX_API_KEY 后重新执行。');
  }

  for (const spec of specs) {
    const providerId = `canvas-provider-${spec.id}`;
    const modelId = `canvas-${spec.id}`;
    const existingByKey = targetProviders.find(provider => provider.providerKey === spec.providerKey);
    const existingById = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
    const provider = existingByKey || existingById
      ? await prisma.upstreamProvider.update({
        where: { id: (existingByKey || existingById)!.id },
        data: {
          providerKey: spec.providerKey,
          name: `Artifex ${spec.displayName}`,
          type: 'VIDEO',
          adapter: 'seedance2',
          baseUrl,
          endpointPath: '/videos',
          statusEndpointPath: '/videos/{taskId}',
          uploadMode: 'object_storage',
          requestMethod: 'async-poll',
          defaultModel: spec.model,
          apiKeyEncrypted: sharedApiKeyEncrypted,
          timeoutMs: 900000,
          status: 'ACTIVE',
        },
      })
      : await prisma.upstreamProvider.create({
        data: {
          id: providerId,
          providerKey: spec.providerKey,
          name: `Artifex ${spec.displayName}`,
          type: 'VIDEO',
          adapter: 'seedance2',
          baseUrl,
          endpointPath: '/videos',
          statusEndpointPath: '/videos/{taskId}',
          uploadMode: 'object_storage',
          requestMethod: 'async-poll',
          defaultModel: spec.model,
          apiKeyEncrypted: sharedApiKeyEncrypted,
          timeoutMs: 900000,
          status: 'ACTIVE',
        },
      });

    const modelData: Prisma.AiModelUncheckedCreateInput = {
      id: modelId,
      providerId: provider.id,
      modelKey: spec.id,
      name: spec.model,
      displayName: spec.displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: spec.credits,
      costPrice: spec.credits,
      pricePerSecond: 0,
      adapter: 'seedance2',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: {
        adapter: 'seedance2',
        method: 'async-poll',
        endpointPath: '/videos',
        statusEndpointPath: '/videos/{taskId}',
        pollIntervalSeconds: 8,
        resultTtlHours: 6,
        uploadMode: 'object_storage',
      },
      supports,
      defaults: pricing(spec.credits),
      capabilities: capabilities(spec.resolution),
      modelAssembly: { type: 'passthrough' },
      ui: { label: spec.displayName, provider: 'Artifex' },
      status: 'ACTIVE',
    };
    await prisma.aiModel.upsert({
      where: { id: modelId },
      update: { ...modelData, id: undefined },
      create: modelData,
    });
    console.log(`${modelId} -> ${provider.providerKey} ${baseUrl}/videos, ${spec.credits} credits/generation`);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
