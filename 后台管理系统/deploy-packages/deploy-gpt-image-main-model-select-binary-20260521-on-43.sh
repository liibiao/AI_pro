#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-main-model-select-binary-43-20260521.tar.gz}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

echo "==> 检查 binary 包"
test -f "$PKG"
test -d "$(dirname "$BINARY_PATH")"

WORKDIR="$(mktemp -d /tmp/gpt-image-main-model-select-binary-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
test -x "$WORKDIR/CLIProxyAPI-result-cos"

echo "==> 备份并安装 patched binary"
BACKUP_DIR="/opt/cliproxy/backups/gpt-image-main-model-select-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -f "$BINARY_PATH" ]; then
  cp -a "$BINARY_PATH" "$BACKUP_DIR/CLIProxyAPI-result-cos.bak"
fi
install -m 0755 "$WORKDIR/CLIProxyAPI-result-cos" "$BINARY_PATH"

echo "==> 校验 binary 关键标记"
strings "$BINARY_PATH" | grep -m 1 "main_model"
strings "$BINARY_PATH" | grep -m 1 "responses_model"
strings "$BINARY_PATH" | grep -m 1 "gpt-5.5"
ls -l "$BINARY_PATH"

echo "==> 重启中转站容器"
docker restart "$CONTAINER_NAME"
docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep "$CONTAINER_NAME"

echo "部署完成：43 中转站 patched binary 已支持 GPT-Image-2 外层模型切换。backup: $BACKUP_DIR"
