#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="sd2-internal-api-20260619025136"
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
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  for model in sd2-internal-dreamina-mini sd2-internal-transit9-fast sd2-internal-transit9-2-0; do
    backup_web_file "$web_dir" "models/${model}.json"
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/models/${model}.json" "$web_dir/models/${model}.json"
  done
  for rel in model-registry.json image-studio-canvas.html image-studio-canvas-next.html canvas-next/generator-adapters.js canvas-next/generation-service.js canvas-next/renderers.js; do
    backup_web_file "$web_dir" "$rel"
    if [[ -f "${WORK_DIR}/${PKG_NAME}/workbench-web/${rel}" ]]; then
      mkdir -p "$(dirname "$web_dir/$rel")"
      cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/${rel}" "$web_dir/$rel"
    fi
  done
}

copy_legacy_web_bundle() {
  local web_dir="$1"
  [[ -d "$web_dir" ]] || return 0
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  for model in sd2-internal-dreamina-mini sd2-internal-transit9-fast sd2-internal-transit9-2-0; do
    backup_web_file "$web_dir" "models/${model}.json"
    cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/models/${model}.json" "$web_dir/models/${model}.json"
  done
  for rel in model-registry.json image-studio-canvas.html canvas-next/generator-adapters.js canvas-next/generation-service.js canvas-next/renderers.js; do
    backup_web_file "$web_dir" "$rel"
    if [[ -f "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/${rel}" ]]; then
      mkdir -p "$(dirname "$web_dir/$rel")"
      cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/canvas/legacy-workbench/workbench-web/${rel}" "$web_dir/$rel"
    fi
  done
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts" "$BACKUP_DIR/web"

echo "[deploy] sync workbench files"
copy_common_web_bundle "$PUBLIC_WEB"
copy_common_web_bundle "${REPO_ROOT}/tools/workbench-web"
copy_common_web_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
copy_legacy_web_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  backup_file "${REPO_ROOT}/smart-vision/config/model-registry.json" "${BACKUP_DIR}/web/smart-vision-config-model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/config-model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi

echo "[deploy] install admin api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-sd2-internal-adapter.mjs" \
  "${API_ROOT}/scripts/patch-sd2-internal-adapter.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-sd2-internal-models.mjs" \
  "${API_ROOT}/scripts/apply-sd2-internal-models.mjs"

echo "[deploy] patch backend adapter and route"
(cd "$API_ROOT" && node scripts/patch-sd2-internal-adapter.mjs)

echo "[deploy] apply admin model config"
(cd "$API_ROOT" && node scripts/apply-sd2-internal-models.mjs)

echo "[deploy] verify static sd2 internal config"
node - <<'NODE'
const fs = require('fs');
const expected = new Map([
  ['sd2-internal-dreamina-mini', 'dreamina-mini'],
  ['sd2-internal-transit9-fast', 'transit9-fast'],
  ['sd2-internal-transit9-2-0', 'transit9-2.0'],
]);
for (const [key, realModel] of expected) {
  const file = `/var/www/ai-admin/workbench-web/models/${key}.json`;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(config.type || '').toLowerCase() !== 'video') throw new Error(`${key} type=${config.type}`);
  if (config.model !== realModel || config.name !== realModel) throw new Error(`${key} model mismatch`);
  if (config.adapter !== 'sd2-internal' || config.protocol?.adapter !== 'sd2-internal') throw new Error(`${key} adapter mismatch`);
  if (config.endpointPath !== '/sd2/generate') throw new Error(`${key} endpointPath=${config.endpointPath}`);
  if (config.statusEndpointPath !== '/sd2/task/{taskId}') throw new Error(`${key} statusEndpointPath=${config.statusEndpointPath}`);
  for (const ratio of ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9']) {
    if (!config.capabilities?.aspectRatios?.includes(ratio)) throw new Error(`${key} missing ratio ${ratio}`);
  }
  if (!config.capabilities?.durations?.includes(5) || !config.capabilities?.durations?.includes(15)) throw new Error(`${key} duration capability mismatch`);
}
const registry = fs.readFileSync('/var/www/ai-admin/workbench-web/model-registry.json', 'utf8');
for (const key of expected.keys()) {
  if (!registry.includes(`"configId": "${key}"`)) throw new Error(`registry missing ${key}`);
}
console.log('[verify] static sd2 internal config ok');
NODE

echo "[deploy] verify backend markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'sd2-internal'")) throw new Error(`${file} missing sd2-internal registry`);
  if (!text.includes('submitSd2InternalVideo')) throw new Error(`${file} missing submitSd2InternalVideo`);
  if (!text.includes('reference_videos')) throw new Error(`${file} missing reference_videos mapping`);
  if (!text.includes('audios')) throw new Error(`${file} missing audios mapping`);
}
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("return 'sd2-internal'")) throw new Error(`${file} missing sd2-internal route guard`);
  const sd2Index = text.indexOf("return 'sd2-internal'");
  const seedanceIndex = text.indexOf("return 'seedance2-sd'");
  if (seedanceIndex >= 0 && sd2Index > seedanceIndex) throw new Error(`${file} sd2-internal route guard is after seedance2-sd`);
}
console.log('[verify] backend sd2 internal markers ok');
NODE

echo "[deploy] verify admin db config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const expected = new Map([
  ['sd2-internal-dreamina-mini', 'dreamina-mini'],
  ['sd2-internal-transit9-fast', 'transit9-fast'],
  ['sd2-internal-transit9-2-0', 'transit9-2.0'],
]);
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: Array.from(expected.keys()) } },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
if (models.length !== expected.size) throw new Error(`expected ${expected.size} models, found ${models.length}`);
for (const model of models) {
  const realModel = expected.get(model.modelKey);
  if (model.type !== 'VIDEO') throw new Error(`${model.modelKey} type=${model.type}`);
  if (model.name !== realModel) throw new Error(`${model.modelKey} model=${model.name}`);
  if (model.adapter !== 'sd2-internal') throw new Error(`${model.modelKey} adapter=${model.adapter}`);
  if (model.endpointPath !== '/sd2/generate') throw new Error(`${model.modelKey} endpointPath=${model.endpointPath}`);
  if (model.statusEndpointPath !== '/sd2/task/{taskId}') throw new Error(`${model.modelKey} statusEndpointPath=${model.statusEndpointPath}`);
  if (!model.provider) throw new Error(`${model.modelKey} missing provider`);
  if (model.provider.providerKey !== 'canvas_sd2-internal') throw new Error(`${model.modelKey} provider=${model.provider.providerKey}`);
  if (model.provider.adapter !== 'sd2-internal') throw new Error(`${model.modelKey} provider adapter=${model.provider.adapter}`);
  if (!model.provider.apiKeyEncrypted) throw new Error(`${model.modelKey} provider missing key`);
  if (!model.capabilities?.aspectRatios?.includes('16:9') || !model.capabilities?.aspectRatios?.includes('9:16')) {
    throw new Error(`${model.modelKey} missing ratios`);
  }
  console.log(`[verify] ${model.modelKey} provider=${model.provider.providerKey} model=${model.name} unit=${model.unit} price=${model.salePrice}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
