#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="firefly-gpt-image-model-suffix-fix-20260619014826"
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
    /home/ubuntu/*)
      if id ubuntu >/dev/null 2>&1; then
        run_sudo chown ubuntu:ubuntu "$dest" 2>/dev/null || true
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

verify_backend_markers(){
  local file="$1"
  grep -Fq "FIREFLY_GPT_IMAGE_GEOMETRY_RE" "$file"
  grep -Fq "if clean_base.startswith(\"firefly-gpt-image\"):" "$file"
  grep -Fq "def _firefly_gpt_image_base_model(model: str) -> str:" "$file"
  grep -Fq "_firefly_gpt_image_base_model(config.model)" "$file"
  grep -Fq '"1K": "gpt-image-2"' "$file"
}

verify_canvas_markers(){
  local file="$1"
  grep -Fq "function assembleFireflyGptImageModelName(baseModel,resolution,aspectRatio)" "$file"
  grep -Fq "(?:-(?:1|2|4)k)*$/i" "$file"
  grep -Fq "function assembleGptImageV2ModelName(baseModel,resolution)" "$file"
}

verify_canvas_next_markers(){
  local file="$1"
  verify_canvas_markers "$file"
  grep -Fq "function isAiyunzhiFireflyGptImageAdapter(adapter)" "$file"
}

verify_model_markers(){
  local file="$1"
  grep -Fq '"model": "firefly-gpt-image"' "$file"
  grep -Fq '"adapter": "aiyunzhi-firefly-gpt-image"' "$file"
  grep -Fq 'firefly-gpt-image-{resolution}-{aspectRatioSlug}' "$file"
}

verify_registry_markers(){
  local file="$1"
  grep -Fq '"configId": "aiyunzhi-gpt-image-2"' "$file"
  grep -Fq '"adapter": "aiyunzhi-firefly-gpt-image"' "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_backend_markers "$SRC/tools/image_studio_backend.py"
verify_backend_markers "$SRC/smart-vision/services/workbench/image_studio_backend.py"
verify_canvas_next_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_canvas_next_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_canvas_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
verify_canvas_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_model_markers "$SRC/workbench-web/models/aiyunzhi-gpt-image-2.json"
verify_model_markers "$SRC/workbench-web/models/aiyunzhi-firefly-gpt-image.json"
verify_model_markers "$SRC/tools/workbench-web/models/aiyunzhi-gpt-image-2.json"
verify_model_markers "$SRC/tools/workbench-web/models/aiyunzhi-firefly-gpt-image.json"
verify_model_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-gpt-image-2.json"
verify_model_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-firefly-gpt-image.json"
verify_registry_markers "$SRC/workbench-web/model-registry.json"
verify_registry_markers "$SRC/tools/workbench-web/model-registry.json"
verify_registry_markers "$SRC/smart-vision/config/model-registry.json"
verify_registry_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
if run_sudo test -d "$WORKBENCH_DIR"; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next html"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
  install_file "$SRC/workbench-web/model-registry.json" "$WORKBENCH_DIR/model-registry.json" "public model registry"
  install_file "$SRC/workbench-web/models/aiyunzhi-gpt-image-2.json" "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json" "public aiyunzhi gpt image 2 model"
  install_file "$SRC/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$WORKBENCH_DIR/models/aiyunzhi-firefly-gpt-image.json" "public firefly model"
  INSTALLED=$((INSTALLED+1))
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py" "mirror image studio backend"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas next html"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html" "mirror canvas html"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/workbench-web/model-registry.json" "$MIRROR_ROOT/tools/workbench-web/model-registry.json" "mirror model registry"
install_if_parent_exists "$SRC/tools/workbench-web/models/aiyunzhi-gpt-image-2.json" "$MIRROR_ROOT/tools/workbench-web/models/aiyunzhi-gpt-image-2.json" "mirror aiyunzhi gpt image 2 model"
install_if_parent_exists "$SRC/tools/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$MIRROR_ROOT/tools/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "mirror firefly model"
install_if_parent_exists "$SRC/smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" "smart-vision image studio backend"
install_if_parent_exists "$SRC/smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json" "smart-vision model registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "legacy canvas html"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy generation service"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "legacy model registry"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-gpt-image-2.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-gpt-image-2.json" "legacy aiyunzhi gpt image 2 model"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "legacy firefly model"

RUNTIME_ROOT="$MIRROR_ROOT/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if run_sudo test -d "$RUNTIME_ROOT/tools"; then
  log "install runtime legacy workbench mirror"
  install_if_parent_exists "$SRC/tools/image_studio_backend.py" "$RUNTIME_ROOT/tools/image_studio_backend.py" "runtime image studio backend"
  install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next html"
  install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas html"
  install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
  install_if_parent_exists "$SRC/tools/workbench-web/model-registry.json" "$RUNTIME_ROOT/tools/workbench-web/model-registry.json" "runtime model registry"
  install_if_parent_exists "$SRC/tools/workbench-web/models/aiyunzhi-gpt-image-2.json" "$RUNTIME_ROOT/tools/workbench-web/models/aiyunzhi-gpt-image-2.json" "runtime aiyunzhi gpt image 2 model"
  install_if_parent_exists "$SRC/tools/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "$RUNTIME_ROOT/tools/workbench-web/models/aiyunzhi-firefly-gpt-image.json" "runtime firefly model"
fi

[ "$INSTALLED" -gt 0 ] || fail "no target files installed"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "(?:-(?:1|2|4)k)*$/i" "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if run_sudo test -f "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json"; then
  run_sudo grep -Fq '"adapter": "aiyunzhi-firefly-gpt-image"' "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/image_studio_backend.py"; then
  run_sudo grep -Fq "FIREFLY_GPT_IMAGE_GEOMETRY_RE" "$MIRROR_ROOT/tools/image_studio_backend.py"
fi

if command -v python3 >/dev/null 2>&1; then
  PY_FILES=()
  [ -f "$MIRROR_ROOT/tools/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_ROOT/tools/image_studio_backend.py")
  [ -f "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py" ] && PY_FILES+=("$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py")
  [ -f "$RUNTIME_ROOT/tools/image_studio_backend.py" ] && PY_FILES+=("$RUNTIME_ROOT/tools/image_studio_backend.py")
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
