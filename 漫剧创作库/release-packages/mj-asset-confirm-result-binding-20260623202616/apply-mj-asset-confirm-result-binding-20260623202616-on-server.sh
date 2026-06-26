#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/mj-asset-confirm-result-binding-20260623202616-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/tools/workbench-web/image-studio-canvas-next.html"
DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  test -f "$file"
  grep -q "function assetConfirmEntryMatchesCardRun" "$file"
  grep -q "MJ 任务结果与当前资产卡不匹配" "$file"
  grep -q "const ASSET_CONFIRM_BATCH_START_GAP_MS=3000" "$file"
  grep -q "const ASSET_CONFIRM_BATCH_MJ_MAX_CONCURRENCY=2" "$file"
  grep -q "asset-confirm-editor-stage .asset-confirm-mj-preview" "$file"
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

for file in "$DST_PUBLIC" "$DST_TOOLS"; do
  grep -q "function assetConfirmEntryMatchesCardRun" "$file"
  grep -q "MJ 任务结果与当前资产卡不匹配" "$file"
  grep -q "const ASSET_CONFIRM_BATCH_START_GAP_MS=3000" "$file"
  grep -q "const ASSET_CONFIRM_BATCH_MJ_MAX_CONCURRENCY=2" "$file"
  grep -q "asset-confirm-editor-stage .asset-confirm-mj-preview" "$file"
done

echo "deployed mj-asset-confirm-result-binding-20260623202616"
echo "backup: $BACKUP_DIR"
