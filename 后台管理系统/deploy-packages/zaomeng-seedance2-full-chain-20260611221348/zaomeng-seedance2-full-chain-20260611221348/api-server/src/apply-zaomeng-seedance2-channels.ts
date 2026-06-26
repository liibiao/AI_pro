import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { decryptSecret, encryptSecret } from './security.js';

const providerId = 'canvas-provider-zaomeng-seedance2';
const providerKey = 'zaomeng-seedance2';
const baseUrl = String(process.env.ZAOMENG_BASE_URL || 'https://winter-cell-1964.as522254919.workers.dev').trim().replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.ZAOMENG_API_KEY || '').trim();

const protocol = {
  adapter: 'zaomeng-seedance2',
  method: 'async-poll',
  endpointPath: '/v1/video/generations',
  statusEndpointPath: '/v1/videos/{taskId}',
  pollIntervalSeconds: 5,
  uploadMode: 'object_storage',
  requestSchema: 'zaomeng-seedance2-files',
};

const supports = {
  txt2video: true,
  img2video: true,
  referenceImages: true,
  referenceVideo: true,
  referenceAudio: true,
};

const capabilities = {
  resolutions: ['720p', '1080p'],
  defaultResolution: '720p',
  durations: Array.from({ length: 15 }, (_, index) => index + 1),
  durationsByResolution: {
    '720p': Array.from({ length: 15 }, (_, index) => index + 1),
    '1080p': Array.from({ length: 12 }, (_, index) => index + 1),
  },
  defaultDuration: 5,
  aspectRatios: ['16:9', '9:16', '1:1'],
  maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
  maxVideos: 3,
  maxAudios: 3,
  maxMaterials: 9,
  maxPromptLength: 4000,
  maxVideoDurationSeconds: 15,
  maxVideoDurationSecondsByResolution: { '720p': 15, '1080p': 12 },
  minAudioDurationSeconds: 3,
  supportsVideo: true,
  supportsAudio: true,
  supportsLastFrame: false,
  referencePromptMarkersRequired: true,
  referenceFilesField: 'files',
};

const defaults = {
  pricing: {
    unit: 'second',
    billingMode: 'per_second',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    chargedCreditsPerSecond: 1,
    originalCreditsPerSecond: 1,
    costCreditsPerSecond: 1,
    resolutionTiers: [
      { resolution: '720p', chargedCreditsPerSecond: 1, originalCreditsPerSecond: 1, costCreditsPerSecond: 1 },
      { resolution: '1080p', chargedCreditsPerSecond: 2, originalCreditsPerSecond: 2, costCreditsPerSecond: 2 },
    ],
    note: '造梦余额单位为秒：720p 每秒扣 1 秒余额，1080p 每秒扣 2 秒余额。后台可自行调整售价。',
  },
  resolution: '720p',
  duration: 5,
  aspectRatio: '16:9',
};

const modelSpecs = [
  {
    id: 'canvas-zaomeng-seedance2-svip',
    modelKey: 'zaomeng-seedance2-svip',
    name: 'seedance-2.0-svip',
    displayName: '造梦 Seedance 2.0 高质量',
    badge: 'SVIP',
    badgeColor: '#7c3aed',
  },
  {
    id: 'canvas-zaomeng-seedance2-fast',
    modelKey: 'zaomeng-seedance2-fast',
    name: 'seedance-2.0-fast',
    displayName: '造梦 Seedance 2.0 快速',
    badge: 'FAST',
    badgeColor: '#0ea5e9',
  },
];

function isPlaceholderSecret(value?: string | null) {
  if (!value) return true;
  try {
    const decrypted = decryptSecret(value).trim().toLowerCase();
    return !decrypted
      || decrypted === 'replace-me'
      || decrypted === 'your-api-key'
      || decrypted.startsWith('replace-with-')
      || decrypted.includes('placeholder');
  } catch {
    return false;
  }
}

