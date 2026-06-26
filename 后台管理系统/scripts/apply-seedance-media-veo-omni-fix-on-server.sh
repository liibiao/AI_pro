#!/usr/bin/env bash
set -euo pipefail

PKG="${1:-}"
if [[ -z "$PKG" ]]; then
  PKG="$(ls -t /tmp/seedance-media-veo-omni-fix-*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PKG" || ! -f "$PKG" ]]; then
  echo "找不到部署包 seedance-media-veo-omni-fix-*.tar.gz" >&2
  exit 1
fi

REMOTE_ROOT="${REMOTE_ROOT:-/var/www/ai-admin}"
APP_ROOT="${APP_ROOT:-$REMOTE_ROOT/ai-admin-platform}"
WORKBENCH_ROOT="${WORKBENCH_ROOT:-$REMOTE_ROOT/workbench-web}"
STAMP="$(date +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d /tmp/seedance-media-veo-omni-fix-XXXXXX)"
BACKUP_DIR="$REMOTE_ROOT/backups/seedance-media-veo-omni-fix-$STAMP"
trap 'rm -rf "$WORKDIR"' EXIT

tar --warning=no-unknown-keyword --no-same-owner -xzf "$PKG" -C "$WORKDIR"
mkdir -p \
  "$BACKUP_DIR/api-server/src/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/src/modules/generation" \
  "$BACKUP_DIR/api-server/dist/modules/generation/adapters" \
  "$BACKUP_DIR/api-server/dist/modules/generation" \
  "$BACKUP_DIR/workbench-web"

cp -a "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts" "$BACKUP_DIR/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$APP_ROOT/api-server/src/modules/generation/routes.ts" "$BACKUP_DIR/api-server/src/modules/generation/routes.ts"
cp -a "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js" "$BACKUP_DIR/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$APP_ROOT/api-server/dist/modules/generation/routes.js" "$BACKUP_DIR/api-server/dist/modules/generation/routes.js"
cp -a "$WORKBENCH_ROOT/image-studio-canvas-next.html" "$BACKUP_DIR/workbench-web/image-studio-canvas-next.html"

cp -a "$WORKDIR/api-server/src/modules/generation/adapters/registry.ts" "$APP_ROOT/api-server/src/modules/generation/adapters/registry.ts"
cp -a "$WORKDIR/api-server/src/modules/generation/routes.ts" "$APP_ROOT/api-server/src/modules/generation/routes.ts"
cp -a "$WORKDIR/api-server/dist/modules/generation/adapters/registry.js" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
cp -a "$WORKDIR/api-server/dist/modules/generation/routes.js" "$APP_ROOT/api-server/dist/modules/generation/routes.js"
cp -a "$WORKDIR/workbench-web/image-studio-canvas-next.html" "$WORKBENCH_ROOT/image-studio-canvas-next.html"

cd "$APP_ROOT/api-server"
node --input-type=module <<'NODE'
import './dist/config.js';
import { Prisma } from '@prisma/client';
import { prisma } from './dist/db.js';

const source = await prisma.upstreamProvider.findUnique({ where: { providerKey: 'aiid-seedance-task' } });
if (!source) throw new Error('缺少现有 AIID Seedance 渠道，无法复用 API Key');

await prisma.upstreamProvider.update({
  where: { id: source.id },
  data: {
    adapter: 'seedance-task',
    baseUrl: 'https://api.aiid.edu.kg',
    endpointPath: '/api/v3/contents/generations/tasks',
    statusEndpointPath: '/api/v3/contents/generations/tasks/{taskId}',
    uploadMode: 'object_storage',
    requestMethod: 'async-poll',
  },
});

const commonProvider = {
  type: 'VIDEO',
  baseUrl: 'https://api.aiid.edu.kg',
  apiKeyEncrypted: source.apiKeyEncrypted,
  uploadMode: 'object_storage',
  requestMethod: 'async-poll',
  timeoutMs: Math.max(source.timeoutMs || 0, 900000),
  weight: 100,
  concurrencyLimit: source.concurrencyLimit,
  failureThreshold: source.failureThreshold,
  status: source.status,
};

