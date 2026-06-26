#!/usr/bin/env bash
set -euo pipefail

PKG="prompt-zoom-related-nodes-ui-fix-20260601031024"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 1
fi
if [ ! -d "$TARGET/tools/workbench-web" ]; then
  echo "target workbench not found: $TARGET/tools/workbench-web" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract package"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

SRC="$TMP_DIR/$PKG/tools/workbench-web/image-studio-canvas-next.html"
DEST="$TARGET/tools/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$SRC" ]; then
  echo "package file missing: $SRC" >&2
  exit 1
fi

log "backup current canvas"
mkdir -p "$BACKUP_DIR/tools/workbench-web"
cp -p "$DEST" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html"

log "install related node zoom UI fix"
install -m 0644 "$SRC" "$DEST"

log "verify markers"
grep -q "prompt-zoom-rich-aio-group" "$DEST"
grep -q "prompt-zoom-plain-aio-group" "$DEST"
grep -q "prompt-zoom-vn2-group" "$DEST"
grep -q "hasVn2Editor" "$DEST"
grep -q "placeVn2RatioPopup" "$DEST"
grep -q "prompt-zoom-large-group .vn2-ref-area .vn2-ref-chip" "$DEST"
grep -q "prompt-zoom-large-group .vn2-main.prompt-zoomed-item" "$DEST"
grep -q "prompt-zoom-ratio-group" "$DEST"
if grep -q "startRect" "$DEST"; then
  echo "canvas-next still contains stale startRect reference" >&2
  exit 1
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
