#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-pano-toolbar-absolute-center-fix-20260604010515"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
MIRROR_ROOT="${MIRROR_ROOT:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}"

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
verify_html(){
  local file="$1"
  grep -Fq "tapnow-rewrite.css?v=20260604-pano-toolbar-absolute-center-fix" "$file"
  grep -Fq "has-pano-gen-bar" "$file"
  grep -Fq "setPanoDragButtonActive(true)" "$file"
  grep -Fq "S.suppressPanoShotUntil=Date.now()+1000" "$file"
  grep -Fq "stage.classList.contains('pano-drag-button-active')" "$file"
}
verify_css(){
  local file="$1"
  grep -Fq "absolute centered panorama toolbar" "$file"
  grep -Fq ".pano-gen-layout.has-pano-gen-bar" "$file"
  grep -Fq "min-width:max-content!important" "$file"
  grep -Fq "clip-path:inset(50%)!important" "$file"
  grep -Fq "body.pano-drag-button-active .pano-shot-menu" "$file"
}
verify_html_sudo(){
  local file="$1"
  run_sudo grep -Fq "tapnow-rewrite.css?v=20260604-pano-toolbar-absolute-center-fix" "$file"
  run_sudo grep -Fq "has-pano-gen-bar" "$file"
  run_sudo grep -Fq "setPanoDragButtonActive(true)" "$file"
  run_sudo grep -Fq "S.suppressPanoShotUntil=Date.now()+1000" "$file"
  run_sudo grep -Fq "stage.classList.contains('pano-drag-button-active')" "$file"
}
verify_css_sudo(){
  local file="$1"
  run_sudo grep -Fq "absolute centered panorama toolbar" "$file"
  run_sudo grep -Fq ".pano-gen-layout.has-pano-gen-bar" "$file"
  run_sudo grep -Fq "min-width:max-content!important" "$file"
  run_sudo grep -Fq "clip-path:inset(50%)!important" "$file"
  run_sudo grep -Fq "body.pano-drag-button-active .pano-shot-menu" "$file"
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
verify_css "$SRC/workbench-web/canvas-next/tapnow-rewrite.css"
verify_html "$SRC/tools/workbench-web/image-studio-canvas-next.html"
verify_css "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

if [ -d "$WORKBENCH_DIR" ]; then
  log "install public workbench: $WORKBENCH_DIR"
  install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas html"
  install_file "$SRC/workbench-web/canvas-next/tapnow-rewrite.css" "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css" "public canvas css"
else
  log "public workbench skipped, not found: $WORKBENCH_DIR"
fi

if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  log "install mirror workbench: $MIRROR_ROOT/tools/workbench-web"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas html"
  install_file "$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css" "$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css" "mirror canvas css"
else
  log "mirror workbench skipped, not found: $MIRROR_ROOT/tools/workbench-web"
fi

log "verify installed markers"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  verify_html_sudo "$WORKBENCH_DIR/image-studio-canvas-next.html"
  verify_css_sudo "$WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"
fi
if [ -f "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" ]; then
  verify_html_sudo "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  verify_css_sudo "$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
