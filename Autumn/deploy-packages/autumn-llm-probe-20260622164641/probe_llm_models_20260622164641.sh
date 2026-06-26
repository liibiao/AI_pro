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

function endpointFor(model) {
  return (model.endpointPath || model.provider?.endpointPath || '/chat/completions').replace(/\{model\}/g, encodeURIComponent(model.name));
}

function payloadFor(model, endpointPath) {
  const prompt = '只回复 OK';
  if (/generateContent/.test(endpointPath) || /gemini/i.test(model.adapter || model.provider?.adapter || '')) {
    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 32 },
    };
  }
  if (/\/responses(?:\/|$)/.test(endpointPath) || /responses/i.test(model.adapter || model.provider?.adapter || '')) {
    return {
      model: model.name,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      max_output_tokens: 32,
    };
  }
  return compact({
    model: model.name,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 32,
  });
}

async function call(model, endpointPath, payload) {
  const url = `${model.provider.baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (model.provider.apiKey) {
      headers.Authorization = `Bearer ${model.provider.apiKey}`;
      headers['x-goog-api-key'] = model.provider.apiKey;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { status: response.status, body: (await response.text()).slice(0, 350) };
  } catch (error) {
    return { status: 'ERR', body: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const models = await prisma.aiModel.findMany({
    where: { type: 'LLM' },
    orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    include: { provider: true },
  });
  for (const model of models) {
    if (!model.provider) continue;
    const endpointPath = endpointFor(model);
    const result = await call(model, endpointPath, payloadFor(model, endpointPath));
    let body = result.body;
    body = body.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
    console.log(JSON.stringify({
      modelId: model.id,
      modelName: model.name,
      modelStatus: model.status,
      modelAdapter: model.adapter,
      endpointPath,
      providerKey: model.provider.providerKey,
      providerStatus: model.provider.status,
      providerAdapter: model.provider.adapter,
      providerHost: (() => { try { return new URL(model.provider.baseUrl).host; } catch { return model.provider.baseUrl; } })(),
      status: result.status,
      body,
    }));
  }
} finally {
  await prisma.$disconnect();
}
NODE
