#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-ratio-baseurl-20260616020623"
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

copy_workbench_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models"
  backup_web_file "$web_dir" "models/fullblood-seedance-2.json"
  backup_web_file "$web_dir" "models/fullblood-omni-video-2.json"
  backup_web_file "$web_dir" "model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/fullblood-seedance-2.json" "$web_dir/models/fullblood-seedance-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/fullblood-omni-video-2.json" "$web_dir/models/fullblood-omni-video-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/model-registry.json" "$web_dir/model-registry.json"
}

copy_smart_legacy_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models"
  backup_web_file "$web_dir" "models/fullblood-seedance-2.json"
  backup_web_file "$web_dir" "models/fullblood-omni-video-2.json"
  backup_web_file "$web_dir" "model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/models/fullblood-seedance-2.json" "$web_dir/models/fullblood-seedance-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/models/fullblood-omni-video-2.json" "$web_dir/models/fullblood-omni-video-2.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$web_dir/model-registry.json"
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts" "$BACKUP_DIR/web"

echo "[deploy] sync workbench model configs"
copy_workbench_bundle "$PUBLIC_WEB"
copy_workbench_bundle "${REPO_ROOT}/tools/workbench-web"
copy_workbench_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
copy_smart_legacy_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  backup_file "${REPO_ROOT}/smart-vision/config/model-registry.json" "${BACKUP_DIR}/web/smart-vision-config-model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/config-model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi

echo "[deploy] install admin api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-video-ratios.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-video-ratios.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-fullblood-video-ratio-baseurl.mjs" \
  "${API_ROOT}/scripts/apply-fullblood-video-ratio-baseurl.mjs"

echo "[deploy] patch backend ratio mapping"
(cd "$API_ROOT" && node scripts/patch-fullblood-video-ratios.mjs)

echo "[deploy] apply admin model config"
(cd "$API_ROOT" && node scripts/apply-fullblood-video-ratio-baseurl.mjs)

echo "[deploy] verify static fullblood video config"
node - <<'NODE'
const fs = require('fs');
const expectedRatios = ['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'];
const expectedSizes = {
  '9:16': '720x1280',
  '16:9': '1280x720',
  '4:3': '960x720',
  '3:4': '720x960',
  '1:1': '720x720',
  '21:9': '1680x720',
};
for (const key of ['fullblood-seedance-2', 'fullblood-omni-video-2']) {
  const file = `/var/www/ai-admin/workbench-web/models/${key}.json`;
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (model.baseUrl !== 'https://hongniaoai.com/v1') throw new Error(`${key} baseUrl=${model.baseUrl}`);
  if (model.url !== 'https://hongniaoai.com/v1/videos') throw new Error(`${key} url=${model.url}`);
  const ratios = model.capabilities?.aspectRatios || [];
  for (const ratio of expectedRatios) {
    if (!ratios.includes(ratio)) throw new Error(`${key} missing ratio ${ratio}`);
    if (model.protocol?.sizeByAspectRatio?.[ratio] !== expectedSizes[ratio]) {
      throw new Error(`${key} size ${ratio}=${model.protocol?.sizeByAspectRatio?.[ratio]}`);
    }
  }
}
console.log('[verify] static ratio/baseUrl config ok');
NODE

echo "[deploy] verify backend ratio mapper"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("ctx.params.requestedRatio, ['9:16', '16:9', '4:3', '3:4', '1:1', '21:9']")) {
    throw new Error(`${file} missing fullblood allowed ratio list`);
  }
  for (const marker of ["'4:3'", "'3:4'", "'1:1'", "'21:9'", '1680x720']) {
    if (!text.includes(marker)) throw new Error(`${file} missing ${marker}`);
  }
}
console.log('[verify] backend ratio mapper ok');
NODE

echo "[deploy] verify admin db config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const expectedRatios = ['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'];
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: ['fullblood-seedance-2', 'fullblood-omni-video-2'] } },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
if (models.length !== 2) throw new Error(`expected 2 models, found ${models.length}`);
for (const model of models) {
  if (model.provider?.baseUrl !== 'https://hongniaoai.com/v1') throw new Error(`${model.modelKey} provider baseUrl=${model.provider?.baseUrl}`);
  const ratios = model.capabilities?.aspectRatios || [];
  for (const ratio of expectedRatios) {
    if (!ratios.includes(ratio)) throw new Error(`${model.modelKey} missing ratio ${ratio}`);
  }
  if (model.protocol?.sizeByAspectRatio?.['21:9'] !== '1680x720') throw new Error(`${model.modelKey} missing 21:9 size`);
  console.log(`[verify] ${model.modelKey} baseUrl=${model.provider.baseUrl} ratios=${ratios.join(',')}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
