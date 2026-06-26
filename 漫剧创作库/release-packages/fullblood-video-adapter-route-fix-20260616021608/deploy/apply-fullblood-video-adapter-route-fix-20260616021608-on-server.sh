#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-adapter-route-fix-20260616021608"
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

backup_file() {
  local target="$1"
  local backup="$2"
  if [[ -f "$target" ]]; then
    mkdir -p "$(dirname "$backup")"
    cp -a "$target" "$backup"
  fi
}

backup_web_file() {
  local web_dir="$1"
  local rel="$2"
  backup_file "$web_dir/$rel" "$BACKUP_DIR/web/${web_dir//\//_}/$rel"
}

copy_common_web_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/canvas-next"
  backup_web_file "$web_dir" "canvas-next/generation-service.js"
  backup_web_file "$web_dir" "image-studio-canvas-next.html"
  backup_web_file "$web_dir" "image-studio-canvas.html"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/canvas-next/generation-service.js" "$web_dir/canvas-next/generation-service.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas.html" "$web_dir/image-studio-canvas.html"
  if [[ -f "$web_dir/image-studio-canvas-next.html" || "$web_dir" == "$PUBLIC_WEB" || "$web_dir" == "${REPO_ROOT}/tools/workbench-web" ]]; then
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/image-studio-canvas-next.html" "$web_dir/image-studio-canvas-next.html"
  fi
}

copy_smart_legacy_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/canvas-next"
  backup_web_file "$web_dir" "canvas-next/generation-service.js"
  backup_web_file "$web_dir" "image-studio-canvas.html"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$web_dir/canvas-next/generation-service.js"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$web_dir/image-studio-canvas.html"
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts" "$BACKUP_DIR/web"

echo "[deploy] sync workbench frontend files"
copy_common_web_bundle "$PUBLIC_WEB"
copy_common_web_bundle "${REPO_ROOT}/tools/workbench-web"
copy_common_web_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
copy_smart_legacy_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"

echo "[deploy] install admin api script"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-route-adapter.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-route-adapter.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/repair-fullblood-video-models.mjs" \
  "${API_ROOT}/scripts/repair-fullblood-video-models.mjs"

echo "[deploy] patch backend route adapter resolver"
(cd "$API_ROOT" && node scripts/patch-fullblood-route-adapter.mjs)

echo "[deploy] repair fullblood model/provider binding"
(cd "$API_ROOT" && node scripts/repair-fullblood-video-models.mjs)

echo "[deploy] verify frontend markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/workbench-web/canvas-next/generation-service.js',
  '/var/www/ai-admin/workbench-web/image-studio-canvas-next.html',
  '/var/www/ai-admin/workbench-web/image-studio-canvas.html',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.includes('image-studio-canvas.html')) {
    if (!text.includes('usesFullbloodVideo')) throw new Error(`${file} missing usesFullbloodVideo branch`);
  } else if (!text.includes('isFullbloodVideoModel')) {
    throw new Error(`${file} missing isFullbloodVideoModel`);
  }
  if (!text.includes('fullblood-video')) throw new Error(`${file} missing fullblood-video marker`);
  if (file.includes('generation-service.js') && !text.includes('usesSeedance2=!usesFullbloodVideo')) {
    throw new Error(`${file} still allows fullblood as seedance2`);
  }
}
console.log('[verify] frontend markers ok');
NODE

echo "[deploy] verify backend route markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("return 'fullblood-video'")) throw new Error(`${file} missing fullblood route return`);
  if (!text.includes('canvas_fullblood-video')) throw new Error(`${file} missing canvas_fullblood-video guard`);
  const routeIndex = text.indexOf("return 'fullblood-video'");
  const seedanceIndex = text.indexOf("return 'seedance2'");
  if (seedanceIndex >= 0 && routeIndex > seedanceIndex) throw new Error(`${file} fullblood guard is after seedance2 guard`);
}
console.log('[verify] backend route markers ok');
NODE

echo "[deploy] verify admin db adapter config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: ['canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2'] } },
      { modelKey: { in: ['fullblood-seedance-2', 'fullblood-omni-video-2', 'canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2'] } },
    ],
  },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
if (models.length !== 2) throw new Error(`expected 2 fullblood models, found ${models.length}`);
for (const model of models) {
  if (model.adapter !== 'fullblood-video') throw new Error(`${model.modelKey} model adapter=${model.adapter}`);
  if (model.provider?.adapter !== 'fullblood-video') throw new Error(`${model.modelKey} provider adapter=${model.provider?.adapter}`);
  if (model.provider?.providerKey !== 'canvas_fullblood-video') throw new Error(`${model.modelKey} provider=${model.provider?.providerKey}`);
  console.log(`[verify] ${model.modelKey} modelAdapter=${model.adapter} providerAdapter=${model.provider.adapter}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
