#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v4-pro-real-error-message-fix-20260603120500"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
APP_DIR="${APP_DIR:-${ADMIN_ROOT:-}}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
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
    if [ -d "$candidate/admin-web" ] && [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$APP_DIR" ] || fail "APP_DIR not found; set APP_DIR=/path/to/ai-admin-platform"
[ -d "$APP_DIR/admin-web" ] || fail "admin-web not found: $APP_DIR/admin-web"
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

pm2_sudo(){
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
tar --warning=no-unknown-keyword -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"
[ -d "$SRC" ] || SRC="$WORK_DIR"

need_file(){
  [ -f "$SRC/$1" ] || fail "$1 not found in package"
}

install_file(){
  local rel="$1"
  local dest="$2"
  need_file "$rel"
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

install_tree(){
  local rel="$1"
  local dest="$2"
  [ -d "$SRC/$rel" ] || fail "$rel not found in package"
  run_sudo mkdir -p "$dest"
  if [ -d "$dest" ]; then
    local backup_name
    backup_name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
    run_sudo mkdir -p "$BACKUP_DIR/$backup_name"
    run_sudo cp -a "$dest/." "$BACKUP_DIR/$backup_name/" 2>/dev/null || true
  fi
  run_sudo rm -rf "$dest"
  run_sudo mkdir -p "$dest"
  run_sudo cp -a "$SRC/$rel/." "$dest/"
  log "installed $dest"
}

install_canvas_file(){
  local rel="$1"
  local web_rel="${rel#tools/}"
  install_file "$rel" "$WEB_ROOT/$web_rel"
  install_file "$rel" "$WEB_ROOT/$rel"
  if [ -d "$MIRROR_ROOT" ]; then
    install_file "$rel" "$MIRROR_ROOT/$rel"
  else
    log "mirror root missing, skip $rel"
  fi
}

run_api_script(){
  local npm_script="$1"
  local script_name="$2"
  local label="$3"
  local env_prefix="${4:-}"
  local api_dir="$APP_DIR/api-server"
  log "$label"
  if command -v npm >/dev/null 2>&1; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix npm run $npm_script"
  elif command -v node >/dev/null 2>&1 && [ -f "$api_dir/node_modules/tsx/dist/cli.mjs" ]; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix node node_modules/tsx/dist/cli.mjs src/$script_name.ts"
  elif command -v node >/dev/null 2>&1 && [ -f "$api_dir/dist/$script_name.js" ]; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix node dist/$script_name.js"
  else
    fail "npm or node runtime not found; cannot run $label"
  fi
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
log "backup: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install canvas files"
install_canvas_file "tools/workbench-web/image-studio-canvas-next.html"
install_canvas_file "tools/workbench-web/models/sora-v4-pro.json"

log "install admin-web source and dist"
install_file "admin-web/src/main.tsx" "$APP_DIR/admin-web/src/main.tsx"
install_tree "admin-web/dist" "$APP_DIR/admin-web/dist"

log "install api-server source/dist files"
install_file "api-server/src/pricing.ts" "$APP_DIR/api-server/src/pricing.ts"
install_file "api-server/src/billing.ts" "$APP_DIR/api-server/src/billing.ts"
install_file "api-server/src/apply-pricing.ts" "$APP_DIR/api-server/src/apply-pricing.ts"
install_file "api-server/src/seed.ts" "$APP_DIR/api-server/src/seed.ts"
install_file "api-server/src/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts"
install_file "api-server/src/upstream.ts" "$APP_DIR/api-server/src/upstream.ts"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
install_file "api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
install_file "api-server/dist/pricing.js" "$APP_DIR/api-server/dist/pricing.js"
install_file "api-server/dist/billing.js" "$APP_DIR/api-server/dist/billing.js"
install_file "api-server/dist/apply-pricing.js" "$APP_DIR/api-server/dist/apply-pricing.js"
install_file "api-server/dist/seed.js" "$APP_DIR/api-server/dist/seed.js"
install_file "api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"
install_file "api-server/dist/upstream.js" "$APP_DIR/api-server/dist/upstream.js"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
install_file "api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"

API_DIR="$APP_DIR/api-server"
log "build api-server if toolchain is available"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/typescript/bin/tsc" ]; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "node/typescript not found, using packaged dist files"
fi

run_api_script "sync:canvas-models" "sync-canvas-models" "sync canvas model config into database" "CANVAS_MODELS_DIR='$MIRROR_ROOT/tools/workbench-web/models'"
run_api_script "pricing:apply" "apply-pricing" "apply pricing into database"

log "restart api"
pm2_sudo restart "$PM2_APP" --update-env || pm2_sudo restart all --update-env || true
pm2_sudo save || true

log "verify markers"
grep -Fq "data-pricing-tab" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "llmMemberCreditsPerUsd" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "memberCreditsPerUsdCost" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "originalCreditsPerUsdCost" "$APP_DIR/admin-web/src/main.tsx"
grep -Fq "生图/生视频/文本模型" "$APP_DIR/api-server/src/billing.ts"
grep -Fq "memberCredits = Math.ceil" "$APP_DIR/api-server/dist/billing.js"
grep -Fq "creditsPerUsdCost: 100" "$APP_DIR/api-server/src/apply-pricing.ts"
grep -Fq "extractTaskStatusText" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -Fq "isSoraV3NoteVideoProtocol(ctx)) return submitSoraV3NoteVideo(ctx)" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
grep -Fq "extractUpstreamErrorMessage" "$APP_DIR/api-server/src/upstream.ts"
grep -Fq "extractVideoTaskStatus" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
grep -Fq "pricing-tabs" "$APP_DIR/admin-web/dist/assets/"*.js || grep -Fq "会员一刀积分" "$APP_DIR/admin-web/dist/assets/"*.js

log "done"
echo "backup: $BACKUP_DIR"
echo "Hard-refresh the canvas and admin pages after deploy."
