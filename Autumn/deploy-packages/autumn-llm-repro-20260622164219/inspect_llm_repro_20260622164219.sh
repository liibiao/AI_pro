#!/usr/bin/env bash
set -euo pipefail

API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"

echo "== time =="
date -Is

echo
echo "== node/api processes =="
ps -eo pid,ppid,user,lstart,cmd | grep -E "node|tsx|api-server|dist/app" | grep -v grep || true

echo
echo "== service hints =="
systemctl list-units --type=service --all 2>/dev/null | grep -Ei "ai|admin|api|node|pm2" || true

echo
echo "== local api health =="
curl -sS -o /tmp/llm-health.txt -w "%{http_code}\n" http://127.0.0.1:4000/api/models || true
head -c 220 /tmp/llm-health.txt 2>/dev/null || true
echo

echo
echo "== route code around llm chat =="
if [[ -f "${API_DIR}/src/modules/generate/routes.ts" ]]; then
  nl -ba "${API_DIR}/src/modules/generate/routes.ts" | sed -n '170,315p'
elif [[ -f "${API_DIR}/dist/modules/generate/routes.js" ]]; then
  nl -ba "${API_DIR}/dist/modules/generate/routes.js" | sed -n '160,300p'
fi

echo
echo "== db summary via prisma =="
cd "${API_DIR}"
node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const models = await prisma.model.findMany({
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

function buildPayload(modelName, endpointPath, body) {
  if (/\/responses(?:\/|$)/.test(endpointPath)) {
    return {
      model: modelName,
      input: body.messages.map((message) => ({
        role: message.role,
        content: [{ type: 'input_text', text: message.content }],
      })),
      max_output_tokens: body.maxOutputTokens,
    };
  }
  return {
    model: modelName,
    messages: body.messages,
    temperature: body.temperature,
    max_tokens: body.maxOutputTokens,
  };
}

try {
  const model = await prisma.model.findFirst({
    where: { type: 'LLM', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    include: { provider: true },
  });
  if (!model || !model.provider) {
    console.log('no-active-llm-model');
    process.exit(0);
  }
  const endpointPath = resolveEndpointPath(model.endpointPath || model.provider.endpointPath || '/chat/completions', { model: model.name });
  const payload = buildPayload(model.name, endpointPath, {
    messages: [{ role: 'user', content: '只回复 OK' }],
    maxOutputTokens: 32,
  });
  const url = `${model.provider.baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
  console.log(JSON.stringify({
    modelId: model.id,
    modelName: model.name,
    endpointPath,
    providerHost: (() => { try { return new URL(model.provider.baseUrl).host; } catch { return model.provider.baseUrl; } })(),
    payload,
  }, null, 2));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${model.provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  const text = await response.text();
  console.log('upstreamStatus=' + response.status);
  console.log('upstreamBody=' + text.slice(0, 1200));
} catch (error) {
  console.log('reproError=' + (error instanceof Error ? error.message : String(error)));
} finally {
  await prisma.$disconnect();
}
NODE
