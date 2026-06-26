#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt-image-result-poll-fix-20260604011246"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
CLIPROXY_INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
CLIPROXY_CONTAINER="${CLIPROXY_CONTAINER:-cli-proxy-api}"
CLIPROXY_SERVICE="${CLIPROXY_SERVICE:-cli-proxy-api}"
CLIPROXY_CONFIG="${CLIPROXY_CONFIG:-$CLIPROXY_INSTALL_DIR/config.yaml}"
CLIPROXY_ENV="${CLIPROXY_ENV:-$CLIPROXY_INSTALL_DIR/cos.env}"
CLIPROXY_AUTH_DIR="${CLIPROXY_AUTH_DIR:-$CLIPROXY_INSTALL_DIR/auths}"
CLIPROXY_LOG_DIR="${CLIPROXY_LOG_DIR:-$CLIPROXY_INSTALL_DIR/logs}"
CLIPROXY_STATIC_HTML="${CLIPROXY_STATIC_HTML:-$CLIPROXY_INSTALL_DIR/static/management.html}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$CLIPROXY_INSTALL_DIR/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
have_docker(){ command -v docker >/dev/null 2>&1 && (docker ps >/dev/null 2>&1 || run_sudo docker ps >/dev/null 2>&1); }
docker_cmd(){ if docker ps >/dev/null 2>&1; then docker "$@"; else run_sudo docker "$@"; fi; }
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

current_cliproxy_binary_path(){
  if [ -n "${CLIPROXY_BIN:-}" ]; then
    printf '%s\n' "$CLIPROXY_BIN"
    return
  fi
  if [ -n "${BINARY_PATH:-}" ]; then
    printf '%s\n' "$BINARY_PATH"
    return
  fi
  if have_docker && docker_cmd inspect "$CLIPROXY_CONTAINER" >/dev/null 2>&1; then
    local mounted
    mounted="$(docker_cmd inspect "$CLIPROXY_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/CLIProxyAPI/CLIProxyAPI"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
    if [ -n "$mounted" ]; then
      printf '%s\n' "$mounted"
      return
    fi
  fi
  for candidate in \
    "$CLIPROXY_INSTALL_DIR/CLIProxyAPI-grok-auth-fix" \
    "$CLIPROXY_INSTALL_DIR/CLIProxyAPI-result-cos" \
    "$CLIPROXY_INSTALL_DIR/CLIProxyAPI"; do
    if run_sudo test -f "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' "$CLIPROXY_INSTALL_DIR/CLIProxyAPI-result-cos"
}

healthcheck_cliproxy(){
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8317/healthz >/dev/null 2>&1 || curl -fsS http://127.0.0.1:8317/ >/dev/null 2>&1; then
      log "cliproxy health ok"
      return 0
    fi
    sleep 1
  done
  return 1
}

