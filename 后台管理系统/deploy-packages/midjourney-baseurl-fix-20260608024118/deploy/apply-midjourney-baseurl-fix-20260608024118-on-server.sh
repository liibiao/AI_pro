#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /path/to/midjourney-baseurl-fix-20260608024118.tar.gz" >&2
  exit 2
fi

PKG="midjourney-baseurl-fix-20260608024118"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
ADMIN_DIR="$APP_DIR/admin-web"
PM2_APP="${PM2_APP:-ai-admin-api}"
WORK_DIR="/tmp/$PKG-apply"
BACKUP_DIR="$REMOTE_ROOT/backups/$PKG-$(date +%Y%m%d%H%M%S)"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

SRC="$WORK_DIR/ai-admin-platform"
test -f "$SRC/api-server/scripts/materialize-midjourney-imagine.mjs"
test -f "$SRC/admin-web/src/main.tsx"
test -f "$SRC/admin-web/dist/index.html"

mkdir -p "$BACKUP_DIR/api-server/scripts" "$BACKUP_DIR/admin-web/src" "$BACKUP_DIR/admin-web"
if [ -f "$API_DIR/scripts/materialize-midjourney-imagine.mjs" ]; then
  cp "$API_DIR/scripts/materialize-midjourney-imagine.mjs" "$BACKUP_DIR/api-server/scripts/materialize-midjourney-imagine.mjs"
fi
if [ -f "$ADMIN_DIR/src/main.tsx" ]; then
  cp "$ADMIN_DIR/src/main.tsx" "$BACKUP_DIR/admin-web/src/main.tsx"
fi
if [ -d "$ADMIN_DIR/dist" ]; then
  cp -a "$ADMIN_DIR/dist" "$BACKUP_DIR/admin-web/dist"
fi

mkdir -p "$API_DIR/scripts" "$ADMIN_DIR/src"
cp "$SRC/api-server/scripts/materialize-midjourney-imagine.mjs" "$API_DIR/scripts/materialize-midjourney-imagine.mjs"
cp "$SRC/admin-web/src/main.tsx" "$ADMIN_DIR/src/main.tsx"
rm -rf "$ADMIN_DIR/dist"
cp -a "$SRC/admin-web/dist" "$ADMIN_DIR/dist"

cd "$API_DIR"
node scripts/materialize-midjourney-imagine.mjs

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env >/dev/null || pm2 restart "$PM2_APP" >/dev/null
fi

node --input-type=module <<'NODE'
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const { prisma } = await import('./dist/db.js');
const row = await prisma.aiModel.findUnique({
  where: { id: 'canvas-midjourney-imagine' },
  include: { provider: true },
});
if (!row?.provider) {
  throw new Error('Midjourney provider not found after materialize');
}
const result = {
  id: row.id,
  displayName: row.displayName,
  modelStatus: row.status,
  providerStatus: row.provider.status,
  providerKey: row.provider.providerKey,
  adapter: row.adapter || row.provider.adapter,
  baseUrl: row.provider.baseUrl,
  endpointPath: row.endpointPath || row.provider.endpointPath,
  statusEndpointPath: row.statusEndpointPath || row.provider.statusEndpointPath,
  uploadMode: row.uploadMode || row.provider.uploadMode,
};
console.log(JSON.stringify(result, null, 2));
if (/45\.77\.211\.38/i.test(String(row.provider.baseUrl || ''))) {
  throw new Error(`Midjourney Base URL still points to 45: ${row.provider.baseUrl}`);
}
await prisma.$disconnect();
NODE

echo "[deploy] installed $PKG"
echo "[deploy] backup: $BACKUP_DIR"
