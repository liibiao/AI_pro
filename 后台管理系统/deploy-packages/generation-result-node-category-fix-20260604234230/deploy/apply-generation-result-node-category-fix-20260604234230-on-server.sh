#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="generation-result-node-category-fix-20260604234230"
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
API_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/routes.ts"
API_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/routes.js"

[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"
[ -f "$API_SRC" ] || fail "package missing api-server/src/modules/generation/routes.ts"
[ -f "$API_DIST" ] || fail "package missing api-server/dist/modules/generation/routes.js"

log "verify package markers"
grep -Fq "generationTaskAdminCategory" "$ADMIN_SRC"
grep -Fq "generationTaskNodeCategory" "$ADMIN_SRC"
grep -Fq "params.set('category', generationResultCategoryParam(activeTab))" "$ADMIN_SRC"
grep -Fq "resolveAdminGenerationResultCategory" "$API_SRC"
grep -Fq "adminCategory: generationTaskAdminCategory" "$API_SRC"
grep -Fq "storyboardimage" "$API_DIST"
grep -Fq "seedancevideo" "$API_DIST"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation"
run_sudo cp -a "$APP_DIR/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$APP_DIR/admin-web/src" \
  "$APP_DIR/admin-web/dist" \
  "$APP_DIR/api-server/src/modules/generation" \
  "$APP_DIR/api-server/dist/modules/generation"
run_sudo install -m 0644 "$ADMIN_SRC" "$APP_DIR/admin-web/src/main.tsx"
run_sudo rm -rf "$APP_DIR/admin-web/dist"
run_sudo mkdir -p "$APP_DIR/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$APP_DIR/admin-web/dist/"
run_sudo install -m 0644 "$API_SRC" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$API_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; keeping packaged dist"
    run_sudo install -m 0644 "$API_DIST" "$APP_DIR/api-server/dist/modules/generation/routes.js"
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
run_sudo grep -Fq "resolveAdminGenerationResultCategory" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "adminCategory: generationTaskAdminCategory" "$APP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "storyboardimage" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "seedancevideo" "$APP_DIR/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "generationTaskAdminCategory" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Fq "params.set('category', generationResultCategoryParam(activeTab))" "$APP_DIR/admin-web/src/main.tsx"
run_sudo grep -Rqs "adminCategory" "$APP_DIR/admin-web/dist/assets"
run_sudo grep -Rqs "storyboardimage" "$APP_DIR/admin-web/dist/assets"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
