#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="artifex-video-pro-1080p-fullchain-20260619230904"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
ADMIN_WEB="/var/www/ai-admin/ai-admin-platform/admin-web"
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
  mkdir -p "$web_dir/models" "$web_dir/canvas-next"
  for rel in \
    "models/sora-video-pro.json" \
    "models/seedance2-pro.json" \
    "model-registry.json" \
    "image-studio-canvas-next.html" \
    "image-studio-canvas.html" \
    "canvas-next/generation-service.js"; do
    backup_web_file "$web_dir" "$rel"
    mkdir -p "$(dirname "$web_dir/$rel")"
    cp -a "${WORK_DIR}/${PKG_NAME}/workbench-web/${rel}" "$web_dir/$rel"
  done
}

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts" "$BACKUP_DIR/web"

echo "[deploy] sync workbench files"
copy_workbench_bundle "$PUBLIC_WEB"
copy_workbench_bundle "${REPO_ROOT}/tools/workbench-web"
copy_workbench_bundle "${REPO_ROOT}/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web"
copy_workbench_bundle "${REPO_ROOT}/smart-vision/canvas/legacy-workbench/workbench-web"
if [[ -d "${REPO_ROOT}/smart-vision/config" ]]; then
  backup_file "${REPO_ROOT}/smart-vision/config/model-registry.json" "${BACKUP_DIR}/web/smart-vision-config-model-registry.json"
  cp -a "${WORK_DIR}/${PKG_NAME}/smart-vision/config/model-registry.json" "${REPO_ROOT}/smart-vision/config/model-registry.json"
fi

echo "[deploy] install admin api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-artifex-video-pro-1080p-adapter.mjs" \
  "${API_ROOT}/scripts/patch-artifex-video-pro-1080p-adapter.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-video-flat-billing.mjs" \
  "${API_ROOT}/scripts/patch-video-flat-billing.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/apply-artifex-video-pro-1080p-config.mjs" \
  "${API_ROOT}/scripts/apply-artifex-video-pro-1080p-config.mjs"

echo "[deploy] patch backend adapter"
(cd "$API_ROOT" && node scripts/patch-artifex-video-pro-1080p-adapter.mjs)

echo "[deploy] patch video flat billing"
(cd "$API_ROOT" && node scripts/patch-video-flat-billing.mjs)

echo "[deploy] apply admin model config"
(cd "$API_ROOT" && node scripts/apply-artifex-video-pro-1080p-config.mjs)

if [[ -f "${ADMIN_WEB}/src/main.tsx" ]]; then
  if grep -q "videoFlatTierPrices" "${ADMIN_WEB}/src/main.tsx"; then
    echo "[deploy] admin pricing ui already supports per-generation resolution tiers"
  else
    echo "[deploy] patch admin pricing ui"
    install -m 755 -D \
      "${WORK_DIR}/${PKG_NAME}/scripts/patch-video-flat-resolution-pricing-ui.mjs" \
      "${ADMIN_WEB}/scripts/patch-video-flat-resolution-pricing-ui.mjs"
    (cd "$ADMIN_WEB" && node scripts/patch-video-flat-resolution-pricing-ui.mjs && npm run build)
  fi
fi

