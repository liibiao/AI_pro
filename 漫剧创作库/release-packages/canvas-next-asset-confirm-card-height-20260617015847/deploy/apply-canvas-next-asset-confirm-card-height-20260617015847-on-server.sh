#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG_NAME="canvas-next-asset-confirm-card-height-20260617015847"
PUBLIC_HTML="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 /tmp/${PKG_NAME}.tar.gz" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="/tmp/${PKG_NAME}-backup-${STAMP}"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC_PUBLIC="$TMP_DIR/$PKG_NAME/workbench-web/image-studio-canvas-next.html"
SRC_MIRROR="$TMP_DIR/$PKG_NAME/tools/workbench-web/image-studio-canvas-next.html"

for src in "$SRC_PUBLIC" "$SRC_MIRROR"; do
  test -f "$src"
  grep -Fq "grid-auto-rows:232px" "$src"
  grep -Fq "height:232px" "$src"
  grep -Fq "align-content:start" "$src"
  grep -Fq "asset-confirm-card.v2 .asset-confirm-actions" "$src"
done

mkdir -p "$BACKUP_DIR/public-workbench" "$BACKUP_DIR/tools-workbench"
if [[ -f "$PUBLIC_HTML" ]]; then cp -a "$PUBLIC_HTML" "$BACKUP_DIR/public-workbench/image-studio-canvas-next.html"; fi
if [[ -f "$MIRROR_HTML" ]]; then cp -a "$MIRROR_HTML" "$BACKUP_DIR/tools-workbench/image-studio-canvas-next.html"; fi

mkdir -p "$(dirname "$PUBLIC_HTML")" "$(dirname "$MIRROR_HTML")"
cp -a "$SRC_PUBLIC" "$PUBLIC_HTML"
cp -a "$SRC_MIRROR" "$MIRROR_HTML"

for target in "$PUBLIC_HTML" "$MIRROR_HTML"; do
  grep -Fq "grid-auto-rows:232px" "$target"
  grep -Fq "height:232px" "$target"
  grep -Fq "align-content:start" "$target"
  grep -Fq "asset-confirm-card.v2 .asset-confirm-actions" "$target"
done

echo "[deploy] installed public canvas: $PUBLIC_HTML"
echo "[deploy] installed mirror canvas: $MIRROR_HTML"
echo "[deploy] backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
