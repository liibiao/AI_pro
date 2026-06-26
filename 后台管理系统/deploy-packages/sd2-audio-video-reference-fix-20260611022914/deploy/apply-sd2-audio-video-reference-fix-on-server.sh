#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 <package.tar.gz>" >&2
  exit 2
fi

STAMP="$(date +%Y%m%d%H%M%S)"
TMP_DIR="/tmp/sd2-audio-video-reference-fix-${STAMP}"
BACKUP_DIR="/tmp/sd2-audio-video-reference-fix-backup-${STAMP}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
API_DIR="${API_DIR:-$WEB_ROOT/ai-admin-platform/api-server}"

mkdir -p "$TMP_DIR" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

copy_with_backup() {
  local src="$1"
  local dest="$2"
  if [ ! -f "$src" ]; then
    echo "[skip] missing source: $src"
    return 0
  fi
  mkdir -p "$(dirname "$dest")" "$BACKUP_DIR/$(dirname "$dest")"
  if [ -f "$dest" ]; then
    cp "$dest" "$BACKUP_DIR/$dest"
  fi
  cp "$src" "$dest"
  echo "[ok] installed $dest"
}

copy_with_backup "$TMP_DIR/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html"
copy_with_backup "$TMP_DIR/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
copy_with_backup "$TMP_DIR/tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
copy_with_backup "$TMP_DIR/tools/workbench-web/models/sd2.json" "$WEB_ROOT/tools/workbench-web/models/sd2.json"

if [ -d "$API_DIR" ]; then
  copy_with_backup "$TMP_DIR/api-server/src/modules/models/routes.ts" "$API_DIR/src/modules/models/routes.ts"
  copy_with_backup "$TMP_DIR/api-server/dist/modules/models/routes.js" "$API_DIR/dist/modules/models/routes.js"
else
  echo "[warn] API_DIR not found: $API_DIR"
fi

node - <<'NODE' "$WEB_ROOT/tools/workbench-web/models/sd2.json"
const fs = require('fs');
const file = process.argv[2];
const model = JSON.parse(fs.readFileSync(file, 'utf8'));
const caps = model.capabilities || {};
if (caps.supportsAudio !== true || caps.supportsVideo !== true || caps.maxAudios !== 3 || caps.maxVideos !== 3) {
  throw new Error('sd2.json capability check failed');
}
console.log('[ok] sd2.json capabilities verified');
NODE

if [ -d "$API_DIR" ]; then
  cd "$API_DIR"
  if [ -f dist/sync-canvas-models.js ]; then
    CANVAS_MODELS_DIR="$WEB_ROOT/tools/workbench-web/models" \
    SYNC_CANVAS_MODELS_OVERWRITE=true \
    SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL=true \
    SYNC_CANVAS_MODELS_OVERWRITE_RUNTIME_CONFIG=true \
    SYNC_CANVAS_MODELS_OVERWRITE_PRICING=true \
    node dist/sync-canvas-models.js || echo "[warn] sync-canvas-models failed"
  fi
  if [ -f dist/consolidate-sd2-models.js ]; then
    node dist/consolidate-sd2-models.js || echo "[warn] consolidate-sd2-models failed"
  fi
fi

restart_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env && pm2 save || return 1
    return 0
  fi
  return 1
}

if id ubuntu >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 bash -lc 'pm2 restart ai-admin-api --update-env && pm2 save' || restart_pm2 || true
else
  restart_pm2 || true
fi

echo "[done] SD 2.0 audio/video reference capability fix installed"
echo "[backup] $BACKUP_DIR"
