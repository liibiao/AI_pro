import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import { encryptSecret } from './security.js';
import {
  defaultPricingDefaults,
  GEMINI_IMAGE_PRICING_TIERS,
  GPT_IMAGE_2_PRO_PRICING_TIERS,
  imagePricingDefaults,
  IMAGE_PRICING_TIERS,
  SEEDANCE_FAST_VIDEO_PRICING,
  SEEDANCE_VIP_VIDEO_PRICING,
  SORA_FAST_VIDEO_PRICING,
  SORA_PRO_VIDEO_PRICING,
  SORA_VIDEO_PRICING,
  videoPricingDefaults,
  VIDEO_PRICING,
} from './pricing.js';

const defaultModelsDir = '/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/models';
const modelsDir = process.env.CANVAS_MODELS_DIR || defaultModelsDir;
const overwriteExisting = process.env.SYNC_CANVAS_MODELS_OVERWRITE === 'true';
const overwriteProviderBaseUrl = process.env.SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL === 'true';
const overwriteRuntimeConfig = process.env.SYNC_CANVAS_MODELS_OVERWRITE_RUNTIME_CONFIG === 'true';

type CanvasModelConfig = Record<string, unknown> & {
  id?: string;
  name?: string;
  type?: string;
  model?: string;
  baseUrl?: string;
  url?: string;
  key?: string;
  apiKey?: string;
  adapter?: string;
  endpointPath?: string;
  uploadMode?: string;
  protocol?: Record<string, unknown>;
  supports?: unknown;
  defaults?: unknown;
  capabilities?: unknown;
  modelAssembly?: unknown;
  ui?: Record<string, unknown>;
};

