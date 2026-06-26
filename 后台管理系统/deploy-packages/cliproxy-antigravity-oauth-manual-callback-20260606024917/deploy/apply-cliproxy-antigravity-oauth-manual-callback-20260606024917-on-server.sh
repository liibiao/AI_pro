#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/cliproxy-antigravity-oauth-manual-callback-20260606024917.tar.gz}"
PKG_NAME="cliproxy-antigravity-oauth-manual-callback-20260606024917"
INSTALL_DIR="${INSTALL_DIR:-/opt/cliproxy}"
APP_BIN="${APP_BIN:-$INSTALL_DIR/CLIProxyAPI}"
ENV_FILE="${ENV_FILE:-$INSTALL_DIR/cos.env}"
CONFIG_FILE="${CONFIG_FILE:-$INSTALL_DIR/config.yaml}"
AUTH_DIR="${AUTH_DIR:-$INSTALL_DIR/auths}"
LOG_DIR="${LOG_DIR:-$INSTALL_DIR/logs}"
STATIC_HTML="${STATIC_HTML:-$INSTALL_DIR/static/management.html}"
SERVICE_NAME="${SERVICE_NAME:-cli-proxy-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK="$(mktemp -d "/tmp/$PKG_NAME-XXXXXX")"

log() { printf '[deploy] %s\n' "$*"; }

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    run_sudo docker "$@"
  fi
}

have_docker() {
  command -v docker >/dev/null 2>&1 && (docker info >/dev/null 2>&1 || run_sudo docker info >/dev/null 2>&1)
}

trap 'rm -rf "$WORK"' EXIT

