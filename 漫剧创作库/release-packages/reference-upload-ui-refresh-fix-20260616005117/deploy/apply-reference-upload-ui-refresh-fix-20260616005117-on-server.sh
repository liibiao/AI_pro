#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /tmp/reference-upload-ui-refresh-fix-20260616005117.tar.gz" >&2
  exit 2
fi

PKG_NAME="reference-upload-ui-refresh-fix-20260616005117"
WORK_DIR="/tmp/${PKG_NAME}"
ROOT_DIR="/var/www/ai-admin"
PUBLIC_DIR="/var/www/ai-admin/workbench-web"
PUBLIC_TOOLS_DIR="/var/www/ai-admin/tools/workbench-web"
MIRROR_DIR="/home/ubuntu/漫剧创作库/tools/workbench-web"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG_NAME}-$(date +%Y%m%d%H%M%S)"

echo "[deploy] extract $ARCHIVE"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

HTML_SRC="$WORK_DIR/workbench-web/image-studio-canvas-next.html"
HTML_MIRROR_SRC="$WORK_DIR/tools/workbench-web/image-studio-canvas-next.html"

echo "[deploy] verify package markers"
grep -Fq "function updateUploadProgressLight(id)" "$HTML_SRC"
grep -Fq "addRoot(S.promptZoom.group)" "$HTML_SRC"
grep -Fq "if(!hasPending)refreshPromptZoomReferenceFragments(id);" "$HTML_SRC"
grep -Fq "providerImageFallbackUrl(img)||publicVideoImageUrl(img)" "$HTML_SRC"
grep -Fq "markReferenceUploadComplete(img,{clearPromise:true});" "$HTML_SRC"
grep -Fq "const uploadingCount=imgs.filter(img=>isReferenceUploadInProgress(img)).length;" "$HTML_SRC"
grep -Fq "const pendingRefs=images.filter(img=>isReferenceUploadInProgress(img));" "$HTML_SRC"

echo "[deploy] backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/mirror"
if [ -f "$ROOT_DIR/image-studio-canvas-next.html" ]; then
  mkdir -p "$BACKUP_DIR/root"
  cp -a "$ROOT_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/root/"
fi
if [ -f "$PUBLIC_DIR/image-studio-canvas-next.html" ]; then
  cp -a "$PUBLIC_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public/"
fi
if [ -f "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" ]; then
  mkdir -p "$BACKUP_DIR/public-tools"
  cp -a "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-tools/"
fi
if [ -f "$MIRROR_DIR/image-studio-canvas-next.html" ]; then
  cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/"
fi

echo "[deploy] install root workbench: $ROOT_DIR"
install -d "$ROOT_DIR"
install -m 0644 "$HTML_SRC" "$ROOT_DIR/image-studio-canvas-next.html"

echo "[deploy] install public workbench: $PUBLIC_DIR"
install -d "$PUBLIC_DIR"
install -m 0644 "$HTML_SRC" "$PUBLIC_DIR/image-studio-canvas-next.html"

echo "[deploy] install public tools workbench: $PUBLIC_TOOLS_DIR"
install -d "$PUBLIC_TOOLS_DIR"
install -m 0644 "$HTML_MIRROR_SRC" "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html"

echo "[deploy] install mirror workbench: $MIRROR_DIR"
install -d "$MIRROR_DIR"
install -m 0644 "$HTML_MIRROR_SRC" "$MIRROR_DIR/image-studio-canvas-next.html"

echo "[deploy] verify installed markers"
grep -Fq "function updateUploadProgressLight(id)" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "addRoot(S.promptZoom.group)" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "if(!hasPending)refreshPromptZoomReferenceFragments(id);" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "providerImageFallbackUrl(img)||publicVideoImageUrl(img)" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "markReferenceUploadComplete(img,{clearPromise:true});" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "const uploadingCount=imgs.filter(img=>isReferenceUploadInProgress(img)).length;" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "const pendingRefs=images.filter(img=>isReferenceUploadInProgress(img));" "$PUBLIC_DIR/image-studio-canvas-next.html"
grep -Fq "addRoot(S.promptZoom.group)" "$ROOT_DIR/image-studio-canvas-next.html"
grep -Fq "const uploadingCount=imgs.filter(img=>isReferenceUploadInProgress(img)).length;" "$ROOT_DIR/image-studio-canvas-next.html"
grep -Fq "addRoot(S.promptZoom.group)" "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html"
grep -Fq "const uploadingCount=imgs.filter(img=>isReferenceUploadInProgress(img)).length;" "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html"

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
