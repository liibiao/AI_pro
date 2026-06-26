#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="image-model-config-ratios-20260620043717"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PUBLIC_WORKBENCH_ROOT="${PUBLIC_WORKBENCH_ROOT:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
TOOLS_ROOT="${TOOLS_ROOT:-$MIRROR_ROOT/tools/workbench-web}"
LEGACY_ROOT="${LEGACY_ROOT:-$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web}"
RUNTIME_WORKBENCH_ROOT="${RUNTIME_WORKBENCH_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace/tools/workbench-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ] && [ -d "$candidate/admin-web" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"
[ -d "$APP_DIR/admin-web" ] || fail "admin-web not found: $APP_DIR/admin-web"

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
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}
need_dir(){
  [ -d "$SRC/$1" ] || fail "$1 not found in package"
}
backup_one(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -e "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -a "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$2"
  need_file "$rel"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}
install_dir(){
  local rel="$1"
  local dest="$2"
  need_dir "$rel"
  backup_one "$dest"
  run_sudo mkdir -p "$dest"
  run_sudo rm -rf "$dest"/*
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed directory $dest"
}
verify_canvas_marker(){
  local file="$1"
  grep -Fq "hasConfiguredImageAspectRatioOptions" "$file"
  grep -Fq "return configured.length?configured:adapterOptions;" "$file"
  if grep -Fq "GPT_IMAGE2_PRO_RESOLUTIONS" "$file"; then
    fail "old GPT_IMAGE2_PRO_RESOLUTIONS marker still exists in $file"
  fi
  if grep -Fq "GPT_IMAGE2_PRO_SIZE_RATIOS" "$file"; then
    fail "old GPT_IMAGE2_PRO_SIZE_RATIOS marker still exists in $file"
  fi
}

log "verify package markers"
need_file "workbench-web/image-studio-canvas-next.html"
need_file "tools/workbench-web/image-studio-canvas-next.html"
need_file "api-server/src/modules/models/routes.ts"
need_file "api-server/dist/modules/models/routes.js"
need_file "admin-web/src/main.tsx"
need_dir "admin-web/dist"
verify_canvas_marker "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_marker "$SRC/tools/workbench-web/image-studio-canvas-next.html"
grep -Fq "imageAspectRatios" "$SRC/api-server/src/modules/models/routes.ts"
grep -Fq "aspect_ratios" "$SRC/api-server/dist/modules/models/routes.js"
grep -Fq "label=\"支持比例\"" "$SRC/admin-web/src/main.tsx"
grep -Fq "imageAspectRatios" "$SRC"/admin-web/dist/assets/*.js

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server model routes"
install_file "api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
install_file "api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"

log "install admin-web"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_dir "admin-web/dist" "$APP_DIR/admin-web/dist"

log "install canvas"
installed=0
if [ -d "$PUBLIC_WORKBENCH_ROOT" ]; then
  install_file "workbench-web/image-studio-canvas-next.html" "$PUBLIC_WORKBENCH_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$TOOLS_ROOT" ]; then
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$LEGACY_ROOT" ]; then
  install_file "workbench-web/image-studio-canvas-next.html" "$LEGACY_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
if [ -d "$RUNTIME_WORKBENCH_ROOT" ]; then
  install_file "tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html"
  installed=$((installed+1))
fi
[ "$installed" -gt 0 ] || fail "no canvas install target found"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

log "verify installed markers"
grep -Fq "imageAspectRatios" "$APP_DIR/api-server/dist/modules/models/routes.js"
grep -Fq "label=\"支持比例\"" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "imageAspectRatios" "$APP_DIR"/admin-web/dist/assets/*.js
for file in \
  "$PUBLIC_WORKBENCH_ROOT/image-studio-canvas-next.html" \
  "$TOOLS_ROOT/image-studio-canvas-next.html" \
  "$LEGACY_ROOT/image-studio-canvas-next.html" \
  "$RUNTIME_WORKBENCH_ROOT/image-studio-canvas-next.html"; do
  if [ -f "$file" ]; then
    verify_canvas_marker "$file"
  fi
done

if ! curl -fsS --max-time 10 http://127.0.0.1/api/health >/dev/null; then
  if ! curl -fsS --max-time 10 http://127.0.0.1:4000/api/health >/dev/null; then
    curl -fsS --max-time 10 http://124.156.137.236/api/health >/dev/null
  fi
fi

log "done"
echo "backup: $BACKUP_DIR"
