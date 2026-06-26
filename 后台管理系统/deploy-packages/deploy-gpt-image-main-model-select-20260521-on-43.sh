#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-main-model-select-20260521.tar.gz}"
CLIPROXY_DIR="${CLIPROXY_DIR:-/home/ubuntu/CLIProxyAPI-main}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

echo "==> 检查包和中转站源码目录"
test -f "$PKG"
test -d "$CLIPROXY_DIR"

WORKDIR="$(mktemp -d /tmp/gpt-image-main-model-select-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
SRC="$WORKDIR/gpt-image-main-model-select-20260521"

echo "==> 覆盖 43 中转站图片兼容入口"
install -m 0644 "$SRC/cliproxy/sdk/api/handlers/openai/openai_images_handlers.go" "$CLIPROXY_DIR/sdk/api/handlers/openai/openai_images_handlers.go"

echo "==> 编译并校验"
cd "$CLIPROXY_DIR"
go test ./sdk/api/handlers/openai ./sdk/api/handlers ./internal/runtime/executor
mkdir -p "$(dirname "$BINARY_PATH")"
go build -o "$BINARY_PATH" ./cmd/server
chmod +x "$BINARY_PATH"

echo "==> 校验关键标记"
grep -n "parseImagesMainModelField" "$CLIPROXY_DIR/sdk/api/handlers/openai/openai_images_handlers.go"
grep -n "main_model" "$CLIPROXY_DIR/sdk/api/handlers/openai/openai_images_handlers.go"
grep -n "gpt-5.5" "$CLIPROXY_DIR/sdk/api/handlers/openai/openai_images_handlers.go"

echo "==> 重启中转站"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker restart "$CONTAINER_NAME"
else
  systemctl restart cli-proxy-api 2>/dev/null || pm2 restart "$CONTAINER_NAME" --update-env || true
fi

echo "部署完成：43 中转站已支持 main_model / responsesModel / codexModel 控制 GPT-Image-2 外层模型。patched binary: $BINARY_PATH"
