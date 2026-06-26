#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/asset-confirm-runtime-derive-ui-fix-20260617140201-${STAMP}"

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
  grep -q "function normalizeWorkflowDataForStorage" "$file"
  grep -q "workflowNextFromNodes(nodes,Number.isFinite(Number(canvas.next))?Number(canvas.next):1)" "$file"
  grep -q "function isTransientWorkflowRuntimeNodeRecord" "$file"
  grep -q "ASSET_CARD_DERIVE_CHAT_TIMEOUT_MS" "$file"
  grep -q "大模型推演失败，已创建资产确认节点" "$file"
  grep -q "asset-confirm-detail-preview img{width:100%;height:100%;object-fit:contain}" "$file"
  grep -q "asset-confirm-editor-stage img{display:block;width:100%;height:100%;object-fit:contain}" "$file"
  grep -q "asset-confirm-field>div" "$file"
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

grep -q "function normalizeWorkflowDataForStorage" "$DST_PUBLIC"
grep -q "workflowNextFromNodes(nodes,Number.isFinite(Number(canvas.next))?Number(canvas.next):1)" "$DST_PUBLIC"
grep -q "function isTransientWorkflowRuntimeNodeRecord" "$DST_PUBLIC"
grep -q "ASSET_CARD_DERIVE_CHAT_TIMEOUT_MS" "$DST_PUBLIC"
grep -q "大模型推演失败，已创建资产确认节点" "$DST_PUBLIC"
grep -q "asset-confirm-detail-preview img{width:100%;height:100%;object-fit:contain}" "$DST_PUBLIC"
grep -q "asset-confirm-editor-stage img{display:block;width:100%;height:100%;object-fit:contain}" "$DST_PUBLIC"
grep -q "asset-confirm-field>div" "$DST_PUBLIC"

echo "deployed asset-confirm-runtime-derive-ui-fix-20260617140201"
echo "backup: $BACKUP_DIR"
