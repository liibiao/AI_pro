#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/model-upload-async-cos-option-20260531.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/model-upload-async-cos-option-20260531-XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "缺少部署包: $PKG" >&2; exit 1; }
run_sudo test -d "$APP_DIR/admin-web" || { echo "后台管理前端目录不存在: $APP_DIR/admin-web" >&2; exit 1; }
run_sudo test -d "$APP_DIR/api-server" || { echo "API 目录不存在: $APP_DIR/api-server" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/model-upload-async-cos-option-20260531"

test -f "$SRC/admin-web/src/main.tsx" || { echo "部署包缺少 admin-web/src/main.tsx" >&2; exit 1; }
test -d "$SRC/admin-web/dist" || { echo "部署包缺少 admin-web/dist" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/models/routes.ts" || { echo "部署包缺少 models routes 源码" >&2; exit 1; }
test -f "$SRC/api-server/src/modules/generation/adapters/registry.ts" || { echo "部署包缺少 registry 源码" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/models/routes.js" || { echo "部署包缺少 models routes 编译产物" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/generation/adapters/registry.js" || { echo "部署包缺少 registry 编译产物" >&2; exit 1; }

BACKUP_ROOT="/var/www/ai-admin/backups/model-upload-async-cos-option-20260531-$STAMP"
log "backup: $BACKUP_ROOT"
run_sudo mkdir -p \
  "$BACKUP_ROOT/admin-web/src" \
  "$BACKUP_ROOT/admin-web/dist" \
  "$BACKUP_ROOT/api-server/src/modules/models" \
  "$BACKUP_ROOT/api-server/src/modules/generation/adapters" \
  "$BACKUP_ROOT/api-server/dist/modules/models" \
  "$BACKUP_ROOT/api-server/dist/modules/generation/adapters"

run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_ROOT/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_ROOT/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_ROOT/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_ROOT/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_ROOT/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_ROOT/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

log "install admin web"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/admin-web/dist"
run_sudo cp -f "$SRC/admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist/assets"
run_sudo cp -a "$SRC/admin-web/dist/." "$APP_DIR/admin-web/dist/"

log "install api files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/models" \
  "$APP_DIR/api-server/dist/modules/generation/adapters"
run_sudo cp -f "$SRC/api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo cp -f "$SRC/api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo cp -f "$SRC/api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo cp -f "$SRC/api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify markers"
run_sudo grep -q "local_cache_async_cos" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -q "本地预览 + 后台异步 COS" "$APP_DIR/admin-web/dist/assets/"*.js
run_sudo grep -q "local_cache_async_cos" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -q "local_cache_async_cos" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"
log "done"
echo "backup: $BACKUP_ROOT"
