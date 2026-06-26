#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/panorama-viewer-image-proxy-fix-20260521.tar.gz}"
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

WORKDIR="$(mktemp -d /tmp/panorama-viewer-image-proxy-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台图片代理接口"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/workbench-compat/routes.ts" "$BACKEND_DIR/api-server/src/modules/workbench-compat/routes.ts"

echo "==> 覆盖画布源码和线上 HTML"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 校验关键标记"
grep -n "proxy-image" "$BACKEND_DIR/api-server/src/modules/workbench-compat/routes.ts"
grep -n "sendRemoteImage" "$BACKEND_DIR/api-server/src/modules/workbench-compat/routes.ts"
grep -n "panoTextureSrc" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "allowUnknownSize:true" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html" | head
grep -n "panorama strip" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：全景查看节点图片代理与多比例全景加载修复已更新。"
