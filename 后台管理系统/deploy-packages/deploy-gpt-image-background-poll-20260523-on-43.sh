#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-background-poll-43-20260523.tar.gz}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"
INSTALL_DIR="$(dirname "$BINARY_PATH")"
ENV_FILE="${ENV_FILE:-$INSTALL_DIR/cos.env}"

echo "==> 检查 binary 包"
test -f "$PKG"
WORKDIR="$(mktemp -d /tmp/gpt-image-background-poll-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"
BIN="$WORKDIR/CLIProxyAPI-gpt-image-background-poll-amd64"
test -f "$BIN"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: 服务器缺少 docker，无法重启 $CONTAINER_NAME" >&2
  exit 1
fi

IMAGE="$(docker inspect "$CONTAINER_NAME" --format '{{.Config.Image}}' 2>/dev/null || true)"
if [ -z "$IMAGE" ]; then
  IMAGE="eceasy/cli-proxy-api:latest"
fi

echo "==> 停止旧容器，释放 binary 挂载"
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "==> 备份并安装 patched binary"
mkdir -p "$INSTALL_DIR/backups"
if [ -f "$BINARY_PATH" ]; then
  cp "$BINARY_PATH" "$INSTALL_DIR/backups/$(basename "$BINARY_PATH").bak-$(date +%Y%m%d%H%M%S)"
fi
install -m 0755 "$BIN" "$BINARY_PATH"

ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
else
  echo "提示: 未找到 $ENV_FILE，继续沿用容器环境默认值。"
fi

echo "==> 重建中转站容器"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 127.0.0.1:1455:1455 \
  -p 127.0.0.1:8317:8317 \
  -e TZ=Asia/Shanghai \
  -e GPT_IMAGE_4K_BACKGROUND="${GPT_IMAGE_4K_BACKGROUND:-1}" \
  "${ENV_ARGS[@]}" \
  -v /opt/cliproxy/config.yaml:/CLIProxyAPI/config.yaml \
  -v /opt/cliproxy/auths:/root/.cli-proxy-api \
  -v /opt/cliproxy/logs:/CLIProxyAPI/logs \
  -v /opt/cliproxy/static/management.html:/CLIProxyAPI/static/management.html \
  -v "$BINARY_PATH:/CLIProxyAPI/CLIProxyAPI" \
  "$IMAGE" >/dev/null

echo "==> 校验中转站服务"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8317/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8317/ >/dev/null || {
  echo "Error: 中转站未通过入口校验，最近日志如下:" >&2
  docker logs --tail 120 "$CONTAINER_NAME" >&2 || true
  exit 1
}
docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
echo "patched binary: $BINARY_PATH"
echo "部署完成：GPT-Image 大图非流式请求已开启 Responses background 轮询。"
