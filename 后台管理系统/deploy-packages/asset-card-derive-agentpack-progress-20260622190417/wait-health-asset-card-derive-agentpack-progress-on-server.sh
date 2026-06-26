#!/usr/bin/env bash
set -euo pipefail

PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"

echo "==> 等待 API 健康检查"
for i in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:4000/api/health; then
    echo
    echo "API 健康检查通过"
    exit 0
  fi
  sleep 2
done

echo "[ERROR] API 健康检查超时，输出 PM2 状态和最近日志" >&2
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
fi
if id "$PM2_USER" >/dev/null 2>&1; then
  sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 list || true
  sudo -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 logs "$PM2_APP" --lines 80 --nostream || true
fi
exit 1