async function upsertProvider() {
  const existing = await prisma.upstreamProvider.findFirst({
    where: { OR: [{ id: providerId }, { providerKey }] },
  });
  if (existing) {
    const data: Prisma.UpstreamProviderUpdateInput = {
      providerKey: existing.providerKey || providerKey,
      name: existing.name || '造梦 Seedance 2.0',
      type: existing.type || 'VIDEO',
      adapter: existing.adapter || 'zaomeng-seedance2',
      baseUrl: existing.baseUrl || baseUrl,
      endpointPath: existing.endpointPath || '/v1/video/generations',
      statusEndpointPath: existing.statusEndpointPath || '/v1/videos/{taskId}',
      uploadMode: existing.uploadMode || 'object_storage',
      requestMethod: existing.requestMethod || 'async-poll',
      defaultModel: existing.defaultModel || 'seedance-2.0-svip',
      timeoutMs: existing.timeoutMs || 900000,
      ...(apiKeyFromEnv && isPlaceholderSecret(existing.apiKeyEncrypted) ? { apiKeyEncrypted: encryptSecret(apiKeyFromEnv) } : {}),
    };
    const provider = await prisma.upstreamProvider.update({ where: { id: existing.id }, data });
    console.log(`${provider.id} provider exists; preserved admin-edited fields.`);
    return provider;
  }
  const provider = await prisma.upstreamProvider.create({
    data: {
      id: providerId,
      providerKey,
      name: '造梦 Seedance 2.0',
      type: 'VIDEO',
      adapter: 'zaomeng-seedance2',
      baseUrl,
      endpointPath: '/v1/video/generations',
      statusEndpointPath: '/v1/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'seedance-2.0-svip',
      apiKeyEncrypted: encryptSecret(apiKeyFromEnv || 'replace-me'),
      timeoutMs: 900000,
      status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
    },
  });
  console.log(`${provider.id} provider created (${apiKeyFromEnv ? 'ACTIVE' : 'DISABLED until ZAOMENG_API_KEY is configured'}).`);
  return provider;
}

async function upsertModel(providerIdValue: string, spec: (typeof modelSpecs)[number]) {
  const existing = await prisma.aiModel.findFirst({
    where: { OR: [{ id: spec.id }, { modelKey: spec.modelKey }] },
  });
  const createData: Prisma.AiModelUncheckedCreateInput = {
    id: spec.id,
    providerId: providerIdValue,
    modelKey: spec.modelKey,
    name: spec.name,
    displayName: spec.displayName,
    type: 'VIDEO',
    unit: 'second',
    salePrice: 1,
    costPrice: 1,
    pricePerSecond: 1,
    adapter: 'zaomeng-seedance2',
    endpointPath: '/v1/video/generations',
    statusEndpointPath: '/v1/videos/{taskId}',
    uploadMode: 'object_storage',
    protocol,
    supports,
    defaults,
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui: { label: spec.displayName, badge: spec.badge, badgeColor: spec.badgeColor, provider: '造梦' },
    status: apiKeyFromEnv ? 'ACTIVE' : 'DISABLED',
  };
  if (!existing) {
    await prisma.aiModel.create({ data: createData });
    console.log(`${spec.id} created -> ${spec.name} (${apiKeyFromEnv ? 'ACTIVE' : 'DISABLED until ZAOMENG_API_KEY is configured'})`);
    return;
  }
  await prisma.aiModel.update({
    where: { id: existing.id },
    data: {
      providerId: existing.providerId || providerIdValue,
      modelKey: existing.modelKey || spec.modelKey,
      name: existing.name || spec.name,
      displayName: existing.displayName || spec.displayName,
      type: existing.type || 'VIDEO',
      unit: existing.unit || 'second',
      adapter: existing.adapter || 'zaomeng-seedance2',
      endpointPath: existing.endpointPath || '/v1/video/generations',
      statusEndpointPath: existing.statusEndpointPath || '/v1/videos/{taskId}',
      uploadMode: existing.uploadMode || 'object_storage',
      protocol: (existing.protocol || protocol) as Prisma.InputJsonValue,
      supports: (existing.supports || supports) as Prisma.InputJsonValue,
      defaults: (existing.defaults || defaults) as Prisma.InputJsonValue,
      capabilities: (existing.capabilities || capabilities) as Prisma.InputJsonValue,
      modelAssembly: (existing.modelAssembly || { type: 'passthrough' }) as Prisma.InputJsonValue,
      ui: (existing.ui || { label: spec.displayName, badge: spec.badge, badgeColor: spec.badgeColor, provider: '造梦' }) as Prisma.InputJsonValue,
    },
  });
  console.log(`${existing.id} exists; preserved admin-edited fields.`);
}

async function main() {
  const provider = await upsertProvider();
  for (const spec of modelSpecs) {
    await upsertModel(provider.id, spec);
  }
  console.log('Zaomeng Seedance 2.0 channel apply complete.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
