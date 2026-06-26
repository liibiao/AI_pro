import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret } from '../dist/security.js';

const CONFIG_FILES = [
  '/var/www/ai-admin/workbench-web/models/fullblood-seedance-2.json',
  '/var/www/ai-admin/workbench-web/models/fullblood-omni-video-2.json',
];

const MODEL_IDS = new Map([
  ['fullblood-seedance-2', 'canvas-fullblood-seedance-2'],
  ['fullblood-omni-video-2', 'canvas-fullblood-omni-video-2'],
]);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
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

async function reusableVideoKey(existingProvider) {
  if (existingProvider?.apiKeyEncrypted && decryptIfUsable(existingProvider.apiKeyEncrypted)) {
    return { encrypted: existingProvider.apiKeyEncrypted, source: `provider:${existingProvider.providerKey}` };
  }
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { type: 'VIDEO' },
        { providerKey: { contains: 'video', mode: 'insensitive' } },
        { providerKey: { contains: 'sora', mode: 'insensitive' } },
        { providerKey: { contains: 'seedance', mode: 'insensitive' } },
        { name: { contains: 'video', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const usable = providers.find(provider => decryptIfUsable(provider.apiKeyEncrypted));
  if (!usable) throw new Error('No reusable encrypted video key found for fullblood provider repair');
  return { encrypted: usable.apiKeyEncrypted, source: `provider:${usable.providerKey}` };
}

function pricingFromConfig(config) {
  const pricing = isObject(config.defaults?.pricing) ? config.defaults.pricing : {};
  const salePrice = Number(pricing.memberCreditsPerGeneration ?? pricing.chargedCreditsPerGeneration ?? 0);
  const costPrice = Number(pricing.costCreditsPerGeneration ?? salePrice);
  return {
    unit: String(pricing.unit || pricing.billingMode || 'generation').trim() || 'generation',
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    costPrice: Number.isFinite(costPrice) ? costPrice : 0,
  };
}

function repairedProtocol(config) {
  const protocol = isObject(config.protocol) ? config.protocol : {};
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
  };
}

async function main() {
  const configs = [];
  for (const file of CONFIG_FILES) configs.push(await readJson(file));
  const existingProvider = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: 'canvas-provider-fullblood-video' },
        { providerKey: 'canvas_fullblood-video' },
        { adapter: 'fullblood-video' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const key = await reusableVideoKey(existingProvider);
  const providerId = existingProvider?.id || 'canvas-provider-fullblood-video';
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey: 'canvas_fullblood-video',
      name: existingProvider?.name || 'Fullblood Video API',
      type: 'VIDEO',
      adapter: 'fullblood-video',
      baseUrl: 'https://hongniaoai.com/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'seedance-2.0(满血)',
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey: 'canvas_fullblood-video',
      name: 'Fullblood Video API',
      type: 'VIDEO',
      adapter: 'fullblood-video',
      baseUrl: 'https://hongniaoai.com/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: 'seedance-2.0(满血)',
      apiKeyEncrypted: key.encrypted,
      status: 'ACTIVE',
    },
  });

  for (const config of configs) {
    const modelKey = String(config.modelKey || config.configId || config.id || '').trim();
    const id = MODEL_IDS.get(modelKey) || `canvas-${modelKey}`;
    const pricing = pricingFromConfig(config);
    const protocol = repairedProtocol(config);
    const realModel = String(config.model || config.name || '').trim();
    const displayName = String(config.displayName || config.label || config.modelNick || realModel || modelKey).trim();
    const data = {
      providerId: provider.id,
      modelKey,
      name: realModel,
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
    await prisma.aiModel.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
    await prisma.aiModel.updateMany({
      where: {
        OR: [
          { id },
          { modelKey },
        ],
      },
      data,
    });
    console.log(`[repair-fullblood-video] ${id} modelKey=${modelKey} model=${realModel} provider=${provider.providerKey}`);
  }
  console.log(`[repair-fullblood-video] provider=${provider.providerKey} baseUrl=${provider.baseUrl} key=${key.source}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
