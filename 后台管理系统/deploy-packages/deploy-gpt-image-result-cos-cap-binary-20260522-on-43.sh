#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-result-cos-cap-binary-43-20260522.tar.gz}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

echo "==> 检查 binary 包"
test -f "$PKG"
test -d "$(dirname "$BINARY_PATH")"

WORKDIR="$(mktemp -d /tmp/gpt-image-result-cos-cap-binary-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --no-same-owner -xzf "$PKG" -C "$WORKDIR"
test -x "$WORKDIR/CLIProxyAPI-result-cos"

echo "==> 备份并安装 patched binary"
BACKUP_DIR="/opt/cliproxy/backups/gpt-image-result-cos-cap-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -f "$BINARY_PATH" ]; then
  cp -a "$BINARY_PATH" "$BACKUP_DIR/CLIProxyAPI-result-cos.bak"
fi
install -m 0755 "$WORKDIR/CLIProxyAPI-result-cos" "$BINARY_PATH"

echo "==> 校验结果转存专用大小限制标记"
grep -aq "RESULT_OBJECT_STORAGE_MAX_BYTES" "$BINARY_PATH"
echo "RESULT_OBJECT_STORAGE_MAX_BYTES: ok"
grep -aq "image result exceeds object storage max size" "$BINARY_PATH"
echo "image result max-size guard: ok"
ls -l "$BINARY_PATH"

echo "==> 重启中转站容器"
docker restart "$CONTAINER_NAME"
docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep "$CONTAINER_NAME"

echo "部署完成：43 中转站 GPT-Image 结果 COS 转存默认使用独立 80MB 限制。backup: $BACKUP_DIR"
