#!/usr/bin/env bash
set -euo pipefail
PKG="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
WEB_DIR="$APP_DIR/admin-web"
WORKBENCH_DIR="$APP_DIR/workbench-web"
DATA_DIR="$APP_DIR/data"
if [ -z "$PKG" ] || [ ! -f "$PKG" ]; then
  echo "用法: sudo APP_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/canvas-text-agent-asset-design-20260528.tar.gz" >&2
  exit 1
fi
if [ ! -d "$APP_DIR" ] || [ ! -d "$API_DIR" ] || [ ! -d "$WEB_DIR" ]; then
  echo "目录不存在: $APP_DIR / $API_DIR / $WEB_DIR" >&2
  exit 1
fi
WORK="/tmp/canvas-text-agent-asset-design-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/canvas-text-agent-asset-design-20260528"
if [ ! -d "$SRC" ]; then SRC="$WORK"; fi
echo "==> 覆盖后台、管理端、画布工作台和 Agent 配置"
rsync -a "$SRC/api-server/" "$API_DIR/"
rsync -a "$SRC/admin-web/" "$WEB_DIR/"
mkdir -p "$WORKBENCH_DIR" "$DATA_DIR"
rsync -a "$SRC/workbench-web/" "$WORKBENCH_DIR/"
rsync -a "$SRC/data/" "$DATA_DIR/"
echo "==> 安装/校验依赖并编译后台"
cd "$API_DIR"
npm install
npm run build
echo "==> 安装/校验依赖并编译后台管理前端"
cd "$WEB_DIR"
npm install
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
echo "==> 健康检查"
curl -fsS http://127.0.0.1:4000/api/health || true
echo "部署完成：新版画布文本提示词节点 + 资产设计节点已覆盖。"
