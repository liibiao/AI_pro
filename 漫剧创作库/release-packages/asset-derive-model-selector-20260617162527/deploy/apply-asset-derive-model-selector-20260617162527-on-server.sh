#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-derive-model-selector-20260617162527-${STAMP}"

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
  grep -q "function applyAssetDeriveModelSelection" "$file"
  grep -q "data-asset-derive-model" "$file"
  grep -q "assetDeriveModelKey" "$file"
  grep -q "_assetDeriveModelIdx" "$file"
  grep -q "已创建资产确认节点（本地规则兜底）" "$file"
  grep -q "ASSET_CARD_DERIVE_CHAT_TIMEOUT_MS=150000" "$file"
  if grep -q "大模型推演失败，已创建资产确认节点" "$file"; then
    echo "old failure toast still present in $file" >&2
    exit 1
  fi
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

grep -q "function applyAssetDeriveModelSelection" "$DST_PUBLIC"
grep -q "data-asset-derive-model" "$DST_PUBLIC"
grep -q "assetDeriveModelKey" "$DST_PUBLIC"
grep -q "_assetDeriveModelIdx" "$DST_PUBLIC"
grep -q "已创建资产确认节点（本地规则兜底）" "$DST_PUBLIC"
grep -q "ASSET_CARD_DERIVE_CHAT_TIMEOUT_MS=150000" "$DST_PUBLIC"
if grep -q "大模型推演失败，已创建资产确认节点" "$DST_PUBLIC"; then
  echo "old failure toast still present in deployed public file" >&2
  exit 1
fi

echo "deployed asset-derive-model-selector-20260617162527"
echo "backup: $BACKUP_DIR"
