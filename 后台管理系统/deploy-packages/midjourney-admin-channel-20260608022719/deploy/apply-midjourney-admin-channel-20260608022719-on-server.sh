#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="midjourney-admin-channel-20260608022719"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
API_DIR="${API_DIR:-$APP_DIR/api-server}"
ADMIN_DIR="${ADMIN_DIR:-$APP_DIR/admin-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

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
  if [ "$(id -u)" -eq 0 ] && id "$PM2_USER" >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

backup_file(){
  local dest="$1"
  run_sudo test -f "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$(dirname "$backup")"
  run_sudo cp -p "$dest" "$backup"
}

backup_dir(){
  local dest="$1"
  run_sudo test -d "$dest" || return 0
  local rel="${dest#/}"
  local backup="$BACKUP_DIR/$rel"
  run_sudo mkdir -p "$backup"
  run_sudo cp -a "$dest/." "$backup/"
}

install_file(){
  local src="$1" dest="$2" label="$3"
  [ -f "$src" ] || fail "$label missing in package: $src"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest" 2>/dev/null || true
  log "installed $dest"
}

verify_api_markers(){
  local root="$1"
  grep -Fq "'midjourney-imagine': { submit: submitMidjourneyImagine" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "async function submitMidjourneyImagine" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "/mj/submit/imagine" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "/mj/task/{taskId}/fetch" "$root/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts"
  grep -Fq "case 'midjourney-imagine'" "$root/ai-admin-platform/api-server/src/modules/models/routes.ts"
  grep -Fq "typeof result === 'string'" "$root/ai-admin-platform/api-server/src/upstream.ts"
  grep -Fq "'midjourney-imagine', 'midjourney', 'mj-imagine'" "$root/ai-admin-platform/api-server/src/sync-canvas-models.ts"
  grep -Fq "canvas-midjourney-imagine" "$root/ai-admin-platform/api-server/scripts/materialize-midjourney-imagine.mjs"
  grep -Fq "submitMidjourneyImagine" "$root/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js"
  grep -Fq "/mj/submit/imagine" "$root/ai-admin-platform/api-server/dist/modules/models/routes.js"
  grep -Fq "midjourney-imagine" "$root/ai-admin-platform/api-server/dist/sync-canvas-models.js"
}

verify_admin_markers(){
  local root="$1"
  grep -Fq "Midjourney Imagine /mj/submit/imagine" "$root/ai-admin-platform/admin-web/src/main.tsx"
  grep -Rqs "Midjourney Imagine" "$root/ai-admin-platform/admin-web/dist/assets"
  grep -Rqs "midjourney-imagine" "$root/ai-admin-platform/admin-web/dist/assets"
}

cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$API_DIR" || fail "api-server not found: $API_DIR"
run_sudo test -d "$ADMIN_DIR" || fail "admin-web not found: $ADMIN_DIR"

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

log "verify package markers"
verify_api_markers "$SRC_ROOT"
verify_admin_markers "$SRC_ROOT"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"
backup_dir "$ADMIN_DIR/dist"

log "install api-server files"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts" "$API_DIR/src/modules/generation/adapters/registry.ts" "api registry source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$API_DIR/dist/modules/generation/adapters/registry.js" "api registry dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/modules/models/routes.ts" "$API_DIR/src/modules/models/routes.ts" "models routes source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js" "$API_DIR/dist/modules/models/routes.js" "models routes dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/upstream.ts" "$API_DIR/src/upstream.ts" "upstream source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/upstream.js" "$API_DIR/dist/upstream.js" "upstream dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/src/sync-canvas-models.ts" "$API_DIR/src/sync-canvas-models.ts" "sync canvas models source"
install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/sync-canvas-models.js" "$API_DIR/dist/sync-canvas-models.js" "sync canvas models dist"
install_file "$SRC_ROOT/ai-admin-platform/api-server/scripts/materialize-midjourney-imagine.mjs" "$API_DIR/scripts/materialize-midjourney-imagine.mjs" "midjourney materialize script"

log "install admin-web files"
install_file "$SRC_ROOT/ai-admin-platform/admin-web/src/main.tsx" "$ADMIN_DIR/src/main.tsx" "admin main source"
run_sudo rm -rf "$ADMIN_DIR/dist"
run_sudo mkdir -p "$ADMIN_DIR/dist"
run_sudo cp -a "$SRC_ROOT/ai-admin-platform/admin-web/dist/." "$ADMIN_DIR/dist/"
log "installed $ADMIN_DIR/dist"

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$API_DIR' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  if run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"; then
    log "api-server build: ok"
  else
    log "api-server build failed; continuing with packaged dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js" "$API_DIR/dist/modules/generation/adapters/registry.js" "api registry dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/modules/models/routes.js" "$API_DIR/dist/modules/models/routes.js" "models routes dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/upstream.js" "$API_DIR/dist/upstream.js" "upstream dist"
    install_file "$SRC_ROOT/ai-admin-platform/api-server/dist/sync-canvas-models.js" "$API_DIR/dist/sync-canvas-models.js" "sync canvas models dist"
  fi
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "upsert Midjourney provider/model"
run_sudo bash -lc "cd '$API_DIR' && node scripts/materialize-midjourney-imagine.mjs"

log "restart pm2 app: $PM2_APP"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 app not found, skipped: $PM2_APP"
fi

log "verify installed markers"
run_sudo grep -Fq "submitMidjourneyImagine" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "/mj/submit/imagine" "$API_DIR/dist/modules/models/routes.js"
run_sudo grep -Fq "midjourney-imagine" "$API_DIR/dist/sync-canvas-models.js"
run_sudo grep -Fq "canvas-midjourney-imagine" "$API_DIR/scripts/materialize-midjourney-imagine.mjs"
run_sudo grep -Fq "Midjourney Imagine /mj/submit/imagine" "$ADMIN_DIR/src/main.tsx"
run_sudo grep -Rqs "midjourney-imagine" "$ADMIN_DIR/dist/assets"

curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Refresh admin model management and hard-refresh the page."
