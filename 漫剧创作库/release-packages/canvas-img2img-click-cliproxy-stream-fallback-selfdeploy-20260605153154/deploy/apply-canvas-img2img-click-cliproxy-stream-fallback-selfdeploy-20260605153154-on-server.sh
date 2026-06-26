#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-}"
PKG="canvas-img2img-click-cliproxy-stream-fallback-selfdeploy-20260605153154"

WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$WEB_ROOT/workbench-web}"
ALT_WORKBENCH_DIR="${ALT_WORKBENCH_DIR:-$WEB_ROOT/ai-admin-platform/workbench-web}"
MIRROR_TARGET="${2:-${MIRROR_TARGET:-/home/ubuntu/漫剧创作库}}"

CLIPROXY_INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
CLIPROXY_BIN="$CLIPROXY_INSTALL_DIR/CLIProxyAPI-result-cos"
CLIPROXY_CONFIG="$CLIPROXY_INSTALL_DIR/config.yaml"
CLIPROXY_ENV_FILE="$CLIPROXY_INSTALL_DIR/cos.env"

if [ -z "$PACKAGE" ]; then
  echo "usage: sudo bash -s -- /tmp/$PKG.tar.gz < deploy/apply-$PKG-on-server.sh" >&2
  exit 1
fi
if [ ! -f "$PACKAGE" ]; then
  echo "package not found: $PACKAGE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d "/tmp/$PKG.XXXXXX")"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/canvas-deploy/$PKG-$STAMP}"
SRC="$TMP_DIR/$PKG"
DID_CANVAS=0
DID_CLIPROXY=0

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
  grep -Fq "case'img2imgAll'" "$file" || { echo "missing img2imgAll marker in $file" >&2; exit 1; }
  grep -Fq "const concurrent=nodeConcurrentMode(n);" "$file" || { echo "missing img2imgAll concurrent marker in $file" >&2; exit 1; }
}

install_file(){
  local src="$1" dest="$2" label="$3"
  if [ ! -f "$src" ]; then
    echo "missing package file for $label: $src" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$dest")" "$BACKUP_ROOT/$(dirname "${dest#/}")"
  local mode="0644"
  local owner_group=""
  if [ -f "$dest" ]; then
    cp -p "$dest" "$BACKUP_ROOT/${dest#/}"
    mode="$(stat -c '%a' "$dest" 2>/dev/null || echo 0644)"
    owner_group="$(stat -c '%u:%g' "$dest" 2>/dev/null || true)"
  fi

  install -m "$mode" "$src" "$dest"
  if [ -n "$owner_group" ]; then
    chown "$owner_group" "$dest" 2>/dev/null || true
  fi
  log "installed $label: $dest"
}

install_canvas(){
  local public_src="$SRC/workbench-web/image-studio-canvas-next.html"
  local mirror_src="$SRC/tools/workbench-web/image-studio-canvas-next.html"
  verify_canvas_markers "$public_src"
  verify_canvas_markers "$mirror_src"

  local canvas_dests=()
  if [ -d "$WORKBENCH_DIR" ]; then
    canvas_dests+=("$WORKBENCH_DIR/image-studio-canvas-next.html")
  fi
  if [ -d "$ALT_WORKBENCH_DIR" ] && [ "$ALT_WORKBENCH_DIR" != "$WORKBENCH_DIR" ]; then
    canvas_dests+=("$ALT_WORKBENCH_DIR/image-studio-canvas-next.html")
  fi

  if [ "${#canvas_dests[@]}" -eq 0 ]; then
    log "canvas public install skipped: no workbench directory found"
  else
    local dest
    for dest in "${canvas_dests[@]}"; do
      install_file "$public_src" "$dest" "canvas next"
      verify_canvas_markers "$dest"
      DID_CANVAS=1
    done
  fi

  if [ -d "$MIRROR_TARGET/tools/workbench-web" ]; then
    local mirror_dest="$MIRROR_TARGET/tools/workbench-web/image-studio-canvas-next.html"
    install_file "$mirror_src" "$mirror_dest" "mirror canvas next"
    verify_canvas_markers "$mirror_dest"
    DID_CANVAS=1
  else
    log "mirror install skipped: $MIRROR_TARGET/tools/workbench-web not found"
  fi
}

install_cliproxy(){
  local bin_src="$SRC/cliproxy/CLIProxyAPI-image-stream-fallback-amd64"
  if [ ! -f "$bin_src" ]; then
    echo "missing CLIProxy binary: $bin_src" >&2
    exit 1
  fi
  if ! command -v docker >/dev/null 2>&1; then
    log "CLIProxy skipped: docker not found"
    return 0
  fi
  if [ ! -d "$CLIPROXY_INSTALL_DIR" ]; then
    log "CLIProxy skipped: $CLIPROXY_INSTALL_DIR not found"
    return 0
  fi
  if [ -d "$CLIPROXY_CONFIG" ]; then
    log "CLIProxy skipped: $CLIPROXY_CONFIG is a directory, not a config file"
    return 0
  fi
  if [ ! -f "$CLIPROXY_CONFIG" ]; then
    log "CLIProxy skipped: $CLIPROXY_CONFIG not found"
    return 0
  fi

  mkdir -p "$CLIPROXY_INSTALL_DIR/backups" "$BACKUP_ROOT/opt/cliproxy"
  if [ -f "$CLIPROXY_BIN" ]; then
    cp -p "$CLIPROXY_BIN" "$CLIPROXY_INSTALL_DIR/backups/CLIProxyAPI-result-cos.bak-$STAMP"
    cp -p "$CLIPROXY_BIN" "$BACKUP_ROOT/opt/cliproxy/CLIProxyAPI-result-cos"
  fi
  install -m 0755 "$bin_src" "$CLIPROXY_BIN"
  log "installed CLIProxy patched binary: $CLIPROXY_BIN"

  local image
  image="$(docker inspect cli-proxy-api --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [ -z "$image" ]; then
    image="eceasy/cli-proxy-api:latest"
  fi

  local env_args=()
  if [ -f "$CLIPROXY_ENV_FILE" ]; then
    env_args=(--env-file "$CLIPROXY_ENV_FILE")
  else
    log "CLIProxy env file not found, continuing without $CLIPROXY_ENV_FILE"
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
    "${env_args[@]}" \
    -v "$CLIPROXY_CONFIG:/CLIProxyAPI/config.yaml" \
    -v "$CLIPROXY_INSTALL_DIR/auths:/root/.cli-proxy-api" \
    -v "$CLIPROXY_INSTALL_DIR/logs:/CLIProxyAPI/logs" \
    -v "$CLIPROXY_INSTALL_DIR/static/management.html:/CLIProxyAPI/static/management.html" \
    -v "$CLIPROXY_BIN:/CLIProxyAPI/CLIProxyAPI" \
    "$image" >/dev/null

  log "healthcheck cli-proxy-api"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
      DID_CLIPROXY=1
      break
    fi
    sleep 1
  done

  if [ "$DID_CLIPROXY" -ne 1 ]; then
    echo "cli-proxy-api healthcheck failed; recent logs:" >&2
    docker logs --tail 80 cli-proxy-api >&2 || true
    exit 1
  fi

  docker ps --filter name=cli-proxy-api --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
}

install_canvas
install_cliproxy

if [ "$DID_CANVAS" -ne 1 ] && [ "$DID_CLIPROXY" -ne 1 ]; then
  echo "nothing deployed: no canvas target and no usable CLIProxy config found" >&2
  exit 1
fi

log "backup root: $BACKUP_ROOT"
log "deploy complete: canvas=$DID_CANVAS cliproxy=$DID_CLIPROXY"
