#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?usage: $0 <archive.tar.gz>}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
BACKUP_DIR="/home/ubuntu/漫剧创作库/.deploy-backups/canvas-local-drag-large-preview-fix-20260612005858-${STAMP}"

cleanup(){
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$WORKDIR"

SRC_PUBLIC="$WORKDIR/canvas-local-drag-large-preview-fix-20260612005858/workbench-web/image-studio-canvas-next.html"
SRC_TOOLS="$WORKDIR/canvas-local-drag-large-preview-fix-20260612005858/tools/workbench-web/image-studio-canvas-next.html"

DST_PUBLIC="/var/www/ai-admin/workbench-web/image-studio-canvas-next.html"
DST_TOOLS="/home/ubuntu/漫剧创作库/tools/workbench-web/image-studio-canvas-next.html"

for file in "$SRC_PUBLIC" "$SRC_TOOLS"; do
  test -f "$file"
  grep -q "const keepLocalPreview=S.nodes\\[nodeId\\]?.type==='singleImage'" "$file"
  grep -q "const domSource=sharedPreviewSourceElement(source)" "$file"
  grep -q "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?._objectUrl,entry?.dataUrl" "$file"
done

mkdir -p \
  "$BACKUP_DIR/var-www-ai-admin/workbench-web" \
  "$BACKUP_DIR/home-ubuntu-tools/workbench-web"

if [ -f "$DST_PUBLIC" ]; then
  cp "$DST_PUBLIC" "$BACKUP_DIR/var-www-ai-admin/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$DST_TOOLS" ]; then
  cp "$DST_TOOLS" "$BACKUP_DIR/home-ubuntu-tools/workbench-web/image-studio-canvas-next.html"
fi

install -m 0644 "$SRC_PUBLIC" "$DST_PUBLIC"
install -m 0644 "$SRC_TOOLS" "$DST_TOOLS"

grep -q "const keepLocalPreview=S.nodes\\[nodeId\\]?.type==='singleImage'" "$DST_PUBLIC"
grep -q "const domSource=sharedPreviewSourceElement(source)" "$DST_PUBLIC"
grep -q "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?._objectUrl,entry?.dataUrl" "$DST_PUBLIC"
grep -q "const keepLocalPreview=S.nodes\\[nodeId\\]?.type==='singleImage'" "$DST_TOOLS"
grep -q "const domSource=sharedPreviewSourceElement(source)" "$DST_TOOLS"
grep -q "function imagePreviewUrl(entry){return firstDisplayImageUrl(entry?._objectUrl,entry?.dataUrl" "$DST_TOOLS"

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程，静态文件已覆盖" >&2
fi

if command -v curl >/dev/null 2>&1; then
  curl -fsS http://127.0.0.1:4000/api/health >/dev/null || true
fi

echo "deployed canvas-local-drag-large-preview-fix-20260612005858"
echo "backup: $BACKUP_DIR"
echo "url: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
