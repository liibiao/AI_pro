#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/video-reference-order-fix-20260613235956-${STAMP}"
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
  "workbench-web/canvas-next/state.js"
  "tools/workbench-web/image-studio-canvas.html"
  "tools/workbench-web/image-studio-canvas-next.html"
  "tools/workbench-web/canvas-next/state.js"
)

for rel in "${required_files[@]}"; do
  test -f "$WORKDIR/$rel"
done

for rel in \
  "workbench-web/image-studio-canvas.html" \
  "workbench-web/image-studio-canvas-next.html" \
  "tools/workbench-web/image-studio-canvas.html" \
  "tools/workbench-web/image-studio-canvas-next.html"; do
  grep -q "function videoReferenceImageEntries" "$WORKDIR/$rel"
  grep -q "function orderedInputConnections" "$WORKDIR/$rel"
  grep -q "videoReferenceImageEntries(n)" "$WORKDIR/$rel"
  if grep -q "const allImages=refImages" "$WORKDIR/$rel"; then
    echo "old video reference ordering path still exists in $rel" >&2
    exit 1
  fi
done

for rel in \
  "workbench-web/canvas-next/state.js" \
  "tools/workbench-web/canvas-next/state.js"; do
  grep -q "function inputConnections" "$WORKDIR/$rel"
done

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

for name in state.js; do
  if [ -f "$PUBLIC_ROOT/canvas-next/$name" ]; then
    cp "$PUBLIC_ROOT/canvas-next/$name" "$BACKUP_DIR/public/canvas-next/$name"
  fi
  if [ -f "$TOOLS_ROOT/canvas-next/$name" ]; then
    cp "$TOOLS_ROOT/canvas-next/$name" "$BACKUP_DIR/tools/canvas-next/$name"
  fi
done

install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas.html" "$PUBLIC_ROOT/image-studio-canvas.html"
install -m 0644 "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/workbench-web/canvas-next/state.js" "$PUBLIC_ROOT/canvas-next/state.js"

install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas.html" "$TOOLS_ROOT/image-studio-canvas.html"
install -m 0644 "$WORKDIR/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/tools/workbench-web/canvas-next/state.js" "$TOOLS_ROOT/canvas-next/state.js"

for file in \
  "$PUBLIC_ROOT/image-studio-canvas.html" \
  "$PUBLIC_ROOT/image-studio-canvas-next.html" \
  "$TOOLS_ROOT/image-studio-canvas.html" \
  "$TOOLS_ROOT/image-studio-canvas-next.html"; do
  grep -q "function videoReferenceImageEntries" "$file"
  grep -q "function orderedInputConnections" "$file"
  if grep -q "const allImages=refImages" "$file"; then
    echo "old video reference ordering path still exists after deploy: $file" >&2
    exit 1
  fi
done

for file in \
  "$PUBLIC_ROOT/canvas-next/state.js" \
  "$TOOLS_ROOT/canvas-next/state.js"; do
  grep -q "function inputConnections" "$file"
done

echo "deployed video-reference-order-fix-20260613235956"
echo "backup: $BACKUP_DIR"
echo "public: $PUBLIC_ROOT"
echo "tools: $TOOLS_ROOT"
