#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance2-sd-multiref-fix-20260611145956"
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
verify_html(){
  local file="$1"
  grep -Fq "function isOfficialSd2VideoModel" "$file"
  grep -Fq "key.includes('seedance2-sd')" "$file"
  grep -Fq "const usesArtifexVideoProtocol=(usesSoraVideoProProtocol||usesSeedance2Protocol)&&!usesOfficialSd2Protocol;" "$file"
  grep -Fq "payload.generate_audio=payload.generateAudio!==false;" "$file"
  grep -Fq "payload.videos=clippedVideos;" "$file"
  grep -Fq "payload.audios=clippedAudios;" "$file"
}
verify_js(){
  local file="$1"
  grep -Fq "function isSeedance2SdVideoModel" "$file"
  grep -Fq "const usesSeedance2Sd=isSeedance2SdVideoModel(model);" "$file"
  grep -Fq "const usesArtifexVideo=(usesSoraVideoPro||usesSeedance2)&&!usesSeedance2Sd;" "$file"
  grep -Fq "const seedance2SdFields=usesSeedance2Sd" "$file"
  grep -Fq "generate_audio:values.generateAudio!==false" "$file"
}
verify_backend(){
  local file="$1"
  grep -Fq "def _is_seedance2_sd_adapter" "$file"
  grep -Fq "def build_seedance2_sd_request_body" "$file"
  grep -Fq 'body["images"] = image_urls' "$file"
  grep -Fq 'body["videos"] = video_urls' "$file"
  grep -Fq 'body["audios"] = audio_urls' "$file"
  grep -Fq "return start_seedance2_sd_video" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_js "$SRC/workbench-web/canvas-next/generation-service.js"
verify_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_js "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_backend "$SRC/smart-vision/services/workbench/image_studio_backend.py"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  if [ -d "$WORKBENCH_DIR/canvas-next" ]; then
    install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public canvas-next generation service"
  fi
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi
if [ -d "$WEB_ROOT" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html" "public root canvas next"
  installed=1
else
  log "public root skipped, not found: $WEB_ROOT"
fi
if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror canvas-next generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi
if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
  installed=1
else
  log "smart-vision services skipped, not found: $MIRROR_TARGET/smart-vision/services/workbench"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime canvas-next generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend"
  installed=1
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "key.includes('seedance2-sd')" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
  run_sudo grep -Fq "def build_seedance2_sd_request_body" "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if command -v python3 >/dev/null 2>&1 && [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ]; then
  python3 -m py_compile "$MIRROR_TARGET/tools/image_studio_backend.py" >/dev/null 2>&1 || log "python compile check skipped/failed"
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
