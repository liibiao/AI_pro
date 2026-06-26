#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/seedance-vip-pricing-3454-fix-20260521.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"
CANVAS_DIR="${CANVAS_DIR:-/home/ubuntu/漫剧创作库}"
ONLINE_WORKBENCH_DIR="${ONLINE_WORKBENCH_DIR:-/var/www/ai-admin/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

echo "==> 检查包和目录"
test -f "$PKG"
test -d "$BACKEND_DIR/api-server"
test -d "$BACKEND_DIR/admin-web"
test -d "$CANVAS_DIR/tools/workbench-web"
test -d "$ONLINE_WORKBENCH_DIR"

WORKDIR="$(mktemp -d /tmp/seedance-vip-pricing-3454-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台扣费常量与模型定价接口"
install -m 0644 "$WORKDIR/backend/api-server/src/pricing.ts" "$BACKEND_DIR/api-server/src/pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/apply-pricing.ts" "$BACKEND_DIR/api-server/src/apply-pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/models/routes.ts" "$BACKEND_DIR/api-server/src/modules/models/routes.ts"

echo "==> 覆盖后台管理前端模型定价配置"
install -m 0644 "$WORKDIR/admin-web/src/main.tsx" "$BACKEND_DIR/admin-web/src/main.tsx"

echo "==> 覆盖画布帮助表与 Seedance VIP 模型配置"
mkdir -p "$CANVAS_DIR/tools/workbench-web/models" "$ONLINE_WORKBENCH_DIR/models"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$ONLINE_WORKBENCH_DIR/models/seedance2-vip.json"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 应用最新 Seedance VIP 720p/1080p 阶梯定价到数据库"
node dist/apply-pricing.js

echo "==> 编译后台管理前端"
cd "$BACKEND_DIR/admin-web"
npm run build

echo "==> 校验关键标记"
grep -n "chargedCreditsPerSecond: 34" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "chargedCreditsPerSecond: 54" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "imageTierPrices" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "videoTierPrices" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "normalizeVideoPricingSubmitValues" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n "member:34" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "member:54" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n '"chargedCreditsPerSecond": 34' "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"
grep -n '"chargedCreditsPerSecond": 54' "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：Seedance 2.0 VIP 720p=34/秒、1080p=54/秒，原价=85/135，后台扣费与模型定价配置已同步。"
