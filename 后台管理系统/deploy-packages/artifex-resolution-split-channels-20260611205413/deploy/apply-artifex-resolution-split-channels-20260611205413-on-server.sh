#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="artifex-resolution-split-channels-20260611205413"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
[ -f "$WORK_DIR/$PKG/payload/package-name.txt" ] || fail "package payload missing"

log "migrate Artifex resolution channels"
cd "$APP_DIR/api-server"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const stamp = '20260611205413';
const backupPath = `/var/www/ai-admin/backups/artifex-resolution-split-channels-${stamp}-before-${Date.now()}.json`;
const baseUrl = String(process.env.ARTIFEX_BASE_URL || 'https://api.artifex.help/v1').replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.ARTIFEX_API_KEY || process.env.SEEDANCE2_API_KEY || '').trim();
const endpointPath = '/videos';
const statusEndpointPath = '/videos/{taskId}';
const durations = Array.from({ length: 12 }, (_, index) => index + 4);
const aspectRatios = ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'];
const protocol = {
  adapter: 'seedance2',
  method: 'async-poll',
  endpointPath,
  statusEndpointPath,
  uploadMode: 'object_storage',
};
const supports = {
  txt2video: true,
  img2video: true,
  referenceVideo: true,
  referenceAudio: true,
};

const perSecondRows = [
  { id: 'canvas-seedance2-fast-480p', providerId: 'canvas-provider-seedance2-fast-480p', providerKey: 'artifex-seedance2-fast-480p', modelKey: 'seedance2-fast-480p', name: 'video-fast-480p', displayName: 'Seedance 2.0 Fast 480p', resolution: '480p', credits: 27, badge: 'FAST 480', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-fast-720p', providerId: 'canvas-provider-seedance2-fast-720p', providerKey: 'artifex-seedance2-fast-720p', modelKey: 'seedance2-fast-720p', name: 'video-fast-720p', displayName: 'Seedance 2.0 Fast 720p', resolution: '720p', credits: 35, badge: 'FAST 720', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-pro-480p', providerId: 'canvas-provider-seedance2-pro-480p', providerKey: 'artifex-seedance2-pro-480p', modelKey: 'seedance2-pro-480p', name: 'video-pro-480p', displayName: 'Seedance 2.0 Pro 480p', resolution: '480p', credits: 35, badge: 'PRO 480', badgeColor: '#22c55e' },
  { id: 'canvas-seedance2-pro-720p', providerId: 'canvas-provider-seedance2-pro-720p', providerKey: 'artifex-seedance2-pro-720p', modelKey: 'seedance2-pro-720p', name: 'video-pro-720p', displayName: 'Seedance 2.0 Pro 720p', resolution: '720p', credits: 52, badge: 'PRO 720', badgeColor: '#22c55e' },
];
const perGenerationRows = [
  { id: 'canvas-seedance2-fast', providerId: 'canvas-provider-seedance2-fast', providerKey: 'artifex-seedance2-fast', modelKey: 'seedance2-fast', name: 'seedance-2-fast', displayName: 'Seedance 2 Fast', resolution: '720p', credits: 450, badge: 'FAST', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-pro', providerId: 'canvas-provider-seedance2-pro', providerKey: 'artifex-seedance2', modelKey: 'seedance2-pro', name: 'seedance-2', displayName: 'Seedance 2 高质量', resolution: '720p', credits: 600, badge: 'HQ', badgeColor: '#22c55e' },
  { id: 'canvas-seedance2-pro-1080p', providerId: 'canvas-provider-seedance2-pro-1080p', providerKey: 'artifex-seedance2-pro-1080p', modelKey: 'seedance2-pro-1080p', name: 'seedance-2-pro-1080p', displayName: 'Seedance 2 Pro 1080p', resolution: '1080p', credits: 700, badge: '1080P', badgeColor: '#a855f7' },
];
const allRows = [...perSecondRows, ...perGenerationRows];
const allModelIds = allRows.map(row => row.id);
const allProviderKeys = allRows.map(row => row.providerKey);
const templateModelIds = ['canvas-sd2-fast', 'canvas-sd2-full'];

const before = {
  providers: await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { baseUrl: { contains: 'api.artifex.help' } },
        { providerKey: { in: allProviderKeys } },
        { providerKey: { contains: 'artifex' } },
      ],
    },
    include: { models: true },
    orderBy: { providerKey: 'asc' },
  }),
  models: await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: [...allModelIds, ...templateModelIds] } },
        { name: { in: allRows.map(row => row.name) } },
        { modelKey: { in: allRows.map(row => row.modelKey) } },
      ],
    },
    include: { provider: true },
    orderBy: { id: 'asc' },
  }),
};
fs.writeFileSync(backupPath, JSON.stringify(before, null, 2));
console.log(`BACKUP=${backupPath}`);

