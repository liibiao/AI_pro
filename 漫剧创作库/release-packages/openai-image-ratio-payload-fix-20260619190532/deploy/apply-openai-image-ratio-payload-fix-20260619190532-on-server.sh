#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="openai-image-ratio-payload-fix-20260619190532"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}}"

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

verify_html_markers(){
  local file="$1"
  grep -Fq "OPENAI_CHAT_IMAGE_SIZE_RATIOS=OPENAI_RESPONSES_IMAGE_SIZE_RATIOS.slice()" "$file"
  grep -Fq "function imageEndpointKindFromPath" "$file"
  grep -Fq "function normalizeOpenAiImageAdapterByEndpoint" "$file"
  grep -Fq "function normalizeImageResolutionSupportOptions(value,allowed=GPT_IMAGE_RESOLUTIONS)" "$file"
  grep -Fq "const adapterOptions=getImageResolutionOptionsForAdapter" "$file"
  grep -Fq "endpointKind=imageEndpointKindForModel" "$file"
  grep -Fq "protocol.adapter=protocol.adapter||'openai-edits'" "$file"
}

verify_backend_markers(){
  local file="$1"
  grep -Fq "OPENAI_IMAGE_ADAPTER_FAMILY" "$file"
  grep -Fq "OPENAI_IMAGE_DEFAULT_BASE_ADAPTERS" "$file"
  grep -Fq "def image_endpoint_kind_from_path" "$file"
  grep -Fq "def normalize_openai_image_adapter_by_endpoint" "$file"
  grep -Fq "adapter = normalize_openai_image_adapter_by_endpoint(adapter, endpoint_path)" "$file"
  grep -Fq "adapter in OPENAI_IMAGE_DEFAULT_BASE_ADAPTERS" "$file"
  grep -Fq "IMAGE_RATIO_EXTENSION_KEYS" "$file"
  grep -Fq "def _attach_image_ratio_extensions" "$file"
  grep -Fq "def _is_probably_image_ratio_extension_error" "$file"
  grep -Fq "\"aspect_ratio\", \"aspectRatio\", \"requestedRatio\", \"requestedPixelSize\"" "$file"
}

verify_html_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "OPENAI_CHAT_IMAGE_SIZE_RATIOS=OPENAI_RESPONSES_IMAGE_SIZE_RATIOS.slice()" "$file"
  run_sudo grep -Fq "function imageEndpointKindFromPath" "$file"
  run_sudo grep -Fq "function normalizeOpenAiImageAdapterByEndpoint" "$file"
  run_sudo grep -Fq "function normalizeImageResolutionSupportOptions(value,allowed=GPT_IMAGE_RESOLUTIONS)" "$file"
  run_sudo grep -Fq "const adapterOptions=getImageResolutionOptionsForAdapter" "$file"
  run_sudo grep -Fq "endpointKind=imageEndpointKindForModel" "$file"
  run_sudo grep -Fq "protocol.adapter=protocol.adapter||'openai-edits'" "$file"
}

verify_backend_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "OPENAI_IMAGE_ADAPTER_FAMILY" "$file"
  run_sudo grep -Fq "OPENAI_IMAGE_DEFAULT_BASE_ADAPTERS" "$file"
  run_sudo grep -Fq "def image_endpoint_kind_from_path" "$file"
  run_sudo grep -Fq "def normalize_openai_image_adapter_by_endpoint" "$file"
  run_sudo grep -Fq "adapter = normalize_openai_image_adapter_by_endpoint(adapter, endpoint_path)" "$file"
  run_sudo grep -Fq "adapter in OPENAI_IMAGE_DEFAULT_BASE_ADAPTERS" "$file"
  run_sudo grep -Fq "IMAGE_RATIO_EXTENSION_KEYS" "$file"
  run_sudo grep -Fq "def _attach_image_ratio_extensions" "$file"
  run_sudo grep -Fq "def _is_probably_image_ratio_extension_error" "$file"
  run_sudo grep -Fq "\"aspect_ratio\", \"aspectRatio\", \"requestedRatio\", \"requestedPixelSize\"" "$file"
}

verify_generation_service_markers(){
  local file="$1"
  grep -Fq "21:9','9:21','3:1','1:3" "$file"
  grep -Fq "const size=fireflyImage?aspectRatio:imageSizeFromRatioResolution" "$file"
  grep -Fq "'21:9':'1568x672'" "$file"
  grep -Fq "['3:1',3],['21:9',21/9]" "$file"
}

verify_generation_service_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "21:9','9:21','3:1','1:3" "$file"
  run_sudo grep -Fq "const size=fireflyImage?aspectRatio:imageSizeFromRatioResolution" "$file"
  run_sudo grep -Fq "'21:9':'1568x672'" "$file"
  run_sudo grep -Fq "['3:1',3],['21:9',21/9]" "$file"
}

compile_python_if_present(){
  local file="$1" label="$2"
  run_sudo test -f "$file" || return 0
  if command -v python3 >/dev/null 2>&1; then
    log "compile $label"
    run_sudo python3 -m py_compile "$file"
  else
    log "skip python compile for $label; python3 not found"
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
verify_html_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_html_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_backend_markers "$SRC/tools/image_studio_backend.py"
verify_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_generation_service_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_generation_service_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_generation_service_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi
install_if_parent_exists "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"

install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror tools image backend"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy generation service"

if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web"; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas html"
fi
if run_sudo test -d "$RUNTIME_ROOT/tools/workbench-web/canvas-next"; then
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
fi
if run_sudo test -d "$RUNTIME_ROOT/tools"; then
  install_file "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime tools image backend"
fi
if run_sudo test -d "$RUNTIME_ROOT/smart-vision/services/workbench"; then
  install_file "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$RUNTIME_ROOT/smart-vision/services/workbench/image_studio_backend.py" "runtime smart-vision image backend"
fi
if run_sudo test -d "$RUNTIME_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next"; then
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "runtime legacy generation service"
fi

[ "$INSTALLED" -gt 0 ] || fail "no install target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"; then
  verify_html_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/tools/image_studio_backend.py"
fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"; then
  verify_backend_markers_sudo "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  verify_generation_service_markers_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"; then
  verify_generation_service_markers_sudo "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"; then
  verify_generation_service_markers_sudo "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
fi

compile_python_if_present "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror tools image backend"
compile_python_if_present "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image backend"
compile_python_if_present "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime tools image backend"
compile_python_if_present "$RUNTIME_ROOT/smart-vision/services/workbench/image_studio_backend.py" "runtime smart-vision image backend"

RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench studio-workbench legacy-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; static files are updated and backend files are compiled"
fi
pm2_run save >/dev/null 2>&1 || true

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
