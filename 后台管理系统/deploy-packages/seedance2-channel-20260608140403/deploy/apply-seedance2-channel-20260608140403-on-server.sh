#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="seedance2-channel-20260608140403"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_DIR="${APP_DIR:-$REMOTE_ROOT/ai-admin-platform}"
WEB_ROOT="${WEB_ROOT:-$REMOTE_ROOT}"
MIRROR_ROOT="${MIRROR_ROOT:-/home/ubuntu/漫剧创作库}"
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

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$APP_DIR/api-server" || fail "api-server not found: $APP_DIR/api-server"

WORK_DIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="${BACKUP_DIR:-$REMOTE_ROOT/backups/${PKG}-${STAMP}}"
cleanup(){ rm -rf "$WORK_DIR"; }
trap cleanup EXIT

log "extract $ARCHIVE"
tar --warning=no-unknown-keyword --no-same-owner -xzf "$ARCHIVE" -C "$WORK_DIR"
SRC_ROOT="$WORK_DIR/$PKG"
[ -d "$SRC_ROOT" ] || SRC_ROOT="$WORK_DIR"

src_for(){
  local rel="$1"
  [ -f "$SRC_ROOT/$rel" ] || fail "$rel missing in package"
  printf '%s\n' "$SRC_ROOT/$rel"
}
backup_file(){
  local dest="$1"
  local rel="${dest#/}"
  if [ -f "$dest" ]; then
    run_sudo mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    run_sudo cp -p "$dest" "$BACKUP_DIR/$rel"
  fi
}
install_file(){
  local rel="$1"
  local dest="$2"
  local src
  src="$(src_for "$rel")"
  run_sudo mkdir -p "$(dirname "$dest")"
  backup_file "$dest"
  run_sudo install -m 0644 "$src" "$dest"
  log "installed $dest"
}
install_optional(){
  local rel="$1"
  local dest="$2"
  if [ -f "$SRC_ROOT/$rel" ]; then
    install_file "$rel" "$dest"
  fi
}

log "verify package markers"
grep -Fq "'seedance2': { submit: submitSeedance2Video" "$SRC_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "function submitSeedance2Video" "$SRC_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "video-fast-480p" "$SRC_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -Fq "seedance2" "$SRC_ROOT/api-server/dist/modules/generation/routes.js"
grep -Fq "seedance2" "$SRC_ROOT/api-server/dist/modules/models/routes.js"
grep -Fq "seedance2-fast-480p" "$SRC_ROOT/workbench-web/model-registry.json"
grep -Fq "Seedance 2.0 Pro 720p" "$SRC_ROOT/workbench-web/models/seedance2-pro-720p.json"

log "backup dir: $BACKUP_DIR"
run_sudo mkdir -p "$BACKUP_DIR"

log "install api-server files"
install_file "api-server/src/modules/generation/adapters/registry.ts" "$APP_DIR/api-server/src/modules/generation/adapters/registry.ts"
install_file "api-server/dist/modules/generation/adapters/registry.js" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
install_file "api-server/src/modules/generation/routes.ts" "$APP_DIR/api-server/src/modules/generation/routes.ts"
install_file "api-server/dist/modules/generation/routes.js" "$APP_DIR/api-server/dist/modules/generation/routes.js"
install_file "api-server/src/modules/models/routes.ts" "$APP_DIR/api-server/src/modules/models/routes.ts"
install_file "api-server/dist/modules/models/routes.js" "$APP_DIR/api-server/dist/modules/models/routes.js"
install_file "api-server/src/modules/workbench-compat/routes.ts" "$APP_DIR/api-server/src/modules/workbench-compat/routes.ts"
install_file "api-server/dist/modules/workbench-compat/routes.js" "$APP_DIR/api-server/dist/modules/workbench-compat/routes.js"
install_file "api-server/src/sync-canvas-models.ts" "$APP_DIR/api-server/src/sync-canvas-models.ts"
install_file "api-server/dist/sync-canvas-models.js" "$APP_DIR/api-server/dist/sync-canvas-models.js"

log "install public workbench files"
install_file "workbench-web/image-studio-canvas-next.html" "$WEB_ROOT/workbench-web/image-studio-canvas-next.html"
install_file "workbench-web/image-studio-canvas.html" "$WEB_ROOT/workbench-web/image-studio-canvas.html"
install_file "workbench-web/model-registry.json" "$WEB_ROOT/workbench-web/model-registry.json"
install_file "workbench-web/canvas-next/generation-service.js" "$WEB_ROOT/workbench-web/canvas-next/generation-service.js"
for model_file in seedance2-fast-480p.json seedance2-fast-720p.json seedance2-pro-480p.json seedance2-pro-720p.json; do
  install_file "workbench-web/models/$model_file" "$WEB_ROOT/workbench-web/models/$model_file"
