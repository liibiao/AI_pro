#!/usr/bin/env bash
set -euo pipefail

REMOTE_APP_ROOT="/var/www/ai-admin/ai-admin-platform"
API_DIR="$REMOTE_APP_ROOT/api-server"
BACKUP_DIR="/var/www/ai-admin/backups"
STAMP="20260611145603"

echo "[restore] app root: $REMOTE_APP_ROOT"
mkdir -p "$BACKUP_DIR"
cd "$API_DIR"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const backupPath = '/var/www/ai-admin/backups/artifex-restore-disabled-models-20260611145603-before.json';
const providerId = 'canvas-provider-seedance2';
const providerKey = 'seedance2';
const endpointPath = '/videos';
const statusEndpointPath = '/videos/{taskId}';
const baseUrl = String(process.env.SEEDANCE2_BASE_URL || 'https://api.artifex.help/v1').replace(/\/+$/, '');
const apiKeyFromEnv = String(process.env.SEEDANCE2_API_KEY || '').trim();
const apiKeyPlaceholder = 'replace-with-seedance2-api-key';

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
const aspectRatios = ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'];
const durations = Array.from({ length: 12 }, (_, index) => index + 4);
const modelRows = [
  { id: 'canvas-seedance2-fast-480p', modelKey: 'seedance2-fast-480p', name: 'video-fast-480p', displayName: 'Seedance 2.0 Fast 480p', resolution: '480p', cnyPerSecond: 0.27, credits: 27, badge: 'FAST 480', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-fast-720p', modelKey: 'seedance2-fast-720p', name: 'video-fast-720p', displayName: 'Seedance 2.0 Fast 720p', resolution: '720p', cnyPerSecond: 0.35, credits: 35, badge: 'FAST 720', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-pro-480p', modelKey: 'seedance2-pro-480p', name: 'video-pro-480p', displayName: 'Seedance 2.0 Pro 480p', resolution: '480p', cnyPerSecond: 0.35, credits: 35, badge: 'PRO 480', badgeColor: '#22c55e' },
  { id: 'canvas-seedance2-pro-720p', modelKey: 'seedance2-pro-720p', name: 'video-pro-720p', displayName: 'Seedance 2.0 Pro 720p', resolution: '720p', cnyPerSecond: 0.52, credits: 52, badge: 'PRO 720', badgeColor: '#22c55e' },
];
const modelIds = modelRows.map((row) => row.id);

const before = {
  providerById: await prisma.upstreamProvider.findUnique({
    where: { id: providerId },
    include: { models: true, _count: { select: { models: true, tasks: true, healthLogs: true } } },
  }),
  providerByKey: await prisma.upstreamProvider.findUnique({
    where: { providerKey },
    include: { models: true, _count: { select: { models: true, tasks: true, healthLogs: true } } },
  }).catch(() => null),
  targetModels: await prisma.aiModel.findMany({ where: { id: { in: modelIds } } }),
};
fs.writeFileSync(backupPath, JSON.stringify(before, null, 2));
console.log(`[restore] before snapshot: ${backupPath}`);

const existingProvider = before.providerById;
const existingByKey = existingProvider ? null : before.providerByKey;
const providerWhereId = existingProvider?.id || existingByKey?.id || providerId;
const preservedProvider = existingProvider || existingByKey;
const apiKeyEncrypted = apiKeyFromEnv
  ? encryptSecret(apiKeyFromEnv)
  : (preservedProvider?.apiKeyEncrypted || encryptSecret(apiKeyPlaceholder));

await prisma.upstreamProvider.upsert({
  where: { id: providerWhereId },
  update: {
    providerKey,
    name: preservedProvider?.name || 'Seedance 2.0',
    type: 'VIDEO',
    adapter: 'seedance2',
    baseUrl: preservedProvider?.baseUrl || baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: preservedProvider?.defaultModel || 'video-fast-720p',
    apiKeyEncrypted,
    timeoutMs: Math.max(Number(preservedProvider?.timeoutMs || 0), 900000),
    status: 'DISABLED',
  },
  create: {
    id: providerWhereId,
    providerKey,
    name: 'Seedance 2.0',
    type: 'VIDEO',
    adapter: 'seedance2',
    baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'video-fast-720p',
    apiKeyEncrypted,
    timeoutMs: 900000,
    status: 'DISABLED',
  },
});

const provider = await prisma.upstreamProvider.findUniqueOrThrow({ where: { id: providerWhereId } });

for (const row of modelRows) {
  const pricing = {
    unit: 'second',
    currency: 'credits',
    creditsPerCny: 100,
    cnyPerSecond: row.cnyPerSecond,
    chargedCreditsPerSecond: row.credits,
    originalCreditsPerSecond: row.credits,
    costCreditsPerSecond: Number((row.credits * 0.7).toFixed(2)),
    grossMarginRate: 0.3,
  };
  const capabilities = {
    resolutions: [row.resolution],
    durations,
    defaultDuration: 6,
    defaultResolution: row.resolution,
    aspectRatios,
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    maxVideoDurationSeconds: 15,
    maxAudioDurationSeconds: 15,
    supportsAudio: true,
    supportsVideo: true,
    supportsLastFrame: false,
  };
  const modelData = {
    providerId: provider.id,
    modelKey: row.modelKey,
    name: row.name,
    displayName: row.displayName,
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(pricing.costCreditsPerSecond),
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
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor },
    status: 'DISABLED',
  };
  await prisma.aiModel.upsert({
    where: { id: row.id },
    update: modelData,
    create: { id: row.id, ...modelData },
  });
}

const restored = await prisma.aiModel.findMany({
  where: { id: { in: modelIds } },
  include: { provider: true },
  orderBy: { id: 'asc' },
});

console.log('RESTORED ' + JSON.stringify(restored.map((model) => ({
  id: model.id,
  modelKey: model.modelKey,
  displayName: model.displayName,
  unit: model.unit,
  salePrice: model.salePrice,
  pricePerSecond: model.pricePerSecond,
  status: model.status,
  providerId: model.providerId,
  providerKey: model.provider.providerKey,
  providerStatus: model.provider.status,
  baseUrl: model.provider.baseUrl,
})), null, 2));

await prisma.$disconnect();
NODE

echo "[restore] done"
