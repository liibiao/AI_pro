#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-registry-adapter-fix-20260619213051"
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

echo "[deploy] install admin api script"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-adapter-registry.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-adapter-registry.mjs"

echo "[deploy] patch fullblood adapter registry"
(cd "$API_ROOT" && node scripts/patch-fullblood-adapter-registry.mjs)

echo "[deploy] verify fullblood adapter registry"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes("'fullblood-video'")) throw new Error(`${file} missing fullblood-video registry entry`);
  if (!text.includes('submitFullbloodVideo')) throw new Error(`${file} missing submitFullbloodVideo`);
  if (!text.includes('queryFullbloodVideo')) throw new Error(`${file} missing queryFullbloodVideo`);
  if (!text.includes('FULLBLOOD_VIDEO_REGISTRY_ADAPTER')) throw new Error(`${file} missing fullblood adapter marker`);
  const start = text.indexOf('async function submitFullbloodVideo');
  const end = text.indexOf('async function submitGenericVideo', start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${file} could not isolate submitFullbloodVideo body`);
  const body = text.slice(start, end);
  for (const forbidden of ['extra_images', 'extraImages', 'reference_image_urls', 'referenceImageUrls', 'aspectRatio:', 'aspect_ratio:']) {
    if (body.includes(forbidden)) throw new Error(`${file} fullblood body still contains forbidden upstream field ${forbidden}`);
  }
  for (const required of ['model:', 'prompt:', 'size:', 'seconds:', 'images: imageUrls']) {
    if (!body.includes(required)) throw new Error(`${file} fullblood body missing ${required}`);
  }
}
console.log('[verify] fullblood adapter registry ok');
NODE

echo "[deploy] verify db binding is still fullblood"
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
  orderBy: { id: 'asc' },
});
if (models.length < 2) throw new Error(`expected at least 2 fullblood models, found ${models.length}`);
for (const model of models) {
  if (model.adapter !== 'fullblood-video') throw new Error(`${model.id} model adapter=${model.adapter}`);
  if (model.provider?.adapter !== 'fullblood-video') throw new Error(`${model.id} provider adapter=${model.provider?.adapter}`);
  if (model.provider?.providerKey !== 'canvas_fullblood-video') throw new Error(`${model.id} provider=${model.provider?.providerKey}`);
  console.log(`[verify] ${model.id} real=${model.name} adapter=${model.adapter} provider=${model.provider.providerKey}`);
}
await prisma.$disconnect();
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
