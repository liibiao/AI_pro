#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/video-pricing-20260520.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
WORK_DIR="/tmp/video-pricing-20260520-$(date +%Y%m%d%H%M%S)"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR"
test -d "$BACKEND_DIR/api-server"
test -d "$BACKEND_DIR/admin-web"
test -d "$CANVAS_DIR"
mkdir -p "$ONLINE_WORKBENCH_DIR"
mkdir -p "$WORK_DIR"

echo "==> 解压补丁包: $PKG"
tar -xzf "$PKG" -C "$WORK_DIR"

echo "==> 覆盖后台定价/扣费/管理页源码"
rsync -a "$WORK_DIR/后台管理系统/" "$BACKEND_DIR/"

echo "==> 覆盖画布源码和线上 HTML"
rsync -a "$WORK_DIR/漫剧创作库/" "$CANVAS_DIR/"
cp "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 编译后台 API"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 编译后台管理前端"
cd "$BACKEND_DIR/admin-web"
npm run build

echo "==> 同步画布模型到后台数据库"
cd "$BACKEND_DIR"
CANVAS_MODELS_DIR="$CANVAS_DIR/tools/workbench-web/models" node api-server/dist/sync-canvas-models.js

echo "==> 应用最新积分定价到数据库"
node api-server/dist/apply-pricing.js

echo "==> 校验关键价格代码"
grep -n "chargedCreditsPerSecond: 3" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "originalCreditsPerSecond: 8" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "chargedCreditsPerSecond: 25" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "originalCreditsPerSecond: 63" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "resolution: '1080p', chargedCreditsPerSecond: 60" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "originalCreditsPerSecond: 150" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "Math.ceil(memberCredits / MEMBER_CREDIT_DISCOUNT_RATE)" "$BACKEND_DIR/api-server/src/billing.ts"
grep -n "videoSecondPriceLabel" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "Math.ceil(member/.4)" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 重启 ai-admin-api"
if command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
  pm2 save
elif command -v sudo >/dev/null 2>&1 && id ubuntu >/dev/null 2>&1 && sudo -iu ubuntu pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -iu ubuntu pm2 restart ai-admin-api --update-env
  sudo -iu ubuntu pm2 save
else
  echo "WARN: 没找到当前用户可见的 PM2 进程 ai-admin-api，请手动执行：pm2 restart ai-admin-api --update-env && pm2 save"
fi

echo "部署完成：视频会员/原价积分、720p/1080p 分档计费、后台管理显示、画布帮助展示已更新。"
