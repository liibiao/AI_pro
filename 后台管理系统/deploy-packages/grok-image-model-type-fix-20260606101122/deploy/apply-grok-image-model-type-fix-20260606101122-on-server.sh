#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="grok-image-model-type-fix-20260606101122"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

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

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
MODELS_ROUTE_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts"
MODELS_ROUTE_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js"

[ -f "$HTML_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"
[ -f "$MODELS_ROUTE_SRC" ] || fail "package missing api-server/src/modules/models/routes.ts"
[ -f "$MODELS_ROUTE_DIST" ] || fail "package missing api-server/dist/modules/models/routes.js"

log "verify package markers"
grep -Fq "backendKey.includes('cliproxy-grok-image')" "$HTML_SRC"
grep -Fq "type:forcedType||item.type" "$HTML_SRC"
grep -Fq "adapter:item.adapter||item.protocol?.adapter||item.provider?.adapter" "$HTML_SRC"
grep -Fq "protocolStatusEndpointPath" "$MODELS_ROUTE_SRC"
grep -Fq "clientType === 'VIDEO' ? model.provider.statusEndpointPath : null" "$MODELS_ROUTE_SRC"
grep -Fq "protocolMethod || model.provider.requestMethod || undefined" "$MODELS_ROUTE_SRC"
grep -Fq "protocolStatusEndpointPath" "$MODELS_ROUTE_DIST"
grep -Fq "clientType === 'VIDEO' ? model.provider.statusEndpointPath : null" "$MODELS_ROUTE_DIST"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror/tools/workbench-web" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models"
run_sudo cp -a "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$WEB_ROOT/workbench-web" \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/dist/modules/models"
run_sudo install -m 0644 "$HTML_SRC" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
run_sudo install -m 0644 "$MODELS_ROUTE_SRC" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$MODELS_ROUTE_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged dist"
    run_sudo install -m 0644 "$MODELS_ROUTE_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "backendKey.includes('cliproxy-grok-image')" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "type:forcedType||item.type" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "adapter:item.adapter||item.protocol?.adapter||item.provider?.adapter" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Fq "protocolStatusEndpointPath" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "clientType === 'VIDEO' ? model.provider.statusEndpointPath : null" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "protocolMethod || model.provider.requestMethod || undefined" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "protocolStatusEndpointPath" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "clientType === 'VIDEO' ? model.provider.statusEndpointPath : null" "$APP_DIR/api-server/dist/modules/models/routes.js"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
