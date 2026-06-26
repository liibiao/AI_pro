#!/usr/bin/env bash
set -euo pipefail

PKG="gpt2-max-plus-aiyunzhi-protocol-fix-20260626050220"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
API_DIR="${API_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
APP_ROOT="${APP_ROOT:-/home/ubuntu/漫剧创作库}"
PUBLIC_ROOT="${PUBLIC_ROOT:-/var/www/ai-admin/workbench-web}"
TOOLS_ROOT="${TOOLS_ROOT:-$APP_ROOT/tools/workbench-web}"
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
run_sudo test -d "$API_DIR" || fail "api dir not found: $API_DIR"
run_sudo test -d "$PUBLIC_ROOT" || fail "public workbench dir not found: $PUBLIC_ROOT"
run_sudo test -d "$TOOLS_ROOT" || fail "tools workbench dir not found: $TOOLS_ROOT"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC="$WORK_DIR/$PKG"

for file in \
  payload/api-server/src/modules/generation/routes.ts \
  payload/api-server/dist/modules/generation/routes.js \
  workbench-web/image-studio-canvas-next.html \
  workbench-web/canvas-next/generation-service.js \
  tools/workbench-web/image-studio-canvas-next.html \
  tools/workbench-web/canvas-next/generation-service.js
do
  [ -f "$SRC/$file" ] || fail "package missing $file"
done

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation" \
  "$BACKUP_DIR/public/canvas-next" \
  "$BACKUP_DIR/tools/canvas-next"

run_sudo cp -p "$API_DIR/src/modules/generation/routes.ts" "$BACKUP_DIR/api-server/src/modules/generation/routes.ts"
run_sudo cp -p "$API_DIR/dist/modules/generation/routes.js" "$BACKUP_DIR/api-server/dist/modules/generation/routes.js"
[ -f "$PUBLIC_ROOT/image-studio-canvas-next.html" ] && run_sudo cp -p "$PUBLIC_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/public/image-studio-canvas-next.html"
[ -f "$PUBLIC_ROOT/canvas-next/generation-service.js" ] && run_sudo cp -p "$PUBLIC_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/public/canvas-next/generation-service.js"
[ -f "$TOOLS_ROOT/image-studio-canvas-next.html" ] && run_sudo cp -p "$TOOLS_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/tools/image-studio-canvas-next.html"
[ -f "$TOOLS_ROOT/canvas-next/generation-service.js" ] && run_sudo cp -p "$TOOLS_ROOT/canvas-next/generation-service.js" "$BACKUP_DIR/tools/canvas-next/generation-service.js"

log "install API route and canvas files"
run_sudo install -m 0644 "$SRC/payload/api-server/src/modules/generation/routes.ts" "$API_DIR/src/modules/generation/routes.ts"
run_sudo install -m 0644 "$SRC/payload/api-server/dist/modules/generation/routes.js" "$API_DIR/dist/modules/generation/routes.js"
run_sudo install -d "$PUBLIC_ROOT/canvas-next" "$TOOLS_ROOT/canvas-next"
run_sudo install -m 0644 "$SRC/workbench-web/image-studio-canvas-next.html" "$PUBLIC_ROOT/image-studio-canvas-next.html"
run_sudo install -m 0644 "$SRC/workbench-web/canvas-next/generation-service.js" "$PUBLIC_ROOT/canvas-next/generation-service.js"
run_sudo install -m 0644 "$SRC/tools/workbench-web/image-studio-canvas-next.html" "$TOOLS_ROOT/image-studio-canvas-next.html"
run_sudo install -m 0644 "$SRC/tools/workbench-web/canvas-next/generation-service.js" "$TOOLS_ROOT/canvas-next/generation-service.js"

