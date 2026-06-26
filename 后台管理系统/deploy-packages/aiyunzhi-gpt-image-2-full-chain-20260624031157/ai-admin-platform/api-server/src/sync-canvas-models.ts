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
  SORA_V4_PRO_VIDEO_PRICING,
  SORA_VIDEO_PRICING,
  TOAPIS_SEEDANCE2_FAST_VIDEO_PRICING,
  TOAPIS_SEEDANCE2_VIDEO_PRICING,
  videoPricingDefaults,
  VIDEO_PRICING,
} from './pricing.js';

const defaultModelsDir = '/Users/billy/Documents/AI_pro/漫剧创作库/tools/workbench-web/models';
const modelsDir = process.env.CANVAS_MODELS_DIR || defaultModelsDir;
const overwriteExisting = process.env.SYNC_CANVAS_MODELS_OVERWRITE === 'true';
const overwriteProviderBaseUrl = process.env.SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL === 'true';
const overwriteRuntimeConfig = process.env.SYNC_CANVAS_MODELS_OVERWRITE_RUNTIME_CONFIG === 'true';
const overwritePricing = process.env.SYNC_CANVAS_MODELS_OVERWRITE_PRICING === 'true';
const allowAdminReset = process.env.SYNC_CANVAS_MODELS_ALLOW_ADMIN_RESET === 'true';

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
  const files = (await readdir(modelsDir)).filter(file => file.endsWith('.json') && !file.startsWith('._')).sort();
  const synced: string[] = [];

  for (const file of files) {
    const fullPath = path.join(modelsDir, file);
    const config = await readCanvasModelConfig(fullPath);
    const sourceId = String(config.id || config.name || path.basename(file, '.json')).trim();
    const modelId = `canvas-${slug(sourceId)}`;
    const providerId = `canvas-provider-${slug(sourceId)}`;
    const providerKey = `canvas_${slug(sourceId)}`;
    const modelType = normalizeModelType(config.type || config.model || config.name);
    if (!modelType) continue;

    const endpoint = normalizeEndpointConfig(config, modelType);
    const rawApiKey = String(config.apiKey || config.key || '').trim();
    const apiKey = isPlaceholderApiKey(rawApiKey) ? '' : rawApiKey;
    const adapterValue = String(config.adapter || config.protocol?.adapter || '').trim() || (modelType === 'VIDEO' ? 'notevideo' : modelType === 'LLM' ? 'openai-chat' : 'openai-image');
    const uploadModeValue = String(config.uploadMode || config.protocol?.uploadMode || '').trim()
    || (['veo-chat', 'veo-3.1', 'openai-responses-image', 'openai-chat-image', 'aiyunzhi-gpt-image-2', 'midjourney-imagine', 'midjourney', 'mj-imagine', 'grok_image', 'grok-image-unified', 'grok-image', 'grok-image-edit', 'sora-video', 'sora-video-pro', 'seedance-task', 'seedance2', 'seedance2.0', 'seedance2-sd', 'sd-seedance2', 'sd-video', 'lingdong-sd-2-vip', 'sd-2-vip', 'zaomeng-seedance2', 'zaomeng-seedance2-svip', 'zaomeng-seedance2-fast', 'toapis-seedance2', 'seedance2-vip', 'seedance2.0-vip', 'grok-video', 'gemini-image-generate', 'gemini-image-edit', 'gemini-video', 'veo-video'].includes(adapterValue) ? 'object_storage' : null);
  const requestMethodValue = String(config.protocol?.method || '').trim()
    || (['veo-chat', 'veo-3.1', 'openai-responses-image', 'openai-chat-image', 'aiyunzhi-gpt-image-2', 'grok_image', 'grok-image-unified', 'grok-image', 'grok-image-edit', 'grok-chat', 'grok-llm', 'gemini-image-generate', 'gemini-image-edit', 'gemini-chat', 'gemini-llm'].includes(adapterValue) ? 'sync' : (['midjourney-imagine', 'midjourney', 'mj-imagine', 'sora-video', 'sora-video-pro', 'seedance-task', 'seedance2', 'seedance2.0', 'seedance2-sd', 'sd-seedance2', 'sd-video', 'lingdong-sd-2-vip', 'sd-2-vip', 'zaomeng-seedance2', 'zaomeng-seedance2-svip', 'zaomeng-seedance2-fast', 'toapis-seedance2', 'seedance2-vip', 'seedance2.0-vip', 'grok-video', 'gemini-video', 'veo-video'].includes(adapterValue) ? 'async-poll' : null));
    const existingProvider = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
    const overwriteProviderConfig = overwriteExisting && (!existingProvider || allowAdminReset);
    const providerStatus = apiKey || existingProvider?.apiKeyEncrypted ? 'ACTIVE' : 'DISABLED';
    const provider = await prisma.upstreamProvider.upsert({
      where: { id: providerId },
      update: {
        providerKey: overwriteProviderConfig ? providerKey : existingProvider?.providerKey || providerKey,
        name: overwriteProviderConfig ? `画布渠道 ${displayName(config)}` : existingProvider?.name || `画布渠道 ${displayName(config)}`,
        type: overwriteProviderConfig ? modelType : existingProvider?.type || modelType,
        adapter: overwriteProviderConfig ? adapterValue : existingProvider?.adapter || adapterValue,
        baseUrl: overwriteProviderBaseUrl && (!existingProvider || allowAdminReset) ? endpoint.baseUrl : existingProvider?.baseUrl || endpoint.baseUrl,
        endpointPath: overwriteProviderConfig ? endpoint.endpointPath : existingProvider?.endpointPath || endpoint.endpointPath,
        statusEndpointPath: overwriteProviderConfig ? endpoint.statusEndpointPath : existingProvider?.statusEndpointPath || endpoint.statusEndpointPath,
        uploadMode: overwriteProviderConfig ? uploadModeValue : existingProvider?.uploadMode || uploadModeValue,
        requestMethod: overwriteProviderConfig ? requestMethodValue : existingProvider?.requestMethod || requestMethodValue,
        defaultModel: overwriteProviderConfig ? String(config.model || config.name || sourceId).trim() : existingProvider?.defaultModel || String(config.model || config.name || sourceId).trim(),
        ...((apiKey && (overwriteProviderConfig || !existingProvider?.apiKeyEncrypted)) ? { apiKeyEncrypted: encryptSecret(apiKey) } : {}),
        status: overwriteProviderConfig
          ? (apiKey || existingProvider?.apiKeyEncrypted ? existingProvider?.status || 'ACTIVE' : 'DISABLED')
          : existingProvider?.status || providerStatus,
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
    const overwriteModelConfig = overwriteExisting && (!existing || allowAdminReset);
    const overwriteModelPricing = overwritePricing && (!existing || allowAdminReset);
    const adapter = adapterValue;
    const uploadMode = uploadModeValue;
    const modelPricing = pricingForCanvasModel(modelType, {
      id: sourceId,
      name: String(config.name || ''),
      model: String(config.model || ''),
      displayName: displayName(config),
      adapter,
    });
    const pricingUnit = configPricingUnit(config, modelType);
    const defaultVideoPricePerSecond = modelType === 'VIDEO' && pricingUnit && pricingUnit !== 'second'
      ? 0
      : (modelType === 'VIDEO' ? VIDEO_PRICING.chargedCreditsPerSecond : 0);
    const protocol = {
      ...(config.protocol || {}),
      ...(adapter ? { adapter } : {}),
      endpointPath: endpoint.endpointPath,
      ...(endpoint.statusEndpointPath ? { statusEndpointPath: endpoint.statusEndpointPath } : {}),
      ...(uploadMode ? { uploadMode } : {}),
    };

    const preservedRuntimeConfig = overwriteRuntimeConfig && (!existing || allowAdminReset) ? undefined : runtimeConfigPatch(existing);
    const syncedDefaults = mergeJson(modelPricing.defaults, jsonObject(config.defaults), preservedRuntimeConfig);
    const preservedDefaults = preserveExistingPricing(existing?.defaults, syncedDefaults);
    const data: Prisma.AiModelUncheckedCreateInput = {
      id: modelId,
      providerId: provider.id,
      name: overwriteModelConfig ? String(config.model || config.name || sourceId).trim() : existing?.name || String(config.model || config.name || sourceId).trim(),
      displayName: overwriteModelConfig ? displayName(config) : existing?.displayName || displayName(config),
      type: overwriteModelConfig ? modelType : existing?.type || modelType,
      unit: overwriteModelPricing
        ? pricingUnit ?? existing?.unit ?? defaultUnit(modelType)
        : existing?.unit ?? pricingUnit ?? defaultUnit(modelType),
      salePrice: overwriteModelPricing
        ? modelPricing.salePrice ?? existing?.salePrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].chargedCredits : 0)
        : existing?.salePrice ?? modelPricing.salePrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].chargedCredits : 0),
      costPrice: overwriteModelPricing
        ? modelPricing.costPrice ?? existing?.costPrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].costCredits : modelType === 'VIDEO' ? VIDEO_PRICING.costCreditsPerSecond : 0)
        : existing?.costPrice ?? modelPricing.costPrice ?? (modelType === 'IMAGE' ? IMAGE_PRICING_TIERS[0].costCredits : modelType === 'VIDEO' ? VIDEO_PRICING.costCreditsPerSecond : 0),
      pricePerSecond: overwriteModelPricing
        ? modelPricing.pricePerSecond ?? existing?.pricePerSecond ?? defaultVideoPricePerSecond
        : existing?.pricePerSecond ?? modelPricing.pricePerSecond ?? defaultVideoPricePerSecond,
      inputPriceUsdPer1m: existing?.inputPriceUsdPer1m ?? 0,
      outputPriceUsdPer1m: existing?.outputPriceUsdPer1m ?? 0,
      cnyPerUsdCost: existing?.cnyPerUsdCost ?? 0,
      creditsPerUsdCost: existing?.creditsPerUsdCost ?? 0,
      markupRate: existing?.markupRate ?? 1,
      adapter: overwriteModelConfig ? adapter : existing?.adapter || adapter,
      endpointPath: overwriteModelConfig ? endpoint.endpointPath : existing?.endpointPath || endpoint.endpointPath,
      statusEndpointPath: overwriteModelConfig ? endpoint.statusEndpointPath : existing?.statusEndpointPath || endpoint.statusEndpointPath,
      uploadMode: overwriteModelConfig ? uploadMode : existing?.uploadMode || uploadMode,
      protocol: (overwriteModelConfig ? mergeJson(protocol, preservedRuntimeConfig) : existing?.protocol ?? mergeJson(protocol, preservedRuntimeConfig)) as Prisma.InputJsonValue,
      supports: overwriteModelConfig ? jsonValue(config.supports) : existing?.supports ?? jsonValue(config.supports),
      defaults: overwriteModelConfig
        ? (overwriteModelPricing ? syncedDefaults : preservedDefaults)
        : existing?.defaults ?? syncedDefaults,
      capabilities: overwriteModelConfig ? jsonValue(config.capabilities) : existing?.capabilities ?? jsonValue(config.capabilities),
      modelAssembly: overwriteModelConfig ? jsonValue(config.modelAssembly) : existing?.modelAssembly ?? jsonValue(config.modelAssembly),
      ui: overwriteModelConfig ? jsonValue(config.ui) : existing?.ui ?? jsonValue(config.ui),
      status: overwriteModelConfig ? 'ACTIVE' : existing?.status || 'ACTIVE',
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

