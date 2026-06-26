#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sd2-vip-size-upstream-param-fix-20260611165134"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"

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
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
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
    sudo -u "$PM2_USER" PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 0
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG/ai-admin-platform"
[ -d "$SRC/api-server" ] || fail "package api-server not found"

verify_markers(){
  local file="$1"
  grep -Fq "function resolveLingdongSd2VipSize" "$file"
  grep -Fq "return 'small'" "$file"
  grep -Fq "return 'large'" "$file"
  grep -Fq "size: resolveLingdongSd2VipSize(ctx)" "$file"
}
verify_markers_sudo(){
  local file="$1"
  run_sudo grep -Fq "function resolveLingdongSd2VipSize" "$file"
  run_sudo grep -Fq "return 'small'" "$file"
  run_sudo grep -Fq "return 'large'" "$file"
  run_sudo grep -Fq "size: resolveLingdongSd2VipSize(ctx)" "$file"
}

log "verify package markers"
verify_markers "$SRC/api-server/src/modules/generation/adapters/registry.ts"
verify_markers "$SRC/api-server/dist/modules/generation/adapters/registry.js"

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

install_file(){
  local rel="$1"
  local dest="$2"
  [ -f "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$(dirname "$dest")"
  if [ -f "$dest" ]; then
    local backup_name
    backup_name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$backup_name.bak" 2>/dev/null || true
  fi
  run_sudo cp -p "$SRC/$rel" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json" || log "api-server tsc failed; using packaged dist"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "verify installed markers"
verify_markers_sudo "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
verify_markers_sudo "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true

log "done"
echo "backup: $BACKUP_DIR"
