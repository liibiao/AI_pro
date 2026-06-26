#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-derive-core-reference-rules-20260623210326-${STAMP}"

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
  grep -q "const ASSET_CARD_DERIVE_MAX_REFERENCE_CARDS=9" "$file"
  grep -q "function assetCardPlanPostProcessCards" "$file"
  grep -q "禁止 prop" "$file"
  grep -q "魔王/统帅/宿敌" "$file"
  grep -q "道具、武器、护符" "$file"
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
  grep -q "const ASSET_CARD_DERIVE_MAX_REFERENCE_CARDS=9" "$file"
  grep -q "function assetCardPlanPostProcessCards" "$file"
  grep -q "禁止 prop" "$file"
  grep -q "魔王/统帅/宿敌" "$file"
  grep -q "道具、武器、护符" "$file"
done

echo "deployed asset-derive-core-reference-rules-20260623210326"
echo "backup: $BACKUP_DIR"
