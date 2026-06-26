#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/var/www/ai-admin/ai-admin-platform"
cd "$APP_ROOT/api-server"

echo "[diag] deployed adapter markers"
REG="$APP_ROOT/api-server/dist/modules/generation/adapters/registry.js"
grep -n "async function submitAiyunzhiGptImage2" "$REG" | head -1 || true
grep -n "requestJson = compactJson" "$REG" | head -8 || true
grep -n "requested_size" "$REG" | head -3 || true
grep -n "aspect_ratio.*geometry" "$REG" | head -3 || true

echo "[diag] latest Aiyunzhi GPT Image 2 tasks"
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function redact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/^sk-|Bearer\s+/i.test(value)) return '[redacted-secret]';
    if (/^data:image\//i.test(value) || value.length > 600) return `[omitted ${value.length} chars]`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (depth > 4) return '[omitted-depth]';
  if (Array.isArray(value)) return value.slice(0, 6).map(item => redact(item, depth + 1));
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (/key|secret|token|authorization|apiKey|api_key/i.test(key)) {
      out[key] = '[redacted-secret]';
      continue;
    }
    if (['url','temporaryUrl','b64_json','image','images','image[]','inputFiles'].includes(key) && typeof raw === 'string' && raw.length > 180) {
      out[key] = `[omitted ${raw.length} chars]`;
      continue;
    }
    out[key] = redact(raw, depth + 1);
  }
  return out;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) if (obj && obj[key] !== undefined) out[key] = redact(obj[key]);
  return out;
}

(async () => {
  const rows = await prisma.generationTask.findMany({
    where: { channelKey: 'canvas_aiyunzhi-gpt-image-2-api' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      model: {
        select: {
          id: true, modelKey: true, name: true, displayName: true, type: true, adapter: true,
          endpointPath: true, uploadMode: true, protocol: true, defaults: true, capabilities: true, status: true,
        },
      },
      provider: {
        select: {
          id: true, providerKey: true, name: true, type: true, adapter: true, baseUrl: true,
          endpointPath: true, uploadMode: true, requestMethod: true, defaultModel: true,
          defaultParams: true, timeoutMs: true, status: true,
        },
      },
    },
  });
  for (const row of rows) {
    const params = row.paramsJson || {};
    const model = row.model || {};
    const provider = row.provider || {};
    console.log(JSON.stringify(redact({
      id: row.id,
      createdAt: row.createdAt,
      status: row.status,
      channelKey: row.channelKey,
      modelId: row.modelId,
      prompt: String(row.prompt || '').slice(0, 120),
      params: pick(params, [
        'model','modelNick','size','resolution','requestedResolution','imageSize','image_size',
        'aspectRatio','aspect_ratio','requestedRatio','requestedPixelSize',
        'response_format','responseType','response_type','n'
      ]),
      protocol: pick(params.protocol || {}, [
        'adapter','requestSchema','endpointPath','endpoint_path','generationEndpointPath','generation_endpoint_path',
        'editEndpointPath','edit_endpoint_path','responseType','response_type'
      ]),
      requestJson: row.requestJson,
      responseJson: row.responseJson,
      resultJson: row.resultJson,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      model: {
        id: model.id, modelKey: model.modelKey, name: model.name, displayName: model.displayName,
        type: model.type, adapter: model.adapter, endpointPath: model.endpointPath,
        uploadMode: model.uploadMode, status: model.status,
        protocol: pick(model.protocol || {}, ['adapter','requestSchema','endpointPath','endpoint_path','generationEndpointPath','generation_endpoint_path','editEndpointPath','edit_endpoint_path','responseType','response_type']),
        defaults: pick(model.defaults || {}, ['size','imageSize','resolution','responseType','response_type']),
        capabilities: pick(model.capabilities || {}, ['resolutions','aspectRatios','aspect_ratios']),
      },
      provider: {
        id: provider.id, providerKey: provider.providerKey, name: provider.name, type: provider.type,
        adapter: provider.adapter, baseUrl: provider.baseUrl, endpointPath: provider.endpointPath,
        uploadMode: provider.uploadMode, requestMethod: provider.requestMethod,
        defaultModel: provider.defaultModel, timeoutMs: provider.timeoutMs, status: provider.status,
        defaultParams: pick(provider.defaultParams || {}, ['size','imageSize','resolution','responseType','response_type','endpointPath','generationEndpointPath','editEndpointPath']),
      },
    })));
  }
})().finally(() => prisma.$disconnect());
NODE
