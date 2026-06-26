#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-result-cos-retry-binary-43-20260522.tar.gz}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

echo "==> 检查 binary 包"
test -f "$PKG"
test -d "$(dirname "$BINARY_PATH")"

WORKDIR="$(mktemp -d /tmp/gpt-image-result-cos-retry-binary-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
test -x "$WORKDIR/CLIProxyAPI-result-cos"

echo "==> 备份并安装 patched binary"
BACKUP_DIR="/opt/cliproxy/backups/gpt-image-result-cos-retry-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
if [ -f "$BINARY_PATH" ]; then
  cp -a "$BINARY_PATH" "$BACKUP_DIR/CLIProxyAPI-result-cos.bak"
fi
install -m 0755 "$WORKDIR/CLIProxyAPI-result-cos" "$BINARY_PATH"

echo "==> 校验 COS PUT 抗抖与 4K 断流兜底标记"
grep -aq "put object attempt" "$BINARY_PATH"
echo "COS PUT retry marker: ok"
grep -aq "RESULT_OBJECT_STORAGE_MAX_BYTES" "$BINARY_PATH"
echo "result COS cap marker: ok"
grep -aq "synthesized response.completed from image output_item.done" "$BINARY_PATH"
echo "4K stream completion fallback marker: ok"
grep -aq "serialized large/4K" "$BINARY_PATH"
echo "4K concurrency gate marker: ok"
ls -l "$BINARY_PATH"

echo "==> 重启中转站容器"
docker restart "$CONTAINER_NAME"
docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep "$CONTAINER_NAME"

echo "部署完成：43 中转站 GPT-Image 已增加结果 COS 转存重试、4K 并发闸门，以及 4K 上游断流后已拿到图片结果的 completed 兜底。backup: $BACKUP_DIR"
