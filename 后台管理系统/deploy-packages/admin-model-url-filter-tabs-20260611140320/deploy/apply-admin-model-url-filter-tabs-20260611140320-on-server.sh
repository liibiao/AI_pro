#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="admin-model-url-filter-tabs-20260611140320"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
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

cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC="$WORKDIR/$PKG/ai-admin-platform/admin-web"
[ -d "$SRC/dist" ] || fail "package missing admin-web/dist"
[ -f "$SRC/src/main.tsx" ] || fail "package missing admin-web/src/main.tsx"
[ -f "$SRC/src/styles.css" ] || fail "package missing admin-web/src/styles.css"

log "verify package markers"
grep -Fq "按渠道 Base URL 筛选" "$SRC/src/main.tsx"
grep -Fq "ModelStatusTabs" "$SRC/src/main.tsx"
grep -Fq "filterAndSortAdminModels" "$SRC/src/main.tsx"
grep -Fq "videoBillingModeFromModel(item) !== filters.pricingMode" "$SRC/src/main.tsx"
grep -Fq ".modelFilterBar" "$SRC/src/styles.css"
grep -Rqs "按渠道 Base URL 筛选" "$SRC/dist"
grep -Rqs "modelFilterBar" "$SRC/dist"

log "backup current admin web: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/admin-web/src" "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/main.tsx" "$BACKUP_DIR/ai-admin-platform/admin-web/src/main.tsx" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/styles.css" "$BACKUP_DIR/ai-admin-platform/admin-web/src/styles.css" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install admin web source and dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/src" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo install -m 0644 "$SRC/src/main.tsx" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo install -m 0644 "$SRC/src/styles.css" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$SRC/dist/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "verify installed markers"
run_sudo grep -Fq "按渠道 Base URL 筛选" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq "ModelStatusTabs" "$REMOTE_APP_ROOT/admin-web/src/main.tsx"
run_sudo grep -Fq ".modelFilterBar" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo grep -Rqs "按渠道 Base URL 筛选" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Rqs "modelFilterBar" "$REMOTE_APP_ROOT/admin-web/dist"

log "healthcheck admin html"
curl -fsS http://127.0.0.1/admin/ >/dev/null 2>&1 || curl -fsS http://127.0.0.1/admin/index.html >/dev/null 2>&1 || log "admin html healthcheck skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the admin page after deploy."
