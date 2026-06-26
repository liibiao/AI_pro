#!/usr/bin/env bash
set -euo pipefail

PKG_NAME="blank-paint-large-workspace-fix-20260601121522"
PKG_PATH="/tmp/${PKG_NAME}.tar.gz"
TARGET="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
MIRROR="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"
BACKUP_DIR="/var/www/ai-admin/backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"
WORKDIR="/tmp/${PKG_NAME}-apply"

echo "[deploy] package: $PKG_PATH"
if [ ! -f "$PKG_PATH" ]; then
  echo "package not found: $PKG_PATH" >&2
  exit 1
fi

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
tar -xzf "$PKG_PATH" -C "$WORKDIR"

SRC="$WORKDIR/$PKG_NAME/workbench-web/image-studio-canvas-next.html"
if [ ! -f "$SRC" ]; then
  echo "source canvas html not found: $SRC" >&2
  exit 1
fi

echo "[deploy] backup: $BACKUP_DIR"
sudo mkdir -p "$BACKUP_DIR"
if [ -f "$TARGET" ]; then sudo cp "$TARGET" "$BACKUP_DIR/image-studio-canvas-next.html"; fi
if [ -f "$MIRROR" ]; then sudo cp "$MIRROR" "$BACKUP_DIR/image-studio-canvas-next.mirror.html"; fi

echo "[deploy] install: $TARGET"
sudo mkdir -p "$(dirname "$TARGET")"
sudo cp "$SRC" "$TARGET"
sudo chown www-data:www-data "$TARGET" 2>/dev/null || true
sudo chmod 0644 "$TARGET"

echo "[deploy] mirror: $MIRROR"
sudo mkdir -p "$(dirname "$MIRROR")"
sudo cp "$SRC" "$MIRROR"
sudo chown ubuntu:ubuntu "$MIRROR" 2>/dev/null || true
sudo chmod 0644 "$MIRROR"

echo "[deploy] verify markers"
grep -q "blankPaintCanvasSizeForNode" "$TARGET"
grep -q "openLightboxPaintForSingleImage" "$TARGET"
grep -q "data-paint-action=\"openLarge\"" "$TARGET"

rm -rf "$WORKDIR"
echo "[deploy] done"
echo "backup: $BACKUP_DIR"
