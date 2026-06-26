import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret, encryptSecret } from '../dist/security.js';

const CONFIG_FILES = [
  process.env.SD2_INTERNAL_DREAMINA_MINI_JSON || '/var/www/ai-admin/workbench-web/models/sd2-internal-dreamina-mini.json',
  process.env.SD2_INTERNAL_TRANSIT9_FAST_JSON || '/var/www/ai-admin/workbench-web/models/sd2-internal-transit9-fast.json',
  process.env.SD2_INTERNAL_TRANSIT9_2_JSON || '/var/www/ai-admin/workbench-web/models/sd2-internal-transit9-2-0.json',
];

const PROVIDER_ID = 'canvas-provider-sd2-internal';
const PROVIDER_KEY = 'canvas_sd2-internal';
const BASE_URL = 'http://103.236.54.113:8081/api/v1';
const ENDPOINT_PATH = '/sd2/generate';
const STATUS_ENDPOINT_PATH = '/sd2/task/{taskId}';
const ADAPTER = 'sd2-internal';

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
    || normalized === 'sk-sz-your-key'
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

async function findExistingProvider() {
  const byKey = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: PROVIDER_ID },
        { providerKey: PROVIDER_KEY },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (byKey) return byKey;

  return prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { adapter: ADAPTER },
        { baseUrl: { contains: '103.236.54.113:8081', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function findExistingModel(config) {
  const modelKey = String(config.modelKey || config.configId || config.id || '').trim();
  const realModel = String(config.model || config.name || '').trim();
  const ids = [modelKey, config.id, config.configId].filter(Boolean);
  return prisma.aiModel.findFirst({
    where: {
      OR: [
        ...ids.flatMap(value => [{ id: `canvas-${value}` }, { id: value }, { modelKey: value }]),
        ...(realModel ? [{ name: realModel }] : []),
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function reusableSd2InternalKey(existingProvider, existingModels) {
  if (existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)) {
    return { encrypted: existingProvider.apiKeyEncrypted, source: `provider:${existingProvider.providerKey}` };
  }

  const linked = existingModels
    .map(model => model?.provider)
    .filter(provider => provider?.apiKeyEncrypted && decryptIfUsable(provider.apiKeyEncrypted));
  if (linked.length) return { encrypted: linked[0].apiKeyEncrypted, source: `model-provider:${linked[0].providerKey}` };

  const sameBase = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { baseUrl: { contains: '103.236.54.113:8081', mode: 'insensitive' } },
        { providerKey: { contains: 'sd2-internal', mode: 'insensitive' } },
        { adapter: ADAPTER },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (sameBase?.apiKeyEncrypted && decryptIfUsable(sameBase.apiKeyEncrypted)) {
    return { encrypted: sameBase.apiKeyEncrypted, source: `provider:${sameBase.providerKey}` };
  }

  const reusableSd2Providers = await prisma.upstreamProvider.findMany({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { providerKey: { contains: 'canvas_sd2', mode: 'insensitive' } },
        { providerKey: { contains: 'aiyunzhi-sd2', mode: 'insensitive' } },
        { providerKey: { contains: 'sd2', mode: 'insensitive' } },
        { name: { contains: 'SD2', mode: 'insensitive' } },
        { name: { contains: 'SD 2', mode: 'insensitive' } },
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
  const preferredSd2 = reusableSd2Providers.find(provider => provider.status === 'ACTIVE' && decryptIfUsable(provider.apiKeyEncrypted))
    || reusableSd2Providers.find(provider => decryptIfUsable(provider.apiKeyEncrypted));
  if (preferredSd2?.apiKeyEncrypted) {
    return { encrypted: preferredSd2.apiKeyEncrypted, source: `sd2-provider:${preferredSd2.providerKey}` };
  }

  const envKey = String(process.env.SD2_INTERNAL_API_KEY || '').trim();
  if (!isPlaceholderSecret(envKey)) return { encrypted: encryptSecret(envKey), source: 'env:SD2_INTERNAL_API_KEY' };

  throw new Error('No reusable SD2 internal apiKeyEncrypted found. Configure provider canvas_sd2-internal API key in admin, or rerun with SD2_INTERNAL_API_KEY.');
}

function pricingFromConfig(config) {
  const pricing = jsonObject(jsonObject(config.defaults).pricing);
  const tiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers.map(jsonObject).filter(item => Object.keys(item).length) : [];
  const firstTier = tiers[0] || {};
  const unit = String(pricing.unit || pricing.billingMode || 'second').trim() || 'second';
  const salePrice = Number(
    pricing.chargedCreditsPerSecond ??
    pricing.memberCreditsPerSecond ??
    pricing.creditsPerSecond ??
    firstTier.chargedCreditsPerSecond ??
    firstTier.memberCreditsPerSecond ??
    0,
  );
  const costPrice = Number(
    pricing.costCreditsPerSecond ??
    firstTier.costCreditsPerSecond ??
    salePrice,
  );
  return {
    unit,
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    costPrice: Number.isFinite(costPrice) ? costPrice : 0,
    pricePerSecond: Number.isFinite(salePrice) ? salePrice : 0,
  };
}

function protocolFromConfig(config) {
  const protocol = jsonObject(config.protocol);
  return {
    ...protocol,
    adapter: ADAPTER,
    method: 'async-poll',
    endpointPath: ENDPOINT_PATH,
    endpoint_path: ENDPOINT_PATH,
    statusEndpointPath: STATUS_ENDPOINT_PATH,
    status_endpoint_path: STATUS_ENDPOINT_PATH,
    uploadMode: 'object_storage',
    upload_mode: 'object_storage',
    requestSchema: 'sd2-internal',
    responseType: protocol.responseType || 'provider_url',
  };
}

async function ensureProvider(configs, existingProvider, apiKey) {
  const defaultModel = String(configs[0]?.model || configs[0]?.name || 'dreamina-mini').trim();
  const common = {
    providerKey: PROVIDER_KEY,
    name: existingProvider?.name || 'Canvas SD2 Internal',
    type: 'VIDEO',
    adapter: ADAPTER,
    baseUrl: existingProvider?.baseUrl || BASE_URL,
    endpointPath: existingProvider?.endpointPath || ENDPOINT_PATH,
    statusEndpointPath: existingProvider?.statusEndpointPath || STATUS_ENDPOINT_PATH,
    uploadMode: existingProvider?.uploadMode || 'object_storage',
    requestMethod: existingProvider?.requestMethod || 'async-poll',
    defaultModel: existingProvider?.defaultModel || defaultModel,
    apiKeyEncrypted: apiKey.encrypted,
    status: 'ACTIVE',
  };
  return prisma.upstreamProvider.upsert({
    where: { id: existingProvider?.id || PROVIDER_ID },
    update: common,
    create: { id: existingProvider?.id || PROVIDER_ID, ...common },
  });
}

async function upsertModel(config, provider, existing) {
  const modelKey = String(config.modelKey || config.configId || config.id || '').trim();
  if (!modelKey) throw new Error(`Missing modelKey for ${config.displayName || config.model || config.id}`);
  const realModelName = String(config.model || config.name || '').trim();
  if (!realModelName) throw new Error(`Missing real model name for ${modelKey}`);
  const displayName = String(config.displayName || config.label || config.modelNick || realModelName).trim();
  const pricing = pricingFromConfig(config);
  const protocol = protocolFromConfig(config);
  const id = existing?.id || `canvas-${modelKey}`;
  const common = {
    providerId: provider.id,
    modelKey,
    name: realModelName,
    displayName,
    type: 'VIDEO',
    unit: pricing.unit,
    salePrice: pricing.salePrice,
    costPrice: pricing.costPrice,
    pricePerSecond: pricing.pricePerSecond,
    inputPriceUsdPer1m: 0,
    outputPriceUsdPer1m: 0,
    cnyPerUsdCost: 0,
    creditsPerUsdCost: 0,
    markupRate: 1,
    adapter: ADAPTER,
    endpointPath: ENDPOINT_PATH,
    statusEndpointPath: STATUS_ENDPOINT_PATH,
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
    if (String(config.adapter || config.protocol?.adapter || '').trim() !== ADAPTER) {
      throw new Error(`Unexpected adapter in ${config.id || config.modelKey}: ${config.adapter || config.protocol?.adapter}`);
    }
  }

  const existingProvider = await findExistingProvider();
  const existingModels = [];
  for (const config of configs) existingModels.push(await findExistingModel(config));
  const apiKey = await reusableSd2InternalKey(existingProvider, existingModels);
  const provider = await ensureProvider(configs, existingProvider, apiKey);
  const models = [];
  for (let index = 0; index < configs.length; index += 1) {
    models.push(await upsertModel(configs[index], provider, existingModels[index]));
  }

  for (const model of models) {
    console.log(`[sd2-internal] ${model.id} modelKey=${model.modelKey} model=${model.name} unit=${model.unit} price=${model.salePrice} adapter=${model.adapter}`);
  }
  console.log(`[sd2-internal] provider=${provider.providerKey} baseUrl=${provider.baseUrl} endpoint=${provider.endpointPath} key=${apiKey.source}`);
}

main()
  .catch(error => {
    console.error('[sd2-internal] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
