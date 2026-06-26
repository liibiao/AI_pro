#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
WORK_ROOT="/tmp/image-size-preserve-common-fix-$$"
BACKUP_ROOT="/var/www/ai-admin/backups/image-size-preserve-common-fix-$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT

mkdir -p "$WORK_ROOT" "$BACKUP_ROOT"
tar -xzf "$ARCHIVE" -C "$WORK_ROOT"

install_file() {
  local rel="$1"
  local src="$WORK_ROOT/$rel"
  local dst="$APP_ROOT/$rel"
  if [[ ! -f "$src" ]]; then
    echo "missing package file: $rel" >&2
    exit 1
  fi
  if [[ -f "$dst" ]]; then
    mkdir -p "$BACKUP_ROOT/$(dirname "$rel")"
    cp "$dst" "$BACKUP_ROOT/$rel"
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

install_file "api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js"

REG="$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -q "const requestSize = firstDefined(ctx.params.requestedPixelSize, ctx.params.pixelSize, request.size)" "$REG"
grep -q "size: requestSize" "$REG"
if grep -q "delete request.size" "$REG"; then
  echo "deployed dist still deletes request.size" >&2
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
    pm2 status ai-admin-api
  elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
    sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 status ai-admin-api
  else
    pm2 restart all --update-env
    pm2 status
  fi
else
  systemctl restart ai-admin-api
  systemctl status ai-admin-api --no-pager
fi

echo "Common image size preservation fix deployed."
echo "Backup: $BACKUP_ROOT"
