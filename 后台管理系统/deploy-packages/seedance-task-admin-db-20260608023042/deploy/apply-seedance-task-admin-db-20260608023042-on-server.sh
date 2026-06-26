#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance-task-admin-db-20260608023042"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
API_DIR="${API_DIR:-$APP_DIR/api-server}"
ADMIN_WEB_DIR="${ADMIN_WEB_DIR:-$APP_DIR/admin-web}"
PM2_APP="${PM2_APP:-ai-admin-api}"
PM2_USER="${PM2_USER:-ubuntu}"
STAMP="$(date +%Y%m%d%H%M%S)"

log(){ printf '[deploy] %s\n' "$*"; }
fail(){ printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){ if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi; }
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

if [ ! -d "$API_DIR" ]; then
  for candidate in \
    "$REMOTE_ROOT/ai-admin-platform" \
    "/var/www/ai-admin/ai-admin-platform" \
    "/home/ubuntu/后台管理系统" \
    "/home/ubuntu/ai-admin-platform" \
    "/var/www/ai-admin-platform"; do
    if [ -d "$candidate/api-server" ]; then
      APP_DIR="$candidate"
      API_DIR="$APP_DIR/api-server"
      ADMIN_WEB_DIR="$APP_DIR/admin-web"
      break
    fi
  done
fi

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
[ -d "$API_DIR" ] || fail "api-server not found: $API_DIR"
[ -d "$ADMIN_WEB_DIR" ] || fail "admin-web not found: $ADMIN_WEB_DIR"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$(find "$WORK_DIR" -mindepth 1 -maxdepth 2 -type d -name "$PKG" | head -1 || true)"
[ -n "${SRC_ROOT:-}" ] && [ -d "$SRC_ROOT" ] || fail "package root not found"

API_SRC="$SRC_ROOT/ai-admin-platform/api-server"
ADMIN_SRC="$SRC_ROOT/ai-admin-platform/admin-web"
[ -d "$API_SRC" ] || fail "package missing api-server"
[ -d "$ADMIN_SRC/dist" ] || fail "package missing admin-web/dist"

log "verify package markers"
grep -Fq "'seedance-task': { submit: submitSeedanceTaskVideo" "$API_SRC/src/modules/generation/adapters/registry.ts"
grep -Fq "function submitSeedanceTaskVideo" "$API_SRC/dist/modules/generation/adapters/registry.js"
grep -Fq "doubao-seedance-2-0" "$API_SRC/dist/modules/generation/routes.js"
grep -Fq "seedance-task" "$API_SRC/dist/modules/workbench-compat/routes.js"
grep -Fq "seedance-task" "$API_SRC/dist/sync-canvas-models.js"
grep -Fq "Seedance 2.0 Task" "$ADMIN_SRC/src/main.tsx"
grep -Rqs "Seedance 2.0 Task" "$ADMIN_SRC/dist/assets"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/api-server" "$BACKUP_DIR/ai-admin-platform/admin-web"
backup_one(){
  local dest="$1"
  local rel="${dest#$APP_DIR/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/ai-admin-platform/$rel"
  fi
}
install_file(){
  local rel="$1"
  local src="$SRC_ROOT/ai-admin-platform/$rel"
  local dest="$APP_DIR/$rel"
  [ -f "$src" ] || fail "package file missing: $rel"
  backup_one "$dest"
  run_sudo mkdir -p "$(dirname "$dest")"
  run_sudo cp -p "$src" "$dest"
  run_sudo chmod 0644 "$dest"
  log "installed $dest"
}

log "install api-server files"
install_file "api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/src/modules/generation/routes.ts"
install_file "api-server/dist/modules/generation/routes.js"
install_file "api-server/src/modules/workbench-compat/routes.ts"
install_file "api-server/dist/modules/workbench-compat/routes.js"
install_file "api-server/src/modules/models/routes.ts"
install_file "api-server/dist/modules/models/routes.js"
install_file "api-server/src/sync-canvas-models.ts"
install_file "api-server/dist/sync-canvas-models.js"

log "install admin-web files"
backup_one "$ADMIN_WEB_DIR/src/main.tsx"
run_sudo mkdir -p "$ADMIN_WEB_DIR/src"
run_sudo cp -p "$ADMIN_SRC/src/main.tsx" "$ADMIN_WEB_DIR/src/main.tsx"
run_sudo chmod 0644 "$ADMIN_WEB_DIR/src/main.tsx"
run_sudo mkdir -p "$BACKUP_DIR/ai-admin-platform/admin-web/dist"
run_sudo cp -a "$ADMIN_WEB_DIR/dist/." "$BACKUP_DIR/ai-admin-platform/admin-web/dist/" 2>/dev/null || true
run_sudo rm -rf "$ADMIN_WEB_DIR/dist"
run_sudo mkdir -p "$ADMIN_WEB_DIR/dist"
run_sudo cp -a "$ADMIN_SRC/dist/." "$ADMIN_WEB_DIR/dist/"

log "verify installed markers"
run_sudo grep -Fq "'seedance-task': { submit: submitSeedanceTaskVideo" "$API_DIR/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "seedance-task" "$API_DIR/dist/modules/workbench-compat/routes.js"
run_sudo grep -Fq "Seedance 2.0 Task" "$ADMIN_WEB_DIR/src/main.tsx"
run_sudo grep -Rqs "Seedance 2.0 Task" "$ADMIN_WEB_DIR/dist/assets"

