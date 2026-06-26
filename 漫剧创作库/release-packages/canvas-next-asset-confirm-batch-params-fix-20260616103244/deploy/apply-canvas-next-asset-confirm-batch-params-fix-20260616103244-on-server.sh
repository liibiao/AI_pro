#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: apply-canvas-next-asset-confirm-batch-params-fix-20260616103244-on-server.sh <package.tar.gz>}"
PKG_NAME="canvas-next-asset-confirm-batch-params-fix-20260616103244"
WORK_DIR="$(mktemp -d)"
STAMP="$(date +%Y%m%d%H%M%S)"
PUBLIC_DIR="/var/www/ai-admin/workbench-web"
MIRROR_DIR="/home/ubuntu/漫剧创作库/tools/workbench-web"
BACKUP_DIR="/tmp/${PKG_NAME}-backup-${STAMP}"

cleanup(){
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG_NAME"
PUBLIC_FILE="$SRC/workbench-web/image-studio-canvas-next.html"
MIRROR_FILE="$SRC/tools/workbench-web/image-studio-canvas-next.html"

verify_file(){
  local file="$1"
  test -f "$file"
  grep -Fq "async function generateAllAssetConfirmCards" "$file"
  grep -Fq "card.generation={status:'queued',progress:1,label:'排队生成',error:''};" "$file"
  grep -Fq "data-asset-confirm-global-field=\"size\"" "$file"
  grep -Fq "data-asset-confirm-global-field=\"modelKey\"" "$file"
  grep -Fq "data-asset-confirm-global-field=\"resolution\"" "$file"
  grep -Fq "asset-confirm-mj-inline" "$file"
  grep -Fq "fallbackModelKey" "$file"
  grep -Fq "全部资产生成" "$file"
}

verify_file "$PUBLIC_FILE"
verify_file "$MIRROR_FILE"

mkdir -p "$BACKUP_DIR/public-workbench" "$BACKUP_DIR/tools-workbench"
if [[ -f "$PUBLIC_DIR/image-studio-canvas-next.html" ]]; then
  cp -a "$PUBLIC_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-workbench/"
fi
if [[ -f "$MIRROR_DIR/image-studio-canvas-next.html" ]]; then
  cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/tools-workbench/"
fi

mkdir -p "$PUBLIC_DIR" "$MIRROR_DIR"
cp -a "$PUBLIC_FILE" "$PUBLIC_DIR/image-studio-canvas-next.html"
cp -a "$MIRROR_FILE" "$MIRROR_DIR/image-studio-canvas-next.html"

verify_file "$PUBLIC_DIR/image-studio-canvas-next.html"
verify_file "$MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] installed public canvas: $PUBLIC_DIR/image-studio-canvas-next.html"
echo "[deploy] installed mirror canvas: $MIRROR_DIR/image-studio-canvas-next.html"
echo "[deploy] backup: $BACKUP_DIR"
echo "Hard-refresh: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
