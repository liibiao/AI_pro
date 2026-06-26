#!/usr/bin/env bash
set +H
set -euo pipefail

PKG_LABEL="admin-model-usage-tabs"
ARCHIVE="${1:-}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
PM2_NAME="${PM2_NAME:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG_LABEL}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG_LABEL}-${STAMP}"

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

[ -n "$ARCHIVE" ] || fail "archive path is required"
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
MAIN_SRC_FILE="$(find "$WORKDIR" -path '*/ai-admin-platform/admin-web/src/main.tsx' -print -quit)"
[ -n "$MAIN_SRC_FILE" ] || fail "package missing ai-admin-platform/admin-web/src/main.tsx"
SRC_ROOT="${MAIN_SRC_FILE%/ai-admin-platform/admin-web/src/main.tsx}"
PKG_APP_ROOT="$SRC_ROOT/ai-admin-platform"

ADMIN_SRC="$PKG_APP_ROOT/admin-web/src/main.tsx"
ADMIN_DIST="$PKG_APP_ROOT/admin-web/dist"
API_SRC="$PKG_APP_ROOT/api-server/src/modules/models/routes.ts"
API_DIST="$PKG_APP_ROOT/api-server/dist/modules/models/routes.js"

[ -f "$ADMIN_SRC" ] || fail "package missing admin-web/src/main.tsx"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"
[ -f "$API_SRC" ] || fail "package missing api-server/src/modules/models/routes.ts"
[ -f "$API_DIST" ] || fail "package missing api-server/dist/modules/models/routes.js"

log "verify package markers"
grep -Fq "router.get('/admin/model-usage-stats'" "$API_SRC"
grep -Fq "modelUsageStatsBucket" "$API_SRC"
grep -Fq "source: 'generation_tasks'" "$API_SRC"
grep -Fq "gt.\"channel_key\" AS channel_key" "$API_SRC"
grep -Fq "modelDisplayName" "$API_SRC"
grep -Fq "router.get('/admin/model-usage-stats'" "$API_DIST"
grep -Fq "modelUsageStatsBucket" "$API_DIST"
grep -Fq "source: 'generation_tasks'" "$API_DIST"
grep -Fq "gt.\"channel_key\" AS channel_key" "$API_DIST"
grep -Fq "modelDisplayName" "$API_DIST"
grep -Fq "MODEL_USAGE_TYPE_TABS" "$ADMIN_SRC"
grep -Fq "ModelUsageStats" "$ADMIN_SRC"
grep -Fq "启动渠道" "$ADMIN_SRC"
grep -Fq "modelDisplayName" "$ADMIN_SRC"
grep -Fq "每天" "$ADMIN_SRC"
grep -Rqs "model-usage-stats" "$ADMIN_DIST"
grep -Rqs "启动渠道" "$ADMIN_DIST"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/src" \
  "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/modules/models/routes.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/modules/models/routes.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install packaged files"
run_sudo mkdir -p \
  "$REMOTE_APP_ROOT/api-server/src/modules/models" \
  "$REMOTE_APP_ROOT/api-server/dist/modules/models" \
  "$REMOTE_APP_ROOT/admin-web/src" \
  "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo install -m 0644 "$API_SRC" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo install -m 0644 "$API_DIST" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo install -m 0644 "$ADMIN_SRC" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "verify installed markers"
run_sudo grep -Fq "router.get('/admin/model-usage-stats'" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "modelUsageStatsBucket" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "source: 'generation_tasks'" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "gt.\"channel_key\" AS channel_key" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "modelDisplayName" "$REMOTE_APP_ROOT/api-server/src/modules/models/routes.ts"
run_sudo grep -Fq "router.get('/admin/model-usage-stats'" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "modelUsageStatsBucket" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "source: 'generation_tasks'" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "gt.\"channel_key\" AS channel_key" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "modelDisplayName" "$REMOTE_APP_ROOT/api-server/dist/modules/models/routes.js"
run_sudo grep -Fq "MODEL_USAGE_TYPE_TABS" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "ModelUsageStats" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "启动渠道" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "modelDisplayName" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Rqs "model-usage-stats" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Rqs "启动渠道" "$REMOTE_APP_ROOT/admin-web/dist"

log "restart backend"
pm2_run restart "$PM2_NAME" --update-env || pm2_run restart all --update-env || log "pm2 restart skipped"
pm2_run save || true

log "healthcheck"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/?v=$STAMP"
