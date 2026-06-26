#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt-image-v2-resolution-model-fix-20260611214909"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"

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
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
}

pm2_restart_if_exists(){
  local name="$1"
  [ -n "$name" ] || return 1
  pm2_run show "$name" >/dev/null 2>&1 || return 1
  log "restart pm2: $name"
  pm2_run restart "$name" --update-env >/dev/null
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
  case "$dest" in
    /var/www/*)
      if id www-data >/dev/null 2>&1; then
        run_sudo chown www-data:www-data "$dest" 2>/dev/null || true
      fi
      ;;
  esac
  log "installed $dest"
}

install_if_parent_exists(){
  local src="$1" dest="$2" label="$3"
  if run_sudo test -d "$(dirname "$dest")"; then
    install_file "$src" "$dest" "$label"
    INSTALLED=$((INSTALLED+1))
  else
    log "skipped $label, target dir not found: $(dirname "$dest")"
  fi
}

verify_main_canvas_markers(){
  local file="$1"
  grep -Fq "const GPT_IMAGE_V2_RESOLUTIONS=['1k','2k','3k','4k'];" "$file"
  grep -Fq "assembleGptImageV2ModelName(model.model,officialSize.resolution||params.resolution)" "$file"
  grep -Fq "payload.resolution=String(officialSize.resolution||payloadResolution||'1K').toUpperCase();" "$file"
}

verify_modular_service_markers(){
  local file="$1"
  grep -Fq "function isGptImageV2Channel(model={},adapter='')" "$file"
  grep -Fq "function assembleGptImageV2ModelName(baseModel,resolution)" "$file"
  grep -Fq "assembleGptImageV2ModelName(modelInfo.model,geometry.resolution)" "$file"
  grep -Fq "model:requestModel" "$file"
  grep -Fq "if(['4K','4 K','4096','4096P','UHD'].includes(raw))return '4K';" "$file"
}

verify_legacy_canvas_markers(){
  local file="$1"
  grep -Fq "const GPT_IMAGE_V2_RESOLUTIONS=['1k','2k','3k','4k'];" "$file"
  grep -Fq 'return `${base}-${res}`;' "$file"
}

verify_legacy_service_markers(){
  local file="$1"
  grep -Fq "function normalizeGptImageV2Resolution(value)" "$file"
  grep -Fq "function assembleGptImageV2ModelName(baseModel,resolution)" "$file"
  grep -Fq "const requestModel=isGptImageV2Channel(model,modelInfo.protocol?.adapter)" "$file"
  grep -Fq "model:requestModel" "$file"
}

verify_backend_markers(){
  local file="$1"
  grep -Fq "def gpt_image_v2_model_for_resolution(base_model: str, resolution: str) -> str:" "$file"
  grep -Fq "payload.get(\"requestedResolution\")" "$file"
  grep -Fq "config.model = gpt_image_v2_model_for_resolution(config.model, resolution)" "$file"
}

verify_main_canvas_markers_sudo(){ run_sudo grep -Fq "assembleGptImageV2ModelName(model.model,officialSize.resolution||params.resolution)" "$1"; }
verify_modular_service_markers_sudo(){ run_sudo grep -Fq "assembleGptImageV2ModelName(modelInfo.model,geometry.resolution)" "$1"; }
verify_backend_markers_sudo(){ run_sudo grep -Fq "config.model = gpt_image_v2_model_for_resolution(config.model, resolution)" "$1"; }

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_main_canvas_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_modular_service_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_main_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_modular_service_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_backend_markers "$SRC/tools/image_studio_backend.py"
verify_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_legacy_canvas_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_legacy_service_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public canvas-next generation service"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror canvas-next generation service"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror image studio backend"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image studio backend"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "legacy canvas html"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy canvas-next generation service"

RUNTIME_ROOT="$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  log "install runtime legacy workbench mirror"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime canvas-next generation service"
  install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image studio backend"
fi

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_main_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  verify_modular_service_markers_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/tools/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
fi

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_ROOT/tools/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_ROOT/tools/image_studio_backend.py")
  [ -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py")
  if [ "${#PY_FILES[@]}" -gt 0 ]; then
    python3 -m py_compile "${PY_FILES[@]}" >/dev/null 2>&1 || log "python compile check skipped/failed"
  fi
fi

RESTARTED=0
for name in ai-admin-api workbench-server smart-vision-workbench studio-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; restart backend/workbench service manually if it is long-running"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
