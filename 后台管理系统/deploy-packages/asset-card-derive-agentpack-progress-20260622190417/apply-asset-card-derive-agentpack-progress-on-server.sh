#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="$APP_DIR/api-server"
WORKBENCH_DIR="$APP_DIR/workbench-web"

if [ -z "$PKG" ] || [ ! -f "$PKG" ]; then
  echo "用法: sudo APP_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/asset-card-derive-agentpack-progress-20260622190417.tar.gz" >&2
  exit 1
fi
if [ ! -d "$APP_DIR" ] || [ ! -d "$API_DIR" ]; then
  echo "目录不存在: $APP_DIR / $API_DIR" >&2
  exit 1
fi

WORK="/tmp/asset-card-derive-agentpack-progress-$(date +%Y%m%d%H%M%S)"
BACKUP="/tmp/asset-card-derive-agentpack-progress-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$WORK" "$BACKUP"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/asset-card-derive-agentpack-progress-20260622190417"
if [ ! -d "$SRC" ]; then SRC="$WORK"; fi

echo "==> 备份当前画布和后台文件到 $BACKUP"
mkdir -p "$BACKUP/workbench-web" "$BACKUP/api-server/src/modules/workbench" "$BACKUP/api-server/dist/modules/workbench"
if [ -f "$WORKBENCH_DIR/image-studio-canvas-next.html" ]; then
  cp "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP/workbench-web/image-studio-canvas-next.html"
fi
if [ -f "$API_DIR/src/modules/workbench/agent-pack-service.ts" ]; then
  cp "$API_DIR/src/modules/workbench/agent-pack-service.ts" "$BACKUP/api-server/src/modules/workbench/agent-pack-service.ts"
fi
if [ -f "$API_DIR/dist/modules/workbench/agent-pack-service.js" ]; then
  cp "$API_DIR/dist/modules/workbench/agent-pack-service.js" "$BACKUP/api-server/dist/modules/workbench/agent-pack-service.js"
fi

echo "==> 覆盖资产推演前端与 Agent 数据包服务"
mkdir -p "$WORKBENCH_DIR" "$API_DIR/src/modules/workbench" "$API_DIR/dist/modules/workbench"
rsync -a "$SRC/workbench-web/" "$WORKBENCH_DIR/"
rsync -a "$SRC/api-server/src/modules/workbench/" "$API_DIR/src/modules/workbench/"
rsync -a "$SRC/api-server/dist/modules/workbench/" "$API_DIR/dist/modules/workbench/"

echo "==> 编译后台"
cd "$API_DIR"
if command -v npm >/dev/null 2>&1; then
  npm run build
else
  echo "[WARN] npm 不可用，已使用包内 dist 文件覆盖。"
fi

echo "==> 重启后台 PM2"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe ai-admin-api >/dev/null 2>&1; then
    pm2 restart ai-admin-api --update-env
  elif pm2 describe all >/dev/null 2>&1; then
    pm2 restart all --update-env || true
  else
    echo "[WARN] PM2 未找到 ai-admin-api，请按当前服务器实际进程名手动重启后台"
  fi
  pm2 save || true
else
  echo "[WARN] pm2 不可用，请手动重启后台服务"
fi

echo "==> 健康检查"
curl -fsS http://127.0.0.1:4000/api/health || true
echo "部署完成：资产推演专用 JSON 链路、Agent 数据包读取和步骤进度 UI 已覆盖。备份目录：$BACKUP"
