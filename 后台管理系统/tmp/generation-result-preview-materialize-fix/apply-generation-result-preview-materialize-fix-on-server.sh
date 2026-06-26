#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "用法: sudo $0 /tmp/generation-result-preview-materialize-fix-*.tar.gz"
  exit 1
fi

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
BACKUP_ROOT="/var/www/ai-admin/backups/generation-result-preview-materialize-fix-$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "==> 解包 $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "==> 备份线上文件到 $BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/api-server/dist/modules/generation/adapters" "$BACKUP_ROOT/api-server/src/modules/generation/adapters" "$BACKUP_ROOT/api-server/src/modules/generation" "$BACKUP_ROOT/admin-web"
cp -f "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_ROOT/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_ROOT/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_ROOT/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -f "$APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_ROOT/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
cp -a "$APP_ROOT/admin-web/dist" "$BACKUP_ROOT/admin-web/dist" 2>/dev/null || true
cp -f "$APP_ROOT/admin-web/src/main.tsx" "$BACKUP_ROOT/admin-web/main.tsx" 2>/dev/null || true

echo "==> 覆盖后端和后台管理前端"
cp -f "$WORK_DIR/api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
cp -f "$WORK_DIR/api-server/dist/modules/generation/routes.js" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
if [[ -d "$APP_ROOT/api-server/src/modules/generation/adapters" ]]; then
  cp -f "$WORK_DIR/api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
fi
if [[ -d "$APP_ROOT/api-server/src/modules/generation" ]]; then
  cp -f "$WORK_DIR/api-server/src/modules/generation/routes.ts" "$APP_ROOT/api-server/src/modules/generation/routes.ts"
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
curl -fsS http://127.0.0.1:4000/api/health
echo
grep -q 'materializeImageResultUrl' "$APP_ROOT/api-server/dist/modules/generation/routes.js" && echo "stored image result materialize patched: ok"
grep -q 'fs.writeFile(path.join(GENERATED_IMAGE_DIR, localName), bytes)' "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" && echo "remote image result local fallback patched: ok"
grep -Rqs 'img2img|image-to-image|image_to_image|edit|repair|refine|panorama' "$APP_ROOT/admin-web/dist" && echo "admin image task type label patched: ok"

echo "部署完成。备份目录: $BACKUP_ROOT"
echo "后台强制刷新: http://124.156.137.236/?v=$(date +%Y%m%d%H%M%S)"
