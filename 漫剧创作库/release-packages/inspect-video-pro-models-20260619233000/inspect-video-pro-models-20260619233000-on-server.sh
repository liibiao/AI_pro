#!/usr/bin/env bash
set -euo pipefail

API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"

cd "$API_ROOT"
node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';

function safe(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function textFor(model) {
  const provider = model.provider || {};
  return [
    model.id,
    model.modelKey,
    model.name,
    model.displayName,
    model.adapter,
    model.status,
    provider.providerKey,
    provider.name,
    provider.adapter,
    provider.defaultModel,
    provider.baseUrl,
  ].map(value => safe(value).toLowerCase()).join(' ');
}

const models = await prisma.aiModel.findMany({
  where: { type: 'VIDEO' },
  include: { provider: true },
  orderBy: [{ status: 'asc' }, { modelKey: 'asc' }],
});

const hits = models.filter(model => {
  const text = textFor(model);
  return text.includes('不卡真人')
    || text.includes('高质量')
    || text.includes('sd2.0')
    || text.includes('sd2')
    || text.includes('seedance2')
    || text.includes('video-pro')
    || text.includes('sora-video-pro')
    || text.includes('api.artifex.help');
});

for (const model of hits) {
  const provider = model.provider || {};
  const pricing = model.defaults?.pricing || {};
  console.log(JSON.stringify({
    id: model.id,
    modelKey: model.modelKey,
    displayName: model.displayName,
    name: model.name,
    type: model.type,
    unit: model.unit,
    salePrice: model.salePrice,
    costPrice: model.costPrice,
    pricePerSecond: model.pricePerSecond,
    adapter: model.adapter,
    status: model.status,
    capabilitiesResolutions: model.capabilities?.resolutions || [],
    defaultResolution: model.capabilities?.defaultResolution || '',
    modelAssembly: model.modelAssembly || null,
    pricingUnit: pricing.unit || '',
    billingMode: pricing.billingMode || pricing.billing_mode || '',
    resolutionTiers: pricing.resolutionTiers || [],
    providerId: model.providerId,
    providerKey: provider.providerKey || '',
    providerName: provider.name || '',
    providerAdapter: provider.adapter || '',
    providerDefaultModel: provider.defaultModel || '',
    providerStatus: provider.status || '',
    providerBaseUrl: provider.baseUrl || '',
  }));
}

await prisma.$disconnect();
NODE
