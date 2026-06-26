#!/usr/bin/env bash
set -euo pipefail

API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
cd "${API_DIR}"

echo "== time =="
date -Is

node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
import { callUpstreamJson } from './dist/upstream.js';
import { decryptSecret } from './dist/security.js';

const prisma = new PrismaClient();
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
  const decrypted = decryptSecret(model.provider.apiKeyEncrypted);
  console.log(JSON.stringify({
    modelId: model.id,
    providerKey: model.provider.providerKey,
    providerStatus: model.provider.status,
    hasApiKeyEncrypted: Boolean(model.provider.apiKeyEncrypted),
    decryptedKeyLength: decrypted ? decrypted.length : 0,
    endpointPath,
  }, null, 2));

  const payload = {
    model: model.name,
    messages: [{ role: 'user', content: '只回复 OK' }],
    max_tokens: 32,
  };
  try {
    const result = await callUpstreamJson(model.provider, endpointPath, payload, 30000);
    console.log('backendCallResult=' + JSON.stringify({
      ok: true,
      keys: result && typeof result === 'object' ? Object.keys(result) : [],
      text: String(result?.choices?.[0]?.message?.content || result?.text || result?.output_text || '').slice(0, 200),
    }));
  } catch (error) {
    console.log('backendCallError=' + JSON.stringify({
      name: error?.name,
      status: error?.status,
      code: error?.code,
      message: error?.message,
      upstreamStatus: error?.upstreamStatus,
      responseJson: error?.responseJson,
    }));
  }
} finally {
  await prisma.$disconnect();
}
NODE
