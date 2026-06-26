#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/cliproxy-grok-video-image-reference-fix-20260606124530.tar.gz}"
PKG_NAME="cliproxy-grok-video-image-reference-fix-20260606124530"
INSTALL_DIR="${INSTALL_DIR:-/opt/cliproxy}"
APP_BIN="${APP_BIN:-$INSTALL_DIR/CLIProxyAPI}"
SERVICE_NAME="${SERVICE_NAME:-cli-proxy-api}"
CONFIG_FILE="${CONFIG_FILE:-$INSTALL_DIR/config.yaml}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d "/tmp/$PKG_NAME-XXXXXX")"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
cleanup(){ rm -rf "$WORK"; }
trap cleanup EXIT

test -f "$PKG" || { echo "missing package: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/$PKG_NAME"
BIN="$SRC/bin/CLIProxyAPI-grok-video-image-reference-fix-amd64"
test -f "$BIN" || { echo "package missing binary: $BIN" >&2; exit 1; }
grep -Fq "xaiVideosWantsImageToVideo" "$SRC/src/sdk/api/handlers/openai/openai_videos_handlers.go"

log "prepare directories"
run_sudo mkdir -p "$INSTALL_DIR/backups"
if [ -f "$APP_BIN" ]; then
  log "backup old binary"
  run_sudo cp "$APP_BIN" "$INSTALL_DIR/backups/$(basename "$APP_BIN").bak-$STAMP"
fi

log "install patched CLIProxyAPI binary"
run_sudo install -m 0755 "$BIN" "$APP_BIN"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "config file not found: $CONFIG_FILE" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
  log "restart $SERVICE_NAME service"
  run_sudo systemctl restart "$SERVICE_NAME"
else
  echo "systemd service not found: $SERVICE_NAME" >&2
  exit 1
fi

log "health check"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8317/healthz >/dev/null

status="$(curl -sS -o /tmp/cliproxy-video-route-check.out -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:8317/v1/videos || true)"
case "$status" in
  404|000)
    echo "route check failed: POST /v1/videos HTTP $status" >&2
    cat /tmp/cliproxy-video-route-check.out >&2 || true
    exit 1
    ;;
  *)
    log "route reachable: POST /v1/videos HTTP $status"
    ;;
esac

run_sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,14p'
log "done"
