#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
PKG_NAME="antigravity-models-full-chain-20260607121521"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_APP_ROOT/api-server}"
REMOTE_ADMIN_ROOT="${REMOTE_ADMIN_ROOT:-$REMOTE_APP_ROOT/admin-web}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/$PKG_NAME-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/$PKG_NAME-$STAMP"

if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: sudo bash $0 /tmp/$PKG_NAME.tar.gz" >&2
  exit 1
fi
if [[ ! -d "$REMOTE_API_ROOT" || ! -d "$REMOTE_ADMIN_ROOT" ]]; then
  echo "线上目录不存在: $REMOTE_API_ROOT / $REMOTE_ADMIN_ROOT" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/workbench-web"

tar -xzf "$PKG" -C "$DEPLOY_DIR"
SRC="$DEPLOY_DIR/$PKG_NAME"
if [[ ! -d "$SRC" ]]; then
  SRC="$DEPLOY_DIR"
fi

for required in \
  "$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts" \
  "$SRC/ai-admin-platform/api-server/dist/modules/models/routes.js" \
  "$SRC/ai-admin-platform/admin-web/src/main.tsx" \
  "$SRC/ai-admin-platform/admin-web/dist/index.html" \
  "$SRC/workbench-web/image-studio-canvas-next.html"; do
  if [[ ! -f "$required" ]]; then
    echo "部署包缺少文件: $required" >&2
    exit 1
  fi
done

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -a "$REMOTE_ADMIN_ROOT/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
cp -a "$REMOTE_ADMIN_ROOT/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖后端模型路由"
mkdir -p "$REMOTE_API_ROOT/src/modules/models" "$REMOTE_API_ROOT/dist/modules/models"
cp -a "$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_API_ROOT/src/modules/models/routes.ts"
cp -a "$SRC/ai-admin-platform/api-server/dist/modules/models/routes.js" "$REMOTE_API_ROOT/dist/modules/models/routes.js"

echo "==> 覆盖后台管理前端"
mkdir -p "$REMOTE_ADMIN_ROOT/src" "$REMOTE_ADMIN_ROOT/dist"
cp -a "$SRC/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_ADMIN_ROOT/src/main.tsx"
cp -a "$SRC/ai-admin-platform/admin-web/dist/." "$REMOTE_ADMIN_ROOT/dist/"

echo "==> 覆盖画布入口"
mkdir -p "$REMOTE_WORKBENCH_ROOT"
cp -a "$SRC/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
if [[ -d "$REMOTE_APP_ROOT/workbench-web" ]]; then
  cp -a "$SRC/workbench-web/image-studio-canvas-next.html" "$REMOTE_APP_ROOT/workbench-web/image-studio-canvas-next.html"
fi

echo "==> 重启后端 PM2"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "当前用户的 PM2 中未找到 ai-admin-api。请切换到运行服务的用户后执行：pm2 restart ai-admin-api --update-env" >&2
fi

echo "==> 校验"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health || true
echo
grep -q "model-presets/antigravity" "$REMOTE_API_ROOT/dist/modules/models/routes.js"
echo "antigravity preset route: ok"
grep -q "gemini-3.1-flash-image" "$REMOTE_API_ROOT/dist/modules/models/routes.js"
echo "antigravity image model preset: ok"
grep -R -q "接入 Antigravity/45" "$REMOTE_ADMIN_ROOT/dist"
echo "admin preset button: ok"
grep -q "isPreferredGeminiFlashImageModel" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas preferred image model: ok"
grep -q "storyboardImage" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas storyboard image model routing: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "后台: http://124.156.137.236/admin/?v=$STAMP"
echo "画布: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
