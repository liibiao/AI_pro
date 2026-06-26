#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?archive path required}"
APP_DIR="/var/www/ai-admin"
WORK_DIR="$(mktemp -d)"
BACKUP_DIR="${APP_DIR}/backups/sd2-preview-resolution-model-fix-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${WORK_DIR}" "${BACKUP_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${WORK_DIR}"

SRC_FILE="${WORK_DIR}/api-server/src/modules/generation/adapters/registry.ts"
DIST_FILE="${WORK_DIR}/api-server/dist/modules/generation/adapters/registry.js"

test -f "${SRC_FILE}"
test -f "${DIST_FILE}"

grep -q "function resolveSeedance2ModelByResolution" "${SRC_FILE}"
grep -q "sd2-\${requestedResolution}-\${sd2Variant\\[1\\]\\.toLowerCase()}" "${SRC_FILE}"
grep -q "function resolveSeedance2ModelByResolution" "${DIST_FILE}"
grep -q "sd2-\${requestedResolution}-\${sd2Variant\\[1\\]\\.toLowerCase()}" "${DIST_FILE}"

mkdir -p \
  "${APP_DIR}/api-server/src/modules/generation/adapters" \
  "${APP_DIR}/api-server/dist/modules/generation/adapters"

if [ -f "${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts" ]; then
  cp -a "${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts" "${BACKUP_DIR}/registry.ts.bak"
fi
if [ -f "${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js" ]; then
  cp -a "${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js" "${BACKUP_DIR}/registry.js.bak"
fi

install -m 0644 "${SRC_FILE}" "${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts"
install -m 0644 "${DIST_FILE}" "${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ai-admin-api || pm2 restart 0 || true
  pm2 status ai-admin-api || pm2 status 0 || true
else
  systemctl restart ai-admin-api || true
fi

echo "SD2 preview resolution model fix deployed."
echo "Backup: ${BACKUP_DIR}"
