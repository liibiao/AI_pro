import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';

const CONFIG_PATH = process.env.AISTARTLAB_MODEL_JSON || '/var/www/ai-admin/workbench-web/models/aistartlab-video-test.json';
const BASE_MODEL = 'seedance-2.0';
const MODEL_TEMPLATE = '{model}-{resolution}';
const REQUIRED_RESOLUTIONS = ['480p', '720p', '1080p'];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function text(value) {
  return String(value || '').trim();
}

function pick(value, fallback) {
  const raw = text(value);
  return raw || fallback;
}

function mergeObject(...values) {
  return Object.assign({}, ...values.filter(isObject));
}

function hasLegacyTestName(value) {
  return ['', 'test-video'].includes(text(value).toLowerCase());
}

async function readConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return {
      displayName: 'AIStartLab Seedance 2.0',
      supports: {
        txt2video: true,
        img2video: true,
        referenceVideo: true,
        referenceAudio: true,
      },
      defaults: {
        channel: 'test',
        model: BASE_MODEL,
        resolution: '720p',
      },
      capabilities: {
        resolutions: REQUIRED_RESOLUTIONS,
        defaultResolution: '720p',
        durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      },
      protocol: {
        adapter: 'aistartlab-video',
        method: 'async-poll',
        endpointPath: '/video/task/v2',
        statusEndpointPath: '/video/task/status',
        model: BASE_MODEL,
        uploadMode: 'object_storage',
      },
      modelAssembly: {
        type: 'template',
        template: MODEL_TEMPLATE,
      },
      ui: {
        label: 'AIStartLab Seedance 2.0',
        badge: 'SD2',
      },
    };
  }
}

