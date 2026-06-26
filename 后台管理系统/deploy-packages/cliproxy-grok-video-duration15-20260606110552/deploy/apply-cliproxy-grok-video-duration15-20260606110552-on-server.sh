#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/cliproxy-grok-video-duration15-20260606110552.tar.gz}"
PKG_NAME="cliproxy-grok-video-duration15-20260606110552"
INSTALL_DIR="${INSTALL_DIR:-/opt/cliproxy}"
APP_BIN="${APP_BIN:-$INSTALL_DIR/CLIProxyAPI}"
ENV_FILE="${ENV_FILE:-$INSTALL_DIR/cos.env}"
CONFIG_FILE="${CONFIG_FILE:-$INSTALL_DIR/config.yaml}"
AUTH_DIR="${AUTH_DIR:-$INSTALL_DIR/auths}"
LOG_DIR="${LOG_DIR:-$INSTALL_DIR/logs}"
STATIC_HTML="${STATIC_HTML:-$INSTALL_DIR/static/management.html}"
SERVICE_NAME="${SERVICE_NAME:-cli-proxy-api}"
CALLBACK_PORT="${CALLBACK_PORT:-51121}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d "/tmp/$PKG_NAME-XXXXXX")"

log(){ printf '[deploy] %s\n' "$*"; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
docker_cmd(){ if docker info >/dev/null 2>&1; then docker "$@"; else run_sudo docker "$@"; fi; }
have_docker(){ command -v docker >/dev/null 2>&1 && (docker info >/dev/null 2>&1 || run_sudo docker info >/dev/null 2>&1); }

health_check(){
  log "health check"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

verify_not_404(){
  local method="$1" path="$2" status
  if [ "$method" = "POST" ]; then
    status="$(curl -sS -o /tmp/cliproxy-route-check.out -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "http://127.0.0.1:8317$path" || true)"
  else
    status="$(curl -sS -o /tmp/cliproxy-route-check.out -w '%{http_code}' "http://127.0.0.1:8317$path" || true)"
  fi
  case "$status" in
    404)
      echo "route still returns 404: $method $path" >&2
      cat /tmp/cliproxy-route-check.out >&2 || true
      exit 1
      ;;
    000)
      echo "route check could not connect: $method $path" >&2
      exit 1
      ;;
    *)
      log "route reachable: $method $path HTTP $status"
      ;;
  esac
}

verify_routes(){
  log "verify Grok video routes are registered"
  verify_not_404 POST /v1/videos
  verify_not_404 GET /v1/videos/cliproxy-route-check
  verify_not_404 POST /v1/videos/generations
}

open_callback_port_hint(){
  if command -v ufw >/dev/null 2>&1 && run_sudo ufw status 2>/dev/null | grep -qi '^Status: active'; then
    log "ufw is active; allowing callback port $CALLBACK_PORT/tcp"
    run_sudo ufw allow "$CALLBACK_PORT/tcp" >/dev/null || true
  fi
}

cleanup(){ rm -rf "$WORK"; }
trap cleanup EXIT

