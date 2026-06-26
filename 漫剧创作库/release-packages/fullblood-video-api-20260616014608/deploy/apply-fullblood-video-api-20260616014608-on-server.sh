#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-api-20260616014608"
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
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-video-adapter.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-video-adapter.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-video-flat-billing.mjs" \
  "${API_ROOT}/scripts/patch-video-flat-billing.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-fullblood-video-models.mjs" \
  "${API_ROOT}/scripts/apply-fullblood-video-models.mjs"

echo "[deploy] patch backend adapter"
(cd "$API_ROOT" && node scripts/patch-fullblood-video-adapter.mjs)

echo "[deploy] patch video flat billing"
(cd "$API_ROOT" && node scripts/patch-video-flat-billing.mjs)

echo "[deploy] apply admin model config"
(cd "$API_ROOT" && node scripts/apply-fullblood-video-models.mjs)

echo "[deploy] verify static fullblood video config"
node - <<'NODE'
const fs = require('fs');
const expected = new Map([
  ['fullblood-seedance-2', { model: 'seedance-2.0(满血)', price: 700 }],
  ['fullblood-omni-video-2', { model: '全能视频2.0(满血J)', price: 450 }],
]);
for (const [key, info] of expected) {
  const file = `/var/www/ai-admin/workbench-web/models/${key}.json`;
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(model.type || '').toLowerCase() !== 'video') throw new Error(`${key} type=${model.type}`);
  if (model.model !== info.model || model.name !== info.model) throw new Error(`${key} real model mismatch`);
  if (model.protocol?.adapter !== 'fullblood-video') throw new Error(`${key} adapter=${model.protocol?.adapter}`);
  if (model.endpointPath !== '/videos') throw new Error(`${key} endpointPath=${model.endpointPath}`);
  if (model.statusEndpointPath !== '/videos/{taskId}') throw new Error(`${key} statusEndpointPath=${model.statusEndpointPath}`);
  if (!model.capabilities?.durations?.includes(15)) throw new Error(`${key} missing 15s`);
  for (const ratio of ['16:9', '9:16']) {
    if (!model.capabilities?.aspectRatios?.includes(ratio)) throw new Error(`${key} missing ratio ${ratio}`);
  }
  const price = Number(model.defaults?.pricing?.memberCreditsPerGeneration);
  if (price !== info.price) throw new Error(`${key} price=${price}`);
}
const registry = fs.readFileSync('/var/www/ai-admin/workbench-web/model-registry.json', 'utf8');
for (const key of expected.keys()) {
  if (!registry.includes(`"configId": "${key}"`)) throw new Error(`registry missing ${key}`);
}
console.log('[verify] static fullblood video config ok');
NODE

echo "[deploy] verify backend adapter/billing markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'fullblood-video'")) throw new Error(`${file} missing fullblood-video registry`);
  if (!text.includes('async function submitFullbloodVideo')) throw new Error(`${file} missing submitFullbloodVideo`);
  if (!text.includes('size: configuredSize || fullbloodVideoSize(aspectRatio)')) throw new Error(`${file} missing size mapping`);
  if (!text.includes('seconds: String(seconds)')) throw new Error(`${file} missing fixed seconds`);
}
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/billing.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/billing.ts',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('videoFlatPriceForInput(model, input)')) throw new Error(`${file} missing video flat billing input`);
  if (!text.includes('memberCreditsPerGeneration')) throw new Error(`${file} missing per generation pricing`);
}
console.log('[verify] backend markers ok');
NODE

echo "[deploy] verify admin db config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const expected = new Map([
  ['fullblood-seedance-2', { model: 'seedance-2.0(满血)', price: 700 }],
  ['fullblood-omni-video-2', { model: '全能视频2.0(满血J)', price: 450 }],
]);
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: Array.from(expected.keys()) } },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
if (models.length !== expected.size) throw new Error(`expected ${expected.size} models, found ${models.length}`);
for (const model of models) {
  const info = expected.get(model.modelKey);
  if (!info) throw new Error(`unexpected modelKey ${model.modelKey}`);
  if (model.type !== 'VIDEO') throw new Error(`${model.modelKey} type=${model.type}`);
  if (model.name !== info.model) throw new Error(`${model.modelKey} model=${model.name}`);
  if (model.adapter !== 'fullblood-video') throw new Error(`${model.modelKey} adapter=${model.adapter}`);
  if (Number(model.salePrice) !== info.price) throw new Error(`${model.modelKey} salePrice=${model.salePrice}`);
  if (model.endpointPath !== '/videos') throw new Error(`${model.modelKey} endpointPath=${model.endpointPath}`);
  if (model.statusEndpointPath !== '/videos/{taskId}') throw new Error(`${model.modelKey} statusEndpointPath=${model.statusEndpointPath}`);
  if (!model.provider) throw new Error(`${model.modelKey} missing provider`);
  if (model.provider.type !== 'VIDEO') throw new Error(`${model.modelKey} provider type=${model.provider.type}`);
  if (model.provider.adapter !== 'fullblood-video') throw new Error(`${model.modelKey} provider adapter=${model.provider.adapter}`);
  if (!model.provider.apiKeyEncrypted) throw new Error(`${model.modelKey} provider missing key`);
  if (!model.capabilities?.durations?.includes(15)) throw new Error(`${model.modelKey} missing 15s capability`);
  if (!model.capabilities?.aspectRatios?.includes('16:9') || !model.capabilities?.aspectRatios?.includes('9:16')) {
    throw new Error(`${model.modelKey} missing aspect ratio capability`);
  }
  console.log(`[verify] ${model.modelKey} provider=${model.provider.providerKey} model=${model.name} price=${model.salePrice}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
