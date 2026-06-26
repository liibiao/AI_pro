#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="gpt2pro-official-geometry-fix-20260620032939"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

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
[ -n "$APP_DIR" ] || fail "APP_DIR not found"
[ -d "$APP_DIR/api-server" ] || fail "api-server not found: $APP_DIR/api-server"

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi
run_sudo(){
  if [ -n "$SUDO" ]; then
    $SUDO "$@"
  else
    "$@"
  fi
}
pm2_run(){
  if command -v pm2 >/dev/null 2>&1 && pm2 show "$PM2_APP" >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}
backup_one(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$APP_DIR/$rel"
  need_file "$rel"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $rel"
}

log "verify package markers"
grep -Fq "45.77.211.38:8317" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizedResolution === '1K' || normalizedResolution === '3K'" "$SRC/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image'" "$SRC/api-server/dist/modules/generation/routes.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

for rel in \
  api-server/src/modules/generation/adapters/registry.ts \
  api-server/src/modules/generation/routes.ts \
  api-server/dist/modules/generation/adapters/registry.js \
  api-server/dist/modules/generation/routes.js; do
  install_file "$rel"
done

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || fail "pm2 restart failed"
pm2_run save || true

grep -Fq "45.77.211.38:8317" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "normalizedResolution === '1K' || normalizedResolution === '3K'" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

log "done"
echo "backup: $BACKUP_DIR"
