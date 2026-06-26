import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { decryptSecret, encryptSecret } from './security.js';

const baseUrl = String(process.env.TOAPIS_BASE_URL || 'https://toapis.com').trim().replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.TOAPIS_API_KEY || '').trim();
const enableChannels = String(process.env.TOAPIS_ENABLE_CHANNELS || '').trim().toLowerCase() === 'true';

const protocol = {
  adapter: 'toapis-seedance2',
  method: 'async-poll',
  endpointPath: '/v1/videos/generations',
  statusEndpointPath: '/v1/videos/generations/{taskId}',
  pollInitialDelaySeconds: 5,
  pollIntervalSeconds: 10,
  resultTtlHours: 24,
  uploadMode: 'object_storage',
  soundField: 'generate_audio',
  requestSchema: 'toapis-seedance2-roles',
};

const supports = {
  txt2video: true,
  img2video: true,
  referenceImages: true,
  referenceVideo: true,
  referenceAudio: true,
  generateAudio: true,
};

const durations = Array.from({ length: 12 }, (_, index) => index + 4);
const aspectRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

function defaults(resolution = '720p') {
  return {
    mode: 'reference_material',
    resolution,
    duration: 5,
    generate_audio: true,
    pricing: {
      unit: 'generation',
      billingMode: 'per_generation',
      currency: 'credits',
      creditsPerCny: 100,
      memberDiscountRate: 1,
      chargedCreditsPerGeneration: 0,
      originalCreditsPerGeneration: 0,
      costCreditsPerGeneration: 0,
      note: '请在后台模型管理中配置真实售价和成本后再启用 ToAPIs Seedance 2 渠道。',
    },
  };
}

function capabilities(resolutions: string[]) {
  return {
    resolutions,
    sizes: resolutions,
    defaultResolution: '720p',
    defaultSize: '720p',
    durations,
    autoDurations: [0, -1],
    defaultDuration: 5,
    aspectRatios,
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    maxPromptLength: 4000,
    maxImageSizeMb: 30,
    maxVideoSizeMb: 200,
    maxAudioSizeMb: 50,
    maxVideoDurationSeconds: 15,
    maxAudioDurationSeconds: 15,
    supportsVideo: true,
    supportsAudio: true,
    supportsGeneratedAudio: true,
    supportsLastFrame: true,
    requiresPricingConfiguration: true,
  };
}

