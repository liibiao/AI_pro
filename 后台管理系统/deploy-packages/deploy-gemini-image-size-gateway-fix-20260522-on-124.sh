#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gemini-image-size-gateway-fix-124-20260522.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
WORKDIR="$(mktemp -d /tmp/gemini-image-size-gateway-fix-XXXXXX)"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR/api-server"
test -d "$CANVAS_DIR/tools/workbench-web"
mkdir -p "$ONLINE_WORKBENCH_DIR"

tar -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台 Gemini 参数兼容修复"
cp "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
mkdir -p "$BACKEND_DIR/api-server/dist/modules/generation/adapters"
cp "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" \
  "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 覆盖画布 Gemini 分辨率限制和 504 识别"
cp "$WORKDIR/workbench-web/image-studio-canvas-next.html" \
  "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
cp "$WORKDIR/workbench-web/image-studio-canvas-next.html" \
  "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 重启后台 PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env || pm2 restart all --update-env || true
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 -v >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env \
    || sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart all --update-env \
    || true
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 save || true
else
  echo "WARN: 未找到可用 pm2，请手动执行：pm2 restart ai-admin-api --update-env"
fi

echo "==> 校验关键标记"
grep -n "normalizeGeminiImageSizeToken" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -n "GEMINI_IMAGE_RESOLUTIONS" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "size 参数取值不受支持" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
echo "部署完成"
