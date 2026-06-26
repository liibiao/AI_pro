#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt2pro-fixed-options-20260620035930"
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
  grep -Fq "const GPT_IMAGE2_PRO_RESOLUTIONS=['1k','2k'];" "$file"
  grep -Fq "const GPT_IMAGE2_PRO_SIZE_RATIOS=['auto','1:1','3:2','2:3'];" "$file"
}

log "verify package markers"
need_file "workbench-web/image-studio-canvas-next.html"
need_file "tools/workbench-web/image-studio-canvas-next.html"
need_file "api-server/dist/modules/generation/adapters/registry.js"
need_file "api-server/dist/modules/generation/routes.js"
need_file "admin-web/src/main.tsx"
need_dir "admin-web/dist"
verify_canvas_marker "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_marker "$SRC/tools/workbench-web/image-studio-canvas-next.html"
grep -Fq "return resolution === '1K' ? '1K' : '2K';" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "resolveGptImage2ProOfficialProxyAspectRatio" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizeGenerationTaskParamsForModel" "$SRC/api-server/dist/modules/generation/routes.js"
grep -Fq "normalizeGptImage2ProResolutionParam" "$SRC/api-server/dist/modules/generation/routes.js"
grep -Fq "limitGptImage2ProResolutions" "$SRC/admin-web/src/main.tsx"
grep -Fq "canvas_gpt-image-2-pro" "$SRC"/admin-web/dist/assets/*.js

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server"
for rel in \
  api-server/src/modules/generation/adapters/registry.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/dist/modules/generation/adapters/registry.js \
  api-server/dist/modules/generation/routes.js; do
  install_file "$rel" "$APP_DIR/$rel"
done

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
grep -Fq "return resolution === '1K' ? '1K' : '2K';" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizeGenerationTaskParamsForModel" "$APP_DIR/api-server/dist/modules/generation/routes.js"
grep -Fq "limitGptImage2ProResolutions" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "canvas_gpt-image-2-pro" "$APP_DIR"/admin-web/dist/assets/*.js
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
