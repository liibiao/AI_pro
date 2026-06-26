#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="sora-video-pro-admin-db-20260607003828"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
WEB_ROOT="${WEB_ROOT:-/var/www/ai-admin}"
BACKEND_DIR="${BACKEND_DIR:-${ADMIN_ROOT:-}}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if [ -z "$BACKEND_DIR" ]; then
  for candidate in \
    "$WEB_ROOT/ai-admin-platform" \
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
pm2_run(){
  if [ "$(id -u)" -eq 0 ] && id "$PM2_USER" >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  elif command -v pm2 >/dev/null 2>&1; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n -u "$PM2_USER" env PM2_HOME="/home/$PM2_USER/.pm2" pm2 "$@"
  else
    return 127
  fi
}

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$MIRROR_ROOT/.deploy-backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
PKG_ROOT="$WORK_DIR/$PKG"
[ -d "$PKG_ROOT" ] || PKG_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  [ -f "$PKG_ROOT/$rel" ] || fail "$rel not found in package"
  printf '%s\n' "$PKG_ROOT/$rel"
}
backup_one(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_api(){
  local rel="$1"
  local dest="$BACKEND_DIR/$rel"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_one "$dest"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

log "verify package markers"
grep -Fq "'sora-video-pro': { submit: submitSoraVideoPro" "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "function submitSoraVideoPro" "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "video-pro-720p" "$PKG_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "extra_audios" "$PKG_ROOT/api-server/dist/modules/workbench-compat/routes.js"
grep -Fq "video-pro-720p" "$PKG_ROOT/api-server/dist/modules/models/routes.js"
grep -Fq "sora-video-pro" "$PKG_ROOT/api-server/dist/modules/generation/routes.js"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server files"
install_api "api-server/src/modules/generation/adapters/registry.ts"
install_api "api-server/dist/modules/generation/adapters/registry.js"
install_api "api-server/src/modules/generation/routes.ts"
install_api "api-server/dist/modules/generation/routes.js"
install_api "api-server/src/modules/workbench-compat/routes.ts"
install_api "api-server/dist/modules/workbench-compat/routes.js"
install_api "api-server/src/modules/models/routes.ts"
install_api "api-server/dist/modules/models/routes.js"
install_api "api-server/src/sync-canvas-models.ts"
install_api "api-server/dist/sync-canvas-models.js"

API_DIR="$BACKEND_DIR/api-server"
log "verify installed markers"
run_sudo grep -Fq "'sora-video-pro': { submit: submitSoraVideoPro" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "function submitSoraVideoPro" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "extra_audios" "$API_DIR/dist/modules/workbench-compat/routes.js"
run_sudo grep -Fq "video-pro-720p" "$API_DIR/dist/modules/models/routes.js"

log "upsert sora-video-pro provider/model"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const providerId = 'canvas-provider-sora-video-pro';
const modelId = 'canvas-sora-video-pro';
const providerKey = 'sora-video-pro';
const apiKeyPlaceholder = 'replace-with-sora-video-pro-api-key';
const apiKeyFromEnv = String(process.env.SORA_VIDEO_PRO_API_KEY || '').trim();
const baseUrl = String(process.env.SORA_VIDEO_PRO_BASE_URL || 'https://api.artifex.help/v1').replace(/\/+$/, '');
const pricing = {
  unit: 'second',
  currency: 'credits',
  creditsPerCny: 100,
  cnyPerSecond: 0.52,
  chargedCreditsPerSecond: 52,
  originalCreditsPerSecond: 130,
  costCreditsPerSecond: 36.4,
  grossMarginRate: 0.3,
};
const capabilities = {
  resolutions: ['720p'],
  durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  defaultDuration: 6,
  defaultResolution: '720p',
  aspectRatios: ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'],
  maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
  maxVideos: 3,
  maxAudios: 3,
  maxVideoDurationSeconds: 15,
  maxAudioDurationSeconds: 15,
  supportsAudio: true,
  supportsVideo: true,
  supportsLastFrame: false,
};
const protocol = {
  adapter: 'sora-video-pro',
  method: 'async-poll',
  endpointPath: '/videos',
  statusEndpointPath: '/videos/{taskId}',
  uploadMode: 'object_storage',
};
const supports = {
  txt2video: true,
  img2video: true,
  referenceVideo: true,
  referenceAudio: true,
};

const existingProvider = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
const existingByKey = existingProvider ? null : await prisma.upstreamProvider.findUnique({ where: { providerKey } });
const providerWhereId = existingProvider?.id || existingByKey?.id || providerId;
const preservedProvider = existingProvider || existingByKey;
const apiKeyEncrypted = apiKeyFromEnv
  ? encryptSecret(apiKeyFromEnv)
  : (preservedProvider?.apiKeyEncrypted || encryptSecret(apiKeyPlaceholder));

await prisma.upstreamProvider.upsert({
  where: { id: providerWhereId },
  update: {
    providerKey,
    name: 'sora-video-pro',
    type: 'VIDEO',
    adapter: 'sora-video-pro',
    baseUrl: preservedProvider?.baseUrl || baseUrl,
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'video-pro-720p',
    apiKeyEncrypted,
    timeoutMs: Math.max(Number(preservedProvider?.timeoutMs || 0), 900000),
    status: preservedProvider?.status || 'ACTIVE',
  },
  create: {
    id: providerWhereId,
    providerKey,
    name: 'sora-video-pro',
    type: 'VIDEO',
    adapter: 'sora-video-pro',
    baseUrl,
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'video-pro-720p',
    apiKeyEncrypted,
    timeoutMs: 900000,
    status: 'ACTIVE',
  },
});

const provider = await prisma.upstreamProvider.findUniqueOrThrow({ where: { id: providerWhereId } });
const modelData = {
  providerId: provider.id,
  modelKey: 'sora-video-pro',
  name: 'video-pro-720p',
  displayName: 'Sora Video Pro 720p',
  type: 'VIDEO',
  unit: 'second',
  salePrice: 0,
  costPrice: new Prisma.Decimal(pricing.costCreditsPerSecond),
  pricePerSecond: pricing.chargedCreditsPerSecond,
  inputPriceUsdPer1m: new Prisma.Decimal(0),
  outputPriceUsdPer1m: new Prisma.Decimal(0),
  cnyPerUsdCost: new Prisma.Decimal(0),
  creditsPerUsdCost: new Prisma.Decimal(0),
  markupRate: new Prisma.Decimal(1),
  adapter: 'sora-video-pro',
  endpointPath: '/videos',
  statusEndpointPath: '/videos/{taskId}',
  uploadMode: 'object_storage',
  protocol,
  supports,
  defaults: { pricing },
  capabilities,
  modelAssembly: { type: 'passthrough' },
  ui: { label: 'Sora Video Pro', badge: 'PRO 720', badgeColor: '#22c55e' },
  status: 'ACTIVE',
};

await prisma.aiModel.upsert({
  where: { id: modelId },
  update: modelData,
  create: {
    id: modelId,
    ...modelData,
  },
});

const row = await prisma.aiModel.findUnique({
  where: { id: modelId },
  include: { provider: true },
});
console.log(JSON.stringify({
  id: row?.id,
  modelKey: row?.modelKey,
  displayName: row?.displayName,
  model: row?.name,
  type: row?.type,
  status: row?.status,
  providerKey: row?.provider.providerKey,
  providerStatus: row?.provider.status,
  adapter: row?.adapter || row?.provider.adapter,
  baseUrl: row?.provider.baseUrl,
  endpointPath: row?.endpointPath || row?.provider.endpointPath,
}, null, 2));
NODE

log "restart pm2 app: $PM2_APP"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 app not found, skipped: $PM2_APP"
fi

log "done"
echo "backup: $BACKUP_DIR"
echo "Refresh admin model management and canvas model list."
