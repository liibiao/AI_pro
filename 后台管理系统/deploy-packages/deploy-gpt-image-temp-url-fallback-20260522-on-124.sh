#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"

if [ -z "$PACKAGE" ] || [ ! -f "$PACKAGE" ]; then
  echo "用法: sudo BACKEND_DIR=/var/www/ai-admin/ai-admin-platform bash $0 /tmp/gpt-image-temp-url-fallback-124-20260522.tar.gz" >&2
  exit 1
fi
if [ ! -d "$BACKEND_DIR/api-server" ]; then
  echo "后台目录不存在: $BACKEND_DIR/api-server" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="/tmp/gpt-image-temp-url-fallback-124-$STAMP"
mkdir -p "$WORKDIR"
tar -xzf "$PACKAGE" -C "$WORKDIR"

echo "==> 覆盖后台 COS 失败临时 URL 兜底逻辑"
mkdir -p "$BACKEND_DIR/api-server/src/modules/generation/adapters"
mkdir -p "$BACKEND_DIR/api-server/dist/modules/generation/adapters"
cp "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
cp "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js"

echo "==> 编译后台"
cd "$BACKEND_DIR/api-server"
npm run build

echo "==> 重启后台"
pm2 restart ai-admin-api --update-env || pm2 restart all --update-env
pm2 save || true

echo "==> 校验标记"
grep -n "using provider temporary image url fallback" "$BACKEND_DIR/api-server/dist/modules/generation/adapters/registry.js"
echo "部署完成：GPT-Image 临时 URL 兜底已更新"