test -f "$PKG" || { echo "missing package: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/$PKG_NAME"
BIN="$SRC/bin/CLIProxyAPI-grok-video-duration15-amd64"
test -f "$BIN" || { echo "package missing binary: $BIN" >&2; exit 1; }
if command -v strings >/dev/null 2>&1; then
  strings "$BIN" | grep -Fq "grok-imagine-video-1.5-preview" || { echo "binary marker missing: grok-imagine-video-1.5-preview" >&2; exit 1; }
fi

log "prepare directories"
run_sudo mkdir -p "$INSTALL_DIR/backups" "$AUTH_DIR" "$LOG_DIR" "$(dirname "$STATIC_HTML")"

if [ -f "$APP_BIN" ]; then
  log "backup old binary"
  run_sudo cp "$APP_BIN" "$INSTALL_DIR/backups/$(basename "$APP_BIN").bak-$STAMP"
fi

log "install CLIProxyAPI binary with Grok video duration fix"
run_sudo install -m 0755 "$BIN" "$APP_BIN"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "config file not found: $CONFIG_FILE" >&2
  echo "Set CONFIG_FILE=/path/to/config.yaml if your server uses a custom location." >&2
  exit 1
fi

deploy_with_docker(){
  local image
  image="$(docker_cmd inspect "$SERVICE_NAME" --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [ -z "$image" ]; then
    image="eceasy/cli-proxy-api:latest"
  fi

  local env_args=()
  if [ -f "$ENV_FILE" ]; then
    env_args=(--env-file "$ENV_FILE")
  fi

  local static_args=()
  if [ -f "$STATIC_HTML" ]; then
    static_args=(-v "$STATIC_HTML:/CLIProxyAPI/static/management.html")
  else
    log "static management.html not found at $STATIC_HTML; using image-embedded/static defaults"
  fi

  open_callback_port_hint

  log "recreate $SERVICE_NAME container with patched binary"
  docker_cmd stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  docker_cmd rm "$SERVICE_NAME" >/dev/null 2>&1 || true

  docker_cmd run -d \
    --name "$SERVICE_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:1455:1455 \
    -p 127.0.0.1:8317:8317 \
    -p "$CALLBACK_PORT:$CALLBACK_PORT" \
    -e TZ=Asia/Shanghai \
    "${env_args[@]}" \
    -v "$CONFIG_FILE:/CLIProxyAPI/config.yaml" \
    -v "$AUTH_DIR:/root/.cli-proxy-api" \
    -v "$LOG_DIR:/CLIProxyAPI/logs" \
    "${static_args[@]}" \
    -v "$APP_BIN:/CLIProxyAPI/CLIProxyAPI" \
    "$image" >/dev/null

  if ! health_check; then
    echo "$SERVICE_NAME health check failed; recent docker logs:" >&2
    docker_cmd logs --tail 100 "$SERVICE_NAME" >&2 || true
    exit 1
  fi

  verify_routes
  docker_cmd ps --filter name="$SERVICE_NAME" --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
}

deploy_native_systemd(){
  command -v systemctl >/dev/null 2>&1 || {
    echo "Docker is missing and systemctl is unavailable; cannot install service automatically." >&2
    exit 1
  }

  local run_script="$INSTALL_DIR/run-cli-proxy-api.sh"
  local unit_file="/etc/systemd/system/$SERVICE_NAME.service"

  log "install native systemd runner"
  local tmp_run
  tmp_run="$(mktemp)"
  cat > "$tmp_run" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$INSTALL_DIR"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi
exec "$APP_BIN" --config "$CONFIG_FILE"
EOF
  run_sudo install -m 0755 "$tmp_run" "$run_script"
  rm -f "$tmp_run"

  if [ -f "$unit_file" ]; then
    log "backup old systemd unit"
    run_sudo cp "$unit_file" "$INSTALL_DIR/backups/$SERVICE_NAME.service.bak-$STAMP"
  fi

  local tmp_unit
  tmp_unit="$(mktemp)"
  cat > "$tmp_unit" <<EOF
[Unit]
Description=CLIProxyAPI service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$run_script
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
  run_sudo install -m 0644 "$tmp_unit" "$unit_file"
  rm -f "$tmp_unit"

  open_callback_port_hint
  log "restart native $SERVICE_NAME service"
  run_sudo systemctl daemon-reload
  run_sudo systemctl enable "$SERVICE_NAME" >/dev/null
  run_sudo systemctl restart "$SERVICE_NAME"

  if ! health_check; then
    echo "$SERVICE_NAME health check failed; recent journal:" >&2
    run_sudo journalctl -u "$SERVICE_NAME" -n 100 --no-pager >&2 || true
    exit 1
  fi

  verify_routes
  run_sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,18p'
}

if have_docker; then
  deploy_with_docker
else
  log "docker not found; falling back to native systemd deployment"
  deploy_native_systemd
fi

log "done"
