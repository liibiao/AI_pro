#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="openai-responses-hide-3k4k-20260605230500"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
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
file_contains(){
  local pattern="$1" file="$2"
  grep -Fq "$pattern" "$file"
}
file_contains_sudo(){
  local pattern="$1" file="$2"
  if [ -r "$file" ]; then
    grep -Fq "$pattern" "$file"
    return $?
  fi
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ]; then
    grep -Fq "$pattern" "$file"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n grep -Fq "$pattern" "$file" 2>/dev/null
    return $?
  fi
  grep -Fq "$pattern" "$file"
}
verify_markers(){
  local file="$1"
  file_contains "const OPENAI_RESPONSES_IMAGE_RESOLUTIONS=['1k','2k'];" "$file"
  file_contains "isOpenAiResponsesImageAdapter(adapter)?OPENAI_RESPONSES_IMAGE_RESOLUTIONS" "$file"
  if file_contains "function gptImage2LargeResolutionTier" "$file"; then
    fail "removed async large-resolution fallback is still present: $file"
  fi
  if file_contains "applyGptImage2LargeAsyncTaskHint" "$file"; then
    fail "removed async large-resolution hint is still present: $file"
  fi
}
verify_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "const OPENAI_RESPONSES_IMAGE_RESOLUTIONS=['1k','2k'];" "$file"
  run_sudo grep -Fq "isOpenAiResponsesImageAdapter(adapter)?OPENAI_RESPONSES_IMAGE_RESOLUTIONS" "$file"
  if file_contains_sudo "function gptImage2LargeResolutionTier" "$file"; then
    fail "removed async large-resolution fallback is still present: $file"
  fi
  if file_contains_sudo "applyGptImage2LargeAsyncTaskHint" "$file"; then
    fail "removed async large-resolution hint is still present: $file"
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
verify_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_TARGET/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
else
  log "mirror workbench skipped, not found: $MIRROR_TARGET/tools/workbench-web"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_markers_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
fi
if [ -f "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_markers_sudo "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
