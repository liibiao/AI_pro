#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v3-v4-multi-video-audio-ref-20260603131747"
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
  log "installed $dest"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
grep -Fq "function mediaReferenceFields" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "payload.reference_video_urls=clippedVideos" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "payload.reference_audio_urls=clippedAudios" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "音频参考需要同时提供至少一个参考图或视频参考" "$SRC/workbench-web/image-studio-canvas-next.html"
grep -Fq "reference_video_urls" "$SRC/tools/image_studio_backend.py"
grep -Fq "reference_audio_urls" "$SRC/tools/image_studio_backend.py"
grep -Fq "音频参考需要同时提供至少一个参考图或视频参考" "$SRC/tools/image_studio_backend.py"
grep -Fq '"maxVideos": 3' "$SRC/workbench-web/models/sora-v3-pro.json"
grep -Fq '"maxVideos": 3' "$SRC/workbench-web/models/sora-v4-pro.json"
grep -Fq '"maxAudios": 3' "$SRC/workbench-web/models/sora-v4-pro.json"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas redirect"
  install_file "$SRC/workbench-web/models/sora-v3-pro.json" "$WORKBENCH_DIR/models/sora-v3-pro.json" "public sora v3 model"
  install_file "$SRC/workbench-web/models/sora-v4-pro.json" "$WORKBENCH_DIR/models/sora-v4-pro.json" "public sora v4 model"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next"
  install_file "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas.html" "mirror canvas redirect"
  install_file "$SRC/tools/workbench-web/models/sora-v3-pro.json" "$MIRROR_TARGET/tools/workbench-web/models/sora-v3-pro.json" "mirror sora v3 model"
  install_file "$SRC/tools/workbench-web/models/sora-v4-pro.json" "$MIRROR_TARGET/tools/workbench-web/models/sora-v4-pro.json" "mirror sora v4 model"
  install_file "$SRC/tools/image_studio_backend.py" "$MIRROR_TARGET/tools/image_studio_backend.py" "mirror image backend"
  install_file "$SRC/tools/workbench_server.py" "$MIRROR_TARGET/tools/workbench_server.py" "mirror workbench server"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/services/workbench" ]; then
  log "install smart-vision workbench services"
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_TARGET/smart-vision/services/workbench/image_studio_backend.py" "smart backend"
  install_file "$SRC/smart-vision/services/workbench/workbench_server.py" "$MIRROR_TARGET/smart-vision/services/workbench/workbench_server.py" "smart workbench server"
else
  log "smart-vision service mirror skipped"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models" ]; then
  log "install smart-vision legacy model configs"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v3-pro.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v3-pro.json" "smart legacy sora v3 model"
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v4-pro.json" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v4-pro.json" "smart legacy sora v4 model"
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web/models" ]; then
  log "install runtime legacy model mirror"
  install_file "$SRC/tools/workbench-web/models/sora-v3-pro.json" "$RUNTIME_ROOT/tools/workbench-web/models/sora-v3-pro.json" "runtime sora v3 model"
  install_file "$SRC/tools/workbench-web/models/sora-v4-pro.json" "$RUNTIME_ROOT/tools/workbench-web/models/sora-v4-pro.json" "runtime sora v4 model"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  run_sudo grep -Fq "payload.reference_video_urls=clippedVideos" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "payload.reference_audio_urls=clippedAudios" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  run_sudo grep -Fq "音频参考需要同时提供至少一个参考图或视频参考" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ]; then
  run_sudo grep -Fq "reference_audio_urls" "$MIRROR_TARGET/tools/image_studio_backend.py"
  run_sudo grep -Fq "音频参考需要同时提供至少一个参考图或视频参考" "$MIRROR_TARGET/tools/image_studio_backend.py"
fi
if [ -f "$WORKBENCH_DIR/models/sora-v4-pro.json" ]; then
  run_sudo grep -Fq '"maxAudios": 3' "$WORKBENCH_DIR/models/sora-v4-pro.json"
fi
if command -v python3 >/dev/null 2>&1 && [ -f "$MIRROR_TARGET/tools/image_studio_backend.py" ]; then
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
