#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="openai-responses-image-channel-20260605213219"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/admin-web" || fail "admin-web not found: $APP_DIR/admin-web"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

ADMIN_SRC="$SRC_ROOT/ai-admin-platform/admin-web/src/main.tsx"
ADMIN_DIST="$SRC_ROOT/ai-admin-platform/admin-web/dist"
REGISTRY_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
REGISTRY_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
GEN_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
GEN_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"
MODELS_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts"
MODELS_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js"
COMPAT_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts"
COMPAT_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js"
SYNC_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/sync-canvas-models.ts"
SYNC_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/sync-canvas-models.js"
HTML_SRC="$SRC_ROOT/workbench-web/image-studio-canvas-next.html"

[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"
[ -f "$REGISTRY_SRC" ] || fail "package missing api-server registry.ts"
[ -f "$REGISTRY_DIST" ] || fail "package missing api-server registry.js"
[ -f "$GEN_SRC" ] || fail "package missing generation routes.ts"
[ -f "$GEN_DIST" ] || fail "package missing generation routes.js"
[ -f "$MODELS_SRC" ] || fail "package missing models routes.ts"
[ -f "$MODELS_DIST" ] || fail "package missing models routes.js"
[ -f "$COMPAT_SRC" ] || fail "package missing workbench compat routes.ts"
[ -f "$COMPAT_DIST" ] || fail "package missing workbench compat routes.js"
[ -f "$SYNC_SRC" ] || fail "package missing sync-canvas-models.ts"
[ -f "$SYNC_DIST" ] || fail "package missing sync-canvas-models.js"
[ -f "$HTML_SRC" ] || fail "package missing workbench html"

log "verify package markers"
grep -Fq "OpenAI Responses 生图 /responses" "$ADMIN_SRC"
grep -Fq "'openai-responses-image': { submit: submitOpenAiResponsesImage" "$REGISTRY_SRC"
grep -Fq "submitOpenAiResponsesImage" "$REGISTRY_DIST"
grep -Fq "configuredLower === 'openai-responses-image'" "$GEN_SRC"
grep -Fq "openai-responses-image" "$MODELS_SRC"
grep -Fq "openai-responses-image" "$COMPAT_SRC"
grep -Fq "openai-responses-image" "$SYNC_SRC"
grep -Fq "isOpenAiResponsesImageAdapter" "$HTML_SRC"
grep -Rqs "OpenAI Responses" "$ADMIN_DIST/assets"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist" \
  "$BACKUP_DIR/workbench-web" \
  "$BACKUP_DIR/mirror/workbench-web"
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/workbench-compat/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/workbench-compat/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" 2>/dev/null || true
run_sudo cp -a "$WEB_ROOT/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
run_sudo cp -a "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html" "$BACKUP_DIR/mirror/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$APP_DIR/admin-web/src" \
  "$APP_DIR/admin-web/dist" \
  "$APP_DIR/api-server/src/modules/generation/adapters" \
  "$APP_DIR/api-server/src/modules/generation" \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/src/modules/workbench-compat" \
  "$APP_DIR/api-server/src" \
  "$APP_DIR/api-server/dist/modules/generation/adapters" \
  "$APP_DIR/api-server/dist/modules/generation" \
  "$APP_DIR/api-server/dist/modules/models" \
  "$APP_DIR/api-server/dist/modules/workbench-compat" \
  "$APP_DIR/api-server/dist" \
  "$WEB_ROOT/workbench-web"
run_sudo install -m 0644 "$ADMIN_SRC" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist"
run_sudo mkdir -p "$APP_DIR/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
run_sudo install -m 0644 "$REGISTRY_SRC" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$GEN_SRC" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$MODELS_SRC" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$COMPAT_SRC" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
run_sudo install -m 0644 "$SYNC_SRC" "$APP_DIR/api-server/src/sync-canvas-models.ts"
run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo install -m 0644 "$GEN_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$MODELS_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo install -m 0644 "$COMPAT_DIST" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
run_sudo install -m 0644 "$SYNC_DIST" "$APP_DIR/api-server/dist/sync-canvas-models.js"
run_sudo install -m 0644 "$HTML_SRC" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
if run_sudo test -d "$MIRROR_ROOT/tools/workbench-web"; then
  run_sudo install -m 0644 "$HTML_SRC" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
fi

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged dist"
    run_sudo install -m 0644 "$REGISTRY_DIST" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
    run_sudo install -m 0644 "$GEN_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"
    run_sudo install -m 0644 "$MODELS_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
    run_sudo install -m 0644 "$COMPAT_DIST" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
    run_sudo install -m 0644 "$SYNC_DIST" "$APP_DIR/api-server/dist/sync-canvas-models.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "build admin-web if toolchain is available"
if run_sudo bash -lc "cd '$APP_DIR/admin-web' && command -v npm >/dev/null 2>&1"; then
  if run_sudo bash -lc "cd '$APP_DIR/admin-web' && npm run build"; then
    log "admin-web build: ok"
  else
    log "admin-web npm build failed; restoring packaged dist"
    run_sudo rm -rf "$APP_DIR/admin-web/dist"
    run_sudo mkdir -p "$APP_DIR/admin-web/dist"
    run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
  fi
elif run_sudo bash -lc "cd '$APP_DIR/admin-web' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ] && [ -f node_modules/vite/bin/vite.js ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/admin-web' && node node_modules/typescript/bin/tsc -p tsconfig.json && node node_modules/vite/bin/vite.js build"; then
    log "admin-web build: ok"
  else
    log "admin-web node build failed; restoring packaged dist"
    run_sudo rm -rf "$APP_DIR/admin-web/dist"
    run_sudo mkdir -p "$APP_DIR/admin-web/dist"
    run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
  fi
else
  log "admin-web build toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "OpenAI Responses 生图 /responses" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Fq "submitOpenAiResponsesImage" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
run_sudo grep -Fq "submitOpenAiResponsesImage" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "configuredLower === 'openai-responses-image'" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "openai-responses-image" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "openai-responses-image" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
run_sudo grep -Fq "openai-responses-image" "$APP_DIR/api-server/src/sync-canvas-models.ts"
run_sudo grep -Fq "isOpenAiResponsesImageAdapter" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
run_sudo grep -Rqs "OpenAI Responses" "$APP_DIR/admin-web/dist/assets"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
echo "canvas refresh: http://124.156.137.236/image-studio-canvas-next.html"
