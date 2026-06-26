import { prisma } from './db.js';
import { encryptSecret } from './security.js';
import { IMAGE_PRICING_TIERS, VIDEO_PRICING, defaultPricingDefaults, imagePricingDefaults, videoPricingDefaults } from './pricing.js';

const providerId = process.env.CLIPROXY_XAI_PROVIDER_ID || 'cliproxy-xai-media';
const providerKey = process.env.CLIPROXY_XAI_PROVIDER_KEY || 'cliproxy_xai_media';
const baseUrl = (process.env.CLIPROXY_XAI_BASE_URL || 'http://45.77.211.38:8317/v1').replace(/\/+$/, '');
const apiKey = String(process.env.CLIPROXY_XAI_API_KEY || process.env.GROK_MEDIA_API_KEY || '').trim();
const status = process.env.CLIPROXY_XAI_DISABLED === 'true' ? 'DISABLED' : 'ACTIVE';
const keepLegacyGrokChannels = process.env.KEEP_LEGACY_GROK_CHANNELS === 'true';

if (!apiKey) {
  throw new Error('CLIPROXY_XAI_API_KEY is required to create the Grok media channel.');
}

async function main() {
  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: 'CLIProxy xAI Grok 图片视频LLM',
      type: null,
      adapter: 'grok_image',
      baseUrl,
      apiKeyEncrypted: encryptSecret(apiKey),
      endpointPath: null,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      requestMethod: null,
      defaultModel: 'grok-imagine-image',
      timeoutMs: 900000,
      status,
    },
    create: {
      id: providerId,
      providerKey,
      name: 'CLIProxy xAI Grok 图片视频LLM',
      type: null,
      adapter: 'grok_image',
      baseUrl,
      apiKeyEncrypted: encryptSecret(apiKey),
      endpointPath: null,
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      requestMethod: null,
      defaultModel: 'grok-imagine-image',
      timeoutMs: 900000,
      status,
    },
  });

  await upsertGrokImageModel(provider.id);
  await upsertGrokVideoModel(provider.id);
  await upsertGrokLlmModel(provider.id);
  await disableSupersededGrokModels(provider.id);

  if (!keepLegacyGrokChannels) {
    await disableLegacyGrokChannels(provider.id);
  }

  console.log(`Grok unified channel applied. providerKey=${provider.providerKey}, baseUrl=${baseUrl}`);
}

async function disableLegacyGrokChannels(activeProviderId: string) {
  const grokAdapters = ['grok_image', 'grok-image-unified', 'grok-image', 'grok-image-edit', 'grok-video', 'grok-chat', 'grok-llm'];
  await prisma.aiModel.updateMany({
    where: {
      providerId: { not: activeProviderId },
      OR: [
        { adapter: { in: grokAdapters } },
        { name: { startsWith: 'grok-imagine-1.0' } },
        { name: { startsWith: 'grok-4' } },
        { id: { in: ['canvas-grok-image', 'canvas-grok-image-edit', 'canvas-grok-video', 'canvas-grok-llm'] } },
        { modelKey: { in: ['grok-imagine-1-0', 'grok-imagine-1-0-edit', 'grok-imagine-1-0-video', 'grok-4'] } },
      ],
    },
    data: { status: 'DISABLED' },
  });
  await prisma.upstreamProvider.updateMany({
    where: {
      id: { not: activeProviderId },
      OR: [
        { adapter: { in: grokAdapters } },
        { defaultModel: { startsWith: 'grok-imagine-1.0' } },
        { defaultModel: { startsWith: 'grok-4' } },
        { id: { in: ['canvas-provider-grok-image', 'canvas-provider-grok-image-edit', 'canvas-provider-grok-video', 'canvas-provider-grok-llm'] } },
        { providerKey: { in: ['canvas_grok-image', 'canvas_grok-image-edit', 'canvas_grok-video', 'canvas_grok-llm'] } },
      ],
    },
    data: { status: 'DISABLED' },
  });
}

async function disableSupersededGrokModels(activeProviderId: string) {
  await prisma.aiModel.updateMany({
    where: {
      providerId: activeProviderId,
      id: { in: ['cliproxy-grok-image-edit'] },
    },
    data: { status: 'DISABLED' },
  });
}

