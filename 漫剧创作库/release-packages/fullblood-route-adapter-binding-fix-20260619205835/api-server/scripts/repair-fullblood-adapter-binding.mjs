import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret } from '../dist/security.js';

const providerId = 'canvas-provider-fullblood-video';
const providerKey = 'canvas_fullblood-video';
const adapter = 'fullblood-video';
const endpointPath = '/videos';
const statusEndpointPath = '/videos/{taskId}';
const uploadMode = 'object_storage';
const modelIdCandidates = [
  'canvas-fullblood-seedance-2',
  'canvas-fullblood-omni-video-2',
  'fullblood-seedance-2',
  'fullblood-omni-video-2',
];
const modelKeyCandidates = [
  'fullblood-seedance-2',
  'fullblood-omni-video-2',
  'canvas-fullblood-seedance-2',
  'canvas-fullblood-omni-video-2',
];

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'replace-me' || normalized === 'your-api-key' || normalized === 'your_api_key' || normalized.includes('placeholder');
}

function decryptIfUsable(encrypted) {
  try {
    const value = decryptSecret(encrypted || '').trim();
    return isPlaceholderSecret(value) ? '' : value;
  } catch {
    return '';
  }
}

async function findProvider() {
  const exact = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: providerId },
        { providerKey },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (exact) return exact;
  return prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { name: { contains: '满血', mode: 'insensitive' } },
        { name: { contains: 'Fullblood', mode: 'insensitive' } },
        { adapter },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function reusableVideoKey(existingProvider) {
  if (existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)) {
    return { encrypted: existingProvider.apiKeyEncrypted, source: `provider:${existingProvider.providerKey}` };
  }
  const linkedModel = await prisma.aiModel.findFirst({
    where: {
      OR: [
        { id: { in: modelIdCandidates } },
        { modelKey: { in: modelKeyCandidates } },
      ],
      provider: { apiKeyEncrypted: { not: '' } },
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  if (linkedModel?.provider?.apiKeyEncrypted && decryptIfUsable(linkedModel.provider.apiKeyEncrypted)) {
    return { encrypted: linkedModel.provider.apiKeyEncrypted, source: `model-provider:${linkedModel.provider.providerKey}` };
  }
  const provider = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      type: 'VIDEO',
      OR: [
        { providerKey: { contains: 'fullblood', mode: 'insensitive' } },
        { providerKey: { contains: 'video', mode: 'insensitive' } },
        { providerKey: { contains: 'sora', mode: 'insensitive' } },
        { name: { contains: 'video', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (provider?.apiKeyEncrypted && decryptIfUsable(provider.apiKeyEncrypted)) {
    return { encrypted: provider.apiKeyEncrypted, source: `provider:${provider.providerKey}` };
  }
  throw new Error('No reusable encrypted video key found for fullblood adapter repair');
}

function repairedProtocol(current) {
  const protocol = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return {
    ...protocol,
    adapter,
    method: 'async-poll',
    endpointPath,
    endpoint_path: endpointPath,
    statusEndpointPath,
    status_endpoint_path: statusEndpointPath,
    uploadMode,
    upload_mode: uploadMode,
    fixedSeconds: 15,
    seconds: '15',
    sizeByAspectRatio: {
      '16:9': '1280x720',
      '9:16': '720x1280',
      '4:3': '960x720',
      '3:4': '720x960',
      '1:1': '720x720',
      '21:9': '1680x720',
      ...(protocol.sizeByAspectRatio && typeof protocol.sizeByAspectRatio === 'object' ? protocol.sizeByAspectRatio : {}),
    },
  };
}

async function main() {
  const existingProvider = await findProvider();
  const key = await reusableVideoKey(existingProvider);
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: existingProvider?.id || providerId },
    update: {
      providerKey,
      name: existingProvider?.name || 'Fullblood Video API',
      type: 'VIDEO',
      adapter,
      baseUrl: existingProvider?.baseUrl || 'https://hongniaoai.com/v1',
      endpointPath,
      statusEndpointPath,
      uploadMode,
      requestMethod: 'async-poll',
      defaultModel: existingProvider?.defaultModel || 'seedance-2.0(满血)',
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
    create: {
      id: existingProvider?.id || providerId,
      providerKey,
      name: 'Fullblood Video API',
      type: 'VIDEO',
      adapter,
      baseUrl: 'https://hongniaoai.com/v1',
      endpointPath,
      statusEndpointPath,
      uploadMode,
      requestMethod: 'async-poll',
      defaultModel: 'seedance-2.0(满血)',
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
  });

  const models = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: modelIdCandidates } },
        { modelKey: { in: modelKeyCandidates } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (models.length < 2) throw new Error(`Expected 2 fullblood models, found ${models.length}`);

  for (const model of models) {
    const protocol = repairedProtocol(model.protocol);
    const data = {
      providerId: provider.id,
      type: 'VIDEO',
      adapter,
      endpointPath,
      statusEndpointPath,
      uploadMode,
      protocol,
      status: 'ACTIVE',
    };
    await prisma.aiModel.update({
      where: { id: model.id },
      data,
    });
    await prisma.aiModel.updateMany({
      where: { modelKey: model.modelKey },
      data,
    });
    console.log(`[repair-fullblood-binding] model=${model.id} modelKey=${model.modelKey} real=${model.name} adapter=${adapter}`);
  }

  console.log(`[repair-fullblood-binding] provider=${provider.providerKey} adapter=${provider.adapter} baseUrl=${provider.baseUrl} key=${key.source}`);
}

main()
  .catch(error => {
    console.error('[repair-fullblood-binding] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
