#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /tmp/autumn-app-*.tar.gz" >&2
  exit 2
fi

APP_NAME="autumn-app"
RELEASE_ID="20260620040457"
BASE_DIR="/var/www/${APP_NAME}"
RELEASES_DIR="${BASE_DIR}/releases"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
CURRENT_LINK="${BASE_DIR}/current"
PUBLIC_ROOT="/var/www/html"
PUBLIC_LINK="${PUBLIC_ROOT}/autumn"
ADMIN_DIST_ROOT="/var/www/ai-admin/ai-admin-platform/admin-web/dist"
WORKBENCH_ROOT="/var/www/ai-admin/workbench-web"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"

if [ ! -d "${TMP_DIR}/dist" ] || [ ! -f "${TMP_DIR}/dist/index.html" ]; then
  echo "package is missing dist/index.html" >&2
  exit 1
fi

install -d -m 0755 "$RELEASES_DIR"
rm -rf "$RELEASE_DIR"
install -d -m 0755 "$RELEASE_DIR"
cp -a "${TMP_DIR}/dist/." "$RELEASE_DIR/"

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

install -d -m 0755 "$PUBLIC_ROOT"
ln -sfn "$CURRENT_LINK" "$PUBLIC_LINK"

if [ -d "$ADMIN_DIST_ROOT" ]; then
  ln -sfn "$CURRENT_LINK" "${ADMIN_DIST_ROOT}/autumn"
fi

if [ -d "$WORKBENCH_ROOT" ]; then
  ln -sfn "$CURRENT_LINK" "${WORKBENCH_ROOT}/autumn"
fi

if id www-data >/dev/null 2>&1; then
  chown -hR www-data:www-data "$BASE_DIR"
  chown -h www-data:www-data "$PUBLIC_LINK"
  [ ! -e "${ADMIN_DIST_ROOT}/autumn" ] || chown -h www-data:www-data "${ADMIN_DIST_ROOT}/autumn"
  [ ! -e "${WORKBENCH_ROOT}/autumn" ] || chown -h www-data:www-data "${WORKBENCH_ROOT}/autumn"
fi

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +6 | xargs -r rm -rf

if command -v nginx >/dev/null 2>&1; then
  rm -f /etc/nginx/conf.d/autumn-app.conf
  nginx -t
  systemctl reload nginx || service nginx reload || true
fi

echo "Autumn deployed:"
echo "  release: ${RELEASE_DIR}"
echo "  current: ${CURRENT_LINK}"
echo "  public:  ${PUBLIC_LINK}"
echo "  admin:   ${ADMIN_DIST_ROOT}/autumn"
echo "  canvas:  ${WORKBENCH_ROOT}/autumn"
echo "  url:     /autumn/"
