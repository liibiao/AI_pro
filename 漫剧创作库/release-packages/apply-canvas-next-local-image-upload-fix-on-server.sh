#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-next-local-image-upload-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 canvas-next-local-image-upload-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/canvas-next-local-image-upload-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-next-local-image-upload-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR/workbench-web"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"

echo "==> 校验"
grep -q 'materializeDerivedImageEntry' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "paint/panorama local image materialize patched: ok"
grep -q 'createDerivedSingleImageNode' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "derived single image node patched: ok"
grep -q 'serverPublicAssetUrl' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "server public asset url patched: ok"
grep -q 'registerCanvasAssetFromEntry' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas asset tab patched: ok"
grep -q 'data-asset-tab="canvas"' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas asset tab ui patched: ok"
if grep -q 'id="saveDirBtn"' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"; then
  echo "存图目录入口仍存在" >&2
  exit 1
fi
echo "save directory entry removed: ok"
grep -q 'limitImageDataUrlForJsonUpload' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "large screenshot payload limit patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
