#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "usage: $0 /tmp/reference-upload-hide-confirming-mask-fix-20260616010735.tar.gz" >&2
  exit 2
fi

PKG_NAME="reference-upload-hide-confirming-mask-fix-20260616010735"
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
grep -Fq "function isReferenceUploadConfirming(img)" "$HTML_SRC"
grep -Fq "if(isReferenceUploadConfirming(img))return false;" "$HTML_SRC"
grep -Fq "function shouldShowReferenceUploadMask(img)" "$HTML_SRC"
grep -Fq "const active=shouldShowReferenceUploadMask(img);" "$HTML_SRC"

echo "[deploy] backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/root" "$BACKUP_DIR/public" "$BACKUP_DIR/public-tools" "$BACKUP_DIR/mirror"
[ -f "$ROOT_DIR/image-studio-canvas-next.html" ] && cp -a "$ROOT_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/root/" || true
[ -f "$PUBLIC_DIR/image-studio-canvas-next.html" ] && cp -a "$PUBLIC_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public/" || true
[ -f "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" ] && cp -a "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-tools/" || true
[ -f "$MIRROR_DIR/image-studio-canvas-next.html" ] && cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/" || true

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
for target in \
  "$ROOT_DIR/image-studio-canvas-next.html" \
  "$PUBLIC_DIR/image-studio-canvas-next.html" \
  "$PUBLIC_TOOLS_DIR/image-studio-canvas-next.html" \
  "$MIRROR_DIR/image-studio-canvas-next.html"; do
  grep -Fq "function isReferenceUploadConfirming(img)" "$target"
  grep -Fq "if(isReferenceUploadConfirming(img))return false;" "$target"
  grep -Fq "function shouldShowReferenceUploadMask(img)" "$target"
done

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas page after deploy."
