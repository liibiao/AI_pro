#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-selected-toolbar-follow-20260604033223"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"

HTML_SRC="$SRC/workbench-web/image-studio-canvas-next.html"
CSS_SRC="$SRC/workbench-web/canvas-next/tapnow-rewrite.css"
[ -f "$HTML_SRC" ] || fail "missing package file: $HTML_SRC"
[ -f "$CSS_SRC" ] || fail "missing package file: $CSS_SRC"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$WEB_ROOT/backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR"

install_file(){
  local src="$1"
  local dest="$2"
  local backup_name="$3"
  $SUDO mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    $SUDO cp -p "$dest" "$BACKUP_DIR/$backup_name"
  fi
  $SUDO install -m 0644 "$src" "$dest"
  log "installed $dest"
}

install_file "$HTML_SRC" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "image-studio-canvas-next.html.web.bak"
install_file "$CSS_SRC" "$WEB_ROOT/workbench-web/canvas-next/tapnow-rewrite.css" "tapnow-rewrite.css.web.bak"

if [ -d "$MIRROR_ROOT/tools/workbench-web" ]; then
  MIRROR_HTML_SRC="$SRC/tools/workbench-web/image-studio-canvas-next.html"
  MIRROR_CSS_SRC="$SRC/tools/workbench-web/canvas-next/tapnow-rewrite.css"
  install_file "${MIRROR_HTML_SRC:-$HTML_SRC}" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "image-studio-canvas-next.html.mirror.bak"
  install_file "${MIRROR_CSS_SRC:-$CSS_SRC}" "$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css" "tapnow-rewrite.css.mirror.bak"
else
  log "mirror target not found, skipped: $MIRROR_ROOT/tools/workbench-web"
fi

DEST_HTML="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
DEST_CSS="$WEB_ROOT/workbench-web/canvas-next/tapnow-rewrite.css"

log "verify markers"
grep -Fq "tapnow-rewrite.css?v=20260604-selected-toolbar-follow" "$DEST_HTML"
grep -Fq "function positionSelectionToolbar" "$DEST_HTML"
grep -Fq "positionSelectionToolbar({left,top,width,height});" "$DEST_HTML"
grep -Fq "left:var(--sel-toolbar-left,50%)!important" "$DEST_CSS"
grep -Fq "top:var(--sel-toolbar-top,18px)!important" "$DEST_CSS"
if grep -Fq "top:62px!important" "$DEST_CSS"; then
  fail "old fixed selected toolbar top rule still exists"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
