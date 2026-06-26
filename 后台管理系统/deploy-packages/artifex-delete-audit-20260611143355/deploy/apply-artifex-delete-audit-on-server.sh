#!/usr/bin/env bash
set -euo pipefail

REMOTE_APP_ROOT="/var/www/ai-admin/ai-admin-platform"
API_DIR="$REMOTE_APP_ROOT/api-server"

echo "[audit] app root: $REMOTE_APP_ROOT"
cd "$API_DIR"

node --input-type=module <<'NODE'
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();
const legacyProviderId = 'canvas-provider-seedance2';
const legacyModelIds = [
  'canvas-seedance2-fast-480p',
  'canvas-seedance2-fast-720p',
  'canvas-seedance2-pro-480p',
  'canvas-seedance2-pro-720p',
];
const currentArtifexModelIds = [
  'canvas-seedance2-fast',
  'canvas-seedance2-pro',
  'canvas-seedance2-pro-1080p',
];
const targetIds = [...legacyModelIds, ...currentArtifexModelIds];

const models = await prisma.aiModel.findMany({
  where: { id: { in: targetIds } },
  include: {
    provider: true,
    _count: { select: { usages: true, tasks: true, healthLogs: true } },
  },
  orderBy: { id: 'asc' },
});

console.log('MODEL_EXISTENCE ' + JSON.stringify({
  targetIds,
  existingIds: models.map((model) => model.id),
  missingIds: targetIds.filter((id) => !models.some((model) => model.id === id)),
}));

for (const model of models) {
  console.log('MODEL_ROW ' + JSON.stringify({
    id: model.id,
    providerId: model.providerId,
    providerKey: model.provider.providerKey,
    baseUrl: model.provider.baseUrl,
    name: model.name,
    displayName: model.displayName,
    unit: model.unit,
    salePrice: model.salePrice,
    pricePerSecond: model.pricePerSecond,
    status: model.status,
    providerStatus: model.provider.status,
    counts: model._count,
  }));
}

const deleteLogs = await prisma.adminLog.findMany({
  where: {
    action: 'MODEL_DELETE',
    targetType: 'AI_MODEL',
    OR: [
      { targetId: { in: targetIds } },
      { remark: { contains: 'Seedance', mode: 'insensitive' } },
      { remark: { contains: 'SD 2.0', mode: 'insensitive' } },
    ],
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
console.log('DELETE_LOG_COUNT=' + deleteLogs.length);
for (const log of deleteLogs) {
  console.log('DELETE_LOG ' + JSON.stringify({
    id: log.id,
    targetId: log.targetId,
    remark: log.remark,
    createdAt: log.createdAt,
    adminUserId: log.adminUserId,
  }));
}

const providerTasks = await prisma.generationTask.groupBy({
  by: ['modelId'],
  where: { providerId: legacyProviderId },
  _count: { _all: true },
  orderBy: { _count: { modelId: 'desc' } },
});
console.log('LEGACY_PROVIDER_TASK_MODELS ' + JSON.stringify(providerTasks));

const providerHealth = await prisma.providerHealthLog.groupBy({
  by: ['modelId'],
  where: { providerId: legacyProviderId },
  _count: { _all: true },
  orderBy: { _count: { modelId: 'desc' } },
});
console.log('LEGACY_PROVIDER_HEALTH_MODELS ' + JSON.stringify(providerHealth));

await prisma.$disconnect();
NODE
