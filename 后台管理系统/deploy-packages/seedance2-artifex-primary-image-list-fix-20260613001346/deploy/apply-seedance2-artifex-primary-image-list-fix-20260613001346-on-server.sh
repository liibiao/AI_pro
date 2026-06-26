#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance2-artifex-primary-image-list-fix-20260613001346"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$status"
  fi
}
pm2_run(){
  if [ "$(id -un 2>/dev/null || true)" = "$PM2_USER" ] && command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  else
    return 127
  fi
}
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

if [ -z "$APP_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

verify_registry(){
  local file="$1"
  grep -Fq "const rawBaseImageUrls = buildSoraVideoProImageUrls(ctx);" "$file"
  grep -Fq "? Array.from(new Set([...rawBaseImageUrls, ...rawExplicitImageUrls]))" "$file"
  grep -Fq "? []" "$file"
  if grep -Fq "Seedance 2 image_url 最多 1 个" "$file"; then
    fail "old Seedance2 primary image_url limit still exists: $file"
  fi
}
verify_registry_sudo(){
  local file="$1"
  run_sudo bash -c "$(declare -f verify_registry fail); verify_registry \"\$0\"" "$file"
}
install_file(){
  local rel="$1" dest="$2"
  [ -f "$SRC/$rel" ] || fail "$rel missing in package"
  run_sudo mkdir -p "$(dirname "$dest")"
  if run_sudo test -f "$dest"; then
    local backup="$BACKUP_DIR/$rel"
    run_sudo mkdir -p "$(dirname "$backup")"
    run_sudo cp -p "$dest" "$backup"
  fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest" 2>/dev/null || true
  log "installed $dest"
}

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

log "verify package markers"
verify_registry "$SRC/api-server/src/modules/generation/adapters/registry.ts"
verify_registry "$SRC/api-server/dist/modules/generation/adapters/registry.js"

log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "verify installed markers"
verify_registry_sudo "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
verify_registry_sudo "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "restart api"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 process not found: $PM2_APP"
fi

curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"
log "done"
echo "backup: $BACKUP_DIR"
