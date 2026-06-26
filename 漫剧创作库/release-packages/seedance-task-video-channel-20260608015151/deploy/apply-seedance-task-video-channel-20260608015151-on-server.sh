#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance-task-video-channel-20260608015151"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}
pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 0
  if pm2_run show "$name" >/dev/null 2>&1; then
    log "restart pm2: $name"
    pm2_run restart "$name" --update-env >/dev/null
    return 0
  fi
  return 1
}
backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}
install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest" 2>/dev/null || true
  if id www-data >/dev/null 2>&1 && [ "$(printf '%s' "$dest" | cut -c1-8)" = "/var/www" ]; then
    run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
  fi
  log "installed $dest"
}
verify_canvas(){
  local file="$1"
  grep -Fq "function isSeedanceTaskAdapter" "$file"
  grep -Fq "payload.image_urls=images.slice(0,9)" "$file"
  grep -Fq "payload.video_urls=[refMedia.video].filter(Boolean)" "$file"
  grep -Fq "payload.audio_urls=[refMedia.audio].filter(Boolean)" "$file"
}
verify_engine(){
  local file="$1"
  grep -Fq "mode: payload.mode || payload.seedanceMode" "$file"
  grep -Fq "image_urls: Array.isArray(payload.image_urls)" "$file"
  grep -Fq "video_urls: Array.isArray(payload.video_urls)" "$file"
  grep -Fq "audio_urls: Array.isArray(payload.audio_urls)" "$file"
}
verify_model(){
  local file="$1"
  grep -Fq '"id": "seedance-2-0"' "$file"
  grep -Fq '"model": "doubao-seedance-2-0-260128"' "$file"
  grep -Fq '"adapter": "seedance-task"' "$file"
}
verify_registry(){
  local file="$1"
  grep -Fq '"configId": "seedance-2-0"' "$file"
  grep -Fq '"identityKey": "seedance::doubao-seedance-2-0-260128"' "$file"
  grep -Fq '"adapter": "seedance-task"' "$file"
}
verify_backend(){
  local file="$1"
  grep -Fq "def build_seedance_task_request_body" "$file"
  grep -Fq "def start_seedance_task_video" "$file"
  grep -Fq "def get_seedance_task_video_status" "$file"
  grep -Fq "def generate_seedance_task_video" "$file"
}
verify_server(){
  local file="$1"
  grep -Fq "build_video_provider_request_body" "$file"
  grep -Fq "start_video_generation_task" "$file"
  grep -Fq "get_video_generation_task_status" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_canvas "$SRC/workbench-web/image-studio-canvas.html"
verify_canvas "$SRC/workbench-web/image-studio-canvas-next.html"
verify_engine "$SRC/workbench-web/workbench-engine.js"
verify_model "$SRC/workbench-web/models/seedance-2-0.json"
verify_registry "$SRC/workbench-web/model-registry.json"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_server "$SRC/tools/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas legacy"
  install_file "$SRC/workbench-web/workbench-engine.js" "$WORKBENCH_DIR/workbench-engine.js" "public workbench engine"
  install_file "$SRC/workbench-web/model-registry.json" "$WORKBENCH_DIR/model-registry.json" "public model registry"
  install_file "$SRC/workbench-web/models/seedance-2-0.json" "$WORKBENCH_DIR/models/seedance-2-0.json" "public Seedance model"
  installed=$((installed+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror canvas legacy"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$MIRROR_TARGET/tools/workbench-web/workbench-engine.js" "mirror workbench engine"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$MIRROR_TARGET/tools/workbench-web/model-registry.json" "mirror model registry"
  install_file "$SRC/tools/workbench-web/models/seedance-2-0.json" "$MIRROR_TARGET/tools/workbench-web/models/seedance-2-0.json" "mirror Seedance model"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  install_file "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
  installed=$((installed+1))
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  log "install smart-vision workbench services"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart backend"
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  log "install smart-vision legacy workbench"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "smart legacy engine"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "smart legacy registry"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance-2-0.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/seedance-2-0.json" "smart legacy Seedance model"
fi

if [ -d "$MIRROR_TARGET/smart-vision/config" ]; then
  log "install smart-vision config registry"
  install_file "$SRC/smart-vision/config/model-registry.json" "$MIRROR_TARGET/smart-vision/config/model-registry.json" "smart config registry"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas legacy"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$RUNTIME_ROOT/tools/workbench-web/workbench-engine.js" "runtime workbench engine"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$RUNTIME_ROOT/tools/workbench-web/model-registry.json" "runtime model registry"
  install_file "$SRC/tools/workbench-web/models/seedance-2-0.json" "$RUNTIME_ROOT/tools/workbench-web/models/seedance-2-0.json" "runtime Seedance model"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend"
  install_file "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"
fi

[ "$installed" -gt 0 ] || fail "no public or mirror workbench target found"

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/models/seedance-2-0.json" ]; then
  run_sudo grep -Fq '"adapter": "seedance-task"' "$WORKBENCH_DIR/models/seedance-2-0.json"
fi
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "function isSeedanceTaskAdapter" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ]; then
  run_sudo grep -Fq "def build_seedance_task_request_body" "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if command -v python3 >/dev/null 2>&1 && [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ] && [ -f "$MIRROR_TARGET/tools/workbench_server.py" ]; then
  python3 -m py_compile "$MIRROR_TARGET/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/workbench_server.py" >/dev/null 2>&1 || log "python compile check skipped/failed"
fi

log "restart backend if pm2 process exists"
RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 1 ]; then
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 restart skipped; restart the workbench/backend service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
