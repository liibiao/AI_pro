#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/canvas-cos-direct-reference-upload-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 canvas-cos-direct-reference-upload-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/canvas-cos-direct-reference-upload-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/canvas-cos-direct-reference-upload-fix-$STAMP"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_WORKBENCH_ROOT/workbench-engine.js" "$BACKUP_DIR/workbench-web/workbench-engine.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/src/object-storage.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/object-storage.ts" 2>/dev/null || true
cp -a "$REMOTE_APP_ROOT/api-server/dist/object-storage.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/object-storage.js" 2>/dev/null || true

echo "==> 覆盖画布上传引擎和对象存储签名接口"
cp -a "$DEPLOY_DIR/workbench-web/workbench-engine.js" "$REMOTE_WORKBENCH_ROOT/workbench-engine.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/object-storage.ts" "$REMOTE_APP_ROOT/api-server/src/object-storage.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/object-storage.js" "$REMOTE_APP_ROOT/api-server/dist/object-storage.js"

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
curl -sS http://127.0.0.1:4000/api/health || true
echo
grep -q "OBJECT_STORAGE_UPLOAD_TARGET_API" "$REMOTE_WORKBENCH_ROOT/workbench-engine.js"
echo "canvas COS direct upload target patched: ok"
grep -q "putObjectStorageDirect" "$REMOTE_WORKBENCH_ROOT/workbench-engine.js"
echo "canvas browser direct COS PUT patched: ok"
grep -q "object-storage-upload-target" "$REMOTE_APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
echo "backend COS direct upload target route patched: ok"
grep -q "signTencentCosPutUrl" "$REMOTE_APP_ROOT/api-server/dist/object-storage.js"
echo "backend COS signed URL patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
