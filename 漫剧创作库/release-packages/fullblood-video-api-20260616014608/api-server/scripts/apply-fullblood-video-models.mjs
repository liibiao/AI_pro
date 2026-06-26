import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret } from '../dist/security.js';

const CONFIG_FILES = [
  process.env.FULLBLOOD_SEEDANCE_JSON || '/var/www/ai-admin/workbench-web/models/fullblood-seedance-2.json',
  process.env.FULLBLOOD_OMNI_VIDEO_JSON || '/var/www/ai-admin/workbench-web/models/fullblood-omni-video-2.json',
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized === 'your-api-key'
    || normalized === 'your_api_key'
    || normalized.startsWith('replace-with-')
    || normalized.includes('placeholder');
}

function decryptIfUsable(encrypted) {
  try {
    const value = decryptSecret(encrypted || '').trim();
    return isPlaceholderSecret(value) ? '' : value;
  } catch {
    return '';
  }
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

function textForProvider(provider = {}) {
  return [
    provider.id,
    provider.providerKey,
    provider.name,
    provider.type,
    provider.adapter,
    provider.baseUrl,
    provider.endpointPath,
    provider.statusEndpointPath,
    provider.defaultModel,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
}

function textForConfig(config = {}) {
  return [
    config.id,
    config.configId,
    config.modelKey,
    config.providerKey,
    config.channelKey,
    config.name,
    config.model,
    config.displayName,
    config.adapter,
  ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
}

async function findExistingProvider() {
  return prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { providerKey: 'canvas_fullblood-video' },
        { providerKey: 'fullblood-video' },
        { adapter: 'fullblood-video' },
        { name: { contains: 'Fullblood Video', mode: 'insensitive' } },
        { name: { contains: '满血', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function findExistingModel(config) {
  const ids = [config.id, config.configId, config.modelKey].filter(Boolean);
  const modelKey = String(config.modelKey || config.configId || config.id || '').trim();
  return prisma.aiModel.findFirst({
    where: {
      OR: [
        ...ids.flatMap(value => [{ id: `canvas-${value}` }, { id: value }, { modelKey: value }]),
        ...(modelKey ? [{ modelKey }] : []),
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function reusableVideoProvider(existingProvider, existingModels) {
  if (existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)) {
    return { provider: existingProvider, source: `provider:${existingProvider.providerKey}` };
  }

  const linked = existingModels
    .map(model => model?.provider)
    .filter(provider => provider?.apiKeyEncrypted && decryptIfUsable(provider.apiKeyEncrypted));
  if (linked.length) return { provider: linked[0], source: `model-provider:${linked[0].providerKey}` };

  const providers = await prisma.upstreamProvider.findMany({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { type: 'VIDEO' },
        { providerKey: { contains: 'video', mode: 'insensitive' } },
        { name: { contains: 'video', mode: 'insensitive' } },
        { adapter: { contains: 'video', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const usable = providers.filter(provider => decryptIfUsable(provider.apiKeyEncrypted));
  const preferred = usable.find(provider => {
    const text = textForProvider(provider);
    return text.includes('localhost:3000')
      || text.includes('/videos')
      || text.includes('notevideo')
      || text.includes('sora')
      || text.includes('seedance')
      || text.includes('video');
  });
  if (preferred) return { provider: preferred, source: `provider:${preferred.providerKey}` };
  if (usable.length) return { provider: usable[0], source: `provider:${usable[0].providerKey}` };
  throw new Error('No reusable encrypted video API key found. Configure a video provider key first, then rerun this script.');
}

function pricingFromConfig(config) {
  const pricing = jsonObject(jsonObject(config.defaults).pricing);
  const salePrice = Number(
    pricing.memberCreditsPerGeneration ??
    pricing.chargedCreditsPerGeneration ??
    pricing.creditsPerGeneration ??
    0,
  );
  const costPrice = Number(
    pricing.costCreditsPerGeneration ??
    pricing.costCreditsPerRequest ??
    salePrice,
  );
  return {
    unit: String(pricing.unit || pricing.billingMode || 'generation').trim() || 'generation',
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    costPrice: Number.isFinite(costPrice) ? costPrice : 0,
  };
}

function fullbloodProtocol(config) {
  const protocol = jsonObject(config.protocol);
  return {
    ...protocol,
    adapter: 'fullblood-video',
    method: 'async-poll',
    endpointPath: '/videos',
    endpoint_path: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    status_endpoint_path: '/videos/{taskId}',
    uploadMode: 'object_storage',
    upload_mode: 'object_storage',
    fixedSeconds: 15,
    seconds: '15',
    sizeByAspectRatio: {
      '16:9': '1280x720',
      '9:16': '720x1280',
      ...(isObject(protocol.sizeByAspectRatio) ? protocol.sizeByAspectRatio : {}),
    },
  };
}

async function ensureProvider(configs, existingProvider, source) {
  const providerId = existingProvider?.id || 'canvas-provider-fullblood-video';
  const providerKey = existingProvider?.providerKey || 'canvas_fullblood-video';
  const apiKeyEncrypted = existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)
    ? existingProvider.apiKeyEncrypted
    : source.provider.apiKeyEncrypted;
  const common = {
    providerKey,
    name: existingProvider?.name || 'Fullblood Video API',
    type: 'VIDEO',
    adapter: 'fullblood-video',
    baseUrl: existingProvider?.baseUrl || 'https://localhost:3000/v1',
    endpointPath: existingProvider?.endpointPath || '/videos',
    statusEndpointPath: existingProvider?.statusEndpointPath || '/videos/{taskId}',
    uploadMode: existingProvider?.uploadMode || 'object_storage',
    requestMethod: existingProvider?.requestMethod || 'async-poll',
    defaultModel: existingProvider?.defaultModel || String(configs[0]?.model || configs[0]?.name || 'seedance-2.0(满血)'),
    apiKeyEncrypted,
    status: 'ACTIVE',
  };
  return prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: common,
    create: { id: providerId, ...common },
  });
}

async function upsertModel(config, provider, existing) {
  const modelKey = String(config.modelKey || config.configId || config.id || '').trim();
  const id = existing?.id || `canvas-${modelKey}`;
  if (!modelKey) throw new Error(`Missing modelKey for ${config.displayName || config.model || config.id}`);
  const pricing = pricingFromConfig(config);
  const protocol = fullbloodProtocol(config);
  const realModelName = String(config.model || config.name || '').trim();
  const displayName = String(config.displayName || config.label || config.modelNick || realModelName || modelKey).trim();
  const common = {
    providerId: provider.id,
    modelKey,
    name: realModelName,
    displayName,
    type: 'VIDEO',
    unit: pricing.unit,
    salePrice: pricing.salePrice,
    costPrice: pricing.costPrice,
    pricePerSecond: 0,
    inputPriceUsdPer1m: 0,
    outputPriceUsdPer1m: 0,
    cnyPerUsdCost: 0,
    creditsPerUsdCost: 0,
    markupRate: 1,
    adapter: 'fullblood-video',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    protocol,
    supports: jsonValue(config.supports),
    defaults: jsonValue(config.defaults),
    capabilities: jsonValue(config.capabilities),
    modelAssembly: jsonValue(config.modelAssembly, { type: 'passthrough' }),
    ui: jsonValue(config.ui, { label: displayName }),
    status: 'ACTIVE',
  };
  const model = await prisma.aiModel.upsert({
    where: { id },
    update: common,
    create: { id, ...common },
  });
  await prisma.aiModel.updateMany({
    where: { modelKey },
    data: common,
  });
  return model;
}

async function main() {
  const configs = [];
  for (const file of CONFIG_FILES) configs.push(await readJson(file));
  for (const config of configs) {
    const text = textForConfig(config);
    if (!text.includes('fullblood') && !text.includes('满血')) {
      throw new Error(`Unexpected config: ${config.id || config.modelKey || config.name}`);
    }
  }
  const existingModels = [];
  for (const config of configs) existingModels.push(await findExistingModel(config));
  const existingProvider = await findExistingProvider();
  const source = await reusableVideoProvider(existingProvider, existingModels);
  const provider = await ensureProvider(configs, existingProvider, source);
  const models = [];
  for (let index = 0; index < configs.length; index += 1) {
    models.push(await upsertModel(configs[index], provider, existingModels[index]));
  }
  for (const model of models) {
    console.log(`[fullblood-video] ${model.id} modelKey=${model.modelKey} model=${model.name} price=${model.salePrice} adapter=${model.adapter}`);
  }
  console.log(`[fullblood-video] provider=${provider.providerKey} baseUrl=${provider.baseUrl} key=${source.source}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
