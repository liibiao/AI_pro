#!/usr/bin/env bash
set -euo pipefail

API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"

echo "== time =="
date -Is

echo
echo "== recent access status =="
grep -n "generate/llm/chat" /var/log/nginx/access.log 2>/dev/null | tail -8 || true

cd "${API_DIR}"

echo
echo "== db summary via prisma =="
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const models = await prisma.aiModel.findMany({
    where: { type: 'LLM' },
    orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    include: { provider: true },
  });
  console.log(JSON.stringify(models.map((model) => ({
    id: model.id,
    key: model.modelKey,
    name: model.name,
    displayName: model.displayName,
    status: model.status,
    endpointPath: model.endpointPath,
    adapter: model.adapter,
    provider: model.provider ? {
      key: model.provider.providerKey,
      name: model.provider.name,
      status: model.provider.status,
      baseUrlHost: (() => {
        try { return new URL(model.provider.baseUrl).host; } catch { return model.provider.baseUrl; }
      })(),
      endpointPath: model.provider.endpointPath,
      adapter: model.provider.adapter,
      timeoutMs: model.provider.timeoutMs,
    } : null,
  })), null, 2));

  const usages = await prisma.modelUsage.findMany({
    where: {
      modelType: 'LLM',
      createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  console.log('recentUsages=' + JSON.stringify(usages.map((usage) => ({
    createdAt: usage.createdAt,
    modelId: usage.modelId,
    status: usage.status,
    errorMessage: usage.errorMessage,
    requestKeys: usage.requestJson && typeof usage.requestJson === 'object' ? Object.keys(usage.requestJson) : null,
    requestModel: usage.requestJson?.model ?? null,
    hasMessages: Array.isArray(usage.requestJson?.messages),
    hasInput: Boolean(usage.requestJson?.input),
    responseKeys: usage.responseJson && typeof usage.responseJson === 'object' ? Object.keys(usage.responseJson) : null,
  })), null, 2));
} finally {
  await prisma.$disconnect();
}
NODE

echo
echo "== reproduce upstream with active llm model =="
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function resolveEndpointPath(endpointPath, variables = {}) {
  const raw = endpointPath || '/chat/completions';
  return raw.replace(/\{model\}/g, encodeURIComponent(variables.model || ''));
}

function compact(value) {
  if (Array.isArray(value)) {
    return value.map(compact);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, compact(entry)]));
}

function buildPayload(modelName, endpointPath, body, tokenField = 'max_tokens') {
  if (/\/responses(?:\/|$)/.test(endpointPath)) {
    return compact({
      model: modelName,
      input: body.messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
      max_output_tokens: body.maxOutputTokens,
    });
  }
  return compact({
    model: modelName,
    messages: body.messages,
    [tokenField]: body.maxOutputTokens,
  });
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
    return { status: response.status, body: (await response.text()).slice(0, 1200) };
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const model = await prisma.aiModel.findFirst({
    where: { type: 'LLM', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    include: { provider: true },
  });
  if (!model || !model.provider) {
    console.log('no-active-llm-model');
    process.exit(0);
  }
  const endpointPath = resolveEndpointPath(model.endpointPath || model.provider.endpointPath || '/chat/completions', { model: model.name });
  const body = { messages: [{ role: 'user', content: '只回复 OK' }], maxOutputTokens: 32 };
  console.log(JSON.stringify({
    modelId: model.id,
    modelName: model.name,
    endpointPath,
    providerHost: (() => { try { return new URL(model.provider.baseUrl).host; } catch { return model.provider.baseUrl; } })(),
  }, null, 2));

  const payloadMaxTokens = buildPayload(model.name, endpointPath, body, 'max_tokens');
  console.log('payloadKeys=max_tokens:' + Object.keys(payloadMaxTokens).join(','));
  const resultMaxTokens = await call(model, endpointPath, payloadMaxTokens);
  console.log('resultMaxTokens=' + JSON.stringify(resultMaxTokens));

  if (!/\/responses(?:\/|$)/.test(endpointPath)) {
    const payloadMaxCompletionTokens = buildPayload(model.name, endpointPath, body, 'max_completion_tokens');
    console.log('payloadKeys=max_completion_tokens:' + Object.keys(payloadMaxCompletionTokens).join(','));
    const resultMaxCompletionTokens = await call(model, endpointPath, payloadMaxCompletionTokens);
    console.log('resultMaxCompletionTokens=' + JSON.stringify(resultMaxCompletionTokens));
  }
} catch (error) {
  console.log('reproError=' + (error instanceof Error ? error.message : String(error)));
} finally {
  await prisma.$disconnect();
}
NODE
