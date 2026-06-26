#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/generation-mj-submit-gptimage2-route-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/generation-mj-submit-gptimage2-route-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"

REQ=(
  "api-server/src/modules/generation/adapters/registry.ts"
  "api-server/src/modules/generation/routes.ts"
  "api-server/dist/modules/generation/adapters/registry.js"
  "api-server/dist/modules/generation/routes.js"
  "api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs"
)
for path in "${REQ[@]}"; do
  test -s "$WORKDIR/$path" || { echo "missing package file: $path" >&2; exit 1; }
done

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/dist/modules/generation" \
  "$BACKUP_DIR/api-server/scripts"

cp -a "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs" "$BACKUP_DIR/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs" 2>/dev/null || true

echo "[deploy] install api-server files"
install -m 0644 "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
install -m 0644 "$WORKDIR/api-server/src/modules/generation/routes.ts" "$APP_ROOT/api-server/src/modules/generation/routes.ts"
install -m 0644 "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
install -m 0644 "$WORKDIR/api-server/dist/modules/generation/routes.js" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
install -m 0644 "$WORKDIR/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs" "$APP_ROOT/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs"

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  if id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  elif pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  else
    echo "没有找到 ai-admin-api PM2 进程" >&2
    exit 1
  fi
else
  echo "服务器未安装 pm2" >&2
  exit 1
fi

sleep 2
echo "[deploy] verify markers"
grep -F "MIDJOURNEY_SUBMIT_MIN_INTERVAL_MS" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" >/dev/null
grep -F "callMidjourneySubmitJson" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" >/dev/null
grep -F "return 'gpt-image-v2'" "$APP_ROOT/api-server/dist/modules/generation/routes.js" >/dev/null
grep -F "/v1/images/generations" "$APP_ROOT/api-server/scripts/fix-canvas-gpt-image2-pro-route.mjs" >/dev/null
curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