const omniProvider = await prisma.upstreamProvider.upsert({
  where: { providerKey: 'aiid-gemini-omni' },
  update: {
    ...commonProvider,
    name: 'AIID Gemini Omni',
    adapter: 'seedance-task',
    endpointPath: '/api/v3/contents/generations/tasks',
    statusEndpointPath: '/api/v3/contents/generations/tasks/{taskId}',
    defaultModel: 'gemini-omni',
    defaultParams: { preset: 'aiid_gemini_omni', responseType: 'provider_url' },
  },
  create: {
    id: 'canvas-provider-gemini-omni',
    providerKey: 'aiid-gemini-omni',
    ...commonProvider,
    name: 'AIID Gemini Omni',
    adapter: 'seedance-task',
    endpointPath: '/api/v3/contents/generations/tasks',
    statusEndpointPath: '/api/v3/contents/generations/tasks/{taskId}',
    defaultModel: 'gemini-omni',
    defaultParams: { preset: 'aiid_gemini_omni', responseType: 'provider_url' },
  },
});

const veoProvider = await prisma.upstreamProvider.upsert({
  where: { providerKey: 'aiid-veo-sora' },
  update: {
    ...commonProvider,
    name: 'AIID Veo (Sora Compatible)',
    adapter: 'sora-video',
    endpointPath: '/v1/videos',
    statusEndpointPath: '/v1/videos/{taskId}',
    defaultModel: 'veo3.1-fast',
    defaultParams: { preset: 'aiid_veo_sora', responseType: 'provider_url' },
  },
  create: {
    id: 'canvas-provider-aiid-veo-sora',
    providerKey: 'aiid-veo-sora',
    ...commonProvider,
    name: 'AIID Veo (Sora Compatible)',
    adapter: 'sora-video',
    endpointPath: '/v1/videos',
    statusEndpointPath: '/v1/videos/{taskId}',
    defaultModel: 'veo3.1-fast',
    defaultParams: { preset: 'aiid_veo_sora', responseType: 'provider_url' },
  },
});

const seedancePricing = {
  unit: 'second',
  currency: 'credits',
  creditsPerCny: 100,
  memberDiscountRate: 0.4,
  chargedCreditsPerSecond: 34,
  originalCreditsPerSecond: 85,
  costCreditsPerSecond: 23.8,
};
const genericVideoPricing = {
  unit: 'second',
  currency: 'credits',
  creditsPerCny: 100,
  memberDiscountRate: 0.4,
  chargedCreditsPerSecond: 25,
  originalCreditsPerSecond: 62,
  costCreditsPerSecond: 17.5,
};

async function upsertVideoModel({ id, providerId, modelKey, name, displayName, adapter, endpointPath, statusEndpointPath, pricing, capabilities, supports, ui }) {
  const existing = await prisma.aiModel.findUnique({ where: { id } });
  const data = {
    providerId,
    modelKey,
    name,
    displayName,
    type: 'VIDEO',
    unit: 'second',
    salePrice: 0,
    costPrice: new Prisma.Decimal(pricing.costCreditsPerSecond),
    pricePerSecond: pricing.chargedCreditsPerSecond,
    adapter,
    endpointPath,
    statusEndpointPath,
    uploadMode: 'object_storage',
    protocol: {
      adapter,
      method: 'async-poll',
      endpointPath,
      statusEndpointPath,
      uploadMode: 'object_storage',
      responseType: 'provider_url',
    },
    supports,
    defaults: { pricing, responseType: 'provider_url' },
    capabilities,
    modelAssembly: { type: 'passthrough' },
    ui,
    status: 'ACTIVE',
  };
  await prisma.aiModel.upsert({
    where: { id },
    update: {
      ...data,
      costPrice: existing?.costPrice ?? data.costPrice,
      pricePerSecond: existing?.pricePerSecond ?? data.pricePerSecond,
      defaults: existing?.defaults ?? data.defaults,
    },
    create: data,
  });
}

