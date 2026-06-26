#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/provider-files-413-compress-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 provider-files-413-compress-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/provider-files-413-compress-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/provider-files-413-compress-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web/canvas-next"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/object-storage.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/object-storage.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/object-storage.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/object-storage.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/canvas-next/app.js" "$BACKUP_DIR/workbench-web/canvas-next/app.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "==> 覆盖后端和画布前端"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/object-storage.ts" "$REMOTE_APP_ROOT/api-server/src/object-storage.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/object-storage.js" "$REMOTE_APP_ROOT/api-server/dist/object-storage.js"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
mkdir -p "$REMOTE_WORKBENCH_ROOT/canvas-next"
cp -a "$DEPLOY_DIR/workbench-web/canvas-next/app.js" "$REMOTE_WORKBENCH_ROOT/canvas-next/app.js"
cp -a "$DEPLOY_DIR/workbench-web/canvas-next/generation-service.js" "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js"

echo "==> 重启后端"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "当前用户的 PM2 中未找到 ai-admin-api。请切换到运行服务的用户后执行：pm2 restart ai-admin-api --update-env" >&2
fi

echo "==> 校验"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
grep -q "upload-provider-file" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
echo "provider files upload relay route patched: ok"
grep -q "prepareProviderFilesUploadFile" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "main canvas provider file pre-compress patched: ok"
grep -q "prepareProviderFilesUploadFile" "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js"
echo "module canvas provider file pre-compress patched: ok"
grep -q "2.8\\*1024\\*1024" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "provider file upload max bytes patched: ok"
grep -q "FAKE_GENERATION_PROGRESS_RATE=0.3" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "fake progress slowdown preserved: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
