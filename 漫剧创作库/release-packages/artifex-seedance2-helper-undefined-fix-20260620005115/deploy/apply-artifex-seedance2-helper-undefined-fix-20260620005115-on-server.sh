#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="artifex-seedance2-helper-undefined-fix-20260620005115"
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
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/patch-artifex-seedance2-helper.mjs" \
  "${API_ROOT}/scripts/patch-artifex-seedance2-helper.mjs"

echo "[deploy] patch backend helper"
(cd "$API_ROOT" && node scripts/patch-artifex-seedance2-helper.mjs)

echo "[deploy] verify helper markers"
node - <<'NODE'
const fs = require('fs');
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
]) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('function isArtifexSeedance2ModelName')) throw new Error(`${file} missing isArtifexSeedance2ModelName`);
  if (!text.includes('function isArtifexSeedance2Channel')) throw new Error(`${file} missing isArtifexSeedance2Channel`);
  if (!text.includes('video-pro-1080p')) throw new Error(`${file} missing video-pro-1080p`);
  if (!text.includes('artifex-seedance2')) throw new Error(`${file} missing artifex provider check`);
  const callIndex = text.indexOf('isArtifexSeedance2Channel(ctx, modelName)');
  const defIndex = text.indexOf('function isArtifexSeedance2Channel');
  if (callIndex < 0 || defIndex < 0) throw new Error(`${file} missing call/definition`);
}
console.log('[verify] helper markers ok');
NODE

echo "[deploy] check dist js syntax"
node --check "${API_ROOT}/dist/modules/generation/adapters/registry.js"

echo "[deploy] restart pm2: ai-admin-api"
sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null && pm2 status ai-admin-api --no-color | sed -n '1,6p'"

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