async function upsertGrokImageModel(providerIdValue: string) {
  await prisma.aiModel.upsert({
    where: { id: 'cliproxy-grok-image' },
    update: {
      providerId: providerIdValue,
      name: 'grok-imagine-image',
      displayName: 'Grok 生图',
      type: 'IMAGE',
      adapter: 'grok_image',
      endpointPath: '/images/generations',
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok_image', endpointPath: '/images/generations', editEndpointPath: '/images/edits', method: 'sync', uploadMode: 'object_storage' },
      supports: { txt2img: true, img2img: true, imageToImage: true, storyboard: true, panorama: false },
      defaults: { ...imagePricingDefaults(IMAGE_PRICING_TIERS), size: '16:9', aspectRatio: '16:9', resolution: '1K' },
      capabilities: {
        aspectRatios: ['1:1', '16:9', '9:16', '3:2', '2:3'],
        resolutions: ['1K'],
        sizes: ['1024x1024', '1792x1024', '1024x1792', '1536x1024', '1024x1536'],
      },
      ui: { label: 'Grok 生图', badge: 'Grok', badgeColor: '#111827' },
      status: 'ACTIVE',
    },
    create: {
      id: 'cliproxy-grok-image',
      providerId: providerIdValue,
      modelKey: 'cliproxy-grok-image',
      name: 'grok-imagine-image',
      displayName: 'Grok 生图',
      type: 'IMAGE',
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: IMAGE_PRICING_TIERS[0].costCredits,
      adapter: 'grok_image',
      endpointPath: '/images/generations',
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok_image', endpointPath: '/images/generations', editEndpointPath: '/images/edits', method: 'sync', uploadMode: 'object_storage' },
      supports: { txt2img: true, img2img: true, imageToImage: true, storyboard: true, panorama: false },
      defaults: { ...imagePricingDefaults(IMAGE_PRICING_TIERS), size: '16:9', aspectRatio: '16:9', resolution: '1K' },
      capabilities: {
        aspectRatios: ['1:1', '16:9', '9:16', '3:2', '2:3'],
        resolutions: ['1K'],
        sizes: ['1024x1024', '1792x1024', '1024x1792', '1536x1024', '1024x1536'],
      },
      ui: { label: 'Grok 生图', badge: 'Grok', badgeColor: '#111827' },
      status: 'ACTIVE',
    },
  });
}

async function upsertGrokImageEditModel(providerIdValue: string) {
  await prisma.aiModel.upsert({
    where: { id: 'cliproxy-grok-image-edit' },
    update: {
      providerId: providerIdValue,
      name: 'grok-imagine-image',
      displayName: 'Grok 图生图',
      type: 'IMAGE',
      adapter: 'grok-image-edit',
      endpointPath: '/images/edits',
      statusEndpointPath: null,
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok-image-edit', endpointPath: '/images/edits', method: 'sync', uploadMode: 'object_storage' },
      supports: { txt2img: false, img2img: true, imageToImage: true, storyboard: true, panorama: false },
      defaults: { ...imagePricingDefaults(IMAGE_PRICING_TIERS), size: '1024x1024' },
      ui: { label: 'Grok 图生图', badge: 'Grok', badgeColor: '#0f766e' },
      status: 'ACTIVE',
    },
    create: {
      id: 'cliproxy-grok-image-edit',
      providerId: providerIdValue,
      modelKey: 'cliproxy-grok-image-edit',
      name: 'grok-imagine-image',
      displayName: 'Grok 图生图',
      type: 'IMAGE',
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: IMAGE_PRICING_TIERS[0].costCredits,
      adapter: 'grok-image-edit',
      endpointPath: '/images/edits',
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok-image-edit', endpointPath: '/images/edits', method: 'sync', uploadMode: 'object_storage' },
      supports: { txt2img: false, img2img: true, imageToImage: true, storyboard: true, panorama: false },
      defaults: { ...imagePricingDefaults(IMAGE_PRICING_TIERS), size: '1024x1024' },
      ui: { label: 'Grok 图生图', badge: 'Grok', badgeColor: '#0f766e' },
      status: 'ACTIVE',
    },
  });
}