async function findProvider() {
  return prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: 'canvas-provider-aistartlab-video' },
        { providerKey: 'aistartlab-video' },
        { adapter: 'aistartlab-video' },
        { baseUrl: { contains: 'api.video.aistarslab.com', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function findModel() {
  return prisma.aiModel.findFirst({
    where: {
      OR: [
        { id: 'canvas-aistartlab-video-test' },
        { modelKey: 'aistartlab-video-test' },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
}

function nextCapabilities(config, existing) {
  const current = mergeObject(config.capabilities, existing?.capabilities);
  const resolutions = Array.from(new Set([
    ...REQUIRED_RESOLUTIONS,
    ...((Array.isArray(current.resolutions) ? current.resolutions : []).map(item => text(item)).filter(Boolean)),
  ]));
  return {
    ...current,
    resolutions,
    defaultResolution: current.defaultResolution || '720p',
  };
}

function nextDefaults(config, existing) {
  const defaults = mergeObject(config.defaults, existing?.defaults);
  return {
    ...defaults,
    model: BASE_MODEL,
    resolution: defaults.resolution || '720p',
  };
}

function nextProtocol(config, existing) {
  const protocol = mergeObject(config.protocol, existing?.protocol);
  return {
    ...protocol,
    adapter: 'aistartlab-video',
    method: protocol.method || 'async-poll',
    endpointPath: protocol.endpointPath || '/video/task/v2',
    statusEndpointPath: protocol.statusEndpointPath || '/video/task/status',
    model: BASE_MODEL,
    uploadMode: protocol.uploadMode || 'object_storage',
  };
}

function nextModelAssembly(config, existing) {
  return {
    ...mergeObject(config.modelAssembly, existing?.modelAssembly),
    type: 'template',
    template: MODEL_TEMPLATE,
  };
}

async function main() {
  const config = await readConfig();
  const existingProvider = await findProvider();
  const providerId = existingProvider?.id || 'canvas-provider-aistartlab-video';
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey: pick(existingProvider?.providerKey, 'aistartlab-video'),
      name: pick(existingProvider?.name, 'AIStartLab OpenAPI 视频'),
      type: 'VIDEO',
      adapter: 'aistartlab-video',
      baseUrl: pick(existingProvider?.baseUrl, 'https://api.video.aistarslab.com/openapi'),
      endpointPath: pick(existingProvider?.endpointPath, '/video/task/v2'),
      statusEndpointPath: pick(existingProvider?.statusEndpointPath, '/video/task/status'),
      uploadMode: pick(existingProvider?.uploadMode, 'object_storage'),
      requestMethod: pick(existingProvider?.requestMethod, 'async-poll'),
      defaultModel: hasLegacyTestName(existingProvider?.defaultModel) ? BASE_MODEL : pick(existingProvider?.defaultModel, BASE_MODEL),
      apiKeyEncrypted: existingProvider?.apiKeyEncrypted || '',
      status: pick(existingProvider?.status, 'ACTIVE'),
    },
    create: {
      id: providerId,
      providerKey: 'aistartlab-video',
      name: 'AIStartLab OpenAPI 视频',
      type: 'VIDEO',
      adapter: 'aistartlab-video',
      baseUrl: 'https://api.video.aistarslab.com/openapi',
      endpointPath: '/video/task/v2',
      statusEndpointPath: '/video/task/status',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: BASE_MODEL,
      apiKeyEncrypted: '',
      status: 'ACTIVE',
    },
  });

  const existing = await findModel();
  const displayName = hasLegacyTestName(existing?.displayName) || text(existing?.displayName).includes('测试')
    ? 'AIStartLab Seedance 2.0'
    : pick(existing?.displayName, pick(config.displayName || config.label || config.ui?.label, 'AIStartLab Seedance 2.0'));
  const pricing = {
    unit: pick(existing?.unit, 'generation'),
    salePrice: Number(existing?.salePrice || 0),
    costPrice: Number(existing?.costPrice || 0),
    pricePerSecond: Number(existing?.pricePerSecond || 0),
  };
  const common = {
    providerId: provider.id,
    modelKey: pick(existing?.modelKey, 'aistartlab-video-test'),
    name: BASE_MODEL,
    displayName,
    type: 'VIDEO',
    unit: pricing.unit,
    salePrice: pricing.salePrice,
    costPrice: pricing.costPrice,
    pricePerSecond: pricing.pricePerSecond,
    inputPriceUsdPer1m: Number(existing?.inputPriceUsdPer1m || 0),
    outputPriceUsdPer1m: Number(existing?.outputPriceUsdPer1m || 0),
    cnyPerUsdCost: Number(existing?.cnyPerUsdCost || 0),
    creditsPerUsdCost: Number(existing?.creditsPerUsdCost || 0),
    markupRate: Number(existing?.markupRate || 1),
    adapter: 'aistartlab-video',
    endpointPath: pick(existing?.endpointPath, '/video/task/v2'),
    statusEndpointPath: pick(existing?.statusEndpointPath, '/video/task/status'),
    uploadMode: pick(existing?.uploadMode, 'object_storage'),
    protocol: nextProtocol(config, existing),
    supports: mergeObject(config.supports, existing?.supports),
    defaults: nextDefaults(config, existing),
    capabilities: nextCapabilities(config, existing),
    modelAssembly: nextModelAssembly(config, existing),
    ui: mergeObject(config.ui, existing?.ui, { label: displayName, badge: jsonObject(existing?.ui).badge || 'SD2' }),
    status: pick(existing?.status, 'ACTIVE'),
  };

  const model = await prisma.aiModel.upsert({
    where: { id: existing?.id || 'canvas-aistartlab-video-test' },
    update: common,
    create: {
      id: 'canvas-aistartlab-video-test',
      ...common,
    },
    include: { provider: true },
  });

  console.log(`[aistartlab-model-resolution-template] provider=${provider.providerKey} defaultModel=${provider.defaultModel} key=${provider.apiKeyEncrypted ? 'configured' : 'empty'}`);
  console.log(`[aistartlab-model-resolution-template] model=${model.id} name=${model.name} template=${model.modelAssembly?.template} resolutions=${JSON.stringify(model.capabilities?.resolutions || [])}`);
}

main()
  .catch(error => {
    console.error('[aistartlab-model-resolution-template] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
