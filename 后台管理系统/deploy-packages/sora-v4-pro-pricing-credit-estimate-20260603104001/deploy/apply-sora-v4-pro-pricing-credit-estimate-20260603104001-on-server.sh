#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v4-pro-pricing-credit-estimate-20260603104001"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
BACKEND_DIR="${BACKEND_DIR:-${ADMIN_ROOT:-}}"
PM2_USER="${PM2_USER:-ubuntu}"
PM2_APP="${PM2_APP:-ai-admin-api}"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$BACKEND_DIR" ]; then
  for candidate in \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      BACKEND_DIR="$candidate"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -n "$BACKEND_DIR" ] || fail "BACKEND_DIR not found; set BACKEND_DIR=/path/to/admin platform"
[ -d "$BACKEND_DIR/api-server" ] || fail "api-server not found: $BACKEND_DIR/api-server"

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

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword -xzf "$ARCHIVE" -C "$WORK_DIR"
PKG_ROOT="$WORK_DIR/$PKG"
[ -d "$PKG_ROOT" ] || PKG_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  [ -f "$PKG_ROOT/$rel" ] || fail "$rel not found in package"
  printf '%s\n' "$PKG_ROOT/$rel"
}

backup_one(){
  local dest="$1"
  local name
  name="$(printf '%s' "$dest" | sed 's#[/: ]#_#g')"
  if [ -f "$dest" ]; then
    run_sudo cp -p "$dest" "$BACKUP_DIR/$name.bak"
  fi
}

