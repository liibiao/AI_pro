#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
PKG="canvas-image-cos-preview-fallback-fix-20260612132442"
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
  grep -Fq "function imageDisplayPreviewCandidates(entry)" "$file"
  grep -Fq "function imagePreviewFallbackUrl(entry,primary='')" "$file"
  grep -Fq "function preserveImageDisplayPreviewBeforeRemote(entry,remoteRef='')" "$file"
  grep -Fq "const keptPreview=mode==='object_storage'?preserveImageDisplayPreviewBeforeRemote(img,ref):''" "$file"
  grep -Fq "function preserveRecoveredGeneratedImagePreview(entry,existing)" "$file"
  grep -Fq "function renderGeneratedResultImg(src,attrs='',fallback='')" "$file"
  grep -Fq "fallback||imagePreviewFallbackUrl(entry,url)" "$file"
  grep -Fq "renderGeneratedResultImg(generatedUrl,'class=\"asset-preview-image\"',generatedFallback)" "$file"
  grep -Fq "renderGeneratedResultImg(resultImg,'class=\"aio-preview-img\"',resultFallback)" "$file"
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