async function upsertGrokVideoModel(providerIdValue: string) {
  await prisma.aiModel.upsert({
    where: { id: 'cliproxy-grok-video' },
    update: {
      providerId: providerIdValue,
      name: 'grok-imagine-video',
      displayName: 'Grok 生视频',
      type: 'VIDEO',
      adapter: 'grok-video',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok-video', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: { txt2video: true, img2video: true },
      defaults: videoPricingDefaults(VIDEO_PRICING),
      capabilities: {
        resolutions: ['480p', '720p'],
        durations: [4, 6, 8, 10, 12, 15],
        defaultDuration: 6,
        defaultResolution: '720p',
        aspectRatios: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
        maxImages: { full: 4, smartMultiFrame: 4, firstLast: 2 },
        supportsAudio: false,
        supportsVideo: false,
      },
      modelAssembly: { type: 'passthrough' },
      ui: { label: 'Grok 生视频', badge: 'Grok', badgeColor: '#7c3aed' },
      status: 'ACTIVE',
    },
    create: {
      id: 'cliproxy-grok-video',
      providerId: providerIdValue,
      modelKey: 'cliproxy-grok-video',
      name: 'grok-imagine-video',
      displayName: 'Grok 生视频',
      type: 'VIDEO',
      unit: 'second',
      pricePerSecond: VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: VIDEO_PRICING.costCreditsPerSecond,
      adapter: 'grok-video',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      uploadMode: 'object_storage',
      protocol: { adapter: 'grok-video', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}', method: 'async-poll', uploadMode: 'object_storage' },
      supports: { txt2video: true, img2video: true },
      defaults: videoPricingDefaults(VIDEO_PRICING),
      capabilities: {
        resolutions: ['480p', '720p'],
        durations: [4, 6, 8, 10, 12, 15],
        defaultDuration: 6,
        defaultResolution: '720p',
        aspectRatios: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'],
        maxImages: { full: 4, smartMultiFrame: 4, firstLast: 2 },
        supportsAudio: false,
        supportsVideo: false,
      },
      modelAssembly: { type: 'passthrough' },
      ui: { label: 'Grok 生视频', badge: 'Grok', badgeColor: '#7c3aed' },
      status: 'ACTIVE',
    },
  });
}

async function upsertGrokLlmModel(providerIdValue: string) {
  await prisma.aiModel.upsert({
    where: { id: 'cliproxy-grok-llm' },
    update: {
      providerId: providerIdValue,
      name: process.env.CLIPROXY_XAI_LLM_MODEL || 'grok-4',
      displayName: 'Grok LLM',
      type: 'LLM',
      adapter: 'grok-llm',
      endpointPath: '/chat/completions',
      statusEndpointPath: null,
      uploadMode: null,
      protocol: { adapter: 'grok-llm', endpointPath: '/chat/completions', method: 'sync' },
      supports: { chat: true, text: true, vision: true },
      defaults: defaultPricingDefaults('LLM'),
      ui: { label: 'Grok LLM', badge: 'Grok', badgeColor: '#334155' },
      status: 'ACTIVE',
    },
    create: {
      id: 'cliproxy-grok-llm',
      providerId: providerIdValue,
      modelKey: 'cliproxy-grok-llm',
      name: process.env.CLIPROXY_XAI_LLM_MODEL || 'grok-4',
      displayName: 'Grok LLM',
      type: 'LLM',
      unit: 'token_usd_ratio',
      inputPriceUsdPer1m: 1,
      outputPriceUsdPer1m: 5,
      cnyPerUsdCost: 0.2,
      creditsPerUsdCost: 20,
      markupRate: 1,
      adapter: 'grok-llm',
      endpointPath: '/chat/completions',
      protocol: { adapter: 'grok-llm', endpointPath: '/chat/completions', method: 'sync' },
      supports: { chat: true, text: true, vision: true },
      defaults: defaultPricingDefaults('LLM'),
      ui: { label: 'Grok LLM', badge: 'Grok', badgeColor: '#334155' },
      status: 'ACTIVE',
    },
  });
}

main().finally(() => prisma.$disconnect());
