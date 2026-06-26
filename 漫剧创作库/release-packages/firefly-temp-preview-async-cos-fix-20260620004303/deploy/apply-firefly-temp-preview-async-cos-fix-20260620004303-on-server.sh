#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG="firefly-temp-preview-async-cos-fix-20260620004303"
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
  grep -Fq "function isFireflyPresignedImageUrl(src)" "$file"
  grep -Fq "function remoteImageProxyUrl(src,maxW=COS_PREVIEW_THUMB_MAX,maxH=COS_PREVIEW_THUMB_MAX)" "$file"
  grep -Fq "function imagePreviewProxyUrl(src,maxW=COS_PREVIEW_THUMB_MAX,maxH=COS_PREVIEW_THUMB_MAX)" "$file"
  grep -Fq "return shouldProxyImagePreviewUrl(src)?remoteImageProxyUrl(src,maxW,maxH):'';" "$file"
  grep -Fq "const asyncStorageHint=!isStoredImageStorageStatus(storageStatus)&&(storagePending||taskHasAsyncStorageHint(task)||taskHasObjectStorageResultUrl(task));" "$file"
  grep -Fq "const storagePending=!isStoredImageStorageStatus(storage.status)&&(isAsyncStoragePendingStatus(storage.status)||taskHasAsyncStorageHint(task)||taskHasObjectStorageResultUrl(task));" "$file"
  grep -Fq "function imageEntryNeedsAsyncObjectStorageWatch(entry)" "$file"
  grep -Fq "async function watchImageAsyncObjectStorage(id,taskId,entryIndex=0,historyTime=0)" "$file"
  grep -Fq "watchImageAsyncObjectStorage(localCopyNodeId,entry.imageTaskId,idx,historyTime);" "$file"
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
