import '../dist/config.js';
import { prisma } from '../dist/db.js';

const adapter = 'aiyunzhi-firefly-gpt-image';
const providerKey = 'canvas_aiyunzhi-firefly-gpt-image';
const providerId = 'canvas-provider-aiyunzhi-firefly-gpt-image';
const endpointPath = '/v1/chat/completions';
const baseUrl = 'https://aiyunzhi.top';
const modelName = 'firefly-gpt-image';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isGptImage2Pro(value = {}) {
  const text = [
    value.id,
    value.providerKey,
    value.modelKey,
    value.name,
    value.displayName,
    value.adapter,
  ].map(item => String(item || '').trim().toLowerCase()).join(' ');
  return text.includes('gpt-image-2-pro') || text.includes('gptimage2pro') || text.includes('canvas-gpt-image-2-pro');
}

function looksLikeFireflyTarget(model = {}) {
  if (isGptImage2Pro(model)) return false;
  const text = [
    model.id,
    model.modelKey,
    model.name,
    model.displayName,
    model.adapter,
    model.endpointPath,
  ].map(item => String(item || '').trim().toLowerCase()).join(' ');
  return text.includes('firefly-gpt-image')
    || text.includes('aiyunzhi-gpt-image-2')
    || text.includes('canvas-aiyunzhi-gpt-image-2');
}

function mergeProtocol(current) {
  const protocol = isObject(current) ? current : {};
  return {
    ...protocol,
    adapter,
    endpointPath,
    endpoint_path: endpointPath,
    method: 'sync',
    uploadMode: 'object_storage',
    upload_mode: 'object_storage',
    responseType: protocol.responseType || protocol.response_type || 'server_object_storage',
    response_type: protocol.response_type || protocol.responseType || 'server_object_storage',
    upstreamStreamMode: 'stream',
    upstream_stream_mode: 'stream',
  };
}

function mergeCapabilities(current) {
  const capabilities = isObject(current) ? current : {};
  return {
    ...capabilities,
    imageSizes: Array.isArray(capabilities.imageSizes) && capabilities.imageSizes.length ? capabilities.imageSizes : ['1K', '2K', '4K'],
    resolutions: Array.isArray(capabilities.resolutions) && capabilities.resolutions.length ? capabilities.resolutions : ['1K', '2K', '4K'],
    aspectRatios: Array.isArray(capabilities.aspectRatios) && capabilities.aspectRatios.length ? capabilities.aspectRatios : ['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16'],
    maxImages: Math.min(Number(capabilities.maxImages || 6), 6),
  };
}

function mergeDefaults(current) {
  const defaults = isObject(current) ? current : {};
  return {
    ...defaults,
    imageSize: defaults.imageSize || '1K',
    resolution: defaults.resolution || '1K',
    aspectRatio: defaults.aspectRatio || '16:9',
    size: defaults.size || '16:9',
  };
}

async function findReusableEncryptedKey(existingProvider, targetModels) {
  if (existingProvider?.apiKeyEncrypted) return { encrypted: existingProvider.apiKeyEncrypted, source: `provider:${existingProvider.providerKey}` };
  const linked = targetModels.find(model => model?.provider?.apiKeyEncrypted && !isGptImage2Pro(model.provider));
  if (linked?.provider?.apiKeyEncrypted) return { encrypted: linked.provider.apiKeyEncrypted, source: `linked:${linked.provider.providerKey}` };
  const provider = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { providerKey: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { providerKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
        { name: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (provider?.apiKeyEncrypted) return { encrypted: provider.apiKeyEncrypted, source: `provider:${provider.providerKey}` };
  throw new Error('No reusable encrypted Aiyunzhi API key found');
}

function safeFireflyDefaultModel(value) {
  const raw = String(value || '').trim();
  if (/^firefly-gpt-image/i.test(raw)) return raw.replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i, '') || modelName;
  return modelName;
}

async function findTargetModels() {
  const models = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
        { modelKey: { in: ['aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-firefly-gpt-image', 'canvas-aiyunzhi-firefly-gpt-image'] } },
        { modelKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
        { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
        { displayName: { contains: 'Firefly GPT Image', mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  return models.filter(looksLikeFireflyTarget);
}

async function main() {
  const targetModels = await findTargetModels();
  if (!targetModels.length) throw new Error('No Aiyunzhi Firefly/GPT Image 2 model rows found to repair');

  const existingProvider = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: providerId },
        { providerKey },
        { providerKey: 'aiyunzhi-firefly-gpt-image' },
        { providerKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const key = await findReusableEncryptedKey(existingProvider, targetModels);
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: existingProvider?.id || providerId },
    update: {
      providerKey: existingProvider?.providerKey || providerKey,
      name: existingProvider?.name || 'Aiyunzhi Firefly GPT Image Direct',
      type: 'IMAGE',
      adapter,
      baseUrl: existingProvider?.baseUrl || baseUrl,
      endpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: safeFireflyDefaultModel(existingProvider?.defaultModel),
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: 'Aiyunzhi Firefly GPT Image Direct',
      type: 'IMAGE',
      adapter,
      baseUrl,
      endpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: modelName,
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
  });

  for (const model of targetModels) {
    const data = {
      providerId: provider.id,
      name: modelName,
      type: 'IMAGE',
      adapter,
      endpointPath,
      uploadMode: 'object_storage',
      protocol: mergeProtocol(model.protocol),
      supports: isObject(model.supports) ? model.supports : { txt2img: true, img2img: true },
      capabilities: mergeCapabilities(model.capabilities),
      defaults: mergeDefaults(model.defaults),
      modelAssembly: { type: 'template', template: 'firefly-gpt-image-{resolution}-{aspectRatioSlug}' },
      status: 'ACTIVE',
    };
    const updated = await prisma.aiModel.update({
      where: { id: model.id },
      data,
      include: { provider: true },
    });
    console.log(`[firefly-direct-binding] model=${updated.id} key=${updated.modelKey} real=${updated.name} adapter=${updated.adapter} provider=${updated.provider.providerKey}/${updated.provider.adapter}`);
  }
  console.log(`[firefly-direct-binding] provider=${provider.providerKey} adapter=${provider.adapter} keySource=${key.source}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
