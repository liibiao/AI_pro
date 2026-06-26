#!/usr/bin/env bash
set +H
set -euo pipefail

PKG_LABEL="admin-layout-unified-scroll"
ARCHIVE="${1:-}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
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
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -n "$ARCHIVE" ] || fail "archive path is required"
[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/admin-web" || fail "admin-web dir not found: $REMOTE_APP_ROOT/admin-web"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
CSS_SRC_FILE="$(find "$WORKDIR" -path '*/ai-admin-platform/admin-web/src/styles.css' -print -quit)"
[ -n "$CSS_SRC_FILE" ] || fail "package missing ai-admin-platform/admin-web/src/styles.css"
SRC_ROOT="${CSS_SRC_FILE%/ai-admin-platform/admin-web/src/styles.css}"
PKG_APP_ROOT="$SRC_ROOT/ai-admin-platform"

ADMIN_CSS="$PKG_APP_ROOT/admin-web/src/styles.css"
ADMIN_DIST="$PKG_APP_ROOT/admin-web/dist"

[ -f "$ADMIN_CSS" ] || fail "package missing admin-web/src/styles.css"
[ -d "$ADMIN_DIST" ] || fail "package missing admin-web/dist"

log "verify package markers"
grep -Fq ".appShell > .ant-layout" "$ADMIN_CSS"
grep -Fq "overflow: visible" "$ADMIN_CSS"
grep -Fq "min-height: 100vh" "$ADMIN_CSS"
grep -Rqs "appShell>.ant-layout" "$ADMIN_DIST"
grep -Rqs "overflow:visible" "$ADMIN_DIST"

log "backup current frontend: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/admin-web/src" "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/src/styles.css" "$BACKUP_DIR/ai-admin-platform/admin-web/src/styles.css" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/admin-web/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true

log "install frontend files"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/src" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo install -m 0644 "$ADMIN_CSS" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo rm -rf "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo mkdir -p "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo cp -a "$ADMIN_DIST/." "$REMOTE_APP_ROOT/admin-web/dist/"

log "verify installed markers"
run_sudo grep -Fq ".appShell > .ant-layout" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo grep -Fq "overflow: visible" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo grep -Fq "min-height: 100vh" "$REMOTE_APP_ROOT/admin-web/src/styles.css"
run_sudo grep -Rqs "appShell>.ant-layout" "$REMOTE_APP_ROOT/admin-web/dist"
run_sudo grep -Rqs "overflow:visible" "$REMOTE_APP_ROOT/admin-web/dist"

log "done"
echo "backup: $BACKUP_DIR"
echo "admin refresh: http://124.156.137.236/?v=$STAMP"