const reusableProvider = before.providers.find(provider => provider.apiKeyEncrypted)
  || await prisma.upstreamProvider.findFirst({
    where: {
      OR: [
        { baseUrl: { contains: 'api.artifex.help' } },
        { providerKey: { contains: 'artifex' } },
        { providerKey: { contains: 'seedance2' } },
      ],
      apiKeyEncrypted: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  });
const apiKeyEncrypted = apiKeyFromEnv
  ? encryptSecret(apiKeyFromEnv)
  : reusableProvider?.apiKeyEncrypted;
if (!apiKeyEncrypted) throw new Error('未找到可复用的 Artifex API Key，请设置 ARTIFEX_API_KEY 后重试。');

function singleResolutionCapabilities(row) {
  return {
    resolutions: [row.resolution],
    durations,
    defaultDuration: row.name.startsWith('seedance-2') ? 5 : 6,
    defaultResolution: row.resolution,
    aspectRatios,
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    maxMaterials: 12,
    maxMaterialSizeMb: 25,
    maxVideoDurationSeconds: 15,
    maxAudioDurationSeconds: 15,
    supportsAudio: true,
    supportsVideo: true,
    supportsLastFrame: false,
  };
}

async function ensureProvider(row, preferredStatus = 'ACTIVE') {
  const existing = await prisma.upstreamProvider.findFirst({
    where: { OR: [{ id: row.providerId }, { providerKey: row.providerKey }] },
  });
  return prisma.upstreamProvider.upsert({
    where: { id: existing?.id || row.providerId },
    update: {
      providerKey: row.providerKey,
      name: `Artifex ${row.displayName}`,
      type: 'VIDEO',
      adapter: 'seedance2',
      baseUrl: existing?.baseUrl || baseUrl,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: row.name,
      apiKeyEncrypted: existing?.apiKeyEncrypted || apiKeyEncrypted,
      timeoutMs: Math.max(Number(existing?.timeoutMs || 0), 900000),
      status: existing?.status || preferredStatus,
    },
    create: {
      id: row.providerId,
      providerKey: row.providerKey,
      name: `Artifex ${row.displayName}`,
      type: 'VIDEO',
      adapter: 'seedance2',
      baseUrl,
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      requestMethod: 'async-poll',
      defaultModel: row.name,
      apiKeyEncrypted,
      timeoutMs: 900000,
      status: preferredStatus,
    },
  });
}

for (const row of perSecondRows) {
  const provider = await ensureProvider(row, 'ACTIVE');
  const existingModel = await prisma.aiModel.findUnique({ where: { id: row.id } });
  const cost = Number((row.credits * 0.7).toFixed(2));
  const pricing = {
    unit: 'second',
    billingMode: 'per_second',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    chargedCreditsPerSecond: row.credits,
    memberCreditsPerSecond: row.credits,
    originalCreditsPerSecond: row.credits,
    costCreditsPerSecond: cost,
  };
  await prisma.aiModel.upsert({
    where: { id: row.id },
    update: {
      providerId: provider.id,
      modelKey: row.modelKey,
      name: row.name,
      displayName: row.displayName,
      type: 'VIDEO',
      unit: 'second',
      salePrice: 0,
      costPrice: new Prisma.Decimal(cost),
      pricePerSecond: row.credits,
      adapter: 'seedance2',
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults: { pricing },
      capabilities: singleResolutionCapabilities(row),
      modelAssembly: { type: 'passthrough' },
      ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor, provider: 'Artifex' },
      status: existingModel?.status || 'DISABLED',
    },
    create: {
      id: row.id,
      providerId: provider.id,
      modelKey: row.modelKey,
      name: row.name,
      displayName: row.displayName,
      type: 'VIDEO',
      unit: 'second',
      salePrice: 0,
      costPrice: new Prisma.Decimal(cost),
      pricePerSecond: row.credits,
      inputPriceUsdPer1m: new Prisma.Decimal(0),
      outputPriceUsdPer1m: new Prisma.Decimal(0),
      cnyPerUsdCost: new Prisma.Decimal(0),
      creditsPerUsdCost: new Prisma.Decimal(0),
      markupRate: new Prisma.Decimal(1),
      adapter: 'seedance2',
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults: { pricing },
      capabilities: singleResolutionCapabilities(row),
      modelAssembly: { type: 'passthrough' },
      ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor, provider: 'Artifex' },
      status: 'DISABLED',
    },
  });
}

