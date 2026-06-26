#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/seedance-capability-pricing-fix-20260521.tar.gz}"
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

WORKDIR="$(mktemp -d /tmp/seedance-capability-pricing-fix-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖后台定价 / 模型能力 / 同步脚本"
install -m 0644 "$WORKDIR/backend/api-server/src/pricing.ts" "$BACKEND_DIR/api-server/src/pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/apply-pricing.ts" "$BACKEND_DIR/api-server/src/apply-pricing.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/sync-canvas-models.ts" "$BACKEND_DIR/api-server/src/sync-canvas-models.ts"
install -m 0644 "$WORKDIR/backend/api-server/src/modules/models/routes.ts" "$BACKEND_DIR/api-server/src/modules/models/routes.ts"

echo "==> 覆盖画布与 Seedance 模型配置"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
mkdir -p "$CANVAS_DIR/tools/workbench-web/models" "$ONLINE_WORKBENCH_DIR/models"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/image-studio-canvas-next.html" "$ONLINE_WORKBENCH_DIR/image-studio-canvas-next.html"
install -m 0644 "$WORKDIR/canvas/tools/workbench-web/models/seedance2-vip.json" "$ONLINE_WORKBENCH_DIR/models/seedance2-vip.json"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 同步画布模型并应用最新定价"
CANVAS_MODELS_DIR="$CANVAS_DIR/tools/workbench-web/models" node dist/sync-canvas-models.js | grep -i -E 'seedance|sora|Canvas model sync' || true
node dist/apply-pricing.js

echo "==> 校验关键标记"
grep -n "chargedCreditsPerSecond: 5" "$BACKEND_DIR/api-server/src/pricing.ts"
grep -n "maxAudioDurationSeconds" "$BACKEND_DIR/api-server/src/modules/models/routes.ts"
grep -n "seedance-2.0-vip" "$BACKEND_DIR/api-server/src/apply-pricing.ts"
grep -n "支持 9图 + 1视频" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n "member:5" "$CANVAS_DIR/tools/workbench-web/image-studio-canvas-next.html"
grep -n '"maxAudioDurationSeconds": 14.9' "$CANVAS_DIR/tools/workbench-web/models/seedance2-vip.json"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：Seedance VIP 能力/时长限制/帮助表与 Sora-2 5分每秒计费已更新。"
