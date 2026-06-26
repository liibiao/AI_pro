#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
REMOTE_APP_ROOT="/var/www/ai-admin/ai-admin-platform"
API_DIR="$REMOTE_APP_ROOT/api-server"
TARGET_ORIGIN="https://api.artifex.help"

echo "[diag] archive: ${ARCHIVE_PATH:-<none>}"
echo "[diag] app root: $REMOTE_APP_ROOT"
cd "$API_DIR"

node --input-type=module <<'NODE'
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();
const targetOrigin = 'https://api.artifex.help';

function originOf(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/^(https?:\/\/[^/]+).*/i, '$1');
  }
}

function valueOfDecimal(value) {
  if (value == null) return String(value);
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return String(value);
}

const providers = await prisma.upstreamProvider.findMany({
  where: { baseUrl: { contains: 'api.artifex.help' } },
  include: {
    models: {
      include: {
        _count: { select: { usages: true, tasks: true, healthLogs: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    },
    _count: { select: { models: true, tasks: true, healthLogs: true } },
  },
  orderBy: { createdAt: 'asc' },
});

const matched = providers.filter((provider) => originOf(provider.baseUrl) === targetOrigin);
const otherPathMatches = providers.filter((provider) => originOf(provider.baseUrl) !== targetOrigin);

console.log(`ARTIFEX_ORIGIN=${targetOrigin}`);
console.log(`MATCHED_PROVIDER_COUNT=${matched.length}`);
console.log(`OTHER_API_ARTIFEX_MATCH_COUNT=${otherPathMatches.length}`);

let modelCount = 0;
let activeModelCount = 0;
let disabledModelCount = 0;

for (const provider of matched) {
  console.log('PROVIDER ' + JSON.stringify({
    id: provider.id,
    providerKey: provider.providerKey,
    name: provider.name,
    type: provider.type,
    adapter: provider.adapter,
    baseUrl: provider.baseUrl,
    origin: originOf(provider.baseUrl),
    endpointPath: provider.endpointPath,
    status: provider.status,
    createdAt: provider.createdAt,
    counts: provider._count,
  }));

  for (const model of provider.models) {
    modelCount += 1;
    if (model.status === 'ACTIVE') activeModelCount += 1;
    if (model.status === 'DISABLED') disabledModelCount += 1;
    console.log('MODEL ' + JSON.stringify({
      id: model.id,
      providerId: model.providerId,
      modelKey: model.modelKey,
      name: model.name,
      displayName: model.displayName,
      type: model.type,
      unit: model.unit,
      salePrice: model.salePrice,
      pricePerSecond: model.pricePerSecond,
      costPrice: valueOfDecimal(model.costPrice),
      status: model.status,
      createdAt: model.createdAt,
      counts: model._count,
    }));
  }
}

console.log('SUMMARY ' + JSON.stringify({
  providers: matched.length,
  models: modelCount,
  activeModels: activeModelCount,
  disabledModels: disabledModelCount,
}));

if (otherPathMatches.length) {
  console.log('OTHER_MATCHES ' + JSON.stringify(otherPathMatches.map((provider) => ({
    id: provider.id,
    providerKey: provider.providerKey,
    baseUrl: provider.baseUrl,
    origin: originOf(provider.baseUrl),
  }))));
}

await prisma.$disconnect();
NODE