restart_cliproxy(){
  local binary_path="$1"
  log "restart cliproxy"
  if have_docker && docker_cmd inspect "$CLIPROXY_CONTAINER" >/dev/null 2>&1; then
    local mounted
    mounted="$(docker_cmd inspect "$CLIPROXY_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/CLIProxyAPI/CLIProxyAPI"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
    if [ -n "$mounted" ]; then
      docker_cmd restart "$CLIPROXY_CONTAINER" >/dev/null
    else
      [ -f "$CLIPROXY_CONFIG" ] || fail "cliproxy config not found: $CLIPROXY_CONFIG"
      local image
      image="$(docker_cmd inspect "$CLIPROXY_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"
      [ -n "$image" ] || image="eceasy/cli-proxy-api:latest"
      local env_args=()
      local static_args=()
      [ -f "$CLIPROXY_ENV" ] && env_args=(--env-file "$CLIPROXY_ENV")
      [ -f "$CLIPROXY_STATIC_HTML" ] && static_args=(-v "$CLIPROXY_STATIC_HTML:/CLIProxyAPI/static/management.html")
      run_sudo mkdir -p "$CLIPROXY_AUTH_DIR" "$CLIPROXY_LOG_DIR"
      docker_cmd stop "$CLIPROXY_CONTAINER" >/dev/null 2>&1 || true
      docker_cmd rm "$CLIPROXY_CONTAINER" >/dev/null 2>&1 || true
      docker_cmd run -d \
        --name "$CLIPROXY_CONTAINER" \
        --restart unless-stopped \
        -p 127.0.0.1:1455:1455 \
        -p 127.0.0.1:8317:8317 \
        -e TZ=Asia/Shanghai \
        "${env_args[@]}" \
        -v "$CLIPROXY_CONFIG:/CLIProxyAPI/config.yaml" \
        -v "$CLIPROXY_AUTH_DIR:/root/.cli-proxy-api" \
        -v "$CLIPROXY_LOG_DIR:/CLIProxyAPI/logs" \
        "${static_args[@]}" \
        -v "$binary_path:/CLIProxyAPI/CLIProxyAPI" \
        "$image" >/dev/null
    fi
    if ! healthcheck_cliproxy; then
      docker_cmd logs --tail 120 "$CLIPROXY_CONTAINER" >&2 || true
      fail "cliproxy health check failed"
    fi
    docker_cmd ps --filter name="$CLIPROXY_CONTAINER" --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}'
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1 && run_sudo systemctl list-unit-files "$CLIPROXY_SERVICE.service" >/dev/null 2>&1; then
    run_sudo systemctl restart "$CLIPROXY_SERVICE"
    if ! healthcheck_cliproxy; then
      run_sudo journalctl -u "$CLIPROXY_SERVICE" -n 120 --no-pager >&2 || true
      fail "cliproxy health check failed"
    fi
    return 0
  fi

  fail "docker container/systemd service not found; set CLIPROXY_BIN and restart manually"
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
test -x "$SRC/bin/CLIProxyAPI-gpt-image-result-poll-fix-amd64"
grep -Fq "codexImageGenerationOutputPending" "$SRC/cliproxy/src/internal/runtime/executor/codex_executor.go"
grep -Fq "polling image_generation_call without result" "$SRC/cliproxy/src/internal/runtime/executor/codex_executor.go"
grep -Fq 'defaultImagesMainModel = "gpt-5.4-mini"' "$SRC/cliproxy/src/sdk/api/handlers/openai/openai_images_handlers.go"
grep -Fq "response output summary" "$SRC/cliproxy/src/sdk/api/handlers/openai/openai_images_handlers.go"
strings "$SRC/bin/CLIProxyAPI-gpt-image-result-poll-fix-amd64" | grep -Fq "polling image_generation_call without result"
strings "$SRC/bin/CLIProxyAPI-gpt-image-result-poll-fix-amd64" | grep -Fq "response output summary"

CLIPROXY_BINARY_PATH="$(current_cliproxy_binary_path)"
log "cliproxy binary path: $CLIPROXY_BINARY_PATH"
run_sudo mkdir -p "$(dirname "$CLIPROXY_BINARY_PATH")" "$BACKUP_DIR" "$CLIPROXY_INSTALL_DIR/source-overrides/internal/runtime/executor" "$CLIPROXY_INSTALL_DIR/source-overrides/sdk/api/handlers/openai"
if run_sudo test -f "$CLIPROXY_BINARY_PATH"; then
  run_sudo cp -a "$CLIPROXY_BINARY_PATH" "$BACKUP_DIR/$(basename "$CLIPROXY_BINARY_PATH").bak"
fi

log "install patched CLIProxyAPI binary"
run_sudo install -m 0755 "$SRC/bin/CLIProxyAPI-gpt-image-result-poll-fix-amd64" "$CLIPROXY_BINARY_PATH"
run_sudo install -m 0644 "$SRC/cliproxy/src/internal/runtime/executor/codex_executor.go" "$CLIPROXY_INSTALL_DIR/source-overrides/internal/runtime/executor/codex_executor.go"
run_sudo install -m 0644 "$SRC/cliproxy/src/sdk/api/handlers/openai/openai_images_handlers.go" "$CLIPROXY_INSTALL_DIR/source-overrides/sdk/api/handlers/openai/openai_images_handlers.go"

log "verify installed binary markers"
strings "$CLIPROXY_BINARY_PATH" | grep -Fq "polling image_generation_call without result"
strings "$CLIPROXY_BINARY_PATH" | grep -Fq "response output summary"

restart_cliproxy "$CLIPROXY_BINARY_PATH"

log "done"
echo "backup: $BACKUP_DIR"
echo "cliproxy binary: $CLIPROXY_BINARY_PATH"
echo "This package does not modify model configuration, database rows, admin web, or workbench model JSON."
