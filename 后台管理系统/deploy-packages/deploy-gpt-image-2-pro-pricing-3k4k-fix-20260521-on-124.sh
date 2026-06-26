#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-2-pro-pricing-3k4k-fix-20260521.tar.gz}"
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

WORKDIR="$(mktemp -d /tmp/gpt-image-2-pro-pricing-3k4k-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台定价代码"
install -m 0644 "$WORKDIR/backend/api-server/src/pricing.ts" "$BACKEND_DIR/api-server/src/pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/apply-pricing.ts" "$BACKEND_DIR/api-server/src/apply-pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/sync-canvas-models.ts" "$BACKEND_DIR/api-server/src/sync-canvas-models.ts"

echo "==> 覆盖画布帮助表与 GPT-Image-2-pro 模型配置"
mkdir -p "$CANVAS_DIR/tools/workbench-web/models" "$ONLINE_WORKBENCH_DIR/models"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/gpt-image-2.json" "$CANVAS_DIR/tools/workbench-web/models/gpt-image-2.json"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/gpt-image-2.json" "$ONLINE_WORKBENCH_DIR/models/gpt-image-2.json"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 同步模型并应用最新定价"
CANVAS_MODELS_DIR="$CANVAS_DIR/tools/workbench-web/models" node dist/sync-canvas-models.js | grep -i -E 'gpt-image-2|Canvas model sync' || true
node dist/apply-pricing.js

echo "==> 校验关键标记"
grep -n "GPT_IMAGE_2_PRO_PRICING_TIERS" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "chargedCredits: 20" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "chargedCredits: 40" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "gptImage2ProModelWhere" "$BACKEND_DIR/api-server/src/apply-pricing.ts"
grep -n '"tier": "3K", "chargedCredits": 20' "$CANVAS_DIR/tools/workbench-web/models/gpt-image-2.json"
grep -n "{tier:'3K',member:20" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：GPT-Image-2-pro 3K=20、4K=40 积分/张已更新。"
