import '../dist/config.js';
import { prisma } from '../dist/db.js';

const PROVIDER_KEY_NEEDLES = [
  'canvas_aiyunzhi-gpt-image-2-api',
  'canvas-aiyunzhi-gpt-image-2-api',
  'aiyunzhi-gpt-image-2-api',
];

const MODEL_ID_NEEDLES = [
  'canvas-aiyunzhi-gpt-image-2-api',
  'canvas_aiyunzhi-gpt-image-2-api',
  'aiyunzhi-gpt-image-2-api',
];

const ADAPTER = 'aiyunzhi-gpt-image-2';
const REAL_MODEL = 'gpt-image-2';
const BASE_URL = 'https://aiyunzhi.top';
const GENERATION_ENDPOINT = '/v1/images/generations';
const EDIT_ENDPOINT = '/v1/images/edits';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function text(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function containsAny(value, needles) {
  const raw = text(value).toLowerCase();
  return needles.some(needle => raw.includes(needle));
}

function protocolFor(existing) {
  return {
    ...jsonObject(existing?.protocol),
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
    responseType: text(jsonObject(existing?.protocol).responseType) || 'provider_url',
  };
}

function supportsFor(existing) {
  return {
    ...jsonObject(existing?.supports),
    txt2img: true,
    img2img: true,
    imageToImage: true,
    storyboard: true,
    repair: true,
  };
}

function defaultsFor(existing) {
  return {
    ...jsonObject(existing?.defaults),
    imageSize: '1k',
    resolution: '1k',
    size: '1k',
    n: Number(jsonObject(existing?.defaults).n || 1),
    response_format: text(jsonObject(existing?.defaults).response_format) || 'url',
  };
}

function capabilitiesFor(existing) {
  return {
    ...jsonObject(existing?.capabilities),
    imageSizes: ['1k', '2k', '4k'],
    resolutions: ['1k', '2k', '4k'],
    aspectRatios: ['1:1'],
    aspectRatiosByResolution: {
      ...jsonObject(jsonObject(existing?.capabilities).aspectRatiosByResolution),
      '1k': ['1:1'],
      '2k': ['1:1'],
      '4k': ['1:1'],
    },
    imageSizeOptionsByResolution: {
      ...jsonObject(jsonObject(existing?.capabilities).imageSizeOptionsByResolution),
      '1k': ['1:1'],
      '2k': ['1:1'],
      '4k': ['1:1'],
    },
    maxImages: 3,
    maxReferenceImages: 3,
    responseFormats: ['url', 'b64_json'],
  };
}

async function findTargetModels() {
  const direct = await prisma.aiModel.findMany({
    where: {
      type: 'IMAGE',
      OR: [
        ...MODEL_ID_NEEDLES.flatMap(value => [{ id: value }, { modelKey: value }]),
        { id: { contains: 'aiyunzhi-gpt-image-2-api', mode: 'insensitive' } },
        { modelKey: { contains: 'aiyunzhi-gpt-image-2-api', mode: 'insensitive' } },
        { displayName: { contains: 'GPT Image 2 API', mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
  });

  return direct.filter(model => {
    const provider = model.provider || {};
    return containsAny(model.id, MODEL_ID_NEEDLES)
      || containsAny(model.modelKey, MODEL_ID_NEEDLES)
      || containsAny(provider.providerKey, PROVIDER_KEY_NEEDLES);
  });
}

async function updateProvider(provider) {
  if (!provider?.id) return null;
  const providerKey = text(provider.providerKey) || 'canvas_aiyunzhi-gpt-image-2-api';
  const updated = await prisma.upstreamProvider.update({
    where: { id: provider.id },
    data: {
      providerKey,
      name: text(provider.name) || '画布渠道 Aiyunzhi GPT Image 2 API',
      type: 'IMAGE',
      adapter: ADAPTER,
      baseUrl: (text(provider.baseUrl) || BASE_URL).replace(/\/+$/, ''),
      endpointPath: GENERATION_ENDPOINT,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      requestMethod: 'sync',
      defaultModel: REAL_MODEL,
      status: 'ACTIVE',
    },
  });
  return updated;
}

async function updateModel(model, provider) {
  const updated = await prisma.aiModel.update({
    where: { id: model.id },
    data: {
      providerId: provider.id,
      modelKey: text(model.modelKey) || text(model.id),
      name: REAL_MODEL,
      displayName: text(model.displayName) || 'Aiyunzhi GPT Image 2 API',
      type: 'IMAGE',
      adapter: ADAPTER,
      endpointPath: GENERATION_ENDPOINT,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      protocol: protocolFor(model),
      supports: supportsFor(model),
      defaults: defaultsFor(model),
      capabilities: capabilitiesFor(model),
      modelAssembly: { type: 'literal' },
      ui: {
        ...jsonObject(model.ui),
        label: text(jsonObject(model.ui).label) || text(model.displayName) || 'Aiyunzhi GPT Image 2 API',
        badge: text(jsonObject(model.ui).badge) || 'GPT2 API',
        badgeColor: text(jsonObject(model.ui).badgeColor) || '#2563eb',
      },
      status: 'ACTIVE',
    },
    include: { provider: true },
  });
  return updated;
}

async function main() {
  const models = await findTargetModels();
  if (!models.length) {
    throw new Error('No canvas Aiyunzhi GPT Image 2 API model row found to repair');
  }

  const providerIds = unique(models.map(model => model.provider?.id));
  const providers = [];
  for (const providerId of providerIds) {
    const provider = models.find(model => model.provider?.id === providerId)?.provider;
    const updated = await updateProvider(provider);
    if (updated) providers.push(updated);
  }

  const providerById = new Map(providers.map(provider => [provider.id, provider]));
  const updatedModels = [];
  for (const model of models) {
    const provider = providerById.get(model.providerId) || model.provider;
    updatedModels.push(await updateModel(model, provider));
  }

  console.log(`[aiyunzhi-gpt-image2-route-db-fix] providers=${providers.length} models=${updatedModels.length}`);
  for (const model of updatedModels) {
    console.log(`[aiyunzhi-gpt-image2-route-db-fix] ${model.provider.providerKey} ${model.id}/${model.modelKey} name=${model.name} adapter=${model.adapter} endpoint=${model.endpointPath}`);
  }
}

main()
  .catch(error => {
    console.error('[aiyunzhi-gpt-image2-route-db-fix] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
