#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-preview-download-fallback-ui-fix-20260531232226.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/video-preview-download-fallback-ui-fix-20260531232226-XXXXXX)"
BACKUP="/var/www/ai-admin/backups/video-preview-download-fallback-ui-fix-20260531232226-$STAMP"

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
run_sudo test -d "$APP_DIR/api-server" || { echo "API 目录不存在: $APP_DIR/api-server" >&2; exit 1; }
run_sudo test -d "$WORKBENCH_DIR" || { echo "画布目录不存在: $WORKBENCH_DIR" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/video-preview-download-fallback-ui-fix-20260531232226"
test -f "$SRC/api-server/src/modules/workbench-compat/routes.ts" || { echo "部署包缺少 routes.ts" >&2; exit 1; }
test -f "$SRC/api-server/dist/modules/workbench-compat/routes.js" || { echo "部署包缺少 routes.js" >&2; exit 1; }
test -f "$SRC/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少 image-studio-canvas-next.html" >&2; exit 1; }

log "backup: $BACKUP"
run_sudo mkdir -p \
  "$BACKUP/api-server/src/modules/workbench-compat" \
  "$BACKUP/api-server/dist/modules/workbench-compat" \
  "$BACKUP/workbench-web"
run_sudo cp -a "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install api files"
run_sudo mkdir -p "$APP_DIR/api-server/src/modules/workbench-compat" "$APP_DIR/api-server/dist/modules/workbench-compat"
run_sudo cp -f "$SRC/api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
run_sudo cp -f "$SRC/api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"

log "install canvas html"
run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$(dirname "$MIRROR_WORKBENCH_DIR")" ]; then
  run_sudo mkdir -p "$MIRROR_WORKBENCH_DIR"
  run_sudo cp -f "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
fi
run_sudo chown www-data:www-data "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo chmod 644 "$WORKBENCH_DIR/image-studio-canvas-next.html" 2>/dev/null || true

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify markers"
run_sudo grep -q "firstGenerationVideoResultUrl" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
run_sudo grep -q "sendVideoResultUrl" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
run_sudo grep -q "proxiedVideoUrlForRemote" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -q "20260531: 生视频提示词区域" "$WORKBENCH_DIR/image-studio-canvas-next.html"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
