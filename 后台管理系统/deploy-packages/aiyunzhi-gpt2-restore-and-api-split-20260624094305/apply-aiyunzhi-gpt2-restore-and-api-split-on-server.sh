#!/usr/bin/env bash
set +H
set -euo pipefail

PKG="aiyunzhi-gpt2-restore-and-api-split-20260624094305"
ARCHIVE="${1:-/tmp/${PKG}.tar.gz}"
REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
REMOTE_APP_ROOT="${REMOTE_APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_DIR="${WORKBENCH_DIR:-$REMOTE_ROOT/workbench-web}"
MIRROR_WORKBENCH_DIR="${MIRROR_WORKBENCH_DIR:-/home/ubuntu/漫剧创作库/tools/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/${PKG}.XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/${PKG}-${STAMP}"

log(){ printf '[restore] %s\n' "$*"; }
fail(){ printf '[restore] ERROR: %s\n' "$*" >&2; exit 1; }
run_sudo(){
  "$@" && return 0
  local status=$?
  if [ "$(id -u)" -eq 0 ] || [ "${DEPLOY_USE_SUDO:-auto}" = "never" ] || [ "${1:-}" = "test" ]; then
    return "$status"
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return "$status"
  fi
}
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

[ -f "$ARCHIVE" ] || fail "archive not found: $ARCHIVE"
run_sudo test -d "$REMOTE_APP_ROOT/api-server" || fail "api-server dir not found: $REMOTE_APP_ROOT/api-server"

log "extract $ARCHIVE"
tar --no-same-owner -xzf "$ARCHIVE" -C "$WORKDIR"
SRC_WORKBENCH="$WORKDIR/workbench-web"
SRC_MIRROR="$WORKDIR/mirror-workbench-web"
SRC_APP="$WORKDIR/ai-admin-platform"

for file in \
  "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2.json" \
  "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2-api.json" \
  "$SRC_WORKBENCH/model-registry.json" \
  "$SRC_WORKBENCH/canvas-next/generation-service.js" \
  "$SRC_APP/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js"; do
  [ -f "$file" ] || fail "missing package file: $file"
done

grep -Fq '"adapter": "aiyunzhi-firefly-gpt-image"' "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2.json"
grep -Fq '"adapter": "aiyunzhi-gpt-image-2"' "$SRC_WORKBENCH/models/aiyunzhi-gpt-image-2-api.json"
grep -Fq 'aiyunzhi-gpt-image-2-api' "$SRC_WORKBENCH/model-registry.json"

log "backup current files: $BACKUP_DIR"
run_sudo mkdir -p \
  "$BACKUP_DIR/workbench-web/models" \
  "$BACKUP_DIR/workbench-web/canvas-next" \
  "$BACKUP_DIR/mirror-workbench-web/models" \
  "$BACKUP_DIR/mirror-workbench-web/canvas-next" \
  "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/models" \
  "$BACKUP_DIR/ai-admin-platform/tools/workbench-web/canvas-next" \
  "$BACKUP_DIR/ai-admin-platform/api-server/src" \
  "$BACKUP_DIR/ai-admin-platform/api-server/dist"
if run_sudo test -d "$WORKBENCH_DIR"; then
  run_sudo cp -a "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json" "$BACKUP_DIR/workbench-web/models/aiyunzhi-gpt-image-2.json" 2>/dev/null || true
  run_sudo cp -a "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2-api.json" "$BACKUP_DIR/workbench-web/models/aiyunzhi-gpt-image-2-api.json" 2>/dev/null || true
  run_sudo cp -a "$WORKBENCH_DIR/model-registry.json" "$BACKUP_DIR/workbench-web/model-registry.json" 2>/dev/null || true
  run_sudo cp -a "$WORKBENCH_DIR/canvas-next/generation-service.js" "$BACKUP_DIR/workbench-web/canvas-next/generation-service.js" 2>/dev/null || true
  run_sudo cp -a "$WORKBENCH_DIR/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html" 2>/dev/null || true
fi
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts" "$BACKUP_DIR/ai-admin-platform/api-server/src/sync-canvas-models.ts" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" 2>/dev/null || true
run_sudo cp -a "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js" "$BACKUP_DIR/ai-admin-platform/api-server/dist/sync-canvas-models.js" 2>/dev/null || true