install_to(){
  local rel="$1"
  local dest="$2"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

install_canvas(){
  local rel="$1"
  local web_rel="${rel#tools/}"
  install_to "$rel" "$WEB_ROOT/$web_rel"
  if [ -d "$MIRROR_ROOT" ]; then
    install_to "$rel" "$MIRROR_ROOT/$rel"
  else
    log "mirror root missing, skip $rel"
  fi
}

install_api(){
  local rel="$1"
  local api_rel="${rel#api-server/}"
  install_to "$rel" "$BACKEND_DIR/api-server/$api_rel"
}

run_api_script(){
  local src_script="$1"
  local dist_script="$2"
  local label="$3"
  local env_prefix="${4:-}"
  local api_dir="$BACKEND_DIR/api-server"
  log "$label"
  if command -v npm >/dev/null 2>&1; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix npm run $src_script"
  elif command -v node >/dev/null 2>&1 && [ -f "$api_dir/node_modules/tsx/dist/cli.mjs" ]; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix node node_modules/tsx/dist/cli.mjs src/$dist_script.ts"
  elif command -v node >/dev/null 2>&1 && [ -f "$api_dir/dist/$dist_script.js" ]; then
    run_sudo bash -lc "cd '$api_dir' && $env_prefix node dist/$dist_script.js"
  else
    fail "npm or node runtime not found; cannot run $label"
  fi
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$WEB_ROOT/backups/${PKG}-${TS}}"
run_sudo mkdir -p "$BACKUP_DIR"

log "install canvas/static files"
install_canvas "tools/workbench-web/image-studio-canvas-next.html"
install_canvas "tools/workbench-web/models/sora-v4-pro.json"

log "install api-server source/dist files"
install_api "api-server/src/pricing.ts"
install_api "api-server/src/apply-pricing.ts"
install_api "api-server/src/sync-canvas-models.ts"
install_api "api-server/src/modules/models/routes.ts"
install_api "api-server/src/modules/workbench-compat/routes.ts"
install_api "api-server/dist/pricing.js"
install_api "api-server/dist/apply-pricing.js"
install_api "api-server/dist/sync-canvas-models.js"
install_api "api-server/dist/modules/models/routes.js"
install_api "api-server/dist/modules/workbench-compat/routes.js"

API_DIR="$BACKEND_DIR/api-server"
log "build api-server"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/typescript/bin/tsc" ]; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "node/typescript not found, using packaged dist files"
fi

run_api_script "sync:canvas-models" "sync-canvas-models" "sync canvas model config into database" "CANVAS_MODELS_DIR='$MIRROR_ROOT/tools/workbench-web/models'"
run_api_script "pricing:apply" "apply-pricing" "apply pricing into database"

log "upsert and activate sora-v4-pro model row"
run_sudo env CANVAS_MODELS_DIR="$MIRROR_ROOT/tools/workbench-web/models" bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import { readFile } from 'node:fs/promises';
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';
import { SORA_V4_PRO_VIDEO_PRICING, videoPricingDefaults } from './dist/pricing.js';

const providerId = 'canvas-provider-sora-v4-pro';
const modelId = 'canvas-sora-v4-pro';
const providerKey = 'canvas_sora-v4-pro';
const modelsDir = process.env.CANVAS_MODELS_DIR || '';
const configPath = `${modelsDir.replace(/\/+$/, '')}/sora-v4-pro.json`;
const config = JSON.parse(await readFile(configPath, 'utf8'));
const protocol = {
  adapter: String(config.protocol?.adapter || config.adapter || 'notevideo'),
  method: String(config.protocol?.method || 'async-poll'),
  endpointPath: String(config.protocol?.endpointPath || config.endpointPath || '/videos'),
  statusEndpointPath: String(config.protocol?.statusEndpointPath || '/videos/{taskId}'),
  uploadMode: String(config.protocol?.uploadMode || 'object_storage'),
};
const baseUrl = String(config.baseUrl || 'https://hxzdq.aiflow321.cn/v1').replace(/\/+$/, '');
const apiKey = String(config.key || config.apiKey || 'replace-me');
const capabilities = config.capabilities || {};
const defaults = videoPricingDefaults(SORA_V4_PRO_VIDEO_PRICING);

await prisma.upstreamProvider.upsert({
  where: { id: providerId },
  update: {
    providerKey,
    name: '画布渠道 sora-v4-pro',
    type: 'VIDEO',
    adapter: protocol.adapter,
    baseUrl,
    endpointPath: protocol.endpointPath,
    statusEndpointPath: protocol.statusEndpointPath,
    uploadMode: protocol.uploadMode,
    requestMethod: protocol.method,
    defaultModel: String(config.model || 'sora-v3-pro'),
    apiKeyEncrypted: encryptSecret(apiKey),
    status: 'ACTIVE',
  },
  create: {
    id: providerId,
    providerKey,
    name: '画布渠道 sora-v4-pro',
    type: 'VIDEO',
    adapter: protocol.adapter,
    baseUrl,
    endpointPath: protocol.endpointPath,
    statusEndpointPath: protocol.statusEndpointPath,
    uploadMode: protocol.uploadMode,
    requestMethod: protocol.method,
    defaultModel: String(config.model || 'sora-v3-pro'),
    apiKeyEncrypted: encryptSecret(apiKey),
    status: 'ACTIVE',
  },
});

await prisma.aiModel.upsert({
  where: { id: modelId },
  update: {
    providerId,
    name: String(config.model || 'sora-v3-pro'),
    displayName: String(config.modelNick || config.displayName || config.id || 'sora-v4-pro'),
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(SORA_V4_PRO_VIDEO_PRICING.costCreditsPerSecond),
    pricePerSecond: SORA_V4_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
    adapter: protocol.adapter,
    endpointPath: protocol.endpointPath,
    statusEndpointPath: protocol.statusEndpointPath,
    uploadMode: protocol.uploadMode,
    protocol,
    supports: {},
    defaults,
    capabilities,
    modelAssembly: config.modelAssembly || { type: 'passthrough' },
    ui: config.ui || { label: 'sora-v4-pro', badge: 'V4-PRO', badgeColor: '#38bdf8' },
    status: 'ACTIVE',
  },
  create: {
    id: modelId,
    providerId,
    name: String(config.model || 'sora-v3-pro'),
    displayName: String(config.modelNick || config.displayName || config.id || 'sora-v4-pro'),
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(SORA_V4_PRO_VIDEO_PRICING.costCreditsPerSecond),
    pricePerSecond: SORA_V4_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
    inputPriceUsdPer1m: 0,
    outputPriceUsdPer1m: 0,
    cnyPerUsdCost: 0,
    creditsPerUsdCost: 0,
    markupRate: 1,
    adapter: protocol.adapter,
    endpointPath: protocol.endpointPath,
    statusEndpointPath: protocol.statusEndpointPath,
    uploadMode: protocol.uploadMode,
    protocol,
    supports: {},
    defaults,
    capabilities,
    modelAssembly: config.modelAssembly || { type: 'passthrough' },
    ui: config.ui || { label: 'sora-v4-pro', badge: 'V4-PRO', badgeColor: '#38bdf8' },
    status: 'ACTIVE',
  },
});

await prisma.$disconnect();
NODE

log "verify sora-v4-pro database row"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';

const rows = await prisma.aiModel.findMany({
  where: {
    type: 'VIDEO',
    OR: [
      { id: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { modelKey: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { name: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { displayName: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'sora-v4-pro', mode: 'insensitive' } } },
    ],
  },
  include: { provider: true },
});

const active = rows.find(row => row.status === 'ACTIVE' && row.provider?.status === 'ACTIVE' && Number(row.pricePerSecond) === 48);
console.log(JSON.stringify(rows.map(row => ({
  id: row.id,
  displayName: row.displayName,
  model: row.name,
  status: row.status,
  providerStatus: row.provider?.status,
  providerKey: row.provider?.providerKey,
  pricePerSecond: Number(row.pricePerSecond),
})), null, 2));
if (!active) {
  throw new Error('sora-v4-pro ACTIVE model with ACTIVE provider and pricePerSecond=48 not found');
}
await prisma.$disconnect();
NODE

log "restart api service"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env || pm2 restart all --update-env || true
  pm2 save || true
elif command -v sudo >/dev/null 2>&1 && id "$PM2_USER" >/dev/null 2>&1; then
  sudo -iu "$PM2_USER" bash -lc "pm2 restart '$PM2_APP' --update-env || pm2 restart all --update-env; pm2 save || true" || true
else
  log "pm2 not found, skip restart"
fi

log "verify file markers"
grep -Fq "credit-estimate-pill" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "renderCreditEstimatePill" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
grep -Fq "chargedCreditsPerSecond\": 48" "$WEB_ROOT/workbench-web/models/sora-v4-pro.json"
grep -Fq "SORA_V4_PRO_VIDEO_PRICING" "$API_DIR/src/pricing.ts"
grep -Fq "soraV4ProVideoModelWhere" "$API_DIR/src/apply-pricing.ts"
grep -Fq "key.includes('sora-v4-pro')" "$API_DIR/src/sync-canvas-models.ts"
grep -Fq "inputPriceUsdPer1m" "$API_DIR/src/modules/models/routes.ts"
grep -Fq "inputPriceUsdPer1m" "$API_DIR/src/modules/workbench-compat/routes.ts"

log "done"
echo "backup: $BACKUP_DIR"
echo "model: canvas-sora-v4-pro"
echo "Hard-refresh the canvas page after deploy."
