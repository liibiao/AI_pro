import '../dist/config.js';
import { prisma } from '../dist/db.js';

const TARGET_ID = 'canvas-seedance2-pro-720p';
const TARGET_NAME = 'SD2.0 Pro 高质量 不卡真人';
const WRONG_MODEL_IDS = ['canvas-sora-video-pro', 'canvas-seedance2-pro'];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeResolution(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('1080')) return '1080p';
  if (raw.includes('480')) return '480p';
  return '720p';
}

function ensureResolution(list, resolution) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const normalized = normalizeResolution(item);
    if (!out.includes(normalized)) out.push(normalized);
  }
  if (!out.includes(resolution)) out.push(resolution);
  return out;
}

function tierResolution(tier) {
  return normalizeResolution(tier?.resolution || tier?.label || tier?.quality);
}

function cloneTier(tier, resolution) {
  return { ...(isObject(tier) ? tier : {}), resolution };
}

function ensurePricing1080(defaults, model) {
  const currentDefaults = isObject(defaults) ? defaults : {};
  const pricing = isObject(currentDefaults.pricing) ? currentDefaults.pricing : {};
  const existingTiers = Array.isArray(pricing.resolutionTiers)
    ? pricing.resolutionTiers.map(item => (isObject(item) ? item : {}))
    : [];
  const has1080 = existingTiers.some(item => tierResolution(item) === '1080p');
  const source720 = existingTiers.find(item => tierResolution(item) === '720p');
  const fallback = {
    costCreditsPerSecond: Number(model.costPrice || 0),
    chargedCreditsPerSecond: Number(model.pricePerSecond || model.salePrice || 0),
    originalCreditsPerSecond: Number(model.pricePerSecond || model.salePrice || 0),
  };
  const tiers = has1080 ? existingTiers : [...existingTiers, cloneTier(source720 || fallback, '1080p')];
  return {
    ...currentDefaults,
    pricing: {
      ...pricing,
      unit: pricing.unit || 'second',
      billingMode: pricing.billingMode || pricing.billing_mode || 'per_second',
      currency: pricing.currency || 'credits',
      creditsPerCny: pricing.creditsPerCny || 100,
      memberDiscountRate: pricing.memberDiscountRate || 1,
      resolutionTiers: tiers,
    },
  };
}

async function main() {
  const target = await prisma.aiModel.findUnique({
    where: { id: TARGET_ID },
    include: { provider: true },
  });
  if (!target) throw new Error(`Target model not found: ${TARGET_ID}`);
  if (target.displayName !== TARGET_NAME) {
    throw new Error(`Target displayName mismatch: ${target.displayName}`);
  }
  if (target.name !== 'video-pro') throw new Error(`Target real model mismatch: ${target.name}`);
  if (target.adapter !== 'seedance2') throw new Error(`Target adapter mismatch: ${target.adapter}`);

  const capabilities = {
    ...(isObject(target.capabilities) ? target.capabilities : {}),
    resolutions: ensureResolution(target.capabilities?.resolutions, '1080p'),
    defaultResolution: target.capabilities?.defaultResolution || '720p',
  };
  const defaults = ensurePricing1080(target.defaults, target);

  const updated = await prisma.aiModel.update({
    where: { id: TARGET_ID },
    data: {
      status: 'ACTIVE',
      unit: target.unit || 'second',
      adapter: 'seedance2',
      name: 'video-pro',
      capabilities,
      defaults,
      modelAssembly: { type: 'template', template: 'video-pro-{resolution}' },
      protocol: {
        ...(isObject(target.protocol) ? target.protocol : {}),
        adapter: 'seedance2',
        endpointPath: '/videos',
        statusEndpointPath: '/videos/{taskId}',
        method: 'async-poll',
        uploadMode: 'object_storage',
      },
    },
    include: { provider: true },
  });

  if (updated.providerId) {
    await prisma.upstreamProvider.update({
      where: { id: updated.providerId },
      data: {
        status: 'ACTIVE',
        adapter: 'seedance2',
        defaultModel: 'video-pro',
        endpointPath: '/videos',
        statusEndpointPath: '/videos/{taskId}',
        uploadMode: 'object_storage',
        requestMethod: 'async-poll',
      },
    });
  }

  const disabled = await prisma.aiModel.updateMany({
    where: { id: { in: WRONG_MODEL_IDS } },
    data: { status: 'DISABLED' },
  });
  await prisma.upstreamProvider.updateMany({
    where: { providerKey: 'sora-video-pro' },
    data: { status: 'DISABLED' },
  });

  const final = await prisma.aiModel.findUnique({
    where: { id: TARGET_ID },
    include: { provider: true },
  });
  const wrong = await prisma.aiModel.findMany({
    where: { id: { in: WRONG_MODEL_IDS } },
    select: { id: true, modelKey: true, displayName: true, status: true },
    orderBy: { id: 'asc' },
  });

  console.log(`[sd2-pro-highquality-1080] target=${final.id} display=${final.displayName} name=${final.name} status=${final.status}`);
  console.log(`[sd2-pro-highquality-1080] provider=${final.provider?.providerKey} adapter=${final.provider?.adapter} status=${final.provider?.status}`);
  console.log(`[sd2-pro-highquality-1080] resolutions=${JSON.stringify(final.capabilities?.resolutions || [])}`);
  console.log(`[sd2-pro-highquality-1080] pricing=${JSON.stringify(final.defaults?.pricing?.resolutionTiers || [])}`);
  console.log(`[sd2-pro-highquality-1080] disabledWrongCount=${disabled.count} wrong=${JSON.stringify(wrong)}`);
}

main()
  .catch(err => {
    console.error('[sd2-pro-highquality-1080] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
