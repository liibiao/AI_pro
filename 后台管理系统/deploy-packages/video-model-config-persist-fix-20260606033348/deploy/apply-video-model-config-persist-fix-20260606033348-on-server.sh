#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="video-model-config-persist-fix-20260606033348"
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
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

ROUTES_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts"
ROUTES_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js"
GROK_SRC="$SRC_ROOT/ai-admin-platform/api-server/src/apply-grok-media-channel.ts"
GROK_DIST="$SRC_ROOT/ai-admin-platform/api-server/dist/apply-grok-media-channel.js"

[ -f "$ROUTES_SRC" ] || fail "package missing models routes.ts"
[ -f "$ROUTES_DIST" ] || fail "package missing models routes.js"
[ -f "$GROK_SRC" ] || fail "package missing apply-grok-media-channel.ts"
[ -f "$GROK_DIST" ] || fail "package missing apply-grok-media-channel.js"

log "verify package markers"
grep -Fq "existingCapabilities: existing.capabilities" "$ROUTES_SRC"
grep -Fq "jsonObject(input.existingCapabilities)" "$ROUTES_SRC"
grep -Fq "overwriteExistingGrokMedia" "$GROK_SRC"
grep -Fq "mergeJsonObjects(defaultCapabilities" "$GROK_SRC"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"
run_sudo cp -a "$APP_DIR/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/src/apply-grok-media-channel.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-grok-media-channel.ts" 2>/dev/null || true
run_sudo cp -a "$APP_DIR/api-server/dist/apply-grok-media-channel.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-grok-media-channel.js" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$APP_DIR/api-server/src/modules/models" \
  "$APP_DIR/api-server/dist/modules/models" \
  "$APP_DIR/api-server/src" \
  "$APP_DIR/api-server/dist"
run_sudo install -m 0644 "$ROUTES_SRC" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$ROUTES_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo install -m 0644 "$GROK_SRC" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo install -m 0644 "$GROK_DIST" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; restoring packaged dist"
    run_sudo install -m 0644 "$ROUTES_DIST" "$APP_DIR/api-server/dist/modules/models/routes.js"
    run_sudo install -m 0644 "$GROK_DIST" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "verify installed markers"
run_sudo grep -Fq "existingCapabilities: existing.capabilities" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "jsonObject(input.existingCapabilities)" "$APP_DIR/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "overwriteExistingGrokMedia" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo grep -Fq "mergeJsonObjects(defaultCapabilities" "$APP_DIR/api-server/src/apply-grok-media-channel.ts"
run_sudo grep -Fq "existingCapabilities" "$APP_DIR/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "overwriteExistingGrokMedia" "$APP_DIR/api-server/dist/apply-grok-media-channel.js"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/"
