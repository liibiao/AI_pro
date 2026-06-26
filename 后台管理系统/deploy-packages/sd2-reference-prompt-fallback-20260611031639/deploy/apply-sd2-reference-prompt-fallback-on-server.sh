#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
ROOT="${ROOT:-/var/www/ai-admin}"
API="$ROOT/ai-admin-platform/api-server"
TMP="/tmp/sd2-reference-prompt-fallback-$$"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP="$ROOT/backups/sd2-reference-prompt-fallback-20260611031639-$STAMP"

rm -rf "$TMP"
mkdir -p "$TMP" "$BACKUP"
tar -xzf "$ARCHIVE" -C "$TMP"

install_file() {
  local src="$1"
  local dest="$2"
  local backup="$BACKUP/${dest#/}"
  mkdir -p "$(dirname "$dest")" "$(dirname "$backup")"
  if [ -f "$dest" ]; then cp -p "$dest" "$backup"; fi
  install -m 0644 "$src" "$dest"
  echo "[ok] $dest"
}

install_file "$TMP/workbench-web/image-studio-canvas-next.html" "$ROOT/image-studio-canvas-next.html"
install_file "$TMP/workbench-web/image-studio-canvas-next.html" "$ROOT/workbench-web/image-studio-canvas-next.html"
install_file "$TMP/tools/workbench-web/image-studio-canvas-next.html" "$ROOT/tools/workbench-web/image-studio-canvas-next.html"
install_file "$TMP/tools/workbench-web/models/sd2.json" "$ROOT/tools/workbench-web/models/sd2.json"
install_file "$TMP/api-server/src/modules/models/routes.ts" "$API/src/modules/models/routes.ts"
install_file "$TMP/api-server/dist/modules/models/routes.js" "$API/dist/modules/models/routes.js"
install_file "$TMP/api-server/src/modules/generation/adapters/registry.ts" "$API/src/modules/generation/adapters/registry.ts"
install_file "$TMP/api-server/dist/modules/generation/adapters/registry.js" "$API/dist/modules/generation/adapters/registry.js"

grep -F "function resolveSeedance2Prompt" "$API/dist/modules/generation/adapters/registry.js" >/dev/null
grep -F "isSeedance2PromptRequiredError(err)" "$API/dist/modules/generation/adapters/registry.js" >/dev/null
grep -F "seedance2AllUrlReferences(references)" "$API/dist/modules/generation/adapters/registry.js" >/dev/null

node - <<'NODE' "$ROOT/tools/workbench-web/models/sd2.json"
const fs = require('fs');
const model = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const caps = model.capabilities || {};
if (caps.supportsAudio !== true || caps.supportsVideo !== true || caps.maxAudios !== 3 || caps.maxVideos !== 3) {
  throw new Error('SD2 media capability verification failed');
}
console.log('[ok] SD2 supports 9 images + 3 videos + 3 audios');
NODE

cd "$API"
if [ -f dist/sync-canvas-models.js ]; then
  CANVAS_MODELS_DIR="$ROOT/tools/workbench-web/models" \
  SYNC_CANVAS_MODELS_OVERWRITE=true \
  SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL=true \
  SYNC_CANVAS_MODELS_OVERWRITE_RUNTIME_CONFIG=true \
  SYNC_CANVAS_MODELS_OVERWRITE_PRICING=true \
  node dist/sync-canvas-models.js
fi
if [ -f dist/consolidate-sd2-models.js ]; then
  node dist/consolidate-sd2-models.js
fi

if id ubuntu >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save || true
else
  PM2_HOME="${PM2_HOME:-$HOME/.pm2}" pm2 restart ai-admin-api --update-env
  PM2_HOME="${PM2_HOME:-$HOME/.pm2}" pm2 save || true
fi

echo "[done] SD2 reference prompt fallback installed"
echo "[backup] $BACKUP"
