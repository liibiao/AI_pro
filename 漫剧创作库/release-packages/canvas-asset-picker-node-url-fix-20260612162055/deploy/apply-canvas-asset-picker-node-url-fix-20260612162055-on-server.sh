#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG="canvas-asset-picker-node-url-fix-20260612162055"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "[deploy] archive not found: $ARCHIVE" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PUBLIC_DIR="/var/www/ai-admin/workbench-web"
MIRROR_DIR="/home/ubuntu/漫剧创作库/tools/workbench-web"
BACKUP_ROOT="/home/ubuntu/漫剧创作库/.deploy-backups"
BACKUP_DIR="$BACKUP_ROOT/$PKG-$(date +%Y%m%d%H%M%S)"

echo "[deploy] extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"
PKG_ROOT="$TMP_DIR/$PKG"
PUBLIC_FILE="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_FILE="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"

verify_file() {
  local file="$1"
  grep -Fq "const ASSET_REFERENCE_PICKER={open:false,nodeId:'',category:'all',selectedIds:{}" "$file"
  grep -Fq ".asset-picker-foot{min-width:0;overflow:hidden;" "$file"
  grep -Fq ".asset-picker-status{min-width:0;max-width:calc(100% - 236px);" "$file"
  grep -Fq ".asset-picker-actions{position:relative;z-index:3;margin-left:auto;" "$file"
  grep -Fq ".asset-picker-card{box-sizing:border-box;min-width:0;width:100%;" "$file"
  grep -Fq "body.asset-picker-open .lb,body.asset-picker-open #video-preview-overlay{z-index:230650!important}" "$file"
  grep -Fq "if(['FAILED','ERROR','TIMEOUT','CANCELLED','EXPIRED'].includes(status))return false;" "$file"
  grep -Fq "if(['failed','expired'].includes(storage.status))return false;" "$file"
  grep -Fq "function assetPickerLimitsForNode(nodeId,opts={},allowedKinds=['image'])" "$file"
  grep -Fq "const select=()=>toggleAssetPickerSelection(card.dataset.assetPickerTask||'',tasks);" "$file"
  grep -Fq "function applyAssetTasksToNode(id,tasks,opts={})" "$file"
  grep -Fq "source:'asset-library',uploaded:true,uploadMode:'object_storage'" "$file"
  grep -Fq "data-single-video-replace" "$file"
  grep -Fq "data-single-audio-replace" "$file"
  grep -Fq "openNodeAssetReferencePicker(n.id,{replaceSingle:true,allowedKinds:['video'],title:'选择资产库视频'})" "$file"
  grep -Fq "openNodeAssetReferencePicker(n.id,{replaceSingle:true,allowedKinds:['audio'],title:'选择资产库音频'})" "$file"
}

echo "[deploy] verify package markers"
verify_file "$PUBLIC_FILE"
verify_file "$MIRROR_FILE"

mkdir -p "$BACKUP_DIR"
echo "[deploy] backup dir: $BACKUP_DIR"
if [[ -f "$PUBLIC_DIR/image-studio-canvas-next.html" ]]; then
  mkdir -p "$BACKUP_DIR/public-workbench"
  cp -a "$PUBLIC_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-workbench/"
fi
if [[ -f "$MIRROR_DIR/image-studio-canvas-next.html" ]]; then
  mkdir -p "$BACKUP_DIR/tools-workbench"
  cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/tools-workbench/"
fi

echo "[deploy] install public workbench: $PUBLIC_DIR"
mkdir -p "$PUBLIC_DIR"
cp -a "$PUBLIC_FILE" "$PUBLIC_DIR/image-studio-canvas-next.html"
echo "[deploy] installed $PUBLIC_DIR/image-studio-canvas-next.html"

echo "[deploy] install mirror workbench: $MIRROR_DIR"
mkdir -p "$MIRROR_DIR"
cp -a "$MIRROR_FILE" "$MIRROR_DIR/image-studio-canvas-next.html"
echo "[deploy] installed $MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] verify installed markers"
verify_file "$PUBLIC_DIR/image-studio-canvas-next.html"
verify_file "$MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
