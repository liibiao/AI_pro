#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
PATCHED_BIN="$INSTALL_DIR/CLIProxyAPI-result-cos"
ENV_FILE="$INSTALL_DIR/cos.env"
PKG="canvas-img2img-click-cliproxy-stream-fallback-20260605151655"

if [ -z "$PACKAGE" ]; then
  echo "usage: sudo $0 /tmp/$PKG.tar.gz" >&2
  exit 1
fi
if [ ! -f "$PACKAGE" ]; then
  echo "package not found: $PACKAGE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d "/tmp/$PKG.XXXXXX")"
BACKUP_DIR="$MIRROR_TARGET/.deploy-backups/$PKG-$STAMP"
SRC="$TMP_DIR/$PKG"

log(){ printf '[%s] %s\n' "$PKG" "$*"; }
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$PACKAGE" -C "$TMP_DIR"
if [ ! -d "$SRC" ]; then
  echo "invalid package layout: $SRC not found" >&2
  exit 1
fi

verify_canvas_markers(){
  local file="$1"
  grep -Fq "case'img2imgAll'" "$file" || { echo "missing img2imgAll branch marker in $file" >&2; exit 1; }
  grep -Fq "const concurrent=nodeConcurrentMode(n);" "$file" || { echo "missing img2imgAll concurrent fix marker in $file" >&2; exit 1; }
}

install_file(){
  local src="$1" dest="$2" label="$3"
  if [ ! -f "$src" ]; then
    echo "missing package file for $label: $src" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dest")" "$BACKUP_DIR/$(dirname "${dest#/}")"
  if [ -f "$dest" ]; then
    cp -p "$dest" "$BACKUP_DIR/${dest#/}"
  fi
  local mode="0644"
  if [ -f "$dest" ]; then
    mode="$(stat -c '%a' "$dest" 2>/dev/null || echo 0644)"
  fi
  install -m "$mode" "$src" "$dest"
  log "installed $label: $dest"
}

log "verify package canvas markers"
verify_canvas_markers "$SRC/workbench-web/image-studio-canvas-next.html"
verify_canvas_markers "$SRC/tools/workbench-web/image-studio-canvas-next.html"

log "install public workbench"
install_file "$SRC/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_DIR/image-studio-canvas-next.html" "public canvas"
verify_canvas_markers "$WORKBENCH_DIR/image-studio-canvas-next.html"

if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
  log "install mirror workbench"
  install_file "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html" "mirror canvas"
  verify_canvas_markers "$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
else
  log "mirror workbench skipped: $MIRROR_TARGET/tools/workbench-web not found"
fi

CLIPROXY_SRC="$SRC/cliproxy/CLIProxyAPI-image-stream-fallback-amd64"
if [ ! -f "$CLIPROXY_SRC" ]; then
  echo "missing CLIProxy binary: $CLIPROXY_SRC" >&2
  exit 1
fi
mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/backups"
if [ -f "$PATCHED_BIN" ]; then
  cp "$PATCHED_BIN" "$INSTALL_DIR/backups/CLIProxyAPI-result-cos.bak-$STAMP"
fi
install -m 0755 "$CLIPROXY_SRC" "$PATCHED_BIN"
log "installed CLIProxy patched binary: $PATCHED_BIN"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; cannot restart cli-proxy-api" >&2
  exit 1
fi

IMAGE="$(docker inspect cli-proxy-api --format '{{.Config.Image}}' 2>/dev/null || true)"
if [ -z "$IMAGE" ]; then
  IMAGE="eceasy/cli-proxy-api:latest"
fi

ENV_ARGS=()
if [ -f "$ENV_FILE" ]; then
  ENV_ARGS=(--env-file "$ENV_FILE")
else
  log "env file not found, continuing without $ENV_FILE"
fi

log "restart cli-proxy-api container"
docker stop cli-proxy-api >/dev/null 2>&1 || true
docker rm cli-proxy-api >/dev/null 2>&1 || true
docker run -d \
  --name cli-proxy-api \
  --restart unless-stopped \
  -p 127.0.0.1:1455:1455 \
  -p 127.0.0.1:8317:8317 \
  -e TZ=Asia/Shanghai \
  "${ENV_ARGS[@]}" \
  -v /opt/cliproxy/config.yaml:/CLIProxyAPI/config.yaml \
  -v /opt/cliproxy/auths:/root/.cli-proxy-api \
  -v /opt/cliproxy/logs:/CLIProxyAPI/logs \
  -v /opt/cliproxy/static/management.html:/CLIProxyAPI/static/management.html \
  -v "$PATCHED_BIN:/CLIProxyAPI/CLIProxyAPI" \
  "$IMAGE" >/dev/null

log "healthcheck cli-proxy-api"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8317/healthz >/dev/null || {
  echo "cli-proxy-api healthcheck failed; recent logs:" >&2
  docker logs --tail 80 cli-proxy-api >&2 || true
  exit 1
}

docker ps --filter name=cli-proxy-api --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
log "backup: $BACKUP_DIR"
log "deploy complete"