install_workbench(){
  local target="$1"
  local source="$2"
  run_sudo test -d "$target" || return 0
  run_sudo mkdir -p "$target/models" "$target/canvas-next"
  run_sudo cp -a "$source/models/aiyunzhi-gpt-image-2.json" "$target/models/aiyunzhi-gpt-image-2.json"
  run_sudo cp -a "$source/models/aiyunzhi-gpt-image-2-api.json" "$target/models/aiyunzhi-gpt-image-2-api.json"
  run_sudo cp -a "$source/model-registry.json" "$target/model-registry.json"
  run_sudo cp -a "$source/canvas-next/generation-service.js" "$target/canvas-next/generation-service.js"
  run_sudo cp -a "$source/canvas-next/generator-adapters.js" "$target/canvas-next/generator-adapters.js"
  [ -f "$source/image-studio-canvas-next.html" ] && run_sudo cp -a "$source/image-studio-canvas-next.html" "$target/image-studio-canvas-next.html"
  [ -f "$source/image-studio-canvas.html" ] && run_sudo cp -a "$source/image-studio-canvas.html" "$target/image-studio-canvas.html"
}

log "install split workbench configs"
install_workbench "$WORKBENCH_DIR" "$SRC_WORKBENCH"
install_workbench "$REMOTE_APP_ROOT/tools/workbench-web" "$SRC_APP/tools/workbench-web"
install_workbench "$MIRROR_WORKBENCH_DIR" "$SRC_MIRROR"

log "install updated helper scripts"
run_sudo cp -a "$SRC_APP/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts" "$REMOTE_APP_ROOT/api-server/src/apply-aiyunzhi-gpt-image-2-channel.ts"
run_sudo cp -a "$SRC_APP/api-server/src/sync-canvas-models.ts" "$REMOTE_APP_ROOT/api-server/src/sync-canvas-models.ts"
run_sudo cp -a "$SRC_APP/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js" "$REMOTE_APP_ROOT/api-server/dist/apply-aiyunzhi-gpt-image-2-channel.js"
run_sudo cp -a "$SRC_APP/api-server/dist/sync-canvas-models.js" "$REMOTE_APP_ROOT/api-server/dist/sync-canvas-models.js"

