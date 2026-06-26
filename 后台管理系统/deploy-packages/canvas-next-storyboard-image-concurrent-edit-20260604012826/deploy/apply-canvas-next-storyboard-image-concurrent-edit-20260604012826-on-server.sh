#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-next-storyboard-image-concurrent-edit-20260604012826"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SUDO=""

can_write_path(){
  local path="$1"
  while [ ! -e "$path" ] && [ "$path" != "/" ]; do
    path="$(dirname "$path")"
  done
  [ -w "$path" ]
}

if [ "$(id -u)" -ne 0 ] && { ! can_write_path "$WEB_ROOT" || ! can_write_path "$MIRROR_ROOT"; }; then
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

HTML_SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_SRC" ] || HTML_SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
[ -f "$HTML_SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$HTML_DEST")"

if [ -f "$HTML_DEST" ]; then
  $SUDO cp -p "$HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

$SUDO cp -p "$HTML_SRC" "$HTML_DEST"
$SUDO chmod 0644 "$HTML_DEST"
log "installed web canvas"

if [ -d "$(dirname "$MIRROR_HTML_DEST")" ]; then
  if [ -f "$MIRROR_HTML_DEST" ]; then
    $SUDO cp -p "$MIRROR_HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  $SUDO cp -p "$HTML_SRC" "$MIRROR_HTML_DEST"
  $SUDO chmod 0644 "$MIRROR_HTML_DEST"
  log "updated mirror canvas"
fi

log "verify markers"
grep -Fq "function renderStoryboardImageResolutionSelect(n,v)" "$HTML_DEST"
grep -Fq "function normalizeStoryboardShotProgressMap(n)" "$HTML_DEST"
grep -Fq "function runStoryboardImageNode(id)" "$HTML_DEST"
grep -Fq "Promise.allSettled(selected.map(async no=>" "$HTML_DEST"
grep -Fq "setStoryboardShotEditProgress(n,no,pct,label)" "$HTML_DEST"
grep -Fq "Object.keys(normalizeStoryboardShotProgressMap(n)).length?'':renderGenerateProgress(n,'分镜图处理中')" "$HTML_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
