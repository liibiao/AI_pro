import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret, encryptSecret } from '../dist/security.js';

const defaultModelsDir = '/var/www/ai-admin/workbench-web/models';
const modelsDir = process.env.CANVAS_MODELS_DIR || defaultModelsDir;

const targetIds = new Set([
  'sd2-fast',
  'sd2-full',
  'sd2',
  'aiyunzhi-sd2-preview-fast',
  'aiyunzhi-sd2-preview',
  'aiyunzhi-sd2-preview-1080p',
  'aiyunzhi-grok-1-5-video',
  'aiyunzhi-grok-3-pro-video',
  'aiyunzhi-veo-3-1',
  'aiyunzhi-veo-3-1-fast',
  'aiyunzhi-firefly-gpt-image',
  'aiyunzhi-gpt-image-2',
  'aiyunzhi-gemini-2-5-flash-image',
  'aiyunzhi-gemini-2-5-flash-image-preview',
  'aiyunzhi-gemini-3-1-flash-image',
  'aiyunzhi-gemini-3-pro-image',
]);

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'model';
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonObject(value) {
  return isObject(value) ? value : {};
}

function jsonValue(value, fallback = {}) {
  if (value === undefined || value === null) return fallback;
  return value;
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized === 'your-api-key'
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

async function readJson(fullPath) {
  const raw = await readFile(fullPath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function findReusableAiyunzhiKey() {
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
        { providerKey: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { providerKey: { contains: 'sd2', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const provider = providers.find(row => decryptIfUsable(row.apiKeyEncrypted));
  if (provider) {
    return { encrypted: provider.apiKeyEncrypted, source: `provider:${provider.providerKey}` };
  }

  for (const filename of ['sd2-fast.json', 'sd2-full.json', 'sd2.json']) {
    try {
      const config = await readJson(path.join(modelsDir, filename));
      const key = String(config.apiKey || config.key || config.api_key || '').trim();
      if (!isPlaceholderSecret(key)) {
        return { encrypted: encryptSecret(key), source: `model-json:${filename}` };
      }
    } catch {
      // Try the next existing canvas config.
    }
  }

  throw new Error(`No reusable Aiyunzhi key found in existing providers or ${modelsDir}/sd2*.json`);
}

function normalizeModelType(config) {
  const raw = String(config.type || config.model || config.name || '').toLowerCase();
  if (raw.includes('video') || raw.includes('sora') || raw.includes('veo') || raw.includes('seedance') || raw.includes('sd2')) return 'VIDEO';
  if (raw.includes('llm') || raw.includes('chat') || raw.includes('deepseek') || raw.includes('claude')) return 'LLM';
  return 'IMAGE';
}

function endpointConfig(config, modelType) {
  const protocol = jsonObject(config.protocol);
  const adapter = String(config.adapter || protocol.adapter || '').trim();
  const endpointPath = String(config.endpointPath || protocol.endpointPath || protocol.endpoint_path || '').trim();
  const statusEndpointPath = String(config.statusEndpointPath || protocol.statusEndpointPath || protocol.status_endpoint_path || '').trim();
  const baseUrl = String(config.baseUrl || config.url || '').trim().replace(/\/+$/, '') || 'https://aiyunzhi.top/v1';
  const fallbackEndpoint = modelType === 'VIDEO'
    ? (adapter === 'aiyunzhi-veo-video' ? '/chat/completions' : '/videos')
    : adapter === 'aiyunzhi-gemini-image'
      ? '/v1beta/models/{model}:generateContent'
      : adapter === 'aiyunzhi-firefly-gpt-image'
        ? '/v1/chat/completions'
        : '/v1/images/generations';
  const endpoint = endpointPath || fallbackEndpoint;
  return {
    baseUrl,
    endpointPath: endpoint,
    statusEndpointPath: statusEndpointPath || (modelType === 'VIDEO' && endpoint === '/videos' ? '/videos/{taskId}' : null),
  };
}

function displayName(config) {
  return String(config.displayName || config.label || config.ui?.label || config.name || config.model || config.id || 'Aiyunzhi Model').trim();
}

function pricingFromConfig(config, type) {
  const defaults = jsonObject(config.defaults);
  const pricing = jsonObject(defaults.pricing);
  const tiers = Array.isArray(pricing.resolutionTiers) ? pricing.resolutionTiers : [];
  const firstTier = jsonObject(tiers[0]);
  const unit = String(pricing.unit || pricing.billingMode || '').trim() || (type === 'VIDEO' ? 'second' : type === 'LLM' ? 'token_usd_ratio' : 'image_resolution_tier');
  const salePrice = Number(
    pricing.chargedCreditsPerGeneration ??
    pricing.memberCreditsPerGeneration ??
    pricing.chargedCredits ??
    firstTier.chargedCredits ??
    firstTier.chargedCreditsPerImage ??
    (type === 'IMAGE' ? 100 : 0),
  );
  const costPrice = Number(
    pricing.costCreditsPerGeneration ??
    pricing.costCredits ??
    firstTier.costCredits ??
    firstTier.costCreditsPerImage ??
    (type === 'IMAGE' ? salePrice : 0),
  );
  const pricePerSecond = Number(
    pricing.chargedCreditsPerSecond ??
    firstTier.chargedCreditsPerSecond ??
    (type === 'VIDEO' && unit === 'second' ? 25 : 0),
  );
  return {
    unit,
    salePrice: Number.isFinite(salePrice) ? salePrice : 0,
    costPrice: Number.isFinite(costPrice) ? costPrice : 0,
    pricePerSecond: Number.isFinite(pricePerSecond) ? pricePerSecond : 0,
  };
}

function requestMethodFor(config, adapter, type) {
  const protocol = jsonObject(config.protocol);
  const explicit = String(protocol.method || config.requestMethod || '').trim();
  if (explicit) return explicit;
  if (type === 'IMAGE' || type === 'LLM') return 'sync';
  if (adapter === 'aiyunzhi-veo-video') return 'sync';
  return 'async-poll';
}

function uploadModeFor(config, adapter, type) {
  const protocol = jsonObject(config.protocol);
  const explicit = String(config.uploadMode || protocol.uploadMode || '').trim();
  if (explicit) return explicit;
  if (type === 'LLM') return null;
  return 'object_storage';
}

async function loadTargetConfigs() {
  const files = (await readdir(modelsDir)).filter(file => file.endsWith('.json') && !file.startsWith('._')).sort();
  const configs = [];
  for (const file of files) {
    const config = await readJson(path.join(modelsDir, file));
    const sourceId = String(config.id || config.configId || path.basename(file, '.json')).trim();
    if (!targetIds.has(sourceId)) continue;
    configs.push({ file, sourceId, config });
  }
  return configs;
}

async function upsertOne({ file, sourceId, config }, apiKeyEncrypted) {
  const modelType = normalizeModelType(config);
  const protocolInput = jsonObject(config.protocol);
  const adapter = String(config.adapter || protocolInput.adapter || '').trim() || (modelType === 'VIDEO' ? 'notevideo' : modelType === 'LLM' ? 'openai-chat' : 'openai-image');
  const endpoint = endpointConfig(config, modelType);
  const uploadMode = uploadModeFor(config, adapter, modelType);
  const requestMethod = requestMethodFor(config, adapter, modelType);
  const providerId = `canvas-provider-${slug(sourceId)}`;
  const modelId = `canvas-${slug(sourceId)}`;
  const providerKey = `canvas_${slug(sourceId)}`;
  const realModel = String(config.model || config.name || sourceId).trim();
  const pricing = pricingFromConfig(config, modelType);
  const protocol = {
    ...protocolInput,
    adapter,
    endpointPath: endpoint.endpointPath,
    ...(endpoint.statusEndpointPath ? { statusEndpointPath: endpoint.statusEndpointPath } : {}),
    ...(uploadMode ? { uploadMode } : {}),
    ...(requestMethod ? { method: requestMethod } : {}),
  };

  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: `画布渠道 ${displayName(config)}`,
      type: modelType,
      adapter,
      baseUrl: endpoint.baseUrl,
      endpointPath: endpoint.endpointPath,
      statusEndpointPath: endpoint.statusEndpointPath,
      uploadMode,
      requestMethod,
      defaultModel: realModel,
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: `画布渠道 ${displayName(config)}`,
      type: modelType,
      adapter,
      baseUrl: endpoint.baseUrl,
      endpointPath: endpoint.endpointPath,
      statusEndpointPath: endpoint.statusEndpointPath,
      uploadMode,
      requestMethod,
      defaultModel: realModel,
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey: String(config.modelKey || sourceId).trim(),
      name: realModel,
      displayName: displayName(config),
      type: modelType,
      unit: pricing.unit,
      salePrice: pricing.salePrice,
      costPrice: pricing.costPrice,
      pricePerSecond: pricing.pricePerSecond,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter,
      endpointPath: endpoint.endpointPath,
      statusEndpointPath: endpoint.statusEndpointPath,
      uploadMode,
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: displayName(config) }),
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: String(config.modelKey || sourceId).trim(),
      name: realModel,
      displayName: displayName(config),
      type: modelType,
      unit: pricing.unit,
      salePrice: pricing.salePrice,
      costPrice: pricing.costPrice,
      pricePerSecond: pricing.pricePerSecond,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter,
      endpointPath: endpoint.endpointPath,
      statusEndpointPath: endpoint.statusEndpointPath,
      uploadMode,
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: displayName(config) }),
      status: 'ACTIVE',
    },
  });

  return {
    file,
    providerId,
    providerKey,
    modelId,
    type: modelType,
    adapter,
    endpointPath: endpoint.endpointPath,
  };
}

async function main() {
  const reusableKey = await findReusableAiyunzhiKey();
  const configs = await loadTargetConfigs();
  if (!configs.length) throw new Error(`No target Aiyunzhi/SD2 model JSON files found in ${modelsDir}`);
  const results = [];
  for (const item of configs) {
    results.push(await upsertOne(item, reusableKey.encrypted));
  }
  console.log(`[aiyunzhi-admin-model-config] keySource=${reusableKey.source}`);
  console.log(`[aiyunzhi-admin-model-config] upserted=${results.length}`);
  for (const item of results) {
    console.log(`[aiyunzhi-admin-model-config] ${item.modelId} ${item.type} ${item.adapter} ${item.endpointPath}`);
  }
}

main()
  .catch(err => {
    console.error('[aiyunzhi-admin-model-config] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
