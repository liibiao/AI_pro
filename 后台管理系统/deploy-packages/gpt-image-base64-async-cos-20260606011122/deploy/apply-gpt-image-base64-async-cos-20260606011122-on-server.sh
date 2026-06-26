#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt-image-base64-async-cos-20260606011122"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_DIR="${MIRROR_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
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
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_NAME" >/dev/null 2>&1; then
    pm2 "$@"
  elif [ "${DEPLOY_USE_SUDO:-auto}" != "never" ] && command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

API_REGISTRY_SRC="$SRC/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
API_REGISTRY_DIST="$SRC/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
GEN_ROUTES_SRC="$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts"
GEN_ROUTES_DIST="$SRC/ai-admin-platform/api-server/dist/modules/generation/routes.js"
MODEL_ROUTES_SRC="$SRC/ai-admin-platform/api-server/src/modules/models/routes.ts"
MODEL_ROUTES_DIST="$SRC/ai-admin-platform/api-server/dist/modules/models/routes.js"
ADMIN_MAIN_SRC="$SRC/ai-admin-platform/admin-web/src/main.tsx"
ADMIN_DIST="$SRC/ai-admin-platform/admin-web/dist"
HTML_SRC="$SRC/workbench-web/image-studio-canvas-next.html"

[ -f "$API_REGISTRY_SRC" ] || fail "missing $API_REGISTRY_SRC"
[ -f "$API_REGISTRY_DIST" ] || fail "missing $API_REGISTRY_DIST"
[ -f "$GEN_ROUTES_SRC" ] || fail "missing $GEN_ROUTES_SRC"
[ -f "$GEN_ROUTES_DIST" ] || fail "missing $GEN_ROUTES_DIST"
[ -f "$MODEL_ROUTES_SRC" ] || fail "missing $MODEL_ROUTES_SRC"
[ -f "$MODEL_ROUTES_DIST" ] || fail "missing $MODEL_ROUTES_DIST"
[ -f "$ADMIN_MAIN_SRC" ] || fail "missing $ADMIN_MAIN_SRC"
[ -d "$ADMIN_DIST" ] || fail "missing $ADMIN_DIST"
[ -f "$HTML_SRC" ] || fail "missing $HTML_SRC"

log "verify package markers"
grep -Fq "server_base64_object_storage" "$API_REGISTRY_SRC"
grep -Fq "server_base64_object_storage" "$API_REGISTRY_DIST"
grep -Fq "server_base64_async_object_storage" "$API_REGISTRY_SRC"
grep -Fq "server_base64_async_object_storage" "$API_REGISTRY_DIST"
grep -Fq "persistInlineImageLocalPreview" "$API_REGISTRY_DIST"
grep -Fq "server_base64_object_storage" "$GEN_ROUTES_SRC"
grep -Fq "server_base64_object_storage" "$GEN_ROUTES_DIST"
grep -Fq "server_base64_async_object_storage" "$GEN_ROUTES_SRC"
grep -Fq "server_base64_async_object_storage" "$GEN_ROUTES_DIST"
grep -Fq "isGenerationResultPreviewUrl" "$GEN_ROUTES_DIST"
grep -Fq "server_base64_object_storage" "$MODEL_ROUTES_SRC"
grep -Fq "server_base64_object_storage" "$MODEL_ROUTES_DIST"
grep -Fq "server_base64_async_object_storage" "$MODEL_ROUTES_SRC"
grep -Fq "server_base64_async_object_storage" "$MODEL_ROUTES_DIST"
grep -Fq "124 base64 转存 COS" "$ADMIN_MAIN_SRC"
grep -Fq "124 base64 异步转存 COS" "$ADMIN_MAIN_SRC"
grep -Rqs "124 base64 异步" "$ADMIN_DIST"
grep -Fq "server_base64_object_storage" "$HTML_SRC"
grep -Fq "server_base64_async_object_storage" "$HTML_SRC"
grep -Fq "responseType==='server_base64_async_object_storage'" "$HTML_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror-workbench-web"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
if [ -d "$MIRROR_DIR" ]; then
  run_sudo cp -a "$MIRROR_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/mirror-workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi

log "install admin web"
run_sudo install -m 0644 "$ADMIN_MAIN_SRC" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "install api modules"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/src/modules/models" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/models"
run_sudo install -m 0644 "$API_REGISTRY_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$GEN_ROUTES_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$MODEL_ROUTES_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$API_REGISTRY_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$GEN_ROUTES_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$MODEL_ROUTES_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"

log "install workbench html"
run_sudo mkdir -p "$WORKBENCH_DIR"
run_sudo install -m 0644 "$HTML_SRC" "$WORKBENCH_DIR/image-studio-canvas-next.html"
if [ -d "$MIRROR_DIR" ]; then
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_DIR/image-studio-canvas-next.html"
  log "updated mirror $MIRROR_DIR/image-studio-canvas-next.html"
fi

log "verify installed markers"
run_sudo grep -Fq "server_base64_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "server_base64_async_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "persistInlineImageLocalPreview" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "server_base64_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "server_base64_async_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "isGenerationResultPreviewUrl" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "server_base64_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "server_base64_async_object_storage" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "124 base64 转存 COS" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "124 base64 异步转存 COS" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Rqs "124 base64 异步" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Fq "server_base64_object_storage" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "server_base64_async_object_storage" "$WORKBENCH_DIR/image-studio-canvas-next.html"
run_sudo grep -Fq "responseType==='server_base64_async_object_storage'" "$WORKBENCH_DIR/image-studio-canvas-next.html"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh admin and canvas pages after deploy."
