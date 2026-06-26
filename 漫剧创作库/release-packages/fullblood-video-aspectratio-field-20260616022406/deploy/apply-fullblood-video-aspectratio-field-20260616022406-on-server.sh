#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="fullblood-video-aspectratio-field-20260616022406"
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
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-fullblood-video-aspectratio-field.mjs" \
  "${API_ROOT}/scripts/patch-fullblood-video-aspectratio-field.mjs"

echo "[deploy] patch fullblood video request aspectRatio"
(cd "$API_ROOT" && node scripts/patch-fullblood-video-aspectratio-field.mjs)

echo "[deploy] verify fullblood requestJson aspectRatio"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('async function submitFullbloodVideo')) throw new Error(`${file} missing submitFullbloodVideo`);
  const compact = text.replace(/\r/g, '');
  const ok = compact.includes('size: configuredSize || fullbloodVideoSize(aspectRatio),\n    aspectRatio,\n    seconds: String(seconds),')
    || compact.includes('size: configuredSize || fullbloodVideoSize(aspectRatio),\n        aspectRatio,\n        seconds: String(seconds),');
  if (!ok) throw new Error(`${file} missing top-level aspectRatio in fullblood requestJson`);
}
console.log('[verify] fullblood aspectRatio request field ok');
NODE

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
