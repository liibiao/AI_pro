#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/model-pricing-credit-linkage-fix-20260603131653.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先上传 /tmp/model-pricing-credit-linkage-fix-20260603131653.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/model-pricing-credit-linkage-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/model-pricing-credit-linkage-fix-$STAMP"

test -d "$REMOTE_API_ROOT/api-server"
test -d "$REMOTE_WORKBENCH_ROOT"

mkdir -p \
  "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web"

tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖修复文件"
install -m 0644 "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
install -m 0644 "$DEPLOY_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts"
install -m 0644 "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"

echo "==> 编译 API"
cd "$REMOTE_API_ROOT/api-server"
npm run build

echo "==> 重启 $PM2_NAME"
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1 && sudo -iu "$PM2_USER" pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" pm2 restart "$PM2_NAME" --update-env
  sudo -iu "$PM2_USER" pm2 save || true
else
  echo "WARN: 未找到 PM2 进程 $PM2_NAME，请手动重启后端服务" >&2
fi

echo "==> 校验补丁"
grep -q "pricingPatchKeys" "$REMOTE_API_ROOT/api-server/src/modules/models/routes.ts"
grep -q "preserveExistingPricing" "$REMOTE_API_ROOT/api-server/src/sync-canvas-models.ts"
grep -q "function pricingObject(model)" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "estimateVideoModelCredits" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "smartFrameMotionSeconds" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
grep -q "applyVideoModelConstraints(n.values)" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "pricing save + canvas credit linkage patched: ok"

echo "==> 健康检查"
curl -sS http://127.0.0.1:4000/api/health || true
echo

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
