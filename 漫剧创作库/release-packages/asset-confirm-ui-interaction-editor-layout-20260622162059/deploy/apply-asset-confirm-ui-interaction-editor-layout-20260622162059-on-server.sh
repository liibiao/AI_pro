#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-ui-interaction-editor-layout-20260622162059-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"

DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

check_markers(){
  local file="$1"
  test -f "$file"
  grep -q "MIDJOURNEY_DETAIL_VIEWER.openingAnimating" "$file"
  grep -q ".mj-detail-modal.opening" "$file"
  grep -q "function assetConfirmYieldUiFrame" "$file"
  grep -q "selectCard(cardId,{rerender:!!cardId&&action==='edit'})" "$file"
  grep -q ".asset-confirm-field.asset-confirm-pano-panel .asset-confirm-pano-box{padding:7px" "$file"
  grep -q ".asset-confirm-editor-dialog{width:min(1400px" "$file"
  grep -q "asset-confirm-editor-preview{order:2" "$file"
  if grep -q "回填4宫格</button>" "$file"; then
    echo "old panorama four-grid label still present in $file" >&2
    exit 1
  fi
}

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  check_markers "$file"
done

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web" \
  "$(dirname "$DST_PUBLIC")" \
  "$(dirname "$DST_TOOLS")"

if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

check_markers "$DST_PUBLIC"
check_markers "$DST_TOOLS"

echo "deployed asset-confirm-ui-interaction-editor-layout-20260622162059"
echo "backup: $BACKUP_DIR"
