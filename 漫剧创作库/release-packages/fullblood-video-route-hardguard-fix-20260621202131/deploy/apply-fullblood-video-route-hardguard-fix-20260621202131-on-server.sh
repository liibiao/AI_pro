#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-route-hardguard-fix-20260621202131"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
REPO_ROOT="/home/ubuntu/漫剧创作库"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR/api/scripts"

echo "[deploy] install admin api scripts"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-route-hardguard.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-route-hardguard.mjs"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/repair-fullblood-route-hardguard-binding.mjs" \
  "${API_ROOT}/scripts/repair-fullblood-route-hardguard-binding.mjs"

echo "[deploy] preflight fullblood adapter registry"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'fullblood-video'") || !text.includes('submitFullbloodVideo')) {
    throw new Error(`${file} missing fullblood-video adapter; deploy fullblood-video-registry-adapter-fix-20260619213051 first`);
  }
  const start = text.indexOf('async function submitFullbloodVideo');
  const end = text.indexOf('async function queryFullbloodVideo', start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${file} could not isolate submitFullbloodVideo`);
  const body = text.slice(start, end);
  for (const forbidden of ['extra_images', 'extraImages', 'reference_image_urls', 'referenceImageUrls', 'aspect_ratio:']) {
    if (body.includes(forbidden)) throw new Error(`${file} fullblood body contains forbidden upstream field ${forbidden}`);
  }
  for (const required of ['model:', 'prompt:', 'size:', 'seconds:', 'images: imageUrls']) {
    if (!body.includes(required)) throw new Error(`${file} fullblood body missing ${required}`);
  }
}
console.log('[preflight] fullblood adapter registry ok');
NODE

echo "[deploy] patch fullblood route hard guard"
(cd "$API_ROOT" && node scripts/patch-fullblood-route-hardguard.mjs)

echo "[deploy] repair fullblood provider/model binding"
(cd "$API_ROOT" && node scripts/repair-fullblood-route-hardguard-binding.mjs)

echo "[deploy] verify route hard guard"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/routes.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/routes.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('FULLBLOOD_ROUTE_HARD_GUARD')) throw new Error(`${file} missing fullblood hard guard marker`);
  if (!text.includes("return 'fullblood-video'")) throw new Error(`${file} missing fullblood route return`);
  const fnStart = text.indexOf('function resolveGenerationAdapterName');
  if (fnStart < 0) throw new Error(`${file} missing resolveGenerationAdapterName`);
  const fnEndCandidates = [
    text.indexOf('\nfunction ', fnStart + 1),
    text.indexOf('\nasync function ', fnStart + 1),
    text.length,
  ].filter(index => index > fnStart);
  const fnEnd = Math.min(...fnEndCandidates);
  const body = text.slice(fnStart, fnEnd);
  const hardIndex = body.indexOf('FULLBLOOD_ROUTE_HARD_GUARD');
  const seedanceIndex = body.indexOf("return 'seedance2'");
  const soraIndex = body.indexOf("return 'sora-video'");
  const soraProIndex = body.indexOf("return 'sora-video-pro'");
  if (hardIndex < 0) throw new Error(`${file} guard not inside resolveGenerationAdapterName`);
  for (const [label, index] of [['seedance2', seedanceIndex], ['sora-video', soraIndex], ['sora-video-pro', soraProIndex]]) {
    if (index >= 0 && hardIndex > index) throw new Error(`${file} fullblood guard is after ${label}`);
  }
  for (const expected of ['canvas_fullblood-video', 'fullblood-omni-video-2', '全能视频2.0(线路s)']) {
    if (!body.includes(expected)) throw new Error(`${file} hard guard missing ${expected}`);
  }
}
console.log('[verify] route hard guard ok');
NODE

echo "[deploy] verify admin db binding"
(cd "$API_ROOT" && node --input-type=module - <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const models = await prisma.aiModel.findMany({
  where: {
    type: 'VIDEO',
    OR: [
      { id: { in: ['canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2', 'fullblood-seedance-2', 'fullblood-omni-video-2'] } },
      { modelKey: { in: ['fullblood-seedance-2', 'fullblood-omni-video-2', 'canvas-fullblood-seedance-2', 'canvas-fullblood-omni-video-2'] } },
      { modelKey: { contains: 'fullblood', mode: 'insensitive' } },
    ],
  },
  include: { provider: true },
  orderBy: { id: 'asc' },
});
if (models.length < 2) throw new Error(`expected at least 2 fullblood models, found ${models.length}`);
for (const model of models) {
  if (model.type !== 'VIDEO') throw new Error(`${model.id} type=${model.type}`);
  if (model.adapter !== 'fullblood-video') throw new Error(`${model.id} adapter=${model.adapter}`);
  if (model.endpointPath !== '/videos') throw new Error(`${model.id} endpointPath=${model.endpointPath}`);
  if (model.statusEndpointPath !== '/videos/{taskId}') throw new Error(`${model.id} statusEndpointPath=${model.statusEndpointPath}`);
  if (model.protocol?.adapter !== 'fullblood-video') throw new Error(`${model.id} protocol adapter=${model.protocol?.adapter}`);
  if (model.provider?.providerKey !== 'canvas_fullblood-video') throw new Error(`${model.id} provider=${model.provider?.providerKey}`);
  if (model.provider?.adapter !== 'fullblood-video') throw new Error(`${model.id} provider adapter=${model.provider?.adapter}`);
  if (!model.provider?.apiKeyEncrypted) throw new Error(`${model.id} provider missing key`);
  console.log(`[verify] ${model.id} real=${model.name} modelAdapter=${model.adapter} providerAdapter=${model.provider.adapter}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