log "restore old DB channel and add new API channel"
(
  cd "$REMOTE_APP_ROOT/api-server"
  node --input-type=module <<'NODE'
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';
import { imagePricingDefaults, IMAGE_PRICING_TIERS } from './dist/pricing.js';

const oldModelId = 'canvas-aiyunzhi-gpt-image-2';
const oldProviderId = 'canvas-provider-aiyunzhi-gpt-image-2';
const newModelId = 'canvas-aiyunzhi-gpt-image-2-api';
const newProviderId = 'canvas-provider-aiyunzhi-gpt-image-2-api';

const fireflyRatios = ['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16'];
const fireflyResolutions = ['1K', '2K', '4K'];
const fireflyCapabilities = {
  imageSizes: fireflyResolutions,
  resolutions: fireflyResolutions,
  aspectRatios: fireflyRatios,
  aspectRatiosByResolution: Object.fromEntries(fireflyResolutions.map(res => [res, fireflyRatios])),
  imageSizeOptionsByResolution: Object.fromEntries(fireflyResolutions.map(res => [res, fireflyRatios])),
  maxImages: 6,
};
const fireflyProtocol = {
  adapter: 'aiyunzhi-firefly-gpt-image',
  endpointPath: '/v1/chat/completions',
  method: 'sync',
  uploadMode: 'object_storage',
};
const fireflyDefaults = {
  imageSize: '1K',
  resolution: '1K',
  aspectRatio: '16:9',
  size: '16:9',
};
const fireflyModelAssembly = {
  type: 'template',
  template: 'firefly-gpt-image-{resolution}-{aspectRatioSlug}',
};
const apiPricingTiers = IMAGE_PRICING_TIERS.filter(item => item.tier !== '3K');
const apiDefaults = {
  ...imagePricingDefaults(apiPricingTiers),
  size: '1k',
  imageSize: '1k',
  image_size: '1k',
  resolution: '1k',
  aspectRatio: '1:1',
  aspect_ratio: '1:1',
  n: 1,
  response_format: 'url',
};
const apiCapabilities = {
  resolutions: ['1k', '2k', '4k'],
  imageSizes: ['1k', '2k', '4k'],
  sizes: ['1k', '2k', '4k'],
  aspectRatios: ['1:1'],
  responseFormats: ['url', 'b64_json'],
  defaultResolution: '1k',
  defaultSize: '1k',
  maxImages: 3,
  maxReferenceImages: 3,
  supportsReferenceImages: true,
};
const apiProtocol = {
  adapter: 'aiyunzhi-gpt-image-2',
  method: 'sync',
  endpointPath: '/v1/images/generations',
  endpoint_path: '/v1/images/generations',
  generationEndpointPath: '/v1/images/generations',
  generation_endpoint_path: '/v1/images/generations',
  editEndpointPath: '/v1/images/edits',
  edit_endpoint_path: '/v1/images/edits',
  uploadMode: 'object_storage',
  upload_mode: 'object_storage',
  requestSchema: 'aiyunzhi-gpt-image-2',
  responseType: 'provider_url',
  maxReferenceImages: 3,
};

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function restoreImagePricing(defaults) {
  const current = record(defaults);
  const pricing = record(current.pricing);
  const existingTiers = Array.isArray(pricing.tiers) ? pricing.tiers : [];
  const byTier = new Map(existingTiers
    .map(item => record(item))
    .filter(item => Object.keys(item).length)
    .map(item => [String(item.tier || item.resolution || item.label || '').trim().toUpperCase(), item]));
  const tiers = IMAGE_PRICING_TIERS.map(item => byTier.get(item.tier) || item);
  return { ...current, ...fireflyDefaults, pricing: { ...imagePricingDefaults(IMAGE_PRICING_TIERS).pricing, ...pricing, tiers } };
}

const oldModel = await prisma.aiModel.findUnique({ where: { id: oldModelId }, include: { provider: true } });
if (!oldModel) throw new Error(`${oldModelId} not found`);
const oldProvider = oldModel.provider;
const oldStatus = oldModel.status || 'ACTIVE';
const providerStatus = oldProvider.status || oldStatus || 'ACTIVE';

await prisma.upstreamProvider.update({
  where: { id: oldProviderId },
  data: {
    providerKey: oldProvider.providerKey || 'canvas_aiyunzhi-gpt-image-2',
    name: oldProvider.name || 'GPT 2 快速稳定 渠道',
    type: 'IMAGE',
    adapter: 'aiyunzhi-firefly-gpt-image',
    baseUrl: oldProvider.baseUrl || 'https://aiyunzhi.top',
    endpointPath: '/v1/chat/completions',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    requestMethod: 'sync',
    defaultModel: 'firefly-gpt-image',
    status: providerStatus,
  },
});
await prisma.aiModel.update({
  where: { id: oldModelId },
  data: {
    providerId: oldProviderId,
    modelKey: 'firefly-gpt-image',
    name: 'firefly-gpt-image',
    displayName: oldModel.displayName || 'GPT 2 快速稳定',
    type: 'IMAGE',
    adapter: 'aiyunzhi-firefly-gpt-image',
    endpointPath: '/v1/chat/completions',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    protocol: fireflyProtocol,
    supports: { txt2img: true, img2img: true },
    defaults: restoreImagePricing(oldModel.defaults),
    capabilities: fireflyCapabilities,
    modelAssembly: fireflyModelAssembly,
    ui: oldModel.ui || { label: oldModel.displayName || 'GPT 2 快速稳定', badge: 'Image', badgeColor: '#10b981' },
    status: oldStatus,
  },
});

const apiProvider = await prisma.upstreamProvider.upsert({
  where: { id: newProviderId },
  update: {
    providerKey: 'canvas_aiyunzhi-gpt-image-2-api',
    name: 'Aiyunzhi GPT Image 2 API 渠道',
    type: 'IMAGE',
    adapter: 'aiyunzhi-gpt-image-2',
    baseUrl: oldProvider.baseUrl || 'https://aiyunzhi.top',
    apiKeyEncrypted: oldProvider.apiKeyEncrypted,
    endpointPath: '/v1/images/generations',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    requestMethod: 'sync',
    defaultModel: 'gpt-image-2',
    timeoutMs: oldProvider.timeoutMs || 900000,
    status: providerStatus,
  },
  create: {
    id: newProviderId,
    providerKey: 'canvas_aiyunzhi-gpt-image-2-api',
    name: 'Aiyunzhi GPT Image 2 API 渠道',
    type: 'IMAGE',
    adapter: 'aiyunzhi-gpt-image-2',
    baseUrl: oldProvider.baseUrl || 'https://aiyunzhi.top',
    apiKeyEncrypted: oldProvider.apiKeyEncrypted,
    endpointPath: '/v1/images/generations',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    requestMethod: 'sync',
    defaultModel: 'gpt-image-2',
    timeoutMs: oldProvider.timeoutMs || 900000,
    status: providerStatus,
  },
});
await prisma.aiModel.upsert({
  where: { id: newModelId },
  update: {
    providerId: apiProvider.id,
    modelKey: 'aiyunzhi-gpt-image-2-api',
    name: 'gpt-image-2',
    displayName: 'Aiyunzhi GPT Image 2 API',
    type: 'IMAGE',
    unit: 'image_resolution_tier',
    salePrice: apiPricingTiers[0].chargedCredits,
    costPrice: new Prisma.Decimal(apiPricingTiers[0].costCredits),
    pricePerSecond: 0,
    adapter: 'aiyunzhi-gpt-image-2',
    endpointPath: '/v1/images/generations',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    protocol: apiProtocol,
    supports: { txt2img: true, img2img: true, imageToImage: true, storyboard: true, repair: true, panorama: false, referenceImages: true },
    defaults: apiDefaults,
    capabilities: apiCapabilities,
    modelAssembly: { type: 'literal' },
    ui: { label: 'Aiyunzhi GPT Image 2 API', badge: 'GPT2 API', badgeColor: '#2563eb', provider: 'Aiyunzhi' },
    status: providerStatus,
  },
  create: {
    id: newModelId,
    providerId: apiProvider.id,
    modelKey: 'aiyunzhi-gpt-image-2-api',
    name: 'gpt-image-2',
    displayName: 'Aiyunzhi GPT Image 2 API',
    type: 'IMAGE',
    unit: 'image_resolution_tier',
    salePrice: apiPricingTiers[0].chargedCredits,
    costPrice: new Prisma.Decimal(apiPricingTiers[0].costCredits),
    pricePerSecond: 0,
    adapter: 'aiyunzhi-gpt-image-2',
    endpointPath: '/v1/images/generations',
    statusEndpointPath: null,
    uploadMode: 'object_storage',
    protocol: apiProtocol,
    supports: { txt2img: true, img2img: true, imageToImage: true, storyboard: true, repair: true, panorama: false, referenceImages: true },
    defaults: apiDefaults,
    capabilities: apiCapabilities,
    modelAssembly: { type: 'literal' },
    ui: { label: 'Aiyunzhi GPT Image 2 API', badge: 'GPT2 API', badgeColor: '#2563eb', provider: 'Aiyunzhi' },
    status: providerStatus,
  },
});

const restored = await prisma.aiModel.findUnique({ where: { id: oldModelId }, include: { provider: true } });
const added = await prisma.aiModel.findUnique({ where: { id: newModelId }, include: { provider: true } });
console.log(JSON.stringify({
  restored: {
    id: restored.id,
    displayName: restored.displayName,
    modelKey: restored.modelKey,
    name: restored.name,
    adapter: restored.adapter,
    endpointPath: restored.endpointPath,
    providerAdapter: restored.provider.adapter,
    providerDefaultModel: restored.provider.defaultModel,
    status: restored.status,
  },
  added: {
    id: added.id,
    displayName: added.displayName,
    modelKey: added.modelKey,
    name: added.name,
    adapter: added.adapter,
    endpointPath: added.endpointPath,
    editEndpointPath: added.protocol?.editEndpointPath,
    providerAdapter: added.provider.adapter,
    providerDefaultModel: added.provider.defaultModel,
    status: added.status,
  },
}));
await prisma.$disconnect();
NODE
)

log "verify installed files"
grep -Fq '"adapter": "aiyunzhi-firefly-gpt-image"' "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2.json"
grep -Fq '"adapter": "aiyunzhi-gpt-image-2"' "$WORKBENCH_DIR/models/aiyunzhi-gpt-image-2-api.json"
grep -Fq 'aiyunzhi-gpt-image-2-api' "$WORKBENCH_DIR/model-registry.json"

log "done. backup=$BACKUP_DIR"