done

if run_sudo test -d "$MIRROR_ROOT"; then
  log "install mirror files: $MIRROR_ROOT"
  install_file "workbench-web/image-studio-canvas-next.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas-next.html"
  install_file "workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/tools/workbench-web/image-studio-canvas.html"
  install_file "workbench-web/model-registry.json" "$MIRROR_ROOT/tools/workbench-web/model-registry.json"
  install_file "workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/tools/workbench-web/canvas-next/generation-service.js"
  for model_file in seedance2-fast-480p.json seedance2-fast-720p.json seedance2-pro-480p.json seedance2-pro-720p.json; do
    install_file "workbench-web/models/$model_file" "$MIRROR_ROOT/tools/workbench-web/models/$model_file"
  done
  install_file "tools/image_studio_backend.py" "$MIRROR_ROOT/tools/image_studio_backend.py"
  install_optional "smart-vision/config/model-registry.json" "$MIRROR_ROOT/smart-vision/config/model-registry.json"
  install_optional "smart-vision/services/workbench/image_studio_backend.py" "$MIRROR_ROOT/smart-vision/services/workbench/image_studio_backend.py"
  install_optional "smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/image-studio-canvas.html"
  install_optional "smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json"
  install_optional "smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/canvas-next/generation-service.js"
  for model_file in seedance2-fast-480p.json seedance2-fast-720p.json seedance2-pro-480p.json seedance2-pro-720p.json; do
    install_optional "smart-vision/canvas/legacy-workbench/workbench-web/models/$model_file" "$MIRROR_ROOT/smart-vision/canvas/legacy-workbench/workbench-web/models/$model_file"
  done
fi

log "build api-server if TypeScript is available"
if run_sudo bash -lc "cd '$APP_DIR/api-server' && command -v node >/dev/null 2>&1 && [ -f node_modules/typescript/bin/tsc ]"; then
  run_sudo bash -lc "cd '$APP_DIR/api-server' && node node_modules/typescript/bin/tsc -p tsconfig.json"
else
  log "api-server TypeScript toolchain not found; using packaged dist"
fi

log "upsert seedance2 provider and models"
run_sudo bash -lc "cd '$APP_DIR/api-server' && node --input-type=module" <<'NODE'
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const providerId = 'canvas-provider-seedance2';
const providerKey = 'seedance2';
const apiKeyPlaceholder = 'replace-with-seedance2-api-key';
const apiKeyFromEnv = String(process.env.SEEDANCE2_API_KEY || '').trim();
const baseUrl = String(process.env.SEEDANCE2_BASE_URL || 'https://api.artifex.help/v1').replace(/\/+$/, '');
const endpointPath = '/videos';
const statusEndpointPath = '/videos/{taskId}';
const protocol = {
  adapter: 'seedance2',
  method: 'async-poll',
  endpointPath,
  statusEndpointPath,
  uploadMode: 'object_storage',
};
const supports = {
  txt2video: true,
  img2video: true,
  referenceVideo: true,
  referenceAudio: true,
};
const aspectRatios = ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'];
const durations = Array.from({ length: 12 }, (_, index) => index + 4);
const modelRows = [
  { id: 'canvas-seedance2-fast-480p', modelKey: 'seedance2-fast-480p', name: 'video-fast-480p', displayName: 'Seedance 2.0 Fast 480p', resolution: '480p', cnyPerSecond: 0.27, credits: 27, badge: 'FAST 480', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-fast-720p', modelKey: 'seedance2-fast-720p', name: 'video-fast-720p', displayName: 'Seedance 2.0 Fast 720p', resolution: '720p', cnyPerSecond: 0.35, credits: 35, badge: 'FAST 720', badgeColor: '#0ea5e9' },
  { id: 'canvas-seedance2-pro-480p', modelKey: 'seedance2-pro-480p', name: 'video-pro-480p', displayName: 'Seedance 2.0 Pro 480p', resolution: '480p', cnyPerSecond: 0.35, credits: 35, badge: 'PRO 480', badgeColor: '#22c55e' },
  { id: 'canvas-seedance2-pro-720p', modelKey: 'seedance2-pro-720p', name: 'video-pro-720p', displayName: 'Seedance 2.0 Pro 720p', resolution: '720p', cnyPerSecond: 0.52, credits: 52, badge: 'PRO 720', badgeColor: '#22c55e' },
];

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
    name: 'Seedance 2.0',
    type: 'VIDEO',
    adapter: 'seedance2',
    baseUrl: preservedProvider?.baseUrl || baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: preservedProvider?.defaultModel || 'video-fast-720p',
    apiKeyEncrypted,
    timeoutMs: Math.max(Number(preservedProvider?.timeoutMs || 0), 900000),
    status: preservedProvider?.status || 'ACTIVE',
  },
  create: {
    id: providerWhereId,
    providerKey,
    name: 'Seedance 2.0',
    type: 'VIDEO',
    adapter: 'seedance2',
    baseUrl,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
    defaultModel: 'video-fast-720p',
    apiKeyEncrypted,
    timeoutMs: 900000,
    status: 'ACTIVE',
  },
});

