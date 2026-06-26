#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-aspectratio-payload-fix-20260619223030"
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
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-aspectratio-payload.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-aspectratio-payload.mjs"

echo "[deploy] patch fullblood aspectRatio payload"
(cd "$API_ROOT" && node scripts/patch-fullblood-aspectratio-payload.mjs)

echo "[deploy] verify fullblood payload fields"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('async function submitFullbloodVideo');
  const end = text.indexOf('async function queryFullbloodVideo', start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${file} could not isolate submitFullbloodVideo`);
  const body = text.slice(start, end);
  if (!body.includes('FULLBLOOD_VIDEO_ASPECT_RATIO_PAYLOAD')) throw new Error(`${file} missing aspectRatio marker`);
  if (!body.includes('aspectRatio: resolveFullbloodVideoAspectRatio(ctx)')) throw new Error(`${file} missing camelCase aspectRatio`);
  for (const forbidden of ['extra_images', 'extraImages', 'reference_image_urls', 'referenceImageUrls', 'aspect_ratio:']) {
    if (body.includes(forbidden)) throw new Error(`${file} fullblood body contains forbidden upstream field ${forbidden}`);
  }
  for (const required of ['model:', 'prompt:', 'size:', 'seconds:', 'images: imageUrls']) {
    if (!body.includes(required)) throw new Error(`${file} fullblood body missing ${required}`);
  }
}
console.log('[verify] fullblood payload fields ok');
NODE

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
