#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
RELEASE_ID="20260622163440"
APP_ROOT="/var/www/autumn-app"
RELEASE_DIR="${APP_ROOT}/releases/${RELEASE_ID}"
CURRENT_LINK="${APP_ROOT}/current"
NGINX_SITE="/etc/nginx/sites-enabled/ai-admin"

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

if [[ -f "${NGINX_SITE}" ]]; then
  cp "${NGINX_SITE}" "${NGINX_SITE}.bak-autumn-${RELEASE_ID}"
  tmp_file="$(mktemp)"
  awk '
    /# AUTUMN_APP_BEGIN/ { skipping=1; next }
    /# AUTUMN_APP_END/ { skipping=0; next }
    !skipping { print }
  ' "${NGINX_SITE}" > "${tmp_file}"

  block_file="$(mktemp)"
  cat > "${block_file}" <<'BLOCK'
  # AUTUMN_APP_BEGIN
  location = /autumn {
    return 301 /autumn/;
  }

  location /autumn/ {
    alias /var/www/autumn-app/current/;
    try_files $uri $uri/ /autumn/index.html;
  }
  # AUTUMN_APP_END

BLOCK

  patched_file="$(mktemp)"
  awk -v block_file="${block_file}" '
    BEGIN {
      inserted=0;
      while ((getline line < block_file) > 0) {
        block = block line "\n";
      }
      close(block_file);
    }
    !inserted && $0 ~ /^[[:space:]]*location[[:space:]]+\/api\// {
      printf "%s", block;
      inserted=1;
    }
    { print }
    END {
      if (!inserted) {
        exit 42;
      }
    }
  ' "${tmp_file}" > "${patched_file}"

  mv "${patched_file}" "${NGINX_SITE}"
  rm -f "${tmp_file}" "${block_file}"
fi

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx || true
  fi
fi

echo "Autumn app deployed to ${RELEASE_DIR}"
echo "Public path: /autumn/"
