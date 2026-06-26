#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-next-storyboard-precise-crop-drag-capsule-20260604025424"
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
grep -Fq "function storyboardImageGridLineScore(data,width,height,axis,pos)" "$HTML_DEST"
grep -Fq "function storyboardImageDetectAxisLines(imageData,width,height,parts,axis)" "$HTML_DEST"
grep -Fq "function storyboardImageCropRegions(img,grid)" "$HTML_DEST"
grep -Fq "const regions=storyboardImageCropRegions(img,grid);" "$HTML_DEST"
grep -Fq "ctx.drawImage(img,region.sx,region.sy,region.sw,region.sh,0,0,region.sw,region.sh);" "$HTML_DEST"
grep -Fq "cropRegion:region" "$HTML_DEST"
grep -Fq ".storygrid-panel-drag{position:absolute;right:8px;top:7px;" "$HTML_DEST"
grep -Fq "<span class=\"storygrid-panel-drag\" data-shot-drag=\"\${esc(no)}\" draggable=\"true\"" "$HTML_DEST"
grep -Fq "if(e.dataTransfer)e.dataTransfer.effectAllowed='move';" "$HTML_DEST"
grep -Fq "if(Date.now()-Number(btn._shotToggleAt||0)<450)return;" "$HTML_DEST"
grep -Fq "function createStoryboardCompositeImageNode(sourceId,imageEntry,opts={})" "$HTML_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
