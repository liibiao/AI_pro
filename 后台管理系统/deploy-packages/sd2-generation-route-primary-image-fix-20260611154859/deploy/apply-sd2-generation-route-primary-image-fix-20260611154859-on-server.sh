#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sd2-generation-route-primary-image-fix-20260611154859"
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
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || fail "package root not found: $SRC"

verify_registry(){
  local file="$1"
  grep -Fq "async function submitSeedance2Video" "$file"
  grep -Fq "const usesAiyunzhiProtocol = isAiyunzhiSeedance2Protocol(ctx, modelName);" "$file"
  if grep -Fq "if (isArtifexSeedance2ModelName(modelName)) return submitLegacySeedance2Video(ctx, modelName);" "$file"; then
    fail "legacy Artifex branch still runs before SD2 protocol detection: $file"
  fi
  grep -Fq "Seedance 2 image_url 最多 1 个" "$file"
}

verify_registry "$SRC/api-server/src/modules/generation/adapters/registry.ts"
verify_registry "$SRC/api-server/dist/modules/generation/adapters/registry.js"

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

log "verify installed markers"
if run_sudo grep -Fq "if (isArtifexSeedance2ModelName(modelName)) return submitLegacySeedance2Video(ctx, modelName);" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"; then
  fail "installed dist still has legacy branch before SD2 protocol detection"
fi
run_sudo grep -Fq "const usesAiyunzhiProtocol = isAiyunzhiSeedance2Protocol(ctx, modelName);" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"

log "restart api"
pm2_run restart "$PM2_APP" --update-env || pm2_run restart all --update-env || true
pm2_run save || true
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health ok" || log "api health skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
