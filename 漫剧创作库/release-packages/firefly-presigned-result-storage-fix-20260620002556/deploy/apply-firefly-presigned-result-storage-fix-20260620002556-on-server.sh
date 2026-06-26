#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
API_ROOT="$APP_ROOT/api-server"
PKG_ROOT="firefly-presigned-result-storage-fix-20260620002556"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/firefly-presigned-result-storage-fix-20260620002556-$STAMP"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive missing: $ARCHIVE" >&2
  exit 1
fi
if [[ ! -d "$API_ROOT" ]]; then
  echo "[deploy] api root missing: $API_ROOT" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/firefly-presigned-storage.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

echo "[deploy] backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/api-server/scripts" "$BACKUP_DIR/api-server/src/modules/generation/adapters" "$BACKUP_DIR/api-server/dist/modules/generation/adapters"
cp -a "$API_ROOT/scripts/patch-firefly-presigned-result-storage.mjs" "$BACKUP_DIR/api-server/scripts/" 2>/dev/null || true
cp -a "$API_ROOT/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$API_ROOT/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js"

echo "[deploy] install patch script"
install -m 755 "$TMP_DIR/$PKG_ROOT/api-server/scripts/patch-firefly-presigned-result-storage.mjs" "$API_ROOT/scripts/patch-firefly-presigned-result-storage.mjs"

cd "$API_ROOT"

echo "[deploy] patch image result storage behavior"
node scripts/patch-firefly-presigned-result-storage.mjs

echo "[deploy] verify code markers"
grep -q "FIREFLY_PRESIGNED_RESULT_STORAGE_FIX" src/modules/generation/adapters/registry.ts
grep -q "FIREFLY_PRESIGNED_RESULT_STORAGE_FIX" dist/modules/generation/adapters/registry.js
grep -q "responseType === 'server_object_storage'.*materializeImageResultUrl" -n dist/modules/generation/adapters/registry.js || grep -q "return materializeImageResultUrl(provider, directUrl)" dist/modules/generation/adapters/registry.js
echo "[verify] code markers ok"

echo "[deploy] verify dist syntax"
node --check dist/modules/generation/adapters/registry.js

if command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] restart pm2: ai-admin-api"
  pm2 restart ai-admin-api --update-env
  pm2 status ai-admin-api
else
  echo "[deploy] pm2 not found, skip restart"
fi

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
