#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt-image-output-diagnostics-fix-20260604163012"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
CLIPROXY_INSTALL_DIR="${CLIPROXY_INSTALL_DIR:-/opt/cliproxy}"
CLIPROXY_CONTAINER="${CLIPROXY_CONTAINER:-cli-proxy-api}"
CLIPROXY_SERVICE="${CLIPROXY_SERVICE:-cli-proxy-api}"
CLIPROXY_CONFIG="${CLIPROXY_CONFIG:-$CLIPROXY_INSTALL_DIR/config.yaml}"
CLIPROXY_ENV="${CLIPROXY_ENV:-$CLIPROXY_INSTALL_DIR/cos.env}"
CLIPROXY_AUTH_DIR="${CLIPROXY_AUTH_DIR:-$CLIPROXY_INSTALL_DIR/auths}"
CLIPROXY_LOG_DIR="${CLIPROXY_LOG_DIR:-$CLIPROXY_INSTALL_DIR/logs}"
CLIPROXY_STATIC_HTML="${CLIPROXY_STATIC_HTML:-$CLIPROXY_INSTALL_DIR/static/management.html}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
API_BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"
CLIPROXY_BACKUP_DIR="$CLIPROXY_INSTALL_DIR/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
have_docker(){ command -v docker >/dev/null 2>&1 && (docker ps >/dev/null 2>&1 || run_sudo docker ps >/dev/null 2>&1); }
docker_cmd(){ if docker ps >/dev/null 2>&1; then docker "$@"; else run_sudo docker "$@"; fi; }
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

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
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

GEN_ROUTES_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
GEN_ROUTES_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"
REGISTRY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
CLIPROXY_IMAGE_SRC="$SRC_ROOT/cliproxy/src/sdk/api/handlers/openai/openai_images_handlers.go"
CLIPROXY_EXECUTOR_SRC="$SRC_ROOT/cliproxy/src/internal/runtime/executor/codex_executor.go"
CLIPROXY_BINARY="$SRC_ROOT/bin/CLIProxyAPI-gpt-image-output-diagnostics-fix-amd64"

[ -f "$GEN_ROUTES_SRC" ] || fail "package missing api generation routes source"
[ -f "$GEN_ROUTES_DIST" ] || fail "package missing api generation routes dist"
[ -f "$REGISTRY_SRC" ] || fail "package missing adapter registry source"
[ -f "$REGISTRY_DIST" ] || fail "package missing adapter registry dist"
[ -f "$CLIPROXY_IMAGE_SRC" ] || fail "package missing cliproxy image handler"
[ -f "$CLIPROXY_EXECUTOR_SRC" ] || fail "package missing cliproxy executor"
[ -x "$CLIPROXY_BINARY" ] || fail "package missing cliproxy binary"

log "verify package markers"
grep -Fq "isGptImage2GenerationHint" "$GEN_ROUTES_SRC"
grep -Fq "extractImageOutputUrls" "$REGISTRY_SRC"
grep -Fq "IMAGE_RESULT_MISSING" "$REGISTRY_DIST"
grep -Fq "response_id=" "$CLIPROXY_IMAGE_SRC"
grep -Fq "polling image_generation_call without result" "$CLIPROXY_EXECUTOR_SRC"
strings "$CLIPROXY_BINARY" | grep -Fq "response_id="
strings "$CLIPROXY_BINARY" | grep -Fq "response output summary"

log "backup api files: $API_BACKUP_DIR"
run_sudo mkdir -p \
  "$API_BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$API_BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters"
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$API_BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$API_BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$API_BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$API_BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true

log "install api files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/generation/adapters"
run_sudo install -m 0644 "$GEN_ROUTES_SRC" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$GEN_ROUTES_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$REGISTRY_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "backup cliproxy binary: $CLIPROXY_BACKUP_DIR"
CLIPROXY_BINARY_PATH="$(current_cliproxy_binary_path)"
run_sudo mkdir -p \
  "$(dirname "$CLIPROXY_BINARY_PATH")" \
  "$CLIPROXY_BACKUP_DIR" \
  "$CLIPROXY_INSTALL_DIR/source-overrides/internal/runtime/executor" \
  "$CLIPROXY_INSTALL_DIR/source-overrides/sdk/api/handlers/openai"
if run_sudo test -f "$CLIPROXY_BINARY_PATH"; then
  run_sudo cp -a "$CLIPROXY_BINARY_PATH" "$CLIPROXY_BACKUP_DIR/$(basename "$CLIPROXY_BINARY_PATH").bak"
fi

log "install patched cliproxy binary"
run_sudo install -m 0755 "$CLIPROXY_BINARY" "$CLIPROXY_BINARY_PATH"
run_sudo install -m 0644 "$CLIPROXY_IMAGE_SRC" "$CLIPROXY_INSTALL_DIR/source-overrides/sdk/api/handlers/openai/openai_images_handlers.go"
run_sudo install -m 0644 "$CLIPROXY_EXECUTOR_SRC" "$CLIPROXY_INSTALL_DIR/source-overrides/internal/runtime/executor/codex_executor.go"

log "verify installed markers"
run_sudo grep -Fq "isGptImage2GenerationHint" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "extractImageOutputUrls" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "IMAGE_RESULT_MISSING" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
strings "$CLIPROXY_BINARY_PATH" | grep -Fq "response_id="
strings "$CLIPROXY_BINARY_PATH" | grep -Fq "response output summary"

restart_cliproxy "$CLIPROXY_BINARY_PATH"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "api backup: $API_BACKUP_DIR"
echo "cliproxy backup: $CLIPROXY_BACKUP_DIR"
echo "cliproxy binary: $CLIPROXY_BINARY_PATH"
