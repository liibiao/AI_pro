#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-/tmp/prompt-zoom-ref-control-structure-fix-20260601011542.tar.gz}"
TARGET="${2:-/home/ubuntu/漫剧创作库}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d /tmp/prompt-zoom-ref-control-structure-fix-20260601011542-XXXXXX)"

log(){ printf '[deploy] %s\n' "$*"; }

trap 'rm -rf "$WORK"' EXIT

test -f "$ARCHIVE" || { echo "缺少部署包: $ARCHIVE" >&2; exit 1; }
test -d "$TARGET/tools/workbench-web" || { echo "画布目录不存在: $TARGET/tools/workbench-web" >&2; exit 1; }

log "extract package: $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK"
SRC="$WORK/prompt-zoom-ref-control-structure-fix-20260601011542"
test -f "$SRC/tools/workbench-web/image-studio-canvas-next.html" || { echo "部署包缺少 canvas-next HTML" >&2; exit 1; }

BACKUP_DIR="$TARGET/.deploy-backups/prompt-zoom-ref-control-structure-fix-20260601011542-$STAMP"
log "backup: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/tools/workbench-web"
cp -a "$TARGET/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/tools/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install canvas-next"
cp -f "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$TARGET/tools/workbench-web/image-studio-canvas-next.html"

log "verify markers"
grep -q "vn2-ref-chip vn2-chip-img" "$TARGET/tools/workbench-web/image-studio-canvas-next.html"
grep -q "data-vn2-preview-src" "$TARGET/tools/workbench-web/image-studio-canvas-next.html"
grep -q "prompt-zoom-large-group .prompt-ref-area:hover>.vn2-ref-expanded" "$TARGET/tools/workbench-web/image-studio-canvas-next.html"
if grep -q "startRect" "$TARGET/tools/workbench-web/image-studio-canvas-next.html"; then
  echo "canvas-next still contains stale startRect reference" >&2
  exit 1
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
