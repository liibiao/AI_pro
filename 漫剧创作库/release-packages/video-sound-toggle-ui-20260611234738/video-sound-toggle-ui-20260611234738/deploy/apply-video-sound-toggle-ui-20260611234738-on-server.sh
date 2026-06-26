#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-sound-toggle-ui-20260611234738"
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
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
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

verify_canvas_base(){
  local file="$1"
  grep -Fq "function getVideoModelSoundField" "$file"
  grep -Fq "function inferSd2VideoSoundField" "$file"
  grep -Fq "const soundToggle=caps.supportsGeneratedAudio" "$file"
  grep -Fq "<em>声</em>" "$file"
  grep -Fq "payload.soundField=soundField" "$file"
}

verify_canvas_next(){
  local file="$1"
  verify_canvas_base "$file"
  grep -Fq "prompt-zoom-btn{position:absolute!important;right:18px" "$file"
  grep -Fq "padding-bottom:max(32px" "$file"
  grep -Fq "width:46px!important" "$file"
}

verify_engine_file(){
  local file="$1"
  grep -Fq "var soundField = String(payload.soundField" "$file"
  grep -Fq "generate_audio: generateAudioValue !== false" "$file"
}

verify_renderer_file(){
  local file="$1"
  grep -Fq "function modelSoundField" "$file"
  grep -Fq "function inferSd2VideoSoundField" "$file"
  grep -Fq "tool-pill sound-pill" "$file"
}

verify_generation_service_file(){
  local file="$1"
  grep -Fq "function modelSoundField" "$file"
  grep -Fq "function inferSd2VideoSoundField" "$file"
  grep -Fq "const soundFields=soundField?" "$file"
  grep -Fq "soundField," "$file"
}

verify_backend_file(){
  local file="$1"
  grep -Fq "def _apply_video_sound_control" "$file"
  grep -Fq "def _set_nested_request_field" "$file"
  grep -Fq "_apply_video_sound_control" "$file"
}

verify_tapnow_file(){
  local file="$1"
  grep -Fq ".vn2-sound-toggle{width:56px!important" "$file"
  grep -Fq ".vn2-sound-switch{position:relative;width:22px" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_canvas_next "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_base "$SRC/workbench-web/image-studio-canvas.html"
verify_engine_file "$SRC/workbench-web/workbench-engine.js"
verify_renderer_file "$SRC/workbench-web/canvas-next/renderers.js"
verify_generation_service_file "$SRC/workbench-web/canvas-next/generation-service.js"
verify_backend_file "$SRC/tools/image_studio_backend.py"
verify_backend_file "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_canvas_base "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_engine_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js"
verify_renderer_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js"
verify_generation_service_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_tapnow_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas legacy"
  install_file "$SRC/workbench-web/workbench-engine.js" "$WORKBENCH_DIR/workbench-engine.js" "public workbench engine"
  install_file "$SRC/workbench-web/canvas-next/renderers.js" "$WORKBENCH_DIR/canvas-next/renderers.js" "public module renderer"
  install_file "$SRC/workbench-web/canvas-next/styles.css" "$WORKBENCH_DIR/canvas-next/styles.css" "public module styles"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
  installed=$((installed+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror canvas legacy"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$MIRROR_TARGET/tools/workbench-web/workbench-engine.js" "mirror workbench engine"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/renderers.js" "mirror module renderer"
  install_file "$SRC/tools/workbench-web/canvas-next/styles.css" "$MIRROR_TARGET/tools/workbench-web/canvas-next/styles.css" "mirror module styles"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  installed=$((installed+1))
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  log "install smart-vision workbench services"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart backend"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  log "install smart-vision legacy workbench"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/workbench-engine.js" "smart legacy engine"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/renderers.js" "smart legacy module renderer"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/styles.css" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/styles.css" "smart legacy module styles"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/tapnow-rewrite.css" "smart legacy tapnow styles"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "smart legacy generation service"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas legacy"
  install_file "$SRC/tools/workbench-web/workbench-engine.js" "$RUNTIME_ROOT/tools/workbench-web/workbench-engine.js" "runtime workbench engine"
  install_file "$SRC/tools/workbench-web/canvas-next/renderers.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/renderers.js" "runtime module renderer"
  install_file "$SRC/tools/workbench-web/canvas-next/styles.css" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/styles.css" "runtime module styles"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend"
fi

[ "$installed" -gt 0 ] || fail "no public or mirror workbench target found"

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "prompt-zoom-btn{position:absolute!important;right:18px" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "<em>声</em>" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$WORKBENCH_DIR/canvas-next/generation-service.js" ]; then
  run_sudo grep -Fq "function inferSd2VideoSoundField" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ]; then
  run_sudo grep -Fq "def _apply_video_sound_control" "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if [ -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" ]; then
  run_sudo grep -Fq "def _apply_video_sound_control" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"
fi
if command -v python3 >/dev/null 2>&1; then
  files=()
  [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ] && files+=("$MIRROR_TARGET/tools/image_studio_backend.py")
  [ -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" ] && files+=("$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py")
  [ "${#files[@]}" -eq 0 ] || python3 -m py_compile "${files[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
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
