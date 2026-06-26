#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-shot-storyboard-node-local-edit-loading-20260603102627"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
CSS_DEST="$WEB_ROOT/workbench-web/canvas-next/tapnow-rewrite.css"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
MIRROR_CSS_DEST="$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css"
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
CSS_SRC="$WORK_DIR/$PKG/workbench-web/canvas-next/tapnow-rewrite.css"
[ -f "$HTML_SRC" ] || HTML_SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
[ -f "$CSS_SRC" ] || CSS_SRC="$WORK_DIR/workbench-web/canvas-next/tapnow-rewrite.css"
[ -f "$HTML_SRC" ] || fail "image-studio-canvas-next.html not found in package"
[ -f "$CSS_SRC" ] || fail "tapnow-rewrite.css not found in package"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
$SUDO mkdir -p "$BACKUP_DIR" "$(dirname "$HTML_DEST")" "$(dirname "$CSS_DEST")"

if [ -f "$HTML_DEST" ]; then
  $SUDO cp -p "$HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.web.bak"
fi
if [ -f "$CSS_DEST" ]; then
  $SUDO cp -p "$CSS_DEST" "$BACKUP_DIR/tapnow-rewrite.css.web.bak"
fi

$SUDO cp -p "$HTML_SRC" "$HTML_DEST"
$SUDO cp -p "$CSS_SRC" "$CSS_DEST"
$SUDO chmod 0644 "$HTML_DEST" "$CSS_DEST"
log "installed web files"

if [ -d "$(dirname "$MIRROR_HTML_DEST")" ]; then
  $SUDO mkdir -p "$(dirname "$MIRROR_CSS_DEST")"
  if [ -f "$MIRROR_HTML_DEST" ]; then
    $SUDO cp -p "$MIRROR_HTML_DEST" "$BACKUP_DIR/image-studio-canvas-next.html.mirror.bak"
  fi
  if [ -f "$MIRROR_CSS_DEST" ]; then
    $SUDO cp -p "$MIRROR_CSS_DEST" "$BACKUP_DIR/tapnow-rewrite.css.mirror.bak"
  fi
  $SUDO cp -p "$HTML_SRC" "$MIRROR_HTML_DEST"
  $SUDO cp -p "$CSS_SRC" "$MIRROR_CSS_DEST"
  $SUDO chmod 0644 "$MIRROR_HTML_DEST" "$MIRROR_CSS_DEST"
  log "updated mirror files"
fi

log "verify markers"
grep -Fq "tapnow-rewrite.css?v=20260603-shot-storyboard-local-edit-loading" "$HTML_DEST"
grep -Fq "function renderShotStoryboardEditPanel(n)" "$HTML_DEST"
grep -Fq "function openShotStoryboardFullEditor(id)" "$HTML_DEST"
grep -Fq "function openShotStoryboardLargePreview(id)" "$HTML_DEST"
grep -Fq "function isStoryboardShotEditNode(n)" "$HTML_DEST"
grep -Fq "data-prompt-action=\"previewShotStoryboardLarge\"" "$HTML_DEST"
grep -Fq "data-prompt-action=\"editShotStoryboardResult\"" "$HTML_DEST"
grep -Fq "data-prompt-action=\"shotEditRun\"" "$HTML_DEST"
grep -Fq "max-height:420px" "$HTML_DEST"
grep -Fq "切割分镜图" "$HTML_DEST"
grep -Fq "合成分镜图" "$HTML_DEST"
grep -Fq ".shot-storyboard-edit-panel" "$HTML_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
