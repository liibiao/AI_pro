#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-reference-upload-ref-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 canvas-reference-upload-ref-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/canvas-reference-upload-ref-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-reference-upload-ref-fix-$STAMP"
CANVAS_HTML="$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/workbench-web"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$CANVAS_HTML" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$CANVAS_HTML"

echo "==> 校验"
grep -q "if(uploadMode==='files')return isFileReference(ref);" "$CANVAS_HTML"
echo "files mode only accepts provider file refs: ok"
grep -q "saved.remoteUrl||saved.url||img?.remoteUrl||img?.url" "$CANVAS_HTML"
echo "saved/cos reference priority patched: ok"
grep -q "img?.objectStorageUrl" "$CANVAS_HTML"
grep -q "saved.objectStorageUrl" "$CANVAS_HTML"
echo "object storage reference candidates patched: ok"
if grep -q 'id="saveDirBtn"' "$CANVAS_HTML" || grep -q 'pickGlobalSaveDir' "$CANVAS_HTML"; then
  echo "存图目录入口仍存在，请检查包内容" >&2
  exit 1
fi
echo "save directory entry removed: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
