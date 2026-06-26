#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-node-management-config-20260603213033"
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

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
grep -Fq "canvasNodeConfigRoutes" "$SRC/ai-admin-platform/api-server/src/app.ts"
grep -Fq "canvasNodeConfigRoutes" "$SRC/ai-admin-platform/api-server/dist/app.js"
grep -Fq "canvas-node-config.json" "$SRC/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts"
grep -Fq "disabledNodeTypes" "$SRC/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js"
grep -Fq "画布节点管理" "$SRC/ai-admin-platform/admin-web/src/main.tsx"
grep -Fq "CanvasNodeManagement" "$SRC/ai-admin-platform/admin-web/src/main.tsx"
grep -Fq "canvasNodeIcon" "$SRC/ai-admin-platform/admin-web/src/styles.css"
grep -Rqs "画布节点管理" "$SRC/ai-admin-platform/admin-web/dist"
grep -Rqs "canvasNodeIcon" "$SRC/ai-admin-platform/admin-web/dist"
grep -Fq "/api/canvas/nodes" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "disabledNodeTypes:new Set()" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "validateConnectionBeforeCommit" "$SRC/workbench-web/image-studio-canvas-next.html"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror-workbench-web"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/styles.css" "$BACKUP_DIR/ai-admin-platform/admin-web/src/styles.css" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/app.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/app.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/app.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/app.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$MIRROR_DIR" ]; then
  run_sudo cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install admin web"
run_sudo install -m 0644 "$SRC/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo install -m 0644 "$SRC/ai-admin-platform/admin-web/src/styles.css" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$SRC/ai-admin-platform/admin-web/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "install api routes"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/app.ts" "$REMOTE_APP_ROOT/api-server/src/app.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/app.js" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"

log "install workbench html"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "verify installed markers"
run_sudo grep -Fq "canvasNodeConfigRoutes" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo grep -Fq "disabledNodeTypes" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
run_sudo grep -Fq "画布节点管理" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "canvasNodeIcon" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo grep -Rqs "画布节点管理" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Rqs "canvasNodeIcon" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Fq "/api/canvas/nodes" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "disabledNodeTypes:new Set()" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh admin and canvas pages after deploy."
