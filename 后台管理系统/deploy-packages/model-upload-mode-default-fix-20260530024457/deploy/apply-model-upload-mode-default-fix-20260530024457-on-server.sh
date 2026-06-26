#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/model-upload-mode-default-fix-20260530024457.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/model-upload-mode-default-fix-20260530024457-XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_sudo(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 0
  fi
}

trap 'rm -rf "$WORK"' EXIT
test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$APP_DIR/admin-web" || { echo "后台目录不正确: $APP_DIR" >&2; exit 1; }

log "package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/model-upload-mode-default-fix-20260530024457"
test -f "$SRC/admin-web/src/main.tsx" || { echo "部署包缺少 admin-web/src/main.tsx" >&2; exit 1; }
test -d "$SRC/admin-web/dist" || { echo "部署包缺少 admin-web/dist" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/models/routes.ts" || { echo "部署包缺少 api-server/src/modules/models/routes.ts" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/models/routes.js" || { echo "部署包缺少 api-server/dist/modules/models/routes.js" >&2; exit 1; }

BACKUP_ROOT="/var/www/ai-admin/backups/model-upload-mode-default-fix-20260530024457-$STAMP"
log "backup: $BACKUP_ROOT"
run_sudo mkdir -p "$BACKUP_ROOT/admin-web/src" "$BACKUP_ROOT/admin-web/dist" "$BACKUP_ROOT/api-server/src/modules/models" "$BACKUP_ROOT/api-server/dist/modules/models"
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_ROOT/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_ROOT/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_ROOT/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_ROOT/api-server/dist/modules/models/routes.js" 2>/dev/null || true

log "install admin web"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist"
run_sudo cp -f "$SRC/admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist/assets"
run_sudo cp -a "$SRC/admin-web/dist/." "$APP_DIR/admin-web/dist/"

log "install api model routes"
run_sudo mkdir -p "$APP_DIR/api-server/src/modules/models" "$APP_DIR/api-server/dist/modules/models"
run_sudo cp -f "$SRC/api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo cp -f "$SRC/api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"

log "restart api"
pm2_sudo restart "$PM2_APP" --update-env || pm2_sudo restart all --update-env || true
pm2_sudo save || true

log "verify markers"
grep -q "modelUploadMode" "$APP_DIR/admin-web/src/main.tsx"
grep -q "modelUploadMode" "$APP_DIR/admin-web/dist/assets/"*.js
grep -q "existingProtocol" "$APP_DIR/api-server/src/modules/models/routes.ts"
grep -q "modelUploadMode" "$APP_DIR/api-server/dist/modules/models/routes.js"
grep -q "delete existingProtocol.uploadMode" "$APP_DIR/api-server/dist/modules/models/routes.js"

log "done"
echo "backup: $BACKUP_ROOT"
