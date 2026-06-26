#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:?usage: $0 /tmp/canvas-model-config-ratio-options-20260624100524.tar.gz}"
PKG_NAME="canvas-model-config-ratio-options-20260624100524"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
REPO_ROOT="${REPO_ROOT:-/home/ubuntu/漫剧创作库}"
MIRROR_TARGET="${MIRROR_TARGET:-$REPO_ROOT}"
BACKUP_ROOT="${REPO_ROOT}/.deploy-backups"
BACKUP_DIR="${BACKUP_ROOT}/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

run_sudo() {
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

backup_file() {
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local backup="$BACKUP_DIR/${dest#/}"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

install_file() {
  local src="$1" dest="$2" label="${3:-file}"
  [ -f "$src" ] || fail "missing package file: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 644 "$dest"
  log "installed ${label}: $dest"
}

verify_markers() {
  local file="$1"
  grep -Fq "text.includes('canvas-aiyunzhi-gpt-image-2-api')" "$file"
  grep -Fq "text.includes('canvas_aiyunzhi-gpt-image-2-api')" "$file"
  if grep -Fq "(text.includes('aiyunzhi')&&text.includes('gpt-image-2'))" "$file"; then
    fail "broad aiyunzhi gpt-image-2 matcher still present in $file"
  fi
}

verify_canvas_options_marker() {
  local file="$1"
  verify_markers "$file"
  grep -Fq "const configured=normalizeImageAspectRatioSupportOptions(imageAspectRatioSupportSourceForModel(model,resolution),GPT_IMAGE_SIZE_RATIOS);" "$file"
  grep -Fq "model?.aspectRatios||model?.aspect_ratios||model?.ratios||model?.sizeRatios||model?.size_ratios||model?.imageAspectRatios||model?.image_aspect_ratios" "$file"
}

log "extract $ARCHIVE_PATH"
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG_NAME"
[ -d "$SRC" ] || fail "package root not found: $SRC"

verify_canvas_options_marker "$SRC/workbench-web/image-studio-canvas-next.html"
verify_markers "$SRC/workbench-web/canvas-next/generation-service.js"
verify_canvas_options_marker "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_markers "$SRC/tools/workbench-web/canvas-next/generation-service.js"
verify_markers "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

installed=0
if [ -d "$WORKBENCH_DIR" ]; then
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas next"
  install_file "$SRC/workbench-web/canvas-next/generation-service.js" "$WORKBENCH_DIR/canvas-next/generation-service.js" "public canvas-next generation service"
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
  installed=1
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

if [ -d "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next" ]; then
  install_file "$SRC/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_TARGET/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "legacy canvas-next generation service"
  installed=1
fi

RUNTIME_ROOT="$MIRROR_TARGET/smart-vision/.runtime/legacy-workbench-root/smart-vision-workspace"
if [ -d "$RUNTIME_ROOT/tools/workbench-web" ]; then
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$RUNTIME_ROOT/tools/workbench-web/image-studio-canvas-next.html" "runtime canvas next"
  install_file "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$RUNTIME_ROOT/tools/workbench-web/canvas-next/generation-service.js" "runtime canvas-next generation service"
  installed=1
fi

[ "$installed" = "1" ] || fail "no workbench target found"

log "verify installed markers"
if run_sudo test -f "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
  run_sudo grep -Fq "text.includes('canvas-aiyunzhi-gpt-image-2-api')" "$WORKBENCH_DIR/image-studio-canvas-next.html"
  if run_sudo grep -Fq "(text.includes('aiyunzhi')&&text.includes('gpt-image-2'))" "$WORKBENCH_DIR/image-studio-canvas-next.html"; then
    fail "public canvas still has broad aiyunzhi matcher"
  fi
fi
if run_sudo test -f "$WORKBENCH_DIR/canvas-next/generation-service.js"; then
  run_sudo grep -Fq "text.includes('canvas-aiyunzhi-gpt-image-2-api')" "$WORKBENCH_DIR/canvas-next/generation-service.js"
fi

log "done"
printf 'Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=%s\n' "$(date +%Y%m%d%H%M%S)"