for (const row of perGenerationRows) {
  const provider = await ensureProvider(row, 'ACTIVE');
  const existingModel = await prisma.aiModel.findUnique({ where: { id: row.id } });
  const pricing = {
    unit: 'generation',
    billingMode: 'per_generation',
    currency: 'credits',
    creditsPerCny: 100,
    memberDiscountRate: 1,
    memberCreditsPerGeneration: row.credits,
    chargedCreditsPerGeneration: row.credits,
    originalCreditsPerGeneration: row.credits,
    costCreditsPerGeneration: row.credits,
  };
  await prisma.aiModel.upsert({
    where: { id: row.id },
    update: {
      providerId: provider.id,
      modelKey: row.modelKey,
      name: row.name,
      displayName: row.displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: row.credits,
      costPrice: new Prisma.Decimal(row.credits),
      pricePerSecond: 0,
      adapter: 'seedance2',
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults: { pricing },
      capabilities: singleResolutionCapabilities(row),
      modelAssembly: { type: 'passthrough' },
      ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor, provider: 'Artifex' },
      status: existingModel?.status || 'ACTIVE',
    },
    create: {
      id: row.id,
      providerId: provider.id,
      modelKey: row.modelKey,
      name: row.name,
      displayName: row.displayName,
      type: 'VIDEO',
      unit: 'generation',
      salePrice: row.credits,
      costPrice: new Prisma.Decimal(row.credits),
      pricePerSecond: 0,
      inputPriceUsdPer1m: new Prisma.Decimal(0),
      outputPriceUsdPer1m: new Prisma.Decimal(0),
      cnyPerUsdCost: new Prisma.Decimal(0),
      creditsPerUsdCost: new Prisma.Decimal(0),
      markupRate: new Prisma.Decimal(1),
      adapter: 'seedance2',
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      protocol,
      supports,
      defaults: { pricing },
      capabilities: singleResolutionCapabilities(row),
      modelAssembly: { type: 'passthrough' },
      ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor, provider: 'Artifex' },
      status: 'ACTIVE',
    },
  });
}

const artifexTemplateModels = await prisma.aiModel.findMany({
  where: {
    OR: templateModelIds.map(id => ({ id })),
  },
  include: { provider: true },
});
for (const model of artifexTemplateModels) {
  const assembly = model.modelAssembly && typeof model.modelAssembly === 'object' && !Array.isArray(model.modelAssembly) ? model.modelAssembly : {};
  const template = String(assembly.template || '');
  const isArtifex = String(model.provider?.baseUrl || '').includes('api.artifex.help')
    || String(model.provider?.providerKey || '').includes('artifex')
    || String(model.provider?.name || '').toLowerCase().includes('artifex');
  if (isArtifex && template.includes('{resolution}')) {
    await prisma.aiModel.update({ where: { id: model.id }, data: { status: 'DISABLED' } });
  }
}

const after = await prisma.aiModel.findMany({
  where: { id: { in: allModelIds } },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
console.log('ARTIFEX_RESOLUTION_CHANNELS ' + JSON.stringify(after.map(model => {
  const caps = model.capabilities && typeof model.capabilities === 'object' && !Array.isArray(model.capabilities) ? model.capabilities : {};
  const assembly = model.modelAssembly && typeof model.modelAssembly === 'object' && !Array.isArray(model.modelAssembly) ? model.modelAssembly : {};
  return {
    id: model.id,
    modelKey: model.modelKey,
    name: model.name,
    displayName: model.displayName,
    unit: model.unit,
    status: model.status,
    providerKey: model.provider.providerKey,
    providerStatus: model.provider.status,
    baseUrl: model.provider.baseUrl,
    resolutions: caps.resolutions,
    modelAssembly: assembly,
  };
}), null, 2));

await prisma.$disconnect();
NODE

log "done"