log "upsert Seedance 2.0 provider/model"
run_sudo bash -lc "cd '$API_DIR' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const providerId = 'canvas-provider-seedance-2-0';
const modelId = 'canvas-seedance-2-0';
const providerKey = 'aiid-seedance-task';
const modelKey = 'seedance-2-0';
const apiKeyPlaceholder = 'replace-with-aiid-api-key';
const apiKeyFromEnv = String(process.env.SEEDANCE_TASK_API_KEY || process.env.AIID_SEEDANCE_API_KEY || '').trim();
const baseUrl = String(process.env.SEEDANCE_TASK_BASE_URL || 'https://api.aiid.edu.kg').replace(/\/+$/, '');
const endpointPath = '/api/v3/contents/generations/tasks';
const statusEndpointPath = '/api/v3/contents/generations/tasks/{taskId}';
const pricing = {
  unit: 'second',
  currency: 'credits',
  creditsPerCny: 100,
  memberDiscountRate: 0.4,
  chargedCreditsPerSecond: 34,
  originalCreditsPerSecond: 85,
  costCreditsPerSecond: 23.8,
  resolutionTiers: [
    { resolution: '720p', chargedCreditsPerSecond: 34, originalCreditsPerSecond: 85, costCreditsPerSecond: 23.8 },
    { resolution: '1080p', chargedCreditsPerSecond: 54, originalCreditsPerSecond: 135, costCreditsPerSecond: 37.8 },
  ],
};
const capabilities = {
  resolutions: ['720p', '1080p'],
  durations: [4, 5, 6, 8, 10],
  defaultDuration: 5,
  defaultResolution: '720p',
  aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
  maxVideos: 1,
  maxAudios: 1,
  maxVideoDurationSeconds: 15,
  maxAudioDurationSeconds: 15,
  supportsAudio: true,
  supportsVideo: true,
};
const protocol = {
  adapter: 'seedance-task',
  method: 'async-poll',
  endpointPath,
  statusEndpointPath,
  uploadMode: 'object_storage',
  responseType: 'provider_url',
  response_type: 'provider_url',
};
const supports = {
  txt2video: true,
  img2video: true,
  referenceVideo: true,
  referenceAudio: true,
};

const existingProvider = await prisma.upstreamProvider.findUnique({ where: { id: providerId } });
const existingByKey = existingProvider ? null : await prisma.upstreamProvider.findUnique({ where: { providerKey } });
const preservedProvider = existingProvider || existingByKey;
const providerWhereId = preservedProvider?.id || providerId;
const apiKeyEncrypted = apiKeyFromEnv
  ? encryptSecret(apiKeyFromEnv)
  : (preservedProvider?.apiKeyEncrypted || encryptSecret(apiKeyPlaceholder));

await prisma.upstreamProvider.upsert({
  where: { id: providerWhereId },
  update: {
    providerKey,
    name: 'AIID Seedance 2.0 Task',
    type: 'VIDEO',
    adapter: 'seedance-task',
    baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'doubao-seedance-2-0-260128',
    defaultParams: { preset: 'aiid_seedance_task', responseType: 'provider_url', response_type: 'provider_url' },
    apiKeyEncrypted,
    timeoutMs: Math.max(Number(preservedProvider?.timeoutMs || 0), 900000),
    weight: preservedProvider?.weight || 100,
    concurrencyLimit: preservedProvider?.concurrencyLimit || 0,
    failureThreshold: preservedProvider?.failureThreshold || 5,
    status: preservedProvider?.status || 'ACTIVE',
  },
  create: {
    id: providerWhereId,
    providerKey,
    name: 'AIID Seedance 2.0 Task',
    type: 'VIDEO',
    adapter: 'seedance-task',
    baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'doubao-seedance-2-0-260128',
    defaultParams: { preset: 'aiid_seedance_task', responseType: 'provider_url', response_type: 'provider_url' },
    apiKeyEncrypted,
    timeoutMs: 900000,
    status: 'ACTIVE',
  },
});

const provider = await prisma.upstreamProvider.findUniqueOrThrow({ where: { id: providerWhereId } });
const modelData = {
  providerId: provider.id,
  modelKey,
  name: 'doubao-seedance-2-0-260128',
  displayName: 'Seedance 2.0',
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
  adapter: 'seedance-task',
  endpointPath,
  statusEndpointPath,
  uploadMode: 'object_storage',
  protocol,
  supports,
  defaults: { pricing, mode: 'reference_material', size: '1280x720', responseType: 'provider_url', response_type: 'provider_url' },
  capabilities,
  modelAssembly: { type: 'passthrough' },
  ui: { label: 'Seedance 2.0', badge: 'SD 2.0', badgeColor: '#0ea5e9' },
  status: 'ACTIVE',
};

await prisma.aiModel.upsert({
  where: { id: modelId },
  update: modelData,
  create: { id: modelId, ...modelData },
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
  statusEndpointPath: row?.statusEndpointPath || row?.provider.statusEndpointPath,
}, null, 2));

await prisma.$disconnect();
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