async function main() {
  const files = (await readdir(modelsDir)).filter(file => file.endsWith('.json')).sort();
  const synced: string[] = [];

  for (const file of files) {
    const fullPath = path.join(modelsDir, file);
    const config = JSON.parse(await readFile(fullPath, 'utf8')) as CanvasModelConfig;
    const sourceId = String(config.id || config.name || path.basename(file, '.json')).trim();
    const modelId = `canvas-${slug(sourceId)}`;
    const providerId = `canvas-provider-${slug(sourceId)}`;
    const providerKey = `canvas_${slug(sourceId)}`;
    const modelType = normalizeModelType(config.type || config.model || config.name);
    if (!modelType) continue;

    const endpoint = normalizeEndpointConfig(config, modelType);
    const apiKey = String(config.apiKey || config.key || '').trim();
    const providerStatus = apiKey ? 'ACTIVE' : 'DISABLED';
    const adapterValue = String(config.adapter || config.protocol?.adapter || '').trim() || (modelType === 'VIDEO' ? 'notevideo' : modelType === 'LLM' ? 'openai-chat' : 'openai-image');
    const uploadModeValue = String(config.uploadMode || config.protocol?.uploadMode || '').trim()
    || (['veo-chat', 'veo-3.1', 'grok-image', 'grok-image-edit', 'sora-video', 'seedance2-vip', 'seedance2.0-vip', 'grok-video', 'gemini-image-generate', 'gemini-image-edit', 'gemini-video', 'veo-video'].includes(adapterValue) ? 'object_storage' : null);
    const requestMethodValue = String(config.protocol?.method || '').trim()
    || (['veo-chat', 'veo-3.1', 'grok-image', 'grok-image-edit', 'grok-video', 'grok-chat', 'grok-llm', 'gemini-image-generate', 'gemini-image-edit', 'gemini-chat', 'gemini-llm'].includes(adapterValue) ? 'sync' : (['sora-video', 'seedance2-vip', 'seedance2.0-vip', 'gemini-video', 'veo-video'].includes(adapterValue) ? 'async-poll' : null));
    const existingProvider = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
    const provider = await prisma.upstreamProvider.upsert({
      where: { id: providerId },
      update: {
        providerKey: overwriteExisting ? providerKey : existingProvider?.providerKey || providerKey,
        name: overwriteExisting ? `画布渠道 ${displayName(config)}` : existingProvider?.name || `画布渠道 ${displayName(config)}`,
        type: overwriteExisting ? modelType : existingProvider?.type || modelType,
        adapter: overwriteExisting ? adapterValue : existingProvider?.adapter || adapterValue,
        baseUrl: overwriteProviderBaseUrl ? endpoint.baseUrl : existingProvider?.baseUrl || endpoint.baseUrl,
        endpointPath: overwriteExisting ? endpoint.endpointPath : existingProvider?.endpointPath || endpoint.endpointPath,
        statusEndpointPath: overwriteExisting ? endpoint.statusEndpointPath : existingProvider?.statusEndpointPath || endpoint.statusEndpointPath,
        uploadMode: overwriteExisting ? uploadModeValue : existingProvider?.uploadMode || uploadModeValue,
        requestMethod: overwriteExisting ? requestMethodValue : existingProvider?.requestMethod || requestMethodValue,
        defaultModel: overwriteExisting ? String(config.model || config.name || sourceId).trim() : existingProvider?.defaultModel || String(config.model || config.name || sourceId).trim(),
        ...((apiKey && (overwriteExisting || !existingProvider?.apiKeyEncrypted)) ? { apiKeyEncrypted: encryptSecret(apiKey) } : {}),
        status: overwriteExisting ? providerStatus : existingProvider?.status || providerStatus,
      },
      create: {
        id: providerId,
        providerKey,
        name: `画布渠道 ${displayName(config)}`,
        type: modelType,
        adapter: adapterValue,
        baseUrl: endpoint.baseUrl,
        endpointPath: endpoint.endpointPath,
        statusEndpointPath: endpoint.statusEndpointPath,
        uploadMode: uploadModeValue,
        requestMethod: requestMethodValue,
        defaultModel: String(config.model || config.name || sourceId).trim(),
        apiKeyEncrypted: encryptSecret(apiKey || 'replace-me'),
        status: providerStatus,
      },
    });

    const existing = await prisma.aiModel.findUnique({ where: { id: modelId } });
    const adapter = adapterValue;
    const uploadMode = uploadModeValue;
    const modelPricing = pricingForCanvasModel(modelType, {
      id: sourceId,
      name: String(config.name || ''),
      model: String(config.model || ''),
      displayName: displayName(config),
      adapter,
    });
    const protocol = {
      ...(config.protocol || {}),
      ...(adapter ? { adapter } : {}),
      endpointPath: endpoint.endpointPath,
      ...(endpoint.statusEndpointPath ? { statusEndpointPath: endpoint.statusEndpointPath } : {}),
      ...(uploadMode ? { uploadMode } : {}),
    };

    const preservedRuntimeConfig = overwriteRuntimeConfig ? undefined : runtimeConfigPatch(existing);
    const data: Prisma.AiModelUncheckedCreateInput = {
      id: modelId,
      providerId: provider.id,
      name: overwriteExisting ? String(config.model || config.name || sourceId).trim() : existing?.name || String(config.model || config.name || sourceId).trim(),
      displayName: overwriteExisting ? displayName(config) : existing?.displayName || displayName(config),
      type: overwriteExisting ? modelType : existing?.type || modelType,
      unit: existing?.unit ?? defaultUnit(modelType),
      salePrice: modelPricing.salePrice ?? existing?.salePrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].chargedCredits : 0),
      costPrice: modelPricing.costPrice ?? existing?.costPrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].costCredits : modelType === 'VIDEO' ? VIDEO_PRICING.costCreditsPerSecond : 0),
      pricePerSecond: modelPricing.pricePerSecond ?? existing?.pricePerSecond ?? (modelType === 'VIDEO' ? VIDEO_PRICING.chargedCreditsPerSecond : 0),
      inputPriceUsdPer1m: existing?.inputPriceUsdPer1m ?? 0,
      outputPriceUsdPer1m: existing?.outputPriceUsdPer1m ?? 0,
      cnyPerUsdCost: existing?.cnyPerUsdCost ?? 0,
      creditsPerUsdCost: existing?.creditsPerUsdCost ?? 0,
      markupRate: existing?.markupRate ?? 1,
      adapter: overwriteExisting ? adapter : existing?.adapter || adapter,
      endpointPath: overwriteExisting ? endpoint.endpointPath : existing?.endpointPath || endpoint.endpointPath,
      statusEndpointPath: overwriteExisting ? endpoint.statusEndpointPath : existing?.statusEndpointPath || endpoint.statusEndpointPath,
      uploadMode: overwriteExisting ? uploadMode : existing?.uploadMode || uploadMode,
      protocol: (overwriteExisting ? mergeJson(protocol, preservedRuntimeConfig) : existing?.protocol ?? mergeJson(protocol, preservedRuntimeConfig)) as Prisma.InputJsonValue,
      supports: overwriteExisting ? jsonValue(config.supports) : existing?.supports ?? jsonValue(config.supports),
      defaults: overwriteExisting ? mergeJson(modelPricing.defaults, jsonObject(config.defaults), preservedRuntimeConfig) : existing?.defaults ?? mergeJson(modelPricing.defaults, jsonObject(config.defaults), preservedRuntimeConfig),
      capabilities: overwriteExisting ? jsonValue(config.capabilities) : existing?.capabilities ?? jsonValue(config.capabilities),
      modelAssembly: overwriteExisting ? jsonValue(config.modelAssembly) : existing?.modelAssembly ?? jsonValue(config.modelAssembly),
      ui: overwriteExisting ? jsonValue(config.ui) : existing?.ui ?? jsonValue(config.ui),
      status: overwriteExisting ? 'ACTIVE' : existing?.status || 'ACTIVE',
    };

    await prisma.aiModel.upsert({
      where: { id: modelId },
      update: { ...data, id: undefined },
      create: data,
    });
    synced.push(`${modelId} -> ${provider.baseUrl}${endpoint.endpointPath}`);
  }

  console.log(`Canvas model sync complete. synced=${synced.length}`);
  synced.forEach(item => console.log(`- ${item}`));
}