const specs = [
  {
    providerId: 'canvas-provider-toapis-seedance-2',
    providerKey: 'toapis-seedance2',
    providerName: 'ToAPIs Seedance 2',
    modelId: 'canvas-toapis-seedance-2',
    modelKey: 'toapis-seedance-2',
    modelName: 'seedance-2',
    displayName: 'ToAPIs Seedance 2',
    badge: 'TO',
    badgeColor: '#0ea5e9',
    resolutions: ['480p', '720p', '1080p'],
  },
  {
    providerId: 'canvas-provider-toapis-seedance-2-fast',
    providerKey: 'toapis-seedance2-fast',
    providerName: 'ToAPIs Seedance 2 Fast',
    modelId: 'canvas-toapis-seedance-2-fast',
    modelKey: 'toapis-seedance-2-fast',
    modelName: 'seedance-2-fast',
    displayName: 'ToAPIs Seedance 2 Fast',
    badge: 'FAST',
    badgeColor: '#38bdf8',
    resolutions: ['480p', '720p'],
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

async function upsertProvider(spec: (typeof specs)[number]) {
  const existing = await prisma.upstreamProvider.findFirst({
    where: { OR: [{ id: spec.providerId }, { providerKey: spec.providerKey }] },
  });
  if (existing) {
    const data: Prisma.UpstreamProviderUpdateInput = {
      providerKey: existing.providerKey || spec.providerKey,
      name: existing.name || spec.providerName,
      type: existing.type || 'VIDEO',
      adapter: existing.adapter || 'toapis-seedance2',
      baseUrl: existing.baseUrl || baseUrl,
      endpointPath: existing.endpointPath || '/v1/videos/generations',
      statusEndpointPath: existing.statusEndpointPath || '/v1/videos/generations/{taskId}',
      uploadMode: existing.uploadMode || 'object_storage',
      requestMethod: existing.requestMethod || 'async-poll',
      defaultModel: existing.defaultModel || spec.modelName,
      timeoutMs: existing.timeoutMs || 900000,
      ...(apiKeyFromEnv && isPlaceholderSecret(existing.apiKeyEncrypted) ? { apiKeyEncrypted: encryptSecret(apiKeyFromEnv) } : {}),
    };
    const provider = await prisma.upstreamProvider.update({ where: { id: existing.id }, data });
    console.log(`${provider.id} provider exists; preserved admin-edited fields.`);
    return provider;
  }
  const provider = await prisma.upstreamProvider.create({
    data: {
      id: spec.providerId,
      providerKey: spec.providerKey,
      name: spec.providerName,
      type: 'VIDEO',
      adapter: 'toapis-seedance2',
      baseUrl,
      apiKeyEncrypted: encryptSecret(apiKeyFromEnv || 'replace-me'),
      endpointPath: '/v1/videos/generations',
      statusEndpointPath: '/v1/videos/generations/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: spec.modelName,
      timeoutMs: 900000,
      status: apiKeyFromEnv && enableChannels ? 'ACTIVE' : 'DISABLED',
    },
  });
  console.log(`${provider.id} provider created (${provider.status}; set TOAPIS_API_KEY and TOAPIS_ENABLE_CHANNELS=true to auto-enable new channels).`);
  return provider;
}

async function upsertModel(providerId: string, spec: (typeof specs)[number]) {
  const existing = await prisma.aiModel.findFirst({
    where: { OR: [{ id: spec.modelId }, { modelKey: spec.modelKey }] },
  });
  const createData: Prisma.AiModelUncheckedCreateInput = {
    id: spec.modelId,
    providerId,
    modelKey: spec.modelKey,
    name: spec.modelName,
    displayName: spec.displayName,
    type: 'VIDEO',
    unit: 'generation',
    salePrice: 0,
    costPrice: 0,
    pricePerSecond: 0,
    adapter: 'toapis-seedance2',
    endpointPath: '/v1/videos/generations',
    statusEndpointPath: '/v1/videos/generations/{taskId}',
    uploadMode: 'object_storage',
    protocol,
    supports,
    defaults: defaults(),
    capabilities: capabilities(spec.resolutions),
    modelAssembly: { type: 'passthrough' },
    ui: { label: spec.displayName, badge: spec.badge, badgeColor: spec.badgeColor, provider: 'ToAPIs' },
    status: apiKeyFromEnv && enableChannels ? 'ACTIVE' : 'DISABLED',
  };
  if (!existing) {
    await prisma.aiModel.create({ data: createData });
    console.log(`${spec.modelId} created -> ${spec.modelName} (${createData.status}).`);
    return;
  }
  await prisma.aiModel.update({
    where: { id: existing.id },
    data: {
      providerId: existing.providerId || providerId,
      modelKey: existing.modelKey || spec.modelKey,
      name: existing.name || spec.modelName,
      displayName: existing.displayName || spec.displayName,
      type: existing.type || 'VIDEO',
      unit: existing.unit || 'generation',
      adapter: existing.adapter || 'toapis-seedance2',
      endpointPath: existing.endpointPath || '/v1/videos/generations',
      statusEndpointPath: existing.statusEndpointPath || '/v1/videos/generations/{taskId}',
      uploadMode: existing.uploadMode || 'object_storage',
      protocol: (existing.protocol || protocol) as Prisma.InputJsonValue,
      supports: (existing.supports || supports) as Prisma.InputJsonValue,
      defaults: (existing.defaults || defaults()) as Prisma.InputJsonValue,
      capabilities: (existing.capabilities || capabilities(spec.resolutions)) as Prisma.InputJsonValue,
      modelAssembly: (existing.modelAssembly || { type: 'passthrough' }) as Prisma.InputJsonValue,
      ui: (existing.ui || { label: spec.displayName, badge: spec.badge, badgeColor: spec.badgeColor, provider: 'ToAPIs' }) as Prisma.InputJsonValue,
    },
  });
  console.log(`${existing.id} exists; preserved admin-edited fields.`);
}

async function main() {
  for (const spec of specs) {
    const provider = await upsertProvider(spec);
    await upsertModel(provider.id, spec);
  }
  console.log('ToAPIs Seedance 2 channel apply complete.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
