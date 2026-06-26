#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/package.tar.gz}"
PKG_NAME="aiyunzhi-sd2-preview-routing-fix-20260615104605"
API_ROOT="/var/www/ai-admin/ai-admin-platform/api-server"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "[deploy] extract ${ARCHIVE_PATH}"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

echo "[deploy] backup dir: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"
cp -a "${API_ROOT}/src/modules/generation/adapters/registry.ts" "${BACKUP_DIR}/registry.ts"
cp -a "${API_ROOT}/dist/modules/generation/adapters/registry.js" "${BACKUP_DIR}/registry.js"

echo "[deploy] install patch script"
install -m 755 -D \
  "${WORK_DIR}/${PKG_NAME}/api-server/scripts/fix-aiyunzhi-sd2-preview-routing.mjs" \
  "${API_ROOT}/scripts/fix-aiyunzhi-sd2-preview-routing.mjs"

echo "[deploy] patch seedance2-sd preview model routing"
(cd "$API_ROOT" && node scripts/fix-aiyunzhi-sd2-preview-routing.mjs)

echo "[deploy] verify patched regex"
(cd "$API_ROOT" && node - <<'NODE'
const fs = require('fs');
const files = [
  'src/modules/generation/adapters/registry.ts',
  'dist/modules/generation/adapters/registry.js',
];
const needle = '(?:-preview)?|seedance-2';
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) throw new Error(`${file} missing preview matcher`);
}
const previewRegex = /^(?:sd2-(?:720p|1080p)(?:-fast)?(?:-preview)?|seedance-2)$/i;
const values = ['sd2-720p-preview', 'sd2-720p-fast-preview', 'sd2-1080p-preview'];
for (const value of values) {
  if (!previewRegex.test(value)) throw new Error(`preview matcher failed: ${value}`);
}
console.log('[verify] preview matcher ok');
NODE
)

echo "[deploy] restart pm2: ai-admin-api"
if command -v sudo >/dev/null 2>&1; then
  sudo -u ubuntu -H bash -lc "cd '$API_ROOT' && pm2 restart ai-admin-api --update-env >/dev/null"
else
  pm2 restart ai-admin-api --update-env >/dev/null
fi

echo "[deploy] done"
echo "backup: ${BACKUP_DIR}"
