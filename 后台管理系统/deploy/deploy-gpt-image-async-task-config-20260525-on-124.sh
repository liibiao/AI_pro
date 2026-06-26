#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
WEB_DIR="$APP_DIR/admin-web"

if [ -z "$PKG" ] || [ ! -f "$PKG" ]; then
  echo "用法: sudo APP_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/gpt-image-async-task-config-20260525.tar.gz" >&2
  exit 1
fi
if [ ! -d "$API_DIR" ] || [ ! -d "$WEB_DIR" ]; then
  echo "目录不存在: $API_DIR 或 $WEB_DIR" >&2
  exit 1
fi

WORK="/tmp/gpt-image-async-task-config-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
tar -xzf "$PKG" -C "$WORK"

echo "==> 覆盖后台和管理端 async_task 配置链路"
rsync -a "$WORK/api-server/" "$API_DIR/"
rsync -a "$WORK/admin-web/" "$WEB_DIR/"

echo "==> 编译后台"
cd "$API_DIR"
npm run build

echo "==> 编译后台管理前端"
cd "$WEB_DIR"
npm run build

echo "==> 重启后台 PM2"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif pm2 describe all >/dev/null 2>&1; then
  pm2 restart all --update-env || true
else
  echo "[WARN] PM2 未找到 ai-admin-api，请按当前服务器实际进程名手动重启后台"
fi
pm2 save || true

echo "==> 校验关键标记"
grep -n "asyncTaskConfigMode" "$API_DIR/dist/modules/models/routes.js" | head -5
grep -n "async_task" "$API_DIR/dist/modules/generation/adapters/registry.js" | head -5
grep -n "GPT-Image-2 async_task" "$WEB_DIR/src/main.tsx" | head -5

echo "部署完成：GPT-Image-2 async_task 已支持统一/按分辨率配置。默认同步，不发送 async_task。"
