#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-backend-gateway-routing-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 canvas-backend-gateway-routing-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/canvas-gateway-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-gateway-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/workbench-web/canvas-next"

cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
mkdir -p "$REMOTE_WORKBENCH_ROOT/canvas-next"
cp -a "$DEPLOY_DIR/workbench-web/canvas-next/generation-service.js" "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js"

echo "==> 重启后端"
pm2 restart ai-admin-api

echo "==> 校验服务"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
curl -sS http://127.0.0.1/image-studio-canvas-next.html | grep -q "resolveBackendGatewayModelCandidate"
echo "canvas html patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "强制刷新访问： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
