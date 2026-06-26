#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/single-image-paint-toolbar-position-scale-20260614112413-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

PKG_ROOT="$WORKDIR/single-image-paint-toolbar-position-scale-20260614112413"
SRC_PUBLIC_HTML="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS_HTML="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"
SRC_PUBLIC_CSS="$PKG_ROOT/workbench-web/canvas-next/tapnow-rewrite.css"
SRC_TOOLS_CSS="$PKG_ROOT/tools/workbench-web/canvas-next/tapnow-rewrite.css"

DST_PUBLIC_HTML="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS_HTML="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC_CSS="/var/www/ai-admin/workbench-web/canvas-next/tapnow-rewrite.css"
DST_TOOLS_CSS="/home/ubuntu/漫剧创作库/tools/workbench-web/canvas-next/tapnow-rewrite.css"

for file in "$SRC_PUBLIC_HTML" "$SRC_TOOLS_HTML" "$SRC_PUBLIC_CSS" "$SRC_TOOLS_CSS"; do
  test -f "$file"
  grep -q "single-image-paint-toolbar-scale:0.7" "$file"
  grep -q "node-type-singleImage>.paint-toolbar" "$file"
  grep -q "bottom:calc(-50px" "$file"
done

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web/canvas-next" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web/canvas-next" \
  "$(dirname "$DST_PUBLIC_HTML")" \
  "$(dirname "$DST_TOOLS_HTML")" \
  "$(dirname "$DST_PUBLIC_CSS")" \
  "$(dirname "$DST_TOOLS_CSS")"

if [ -f "$DST_PUBLIC_HTML" ]; then
  cp "$DST_PUBLIC_HTML" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS_HTML" ]; then
  cp "$DST_TOOLS_HTML" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_PUBLIC_CSS" ]; then
  cp "$DST_PUBLIC_CSS" "$BACKUP_DIR/var-www-ai-admin/workbench-web/canvas-next/tapnow-rewrite.css"
fi
if [ -f "$DST_TOOLS_CSS" ]; then
  cp "$DST_TOOLS_CSS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/canvas-next/tapnow-rewrite.css"
fi

install -m 0644 "$SRC_PUBLIC_HTML" "$DST_PUBLIC_HTML"
install -m 0644 "$SRC_TOOLS_HTML" "$DST_TOOLS_HTML"
install -m 0644 "$SRC_PUBLIC_CSS" "$DST_PUBLIC_CSS"
install -m 0644 "$SRC_TOOLS_CSS" "$DST_TOOLS_CSS"

for file in "$DST_PUBLIC_HTML" "$DST_TOOLS_HTML" "$DST_PUBLIC_CSS" "$DST_TOOLS_CSS"; do
  grep -q "single-image-paint-toolbar-scale:0.7" "$file"
  grep -q "node-type-singleImage>.paint-toolbar" "$file"
  grep -q "bottom:calc(-50px" "$file"
done

echo "deployed single-image-paint-toolbar-position-scale-20260614112413"
echo "backup: $BACKUP_DIR"
