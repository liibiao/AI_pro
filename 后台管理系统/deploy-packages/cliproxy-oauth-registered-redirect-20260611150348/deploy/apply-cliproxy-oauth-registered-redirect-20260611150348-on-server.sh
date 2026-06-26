#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-/tmp/cliproxy-oauth-registered-redirect-20260611150348.tar.gz}"
PKG_NAME="cliproxy-oauth-registered-redirect-20260611150348"
INSTALL_DIR="${INSTALL_DIR:-/opt/cliproxy}"
APP_BIN="${APP_BIN:-$INSTALL_DIR/CLIProxyAPI}"
CONFIG_FILE="${CONFIG_FILE:-$INSTALL_DIR/config.yaml}"
SERVICE_NAME="${SERVICE_NAME:-cli-proxy-api}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/ai-admin}"
NGINX_LINK="${NGINX_LINK:-/etc/nginx/sites-enabled/ai-admin}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$INSTALL_DIR/backups/oauth-registered-redirect-$STAMP}"
WORK="$(mktemp -d "/tmp/$PKG_NAME-XXXXXX")"

log() { printf '[oauth-registered-redirect] %s\n' "$*"; }

run_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

docker_cmd() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker "$@"
  else
    run_sudo docker "$@"
  fi
}

cleanup() {
  rm -rf "$WORK"
}
trap cleanup EXIT

health_check() {
  log "wait for CLIProxyAPI health"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "CLIProxyAPI health check failed" >&2
  return 1
}

restart_cliproxy() {
  if command -v docker >/dev/null 2>&1 && docker_cmd inspect "$SERVICE_NAME" >/dev/null 2>&1; then
    log "restart docker container: $SERVICE_NAME"
    docker_cmd restart "$SERVICE_NAME" >/dev/null
    return
  fi

  if command -v systemctl >/dev/null 2>&1 && run_sudo systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    log "restart systemd service: $SERVICE_NAME"
    run_sudo systemctl restart "$SERVICE_NAME"
    return
  fi

  echo "no docker container or systemd service named $SERVICE_NAME found" >&2
  exit 1
}

verify_backend_callback() {
  local path="$1"
  local status
  status="$(curl -sS -o /tmp/cliproxy-callback-check.out -w '%{http_code}' "http://127.0.0.1:8317$path?state=route-check&code=route-check" || true)"
  case "$status" in
    200|400|404)
      if [ "$status" = "404" ]; then
        echo "backend callback route missing: $path" >&2
        cat /tmp/cliproxy-callback-check.out >&2 || true
        exit 1
      fi
      log "backend callback route reachable: $path HTTP $status"
      ;;
    000)
      echo "backend callback route could not connect: $path" >&2
      exit 1
      ;;
    *)
      log "backend callback route returned HTTP $status: $path"
      ;;
  esac
}

verify_public_callback() {
  local path="$1"
  local status
  status="$(curl -sS -o /tmp/cliproxy-public-callback-check.out -w '%{http_code}' "http://127.0.0.1$path?state=route-check&code=route-check" || true)"
  case "$status" in
    200|400)
      log "public callback route reachable: $path HTTP $status"
      ;;
    404|000)
      echo "public callback route check failed: $path HTTP $status" >&2
      cat /tmp/cliproxy-public-callback-check.out >&2 || true
      exit 1
      ;;
    *)
      log "public callback route returned HTTP $status: $path"
      ;;
  esac
}

