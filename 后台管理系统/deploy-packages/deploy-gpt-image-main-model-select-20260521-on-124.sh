#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-main-model-select-20260521.tar.gz}"
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

WORKDIR="$(mktemp -d /tmp/gpt-image-main-model-select-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
SRC="$WORKDIR/gpt-image-main-model-select-20260521"

echo "==> 覆盖后台 API 源码和已编译 JS"
install -m 0644 "$SRC/backend/api-server/src/modules/models/routes.ts" "$BACKEND_DIR/api-server/src/modules/models/routes.ts"
install -m 0644 "$SRC/backend/api-server/src/modules/generation/adapters/registry.ts" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
install -m 0644 "$SRC/backend/api-server/dist/modules/models/routes.js" "$BACKEND_DIR/api-server/dist/modules/models/routes.js"
install -m 0644 "$SRC/backend/api-server/dist/modules/generation/adapters/registry.js" "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 覆盖后台管理前端"
install -m 0644 "$SRC/backend/admin-web/src/main.tsx" "$BACKEND_DIR/admin-web/src/main.tsx"
rm -rf "$BACKEND_DIR/admin-web/dist"
mkdir -p "$BACKEND_DIR/admin-web/dist"
cp -a "$SRC/backend/admin-web/dist/." "$BACKEND_DIR/admin-web/dist/"

echo "==> 覆盖画布 GPT-Image-2-pro 模型默认配置"
mkdir -p "$CANVAS_DIR/tools/workbench-web/models"
install -m 0644 "$SRC/canvas/tools/workbench-web/models/gpt-image-2.json" "$CANVAS_DIR/tools/workbench-web/models/gpt-image-2.json"
if [ -d "$ONLINE_WORKBENCH_DIR" ]; then
  mkdir -p "$ONLINE_WORKBENCH_DIR/models"
  install -m 0644 "$SRC/canvas/tools/workbench-web/models/gpt-image-2.json" "$ONLINE_WORKBENCH_DIR/models/gpt-image-2.json"
fi

echo "==> 编译后台 API 和管理前端"
cd "$BACKEND_DIR/api-server"
npm run build
cd "$BACKEND_DIR/admin-web"
npm run build

echo "==> 校验关键标记"
grep -n "GPT_IMAGE_2_MAIN_MODELS" "$BACKEND_DIR/api-server/src/modules/models/routes.ts"
grep -n "main_model: mainModel" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -n "GPT-Image-2 外层模型" "$BACKEND_DIR/admin-web/src/main.tsx"
grep -n '"imageMainModel": "gpt-5.4-mini"' "$CANVAS_DIR/tools/workbench-web/models/gpt-image-2.json"

echo "==> 重启后台"
if [ "$(id -u)" = "0" ] && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" bash -lc "pm2 restart '$PM2_NAME' --update-env || pm2 restart all --update-env; pm2 save || true"
else
  pm2 restart "$PM2_NAME" --update-env || pm2 restart all --update-env
  pm2 save || true
fi

echo "部署完成：后台模型编辑已支持 GPT-Image-2 外层模型选择，并会向 43 透传 main_model。"
