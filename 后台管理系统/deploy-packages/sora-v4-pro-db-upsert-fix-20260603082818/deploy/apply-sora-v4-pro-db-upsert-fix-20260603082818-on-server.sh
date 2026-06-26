#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-v4-pro-db-upsert-fix-20260603082818"
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
  run_sudo mkdir -p "$MIRROR_ROOT/$(dirname "$rel")"
  install_to "$rel" "$MIRROR_ROOT/$rel"
}

install_mirror(){
  local rel="$1"
  run_sudo mkdir -p "$MIRROR_ROOT/$(dirname "$rel")"
  install_to "$rel" "$MIRROR_ROOT/$rel"
}

install_api(){
  local rel="$1"
  local api_rel="${rel#api-server/}"
  install_to "$rel" "$BACKEND_DIR/api-server/$api_rel"
}

TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${TS}}"
run_sudo mkdir -p "$BACKUP_DIR"

log "install canvas/static files"
install_canvas "tools/workbench-web/image-studio-canvas-next.html"
install_canvas "tools/workbench-web/model-registry.json"
install_canvas "tools/workbench-web/models/sora-v4-pro.json"
install_mirror "tools/image_studio_backend.py"
install_mirror "smart-vision/config/model-registry.json"
install_mirror "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
install_mirror "smart-vision/canvas/legacy-workbench/workbench-web/models/sora-v4-pro.json"

log "install api-server source"
install_api "api-server/src/modules/generation/adapters/registry.ts"
install_api "api-server/src/modules/models/routes.ts"
install_api "api-server/src/modules/workbench-compat/routes.ts"
install_api "api-server/src/sync-canvas-models.ts"

API_DIR="$BACKEND_DIR/api-server"
log "build api-server"
if command -v npm >/dev/null 2>&1; then
  run_sudo bash -lc "cd '$API_DIR' && npm run build"
elif command -v node >/dev/null 2>&1 && [ -f "$API_DIR/node_modules/typescript/bin/tsc" ]; then
  run_sudo bash -lc "cd '$API_DIR' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  fail "npm or node+typescript not found; cannot build api-server"
fi

log "upsert sora-v4-pro model row into database"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';
import { SORA_PRO_VIDEO_PRICING, videoPricingDefaults } from './dist/pricing.js';

const providerId = 'canvas-provider-sora-v4-pro';
const modelId = 'canvas-sora-v4-pro';
const providerKey = 'canvas_sora-v4-pro';
const apiKey = 'sk-TSWKjpNDDP3GKlVhFRIspq8cB6dVYf8XhNwHKM4Z8OQBOsnn';
const capabilities = {
  resolutions: ['480p', '720p'],
  durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  defaultDuration: 15,
  defaultResolution: '720p',
  aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  maxImages: { full: 4, smartMultiFrame: 4, firstLast: 2 },
  maxVideos: 3,
  maxAudios: 3,
  maxVideoDurationSeconds: 15,
  maxAudioDurationSeconds: 14.9,
  supportsAudio: true,
  supportsVideo: true,
};
const protocol = {
  adapter: 'notevideo',
  method: 'async-poll',
  endpointPath: '/videos',
  statusEndpointPath: '/videos/{taskId}',
  uploadMode: 'object_storage',
};
const defaults = videoPricingDefaults(SORA_PRO_VIDEO_PRICING);

await prisma.upstreamProvider.upsert({
  where: { id: providerId },
  update: {
    providerKey,
    name: '画布渠道 sora-v4-pro',
    type: 'VIDEO',
    adapter: 'notevideo',
    baseUrl: 'https://hxzdq.aiflow321.cn/v1',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'sora-v3-pro',
    apiKeyEncrypted: encryptSecret(apiKey),
    status: 'ACTIVE',
  },
  create: {
    id: providerId,
    providerKey,
    name: '画布渠道 sora-v4-pro',
    type: 'VIDEO',
    adapter: 'notevideo',
    baseUrl: 'https://hxzdq.aiflow321.cn/v1',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'sora-v3-pro',
    apiKeyEncrypted: encryptSecret(apiKey),
    status: 'ACTIVE',
  },
});

await prisma.aiModel.upsert({
  where: { id: modelId },
  update: {
    providerId,
    name: 'sora-v3-pro',
    displayName: 'sora-v4-pro',
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(SORA_PRO_VIDEO_PRICING.costCreditsPerSecond),
    pricePerSecond: SORA_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
    adapter: 'notevideo',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    protocol,
    supports: {},
    defaults,
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui: { label: 'sora-v4-pro', badge: 'V4-PRO', badgeColor: '#38bdf8' },
    status: 'ACTIVE',
  },
  create: {
    id: modelId,
    providerId,
    name: 'sora-v3-pro',
    displayName: 'sora-v4-pro',
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(SORA_PRO_VIDEO_PRICING.costCreditsPerSecond),
    pricePerSecond: SORA_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
    inputPriceUsdPer1m: 0,
    outputPriceUsdPer1m: 0,
    cnyPerUsdCost: 0,
    creditsPerUsdCost: 0,
    markupRate: 1,
    adapter: 'notevideo',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    protocol,
    supports: {},
    defaults,
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui: { label: 'sora-v4-pro', badge: 'V4-PRO', badgeColor: '#38bdf8' },
    status: 'ACTIVE',
  },
});

const row = await prisma.aiModel.findUnique({
  where: { id: modelId },
  include: { provider: true },
});
console.log(JSON.stringify({
  id: row?.id,
  displayName: row?.displayName,
  model: row?.name,
  status: row?.status,
  providerStatus: row?.provider?.status,
  providerKey: row?.provider?.providerKey,
  endpointPath: row?.endpointPath,
  baseUrl: row?.provider?.baseUrl,
}, null, 2));
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

log "verify api response contains model"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
const row = await prisma.aiModel.findUnique({ where: { id: 'canvas-sora-v4-pro' }, include: { provider: true } });
if (!row || row.status !== 'ACTIVE' || row.provider?.status !== 'ACTIVE') {
  throw new Error('canvas-sora-v4-pro is missing or inactive');
}
console.log('canvas-sora-v4-pro active in DB');
await prisma.$disconnect();
NODE

log "done"
echo "backup: $BACKUP_DIR"
echo "model: canvas-sora-v4-pro"
echo "Refresh admin model page and hard-refresh canvas page after deploy."