install_nginx_routes() {
  if ! command -v nginx >/dev/null 2>&1 && [ ! -d /etc/nginx/sites-available ]; then
    log "nginx not found; skip public callback reverse proxy"
    return
  fi

  log "install nginx reverse proxy for management and OAuth callbacks"
  local tmp_nginx
  tmp_nginx="$(mktemp)"
  cat > "$tmp_nginx" <<'NGINX'
server {
  listen 80 default_server;
  server_name _;

  client_max_body_size 50m;

  location = / {
    return 302 /management.html#/quota;
  }

  location = /management.html {
    proxy_pass http://127.0.0.1:8317/management.html;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location = /anthropic/callback {
    proxy_pass http://127.0.0.1:8317/anthropic/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /codex/callback {
    proxy_pass http://127.0.0.1:8317/codex/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /auth/callback {
    proxy_pass http://127.0.0.1:8317/codex/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /google/callback {
    proxy_pass http://127.0.0.1:8317/google/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /oauth2callback {
    proxy_pass http://127.0.0.1:8317/oauth2callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /antigravity/callback {
    proxy_pass http://127.0.0.1:8317/antigravity/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /oauth-callback {
    proxy_pass http://127.0.0.1:8317/oauth-callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /xai/callback {
    proxy_pass http://127.0.0.1:8317/xai/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location = /callback {
    proxy_pass http://127.0.0.1:8317/callback;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location /v0/ {
    proxy_pass http://127.0.0.1:8317/v0/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location /v1/ {
    proxy_pass http://127.0.0.1:8317/v1/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
NGINX
  run_sudo install -m 0644 "$tmp_nginx" "$NGINX_SITE"
  rm -f "$tmp_nginx"
  run_sudo ln -sf "$NGINX_SITE" "$NGINX_LINK"
  if [ -e /etc/nginx/sites-enabled/default ]; then
    run_sudo rm -f /etc/nginx/sites-enabled/default
  fi
  run_sudo nginx -t
  if command -v systemctl >/dev/null 2>&1 && run_sudo systemctl list-unit-files nginx.service >/dev/null 2>&1; then
    run_sudo systemctl reload nginx
  else
    run_sudo nginx -s reload
  fi
}

test -f "$PKG" || { echo "missing package: $PKG" >&2; exit 1; }

log "extract package: $PKG"
tar -xzf "$PKG" -C "$WORK"
SRC="$WORK/$PKG_NAME"
BIN="$SRC/bin/CLIProxyAPI-oauth-registered-redirect-amd64"

test -f "$BIN" || { echo "package missing binary: $BIN" >&2; exit 1; }
grep -Fq "startCallbackForwarder(xaiauth.CallbackPort" "$SRC/src/internal/api/handlers/management/auth_files.go"
grep -Fq 's.engine.GET("/callback"' "$SRC/src/internal/api/server.go"
grep -Fq "GenerateAuthURLWithRedirect" "$SRC/src/internal/auth/codex/openai_auth.go"
grep -Fq "ExchangeCodeForTokensWithRedirect" "$SRC/src/internal/auth/claude/anthropic_auth.go"
test -f "$CONFIG_FILE" || { echo "config file not found: $CONFIG_FILE" >&2; exit 1; }

log "backup to $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
if [ -f "$APP_BIN" ]; then
  run_sudo cp -a "$APP_BIN" "$BACKUP_DIR/$(basename "$APP_BIN").bak"
fi
if [ -f "$NGINX_SITE" ]; then
  run_sudo cp -a "$NGINX_SITE" "$BACKUP_DIR/$(basename "$NGINX_SITE").bak"
fi

log "install patched CLIProxyAPI binary"
run_sudo install -m 0755 "$BIN" "$APP_BIN"

install_nginx_routes
restart_cliproxy
health_check

verify_backend_callback /anthropic/callback
verify_backend_callback /codex/callback
verify_backend_callback /google/callback
verify_backend_callback /antigravity/callback
verify_backend_callback /xai/callback
verify_backend_callback /oauth2callback
verify_backend_callback /oauth-callback
verify_backend_callback /callback

if command -v nginx >/dev/null 2>&1; then
  verify_public_callback /anthropic/callback
  verify_public_callback /codex/callback
  verify_public_callback /auth/callback
  verify_public_callback /google/callback
  verify_public_callback /oauth2callback
  verify_public_callback /antigravity/callback
  verify_public_callback /oauth-callback
  verify_public_callback /xai/callback
  verify_public_callback /callback
fi

if command -v systemctl >/dev/null 2>&1; then
  run_sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,16p' || true
fi

echo "done"
echo "backup: $BACKUP_DIR"
