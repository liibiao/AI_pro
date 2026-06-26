#!/usr/bin/env bash
set -euo pipefail

PKG="api-aiyunzhi-gpt-image2-resolution-param-fix-20260626041045"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-/var/www/ai-admin/backups/${PKG}-${STAMP}}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

run_sudo(){
  "$@" && return 0
  local rc=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$rc"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return "$rc"
  fi
}

pm2_run(){
  if [ "$(id -u)" -eq 0 ] && [ -n "$PM2_USER" ] && command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
    return $?
  fi
  return 127
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR" || fail "api dir not found: $APP_DIR"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -f "$SRC/payload/src/modules/generation/adapters/registry.ts" ] || fail "package missing src adapter registry"
[ -f "$SRC/payload/dist/modules/generation/adapters/registry.js" ] || fail "package missing dist adapter registry"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/src/modules/generation/adapters" "$BACKUP_DIR/dist/modules/generation/adapters"
run_sudo cp -p "$APP_DIR/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/src/modules/generation/adapters/registry.ts"
run_sudo cp -p "$APP_DIR/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/dist/modules/generation/adapters/registry.js"

log "install adapter registry"
run_sudo install -m 0644 "$SRC/payload/src/modules/generation/adapters/registry.ts" "$APP_DIR/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$SRC/payload/dist/modules/generation/adapters/registry.js" "$APP_DIR/dist/modules/generation/adapters/registry.js"

log "verify adapter resolution markers"
grep -Fq "normalizeExplicitAiyunzhiGptImage2Resolution" "$APP_DIR/src/modules/generation/adapters/registry.ts"
grep -Fq "firstAiyunzhiGptImage2Resolution" "$APP_DIR/src/modules/generation/adapters/registry.ts"
if grep -Fq "firstDefined(ctx.params.imageSize, ctx.params.requestedResolution, ctx.params.resolution" "$APP_DIR/dist/modules/generation/adapters/registry.js"; then
  fail "stale Aiyunzhi GPT Image 2 size priority is still present"
fi
node --check "$APP_DIR/dist/modules/generation/adapters/registry.js" >/dev/null
node - "$APP_DIR/dist/modules/generation/adapters/registry.js" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const start = text.indexOf('function resolveAiyunzhiGptImage2Size');
const end = text.indexOf('function resolveAiyunzhiGptImage2Count', start);
if (start < 0 || end < 0) throw new Error('resolveAiyunzhiGptImage2Size block not found');
const block = text.slice(start, end);
const resolutionIndex = block.indexOf('ctx.params.resolution');
const imageSizeIndex = block.indexOf('ctx.params.imageSize');
const defaultsIndex = block.indexOf('defaults.resolution');
if (resolutionIndex < 0 || imageSizeIndex < 0 || defaultsIndex < 0) throw new Error('resolution priority markers missing');
if (!(resolutionIndex < imageSizeIndex && imageSizeIndex < defaultsIndex)) throw new Error('resolution priority is wrong');
if (!block.includes("|| '1K'")) throw new Error('fallback resolution missing');
console.log('[verify] adapter resolution priority ok');
NODE

if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  log "restart pm2: $PM2_APP"
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
  pm2_run status "$PM2_APP" --no-color | sed -n '1,8p'
else
  fail "pm2 app not found: $PM2_APP"
fi

log "done"
echo "backup: $BACKUP_DIR"
