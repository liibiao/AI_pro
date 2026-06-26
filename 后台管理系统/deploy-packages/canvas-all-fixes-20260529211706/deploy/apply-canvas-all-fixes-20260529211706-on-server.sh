#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo -E bash "$0" "$@"
  fi
  echo "[deploy] root permission required" >&2
  exit 1
fi

PKG="${PKG:-/tmp/canvas-all-fixes-20260529211706.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="${BACKUP:-/var/www/ai-admin/backups/canvas-all-fixes-20260529211706-$STAMP}"
TMP="$(mktemp -d /tmp/canvas-all-fixes-20260529211706.XXXXXX)"

cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

echo "[deploy] package: $PKG"
test -f "$PKG"
tar -xzf "$PKG" -C "$TMP"

echo "[deploy] backup: $BACKUP"
mkdir -p "$BACKUP/workbench-web" "$BACKUP/backend/api-server/src/modules/workbench-compat" "$BACKUP/backend/api-server/dist/modules/workbench-compat"
cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP/backend/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
cp -a "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP/backend/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true

echo "[deploy] install workbench"
mkdir -p "$WORKBENCH_DIR"
install -m 0644 "$TMP/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  install -m 0644 "$TMP/workbench-web/image-studio-canvas-next.html" "$MIRROR_DIR/image-studio-canvas-next.html"
fi

echo "[deploy] install api-server routes"
test -d "$APP_DIR/api-server"
install -m 0644 "$TMP/backend/api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
install -m 0644 "$TMP/backend/api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"

echo "[deploy] verify markers"
grep -q "node-upload-badge" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -q "right:38px;top:8px" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -q "compatibleDropPortAtPoint" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -q "syncSingleVideoNodeToPublicUrl" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -q "waitForNodeCosUpload" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -q "video/extract-audio" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
grep -q "runFfmpegExtractAudio" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "[deploy] ffmpeg: $(command -v ffmpeg)"
else
  echo "[deploy][WARN] ffmpeg not found; video audio extraction needs ffmpeg on server"
fi

echo "[deploy] restart api"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env || true
  pm2 save || true
else
  echo "[deploy][WARN] pm2 not found; please restart api-server manually"
fi

echo "[deploy] done"
