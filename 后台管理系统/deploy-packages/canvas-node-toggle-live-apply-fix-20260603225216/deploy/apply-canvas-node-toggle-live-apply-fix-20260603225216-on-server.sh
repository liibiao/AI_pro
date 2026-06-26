#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-node-toggle-live-apply-fix-20260603225216"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_NAME" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

build_admin_web(){
  run_sudo env REMOTE_ADMIN_WEB="$REMOTE_APP_ROOT/admin-web" bash -lc '
    set -euo pipefail
    cd "$REMOTE_ADMIN_WEB"
    if command -v npm >/dev/null 2>&1; then
      npm run build
    elif command -v node >/dev/null 2>&1; then
      node node_modules/typescript/bin/tsc -p tsconfig.json
      node node_modules/vite/bin/vite.js build
    else
      echo "node/npm not found for admin-web build" >&2
      exit 1
    fi
  '
}

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

ADMIN_MAIN="$SRC/ai-admin-platform/admin-web/src/main.tsx"
API_ROUTE_SRC="$SRC/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts"
API_ROUTE_DIST="$SRC/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js"
CANVAS_HTML="$SRC/workbench-web/image-studio-canvas-next.html"

log "verify package markers"
grep -Fq "canvas-node-direct-toggle-v1" "$ADMIN_MAIN"
grep -Fq "patchCanvasNodeConfigData" "$ADMIN_MAIN"
grep -Fq "canvas.node.config" "$API_ROUTE_SRC"
grep -Fq "systemSetting.upsert" "$API_ROUTE_DIST"
grep -Fq "startCanvasNodeConfigAutoRefresh" "$CANVAS_HTML"
grep -Fq "refreshCanvasNodeConfig" "$CANVAS_HTML"
grep -Fq "canvasNodeConfigDisabledTypesFromPayload" "$CANVAS_HTML"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror-workbench-web"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/app.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/app.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/app.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/app.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$MIRROR_DIR" ]; then
  run_sudo cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install admin source"
run_sudo install -m 0644 "$ADMIN_MAIN" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"

log "install api files"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/app.ts" "$REMOTE_APP_ROOT/api-server/src/app.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/app.js" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo install -m 0644 "$API_ROUTE_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts"
run_sudo install -m 0644 "$API_ROUTE_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"

log "install workbench html"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$CANVAS_HTML" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$CANVAS_HTML" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "build admin web dist on server"
build_admin_web

log "verify installed markers"
run_sudo grep -Fq "canvas-node-direct-toggle-v1" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Rqs "canvas-node-direct-toggle-v1" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Fq "canvas.node.config" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
run_sudo grep -Fq "systemSetting.upsert" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
run_sudo grep -Fq "startCanvasNodeConfigAutoRefresh" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "refreshCanvasNodeConfig" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh admin and canvas pages after deploy."
