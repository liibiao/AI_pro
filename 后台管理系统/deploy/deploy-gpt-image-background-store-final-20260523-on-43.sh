#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
BINARY_PATH="${BINARY_PATH:-/opt/cliproxy/CLIProxyAPI-result-cos}"
CONTAINER_NAME="${CONTAINER_NAME:-cli-proxy-api}"

if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "Usage: BINARY_PATH=/opt/cliproxy/CLIProxyAPI-result-cos bash $0 /tmp/package.tar.gz" >&2
  exit 1
fi

WORKDIR="$(mktemp -d /tmp/gpt-image-background-store-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Extract package"
tar -xzf "$PKG" -C "$WORKDIR"
if [[ ! -f "$WORKDIR/CLIProxyAPI" ]]; then
  echo "Binary not found in package: CLIProxyAPI" >&2
  exit 1
fi

echo "==> Stop relay container to avoid Text file busy"
if command -v docker >/dev/null 2>&1; then
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
elif command -v sudo >/dev/null 2>&1; then
  sudo docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

echo "==> Backup and install patched binary"
if [[ -f "$BINARY_PATH" ]]; then
  cp "$BINARY_PATH" "$BINARY_PATH.bak.$(date +%Y%m%d%H%M%S)"
fi
cp "$WORKDIR/CLIProxyAPI" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo "==> Start relay container"
if command -v docker >/dev/null 2>&1; then
  docker start "$CONTAINER_NAME" >/dev/null
else
  sudo docker start "$CONTAINER_NAME" >/dev/null
fi

sleep 2

echo "==> Verify service"
curl -fsS http://127.0.0.1:8317/ || {
  echo "Relay root endpoint is not ready. Check: sudo docker logs --tail=200 $CONTAINER_NAME" >&2
  exit 1
}

echo
echo "==> Verify binary markers"
strings "$BINARY_PATH" | grep -E "background|store|stream|response.completed" | head -20 || true

echo "Done."