async function readCanvasModelConfig(fullPath: string) {
  const raw = await readFile(fullPath, 'utf8');
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, '')) as CanvasModelConfig;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid canvas model JSON: ${fullPath}: ${reason}`);
  }
}

type SyncedModelType = 'IMAGE' | 'VIDEO' | 'LLM';

function normalizeModelType(value: unknown) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('video') || raw.includes('sora') || raw.includes('veo') || raw.includes('seedance') || raw.includes('zaomeng') || raw.includes('造梦') || raw.includes('artifex')) return 'VIDEO' as const;
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
  const fallbackEndpoint = adapter === 'seedance-task'
    ? '/api/v3/contents/generations/tasks'
    : adapter === 'toapis-seedance2'
    ? '/v1/videos/generations'
    : adapter === 'seedance2-sd' || adapter === 'sd-seedance2' || adapter === 'sd-video'
    ? '/videos'
    : adapter === 'sora-video' || adapter === 'sora-video-pro' || adapter === 'seedance2' || adapter === 'seedance2.0'
    ? '/videos'
    : adapter === 'midjourney-imagine' || adapter === 'midjourney' || adapter === 'mj-imagine'
    ? '/mj/submit/imagine'
    : adapter === 'lingdong-sd-2-vip' || adapter === 'sd-2-vip'
    ? '/videos'
    : adapter === 'seedance2-vip' || adapter === 'seedance2.0-vip'
    ? '/videos'
    : adapter === 'grok-video'
    ? '/videos'
    : adapter === 'gemini-video' || adapter === 'veo-video'
      ? '/videos'
    : adapter === 'aiyunzhi-gpt-image-2'
      ? '/v1/images/generations'
    : adapter === 'openai-responses-image'
      ? '/responses'
    : adapter === 'openai-chat-image'
      ? '/v1/chat/completions'
    : adapter === 'grok_image' || adapter === 'grok-image-unified'
      ? '/images/generations'
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
    if (adapter === 'toapis-seedance2' && /\/v1\/videos\/generations$/i.test(explicitBase)) {
      const parsed = new URL(explicitBase);
      return {
        baseUrl: parsed.origin,
        endpointPath: explicitEndpoint || '/v1/videos/generations',
        statusEndpointPath: statusEndpointPath(config, explicitEndpoint || '/v1/videos/generations'),
      };
    }
    if (adapter === 'seedance-task' && /\/api\/v3\/contents\/generations\/tasks$/i.test(explicitBase)) {
      const parsed = new URL(explicitBase);
      return {
        baseUrl: parsed.origin,
        endpointPath: explicitEndpoint || fallbackEndpoint,
        statusEndpointPath: statusEndpointPath(config, explicitEndpoint || fallbackEndpoint),
      };
    }
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
  const adapter = String(config.adapter || config.protocol?.adapter || '').trim();
  if (adapter === 'seedance-task') {
    if (!configured || configured === '{taskId}' || configured === '/{taskId}') return '/api/v3/contents/generations/tasks/{taskId}';
    return configured;
  }
  if (adapter === 'toapis-seedance2') {
    if (!configured || configured === '{taskId}' || configured === '/{taskId}') return '/v1/videos/generations/{taskId}';
    return configured;
  }
  if (configured) return configured;
  if (adapter === 'midjourney-imagine' || adapter === 'midjourney' || adapter === 'mj-imagine') return '/mj/task/{taskId}/fetch';
  if (adapter === 'sora-video') return '/videos/{taskId}';
  if (adapter === 'seedance2-sd' || adapter === 'sd-seedance2' || adapter === 'sd-video') return endpointPath === '/video/generations' ? '/video/generations/{taskId}' : '/videos/{taskId}';
  if (adapter === 'seedance2' || adapter === 'seedance2.0') return endpointPath === '/video/generations' ? '/video/generations/{taskId}' : '/videos/{taskId}';
  if (adapter === 'lingdong-sd-2-vip' || adapter === 'sd-2-vip') return '/video/generations/{taskId}';
  if (adapter === 'zaomeng-seedance2' || adapter === 'zaomeng-seedance2-svip' || adapter === 'zaomeng-seedance2-fast') return '/v1/videos/{taskId}';
  if (adapter === 'toapis-seedance2') return '/v1/videos/generations/{taskId}';
  if (adapter === 'seedance2-vip' || adapter === 'seedance2.0-vip') return '/videos/{taskId}';
  if (adapter === 'grok-video') return '/videos/{taskId}';
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

function isPlaceholderApiKey(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized.startsWith('replace-with-')
    || normalized.includes('your-api-key')
    || normalized.includes('placeholder');
}

function defaultUnit(type: SyncedModelType) {
  if (type === 'VIDEO') return 'second';
  if (type === 'LLM') return 'token_usd_ratio';
  return 'image_resolution_tier';
}

function configPricingUnit(config: CanvasModelConfig, type: SyncedModelType) {
  const defaults = jsonObject(config.defaults);
  const pricing = jsonObject(defaults?.pricing);
  const unit = String(pricing?.unit || pricing?.billingMode || pricing?.billing_mode || '').trim();
  if (!unit) return null;
  if (type === 'VIDEO' && ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request', 'second'].includes(unit)) return unit;
  if (type === 'IMAGE' && unit) return unit;
  if (type === 'LLM' && unit) return unit;
  return null;
}

function pricingForCanvasModel(type: SyncedModelType, model: { id: string; name: string; model: string; displayName: string; adapter: string }) {
  const key = `${model.id} ${model.name} ${model.model} ${model.displayName} ${model.adapter}`.toLowerCase();
  if (type === 'IMAGE' && key.includes('aiyunzhi-gpt-image-2')) {
    const tiers = IMAGE_PRICING_TIERS.filter(item => item.tier !== '3K');
    return {
      salePrice: tiers[0].chargedCredits,
      costPrice: tiers[0].costCredits,
      defaults: imagePricingDefaults(tiers),
    };
  }
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
  if (type === 'VIDEO' && key.includes('toapis') && key.includes('seedance') && key.includes('fast')) {
    return {
      pricePerSecond: TOAPIS_SEEDANCE2_FAST_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: TOAPIS_SEEDANCE2_FAST_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(TOAPIS_SEEDANCE2_FAST_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('toapis') && key.includes('seedance')) {
    return {
      pricePerSecond: TOAPIS_SEEDANCE2_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: TOAPIS_SEEDANCE2_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(TOAPIS_SEEDANCE2_VIDEO_PRICING),
    };
  }
  if (type === 'VIDEO' && key.includes('seedance-2-pro-1080p')) return flatVideoPricing(700);
  if (type === 'VIDEO' && key.includes('seedance-2-fast')) return flatVideoPricing(450);
  if (type === 'VIDEO' && /\bseedance-2\b/.test(key) && !key.includes('seedance-2-0')) return flatVideoPricing(600);
  if (type === 'VIDEO' && key.includes('sd2-fast')) {
    const pricing = {
      chargedCreditsPerSecond: 18,
      originalCreditsPerSecond: 45,
      costCreditsPerSecond: 12.6,
      grossMarginRate: 0.3,
      resolutionTiers: [
        { resolution: '720p', chargedCreditsPerSecond: 18, originalCreditsPerSecond: 45, costCreditsPerSecond: 12.6 },
        { resolution: '1080p', chargedCreditsPerSecond: 34, originalCreditsPerSecond: 85, costCreditsPerSecond: 23.8 },
      ],
    };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && key.includes('sd2-full')) {
    const pricing = {
      chargedCreditsPerSecond: 25,
      originalCreditsPerSecond: 62,
      costCreditsPerSecond: 17.5,
      grossMarginRate: 0.3,
      resolutionTiers: [
        { resolution: '720p', chargedCreditsPerSecond: 25, originalCreditsPerSecond: 62, costCreditsPerSecond: 17.5 },
        { resolution: '1080p', chargedCreditsPerSecond: 54, originalCreditsPerSecond: 135, costCreditsPerSecond: 37.8 },
      ],
    };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && /\bseedance-2\b/.test(key)) {
    return {
      salePrice: 500,
      costPrice: 350,
      pricePerSecond: 0,
      defaults: {
        pricing: {
          unit: 'generation',
          billingMode: 'generation',
          currency: 'credits',
          creditsPerCny: 100,
          memberCreditsPerGeneration: 500,
          chargedCreditsPerGeneration: 500,
          originalCreditsPerGeneration: 500,
          costCreditsPerGeneration: 350,
        },
      },
    };
  }
  if (type === 'VIDEO' && /(?:^|\s)sd2(?:\s|$)/.test(key)) {
    const pricing = {
      chargedCreditsPerSecond: 25,
      originalCreditsPerSecond: 62,
      costCreditsPerSecond: 17.5,
      grossMarginRate: 0.3,
      resolutionTiers: [
        { resolution: '720p', chargedCreditsPerSecond: 25, originalCreditsPerSecond: 62, costCreditsPerSecond: 17.5 },
        { resolution: '1080p', chargedCreditsPerSecond: 54, originalCreditsPerSecond: 135, costCreditsPerSecond: 37.8 },
      ],
    };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && /\bsd2-720p-fast\b/.test(key)) {
    const pricing = { chargedCreditsPerSecond: 18, originalCreditsPerSecond: 45, costCreditsPerSecond: 12.6, grossMarginRate: 0.3 };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && /\bsd2-720p\b/.test(key)) {
    const pricing = { chargedCreditsPerSecond: 25, originalCreditsPerSecond: 62, costCreditsPerSecond: 17.5, grossMarginRate: 0.3 };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && /\bsd2-1080p-fast\b/.test(key)) {
    const pricing = { chargedCreditsPerSecond: 34, originalCreditsPerSecond: 85, costCreditsPerSecond: 23.8, grossMarginRate: 0.3 };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && /\bsd2-1080p\b/.test(key)) {
    const pricing = { chargedCreditsPerSecond: 54, originalCreditsPerSecond: 135, costCreditsPerSecond: 37.8, grossMarginRate: 0.3 };
    return { pricePerSecond: pricing.chargedCreditsPerSecond, costPrice: pricing.costCreditsPerSecond, defaults: videoPricingDefaults(pricing) };
  }
  if (type === 'VIDEO' && (key.includes('seedance2') || key.includes('seedance 2')) && (key.includes('fast') || key.includes('pro') || key.includes('video-fast') || key.includes('video-pro')) && !key.includes('vip')) {
    const isPro = key.includes('pro') || key.includes('高质量');
    const chargedCreditsPerSecond = isPro ? 52 : 35;
    const resolutionTiers = isPro
      ? [
        { resolution: '480p', chargedCreditsPerSecond: 35, originalCreditsPerSecond: 35, costCreditsPerSecond: 24.5 },
        { resolution: '720p', chargedCreditsPerSecond: 52, originalCreditsPerSecond: 52, costCreditsPerSecond: 36.4 },
      ]
      : [
        { resolution: '480p', chargedCreditsPerSecond: 27, originalCreditsPerSecond: 27, costCreditsPerSecond: 18.9 },
        { resolution: '720p', chargedCreditsPerSecond: 35, originalCreditsPerSecond: 35, costCreditsPerSecond: 24.5 },
      ];
    const pricing = {
      chargedCreditsPerSecond,
      originalCreditsPerSecond: chargedCreditsPerSecond,
      costCreditsPerSecond: Number((chargedCreditsPerSecond * 0.7).toFixed(2)),
      grossMarginRate: 0.3,
      resolutionTiers,
    };
    return {
      pricePerSecond: pricing.chargedCreditsPerSecond,
      costPrice: pricing.costCreditsPerSecond,
      defaults: videoPricingDefaults(pricing),
    };
  }
  if (type === 'VIDEO' && (key.includes('seedance-task') || key.includes('doubao-seedance-2-0') || key.includes('seedance-2-0') || key.includes('seedance2.0-vip') || key.includes('seedance2-vip') || key.includes('seedance-2.0-vip') || key.includes('seedance 2.0 vip') || key.includes('sora-vip3-pro'))) {
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
  if (type === 'VIDEO' && key.includes('sora-v4-pro')) {
    return {
      pricePerSecond: SORA_V4_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: SORA_V4_PRO_VIDEO_PRICING.costCreditsPerSecond,
      defaults: videoPricingDefaults(SORA_V4_PRO_VIDEO_PRICING),
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

function flatVideoPricing(creditsPerGeneration: number) {
  return {
    salePrice: creditsPerGeneration,
    costPrice: creditsPerGeneration,
    pricePerSecond: 0,
    defaults: {
      pricing: {
        unit: 'generation',
        billingMode: 'per_generation',
        currency: 'credits',
        creditsPerCny: 100,
        memberDiscountRate: 1,
        memberCreditsPerGeneration: creditsPerGeneration,
        chargedCreditsPerGeneration: creditsPerGeneration,
        originalCreditsPerGeneration: creditsPerGeneration,
        costCreditsPerGeneration: creditsPerGeneration,
      },
    },
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

function preserveExistingPricing(existingDefaults: unknown, nextDefaults: Prisma.InputJsonValue) {
  const existing = jsonObject(existingDefaults);
  const existingPricing = jsonObject(existing?.pricing);
  if (!existingPricing) return nextDefaults;
  const next = jsonObject(nextDefaults) || {};
  const nextPricing = jsonObject(next.pricing) || {};
  return {
    ...next,
    pricing: {
      ...nextPricing,
      ...existingPricing,
    },
  } as Prisma.InputJsonValue;
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
