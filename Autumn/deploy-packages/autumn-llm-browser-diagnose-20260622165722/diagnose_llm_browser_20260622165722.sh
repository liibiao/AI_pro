#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ai-admin/ai-admin-platform/api-server"
cd "$APP_DIR"

export NODE_PATH="$APP_DIR/node_modules"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { signToken } from './dist/security.js';

const prisma = new PrismaClient();

function requestJson(path, token, body) {
  const payload = body ? JSON.stringify(body) : '';
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 4000,
      path,
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (error) => resolve({ status: 0, body: String(error?.message || error) }));
    if (body) req.write(payload);
    req.end();
  });
}

function compactJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const user = await prisma.user.findFirst({
  where: { status: 'ACTIVE' },
  orderBy: { createdAt: 'asc' },
  select: {
    currentSessionId: true,
    email: true,
    id: true,
    nickname: true,
    role: true,
    status: true,
  },
});

if (!user) {
  console.log(JSON.stringify({ error: 'NO_ACTIVE_USER' }, null, 2));
  process.exit(0);
}

const token = signToken({
  clientType: 'CANVAS',
  id: user.id,
  nickname: user.nickname || user.email || 'route-test',
  role: user.role,
  sessionId: user.currentSessionId || undefined,
  status: user.status,
});
const modelsResponse = await requestJson('/api/models?type=LLM', token);
const modelsPayload = compactJson(modelsResponse.body);
const models = Array.isArray(modelsPayload?.items) ? modelsPayload.items : [];
const llmModels = models.map((item) => ({
  id: item.id,
  name: item.name,
  model: item.model,
  displayName: item.displayName,
  type: item.type,
  modelType: item.modelType,
  status: item.status,
  providerStatus: item.provider?.status,
  providerKey: item.providerKey,
  endpointPath: item.endpointPath,
}));

const preferredModel = llmModels[0];
const chatBody = {
  modelId: preferredModel?.id || 'seed-gpt-5-5',
  messages: [{ role: 'user', content: '只回复 OK' }],
  maxOutputTokens: 32,
  timeoutMs: 120000,
};
const chatResponse = await requestJson('/api/generate/llm/chat', token, chatBody);

let accessTail = '';
try {
  accessTail = fs.readFileSync('/var/log/nginx/access.log', 'utf8')
    .split('\n')
    .filter((line) => line.includes('/api/generate/llm/chat'))
    .slice(-8)
    .join('\n');
} catch (error) {
  accessTail = `log read failed: ${error?.message || error}`;
}

console.log(JSON.stringify({
  chatBodyKeys: Object.keys(chatBody),
  chatBodyModelId: chatBody.modelId,
  chatResponseBody: compactJson(chatResponse.body),
  chatStatus: chatResponse.status,
  llmModelCount: llmModels.length,
  llmModels,
  modelsStatus: modelsResponse.status,
  nginxAccessTail: accessTail,
}, null, 2));
await prisma.$disconnect();
NODE
