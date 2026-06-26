#!/usr/bin/env bash
set -euo pipefail

PKG="api-gpt2-plus-max-openai-edits-restore-20260626043824"
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

for file in \
  payload/src/modules/generation/routes.ts \
  payload/src/modules/generation/adapters/registry.ts \
  payload/dist/modules/generation/routes.js \
  payload/dist/modules/generation/adapters/registry.js
do
  [ -f "$SRC/$file" ] || fail "package missing $file"
done

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/src/modules/generation/adapters" "$BACKUP_DIR/dist/modules/generation/adapters"
run_sudo cp -p "$APP_DIR/src/modules/generation/routes.ts" "$BACKUP_DIR/src/modules/generation/routes.ts"
run_sudo cp -p "$APP_DIR/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/src/modules/generation/adapters/registry.ts"
run_sudo cp -p "$APP_DIR/dist/modules/generation/routes.js" "$BACKUP_DIR/dist/modules/generation/routes.js"
run_sudo cp -p "$APP_DIR/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/dist/modules/generation/adapters/registry.js"

log "install generation route and adapter files"
run_sudo install -m 0644 "$SRC/payload/src/modules/generation/routes.ts" "$APP_DIR/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$SRC/payload/src/modules/generation/adapters/registry.ts" "$APP_DIR/src/modules/generation/adapters/registry.ts"
run_sudo install -m 0644 "$SRC/payload/dist/modules/generation/routes.js" "$APP_DIR/dist/modules/generation/routes.js"
run_sudo install -m 0644 "$SRC/payload/dist/modules/generation/adapters/registry.js" "$APP_DIR/dist/modules/generation/adapters/registry.js"

log "verify GPT2 plus/max route and size markers"
node --check "$APP_DIR/dist/modules/generation/routes.js" >/dev/null
node --check "$APP_DIR/dist/modules/generation/adapters/registry.js" >/dev/null
node - "$APP_DIR/dist/modules/generation/routes.js" "$APP_DIR/dist/modules/generation/adapters/registry.js" <<'NODE'
const fs = require('fs');
const [routesFile, registryFile] = process.argv.slice(2);
const routes = fs.readFileSync(routesFile, 'utf8');
const registry = fs.readFileSync(registryFile, 'utf8');

const routeStart = routes.indexOf('function isAiyunzhiGptImage2Hint');
const routeEnd = routes.indexOf('function isLegacyAiyunzhiGptImage2LowPriceHint', routeStart);
if (routeStart < 0 || routeEnd < 0) throw new Error('Aiyunzhi route block not found');
const routeBlock = routes.slice(routeStart, routeEnd);
for (const marker of ['gpt-image-2-max', 'gpt-image-2-plus', 'model_gtp-2-max', 'model_gpt-2-plus', 'gpt 2 优化plus']) {
  if (routeBlock.includes(marker)) throw new Error(`plus/max route marker must not be in Aiyunzhi block: ${marker}`);
}

const helperStart = registry.indexOf('function shouldUseGptImage2VariantSizeToken');
const helperEnd = registry.indexOf('function resolveOpenAiImageSize', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('GPT2 variant size helper not found');
const helperBlock = registry.slice(helperStart, helperEnd);
for (const marker of ['gpt-image-2-max', 'gpt-image-2-plus', 'model_gtp-2-max', 'model_gpt-2-plus']) {
  if (!helperBlock.includes(marker)) throw new Error(`missing GPT2 variant marker ${marker}`);
}
if (!registry.includes('shouldUseGptImage2VariantSizeToken(ctx) ? resolveOpenAiImageResolution(params).toLowerCase()')) {
  throw new Error('GPT2 variant size token branch missing');
}
if (!registry.includes('openAiImageGeometryOptions(ctx.params, ctx)')) {
  throw new Error('openAI geometry call sites did not receive context');
}
console.log('[verify] GPT2 plus/max restored to openai-edits with size token branch');
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
