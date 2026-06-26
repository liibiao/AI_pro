#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-node-config-db-storage-fix-20260603223752"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
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

assert_no_file_write_markers(){
  local file="$1"
  if grep -Eq 'writeFile|rename\(|mkdir\(|\.tmp' "$file"; then
    fail "file-write marker still exists in $file"
  fi
}

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

ROUTE_SRC="$SRC/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts"
ROUTE_DIST="$SRC/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js"

log "verify package markers"
grep -Fq "canvasNodeConfigRoutes" "$SRC/ai-admin-platform/api-server/src/app.ts"
grep -Fq "canvasNodeConfigRoutes" "$SRC/ai-admin-platform/api-server/dist/app.js"
grep -Fq "canvas.node.config" "$ROUTE_SRC"
grep -Fq "canvas.node.config" "$ROUTE_DIST"
grep -Fq "systemSetting.findUnique" "$ROUTE_DIST"
grep -Fq "systemSetting.upsert" "$ROUTE_DIST"
assert_no_file_write_markers "$ROUTE_SRC"
assert_no_file_write_markers "$ROUTE_DIST"

log "backup current api files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config"
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/app.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/app.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/app.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/app.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/canvas-node-config/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/canvas-node-config/routes.js" 2>/dev/null || true

log "install api files"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/app.ts" "$REMOTE_APP_ROOT/api-server/src/app.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/app.js" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo install -m 0644 "$ROUTE_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/canvas-node-config/routes.ts"
run_sudo install -m 0644 "$ROUTE_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"

log "verify installed markers"
run_sudo grep -Fq "canvasNodeConfigRoutes" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo grep -Fq "canvas.node.config" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
run_sudo grep -Fq "systemSetting.findUnique" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
run_sudo grep -Fq "systemSetting.upsert" "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"
if run_sudo grep -Eq 'writeFile|rename\(|mkdir\(|\.tmp' "$REMOTE_APP_ROOT/api-server/dist/modules/canvas-node-config/routes.js"; then
  fail "installed route still contains file-write marker"
fi

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh admin page after deploy."
