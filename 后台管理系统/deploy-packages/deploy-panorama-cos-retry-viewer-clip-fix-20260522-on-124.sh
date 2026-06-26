#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/panorama-cos-retry-viewer-clip-fix-20260522.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR/api-server"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/panorama-cos-retry-viewer-clip-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
find "$WORKDIR" -name '._*' -print -delete || true

echo "==> 覆盖后台生成结果 COS 二次转存重试"
install -m 0644 \
  "$WORKDIR/backend/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"

echo "==> 覆盖画布 720 全景查看节点显示修复"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/canvas-next/tapnow-rewrite.css" \
  "$CANVAS_DIR/tools/workbench-web/canvas-next/tapnow-rewrite.css"
install -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
install -D -m 0644 \
  "$WORKDIR/canvas/tools/workbench-web/canvas-next/tapnow-rewrite.css" \
  "$ONLINE_WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 校验关键标记"
grep -n "attempt < 3" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -n "pano-viewer-clip-v1" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "contain:paint" "$ONLINE_WORKBENCH_DIR/canvas-next/tapnow-rewrite.css"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：124 已增加结果 COS 二次转存重试，并更新 720 全景查看节点显示边界。"
