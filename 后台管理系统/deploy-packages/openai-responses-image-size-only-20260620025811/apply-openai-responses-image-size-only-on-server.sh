#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "用法: $0 /tmp/openai-responses-image-size-only-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_API_ROOT="${REMOTE_API_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
STAMP="$(date +%Y%m%d%H%M%S)"
DEPLOY_DIR="/tmp/openai-responses-image-size-only-$STAMP"
BACKUP_DIR="$REMOTE_ROOT/backups/openai-responses-image-size-only-$STAMP"

SRC_REGISTRY="$DEPLOY_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
DIST_REGISTRY="$DEPLOY_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"

mkdir -p "$DEPLOY_DIR" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters"
tar -xzf "$PKG" -C "$DEPLOY_DIR"

if [[ ! -f "$SRC_REGISTRY" || ! -f "$DIST_REGISTRY" ]]; then
  echo "部署包缺少 registry.ts 或 registry.js" >&2
  exit 1
fi
grep -q "openAiResponsesImageGeometryOptions" "$SRC_REGISTRY"
grep -q "return compactJson({ size })" "$SRC_REGISTRY"
grep -q "openAiResponsesImageGeometryOptions" "$DIST_REGISTRY"
grep -q "return compactJson({ size })" "$DIST_REGISTRY"
GEOMETRY_BLOCK="$(sed -n '/function openAiResponsesImageGeometryOptions/,/async function queryOpenAiResponsesImage/p' "$DIST_REGISTRY")"
if printf '%s\n' "$GEOMETRY_BLOCK" | grep -Eq "aspect_ratio|resolveGptImage2Resolution|reasoning_effort"; then
  echo "Responses image_generation tool geometry 仍包含非法字段" >&2
  exit 1
fi

echo "==> 备份后台适配器到 $BACKUP_DIR"
cp -a "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
cp -a "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

echo "==> 覆盖后台 OpenAI Responses 适配器"
cp -a "$SRC_REGISTRY" "$REMOTE_API_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$DIST_REGISTRY" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 校验远端文件"
grep -q "return compactJson({ size })" "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js"
REMOTE_GEOMETRY_BLOCK="$(sed -n '/function openAiResponsesImageGeometryOptions/,/async function queryOpenAiResponsesImage/p' "$REMOTE_API_ROOT/api-server/dist/modules/generation/adapters/registry.js")"
if printf '%s\n' "$REMOTE_GEOMETRY_BLOCK" | grep -Eq "aspect_ratio|resolveGptImage2Resolution|reasoning_effort"; then
  echo "远端 Responses image_generation tool geometry 仍包含非法字段" >&2
  exit 1
fi

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
