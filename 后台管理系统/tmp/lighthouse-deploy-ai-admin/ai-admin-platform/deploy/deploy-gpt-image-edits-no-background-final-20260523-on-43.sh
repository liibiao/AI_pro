#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/gpt-image-edits-no-background-final-43-20260523.tar.gz}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

log(){ printf '==> %s\n' "$*"; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 1; }; }
docker_cmd(){
  if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

need tar
need cp
need chmod

log "检查 binary 包"
test -f "$PKG" || { echo "包不存在: $PKG" >&2; exit 1; }
WORKDIR="$(mktemp -d /tmp/gpt-image-edits-no-background-43-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT
tar -xzf "$PKG" -C "$WORKDIR"
test -f "$WORKDIR/CLIProxyAPI" || { echo "包内缺少 CLIProxyAPI" >&2; exit 1; }
chmod +x "$WORKDIR/CLIProxyAPI"

log "停止中转站容器，避免 Text file busy"
if docker_cmd ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker_cmd stop "$CONTAINER_NAME" >/dev/null || true
fi

log "备份并安装 patched binary"
mkdir -p "$(dirname "$BINARY_PATH")"
if test -f "$BINARY_PATH"; then
  cp -f "$BINARY_PATH" "${BINARY_PATH}.bak.$(date +%Y%m%d%H%M%S)"
fi
cp -f "$WORKDIR/CLIProxyAPI" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

log "启动中转站容器"
if docker_cmd ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker_cmd start "$CONTAINER_NAME" >/dev/null
fi

log "校验服务"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8317/ >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8317/
    echo
    docker_cmd ps --filter "name=$CONTAINER_NAME"
    log "部署完成: $BINARY_PATH"
    exit 0
  fi
  sleep 1
done

echo "服务未在预期时间内恢复，请执行: sudo docker logs --tail=200 $CONTAINER_NAME" >&2
exit 1
