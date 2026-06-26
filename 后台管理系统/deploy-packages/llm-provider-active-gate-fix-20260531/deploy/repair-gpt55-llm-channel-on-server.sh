#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/ai-admin/ai-admin-platform}"
API_DIR="${API_DIR:-$APP_DIR/api-server}"
MODEL_ID="${MODEL_ID:-seed-gpt-5-5}"
UPSTREAM_MODEL="${UPSTREAM_MODEL:-gpt-5.5}"
PROVIDER_KEY="${PROVIDER_KEY:-gpt55_45_default}"
PROVIDER_NAME="${PROVIDER_NAME:-GPT 5.5 45 中转渠道}"
BASE_URL="${BASE_URL:-http://45.77.211.38:8317/v1}"
ENDPOINT_PATH="${ENDPOINT_PATH:-/chat/completions}"

cd "$API_DIR"

node --input-type=module <<'NODE'
import { prisma } from './dist/db.js';
import { encryptSecret, decryptSecret } from './dist/security.js';

const modelId = process.env.MODEL_ID || 'seed-gpt-5-5';
const upstreamModel = process.env.UPSTREAM_MODEL || 'gpt-5.5';
const providerKey = process.env.PROVIDER_KEY || 'gpt55_45_default';
const providerName = process.env.PROVIDER_NAME || 'GPT 5.5 45 中转渠道';
const baseUrl = (process.env.BASE_URL || 'http://45.77.211.38:8317/v1').replace(/\/+$/, '');
const endpointPath = process.env.ENDPOINT_PATH || '/chat/completions';
const incomingKey = String(process.env.API_KEY || '').trim();

let provider = await prisma.upstreamProvider.findUnique({ where: { providerKey } });
const existingKey = provider?.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : '';
const finalKey = incomingKey || existingKey;

if (!finalKey || finalKey === 'replace-me') {
  console.error(JSON.stringify({
    ok: false,
    error: '缺少可用 API_KEY。首次创建该渠道时请这样执行：API_KEY=sk-xxx bash repair-gpt55-llm-channel-on-server.sh',
    providerKey,
  }, null, 2));
  process.exit(2);
}

provider = await prisma.upstreamProvider.upsert({
  where: { providerKey },
  update: {
    name: providerName,
    type: 'LLM',
    adapter: 'openai-chat',
    baseUrl,
    endpointPath,
    requestMethod: 'sync',
    defaultModel: upstreamModel,
    timeoutMs: 600000,
    status: 'ACTIVE',
    ...(incomingKey ? { apiKeyEncrypted: encryptSecret(incomingKey) } : {}),
  },
  create: {
    providerKey,
    name: providerName,
    type: 'LLM',
    adapter: 'openai-chat',
    baseUrl,
    endpointPath,
    requestMethod: 'sync',
    defaultModel: upstreamModel,
    timeoutMs: 600000,
    status: 'ACTIVE',
    apiKeyEncrypted: encryptSecret(finalKey),
  },
});

const model = await prisma.aiModel.upsert({
  where: { id: modelId },
  update: {
    providerId: provider.id,
    name: upstreamModel,
    displayName: 'GPT 5.5',
    type: 'LLM',
    adapter: 'openai-chat',
    endpointPath,
    modelKey: upstreamModel,
    status: 'ACTIVE',
  },
  create: {
    id: modelId,
    providerId: provider.id,
    name: upstreamModel,
    displayName: 'GPT 5.5',
    type: 'LLM',
    unit: 'token_usd_ratio',
    inputPriceUsdPer1m: 1,
    outputPriceUsdPer1m: 5,
    cnyPerUsdCost: 0.8,
    creditsPerUsdCost: 80,
    markupRate: 1,
    adapter: 'openai-chat',
    endpointPath,
    modelKey: upstreamModel,
    supports: { chat: true },
    defaults: { pricing: { unit: 'token_usd_ratio', currency: 'credits', creditsPerCny: 100 } },
    protocol: { adapter: 'openai-chat', endpointPath, method: 'sync' },
    status: 'ACTIVE',
  },
});

console.log(JSON.stringify({
  ok: true,
  provider: {
    id: provider.id,
    providerKey: provider.providerKey,
    name: provider.name,
    status: provider.status,
    baseUrl: provider.baseUrl,
    adapter: provider.adapter,
    endpointPath: provider.endpointPath,
    hasKey: Boolean(finalKey),
  },
  model: {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    displayName: model.displayName,
    type: model.type,
    adapter: model.adapter,
    endpointPath: model.endpointPath,
    status: model.status,
  },
}, null, 2));

await prisma.$disconnect();
NODE

echo
echo "修复完成。请刷新后台/画布模型列表，选择渠道 ${PROVIDER_KEY} 下的 GPT 5.5。"
