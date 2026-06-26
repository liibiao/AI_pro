#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="hongniao-video-model-picker-fix-20260624001856"
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

verify_adapter_markers(){
  local file="$1"
  grep -Fq "function hasStrongVideoModelSignal(model={},adapter='',endpoint='')" "$file"
  grep -Fq "if(hasStrongVideoModelSignal(model,adapter,endpoint))return 'video';" "$file"
  grep -Fq "'fullblood-video'" "$file"
  grep -Fq "text.includes('canvas_fullblood-video')" "$file"
}

verify_generation_markers(){
  local file="$1"
  grep -Fq "type:item?.type||item?.modelType||item?.category||item?.modelCategory||''," "$file"
  grep -Fq "modelType:item?.modelType||item?.type||item?.category||item?.modelCategory||''," "$file"
  grep -Fq "isFullbloodVideoModel(model={})" "$file"
}

verify_canvas_markers(){
  local file="$1"
  grep -Fq "function hasStrongVideoModelSignal(model={},adapter='',endpoint='')" "$file"
  grep -Fq "if(hasStrongVideoModelSignal(model,adapter,endpoint))return 'video';" "$file"
  grep -Fq "fullblood-seedance-2" "$file"
  grep -Fq "fullblood-omni-video-2" "$file"
}

verify_adapter_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function hasStrongVideoModelSignal(model={},adapter='',endpoint='')" "$file"
  run_sudo grep -Fq "if(hasStrongVideoModelSignal(model,adapter,endpoint))return 'video';" "$file"
  run_sudo grep -Fq "'fullblood-video'" "$file"
  run_sudo grep -Fq "text.includes('canvas_fullblood-video')" "$file"
}

verify_generation_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "type:item?.type||item?.modelType||item?.category||item?.modelCategory||''," "$file"
  run_sudo grep -Fq "modelType:item?.modelType||item?.type||item?.category||item?.modelCategory||''," "$file"
  run_sudo grep -Fq "isFullbloodVideoModel(model={})" "$file"
}

verify_canvas_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function hasStrongVideoModelSignal(model={},adapter='',endpoint='')" "$file"
  run_sudo grep -Fq "if(hasStrongVideoModelSignal(model,adapter,endpoint))return 'video';" "$file"
  run_sudo grep -Fq "fullblood-seedance-2" "$file"
  run_sudo grep -Fq "fullblood-omni-video-2" "$file"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_adapter_markers "$SRC/workbench-web/canvas-next/generator-adapters.js"
verify_adapter_markers "$SRC/tools/workbench-web/canvas-next/generator-adapters.js"
verify_adapter_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js"
verify_generation_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_generation_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_generation_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
verify_canvas_markers "$SRC/workbench-web/image-studio-canvas.html"
verify_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas.html"
verify_canvas_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

INSTALLED=0
install_if_parent_exists "$SRC/workbench-web/canvas-next/generator-adapters.js" "$WORKBENCH_DIR/canvas-next/generator-adapters.js" "public generator adapters"
install_if_parent_exists "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public generation service"
install_if_parent_exists "$SRC/workbench-web/image-studio-canvas.html" "$WORKBENCH_DIR/image-studio-canvas.html" "public canvas html"

install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generator-adapters.js" "mirror generator adapters"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js" "mirror generation service"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html" "mirror canvas html"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "legacy generator adapters"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy generation service"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "legacy canvas html"

install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generator-adapters.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generator-adapters.js" "runtime generator adapters"
install_if_parent_exists "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime generation service"
install_if_parent_exists "$SRC/tools/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas.html" "runtime canvas html"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "$RUNTIME_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generator-adapters.js" "runtime legacy generator adapters"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "runtime legacy generation service"
install_if_parent_exists "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$RUNTIME_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "runtime legacy canvas html"

[ "$INSTALLED" -gt 0 ] || fail "no install target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generator-adapters.js"; then
  verify_adapter_markers_sudo "$WORKBENCH_DIR/canvas-next/generator-adapters.js"
fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  verify_generation_markers_sudo "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas.html"; then
  verify_canvas_markers_sudo "$WORKBENCH_DIR/image-studio-canvas.html"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"; then
  verify_adapter_markers_sudo "$MIRROR_ROOT/tools/workbench-web/canvas-next/generator-adapters.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"; then
  verify_generation_markers_sudo "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"
fi
if run_sudo test -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html"; then
  verify_canvas_markers_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html"
fi

RESTARTED=0
for name in "${PM2_NAME:-}" ai-admin-api workbench-server manga-workbench smart-vision-workbench studio-workbench legacy-workbench; do
  if pm2_restart_if_exists "$name"; then
    RESTARTED=1
  fi
done
if [ "$RESTARTED" -eq 0 ]; then
  log "pm2 restart skipped; static files are updated"
fi
pm2_run save >/dev/null 2>&1 || true

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
