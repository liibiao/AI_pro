#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/video-duration-checkbox-config-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/video-duration-checkbox-config-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

echo "[deploy] extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"

REQ=(
  "api-server/src/modules/models/routes.ts"
  "api-server/dist/modules/models/routes.js"
  "admin-web/src/main.tsx"
  "admin-web/dist/index.html"
  "tools/workbench-web/image-studio-canvas-next.html"
)
for path in "${REQ[@]}"; do
  test -s "$WORKDIR/$path" || { echo "missing package file: $path" >&2; exit 1; }
done

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/models" \
  "$BACKUP_DIR/api-server/dist/modules/models" \
  "$BACKUP_DIR/admin-web/src" \
  "$BACKUP_DIR/admin-web/dist" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web" \
  "$BACKUP_DIR/tools/workbench-web/canvas-next" \
  "$BACKUP_DIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next"

cp -a "$APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -a "$APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$APP_ROOT/admin-web/dist/." "$BACKUP_DIR/admin-web/dist/" 2>/dev/null || true
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_ROOT/tools/workbench-web/canvas-next/renderers.js" "$BACKUP_DIR/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
cp -a "/home/ubuntu/漫剧创作库/tools/workbench-web/canvas-next/renderers.js" "$BACKUP_DIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" 2>/dev/null || true

echo "[deploy] install backend source/dist"
install -m 0644 "$WORKDIR/api-server/src/modules/models/routes.ts" "$APP_ROOT/api-server/src/modules/models/routes.ts"
install -m 0644 "$WORKDIR/api-server/dist/modules/models/routes.js" "$APP_ROOT/api-server/dist/modules/models/routes.js"

echo "[deploy] install admin web"
install -m 0644 "$WORKDIR/admin-web/src/main.tsx" "$APP_ROOT/admin-web/src/main.tsx"
rm -rf "$APP_ROOT/admin-web/dist"
mkdir -p "$APP_ROOT/admin-web/dist"
cp -a "$WORKDIR/admin-web/dist/." "$APP_ROOT/admin-web/dist/"

echo "[deploy] install canvas files"
mkdir -p "$WORKBENCH_ROOT" "$REMOTE_ROOT/tools/workbench-web/canvas-next" "/home/ubuntu/漫剧创作库/tools/workbench-web/canvas-next"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$REMOTE_ROOT/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/renderers.js" "$REMOTE_ROOT/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true
install -m 0644 "$WORKDIR/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "/home/ubuntu/漫剧创作库/tools/workbench-web/canvas-next/renderers.js" 2>/dev/null || true

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  if sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  elif pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  else
    echo "[deploy] ai-admin-api pm2 process not found; skip restart" >&2
  fi
fi

echo "[deploy] verify markers"
grep -F "可选视频时长" "$APP_ROOT/admin-web/src/main.tsx" >/dev/null
grep -F "videoDurations" "$APP_ROOT/api-server/dist/modules/models/routes.js" >/dev/null
grep -F "allowedDurations" "$APP_ROOT/api-server/dist/modules/models/routes.js" >/dev/null
grep -F "raw.videoDurations" "$WORKBENCH_ROOT/image-studio-canvas-next.html" >/dev/null
curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
