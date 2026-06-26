#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
WORKBENCH_DIR="$APP_DIR/workbench-web"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

echo "==> 确认部署文件"
grep -Fq "asset-card-direct" "$WORKBENCH_DIR/image-studio-canvas-next.html"
grep -Fq "DATA_PACK_REGISTRY_PATH" "$API_DIR/dist/modules/workbench/agent-pack-service.js"

pm2_as_root() {
  command -v pm2 >/dev/null 2>&1 && pm2 "$@"
}

pm2_as_user() {
  id "$PM2_USER" >/dev/null 2>&1 && sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
}

echo "==> 重启后台服务"
if pm2_as_root describe "$PM2_APP" >/dev/null 2>&1; then
  pm2_as_root restart "$PM2_APP" --update-env
  pm2_as_root save || true
elif pm2_as_user describe "$PM2_APP" >/dev/null 2>&1; then
  pm2_as_user restart "$PM2_APP" --update-env
  pm2_as_user save || true
elif pm2_as_root describe all >/dev/null 2>&1; then
  pm2_as_root restart all --update-env || true
  pm2_as_root save || true
elif pm2_as_user describe all >/dev/null 2>&1; then
  pm2_as_user restart all --update-env || true
  pm2_as_user save || true
else
  echo "[WARN] 未找到 PM2 进程，跳过 PM2 重启"
fi

echo "==> 健康检查"
curl -fsS http://127.0.0.1:4000/api/health
echo "后台重启检查完成"
