#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?archive path required}"
APP_DIR="/var/www/ai-admin"
WORK_DIR="$(mktemp -d)"
BACKUP_DIR="${APP_DIR}/backups/fullblood-route-and-sd2-model-source-fix-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${WORK_DIR}" "${BACKUP_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${WORK_DIR}"

REGISTRY_SRC="${WORK_DIR}/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="${WORK_DIR}/api-server/dist/modules/generation/adapters/registry.js"
ROUTES_SRC="${WORK_DIR}/api-server/src/modules/generation/routes.ts"
ROUTES_DIST="${WORK_DIR}/api-server/dist/modules/generation/routes.js"

test -f "${REGISTRY_SRC}"
test -f "${REGISTRY_DIST}"
test -f "${ROUTES_SRC}"
test -f "${ROUTES_DIST}"

grep -q "ctx.model.name || ctx.provider.defaultModel || ctx.params.model" "${REGISTRY_SRC}"
grep -q "ctx.model.name || ctx.provider.defaultModel || ctx.params.model" "${REGISTRY_DIST}"
grep -q "protocolAdapter === 'fullblood-video'" "${ROUTES_SRC}"
grep -q "canvas_fullblood-video" "${ROUTES_SRC}"
grep -q "protocolAdapter === 'fullblood-video'" "${ROUTES_DIST}"
grep -q "canvas_fullblood-video" "${ROUTES_DIST}"

mkdir -p \
  "${APP_DIR}/api-server/src/modules/generation/adapters" \
  "${APP_DIR}/api-server/dist/modules/generation/adapters" \
  "${APP_DIR}/api-server/src/modules/generation" \
  "${APP_DIR}/api-server/dist/modules/generation"

for file in \
  "api-server/src/modules/generation/adapters/registry.ts" \
  "api-server/dist/modules/generation/adapters/registry.js" \
  "api-server/src/modules/generation/routes.ts" \
  "api-server/dist/modules/generation/routes.js"; do
  if [ -f "${APP_DIR}/${file}" ]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${file}")"
    cp -a "${APP_DIR}/${file}" "${BACKUP_DIR}/${file}.bak"
  fi
done

install -m 0644 "${REGISTRY_SRC}" "${APP_DIR}/api-server/src/modules/generation/adapters/registry.ts"
install -m 0644 "${REGISTRY_DIST}" "${APP_DIR}/api-server/dist/modules/generation/adapters/registry.js"
install -m 0644 "${ROUTES_SRC}" "${APP_DIR}/api-server/src/modules/generation/routes.ts"
install -m 0644 "${ROUTES_DIST}" "${APP_DIR}/api-server/dist/modules/generation/routes.js"

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

echo "Fullblood route and SD2 model source fix deployed."
echo "Backup: ${BACKUP_DIR}"
