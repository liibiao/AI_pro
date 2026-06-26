#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="admin-generation-results-pagination-20-20260608130612"
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
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

ADMIN_SRC="$SRC/ai-admin-platform/admin-web/src/main.tsx"
ADMIN_DIST="$SRC/ai-admin-platform/admin-web/dist"
API_SRC="$SRC/ai-admin-platform/api-server/src/modules/generation/routes.ts"
API_DIST="$SRC/ai-admin-platform/api-server/dist/modules/generation/routes.js"

[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"
[ -f "$API_SRC" ] || fail "package missing api-server/src/modules/generation/routes.ts"
[ -f "$API_DIST" ] || fail "package missing api-server/dist/modules/generation/routes.js"

log "verify package markers"
grep -Fq "const GENERATION_RESULT_PAGE_SIZE = 20" "$ADMIN_SRC"
grep -Fq "params.set('offset', String((page - 1) * GENERATION_RESULT_PAGE_SIZE))" "$ADMIN_SRC"
grep -Fq "function apiListPagination" "$ADMIN_SRC"
grep -Fq "showSizeChanger: false" "$ADMIN_SRC"
grep -Fq "const ADMIN_GENERATION_RESULT_PAGE_SIZE = 20" "$API_SRC"
grep -Fq "req.query.offset" "$API_SRC"
grep -Fq "pagination: adminGenerationPagination" "$API_SRC"
grep -Fq "async function findAdminGenerationTaskPage" "$API_SRC"
grep -Fq "const ADMIN_GENERATION_RESULT_PAGE_SIZE = 20" "$API_DIST"
grep -Fq "req.query.offset" "$API_DIST"
grep -Fq "pagination: adminGenerationPagination" "$API_DIST"
grep -Fq "async function findAdminGenerationTaskPage" "$API_DIST"
grep -Rqs "generationResults" "$ADMIN_DIST/assets"
grep -Rqs "offset" "$ADMIN_DIST/assets"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/generation/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/generation/routes.js" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/admin-web/src" \
  "$REMOTE_APP_ROOT/admin-web/dist" \
  "$REMOTE_APP_ROOT/api-server/src/modules/generation" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/generation"
run_sudo install -m 0644 "$ADMIN_SRC" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$REMOTE_APP_ROOT/admin-web/dist/"
run_sudo install -m 0644 "$API_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$API_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"

log "verify installed markers"
run_sudo grep -Fq "const GENERATION_RESULT_PAGE_SIZE = 20" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "params.set('offset', String((page - 1) * GENERATION_RESULT_PAGE_SIZE))" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "function apiListPagination" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "const ADMIN_GENERATION_RESULT_PAGE_SIZE = 20" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "req.query.offset" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "pagination: adminGenerationPagination" "$REMOTE_APP_ROOT/api-server/src/modules/generation/routes.ts"
run_sudo grep -Fq "const ADMIN_GENERATION_RESULT_PAGE_SIZE = 20" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Fq "req.query.offset" "$REMOTE_APP_ROOT/api-server/dist/modules/generation/routes.js"
run_sudo grep -Rqs "generationResults" "$REMOTE_APP_ROOT/admin-web/dist/assets"
run_sudo grep -Rqs "offset" "$REMOTE_APP_ROOT/admin-web/dist/assets"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the admin page after deploy."
