#!/usr/bin/env bash
set -euo pipefail

API_SERVER="${API_SERVER:-/var/www/ai-admin/ai-admin-platform/api-server}"
cd "$API_SERVER"

node --input-type=module <<'NODE'
import './dist/config.js';
import { prisma } from './dist/db.js';
import { decryptSecret } from './dist/security.js';

const provider = await prisma.upstreamProvider.findUnique({ where: { id: 'canvas-provider-seedance-full' } });
if (!provider) throw new Error('canvas-provider-seedance-full not found');
const key = decryptSecret(provider.apiKeyEncrypted || '');
if (!key || key.startsWith('replace-with-')) throw new Error('seedance-full API key is not configured');

const baseUrl = String(provider.baseUrl || '').replace(/\/+$/, '');
const url = baseUrl + '/seedance-full/generate/test';
const cases = [
  { prompt: 'Seedance2.0 满血接口格式测试 720p', model: 'sz-seedance2', seconds: 10, aspect_ratio: '9:16', resolution: '720p' },
  { prompt: 'Seedance2.0 满血接口格式测试 1080p', model: 'sz-seedance2-1080p', seconds: 10, aspect_ratio: '16:9', resolution: '1080p' },
];

for (const body of cases) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(JSON.stringify({
    case: body.resolution,
    model: body.model,
    status: response.status,
    ok: response.ok,
    body: text.slice(0, 500),
  }));
  if (!response.ok) process.exitCode = 1;
}

await prisma.$disconnect();
NODE
