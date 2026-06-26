#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "用法: sudo $0 /tmp/model-upload-server-selector-fix-*.tar.gz"
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/var/www/ai-admin/backups/model-upload-server-selector-fix-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> 解包 $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "==> 备份线上文件到 $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/api-server/dist/modules/models" "$BACKUP_ROOT/api-server/src/modules/models" "$BACKUP_ROOT/admin-web"
cp -f "$APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_ROOT/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_ROOT/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/admin-web/dist" "$BACKUP_ROOT/admin-web/dist" 2>/dev/null || true
cp -f "$APP_ROOT/admin-web/src/main.tsx" "$BACKUP_ROOT/admin-web/main.tsx" 2>/dev/null || true

echo "==> 覆盖后端模型接口和后台前端"
cp -f "$WORK_DIR/api-server/dist/modules/models/routes.js" "$APP_ROOT/api-server/dist/modules/models/routes.js"
if [[ -d "$APP_ROOT/api-server/src/modules/models" ]]; then
  cp -f "$WORK_DIR/api-server/src/modules/models/routes.ts" "$APP_ROOT/api-server/src/modules/models/routes.ts"
fi
rm -rf "$APP_ROOT/admin-web/dist"
mkdir -p "$APP_ROOT/admin-web"
cp -a "$WORK_DIR/admin-web/dist" "$APP_ROOT/admin-web/dist"
if [[ -d "$APP_ROOT/admin-web/src" ]]; then
  cp -f "$WORK_DIR/admin-web/src/main.tsx" "$APP_ROOT/admin-web/src/main.tsx"
fi

echo "==> 重启后端"
sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env

echo "==> 校验"
for i in {1..20}; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    curl -fsS http://127.0.0.1:4000/api/health
    echo
    break
  fi
  sleep 1
done
grep -q 'normalizeUploadMode' "$APP_ROOT/api-server/dist/modules/models/routes.js" && echo "model upload mode persistence patched: ok"
grep -Rqs '上传服务器' "$APP_ROOT/admin-web/dist" && echo "model upload server selector ui patched: ok"
grep -Rqs 'FILES 服务上传' "$APP_ROOT/admin-web/dist" && echo "files upload option patched: ok"
grep -Rqs 'COS 服务上传' "$APP_ROOT/admin-web/dist" && echo "cos upload option patched: ok"

echo "部署完成。备份目录: $BACKUP_ROOT"
echo "后台强制刷新: http://124.156.137.236/?v=$(date +%Y%m%d%H%M%S)"
