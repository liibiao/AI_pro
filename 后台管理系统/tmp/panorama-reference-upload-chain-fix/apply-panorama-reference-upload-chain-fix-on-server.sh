#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "用法: sudo $0 /tmp/panorama-reference-upload-chain-fix-*.tar.gz"
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
CANVAS_ROOT="/var/www/ai-admin/workbench-web"
BACKUP_ROOT="/var/www/ai-admin/backups/panorama-reference-upload-chain-fix-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> 解包 $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "==> 备份线上文件到 $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/api-server/dist/modules/workbench-compat" "$BACKUP_ROOT/api-server/src/modules/workbench-compat" "$BACKUP_ROOT/workbench-web/canvas-next"
cp -f "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_ROOT/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_ROOT/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
cp -f "$CANVAS_ROOT/image-studio-canvas-next.html" "$BACKUP_ROOT/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -f "$CANVAS_ROOT/canvas-next/generation-service.js" "$BACKUP_ROOT/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "==> 覆盖后端和画布前端"
cp -f "$WORK_DIR/api-server/dist/modules/workbench-compat/routes.js" "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js"
if [[ -d "$APP_ROOT/api-server/src/modules/workbench-compat" ]]; then
  cp -f "$WORK_DIR/api-server/src/modules/workbench-compat/routes.ts" "$APP_ROOT/api-server/src/modules/workbench-compat/routes.ts"
fi
cp -f "$WORK_DIR/workbench-web/image-studio-canvas-next.html" "$CANVAS_ROOT/image-studio-canvas-next.html"
if [[ -d "$CANVAS_ROOT/canvas-next" ]]; then
  cp -f "$WORK_DIR/workbench-web/canvas-next/generation-service.js" "$CANVAS_ROOT/canvas-next/generation-service.js"
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
grep -q 'fallbackRemoteUrl' "$APP_ROOT/api-server/dist/modules/workbench-compat/routes.js" && echo "provider file cos fallback patched: ok"
grep -q '全景参考图使用公网 URL' "$CANVAS_ROOT/image-studio-canvas-next.html" && echo "panorama public reference mode patched: ok"
grep -q 'normalizeProviderRef' "$CANVAS_ROOT/canvas-next/generation-service.js" && echo "modular panorama reference normalize patched: ok"

echo "部署完成。备份目录: $BACKUP_ROOT"
echo "画布强制刷新: http://124.156.137.236/image-studio-canvas-next.html?v=$(date +%Y%m%d%H%M%S)"
