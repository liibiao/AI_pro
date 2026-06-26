#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt2-lowcost-async-url-preview-20260624103403"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return "$status"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

verify_registry(){
  local file="$1"
  grep -Fq "server_async_object_storage" "$file"
  grep -Fq "124异步转存cos" "$file"
  grep -Fq "responseType === 'server_async_object_storage'" "$file"
  grep -Fq "persistInlineImageLocalPreview" "$file"
}

verify_routes(){
  local file="$1"
  grep -Fq "server_async_object_storage" "$file"
  grep -Fq "124异步转存cos" "$file"
  grep -Fq "canvas-aiyunzhi-gpt-image-2-api" "$file"
  if grep -Fq "hint.includes('aiyunzhi.top') && /gpt[-_ ]?image[-_ ]?2/.test(hint)" "$file"; then
    fail "broad aiyunzhi.top gpt-image-2 adapter matcher still present in $file"
  fi
}

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

REGISTRY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
ROUTES_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
REGISTRY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
ROUTES_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"

[ -f "$REGISTRY_SRC" ] || fail "package missing registry.ts"
[ -f "$ROUTES_SRC" ] || fail "package missing routes.ts"
[ -f "$REGISTRY_DIST" ] || fail "package missing registry.js"
[ -f "$ROUTES_DIST" ] || fail "package missing routes.js"

log "verify package markers"
verify_registry "$REGISTRY_SRC"
verify_registry "$REGISTRY_DIST"
verify_routes "$ROUTES_SRC"
verify_routes "$ROUTES_DIST"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation"
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true

log "install api generation files"
run_sudo install -m 0644 "$REGISTRY_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$ROUTES_SRC" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$ROUTES_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
verify_registry "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
verify_routes "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "responseType === 'server_async_object_storage'" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "return responseType === 'server_object_storage' || responseType === 'server_async_object_storage' || responseType === 'server_base64_async_object_storage'" "$APP_DIR/api-server/dist/modules/generation/routes.js"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
