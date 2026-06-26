#!/usr/bin/env bash
set -euo pipefail

API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
cd "${API_DIR}"

echo "== time =="
date -Is

node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, compact(entry)]));
}

async function call(model, endpointPath, payload) {
  const url = `${model.provider.baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { status: response.status, body: (await response.text()).slice(0, 1600) };
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const model = await prisma.aiModel.findFirst({
    where: { type: 'LLM', status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    include: { provider: true },
  });
  if (!model?.provider) {
    console.log('no-active-llm-model');
    process.exit(0);
  }

  const endpointPath = model.endpointPath || model.provider.endpointPath || '/chat/completions';
  const base = {
    model: model.name,
    messages: [{ role: 'user', content: '只回复 OK' }],
  };

  console.log(JSON.stringify({
    modelId: model.id,
    modelName: model.name,
    endpointPath,
    adapter: model.adapter,
    providerStatus: model.provider.status,
    providerHost: (() => { try { return new URL(model.provider.baseUrl).host; } catch { return model.provider.baseUrl; } })(),
  }, null, 2));

  const payloadMaxTokens = compact({ ...base, max_tokens: 32 });
  console.log('requestVariant=max_tokens');
  console.log('requestPayload=' + JSON.stringify(payloadMaxTokens));
  console.log('response=' + JSON.stringify(await call(model, endpointPath, payloadMaxTokens)));

  const payloadMaxCompletionTokens = compact({ ...base, max_completion_tokens: 32 });
  console.log('requestVariant=max_completion_tokens');
  console.log('requestPayload=' + JSON.stringify(payloadMaxCompletionTokens));
  console.log('response=' + JSON.stringify(await call(model, endpointPath, payloadMaxCompletionTokens)));

  const payloadNoTokenLimit = compact(base);
  console.log('requestVariant=no_token_limit');
  console.log('requestPayload=' + JSON.stringify(payloadNoTokenLimit));
  console.log('response=' + JSON.stringify(await call(model, endpointPath, payloadNoTokenLimit)));
} catch (error) {
  console.log('reproError=' + (error instanceof Error ? error.message : String(error)));
} finally {
  await prisma.$disconnect();
}
NODE
