import '../dist/config.js';
import { prisma } from '../dist/db.js';

const TARGET = 'aiyunzhi-gpt-image-2-api';
const ADAPTER = 'aiyunzhi-gpt-image-2';
const REAL_MODEL = 'gpt-image-2';
const RESPONSE_TYPE = 'server_base64_async_object_storage';
const GENERATION_ENDPOINT = '/v1/images/generations';
const EDIT_ENDPOINT = '/v1/images/edits';
const RESOLUTIONS = ['1k', '2k', '4k'];
const STANDARD_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3'];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function normalizedRatios(value) {
  const source = Array.isArray(value)
    ? value
    : (isObject(value) ? Object.entries(value).filter(([, enabled]) => !!enabled).map(([key]) => key) : []);
  return Array.from(new Set(source.map(item => String(item || '').trim().replace('：', ':')).filter(Boolean)));
}

function usableRatios(value) {
  const ratios = normalizedRatios(value);
  return ratios.length > 1 && ratios.includes('16:9') ? ratios : [];
}

function firstUsableMapRatios(map) {
  if (!isObject(map)) return [];
  for (const key of RESOLUTIONS) {
    const ratios = usableRatios(map[key] || map[key.toUpperCase()]);
    if (ratios.length) return ratios;
  }
  return [];
}

function firstNonEmpty(...groups) {
  return groups.find(group => Array.isArray(group) && group.length) || STANDARD_RATIOS;
}

function configuredRatiosFor(model) {
  const capabilities = jsonObject(model.capabilities);
  const protocol = jsonObject(model.protocol);
  const defaults = jsonObject(model.defaults);
  return firstNonEmpty(
    usableRatios(capabilities.aspectRatios),
    usableRatios(capabilities.aspect_ratios),
    firstUsableMapRatios(capabilities.aspectRatiosByResolution),
    firstUsableMapRatios(capabilities.imageSizeOptionsByResolution),
    usableRatios(protocol.aspectRatios),
    usableRatios(protocol.aspect_ratios),
    usableRatios(defaults.aspectRatios),
    usableRatios(defaults.aspect_ratios),
  );
}

function ratiosByResolution(existing, fallbackRatios) {
  const current = jsonObject(existing);
  const next = { ...current };
  for (const key of RESOLUTIONS) {
    const ratios = usableRatios(current[key] || current[key.toUpperCase()]);
    next[key] = ratios.length ? ratios : fallbackRatios;
  }
  return next;
}

function responseTypes() {
  return {
    '1k': 'object_storage',
    '2k': 'object_storage',
    '3k': 'object_storage',
    '4k': 'object_storage',
  };
}

function protocolFor(model, ratios) {
  const protocol = jsonObject(model.protocol);
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
    aspectRatios: ratios,
    aspect_ratios: ratios,
    aspectRatiosByResolution: ratiosByResolution(protocol.aspectRatiosByResolution || protocol.aspect_ratios_by_resolution, ratios),
    imageSizeOptionsByResolution: ratiosByResolution(protocol.imageSizeOptionsByResolution || protocol.image_size_options_by_resolution, ratios),
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
  const defaults = jsonObject(model.defaults);
  return {
    ...defaults,
    imageSize: String(defaults.imageSize || '1k').trim() || '1k',
    resolution: String(defaults.resolution || '1k').trim() || '1k',
    size: String(defaults.size || '1k').trim() || '1k',
    n: Number(defaults.n || 1),
    response_format: 'b64_json',
    responseType: RESPONSE_TYPE,
    response_type: RESPONSE_TYPE,
  };
}

function capabilitiesFor(model, ratios) {
  const capabilities = jsonObject(model.capabilities);
  return {
    ...capabilities,
    imageSizes: Array.isArray(capabilities.imageSizes) && capabilities.imageSizes.length ? capabilities.imageSizes : RESOLUTIONS,
    resolutions: Array.isArray(capabilities.resolutions) && capabilities.resolutions.length ? capabilities.resolutions : RESOLUTIONS,
    aspectRatios: ratios,
    aspect_ratios: ratios,
    aspectRatiosByResolution: ratiosByResolution(capabilities.aspectRatiosByResolution || capabilities.aspect_ratios_by_resolution, ratios),
    imageSizeOptionsByResolution: ratiosByResolution(capabilities.imageSizeOptionsByResolution || capabilities.image_size_options_by_resolution, ratios),
    maxReferenceImages: Number(capabilities.maxReferenceImages || 3),
    responseFormats: Array.from(new Set([...(Array.isArray(capabilities.responseFormats) ? capabilities.responseFormats : []), 'b64_json'])),
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

async function main() {
  const models = await findTargetModels();
  if (!models.length) throw new Error(`No IMAGE model row found for ${TARGET}`);

  const restored = [];
  for (const model of models) {
    const ratios = configuredRatiosFor(model);
    const updated = await prisma.aiModel.update({
      where: { id: model.id },
      data: {
        name: REAL_MODEL,
        type: 'IMAGE',
        adapter: ADAPTER,
        endpointPath: GENERATION_ENDPOINT,
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        protocol: protocolFor(model, ratios),
        defaults: defaultsFor(model),
        capabilities: capabilitiesFor(model, ratios),
        modelAssembly: { type: 'literal' },
        status: 'ACTIVE',
      },
      include: { provider: true },
    });
    restored.push(updated);
  }

  console.log(`[aiyunzhi-gpt-image2-ratio-restore] restored=${restored.length}`);
  for (const model of restored) {
    const capabilities = jsonObject(model.capabilities);
    const protocol = jsonObject(model.protocol);
    const defaults = jsonObject(model.defaults);
    const ratios = normalizedRatios(capabilities.aspectRatios);
    console.log(`[aiyunzhi-gpt-image2-ratio-restore] ${model.provider?.providerKey || '-'} ${model.id}/${model.modelKey} ratios=${ratios.length} has16x9=${ratios.includes('16:9')} responseType=${protocol.responseType} response_format=${defaults.response_format}`);
  }
}

main()
  .catch(error => {
    console.error('[aiyunzhi-gpt-image2-ratio-restore] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
