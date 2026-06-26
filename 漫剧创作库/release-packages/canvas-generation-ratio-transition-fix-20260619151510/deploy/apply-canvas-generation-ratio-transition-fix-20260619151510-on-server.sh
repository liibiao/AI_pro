#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-generation-ratio-transition-fix-20260619151510-${STAMP}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

PKG_ROOT="$WORKDIR/canvas-generation-ratio-transition-fix-20260619151510"
PUBLIC_HTML="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
TOOLS_HTML="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"

test -f "$PUBLIC_HTML"
test -f "$TOOLS_HTML"

grep -q "values.size||imageRatioFieldValue" "$PUBLIC_HTML"
grep -q "requestedRatio:size" "$PUBLIC_HTML"
grep -q "function generationRatioFromValueBag" "$PUBLIC_HTML"
grep -q "delete n.values._shotVideoPromptCellRatio" "$PUBLIC_HTML"
grep -q "assetConfirmPreviewStyle" "$PUBLIC_HTML"
grep -q "function nodeAnimatedPreviewSurface" "$PUBLIC_HTML"
grep -q "function captureNodePreviewResizeRect" "$PUBLIC_HTML"
grep -q "function animateNodePreviewResize" "$PUBLIC_HTML"
grep -q "will-change:height,min-height,aspect-ratio" "$PUBLIC_HTML"
grep -q "node.media-resizing .*storygrid-preview" "$PUBLIC_HTML"
grep -q "animateNodePreviewResize(id,oldPreviewRect" "$PUBLIC_HTML"

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/tools" "$PUBLIC_ROOT" "$TOOLS_ROOT"

if [ -f "$PUBLIC_ROOT/image-studio-canvas-next.html" ]; then
  cp "$PUBLIC_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/public/image-studio-canvas-next.html"
fi
if [ -f "$TOOLS_ROOT/image-studio-canvas-next.html" ]; then
  cp "$TOOLS_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/tools/image-studio-canvas-next.html"
fi

install -m 0644 "$PUBLIC_HTML" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$TOOLS_HTML" "$TOOLS_ROOT/image-studio-canvas-next.html"

grep -q "function animateNodePreviewResize" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "node.media-resizing .*storygrid-preview" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "values.size||imageRatioFieldValue" "$PUBLIC_ROOT/image-studio-canvas-next.html"
grep -q "delete n.values._shotVideoPromptCellRatio" "$PUBLIC_ROOT/image-studio-canvas-next.html"

echo "deployed canvas-generation-ratio-transition-fix-20260619151510"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT/image-studio-canvas-next.html"
echo "tools: $TOOLS_ROOT/image-studio-canvas-next.html"
