#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-request-slim-124-20260523.tar.gz}"
BACKEND_DIR="${BACKEND_DIR:-/var/www/ai-admin/ai-admin-platform}"

echo "==> 检查包和后台目录"
test -f "$PKG"
test -d "$BACKEND_DIR/api-server"

WORKDIR="$(mktemp -d /tmp/gpt-image-request-slim-124-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"

echo "==> 覆盖 GPT-Image 请求裁剪逻辑"
cp "$WORKDIR/backend/api-server/src/modules/generation/adapters/registry.ts" \
  "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"

echo "==> 编译后台"
(cd "$BACKEND_DIR/api-server" && npm run build)

echo "==> 重启后台 PM2"
PM2_USER="${PM2_USER:-${SUDO_USER:-$(id -un)}}"
if command -v pm2 >/dev/null 2>&1; then
  if [ "$(id -un)" = "root" ] && [ "$PM2_USER" != "root" ] && id "$PM2_USER" >/dev/null 2>&1; then
    PM2_CMD=(sudo -u "$PM2_USER" env "HOME=/home/$PM2_USER" pm2)
  else
    PM2_CMD=(pm2)
  fi
  "${PM2_CMD[@]}" restart ai-admin-api --update-env || "${PM2_CMD[@]}" restart all --update-env || true
  "${PM2_CMD[@]}" save || true
fi

echo "==> 校验关键标记"
grep -n "openAiImageUpstreamOptions" "$BACKEND_DIR/api-server/src/modules/generation/adapters/registry.ts"
echo "部署完成：OpenAI Images 发往 43 的请求体已去掉画布 UI/审计冗余字段。"