const provider = await prisma.upstreamProvider.findUniqueOrThrow({ where: { id: providerWhereId } });

for (const row of modelRows) {
  const pricing = {
    unit: 'second',
    currency: 'credits',
    creditsPerCny: 100,
    cnyPerSecond: row.cnyPerSecond,
    chargedCreditsPerSecond: row.credits,
    originalCreditsPerSecond: row.credits,
    costCreditsPerSecond: Number((row.credits * 0.7).toFixed(2)),
    grossMarginRate: 0.3,
  };
  const capabilities = {
    resolutions: [row.resolution],
    durations,
    defaultDuration: 6,
    defaultResolution: row.resolution,
    aspectRatios,
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    maxVideoDurationSeconds: 15,
    maxAudioDurationSeconds: 15,
    supportsAudio: true,
    supportsVideo: true,
    supportsLastFrame: false,
  };
  const modelData = {
    providerId: provider.id,
    modelKey: row.modelKey,
    name: row.name,
    displayName: row.displayName,
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(pricing.costCreditsPerSecond),
    pricePerSecond: row.credits,
    inputPriceUsdPer1m: new Prisma.Decimal(0),
    outputPriceUsdPer1m: new Prisma.Decimal(0),
    cnyPerUsdCost: new Prisma.Decimal(0),
    creditsPerUsdCost: new Prisma.Decimal(0),
    markupRate: new Prisma.Decimal(1),
    adapter: 'seedance2',
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    protocol,
    supports,
    defaults: { pricing },
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui: { label: row.displayName, badge: row.badge, badgeColor: row.badgeColor },
    status: 'ACTIVE',
  };
  await prisma.aiModel.upsert({
    where: { id: row.id },
    update: modelData,
    create: { id: row.id, ...modelData },
  });
}

const rows = await prisma.aiModel.findMany({
  where: { providerId: provider.id, adapter: 'seedance2' },
  orderBy: { id: 'asc' },
  include: { provider: true },
});
console.log(JSON.stringify(rows.map(row => ({
  id: row.id,
  modelKey: row.modelKey,
  displayName: row.displayName,
  model: row.name,
  type: row.type,
  status: row.status,
  providerKey: row.provider.providerKey,
  providerStatus: row.provider.status,
  adapter: row.adapter || row.provider.adapter,
  baseUrl: row.provider.baseUrl,
  endpointPath: row.endpointPath || row.provider.endpointPath,
})), null, 2));

await prisma.$disconnect();
NODE

log "restart pm2 app: $PM2_APP"
if pm2_run show "$PM2_APP" >/dev/null 2>&1; then
  pm2_run restart "$PM2_APP" --update-env >/dev/null
  pm2_run save >/dev/null 2>&1 || true
else
  log "pm2 app not found, skipped: $PM2_APP"
fi

log "verify installed markers"
run_sudo grep -Fq "'seedance2': { submit: submitSeedance2Video" "$APP_DIR/api-server/dist/modules/generation/adapters/registry.js"
run_sudo grep -Fq "seedance2-fast-480p" "$WEB_ROOT/workbench-web/model-registry.json"
run_sudo grep -Fq "Seedance 2.0 Pro 720p" "$WEB_ROOT/workbench-web/models/seedance2-pro-720p.json"
curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && log "api health: ok" || log "api health: skipped/failed"

log "done"
echo "backup: $BACKUP_DIR"
echo "Refresh admin model management and canvas model list."
