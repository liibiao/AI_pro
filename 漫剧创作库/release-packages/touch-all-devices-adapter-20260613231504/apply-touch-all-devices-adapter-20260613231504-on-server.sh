#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/touch-all-devices-adapter-20260613231504-${STAMP}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-/home/ubuntu/漫剧创作库/tools/workbench-web}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

required_files=(
  "workbench-web/image-studio-canvas.html"
  "workbench-web/image-studio-canvas-next.html"
  "workbench-web/canvas-next/app.js"
  "workbench-web/canvas-next/styles.css"
  "workbench-web/canvas-next/tablet-touch-adapter.js"
  "tools/workbench-web/image-studio-canvas.html"
  "tools/workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/canvas-next/app.js"
  "tools/workbench-web/canvas-next/styles.css"
  "tools/workbench-web/canvas-next/tablet-touch-adapter.js"
)

for rel in "${required_files[@]}"; do
  test -f "$WORKDIR/$rel"
done

for rel in \
  "workbench-web/image-studio-canvas.html" \
  "workbench-web/image-studio-canvas-next.html" \
  "workbench-web/canvas-next/tablet-touch-adapter.js"; do
  grep -q "isTouchViewport" "$WORKDIR/$rel"
  grep -q "__canvasIsBlankCanvasTarget" "$WORKDIR/$rel"
  grep -q "pointer: coarse" "$WORKDIR/$rel"
  grep -q "pointerType==='touch'" "$WORKDIR/$rel"
  if grep -q "Math.min(w,h)>=600" "$WORKDIR/$rel"; then
    echo "old touch viewport threshold still exists in $rel" >&2
    exit 1
  fi
done

grep -q "installCanvasTabletTouchAdapter" "$WORKDIR/workbench-web/canvas-next/app.js"
grep -q "canvas-tablet-touch" "$WORKDIR/workbench-web/canvas-next/styles.css"

mkdir -p \
  "$BACKUP_DIR/public/canvas-next" \
  "$BACKUP_DIR/tools/canvas-next" \
  "$PUBLIC_ROOT/canvas-next" \
  "$TOOLS_ROOT/canvas-next"

for name in image-studio-canvas.html image-studio-canvas-next.html; do
  if [ -f "$PUBLIC_ROOT/$name" ]; then
    cp "$PUBLIC_ROOT/$name" "$BACKUP_DIR/public/$name"
  fi
  if [ -f "$TOOLS_ROOT/$name" ]; then
    cp "$TOOLS_ROOT/$name" "$BACKUP_DIR/tools/$name"
  fi
done

for name in app.js styles.css tablet-touch-adapter.js; do
  if [ -f "$PUBLIC_ROOT/canvas-next/$name" ]; then
    cp "$PUBLIC_ROOT/canvas-next/$name" "$BACKUP_DIR/public/canvas-next/$name"
  fi
  if [ -f "$TOOLS_ROOT/canvas-next/$name" ]; then
    cp "$TOOLS_ROOT/canvas-next/$name" "$BACKUP_DIR/tools/canvas-next/$name"
  fi
done

install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas.html" "$PUBLIC_ROOT/image-studio-canvas.html"
install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/app.js" "$PUBLIC_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/styles.css" "$PUBLIC_ROOT/canvas-next/styles.css"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/tablet-touch-adapter.js" "$PUBLIC_ROOT/canvas-next/tablet-touch-adapter.js"

install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$TOOLS_ROOT/image-studio-canvas.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/app.js" "$TOOLS_ROOT/canvas-next/app.js"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/styles.css" "$TOOLS_ROOT/canvas-next/styles.css"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/tablet-touch-adapter.js" "$TOOLS_ROOT/canvas-next/tablet-touch-adapter.js"

for file in \
  "$PUBLIC_ROOT/image-studio-canvas.html" \
  "$PUBLIC_ROOT/image-studio-canvas-next.html" \
  "$PUBLIC_ROOT/canvas-next/tablet-touch-adapter.js"; do
  grep -q "isTouchViewport" "$file"
  grep -q "__canvasIsBlankCanvasTarget" "$file"
  grep -q "pointer: coarse" "$file"
  grep -q "pointerType==='touch'" "$file"
  if grep -q "Math.min(w,h)>=600" "$file"; then
    echo "old touch viewport threshold still exists after deploy: $file" >&2
    exit 1
  fi
done

echo "deployed touch-all-devices-adapter-20260613231504"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT"
echo "tools: $TOOLS_ROOT"
