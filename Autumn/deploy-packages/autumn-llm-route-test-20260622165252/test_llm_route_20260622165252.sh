#!/usr/bin/env bash
set -euo pipefail

API_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
cd "${API_DIR}"

echo "== time =="
date -Is

node --input-type=module <<'NODE'
import { PrismaClient } from '@prisma/client';
import { signToken } from './dist/security.js';
const prisma = new PrismaClient();

async function postJson(token, payload, label) {
  const response = await fetch('http://127.0.0.1:4000/api/generate/llm/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  console.log(label + '=' + JSON.stringify({ status: response.status, body: text.slice(0, 1200) }));
}

try {
  const user = await prisma.user.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { wallet: true },
  });
  if (!user) {
    console.log('no-active-user');
    process.exit(0);
  }
  const token = signToken({
    id: user.id,
    role: user.role,
    nickname: user.nickname || user.email || 'route-test',
    status: user.status,
    sessionId: user.currentSessionId || undefined,
    clientType: 'CANVAS',
  });
  console.log(JSON.stringify({
    userId: user.id,
    userStatus: user.status,
    balance: user.wallet?.balance,
  }));

  await postJson(token, {
    modelId: 'seed-gpt-5-5',
    messages: [{ role: 'user', content: '只回复 OK' }],
    maxOutputTokens: 32,
    timeoutMs: 120000,
  }, 'cleanBody');

  await postJson(token, {
    modelId: 'seed-gpt-5-5',
    messages: [{ role: 'user', content: '只回复 OK' }],
    maxOutputTokens: 32,
    endpointPath: '/chat/completions',
    extra: {
      canvasNodeType: 'textPrompt',
      plannerTemplate: '# test',
      selectedModels: { language: { id: 'seed-gpt-5-5' } },
    },
    timeoutMs: 120000,
  }, 'oldBody');
} finally {
  await prisma.$disconnect();
}
NODE
