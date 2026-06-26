#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/result-preview-url-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包。请先把 result-preview-url-fix-*.tar.gz 上传到服务器 /tmp/" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
REMOTE_WORKBENCH_ROOT="${REMOTE_WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
PUBLIC_BASE_URL_DEFAULT="${PUBLIC_BASE_URL_DEFAULT:-http://124.156.137.236}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/result-preview-url-fix-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/result-preview-url-fix-$STAMP"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

echo "==> 备份线上文件到 $BACKUP_DIR"
mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/admin-web" \
  "$BACKUP_DIR/workbench-web/canvas-next"

cp -a "$REMOTE_API_ROOT/api-server/src/config.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/config.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/config.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/config.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/admin-web/dist" "$BACKUP_DIR/ai-admin-platform/admin-web/dist" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/workbench-engine.js" "$BACKUP_DIR/workbench-web/workbench-engine.js" 2>/dev/null || true
cp -a "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true

echo "==> 覆盖线上文件"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/config.ts" "$REMOTE_API_ROOT/api-server/src/config.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/config.js" "$REMOTE_API_ROOT/api-server/dist/config.js"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
rm -rf "$REMOTE_API_ROOT/admin-web/dist"
cp -a "$DEPLOY_DIR/ai-admin-platform/admin-web/dist" "$REMOTE_API_ROOT/admin-web/dist"
cp -a "$DEPLOY_DIR/workbench-web/image-studio-canvas-next.html" "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
cp -a "$DEPLOY_DIR/workbench-web/workbench-engine.js" "$REMOTE_WORKBENCH_ROOT/workbench-engine.js"
mkdir -p "$REMOTE_WORKBENCH_ROOT/canvas-next"
cp -a "$DEPLOY_DIR/workbench-web/canvas-next/generation-service.js" "$REMOTE_WORKBENCH_ROOT/canvas-next/generation-service.js"

ENV_FILE="$REMOTE_API_ROOT/api-server/.env"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE"; then
    if grep -q '^PUBLIC_BASE_URL=$' "$ENV_FILE"; then
      sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=$PUBLIC_BASE_URL_DEFAULT#" "$ENV_FILE"
    fi
  else
    printf '\nPUBLIC_BASE_URL=%s\n' "$PUBLIC_BASE_URL_DEFAULT" >> "$ENV_FILE"
  fi
fi

echo "==> 重启后端"
pm2 restart ai-admin-api

echo "==> 校验"
sleep 2
curl -sS http://127.0.0.1:4000/api/health
echo
grep -q 'return `/api/generation/results/' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
echo "backend result url patched: ok"
grep -q 'publicBaseUrl' "$REMOTE_API_ROOT/api-server/dist/config.js"
echo "backend public base url config patched: ok"
if [[ -f "$ENV_FILE" ]]; then
  grep -q '^PUBLIC_BASE_URL=' "$ENV_FILE"
  echo "backend PUBLIC_BASE_URL env present: ok"
fi
grep -q 'normalizeGenerationResultUrl' "$REMOTE_WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "canvas url normalize patched: ok"
grep -q '240000' "$REMOTE_WORKBENCH_ROOT/workbench-engine.js"
echo "canvas upload timeout patched: ok"
grep -R -q 'normalizeGenerationResultUrl' "$REMOTE_API_ROOT/admin-web/dist/assets"
echo "admin url normalize patched: ok"

echo "部署完成。备份目录: $BACKUP_DIR"
echo "画布强制刷新： http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
echo "后台强制刷新： http://124.156.137.236/admin/?v=$STAMP"
