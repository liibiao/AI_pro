#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?archive path is required}"
APP_ROOT="/var/www/autumn-app"
RELEASE_ID="20260623035025"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"

install -d -m 755 "${APP_ROOT}/releases"
install -d -m 755 "${RELEASE_DIR}"

tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}"

test -f "${RELEASE_DIR}/index.html"
test -d "${RELEASE_DIR}/assets"
grep -q "/autumn/assets/" "${RELEASE_DIR}/index.html"
grep -Rqs "endpointPath" "${RELEASE_DIR}/assets"
grep -Rqs "requestTimeoutMs" "${RELEASE_DIR}/assets"
grep -Rqs "Autumn" "${RELEASE_DIR}/assets"
if grep -Rqs "Flova" "${RELEASE_DIR}/index.html" "${RELEASE_DIR}/assets"; then
  echo "Flova copy still exists in deployed assets" >&2
  exit 1
fi

chown -R www-data:www-data "${RELEASE_DIR}" 2>/dev/null || true
find "${RELEASE_DIR}" -type d -exec chmod 755 {} +
find "${RELEASE_DIR}" -type f -exec chmod 644 {} +

ln -sfn "${RELEASE_DIR}" "${APP_ROOT}/current"

echo "Autumn app deployed to ${RELEASE_DIR}"