test -f "$PKG" || { echo "missing package: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/$PKG_NAME"
BIN="$SRC/bin/CLIProxyAPI-antigravity-oauth-manual-callback-amd64"

test -f "$BIN" || { echo "package missing binary: $BIN" >&2; exit 1; }

log "prepare directories"
run_sudo mkdir -p "$INSTALL_DIR/backups" "$AUTH_DIR" "$LOG_DIR" "$(dirname "$STATIC_HTML")"

if [ -f "$APP_BIN" ]; then
  log "backup old binary"
  run_sudo cp "$APP_BIN" "$INSTALL_DIR/backups/$(basename "$APP_BIN").bak-$STAMP"
fi

log "install CLIProxyAPI binary with Antigravity OAuth manual callback fix"
run_sudo install -m 0755 "$BIN" "$APP_BIN"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "config file not found: $CONFIG_FILE" >&2
  echo "Set CONFIG_FILE=/path/to/config.yaml if your server uses a custom location." >&2
  exit 1
fi

health_check() {
  log "health check"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

verify_not_404() {
  local method="$1"
  local path="$2"
  local status
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

verify_routes() {
  log "verify Grok media routes are registered"
  verify_not_404 POST /v1/videos
  verify_not_404 POST /v1/videos/generations
  verify_not_404 POST /v1/videos/edits
  verify_not_404 POST /v1/videos/extensions
  verify_not_404 GET /v1/videos/cliproxy-route-check
  verify_not_404 GET /v0/management/xai-auth-url?is_webui=true
}

deploy_with_docker() {
  IMAGE="$(docker_cmd inspect "$SERVICE_NAME" --format '{{.Config.Image}}' 2>/dev/null || true)"
  if [ -z "$IMAGE" ]; then
    IMAGE="eceasy/cli-proxy-api:latest"
  fi

  ENV_ARGS=()
  if [ -f "$ENV_FILE" ]; then
    ENV_ARGS=(--env-file "$ENV_FILE")
  fi

  STATIC_ARGS=()
  if [ -f "$STATIC_HTML" ]; then
    STATIC_ARGS=(-v "$STATIC_HTML:/CLIProxyAPI/static/management.html")
  else
    log "static management.html not found at $STATIC_HTML; using image-embedded/static defaults"
  fi

  log "recreate $SERVICE_NAME container with patched binary"
  docker_cmd stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  docker_cmd rm "$SERVICE_NAME" >/dev/null 2>&1 || true

  docker_cmd run -d \
    --name "$SERVICE_NAME" \
    --restart unless-stopped \
    -p 127.0.0.1:1455:1455 \
    -p 127.0.0.1:8317:8317 \
    -e TZ=Asia/Shanghai \
    "${ENV_ARGS[@]}" \
    -v "$CONFIG_FILE:/CLIProxyAPI/config.yaml" \
    -v "$AUTH_DIR:/root/.cli-proxy-api" \
    -v "$LOG_DIR:/CLIProxyAPI/logs" \
    "${STATIC_ARGS[@]}" \
    -v "$APP_BIN:/CLIProxyAPI/CLIProxyAPI" \
    "$IMAGE" >/dev/null

  if ! health_check; then
    echo "$SERVICE_NAME health check failed; recent docker logs:" >&2
    docker_cmd logs --tail 100 "$SERVICE_NAME" >&2 || true
    exit 1
  fi

  verify_routes
  docker_cmd ps --filter name="$SERVICE_NAME" --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Ports}}'
}

deploy_native_systemd() {
  command -v systemctl >/dev/null 2>&1 || {
    echo "Docker is missing and systemctl is unavailable; cannot install service automatically." >&2
    exit 1
  }

  RUN_SCRIPT="$INSTALL_DIR/run-cli-proxy-api.sh"
  UNIT_FILE="/etc/systemd/system/$SERVICE_NAME.service"

  stop_existing_native_service() {
    log "stop existing native service/process on port 8317"

    for svc in "$SERVICE_NAME" "cliproxy" "cliproxyapi" "CLIProxyAPI" "cli-proxy"; do
      if run_sudo systemctl list-unit-files "$svc.service" >/dev/null 2>&1; then
        run_sudo systemctl stop "$svc.service" >/dev/null 2>&1 || true
      fi
    done

    PIDS=""
    if command -v ss >/dev/null 2>&1; then
      PIDS="$(run_sudo ss -ltnp 'sport = :8317' 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)"
    fi
    if [ -z "$PIDS" ] && command -v lsof >/dev/null 2>&1; then
      PIDS="$(run_sudo lsof -ti tcp:8317 -sTCP:LISTEN 2>/dev/null | sort -u || true)"
    fi
    if [ -z "$PIDS" ] && command -v fuser >/dev/null 2>&1; then
      PIDS="$(run_sudo fuser 8317/tcp 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u || true)"
    fi

    for pid in $PIDS; do
      case "$pid" in
        ''|*[!0-9]*)
          continue
          ;;
      esac
      if [ "$pid" = "$$" ]; then
        continue
      fi
      log "terminate old listener pid=$pid"
      run_sudo kill "$pid" >/dev/null 2>&1 || true
    done

    sleep 2
    for pid in $PIDS; do
      case "$pid" in
        ''|*[!0-9]*)
          continue
          ;;
      esac
      if run_sudo kill -0 "$pid" >/dev/null 2>&1; then
        log "force terminate old listener pid=$pid"
        run_sudo kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    done
  }

  log "install native systemd runner"
  TMP_RUN="$(mktemp)"
  cat > "$TMP_RUN" <<EOF
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
  run_sudo install -m 0755 "$TMP_RUN" "$RUN_SCRIPT"
  rm -f "$TMP_RUN"

  if [ -f "$UNIT_FILE" ]; then
    log "backup old systemd unit"
    run_sudo cp "$UNIT_FILE" "$INSTALL_DIR/backups/$SERVICE_NAME.service.bak-$STAMP"
  fi

  TMP_UNIT="$(mktemp)"
  cat > "$TMP_UNIT" <<EOF
[Unit]
Description=CLIProxyAPI service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$RUN_SCRIPT
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
  run_sudo install -m 0644 "$TMP_UNIT" "$UNIT_FILE"
  rm -f "$TMP_UNIT"

  log "restart native $SERVICE_NAME service"
  stop_existing_native_service
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
