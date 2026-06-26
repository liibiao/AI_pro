#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?archive path required}"
APP_DIR="/var/www/ai-admin"
WORK_DIR="$(mktemp -d)"
BACKUP_DIR="${APP_DIR}/backups/seedance-full-status-query-15-retries-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${WORK_DIR}" "${BACKUP_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${WORK_DIR}"

REGISTRY_SRC="${WORK_DIR}/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="${WORK_DIR}/api-server/dist/modules/generation/adapters/registry.js"

test -f "${REGISTRY_SRC}"
test -f "${REGISTRY_DIST}"

grep -q "SEEDANCE_FULL_RESILIENT_STATUS_HOST" "${REGISTRY_SRC}"
grep -q "30000" "${REGISTRY_SRC}"
grep -q "seedanceFullTransientRunningResult" "${REGISTRY_SRC}"
grep -q "SEEDANCE_FULL_RESILIENT_STATUS_HOST" "${REGISTRY_DIST}"
grep -q "30000" "${REGISTRY_DIST}"
grep -q "seedanceFullTransientRunningResult" "${REGISTRY_DIST}"

mkdir -p \
  "${APP_DIR}/api-server/src/modules/generation/adapters" \
  "${APP_DIR}/api-server/dist/modules/generation/adapters"

for file in \
  "api-server/src/modules/generation/adapters/registry.ts" \
  "api-server/dist/modules/generation/adapters/registry.js"; do
  if [ -f "${APP_DIR}/${file}" ]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${file}")"
    cp -a "${APP_DIR}/${file}" "${BACKUP_DIR}/${file}.bak"
  fi
done

install -m 0644 "${REGISTRY_SRC}" "${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts"
install -m 0644 "${REGISTRY_DIST}" "${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js"

if command -v pm2 >/dev/null 2>&1; then
  sudo -H -u ubuntu bash -lc 'pm2 restart ai-admin-api --update-env' \
    || pm2 restart ai-admin-api --update-env \
    || pm2 restart 0 --update-env \
    || true
  sudo -H -u ubuntu bash -lc 'pm2 status ai-admin-api' \
    || pm2 status ai-admin-api \
    || pm2 status 0 \
    || true
fi

echo "Seedance-full status query 15-retry fix deployed."
echo "Backup: ${BACKUP_DIR}"
