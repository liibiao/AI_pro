import '../dist/config.js';
import { prisma } from '../dist/db.js';

const ADAPTER = 'aiyunzhi-gpt-image-2';
const REAL_MODEL = 'gpt-image-2';
const RESPONSE_TYPE = 'server_base64_async_object_storage';
const GENERATION_ENDPOINT = '/v1/images/generations';
const EDIT_ENDPOINT = '/v1/images/edits';
const TARGET = 'aiyunzhi-gpt-image-2-api';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function text(value) {
  return String(value || '').trim();
}

function responseTypes() {
  return {
    '1k': 'object_storage',
    '2k': 'object_storage',
    '3k': 'object_storage',
    '4k': 'object_storage',
  };
}

function protocolFor(model) {
  const protocol = jsonObject(model?.protocol);
  return {
    ...protocol,
    adapter: ADAPTER,
    endpointPath: GENERATION_ENDPOINT,
    endpoint_path: GENERATION_ENDPOINT,
    generationEndpointPath: GENERATION_ENDPOINT,
    generation_endpoint_path: GENERATION_ENDPOINT,
    editEndpointPath: EDIT_ENDPOINT,
    edit_endpoint_path: EDIT_ENDPOINT,
    method: 'sync',
    uploadMode: 'object_storage',
    upload_mode: 'object_storage',
    requestSchema: 'aiyunzhi-gpt-image-2',
    maxReferenceImages: 3,
    responseType: RESPONSE_TYPE,
    response_type: RESPONSE_TYPE,
    responseTypes: responseTypes(),
    responseTypeMode: 'uniform',
    asyncTaskMode: 'sync',
    async_task_mode: 'sync',
    asyncTaskConfigMode: 'uniform',
    async_task_config_mode: 'uniform',
  };
}

function defaultsFor(model) {
  const defaults = jsonObject(model?.defaults);
  return {
    ...defaults,
    imageSize: text(defaults.imageSize) || '1k',
    resolution: text(defaults.resolution) || '1k',
    size: text(defaults.size) || '1k',
    n: Number(defaults.n || 1),
    response_format: 'b64_json',
    responseType: RESPONSE_TYPE,
    response_type: RESPONSE_TYPE,
  };
}

function capabilitiesFor(model) {
  const capabilities = jsonObject(model?.capabilities);
  return {
    ...capabilities,
    responseFormats: Array.from(new Set([...(Array.isArray(capabilities.responseFormats) ? capabilities.responseFormats : []), 'b64_json'])),
    maxReferenceImages: Number(capabilities.maxReferenceImages || 3),
  };
}

async function findTargetModels() {
  return prisma.aiModel.findMany({
    where: {
      type: 'IMAGE',
      OR: [
        { id: { contains: TARGET, mode: 'insensitive' } },
        { modelKey: { contains: TARGET, mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
  });
}

async function restoreProvider(provider) {
  if (!provider?.id) return null;
  return prisma.upstreamProvider.update({
    where: { id: provider.id },
    data: {
      type: 'IMAGE',
      adapter: ADAPTER,
      endpointPath: GENERATION_ENDPOINT,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: REAL_MODEL,
      status: 'ACTIVE',
    },
  });
}

async function restoreModel(model, provider) {
  return prisma.aiModel.update({
    where: { id: model.id },
    data: {
      providerId: provider.id,
      name: REAL_MODEL,
      type: 'IMAGE',
      adapter: ADAPTER,
      endpointPath: GENERATION_ENDPOINT,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      protocol: protocolFor(model),
      defaults: defaultsFor(model),
      capabilities: capabilitiesFor(model),
      modelAssembly: { type: 'literal' },
      status: 'ACTIVE',
    },
    include: { provider: true },
  });
}

async function main() {
  const models = await findTargetModels();
  if (!models.length) throw new Error(`No IMAGE model row found for ${TARGET}`);

  const providers = new Map();
  for (const model of models) {
    if (model.provider?.id && !providers.has(model.provider.id)) {
      providers.set(model.provider.id, await restoreProvider(model.provider));
    }
  }

  const restored = [];
  for (const model of models) {
    const provider = providers.get(model.providerId) || model.provider;
    restored.push(await restoreModel(model, provider));
  }

  console.log(`[aiyunzhi-gpt-image2-base64-restore] restored=${restored.length}`);
  for (const model of restored) {
    const protocol = jsonObject(model.protocol);
    const defaults = jsonObject(model.defaults);
    console.log(`[aiyunzhi-gpt-image2-base64-restore] ${model.provider.providerKey} ${model.id}/${model.modelKey} name=${model.name} adapter=${model.adapter} responseType=${protocol.responseType} response_format=${defaults.response_format}`);
  }
}

main()
  .catch(error => {
    console.error('[aiyunzhi-gpt-image2-base64-restore] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
