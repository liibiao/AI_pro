#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="canvas-asset-toolbar-ref-shot-preview-20260604160518"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"

HTML_DEST="$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
CSS_DEST="$WEB_ROOT/workbench-web/canvas-next/tapnow-rewrite.css"
MIRROR_HTML_DEST="$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
MIRROR_CSS_DEST="$MIRROR_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$WORK_DIR"

HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
CSS_SRC="$SRC_ROOT/workbench-web/canvas-next/tapnow-rewrite.css"

[ -f "$HTML_SRC" ] || fail "package missing workbench-web/image-studio-canvas-next.html"
[ -f "$CSS_SRC" ] || fail "package missing workbench-web/canvas-next/tapnow-rewrite.css"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}"
mkdir -p "$BACKUP_DIR"

backup_one(){
  local src="$1"
  local name="$2"
  if [ -f "$src" ]; then
    cp -p "$src" "$BACKUP_DIR/$name" || true
  fi
}

install_one(){
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp -p "$src" "$dest"
  chmod 0644 "$dest"
  log "installed $dest"
}

log "backup current files"
backup_one "$HTML_DEST" "image-studio-canvas-next.html.web.bak"
backup_one "$CSS_DEST" "tapnow-rewrite.css.web.bak"
backup_one "$MIRROR_HTML_DEST" "image-studio-canvas-next.html.mirror.bak"
backup_one "$MIRROR_CSS_DEST" "tapnow-rewrite.css.mirror.bak"

log "install canvas-next files"
install_one "$HTML_SRC" "$HTML_DEST"
install_one "$CSS_SRC" "$CSS_DEST"

if [ -d "$(dirname "$MIRROR_HTML_DEST")" ]; then
  install_one "$HTML_SRC" "$MIRROR_HTML_DEST"
fi

if [ -d "$(dirname "$MIRROR_CSS_DEST")" ]; then
  install_one "$CSS_SRC" "$MIRROR_CSS_DEST"
fi

log "verify markers"
grep -Fq "20260604-asset-toolbar-ref-shot-preview" "$HTML_DEST"
grep -Fq "outputs:[p('prompt','prompt','资产提示词'),p('image','image','资产设计图')]" "$HTML_DEST"
grep -Fq "assetDesignHasPreview" "$HTML_DEST"
grep -Fq "downloadAssetDesign" "$HTML_DEST"
grep -Fq "c.kind==='prompt'&&src.type==='assetDesign'" "$HTML_DEST"
grep -Fq "sourceImageEntriesForPrompt" "$HTML_DEST"
grep -Fq "shot-preview-surface" "$HTML_DEST"
grep -Fq "shot-preview-surface" "$CSS_DEST"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
