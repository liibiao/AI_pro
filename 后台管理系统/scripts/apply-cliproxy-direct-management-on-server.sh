#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${CONFIG_FILE:-/opt/cliproxy/config.yaml}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/ai-admin}"
NGINX_LINK="${NGINX_LINK:-/etc/nginx/sites-enabled/ai-admin}"
SERVICE_NAME="${SERVICE_NAME:-cli-proxy-api}"
PUBLIC_HOST="${PUBLIC_HOST:-45.77.211.38}"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/opt/cliproxy/backups/direct-management-$STAMP}"

log() { printf '[direct-management] %s\n' "$*"; }

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

  log "no docker/systemd service named $SERVICE_NAME found; skip service restart"
}

wait_health() {
  log "wait for CLIProxyAPI health"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "CLIProxyAPI health check failed: http://127.0.0.1:8317/healthz" >&2
  return 1
}

test -f "$CONFIG_FILE" || { echo "config file not found: $CONFIG_FILE" >&2; exit 1; }

log "backup to $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
run_sudo cp -a "$CONFIG_FILE" "$BACKUP_DIR/config.yaml"
if [ -f "$NGINX_SITE" ]; then
  run_sudo cp -a "$NGINX_SITE" "$BACKUP_DIR/$(basename "$NGINX_SITE")"
fi

log "enable remote-management.allow-remote"
TMP_CONFIG="$(mktemp)"
run_sudo env CONFIG_FILE="$CONFIG_FILE" python3 - <<'PY' > "$TMP_CONFIG"
import os
from pathlib import Path

path = Path(os.environ["CONFIG_FILE"])
text = path.read_text()
lines = text.splitlines()

out = []
in_rm = False
rm_seen = False
allow_seen = False

for line in lines:
    stripped = line.strip()
    top_level = line and not line.startswith((" ", "\t")) and not stripped.startswith("#")

    if top_level and in_rm and not allow_seen:
        out.append("  allow-remote: true")
        allow_seen = True
        in_rm = False

    if stripped == "remote-management:":
        rm_seen = True
        in_rm = True
        allow_seen = False
        out.append(line)
        continue

    if in_rm and stripped.startswith("allow-remote:"):
        out.append("  allow-remote: true")
        allow_seen = True
        continue

    out.append(line)

if in_rm and not allow_seen:
    out.append("  allow-remote: true")

if not rm_seen:
    if out and out[-1].strip():
        out.append("")
    out.extend([
        "remote-management:",
        "  allow-remote: true",
        "  secret-key: \"\"",
        "  disable-control-panel: false",
    ])

print("\n".join(out) + "\n", end="")
PY
run_sudo install -m 0644 "$TMP_CONFIG" "$CONFIG_FILE"
rm -f "$TMP_CONFIG"

if [ -f "$NGINX_SITE" ] || [ -d /etc/nginx/sites-available ]; then
  log "install nginx reverse proxy for management.html, /v0 and /v1"
  TMP_NGINX="$(mktemp)"
  cat > "$TMP_NGINX" <<'NGINX'
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
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location /v0/ {
    proxy_pass http://127.0.0.1:8317/v0/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
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
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
NGINX
  run_sudo install -m 0644 "$TMP_NGINX" "$NGINX_SITE"
  rm -f "$TMP_NGINX"
  run_sudo ln -sf "$NGINX_SITE" "$NGINX_LINK"
  if [ -e /etc/nginx/sites-enabled/default ]; then
    run_sudo rm -f /etc/nginx/sites-enabled/default
  fi
  run_sudo nginx -t
  run_sudo systemctl reload nginx
fi

restart_cliproxy
wait_health

log "verify remote management gate locally"
STATUS="$(curl -sS -o /tmp/direct-management-quota.out -w '%{http_code}' http://127.0.0.1:8317/v0/management/quota || true)"
case "$STATUS" in
  200|401|403)
    if grep -q "remote management disabled" /tmp/direct-management-quota.out 2>/dev/null; then
      cat /tmp/direct-management-quota.out >&2
      echo "remote management is still disabled" >&2
      exit 1
    fi
    ;;
  *)
    log "quota check returned HTTP $STATUS; response follows"
    cat /tmp/direct-management-quota.out || true
    ;;
esac

echo "done"
echo "backup: $BACKUP_DIR"
echo "open: http://$PUBLIC_HOST/management.html#/quota"
echo "fallback: http://$PUBLIC_HOST:8317/management.html#/quota"
