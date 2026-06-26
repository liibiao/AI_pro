#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:-}"
PKG="cliproxy-empty-edit-generate-stream-fallback-baremetal-20260605154914"
INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
CONFIG_FILE="${CLIPROXY_CONFIG:-$INSTALL_DIR/config.yaml}"
ENV_FILE="${CLIPROXY_ENV_FILE:-$INSTALL_DIR/cos.env}"
AUTH_DIR="${CLIPROXY_AUTH_DIR:-$INSTALL_DIR/auths}"
LOG_DIR="${CLIPROXY_LOG_DIR:-$INSTALL_DIR/logs}"
STATIC_HTML="${CLIPROXY_STATIC_HTML:-$INSTALL_DIR/static/management.html}"
DEFAULT_DOCKER_BIN="${CLIPROXY_DOCKER_BIN:-$INSTALL_DIR/CLIProxyAPI-result-cos}"
HEALTH_URL="${CLIPROXY_HEALTH_URL:-http://127.0.0.1:8317/healthz}"

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
BACKUP_DIR="$INSTALL_DIR/backups/$PKG-$STAMP"
SRC="$TMP_DIR/$PKG"

log(){ printf '[%s] %s\n' "$PKG" "$*"; }
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -xzf "$PACKAGE" -C "$TMP_DIR"
BIN_SRC="$SRC/cliproxy/CLIProxyAPI-image-stream-fallback-amd64"
if [ ! -f "$BIN_SRC" ]; then
  echo "package missing binary: $BIN_SRC" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$BACKUP_DIR"

healthcheck(){
  local ok=0
  for _ in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 1
  done
  if [ "$ok" -ne 1 ]; then
    echo "CLIProxy healthcheck failed: $HEALTH_URL" >&2
    return 1
  fi
}

deploy_docker(){
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  if [ -d "$CONFIG_FILE" ]; then
    log "docker mode skipped: $CONFIG_FILE is a directory"
    return 1
  fi
  if [ ! -f "$CONFIG_FILE" ]; then
    log "docker mode skipped: config not found at $CONFIG_FILE"
    return 1
  fi

  local image
  image="$(docker inspect cli-proxy-api --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [ -z "$image" ]; then
    image="eceasy/cli-proxy-api:latest"
  fi

  if [ -f "$DEFAULT_DOCKER_BIN" ]; then
    cp -p "$DEFAULT_DOCKER_BIN" "$BACKUP_DIR/$(basename "$DEFAULT_DOCKER_BIN").bak"
  fi
  install -m 0755 "$BIN_SRC" "$DEFAULT_DOCKER_BIN"

  local env_args=()
  if [ -f "$ENV_FILE" ]; then
    env_args=(--env-file "$ENV_FILE")
  fi
  local static_args=()
  if [ -f "$STATIC_HTML" ]; then
    static_args=(-v "$STATIC_HTML:/CLIProxyAPI/static/management.html")
  fi

  log "restart cli-proxy-api via docker"
  docker stop cli-proxy-api >/dev/null 2>&1 || true
  docker rm cli-proxy-api >/dev/null 2>&1 || true
  docker run -d \
    --name cli-proxy-api \
    --restart unless-stopped \
    -p 127.0.0.1:1455:1455 \
    -p 127.0.0.1:8317:8317 \
    -e TZ=Asia/Shanghai \
    "${env_args[@]}" \
    -v "$CONFIG_FILE:/CLIProxyAPI/config.yaml" \
    -v "$AUTH_DIR:/root/.cli-proxy-api" \
    -v "$LOG_DIR:/CLIProxyAPI/logs" \
    "${static_args[@]}" \
    -v "$DEFAULT_DOCKER_BIN:/CLIProxyAPI/CLIProxyAPI" \
    "$image" >/dev/null

  healthcheck || {
    docker logs --tail 100 cli-proxy-api >&2 || true
    exit 1
  }
  docker ps --filter name=cli-proxy-api --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
  log "deploy complete via docker"
  return 0
}

find_port_pid(){
  local port="$1"
  ss -ltnp 2>/dev/null \
    | awk -v p=":$port" '$4 ~ p {print}' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | head -1
}