echo "[deploy] verify static video-pro 1080p config"
node - <<'NODE'
const fs = require('fs');
const checks = [
  ['sora-video-pro', ['720p', '1080p'], 'sora-video-pro', 'video-pro-{resolution}'],
  ['seedance2-pro', ['480p', '720p', '1080p'], 'seedance2', 'video-pro-{resolution}'],
];
for (const [key, resolutions, adapter, template] of checks) {
  const file = `/var/www/ai-admin/workbench-web/models/${key}.json`;
  const model = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (String(model.type || '').toLowerCase() !== 'video') throw new Error(`${key} type=${model.type}`);
  if (model.model !== 'video-pro' && model.name !== 'video-pro') throw new Error(`${key} real model mismatch`);
  if (model.protocol?.adapter !== adapter && model.adapter !== adapter) throw new Error(`${key} adapter mismatch`);
  if (model.modelAssembly?.template !== template) throw new Error(`${key} template=${model.modelAssembly?.template}`);
  for (const resolution of resolutions) {
    if (!model.capabilities?.resolutions?.includes(resolution)) throw new Error(`${key} missing resolution ${resolution}`);
  }
  const tiers = model.defaults?.pricing?.resolutionTiers || [];
  if (!tiers.some(item => item.resolution === '1080p')) throw new Error(`${key} missing 1080p pricing tier`);
}
const html = fs.readFileSync('/var/www/ai-admin/workbench-web/image-studio-canvas-next.html', 'utf8');
if (!html.includes('allowArtifexVideo1080')) throw new Error('canvas next missing Artifex 1080p guard');
const service = fs.readFileSync('/var/www/ai-admin/workbench-web/canvas-next/generation-service.js', 'utf8');
if (!service.includes('assembleVideoRequestModelName')) throw new Error('generation service missing model assembly');
if (!service.includes("['480p','720p','1080p']")) throw new Error('generation service missing 1080p assembly allowlist');
const registry = fs.readFileSync('/var/www/ai-admin/workbench-web/model-registry.json', 'utf8');
if (!registry.includes('"identityKey": "artifex::video-pro"')) throw new Error('registry missing artifex::video-pro');
if (!registry.includes('"identityKey": "seedance2::video-pro"')) throw new Error('registry missing seedance2::video-pro');
console.log('[verify] static video-pro 1080p config ok');
NODE

echo "[deploy] verify backend adapter/billing markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('video-pro-1080p')) throw new Error(`${file} missing video-pro-1080p`);
  if (!text.includes("item === '1080p'")) throw new Error(`${file} missing 1080p resolution parsing`);
  if (!text.includes("quality !== 'pro' && requested === '1080p'")) throw new Error(`${file} missing fast 1080p guard`);
}
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/billing.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/billing.js',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('videoFlatPriceForInput(model, input)')) throw new Error(`${file} missing input-aware flat billing`);
  if (!text.includes('resolutionTiers')) throw new Error(`${file} missing resolution tier billing`);
}
console.log('[verify] backend video-pro 1080p markers ok');
NODE

echo "[deploy] verify admin db config"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const expected = new Map([
  ['sora-video-pro', { adapter: 'sora-video-pro', unit: 'second', resolutions: ['720p', '1080p'] }],
  ['seedance2-pro', { adapter: 'seedance2', unit: 'generation', resolutions: ['480p', '720p', '1080p'] }],
]);
const models = await prisma.aiModel.findMany({
  where: { modelKey: { in: Array.from(expected.keys()) } },
  include: { provider: true },
  orderBy: { modelKey: 'asc' },
});
if (models.length !== expected.size) throw new Error(`expected ${expected.size} models, found ${models.length}`);
for (const model of models) {
  const info = expected.get(model.modelKey);
  if (model.type !== 'VIDEO') throw new Error(`${model.modelKey} type=${model.type}`);
  if (model.name !== 'video-pro') throw new Error(`${model.modelKey} name=${model.name}`);
  if (model.adapter !== info.adapter) throw new Error(`${model.modelKey} adapter=${model.adapter}`);
  if (model.unit !== info.unit) throw new Error(`${model.modelKey} unit=${model.unit}`);
  if (model.modelAssembly?.template !== 'video-pro-{resolution}') throw new Error(`${model.modelKey} template=${model.modelAssembly?.template}`);
  for (const resolution of info.resolutions) {
    if (!model.capabilities?.resolutions?.includes(resolution)) throw new Error(`${model.modelKey} missing resolution ${resolution}`);
  }
  const tiers = model.defaults?.pricing?.resolutionTiers || [];
  if (!tiers.some(item => item.resolution === '1080p')) throw new Error(`${model.modelKey} missing 1080p pricing tier`);
  if (!model.provider) throw new Error(`${model.modelKey} missing provider`);
  if (!model.provider.apiKeyEncrypted) throw new Error(`${model.modelKey} provider missing key`);
  console.log(`[verify] ${model.modelKey} provider=${model.provider.providerKey} model=${model.name} unit=${model.unit}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
