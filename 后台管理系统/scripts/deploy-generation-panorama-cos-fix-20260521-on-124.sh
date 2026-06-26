#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/generation-panorama-cos-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
API_DIR="$BACKEND_DIR/api-server"
WORK_DIR="/tmp/generation-panorama-cos-fix-20260521-$(date +%Y%m%d%H%M%S)"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR"
test -d "$API_DIR"
test -d "$CANVAS_DIR"
mkdir -p "$ONLINE_WORKBENCH_DIR" "$WORK_DIR"

echo "==> 解压补丁包"
tar -xzf "$PKG" -C "$WORK_DIR"

echo "==> 部署后台 generation COS 闭环修复"
rsync -a "$WORK_DIR/后台管理系统/api-server/" "$API_DIR/"

echo "==> 部署画布全景 2:1 严格校验修复"
rsync -a "$WORK_DIR/漫剧创作库/" "$CANVAS_DIR/"
cp "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 编译后台 api-server"
cd "$API_DIR"
npm run build

echo "==> 校验后台关键逻辑"
grep -n "if (shouldPreferInlineImageResult(ctx)) return 'b64_json'" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -n "IMAGE_RESULT_MATERIALIZE_FAILED" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -n "isProviderEphemeralImageResultUrl" "$API_DIR/src/modules/generation/adapters/registry.ts"
grep -n "materializeImmediateImageSubmitResults" "$API_DIR/src/modules/generation/routes.ts"
grep -n "materializeImmediateImageSubmitResults" "$API_DIR/dist/modules/generation/routes.js"

echo "==> 校验画布全景关键逻辑"
grep -n "PANORAMA_PIXEL_HINTS" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "return \\['2:1'\\]" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "equirectangular panorama texture" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "无法确认上游输出尺寸是否为 2:1" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
grep -n "allowUnknownSize:false" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 重启后台"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart ai-admin-api || pm2 restart all
  pm2 save || true
else
  echo "WARN: 未找到 pm2，请手动重启后台服务" >&2
fi

echo "部署完成：gpt-image-2-pro 所有后台 IMAGE 任务结果统一转 COS；全景生成/查看强制 2:1 严格校验。"
