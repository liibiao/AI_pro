#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance2-artifex-multiref-fix-20260612235405"
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
  if [ "$(id -un 2>/dev/null || true)" = "$PM2_USER" ] && command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
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
install_if_dir(){
  local src="$1" dest="$2" label="$3" dir
  dir="$(dirname "$dest")"
  if run_sudo test -d "$dir"; then
    install_file "$src" "$dest" "$label"
    return 0
  fi
  log "$label skipped, not found: $dir"
  return 1
}
verify_next_html(){
  local file="$1"
  grep -Fq "function dedupeUnifiedInputFiles(inputFiles)" "$file"
  grep -Fq "videoMode=(refImgs.length>1||mediaRefCount>0)?'reference-to-video':'image-to-video';" "$file"
  grep -Fq "payload.reference_image_urls=referenceImages;" "$file"
  grep -Fq "payload.referenceVideoUrls=clippedVideos;" "$file"
  grep -Fq "payload.referenceAudioUrls=clippedAudios;" "$file"
}
verify_legacy_html(){
  local file="$1"
  grep -Fq "videoMode=(refImgs.length>1||mediaRefCount>0)?'reference-to-video':'image-to-video';" "$file"
  grep -Fq "payload.reference_image_urls=referenceImages;" "$file"
  grep -Fq "payload.referenceVideoUrls=payload.extra_videos;" "$file"
  grep -Fq "payload.referenceAudioUrls=payload.extra_audios;" "$file"
}
verify_service(){
  local file="$1"
  grep -Fq "reference_image_urls:artifexVideoImages" "$file"
  grep -Fq "const backendMode=imageRefs.length>1?'reference-to-video':(imageRefs.length?'image-to-video':'text-to-video');" "$file"
  grep -Fq "videoMode:backendMode" "$file"
}
verify_backend(){
  local file="$1"
  grep -Fq "if is_artifex_seedance and explicit_image_url:" "$file"
  grep -Fq "explicit_image_url = []" "$file"
  grep -Fq '"referenceImageUrls"' "$file"
  grep -Fq '"referenceVideoUrls"' "$file"
  grep -Fq '"referenceAudioUrls"' "$file"
}
verify_next_html_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_next_html); verify_next_html \"\$0\"" "$file"
}
verify_legacy_html_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_legacy_html); verify_legacy_html \"\$0\"" "$file"
}
verify_service_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_service); verify_service \"\$0\"" "$file"
}
verify_backend_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_backend); verify_backend \"\$0\"" "$file"
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_next_html "$SRC/workbench-web/image-studio-canvas-next.html"
verify_legacy_html "$SRC/workbench-web/image-studio-canvas.html"
verify_service "$SRC/workbench-web/canvas-next/generation-service.js"
verify_next_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_legacy_html "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_service "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_backend "$SRC/tools/image_studio_backend.py"
verify_backend "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_legacy_html "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_service "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public legacy canvas"
  install_if_dir "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service" || true
  installed=1
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$WEB_ROOT" ]; then
  install_if_dir "$SRC/workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/image-studio-canvas-next.html" "public root canvas next" || true
  install_if_dir "$SRC/workbench-web/image-studio-canvas.html" "$WEB_ROOT/image-studio-canvas.html" "public root legacy canvas" || true
  installed=1
else
  log "public root skipped, not found: $WEB_ROOT"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror legacy canvas"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  installed=1
else
  log "mirror tools workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
  installed=1
else
  log "smart-vision services skipped, not found: $MIRROR_TARGET/smart-vision/services/workbench"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web" ]; then
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "smart legacy canvas"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "smart legacy generation service"
  installed=1
else
  log "smart legacy workbench skipped, not found: $MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime legacy canvas"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_if_dir "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image backend" || true
  installed=1
else
  log "runtime workbench skipped, not found: $RUNTIME_ROOT/tools/workbench-web"
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then verify_next_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"; fi
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas.html"; then verify_legacy_html_sudo "$WORKBENCH_DIR/image-studio-canvas.html"; fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then verify_service_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"; fi
if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then verify_backend_sudo "$MIRROR_TARGET/tools/image_studio_backend.py"; fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then verify_backend_sudo "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"; then verify_legacy_html_sudo "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"; fi
if run_sudo test -f "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"; then verify_service_sudo "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"; fi

if command -v python3 >/dev/null 2>&1; then
  if run_sudo test -f "$MIRROR_TARGET/tools/image_studio_backend.py"; then
    python3 -m py_compile "$MIRROR_TARGET/tools/image_studio_backend.py" >/dev/null 2>&1 || log "mirror backend compile check skipped/failed"
  fi
  if run_sudo test -f "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py"; then
    python3 -m py_compile "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" >/dev/null 2>&1 || log "smart backend compile check skipped/failed"
  fi
fi

log "restart backend/workbench if pm2 process exists"
RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench smart-vision-bridge; do
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
