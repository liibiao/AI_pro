#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-data-packs-asset-library-fix-20260604004247"
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

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

HTML_SRC="$SRC/workbench-web/image-studio-canvas-next.html"
APP_SRC="$SRC/ai-admin-platform/api-server/src/app.ts"
APP_DIST="$SRC/ai-admin-platform/api-server/dist/app.js"
ROUTE_SRC="$SRC/ai-admin-platform/api-server/src/modules/data-packs/routes.ts"
ROUTE_DIST="$SRC/ai-admin-platform/api-server/dist/modules/data-packs/routes.js"
REGISTRY_SRC="$SRC/ai-admin-platform/data/data-pack-registry.json"

log "verify package markers"
grep -Fq "app.use('/api', dataPackRoutes)" "$APP_SRC"
grep -Fq "app.use('/api', dataPackRoutes)" "$APP_DIST"
grep -Fq "router.get('/data-packs'" "$ROUTE_SRC"
grep -Fq "router.get('/data-packs'" "$ROUTE_DIST"
grep -Fq "applyCanvasDataPacks" "$HTML_SRC"
grep -Fq "/api/data-packs" "$HTML_SRC"
grep -Fq "hasVisibleAssets" "$HTML_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/data-packs" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/data-packs" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/data" \
  "$BACKUP_DIR/ai-admin-platform/api-server/data" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror-workbench-web"
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/app.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/app.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/app.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/app.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/data-packs/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/data-packs/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/data-packs/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/data-packs/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/data/data-pack-registry.json" "$BACKUP_DIR/ai-admin-platform/data/data-pack-registry.json" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/data/data-pack-registry.json" "$BACKUP_DIR/ai-admin-platform/api-server/data/data-pack-registry.json" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$MIRROR_DIR" ]; then
  run_sudo cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install api data-pack route"
run_sudo mkdir -p "$REMOTE_APP_ROOT/api-server/src/modules/data-packs" "$REMOTE_APP_ROOT/api-server/dist/modules/data-packs"
run_sudo install -m 0644 "$APP_SRC" "$REMOTE_APP_ROOT/api-server/src/app.ts"
run_sudo install -m 0644 "$APP_DIST" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo install -m 0644 "$ROUTE_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/data-packs/routes.ts"
run_sudo install -m 0644 "$ROUTE_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/data-packs/routes.js"

log "ensure data-pack registry"
run_sudo mkdir -p "$REMOTE_APP_ROOT/data" "$REMOTE_APP_ROOT/api-server/data"
if ! run_sudo test -f "$REMOTE_APP_ROOT/data/data-pack-registry.json"; then
  run_sudo install -m 0644 "$REGISTRY_SRC" "$REMOTE_APP_ROOT/data/data-pack-registry.json"
fi
if ! run_sudo test -f "$REMOTE_APP_ROOT/api-server/data/data-pack-registry.json"; then
  if run_sudo test -f "$REMOTE_APP_ROOT/data/data-pack-registry.json"; then
    run_sudo cp -a "$REMOTE_APP_ROOT/data/data-pack-registry.json" "$REMOTE_APP_ROOT/api-server/data/data-pack-registry.json"
  else
    run_sudo install -m 0644 "$REGISTRY_SRC" "$REMOTE_APP_ROOT/api-server/data/data-pack-registry.json"
  fi
fi

log "install workbench html"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$HTML_SRC" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "verify installed markers"
run_sudo grep -Fq "app.use('/api', dataPackRoutes)" "$REMOTE_APP_ROOT/api-server/dist/app.js"
run_sudo grep -Fq "router.get('/data-packs'" "$REMOTE_APP_ROOT/api-server/dist/modules/data-packs/routes.js"
run_sudo grep -Fq "applyCanvasDataPacks" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "hasVisibleAssets" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"
DATA_PACK_STATUS="$(curl -sS -o /tmp/${PKG}.data-packs.out -w '%{http_code}' http://127.0.0.1:4000/api/data-packs || true)"
if [ "$DATA_PACK_STATUS" = "404" ]; then
  cat /tmp/${PKG}.data-packs.out >&2 || true
  fail "/api/data-packs still returns 404"
fi
log "/api/data-packs status: ${DATA_PACK_STATUS:-unknown}"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
