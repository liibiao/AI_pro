#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="admin-generation-results-image-tab-load-fix-20260608093404"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
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
  if [ "$(id -u)" -eq 0 ] || [ "${1:-}" = "test" ]; then
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
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 1
  fi
}

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
grep -Fq "function generationTaskCategoryScanSelect()" "$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts"
grep -Fq "select: generationTaskCategoryScanSelect()" "$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts"
grep -Fq "const uniqueIds = Array.from(new Set(ids)).slice(0, take);" "$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts"
grep -Fq "function generationTaskCategoryScanSelect()" "$SRC/ai-admin-platform/api-server/dist/modules/generation/routes.js"
grep -Fq "select: generationTaskCategoryScanSelect()" "$SRC/ai-admin-platform/api-server/dist/modules/generation/routes.js"
grep -Fq "结果列表加载失败" "$SRC/ai-admin-platform/admin-web/src/main.tsx"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src"
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true
if [ -d "$REMOTE_APP_ROOT/admin-web/src" ]; then
  run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
fi

log "install api generation routes"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$SRC/ai-admin-platform/api-server/dist/modules/generation/routes.js" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"

if [ -d "$REMOTE_APP_ROOT/admin-web/src" ]; then
  log "install admin web source"
  run_sudo install -m 0644 "$SRC/ai-admin-platform/admin-web/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
else
  log "admin web source skipped, not found: $REMOTE_APP_ROOT/admin-web/src"
fi

log "verify installed markers"
run_sudo grep -Fq "function generationTaskCategoryScanSelect()" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "select: generationTaskCategoryScanSelect()" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "function generationTaskCategoryScanSelect()" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "select: generationTaskCategoryScanSelect()" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
if [ -f "$REMOTE_APP_ROOT/admin-web/src/main.tsx" ]; then
  run_sudo grep -Fq "结果列表加载失败" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
fi

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the admin page after deploy."
