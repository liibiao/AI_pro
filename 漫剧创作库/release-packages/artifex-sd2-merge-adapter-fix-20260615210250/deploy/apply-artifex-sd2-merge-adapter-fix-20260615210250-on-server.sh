#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="artifex-sd2-merge-adapter-fix-20260615210250"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
PUBLIC_WEB="/var/www/ai-admin/workbench-web"
REPO_ROOT="/home/ubuntu/漫剧创作库"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

backup_web_file() {
  local web_dir="$1"
  local rel="$2"
  local target="$web_dir/$rel"
  local backup="$BACKUP_DIR/web/${web_dir//\//_}/$rel"
  if [[ -f "$target" ]]; then
    mkdir -p "$(dirname "$backup")"
    cp -a "$target" "$backup"
  fi
}

copy_web_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  backup_web_file "$web_dir" "models/seedance2-fast.json"
  backup_web_file "$web_dir" "models/seedance2-pro.json"
  backup_web_file "$web_dir" "canvas-next/generation-service.js"
  backup_web_file "$web_dir" "image-studio-canvas-next.html"
  backup_web_file "$web_dir" "image-studio-canvas.html"
  backup_web_file "$web_dir" "model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/seedance2-fast.json" "$web_dir/models/seedance2-fast.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/seedance2-pro.json" "$web_dir/models/seedance2-pro.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/canvas-next/generation-service.js" "$web_dir/canvas-next/generation-service.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas.html" "$web_dir/image-studio-canvas.html"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "$web_dir/model-registry.json"
  if [[ -f "$web_dir/image-studio-canvas-next.html" || "$web_dir" == "$PUBLIC_WEB" || "$web_dir" == "${REPO_ROOT}/tools/workbench-web" ]]; then
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas-next.html" "$web_dir/image-studio-canvas-next.html"
  fi
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api" "$BACKUP_DIR/web"

cp -a "${API_ROOT}/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api/registry.ts"
cp -a "${API_ROOT}/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api/registry.js"

echo "[deploy] sync workbench static files"
copy_web_bundle "$PUBLIC_WEB"
copy_web_bundle "${REPO_ROOT}/tools/workbench-web"
copy_web_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
copy_web_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi

echo "[deploy] install api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-artifex-sd2-adapter.mjs" \
  "${API_ROOT}/scripts/patch-artifex-sd2-adapter.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-artifex-sd2-merge.mjs" \
  "${API_ROOT}/scripts/apply-artifex-sd2-merge.mjs"

echo "[deploy] patch admin api adapter"
(cd "$API_ROOT" && node scripts/patch-artifex-sd2-adapter.mjs)

echo "[deploy] apply artifex sd2 fast/pro merge"
(cd "$API_ROOT" && node scripts/apply-artifex-sd2-merge.mjs)

echo "[deploy] verify static workbench config"
node - <<'NODE'
const fs = require('fs');
for (const [file, template] of [
  ['/var/www/ai-admin/workbench-web/models/seedance2-fast.json', 'video-fast-{resolution}'],
  ['/var/www/ai-admin/workbench-web/models/seedance2-pro.json', 'video-pro-{resolution}'],
]) {
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (model.modelAssembly?.template !== template) throw new Error(`${file} missing ${template}`);
  if (!model.capabilities?.resolutions?.includes('480p') || !model.capabilities?.resolutions?.includes('720p')) {
    throw new Error(`${file} missing 480p/720p resolutions`);
  }
  if (!Array.isArray(model.defaults?.pricing?.resolutionTiers)) throw new Error(`${file} missing pricing tiers`);
}
const service = fs.readFileSync('/var/www/ai-admin/workbench-web/canvas-next/generation-service.js', 'utf8');
if (service.includes('video-pro-720p|artifex')) throw new Error('Sora Pro detector is still too broad');
console.log('[verify] static artifex sd2 config ok');
NODE

echo "[deploy] verify admin api adapter"
(cd "$API_ROOT" && node - <<'NODE'
const fs = require('fs');
for (const file of ['src/modules/generation/adapters/registry.ts', 'dist/modules/generation/adapters/registry.js']) {
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of ['video-fast-480p', 'video-fast-720p', 'video-pro-480p', 'video-pro-720p', 'sd2-preview']) {
    if (!text.includes(marker)) throw new Error(`${file} missing ${marker}`);
  }
}
console.log('[verify] admin api adapter ok');
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
