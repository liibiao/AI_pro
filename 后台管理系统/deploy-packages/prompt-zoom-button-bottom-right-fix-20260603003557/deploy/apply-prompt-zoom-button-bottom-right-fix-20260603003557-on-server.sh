#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="prompt-zoom-button-bottom-right-fix-20260603003557"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  DEST_PARENT="$(dirname "$DEST")"
  if { [ -d "$DEST_PARENT" ] && [ -w "$DEST_PARENT" ]; } && [ -d "$MIRROR_ROOT" ] && [ -w "$MIRROR_ROOT" ]; then
    SUDO=""
  else
    SUDO="sudo"
  fi
fi

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas-next.html"
[ -f "$SRC" ] || fail "image-studio-canvas-next.html not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$DEST")"

if [ -f "$DEST" ]; then
  $SUDO cp -p "$DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi

$SUDO cp -p "$SRC" "$DEST"
$SUDO chmod 0644 "$DEST"
log "installed $DEST"

if [ -d "$(dirname "$MIRROR_DEST")" ]; then
  if [ -f "$MIRROR_DEST" ]; then
    $SUDO cp -p "$MIRROR_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  $SUDO cp -p "$SRC" "$MIRROR_DEST"
  $SUDO chmod 0644 "$MIRROR_DEST"
  log "updated mirror $MIRROR_DEST"
fi

log "verify markers"
grep -Fq ".prompt-zoom-source-open>.prompt-zoom-btn{right:22px!important;top:auto!important;bottom:22px!important" "$DEST"
grep -Fq ".prompt-zoom-source-open>.prompt-zoom-btn{right:12px!important;top:auto!important;bottom:12px!important" "$DEST"
grep -Fq ".prompt-zoom-large-group.prompt-zoom-unified-group .prompt-zoom-source-open :is(.aio-textarea,.prompt-node-inputbox,.i2i-text-input,.vn2-prompt-input,.vn2-prompt-text){padding-right:58px!important;padding-bottom:66px!important" "$DEST"
grep -Fq ".prompt-zoom-large-group.prompt-zoom-txt2img-group .prompt-zoom-source-open .aio-textarea.aio-t2i-prompt{padding-right:58px!important;padding-bottom:66px!important" "$DEST"
grep -Fq "function setPromptZoomButtonState(sourceEl,open)" "$DEST"
grep -Fq "function openPromptZoomEditor(nodeId,sourceEl,moveTarget,kind='提示词')" "$DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
