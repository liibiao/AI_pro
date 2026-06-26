#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-/tmp/gpt-image-no-large-special-default-43-20260522.tar.gz}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="/tmp/gpt-image-no-large-special-default-$STAMP"
INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
PATCHED_BIN="${BINARY_PATH:-$INSTALL_DIR/CLIProxyAPI-result-cos}"
ENV_FILE="$INSTALL_DIR/cos.env"

echo "==> 检查 binary 包"
test -f "$PACKAGE"
mkdir -p "$WORKDIR" "$INSTALL_DIR" "$INSTALL_DIR/backups"
tar -xzf "$PACKAGE" -C "$WORKDIR"

echo "==> 备份并安装 patched binary"
if [ -f "$PATCHED_BIN" ]; then
  cp "$PATCHED_BIN" "$INSTALL_DIR/backups/$(basename "$PATCHED_BIN").bak-$STAMP"
fi
install -m 0755 "$WORKDIR/CLIProxyAPI-result-cos-amd64" "$PATCHED_BIN"

echo "==> 写入 4K 策略：默认关闭大图特殊分支，让 4K 走 3K 同逻辑"
touch "$ENV_FILE"
grep -vE '^(GPT_IMAGE_4K_SPECIAL_MODE|GPT_IMAGE_LARGE_SPECIAL_MODE|GPT_IMAGE_4K_NON_STREAM|GPT_IMAGE_LARGE_NON_STREAM|GPT_IMAGE_PARTIAL_FALLBACK_ON_DISCONNECT|GPT_IMAGE_4K_PARTIAL_IMAGES|GPT_IMAGE_LARGE_PARTIAL_IMAGES)=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
cat >> "$ENV_FILE.tmp" <<'EOF'
GPT_IMAGE_4K_SPECIAL_MODE=0
GPT_IMAGE_LARGE_SPECIAL_MODE=0
GPT_IMAGE_4K_NON_STREAM=0
GPT_IMAGE_LARGE_NON_STREAM=0
GPT_IMAGE_PARTIAL_FALLBACK_ON_DISCONNECT=0
GPT_IMAGE_4K_PARTIAL_IMAGES=0
GPT_IMAGE_LARGE_PARTIAL_IMAGES=0
EOF
mv "$ENV_FILE.tmp" "$ENV_FILE"

echo "==> 重建 cli-proxy-api 容器"
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: 服务器缺少 docker，无法重启 cli-proxy-api 容器" >&2
  exit 1
fi

IMAGE="$(docker inspect cli-proxy-api --format '{{.Config.Image}}' 2>/dev/null || true)"
if [ -z "$IMAGE" ]; then
  IMAGE="eceasy/cli-proxy-api:latest"
fi

docker stop cli-proxy-api >/dev/null 2>&1 || true
docker rm cli-proxy-api >/dev/null 2>&1 || true

docker run -d \
  --name cli-proxy-api \
  --restart unless-stopped \
  -p 127.0.0.1:1455:1455 \
  -p 127.0.0.1:8317:8317 \
  -e TZ=Asia/Shanghai \
  --env-file "$ENV_FILE" \
  -v /opt/cliproxy/config.yaml:/CLIProxyAPI/config.yaml \
  -v /opt/cliproxy/auths:/root/.cli-proxy-api \
  -v /opt/cliproxy/logs:/CLIProxyAPI/logs \
  -v /opt/cliproxy/static/management.html:/CLIProxyAPI/static/management.html \
  -v "$PATCHED_BIN:/CLIProxyAPI/CLIProxyAPI" \
  "$IMAGE" >/dev/null

echo "==> 校验服务"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8317/healthz || {
  echo "Error: cli-proxy-api 未通过 healthz 校验，最近日志如下:" >&2
  docker logs --tail 80 cli-proxy-api >&2 || true
  exit 1
}

docker ps --filter name=cli-proxy-api --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
echo "gpt-image 4K no-large-special-default patched: ok"
echo "部署完成。patched binary: $PATCHED_BIN"
