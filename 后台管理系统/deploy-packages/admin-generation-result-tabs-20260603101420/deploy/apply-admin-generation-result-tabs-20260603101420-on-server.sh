#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="admin-generation-result-tabs-20260603101420"
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
[ -d "$APP_DIR/admin-web" ] || fail "admin-web not found: $APP_DIR/admin-web"
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
pm2_sudo(){
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
tar --warning=no-unknown-keyword -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}
need_file "admin-web/src/main.tsx"
need_file "api-server/src/modules/generation/routes.ts"
need_file "tools/workbench-web/image-studio-canvas-next.html"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
log "backup: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/admin-web/src" \
  "$BACKUP_DIR/admin-web/dist" \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation" \
  "$BACKUP_DIR/canvas"

run_sudo cp -p "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_DIR/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/admin-web/dist/" 2>/dev/null || true
run_sudo cp -p "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -p "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -p "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/canvas/image-studio-canvas-next.web.bak" 2>/dev/null || true
run_sudo cp -p "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/canvas/image-studio-canvas-next.tools.bak" 2>/dev/null || true
run_sudo cp -p "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/canvas/image-studio-canvas-next.mirror.bak" 2>/dev/null || true

log "install sources"
run_sudo mkdir -p "$APP_DIR/admin-web/src" "$APP_DIR/api-server/src/modules/generation"
run_sudo cp -p "$SRC/admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
run_sudo cp -p "$SRC/api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts"

log "install canvas static file"
run_sudo mkdir -p "$WEB_ROOT/workbench-web" "$WEB_ROOT/tools/workbench-web"
run_sudo cp -p "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo cp -p "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
run_sudo chmod 0644 "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/tools/workbench-web/image-studio-canvas-next.html"
if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  run_sudo cp -p "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  run_sudo chmod 0644 "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

build_with_npm_or_node(){
  local dir="$1"
  local script="$2"
  local fallback="$3"
  if command -v npm >/dev/null 2>&1; then
    run_sudo bash -lc "cd '$dir' && npm run $script"
  elif command -v node >/dev/null 2>&1; then
    run_sudo bash -lc "cd '$dir' && $fallback"
  else
    fail "npm or node not found; cannot build $dir"
  fi
}

log "build admin-web"
build_with_npm_or_node "$APP_DIR/admin-web" "build" "node node_modules/typescript/bin/tsc -p tsconfig.json && node node_modules/vite/bin/vite.js build"

log "build api-server"
build_with_npm_or_node "$APP_DIR/api-server" "build" "node node_modules/typescript/bin/tsc -p tsconfig.json"

log "restart api"
pm2_sudo restart "$PM2_APP" --update-env || pm2_sudo restart all --update-env || true
pm2_sudo save || true

log "verify markers"
grep -Fq "ASSET_DESIGN" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "SHOT_STORYBOARD" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "/tasks/record" "$APP_DIR/api-server/src/modules/generation/routes.ts"
grep -Fq "isShotStoryboardGenerationTask" "$APP_DIR/api-server/src/modules/generation/routes.ts"
grep -Fq "recordShotStoryboardTableGenerationTask" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "shot-storyboard" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "ASSET_DESIGN" "$APP_DIR/admin-web/dist/assets/"*.js
grep -Fq "/tasks/record" "$APP_DIR/api-server/dist/modules/generation/routes.js"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas and admin pages after deploy."
