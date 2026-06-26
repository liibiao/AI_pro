#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="artifex-seedance2-resolve-1080-fix-20260620010100"
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

echo "[deploy] install patch script"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-artifex-seedance2-resolve-1080.mjs" \
  "${API_ROOT}/scripts/patch-artifex-seedance2-resolve-1080.mjs"

echo "[deploy] patch resolveSeedance2ModelName"
(cd "$API_ROOT" && node scripts/patch-artifex-seedance2-resolve-1080.mjs)

echo "[deploy] verify resolve markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('function resolveSeedance2ModelName');
  const end = text.indexOf('\nfunction isArtifexSeedance2ModelName', start);
  if (start < 0 || end < 0) throw new Error(`${file} missing resolve/helper boundary`);
  const body = text.slice(start, end);
  if (!body.includes('video-pro-1080p')) throw new Error(`${file} missing video-pro-1080p`);
  if (!body.includes("item === '1080p'")) throw new Error(`${file} missing 1080p resolution parsing`);
  if (!body.includes("quality !== 'pro' && requested === '1080p'")) throw new Error(`${file} missing fast 1080 guard`);
  if (!text.includes('function isArtifexSeedance2Channel')) throw new Error(`${file} missing helper`);
}
console.log('[verify] resolve markers ok');
NODE

echo "[deploy] check dist js syntax"
node --check "${API_ROOT}/dist/modules/generation/adapters/registry.js"

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
