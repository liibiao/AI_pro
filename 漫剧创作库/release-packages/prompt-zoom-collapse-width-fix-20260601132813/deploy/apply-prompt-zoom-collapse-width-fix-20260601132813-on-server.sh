#!/usr/bin/env bash
set -euo pipefail

PKG="prompt-zoom-collapse-width-fix-20260601132813"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$TARGET/.deploy-backups/${PKG}-${STAMP}"

log(){ echo "[deploy] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "this deploy writes to $TARGET; please run it with sudo" >&2
  exit 1
fi
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

DEST_OWNER="$(stat -c '%u:%g' "$DEST")"
DEST_MODE="$(stat -c '%a' "$DEST")"

log "install prompt zoom collapse and width fix"
install -m "$DEST_MODE" "$SRC" "$DEST"
chown "$DEST_OWNER" "$DEST"

log "verify markers"
grep -q "promptZoomCollapseIcon" "$DEST"
grep -q "setPromptZoomButtonState" "$DEST"
grep -q "收起提示词" "$DEST"
grep -q -- "--pz-width" "$DEST"
grep -Fq "Math.min(maxW,size*1.3)" "$DEST"
grep -q "prompt-zoom-source-open>.prompt-zoom-btn{right:10px;bottom:10px;width:44px;height:44px" "$DEST"
if grep -Eq "(width|min-width):var\\(--pz-size\\)" "$DEST"; then
  echo "canvas-next still contains old prompt zoom width references" >&2
  exit 1
fi
if grep -q "startRect" "$DEST"; then
  echo "canvas-next still contains stale startRect reference" >&2
  exit 1
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