await upsertVideoModel({
  id: 'canvas-gemini-omni',
  providerId: omniProvider.id,
  modelKey: 'gemini-omni',
  name: 'gemini-omni',
  displayName: 'Gemini Omni',
  adapter: 'seedance-task',
  endpointPath: '/api/v3/contents/generations/tasks',
  statusEndpointPath: '/api/v3/contents/generations/tasks/{taskId}',
  pricing: seedancePricing,
  capabilities: {
    resolutions: ['720p', '1080p'],
    durations: [4, 5, 6, 8, 10],
    defaultDuration: 5,
    defaultResolution: '720p',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    maxImages: { full: 9, smartMultiFrame: 9, firstLast: 2 },
    maxVideos: 3,
    maxAudios: 3,
    supportsAudio: true,
    supportsVideo: true,
  },
  supports: { txt2video: true, img2video: true, referenceVideo: true, referenceAudio: true },
  ui: { label: 'Gemini Omni', badge: 'OMNI', badgeColor: '#8b5cf6' },
});

const veoModels = [
  {
    name: 'veo3.1',
    displayName: 'Veo 3.1',
    description: 'Google 最新的高级人工智能模型，支持视频自动配套音频生成，质量高价格很低，性价比最高；支持首尾帧和文生视频（时长 8 秒）。',
    maxImages: { full: 2, smartMultiFrame: 2, firstLast: 2 },
  },
  {
    name: 'veo3.1-components',
    displayName: 'Veo 3.1 Components',
    description: 'Google 最新的高级人工智能模型，Veo 3.1 高质量模式，支持视频自动配套音频生成，质量超高，价格也超高；多图元素合一，支持 1～3 个图片（时长 8 秒）。',
    maxImages: { full: 3, smartMultiFrame: 3, firstLast: 2 },
  },
  {
    name: 'veo3.1-fast',
    displayName: 'Veo 3.1 Fast',
    description: 'Veo 3.1 快速模式，适合更快生成与预览。',
    maxImages: { full: 2, smartMultiFrame: 2, firstLast: 2 },
  },
];
await prisma.aiModel.updateMany({
  where: {
    providerId: veoProvider.id,
    name: { notIn: veoModels.map(item => item.name) },
  },
  data: { status: 'DISABLED' },
});
for (const item of veoModels) {
  const name = item.name;
  const id = `canvas-aiid-${name.replaceAll('.', '-')}`;
  await upsertVideoModel({
    id,
    providerId: veoProvider.id,
    modelKey: name,
    name,
    displayName: item.displayName,
    adapter: 'sora-video',
    endpointPath: '/v1/videos',
    statusEndpointPath: '/v1/videos/{taskId}',
    pricing: genericVideoPricing,
    capabilities: {
      resolutions: ['720p', '1080p'],
      durations: [8],
      defaultDuration: 8,
      defaultResolution: '720p',
      aspectRatios: ['16:9', '9:16', '1:1'],
      maxImages: item.maxImages,
      maxVideos: 0,
      maxAudios: 0,
      supportsAudio: false,
      supportsVideo: false,
      description: item.description,
    },
    supports: { txt2video: true, img2video: true, firstLastFrame: name === 'veo3.1', multiImageComponents: name === 'veo3.1-components', referenceVideo: false, referenceAudio: false, generateAudio: true },
    ui: { label: item.displayName, badge: 'VEO', badgeColor: '#2563eb', description: item.description },
  });
}

console.log(JSON.stringify({
  omniProvider: omniProvider.providerKey,
  veoProvider: veoProvider.providerKey,
  veoModels: veoModels.length,
}, null, 2));
await prisma.$disconnect();
NODE

if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env
elif id ubuntu >/dev/null 2>&1 && sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 describe ai-admin-api >/dev/null 2>&1; then
  sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 pm2 restart ai-admin-api --update-env
else
  echo "没有找到 ai-admin-api PM2 进程" >&2
  exit 1
fi

sleep 2
curl -fsS http://127.0.0.1:4000/api/health
echo
grep -q "referenceMatchesMediaType" "$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -q "buildTypedUnifiedInputFiles" "$WORKBENCH_ROOT/image-studio-canvas-next.html"
echo "部署完成，备份目录：$BACKUP_DIR"
