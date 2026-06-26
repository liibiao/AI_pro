#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="asset-library-real-pagination-fix-20260603014228"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/${PKG}.XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
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

cleanup(){ rm -rf "$WORK"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK"
SRC="$WORK/$PKG"

test -f "$SRC/workbench-web/image-studio-canvas-next.html" || fail "missing workbench html"
test -f "$SRC/api-server/src/modules/generation/routes.ts" || fail "missing generation routes source"
test -f "$SRC/api-server/src/modules/open-api/routes.ts" || fail "missing open-api routes source"
test -f "$SRC/api-server/dist/modules/generation/routes.js" || fail "missing generation routes dist"
test -f "$SRC/api-server/dist/modules/open-api/routes.js" || fail "missing open-api routes dist"

BACKUP_ROOT="/var/www/ai-admin/backups/${PKG}-${STAMP}"
log "backup $BACKUP_ROOT"
run_sudo mkdir -p \
  "$BACKUP_ROOT/workbench-web" \
  "$BACKUP_ROOT/api-server/src/modules/generation" \
  "$BACKUP_ROOT/api-server/src/modules/open-api" \
  "$BACKUP_ROOT/api-server/dist/modules/generation" \
  "$BACKUP_ROOT/api-server/dist/modules/open-api"
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_ROOT/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_ROOT/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/open-api/routes.ts" "$BACKUP_ROOT/api-server/src/modules/open-api/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_ROOT/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/open-api/routes.js" "$BACKUP_ROOT/api-server/dist/modules/open-api/routes.js" 2>/dev/null || true

log "install workbench"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "install api routes"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/generation" \
  "$APP_DIR/api-server/src/modules/open-api" \
  "$APP_DIR/api-server/dist/modules/generation" \
  "$APP_DIR/api-server/dist/modules/open-api"
run_sudo install -m 0644 "$SRC/api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$SRC/api-server/src/modules/open-api/routes.ts" "$APP_DIR/api-server/src/modules/open-api/routes.ts"
run_sudo install -m 0644 "$SRC/api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$SRC/api-server/dist/modules/open-api/routes.js" "$APP_DIR/api-server/dist/modules/open-api/routes.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "verify markers"
run_sudo grep -Fq "limit:10" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq 'limit=${limit}&offset=${offset}' "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "loadingMore" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "req.query.offset" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "skip," "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "pagination: { limit: take, offset: skip, total, hasMore" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "req.query.offset" "$APP_DIR/api-server/dist/modules/open-api/routes.js"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_ROOT"
echo "Hard-refresh the canvas page after deploy."
