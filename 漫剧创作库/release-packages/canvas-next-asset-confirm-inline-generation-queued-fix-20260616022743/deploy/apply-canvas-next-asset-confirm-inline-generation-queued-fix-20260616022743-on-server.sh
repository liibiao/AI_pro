#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?archive path required}"
PKG="canvas-next-asset-confirm-inline-generation-queued-fix-20260616022743"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="/tmp/${PKG}-${STAMP}"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/${PKG}-${STAMP}"

mkdir -p "$WORKDIR" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_ROOT="$WORKDIR/$PKG"
SRC_PUBLIC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$SRC_ROOT/tools/workbench-web/image-studio-canvas-next.html"
PUBLIC_TARGET="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
TOOLS_TARGET="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

test -f "$SRC_PUBLIC"
test -f "$SRC_TOOLS"

mkdir -p "$(dirname "$PUBLIC_TARGET")" "$(dirname "$TOOLS_TARGET")" "$BACKUP_DIR/var-www" "$BACKUP_DIR/tools"
if [ -f "$PUBLIC_TARGET" ]; then cp "$PUBLIC_TARGET" "$BACKUP_DIR/var-www/image-studio-canvas-next.html"; fi
if [ -f "$TOOLS_TARGET" ]; then cp "$TOOLS_TARGET" "$BACKUP_DIR/tools/image-studio-canvas-next.html"; fi

install -m 0644 "$SRC_PUBLIC" "$PUBLIC_TARGET"
install -m 0644 "$SRC_TOOLS" "$TOOLS_TARGET"

for target in "$PUBLIC_TARGET" "$TOOLS_TARGET"; do
  grep -q 'function generateAssetConfirmCardImage' "$target"
  grep -q 'function generateAllAssetConfirmCards' "$target"
  grep -q 'data-asset-confirm-action="generateAll"' "$target"
  grep -q '全部资产生成' "$target"
  grep -q 'function runAssetConfirmCardMidjourneyAction' "$target"
  grep -q 'assetConfirmGeneratedAssetRefs' "$target"
  grep -q 'asset-confirm-gen-mask' "$target"
  grep -q "currentGenState.active&&currentGenState.status!=='queued'" "$target"
done

echo "[canvas-deploy] installed $PUBLIC_TARGET"
echo "[canvas-deploy] installed $TOOLS_TARGET"
echo "[canvas-deploy] backup $BACKUP_DIR"
echo "[canvas-deploy] hard refresh http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
echo "[canvas-deploy] done"