type SyncedModelType = 'IMAGE' | 'VIDEO' | 'LLM';

function normalizeModelType(value: unknown) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('video') || raw.includes('sora') || raw.includes('veo')) return 'VIDEO' as const;
  if (raw.includes('gemini') && raw.includes('image')) return 'IMAGE' as const;
  if (raw.includes('llm') || raw.includes('chat') || raw.includes('grok-4') || raw.includes('gemini-') || raw.includes('deepseek') || raw.includes('claude')) return 'LLM' as const;
  if (raw.includes('image') || raw.includes('img') || raw.includes('gpt-image') || raw.includes('gemini') || raw.includes('grok-imagine')) return 'IMAGE' as const;
  return null;
}

function normalizeEndpointConfig(config: CanvasModelConfig, modelType: SyncedModelType) {
  const protocolEndpoint = String(config.protocol?.endpointPath || config.protocol?.endpoint_path || '').trim();
  const explicitEndpoint = String(config.endpointPath || protocolEndpoint || '').trim();
  const adapter = String(config.adapter || config.protocol?.adapter || '').trim();
  const explicitBase = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  const fallbackEndpoint = adapter === 'sora-video'
    ? '/videos'
    : adapter === 'seedance2-vip' || adapter === 'seedance2.0-vip'
    ? '/videos'
    : adapter === 'grok-video'
    ? '/videos'
    : adapter === 'gemini-video' || adapter === 'veo-video'
      ? '/videos'
    : adapter === 'grok-image-edit' || adapter === 'gemini-image-edit'
      ? '/images/edits'
      : adapter === 'grok-chat' || adapter === 'grok-llm' || adapter === 'gemini-chat' || adapter === 'gemini-llm'
        ? '/chat/completions'
        : adapter === 'grok-image' || adapter === 'gemini-image-generate'
          ? '/images/generations'
          : adapter === 'veo-chat' || adapter === 'veo-3.1'
    ? '/v1/chat/completions'
    : (modelType === 'VIDEO' ? '/video/generations' : modelType === 'LLM' ? '/chat/completions' : '/images/generations');
  if (explicitBase) {
    return {
      baseUrl: explicitBase,
      endpointPath: explicitEndpoint || fallbackEndpoint,
      statusEndpointPath: statusEndpointPath(config, explicitEndpoint),
    };
  }

  const rawUrl = String(config.url || '').trim();
  if (!rawUrl) {
    return {
      baseUrl: 'https://example.com/v1',
      endpointPath: explicitEndpoint || fallbackEndpoint,
      statusEndpointPath: statusEndpointPath(config, explicitEndpoint),
    };
  }

  const parsed = new URL(rawUrl);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (modelType === 'VIDEO' && /\/videos$/i.test(pathname)) {
    return {
      baseUrl: `${parsed.origin}${pathname.replace(/\/videos$/i, '')}`,
      endpointPath: '/videos',
      statusEndpointPath: statusEndpointPath(config, '/videos') || '/videos/{taskId}',
    };
  }

  return {
    baseUrl: `${parsed.origin}${pathname || ''}`.replace(/\/+$/, ''),
    endpointPath: explicitEndpoint || fallbackEndpoint,
    statusEndpointPath: statusEndpointPath(config, explicitEndpoint),
  };
}

function statusEndpointPath(config: CanvasModelConfig, endpointPath: string) {
  const configured = String(config.protocol?.statusEndpointPath || config.protocol?.status_endpoint_path || '').trim();
  if (configured) return configured;
  const adapter = String(config.adapter || config.protocol?.adapter || '').trim();
  if (adapter === 'sora-video') return '/videos/{taskId}';
  if (adapter === 'seedance2-vip' || adapter === 'seedance2.0-vip') return '/videos/{taskId}';
  if (adapter === 'grok-video') return null;
  if (adapter === 'gemini-video' || adapter === 'veo-video') return '/videos/{taskId}';
  if (endpointPath === '/videos') return '/videos/{taskId}';
  return null;
}

