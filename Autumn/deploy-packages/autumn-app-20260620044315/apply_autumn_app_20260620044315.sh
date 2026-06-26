#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
RELEASE_ID="20260620044315"
APP_ROOT="/var/www/autumn-app"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"
CURRENT_LINK="${APP_ROOT}/current"

if [[ -z "${ARCHIVE_PATH}" || ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Usage: $0 /tmp/autumn-app-${RELEASE_ID}.tar.gz" >&2
  exit 2
fi

mkdir -p "${APP_ROOT}/releases"
rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${RELEASE_DIR}" --strip-components=1

if [[ ! -f "${RELEASE_DIR}/index.html" ]]; then
  echo "Missing index.html after extract: ${RELEASE_DIR}" >&2
  exit 3
fi

ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

mkdir -p /var/www/html
ln -sfn "${CURRENT_LINK}" /var/www/html/autumn

mkdir -p /var/www/ai-admin/ai-admin-platform/admin-web/dist
ln -sfn "${CURRENT_LINK}" /var/www/ai-admin/ai-admin-platform/admin-web/dist/autumn

mkdir -p /var/www/ai-admin/workbench-web
ln -sfn "${CURRENT_LINK}" /var/www/ai-admin/workbench-web/autumn

rm -f /etc/nginx/conf.d/autumn-app.conf

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx || true
  fi
fi

echo "Autumn app deployed to ${RELEASE_DIR}"
echo "Public path: /autumn/"
