#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "[deploy] please run with sudo: ssh ubuntu@HOST \"sudo bash -s\" < this-script" >&2
  exit 1
fi

PKG="${PKG:-/tmp/canvas-asset-design-image-template-fix-20260530160900.tar.gz}"
TARGET_DIR="${TARGET_DIR:-/var/www/ai-admin/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
TARGET_FILE="$TARGET_DIR/image-studio-canvas-next.html"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/www/ai-admin/backups/canvas-asset-design-image-template-fix-20260530160900-$STAMP}"
TMP_DIR="$(mktemp -d /tmp/canvas-asset-design-image-template-fix-20260530160900.XXXXXX)"

cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "[deploy] package: $PKG"
test -f "$PKG"
tar -xzf "$PKG" -C "$TMP_DIR"
SRC="$TMP_DIR/canvas-asset-design-image-template-fix-20260530160900/workbench-web/image-studio-canvas-next.html"
test -f "$SRC"

echo "[deploy] backup: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/workbench-web"
if [ -f "$TARGET_FILE" ]; then
  cp -a "$TARGET_FILE" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"
fi

echo "[deploy] install: $TARGET_FILE"
mkdir -p "$TARGET_DIR"
cp "$SRC" "$TARGET_FILE"
chmod 0644 "$TARGET_FILE"
if command -v chown >/dev/null 2>&1; then
  chown www-data:www-data "$TARGET_FILE" 2>/dev/null || true
fi

if [ -d "$MIRROR_DIR" ]; then
  echo "[deploy] mirror: $MIRROR_DIR/image-studio-canvas-next.html"
  cp "$SRC" "$MIRROR_DIR/image-studio-canvas-next.html"
  chmod 0644 "$MIRROR_DIR/image-studio-canvas-next.html"
fi

echo "[deploy] verify markers"
grep -q "character_sheet_complete" "$TARGET_FILE"
grep -q "renderImageModelOptionsForNode" "$TARGET_FILE"
grep -q "LOWER_AUTO_FOLD_NODE_TYPES" "$TARGET_FILE"
grep -q "assetDesignGenerationRefs" "$TARGET_FILE"
grep -q "taskType:'assetDesign'" "$TARGET_FILE"

echo "[deploy] done"
echo "backup: $BACKUP_DIR"
