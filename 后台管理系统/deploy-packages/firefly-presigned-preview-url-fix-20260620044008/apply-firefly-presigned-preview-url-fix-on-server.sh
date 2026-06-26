#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: $0 /tmp/firefly-presigned-preview-url-fix-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PUBLIC_WORKBENCH_DIR="${PUBLIC_WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/firefly-presigned-preview-url-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/firefly-presigned-preview-url-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/public-workbench" \
  "$BACKUP_DIR/tools-workbench"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

PKG_ROOT="$DEPLOY_DIR/firefly-presigned-preview-url-fix-20260620044008"
SRC_REGISTRY="$PKG_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
DIST_REGISTRY="$PKG_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
SRC_ROUTES="$PKG_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
DIST_ROUTES="$PKG_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"
SRC_APP="$PKG_ROOT/ai-admin-platform/api-server/src/app.ts"
DIST_APP="$PKG_ROOT/ai-admin-platform/api-server/dist/app.js"
PUBLIC_HTML="$PKG_ROOT/workbench-web/image-studio-canvas-next.html"
MIRROR_HTML="$PKG_ROOT/tools/workbench-web/image-studio-canvas-next.html"

verify_registry() {
  local file="$1"
  grep -Fq "FIREFLY_URL_ENTITY_DECODE_ADAPTER" "$file"
  grep -Fq "isAiyunzhiFireflyPresignedImageUrl" "$file"
  grep -Fq "normalizeAiyunzhiFireflyImageUrl" "$file"
  grep -Fq "decodeUrlEntityEscapes(value)" "$file"
}

verify_routes() {
  local file="$1"
  grep -Fq "FIREFLY_URL_ENTITY_DECODE_STORAGE" "$file"
  grep -Fq "decodeGenerationResultUrlEntities" "$file"
}

verify_app() {
  local file="$1"
  grep -Fq "imgSrc" "$file"
  grep -Fq "'https:'" "$file"
  grep -Fq "'http:'" "$file"
}

verify_html() {
  local file="$1"
  grep -Fq "FIREFLY_DIRECT_TEMP_PREVIEW" "$file"
  grep -Fq "FIREFLY_TEMP_PREVIEW_EARLY_OK" "$file"
  grep -Fq "FIREFLY_URL_ENTITY_DECODE_PREVIEW" "$file"
  grep -Fq "function decodeUrlEntityEscapes(value)" "$file"
}

echo "==> 校验部署包"
for file in "$SRC_REGISTRY" "$DIST_REGISTRY" "$SRC_ROUTES" "$DIST_ROUTES" "$SRC_APP" "$DIST_APP" "$PUBLIC_HTML" "$MIRROR_HTML"; do
  [[ -f "$file" ]] || { echo "缺少文件: $file" >&2; exit 1; }
done
verify_registry "$SRC_REGISTRY"
verify_registry "$DIST_REGISTRY"
verify_routes "$SRC_ROUTES"
verify_routes "$DIST_ROUTES"
verify_app "$SRC_APP"
verify_app "$DIST_APP"
verify_html "$PUBLIC_HTML"
verify_html "$MIRROR_HTML"

echo "==> 备份到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/app.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/app.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/app.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/app.js" 2>/dev/null || true
cp -a "$PUBLIC_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/public-workbench/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/tools-workbench/image-studio-canvas-next.html" 2>/dev/null || true

echo "==> 覆盖后端和画布前端"
cp -a "$SRC_REGISTRY" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DIST_REGISTRY" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$SRC_ROUTES" "$REMOTE_API_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$DIST_ROUTES" "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js"
cp -a "$SRC_APP" "$REMOTE_API_ROOT/api-server/src/app.ts"
cp -a "$DIST_APP" "$REMOTE_API_ROOT/api-server/dist/app.js"
mkdir -p "$PUBLIC_WORKBENCH_DIR" "$MIRROR_WORKBENCH_DIR"
cp -a "$PUBLIC_HTML" "$PUBLIC_WORKBENCH_DIR/image-studio-canvas-next.html"
cp -a "$MIRROR_HTML" "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html"

echo "==> 校验远端文件"
verify_registry "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
verify_routes "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js"
verify_app "$REMOTE_API_ROOT/api-server/dist/app.js"
verify_html "$PUBLIC_WORKBENCH_DIR/image-studio-canvas-next.html"
verify_html "$MIRROR_WORKBENCH_DIR/image-studio-canvas-next.html"
node --check "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
node --check "$REMOTE_API_ROOT/api-server/dist/modules/generation/routes.js"
node --check "$REMOTE_API_ROOT/api-server/dist/app.js"

echo "==> 重启后端"
if command -v pm2 >/dev/null 2>&1 && pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
elif command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q '"pm_id"'; then
  pm2 restart all --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 jlist 2>/dev/null | grep -q '"pm_id"'; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart all --update-env
else
  echo "没有找到可重启的 PM2 后端进程" >&2
  exit 1
fi

echo "==> 校验服务"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
echo "部署完成。备份目录: $BACKUP_DIR"