find_systemd_unit_for_pid(){
  local pid="$1"
  local unit=""
  unit="$(sed -n 's#.*system.slice/\([^/]*\.service\).*#\1#p' "/proc/$pid/cgroup" 2>/dev/null | head -1 || true)"
  if [ -n "$unit" ]; then
    printf '%s\n' "$unit"
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1; then
    while read -r candidate _; do
      [ -n "$candidate" ] || continue
      if [ "$(systemctl show -p MainPID --value "$candidate" 2>/dev/null || true)" = "$pid" ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done < <(systemctl list-units --type=service --all --no-legend 2>/dev/null || true)
  fi
}

deploy_baremetal(){
  local pid="${CLIPROXY_PID:-}"
  if [ -z "$pid" ]; then
    pid="$(find_port_pid 8317 || true)"
  fi
  if [ -z "$pid" ]; then
    pid="$(find_port_pid 1455 || true)"
  fi
  if [ -z "$pid" ]; then
    echo "cannot locate CLIProxy listening process on 8317 or 1455" >&2
    ss -ltnp | grep -E ':8317|:1455' >&2 || true
    exit 1
  fi

  local exe="${CLIPROXY_BIN_PATH:-}"
  if [ -z "$exe" ]; then
    exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
  fi
  if [ -z "$exe" ] || [ ! -f "$exe" ]; then
    echo "cannot resolve executable for pid $pid" >&2
    exit 1
  fi
  case "$exe" in
    *CLIProxyAPI*|*cliproxy*|*cli-proxy*) ;;
    *)
      echo "refusing to replace suspicious executable for pid $pid: $exe" >&2
      echo "set CLIPROXY_BIN_PATH=/path/to/CLIProxyAPI to override" >&2
      exit 1
      ;;
  esac

  local unit="${CLIPROXY_SERVICE:-}"
  if [ -z "$unit" ]; then
    unit="$(find_systemd_unit_for_pid "$pid" || true)"
  fi

  local cmd_file="$TMP_DIR/cmdline"
  local cwd_file="$TMP_DIR/cwd"
  cp "/proc/$pid/cmdline" "$cmd_file" 2>/dev/null || true
  readlink -f "/proc/$pid/cwd" > "$cwd_file" 2>/dev/null || printf '%s\n' "$(dirname "$exe")" > "$cwd_file"

  log "baremetal target pid=$pid exe=$exe unit=${unit:-none}"
  cp -p "$exe" "$BACKUP_DIR/$(basename "$exe").bak"

  if [ -n "$unit" ] && command -v systemctl >/dev/null 2>&1; then
    log "stop systemd service: $unit"
    systemctl stop "$unit"
    install -m 0755 "$BIN_SRC" "$exe"
    log "start systemd service: $unit"
    systemctl start "$unit"
    healthcheck || {
      systemctl status "$unit" --no-pager >&2 || true
      journalctl -u "$unit" -n 120 --no-pager >&2 || true
      exit 1
    }
    systemctl status "$unit" --no-pager | sed -n '1,12p' || true
    log "deploy complete via systemd: $unit"
    return 0
  fi

  log "stop process: $pid"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi

  install -m 0755 "$BIN_SRC" "$exe"

  local -a cmd=()
  if [ -s "$cmd_file" ]; then
    while IFS= read -r -d '' arg; do
      cmd+=("$arg")
    done < "$cmd_file" || true
  fi
  if [ "${#cmd[@]}" -eq 0 ]; then
    cmd=("$exe")
  else
    cmd[0]="$exe"
  fi
  local cwd
  cwd="$(cat "$cwd_file")"
  log "start bare process: ${cmd[*]}"
  (
    cd "$cwd" 2>/dev/null || cd "$(dirname "$exe")"
    nohup "${cmd[@]}" >> "$LOG_DIR/cli-proxy-api.out" 2>&1 &
  )
  healthcheck || {
    tail -120 "$LOG_DIR/cli-proxy-api.out" >&2 || true
    exit 1
  }
  log "deploy complete via bare process"
}

if deploy_docker; then
  log "backup: $BACKUP_DIR"
  exit 0
fi

deploy_baremetal
log "backup: $BACKUP_DIR"