function displayName(config: CanvasModelConfig) {
  return String(config.ui?.label || config.name || config.model || config.id || 'Canvas Model').trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'model';
}

function defaultUnit(type: SyncedModelType) {
  if (type === 'VIDEO') return 'second';
  if (type === 'LLM') return 'token_usd_ratio';
  return 'image_resolution_tier';
}

function pricingForCanvasModel(type: SyncedModelType, model: { id: string; name: string; model: string; displayName: string; adapter: string }) {
  const key = `${model.id} ${model.name} ${model.model} ${model.displayName} ${model.adapter}`.toLowerCase();
  if (type === 'IMAGE' && key.includes('gemini')) {
    return {
      salePrice: GEMINI_IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: GEMINI_IMAGE_PRICING_TIERS[0].costCredits,
      defaults: imagePricingDefaults(GEMINI_IMAGE_PRICING_TIERS),
    };
  }
  if (type === 'IMAGE' && isGptImage2ProKey(key)) {
    return {
      salePrice: GPT_IMAGE_2_PRO_PRICING_TIERS[0].chargedCredits,
      costPrice: GPT_IMAGE_2_PRO_PRICING_TIERS[0].costCredits,
      defaults: imagePricingDefaults(GPT_IMAGE_2_PRO_PRICING_TIERS),
    };
  }
  if (type === 'VIDEO' && (key.includes('seedance2.0-vip') || key.includes('seedance2-vip') || key.includes('seedance-2.0-vip') || key.includes('seedance 2.0 vip') || key.includes('sora-vip3-pro'))) {
    return {
      pricePerSecond: SEEDANCE_VIP_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SEEDANCE_VIP_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SEEDANCE_VIP_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('sora-v3-fast')) {
    return {
      pricePerSecond: SORA_FAST_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SORA_FAST_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SORA_FAST_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('sora-v3-pro')) {
    return {
      pricePerSecond: SORA_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SORA_PRO_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SORA_PRO_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('sora')) {
    return {
      pricePerSecond: SORA_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SORA_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SORA_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('seedance') && key.includes('fast')) {
    return {
      pricePerSecond: SEEDANCE_FAST_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SEEDANCE_FAST_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SEEDANCE_FAST_VIDEO_PRICING),
    };
  }
  return {
    defaults: defaultPricingDefaults(type),
  };
}

function isGptImage2ProKey(key: string) {
  const normalized = String(key || '').toLowerCase().replace(/[\s_]+/g, '-');
  return normalized.includes('gpt-image-2-pro') || normalized.includes('gptimage2pro') || normalized.includes('gpt-image-2-pro');
}

function jsonValue(value: unknown) {
  return value == null ? undefined : value as Prisma.InputJsonValue;
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mergeJson(...items: Array<Record<string, unknown> | undefined>): Prisma.InputJsonValue {
  return items.reduce<Record<string, unknown>>((acc, item) => {
    if (!item) return acc;
    Object.entries(item).forEach(([key, value]) => {
      const left = acc[key];
      if (left && value && typeof left === 'object' && typeof value === 'object' && !Array.isArray(left) && !Array.isArray(value)) {
        acc[key] = { ...(left as Record<string, unknown>), ...(value as Record<string, unknown>) };
        return;
      }
      acc[key] = value;
    });
    return acc;
  }, {}) as Prisma.InputJsonValue;
}

const runtimeConfigKeys = [
  'imageMainModel',
  'responsesModel',
  'codexModel',
  'upstreamStreamConfigMode',
  'upstream_stream_config_mode',
  'upstreamStreamMode',
  'upstream_stream_mode',
  'upstreamStreamModes',
  'upstream_stream_modes',
  'asyncTaskConfigMode',
  'async_task_config_mode',
  'asyncTaskMode',
  'async_task_mode',
  'asyncTaskModes',
  'async_task_modes',
  'responseTypeMode',
  'response_type_mode',
  'responseType',
  'response_type',
  'responseTypes',
  'response_types',
];

function runtimeConfigPatch(model: { protocol?: Prisma.JsonValue | null; defaults?: Prisma.JsonValue | null } | null) {
  if (!model) return undefined;
  const source = {
    ...(jsonObject(model.defaults) || {}),
    ...(jsonObject(model.protocol) || {}),
  };
  const out: Record<string, unknown> = {};
  for (const key of runtimeConfigKeys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return Object.keys(out).length ? out : undefined;
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