log "verify GPT2 low/max/plus protocol routing"
node --check "$API_DIR/dist/modules/generation/routes.js" >/dev/null
node --check "$PUBLIC_ROOT/canvas-next/generation-service.js" >/dev/null
node - "$API_DIR/dist/modules/generation/routes.js" "$PUBLIC_ROOT/canvas-next/generation-service.js" "$PUBLIC_ROOT/image-studio-canvas-next.html" <<'NODE'
const fs = require('fs');
const vm = require('vm');
const [routesFile, serviceFile, htmlFile] = process.argv.slice(2);
const routes = fs.readFileSync(routesFile, 'utf8');
const service = fs.readFileSync(serviceFile, 'utf8');
const html = fs.readFileSync(htmlFile, 'utf8');

const routeStart = routes.indexOf('function isAiyunzhiGptImage2Hint');
const routeLegacy = routes.indexOf('function isLegacyAiyunzhiGptImage2LowPriceHint', routeStart);
const routeEnd = routes.indexOf('function resolveUpstreamTimeoutMs', routeLegacy);
if (routeStart < 0 || routeLegacy < 0 || routeEnd < 0) throw new Error('Aiyunzhi route blocks not found');
const routeSandbox = {};
vm.runInNewContext(`${routes.slice(routeStart, routeEnd)}
result = {
  max: isAiyunzhiGptImage2Hint('gpt-image-2-max','model_gtp-2-max_mqsufujl','openai-edits'),
  plus: isAiyunzhiGptImage2Hint('gpt-image-2-plus','model_gpt-2-plus GPT 2 优化plus','openai-edits'),
  low: isAiyunzhiGptImage2Hint('gpt-image-2','canvas_aiyunzhi-gpt-image-2-api GPT 2 低价','openai-edits'),
  pro: isAiyunzhiGptImage2Hint('gpt-image-2-pro','canvas-gpt-image-2-pro GPT 2 Pro 官转','openai-edits')
};`, routeSandbox);
if (!routeSandbox.result.max || !routeSandbox.result.plus || !routeSandbox.result.low || routeSandbox.result.pro) {
  throw new Error(`bad backend route result: ${JSON.stringify(routeSandbox.result)}`);
}

const serviceStart = service.indexOf('function isAiyunzhiFireflyGptImageAdapter');
const serviceEnd = service.indexOf('function imageRequestGeometry', serviceStart);
if (serviceStart < 0 || serviceEnd < 0) throw new Error('generation-service Aiyunzhi block not found');
const serviceSandbox = {};
vm.runInNewContext(`${service.slice(serviceStart, serviceEnd)}
const maxModel = {model:'gpt-image-2-max', modelKey:'model_gtp-2-max_mqsufujl', protocol:{adapter:'openai-edits'}, provider:{defaultModel:'gpt-image-2-max'}};
const plusModel = {model:'gpt-image-2-plus', modelKey:'model_gpt-2-plus', displayName:'GPT 2 优化plus', protocol:{adapter:'openai-edits'}, provider:{defaultModel:'gpt-image-2-plus'}};
result = {
  max: forceAiyunzhiGptImage2ModelConfig(maxModel),
  plus: forceAiyunzhiGptImage2ModelConfig(plusModel)
};`, serviceSandbox);
if (serviceSandbox.result.max.adapter !== 'aiyunzhi-gpt-image-2' || serviceSandbox.result.plus.protocol.adapter !== 'aiyunzhi-gpt-image-2') {
  throw new Error('frontend service did not force Aiyunzhi adapter');
}
if (serviceSandbox.result.max.model !== 'gpt-image-2-max' || serviceSandbox.result.plus.model !== 'gpt-image-2-plus') {
  throw new Error('frontend service did not preserve max/plus model names');
}

for (const marker of ['isAiyunzhiGptImage2SiblingModel', 'aiyunzhiGptImage2ConfiguredModelName', 'gpt-image-2-max', 'gpt-image-2-plus']) {
  if (!html.includes(marker)) throw new Error(`html missing marker ${marker}`);
}
console.log('[verify] GPT2 low/max/plus use Aiyunzhi GPT Image 2 protocol; max/plus model names preserved');
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
echo "canvas: http://124.156.137.236/image-studio-canvas-next.html?v=$STAMP"
