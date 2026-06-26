#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aiyunzhi-api-full-chain-20260614231457"
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
  elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 1
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

install_model_set(){
  local src_dir="$1" dest_dir="$2" label="$3"
  [ -d "$src_dir" ] || fail "$label source missing: $src_dir"
  run_sudo mkdir -p "$dest_dir"
  local model
  for model in "$src_dir"/aiyunzhi-*.json "$src_dir"/sd2*.json; do
    [ -f "$model" ] || continue
    install_file "$model" "$dest_dir/$(basename "$model")" "$label model"
  done
}

verify_registry(){
  local file="$1"
  grep -Fq '"configId": "aiyunzhi-grok-3-pro-video"' "$file"
  grep -Fq '"configId": "aiyunzhi-veo-3-1-fast"' "$file"
  grep -Fq '"configId": "aiyunzhi-gpt-image-2"' "$file"
  grep -Fq '"configId": "aiyunzhi-gemini-3-pro-image"' "$file"
}

verify_model_configs(){
  local dir="$1"
  grep -Fq '"baseUrl": "https://aiyunzhi.top/v1"' "$dir/aiyunzhi-grok-3-pro-video.json"
  grep -Fq '"adapter": "aiyunzhi-grok-video"' "$dir/aiyunzhi-grok-3-pro-video.json"
  grep -Fq '"adapter": "aiyunzhi-veo-video"' "$dir/aiyunzhi-veo-3-1-fast.json"
  grep -Fq '"adapter": "aiyunzhi-gpt-image-2"' "$dir/aiyunzhi-gpt-image-2.json"
  grep -Fq '"adapter": "aiyunzhi-gemini-image"' "$dir/aiyunzhi-gemini-3-pro-image.json"
  grep -Fq '"soundControlField": "metadata.enableSound"' "$dir/sd2-fast.json"
}

verify_canvas(){
  local file="$1"
  grep -Fq "function getVideoModelSoundField" "$file"
  grep -Fq "function inferSd2VideoSoundField" "$file"
  grep -Fq "payload.generate_audio=shouldGenerateAudio" "$file"
}

verify_backend(){
  local file="$1"
  grep -Fq "def build_aiyunzhi_grok_video_request_body" "$file"
  grep -Fq "def build_aiyunzhi_veo_video_request_body" "$file"
  grep -Fq "def build_aiyunzhi_gpt_image2_payload" "$file"
  grep -Fq "def build_aiyunzhi_gemini_image_payload" "$file"
  grep -Fq "metadata.enableSound" "$file"
}

verify_server(){
  local file="$1"
  grep -Fq "_inherit_model_key_for_origin" "$file"
  grep -Fq "https://aiyunzhi.top" "$file"
  grep -Fq "_collect_model_keys_by_origin" "$file"
}

verify_installed_sudo(){
  local file="$1" marker="$2"
  if run_sudo test -f "$file"; then
    run_sudo grep -Fq "$marker" "$file"
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_registry "$SRC/tools/workbench-web/model-registry.json"
verify_model_configs "$SRC/tools/workbench-web/models"
verify_canvas "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_backend "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_server "$SRC/tools/workbench_server.py"
verify_server "$SRC/smart-vision/services/workbench/workbench_server.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas legacy"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$WORKBENCH_DIR/model-registry.json" "public model registry"
  install_model_set "$SRC/tools/workbench-web/models" "$WORKBENCH_DIR/models" "public"
  installed=$((installed+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if run_sudo test -d "$MIRROR_TARGET/tools/workbench-web"; then
  log "install mirror workbench: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror canvas legacy"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$MIRROR_TARGET/tools/workbench-web/model-registry.json" "mirror model registry"
  install_model_set "$SRC/tools/workbench-web/models" "$MIRROR_TARGET/tools/workbench-web/models" "mirror"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  install_file "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
  installed=$((installed+1))
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if run_sudo test -d "$MIRROR_TARGET/smart-vision/services/workbench"; then
  log "install smart-vision workbench services"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart backend"
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
fi

if run_sudo test -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web"; then
  log "install smart-vision legacy workbench"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "smart legacy registry"
  install_model_set "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models" "smart legacy"
fi

if run_sudo test -d "$MIRROR_TARGET/smart-vision/config"; then
  log "install smart-vision config registry"
  install_file "$SRC/smart-vision/config/model-registry.json" "$MIRROR_TARGET/smart-vision/config/model-registry.json" "smart config registry"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas legacy"
  install_file "$SRC/tools/workbench-web/model-registry.json" "$RUNTIME_ROOT/tools/workbench-web/model-registry.json" "runtime model registry"
  install_model_set "$SRC/tools/workbench-web/models" "$RUNTIME_ROOT/tools/workbench-web/models" "runtime"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend"
  install_file "$SRC/tools/workbench_server.py" "$RUNTIME_ROOT/tools/workbench_server.py" "runtime workbench server"
fi

[ "$installed" -gt 0 ] || fail "no public or mirror workbench target found"

log "verify installed markers"
verify_installed_sudo "$WORKBENCH_DIR/model-registry.json" '"configId": "aiyunzhi-gpt-image-2"'
verify_installed_sudo "$WORKBENCH_DIR/models/aiyunzhi-grok-3-pro-video.json" '"adapter": "aiyunzhi-grok-video"'
verify_installed_sudo "$MIRROR_TARGET/tools/image_studio_backend.py" "def build_aiyunzhi_grok_video_request_body"
verify_installed_sudo "$MIRROR_TARGET/tools/workbench_server.py" "_inherit_model_key_for_origin"
verify_installed_sudo "$RUNTIME_ROOT/tools/workbench_server.py" "_inherit_model_key_for_origin"

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/tools/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/tools/workbench_server.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" ] && PY_FILES+=("$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py")
  [ -f "$RUNTIME_ROOT/tools/image_studio_backend.py" ] && PY_FILES+=("$RUNTIME_ROOT/tools/image_studio_backend.py")
  [ -f "$RUNTIME_ROOT/tools/workbench_server.py" ] && PY_FILES+=("$RUNTIME_ROOT/tools/workbench_server.py")
  if [ "${#PY_FILES[@]}" -gt 0 ]; then
    python3 -m py_compile "${PY_FILES[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
  fi
fi

RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench studio-workbench; do
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
