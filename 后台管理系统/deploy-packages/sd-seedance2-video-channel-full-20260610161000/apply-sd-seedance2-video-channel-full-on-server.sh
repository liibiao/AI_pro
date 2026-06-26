#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sd-seedance2-video-channel-full-20260610161000"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/admin-web" ] && [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 0
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

install_file(){
  local rel="$1"
  local dest="$2"
  need_file "$rel"
  run_sudo mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    local backup_name
    backup_name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$backup_name.bak" 2>/dev/null || true
  fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_dir(){
  local rel="$1"
  local dest="$2"
  [ -d "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$dest"
  if [ -d "$dest" ]; then
    local backup_name
    backup_name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
    run_sudo mkdir -p "$BACKUP_DIR/$backup_name"
    run_sudo cp -a "$dest/." "$BACKUP_DIR/$backup_name/" 2>/dev/null || true
  fi
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed directory $dest"
}

log "install canvas and model JSON"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
for model_json in sd2-720p-fast.json sd2-720p.json sd2-1080p-fast.json sd2-1080p.json seedance-2.json; do
  install_file "tools/workbench-web/models/$model_json" "$WEB_ROOT/tools/workbench-web/models/$model_json"
done
if [ -d "$MIRROR_ROOT" ]; then
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  for model_json in sd2-720p-fast.json sd2-720p.json sd2-1080p-fast.json sd2-1080p.json seedance-2.json; do
    install_file "tools/workbench-web/models/$model_json" "$MIRROR_ROOT/tools/workbench-web/models/$model_json"
  done
else
  log "mirror root missing, skip $MIRROR_ROOT"
fi

log "install api-server files"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts"
install_file "api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
install_file "api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
install_file "api-server/src/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts"
install_file "api-server/src/upstream.ts" "$APP_DIR/api-server/src/upstream.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js"
install_file "api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
install_file "api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
install_file "api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"
install_file "api-server/dist/upstream.js" "$APP_DIR/api-server/dist/upstream.js"

log "install admin-web"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

API_DIR="$APP_DIR/api-server"
log "sync SD / Seedance 2.0 video models"
run_sudo bash -lc "cd '$API_DIR' && CANVAS_MODELS_DIR='$SRC/tools/workbench-web/models' SYNC_CANVAS_MODELS_OVERWRITE=true SYNC_CANVAS_MODELS_OVERWRITE_BASE_URL=true SYNC_CANVAS_MODELS_OVERWRITE_RUNTIME_CONFIG=true SYNC_CANVAS_MODELS_OVERWRITE_PRICING=true node dist/sync-canvas-models.js"

log "build api-server if toolchain is available"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/typescript/bin/tsc" ]; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "node/typescript not found, using packaged dist files"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify markers"
grep -Fq "seedance2-sd" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "result_url" "$APP_DIR/api-server/dist/upstream.js"
grep -Fq "sd2-1080p-fast" "$WEB_ROOT/tools/workbench-web/models/sd2-1080p-fast.json"
grep -Fq "SD / Seedance 2.0" "$APP_DIR/admin-web/dist/assets/"*.js
grep -Fq "seedance2-sd" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the admin and canvas pages after deploy."
