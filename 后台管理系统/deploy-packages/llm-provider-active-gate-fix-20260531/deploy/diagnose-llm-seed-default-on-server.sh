#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="${API_DIR:-$APP_DIR/api-server}"
CHANNEL_KEY="${CHANNEL_KEY:-seed_default}"
MODEL_ID="${MODEL_ID:-seed-gpt-5-5}"
PROMPT="${PROMPT:-请回复 pong}"

log(){ printf '[diagnose] %s\n' "$*"; }

cd "$API_DIR"

log "api dir: $API_DIR"
log "node: $(command -v node 2>/dev/null || true) $(node -v 2>/dev/null || true)"
log "pm2 status"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || true
elif command -v sudo >/dev/null 2>&1; then
  sudo -u ubuntu PM2_HOME=/home/ubuntu/.pm2 pm2 list || true
fi

log "local api health"
curl -fsS http://127.0.0.1:4000/api/health || true
echo

log "db + upstream check: channel=$CHANNEL_KEY model=$MODEL_ID"
node --input-type=module <<'NODE'
import { prisma } from './dist/db.js';
import { decryptSecret } from './dist/security.js';
import { buildEndpoint, testUpstreamProvider } from './dist/upstream.js';

const channelKey = process.env.CHANNEL_KEY || 'seed_default';
const modelId = process.env.MODEL_ID || 'seed-gpt-5-5';
const prompt = process.env.PROMPT || '请回复 pong';

const provider = await prisma.upstreamProvider.findUnique({
  where: { providerKey: channelKey },
  include: { models: { orderBy: { createdAt: 'desc' } } },
});

if (!provider) {
  console.log(JSON.stringify({ ok: false, stage: 'db', error: `provider not found: ${channelKey}` }, null, 2));
  process.exit(2);
}

const model = provider.models.find(item => [item.id, item.modelKey, item.name, item.displayName].includes(modelId)) || null;
const key = decryptSecret(provider.apiKeyEncrypted || '');
const endpointPath = model?.endpointPath || provider.endpointPath || '/chat/completions';
const endpoint = buildEndpoint(provider.baseUrl, endpointPath);

console.log(JSON.stringify({
  ok: true,
  provider: {
    id: provider.id,
    providerKey: provider.providerKey,
    name: provider.name,
    type: provider.type,
    adapter: provider.adapter,
    status: provider.status,
    baseUrl: provider.baseUrl,
    endpointPath: provider.endpointPath,
    timeoutMs: provider.timeoutMs,
    hasKey: Boolean(key),
    keyPrefix: key ? `${key.slice(0, 6)}***` : '',
  },
  model: model ? {
    id: model.id,
    modelKey: model.modelKey,
    name: model.name,
    displayName: model.displayName,
    type: model.type,
    adapter: model.adapter,
    status: model.status,
    endpointPath: model.endpointPath,
  } : null,
  allModelsOnProvider: provider.models.map(item => ({
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    type: item.type,
    adapter: item.adapter,
    status: item.status,
  })),
  resolvedEndpoint: endpoint,
}, null, 2));

if (!model) {
  console.log(JSON.stringify({ ok: false, stage: 'db', error: `model not found under provider: ${modelId}` }, null, 2));
  process.exit(3);
}
if (provider.status !== 'ACTIVE') {
  console.log(JSON.stringify({ ok: false, stage: 'config', error: `provider disabled: ${provider.providerKey} status=${provider.status}` }, null, 2));
}
if (model.status !== 'ACTIVE') {
  console.log(JSON.stringify({ ok: false, stage: 'config', error: `model disabled: ${model.id} status=${model.status}` }, null, 2));
}
if (!key) {
  console.log(JSON.stringify({ ok: false, stage: 'config', error: 'provider api key missing' }, null, 2));
}

const payload = {
  model: model.name,
  messages: [{ role: 'user', content: prompt }],
  max_tokens: 20,
  temperature: 0,
};

try {
  const upstream = await testUpstreamProvider(provider, endpointPath, {
    method: 'POST',
    payload,
    timeoutMs: Math.min(Number(provider.timeoutMs || 60000), 120000),
  });
  const text = upstream?.choices?.[0]?.message?.content || upstream?.choices?.[0]?.text || upstream?.text || upstream?.content || '';
  console.log(JSON.stringify({
    ok: true,
    stage: 'upstream',
    upstreamShape: {
      hasChoices: Array.isArray(upstream?.choices),
      id: upstream?.id || '',
      model: upstream?.model || '',
      text: String(text || '').slice(0, 120),
    },
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({
    ok: false,
    stage: 'upstream',
    name: err?.name || '',
    code: err?.code || '',
    status: err?.status || err?.upstreamStatus || '',
    message: err?.message || String(err),
    responseJson: err?.responseJson || null,
  }, null, 2));
  process.exit(4);
} finally {
  await prisma.$disconnect();
}
NODE

log "recent failed generation tasks for this model"
node --input-type=module <<'NODE'
import { prisma } from './dist/db.js';
const channelKey = process.env.CHANNEL_KEY || 'seed_default';
const modelId = process.env.MODEL_ID || 'seed-gpt-5-5';
const rows = await prisma.generationTask.findMany({
  where: { channelKey, modelId },
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, status: true, errorCode: true, errorMessage: true, createdAt: true, failedAt: true },
});
console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
NODE
