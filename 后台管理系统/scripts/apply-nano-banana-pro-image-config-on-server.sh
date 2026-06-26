#!/usr/bin/env bash
set +H
set -euo pipefail

API_DIR="${API_DIR:-/var/www/ai-admin/ai-admin-platform/api-server}"
MODEL_ID="${NANO_BANANA_MODEL_ID:-}"
MODEL_NAME="${NANO_BANANA_MODEL_NAME:-nano-banana-pro}"
BASE_URL="${NANO_BANANA_BASE_URL:-https://api.aiid.edu.kg/v1}"
ENDPOINT_PATH="${NANO_BANANA_ENDPOINT_PATH:-/images/generations}"
API_KEY="${NANO_BANANA_PRO_API_KEY:-}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

log(){ printf '[nano-banana-pro] %s\n' "$*"; }
fail(){ printf '[nano-banana-pro] ERROR: %s\n' "$*" >&2; exit 1; }
run_node(){ if [ "$(id -u)" -eq 0 ] || [ -r "$API_DIR/dist/db.js" ]; then "$@"; else sudo "$@"; fi; }

[ -d "$API_DIR" ] || fail "api-server not found: $API_DIR"
[ -f "$API_DIR/dist/db.js" ] || fail "api-server dist not found: $API_DIR/dist/db.js"
[ -n "$API_KEY" ] || fail "NANO_BANANA_PRO_API_KEY is required"
[ -n "$NODE_BIN" ] || fail "node not found; set NODE_BIN=/path/to/node"

log "updating existing $MODEL_NAME image model in $API_DIR"
run_node env \
  NANO_BANANA_MODEL_ID="$MODEL_ID" \
  NANO_BANANA_MODEL_NAME="$MODEL_NAME" \
  NANO_BANANA_BASE_URL="$BASE_URL" \
  NANO_BANANA_ENDPOINT_PATH="$ENDPOINT_PATH" \
  NANO_BANANA_PRO_API_KEY="$API_KEY" \
  bash -lc "cd '$API_DIR' && '$NODE_BIN' --input-type=module" <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
import { encryptSecret } from './dist/security.js';

const modelId = String(process.env.NANO_BANANA_MODEL_ID || '').trim();
const modelName = String(process.env.NANO_BANANA_MODEL_NAME || 'nano-banana-pro').trim();
const baseUrl = String(process.env.NANO_BANANA_BASE_URL || 'https://api.aiid.edu.kg/v1').replace(/\/+$/, '');
const endpointPath = String(process.env.NANO_BANANA_ENDPOINT_PATH || '/images/generations').trim() || '/images/generations';
const apiKey = String(process.env.NANO_BANANA_PRO_API_KEY || '').trim();
if (!apiKey) throw new Error('NANO_BANANA_PRO_API_KEY is required');

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function matchesText(row, expected) {
  const text = [
    row.id,
    row.name,
    row.modelKey,
    row.displayName,
    row.adapter,
    row.provider?.providerKey,
    row.provider?.name,
    row.provider?.adapter,
    row.provider?.defaultModel,
  ].map(value => String(value || '').trim().toLowerCase());
  return text.includes(expected.toLowerCase());
}

let model = null;
if (modelId) {
  model = await prisma.aiModel.findUnique({ where: { id: modelId }, include: { provider: true } });
  if (!model) throw new Error(`model not found by NANO_BANANA_MODEL_ID=${modelId}`);
} else {
  const candidates = await prisma.aiModel.findMany({
    where: {
      type: 'IMAGE',
      OR: [
        { id: { contains: modelName, mode: 'insensitive' } },
        { name: { contains: modelName, mode: 'insensitive' } },
        { modelKey: { contains: modelName, mode: 'insensitive' } },
        { displayName: { contains: modelName, mode: 'insensitive' } },
        { adapter: { contains: modelName, mode: 'insensitive' } },
        { provider: { providerKey: { contains: modelName, mode: 'insensitive' } } },
        { provider: { name: { contains: modelName, mode: 'insensitive' } } },
        { provider: { adapter: { contains: modelName, mode: 'insensitive' } } },
        { provider: { defaultModel: { contains: modelName, mode: 'insensitive' } } },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'desc' },
  });
  const exact = candidates.filter(row => matchesText(row, modelName));
  const narrowed = exact.length ? exact : candidates;
  if (narrowed.length === 0) throw new Error(`no existing IMAGE model/channel matched ${modelName}`);
  if (narrowed.length > 1) {
    console.log(JSON.stringify({
      error: 'multiple matches; set NANO_BANANA_MODEL_ID',
      matches: narrowed.map(row => ({
        id: row.id,
        name: row.name,
        displayName: row.displayName,
        providerKey: row.provider.providerKey,
        providerName: row.provider.name,
      })),
    }, null, 2));
    throw new Error('multiple nano-banana-pro matches');
  }
  model = narrowed[0];
}

const providerDefaults = {
  ...asRecord(model.provider.defaultParams),
  response_format: 'url',
  responseType: 'provider_url',
  response_type: 'provider_url',
};
const protocol = {
  ...asRecord(model.protocol),
  adapter: 'openai-image',
  method: 'sync',
  endpointPath,
  responseType: 'provider_url',
  response_type: 'provider_url',
};
const supports = {
  ...asRecord(model.supports),
  txt2img: true,
};
const defaults = {
  ...asRecord(model.defaults),
  response_format: 'url',
  responseType: 'provider_url',
  response_type: 'provider_url',
};
const capabilities = {
  ...asRecord(model.capabilities),
  aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  imageSizes: ['1K', '2K', '4K'],
};

await prisma.upstreamProvider.update({
  where: { id: model.providerId },
  data: {
    name: model.provider.name || 'Nano Banana Pro 渠道',
    type: 'IMAGE',
    adapter: 'openai-image',
    baseUrl,
    endpointPath,
    statusEndpointPath: null,
    uploadMode: null,
    requestMethod: 'sync',
    defaultModel: modelName,
    defaultParams: providerDefaults,
    apiKeyEncrypted: encryptSecret(apiKey),
    timeoutMs: Math.max(Number(model.provider.timeoutMs || 0), 180000),
    status: 'ACTIVE',
  },
});

const updated = await prisma.aiModel.update({
  where: { id: model.id },
  data: {
    name: modelName,
    modelKey: model.modelKey || modelName,
    type: 'IMAGE',
    adapter: 'openai-image',
    endpointPath,
    statusEndpointPath: null,
    uploadMode: null,
    protocol,
    supports,
    defaults,
    capabilities,
    status: 'ACTIVE',
  },
  include: { provider: true },
});

console.log(JSON.stringify({
  model: {
    id: updated.id,
    name: updated.name,
    modelKey: updated.modelKey,
    displayName: updated.displayName,
    status: updated.status,
    adapter: updated.adapter,
    endpointPath: updated.endpointPath,
    protocol: updated.protocol,
    defaults: updated.defaults,
  },
  provider: {
    id: updated.provider.id,
    providerKey: updated.provider.providerKey,
    name: updated.provider.name,
    status: updated.provider.status,
    adapter: updated.provider.adapter,
    baseUrl: updated.provider.baseUrl,
    endpointPath: updated.provider.endpointPath,
    requestMethod: updated.provider.requestMethod,
    defaultModel: updated.provider.defaultModel,
    defaultParams: updated.provider.defaultParams,
    timeoutMs: updated.provider.timeoutMs,
  },
}, null, 2));

await prisma.$disconnect();
NODE

log "done"
