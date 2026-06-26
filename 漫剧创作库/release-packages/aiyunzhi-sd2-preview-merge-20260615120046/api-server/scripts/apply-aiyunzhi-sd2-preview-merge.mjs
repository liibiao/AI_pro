import { readFile } from 'node:fs/promises';
import '../dist/config.js';
import { prisma } from '../dist/db.js';

const modelJsonPath = process.env.SD2_PREVIEW_MODEL_JSON || '/var/www/ai-admin/workbench-web/models/aiyunzhi-sd2-preview.json';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function reusableAiyunzhiKey() {
  const preferred = await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { id: 'canvas-provider-aiyunzhi-sd2-preview' },
        { id: 'canvas-provider-aiyunzhi-sd2-preview-1080p' },
        { id: 'canvas-provider-sd2-fast' },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (preferred?.apiKeyEncrypted) return { encrypted: preferred.apiKeyEncrypted, source: preferred.providerKey };

  const any = await prisma.upstreamProvider.findFirst({
    where: {
      apiKeyEncrypted: { not: '' },
      OR: [
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
        { providerKey: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { providerKey: { contains: 'sd2', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (any?.apiKeyEncrypted) return { encrypted: any.apiKeyEncrypted, source: any.providerKey };
  throw new Error('No reusable Aiyunzhi apiKeyEncrypted found');
}

function pricingFromConfig(config) {
  const pricing = isObject(config.defaults?.pricing) ? config.defaults.pricing : {};
  const tier = Array.isArray(pricing.resolutionTiers) && isObject(pricing.resolutionTiers[0]) ? pricing.resolutionTiers[0] : {};
  const salePrice = Number(pricing.chargedCreditsPerGeneration ?? tier.chargedCreditsPerGeneration ?? tier.chargedCredits ?? 700);
  const costPrice = Number(pricing.costCreditsPerGeneration ?? tier.costCreditsPerGeneration ?? tier.costCredits ?? salePrice);
  return {
    unit: String(pricing.unit || pricing.billingMode || 'generation'),
    salePrice: Number.isFinite(salePrice) ? salePrice : 700,
    costPrice: Number.isFinite(costPrice) ? costPrice : 700,
  };
}

async function main() {
  const config = await readJson(modelJsonPath);
  const apiKey = await reusableAiyunzhiKey();
  const pricing = pricingFromConfig(config);
  const providerId = 'canvas-provider-aiyunzhi-sd2-preview';
  const providerKey = 'canvas_aiyunzhi-sd2-preview';
  const modelId = 'canvas-aiyunzhi-sd2-preview';
  const modelName = String(config.model || config.name || 'sd2-preview').trim() || 'sd2-preview';
  const protocol = {
    ...(isObject(config.protocol) ? config.protocol : {}),
    adapter: 'seedance2-sd',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    contentEndpointPath: '/videos/{taskId}/content',
    requestSchema: 'official-sd2',
    soundField: 'metadata.enableSound',
    method: 'async-poll',
    uploadMode: 'object_storage',
  };

  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: '画布渠道 Aiyunzhi SD2 Preview',
      type: 'VIDEO',
      adapter: 'seedance2-sd',
      baseUrl: 'https://aiyunzhi.top/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: modelName,
      apiKeyEncrypted: apiKey.encrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: '画布渠道 Aiyunzhi SD2 Preview',
      type: 'VIDEO',
      adapter: 'seedance2-sd',
      baseUrl: 'https://aiyunzhi.top/v1',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: modelName,
      apiKeyEncrypted: apiKey.encrypted,
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey: 'aiyunzhi-sd2-preview',
      name: modelName,
      displayName: 'Aiyunzhi SD2 Preview',
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
      adapter: 'seedance2-sd',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: 'SD2 Preview' }),
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: 'aiyunzhi-sd2-preview',
      name: modelName,
      displayName: 'Aiyunzhi SD2 Preview',
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
      adapter: 'seedance2-sd',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: 'SD2 Preview' }),
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.updateMany({
    where: { id: 'canvas-aiyunzhi-sd2-preview-1080p' },
    data: { status: 'DISABLED' },
  });
  await prisma.upstreamProvider.updateMany({
    where: { id: 'canvas-provider-aiyunzhi-sd2-preview-1080p' },
    data: { status: 'DISABLED' },
  });

  const merged = await prisma.aiModel.findUnique({ where: { id: modelId }, include: { provider: true } });
  const oldModel = await prisma.aiModel.findUnique({ where: { id: 'canvas-aiyunzhi-sd2-preview-1080p' }, include: { provider: true } });
  console.log(`[sd2-preview-merge] keySource=${apiKey.source}`);
  console.log(`[sd2-preview-merge] merged=${merged?.id} provider=${merged?.provider?.providerKey} model=${merged?.name} status=${merged?.status}`);
  console.log(`[sd2-preview-merge] resolutions=${JSON.stringify(merged?.capabilities?.resolutions || [])}`);
  console.log(`[sd2-preview-merge] pricing=${JSON.stringify(merged?.defaults?.pricing?.resolutionTiers || [])}`);
  console.log(`[sd2-preview-merge] old1080=${oldModel?.status || 'missing'} provider=${oldModel?.provider?.status || 'missing'}`);
}

main()
  .catch(err => {
    console.error('[sd2-preview-merge] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
