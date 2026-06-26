#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /path/to/midjourney-canvas-selectable-20260608090209.tar.gz" >&2
  exit 2
fi

PKG="midjourney-canvas-selectable-20260608090209"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
WORK_DIR="/tmp/$PKG-apply"
BACKUP_DIR="$REMOTE_ROOT/backups/$PKG-$(date +%Y%m%d%H%M%S)"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
test -f "$WORK_DIR/README.md"

cd "$API_DIR"
node --input-type=module <<'NODE'
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const { prisma } = await import('./dist/db.js');

const provider = await prisma.upstreamProvider.findFirst({
  where: {
    OR: [
      { providerKey: 'midjourney_imagine' },
      { id: 'canvas-provider-midjourney-imagine' },
      { adapter: 'midjourney-imagine' },
    ],
  },
  include: { models: true },
});

if (!provider) throw new Error('Midjourney provider not found');
if (/45\.77\.211\.38/i.test(String(provider.baseUrl || ''))) {
  throw new Error(`Refusing to enable Midjourney provider while Base URL still points to 45: ${provider.baseUrl}`);
}

const before = {
  providerId: provider.id,
  providerKey: provider.providerKey,
  providerStatus: provider.status,
  baseUrl: provider.baseUrl,
  modelStates: provider.models.map(model => ({ id: model.id, modelKey: model.modelKey, status: model.status })),
};

await prisma.$transaction([
  prisma.upstreamProvider.update({
    where: { id: provider.id },
    data: { status: 'ACTIVE' },
  }),
  prisma.aiModel.updateMany({
    where: {
      OR: [
        { id: 'canvas-midjourney-imagine' },
        { modelKey: 'midjourney-imagine' },
        { providerId: provider.id, adapter: 'midjourney-imagine' },
      ],
    },
    data: { status: 'ACTIVE' },
  }),
]);

const row = await prisma.aiModel.findFirst({
  where: {
    OR: [
      { id: 'canvas-midjourney-imagine' },
      { modelKey: 'midjourney-imagine' },
      { providerId: provider.id, adapter: 'midjourney-imagine' },
    ],
  },
  include: { provider: true },
});

if (!row?.provider) throw new Error('Midjourney model not found after activation');
if (row.status !== 'ACTIVE' || row.provider.status !== 'ACTIVE') {
  throw new Error(`Midjourney not active after update: model=${row.status}, provider=${row.provider.status}`);
}
if (/45\.77\.211\.38/i.test(String(row.provider.baseUrl || ''))) {
  throw new Error(`Midjourney Base URL still points to 45: ${row.provider.baseUrl}`);
}

const after = {
  id: row.id,
  modelKey: row.modelKey,
  displayName: row.displayName,
  modelStatus: row.status,
  providerKey: row.provider.providerKey,
  providerStatus: row.provider.status,
  adapter: row.adapter || row.provider.adapter,
  baseUrl: row.provider.baseUrl,
  endpointPath: row.endpointPath || row.provider.endpointPath,
  statusEndpointPath: row.statusEndpointPath || row.provider.statusEndpointPath,
  uploadMode: row.uploadMode || row.provider.uploadMode,
};

console.log(JSON.stringify({ before, after }, null, 2));
await prisma.$disconnect();
NODE

echo "[deploy] installed $PKG"
echo "[deploy] backup marker: $BACKUP_DIR"
