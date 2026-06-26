import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });
dotenv.config();

const prisma = new PrismaClient();

const FIX_PROTOCOL = {
  adapter: 'openai-edits',
  endpointPath: '/images/edits',
  uploadMode: 'object_storage',
  upload_mode: 'object_storage',
  method: 'sync',
};

function identityText(value) {
  if (!value || typeof value !== 'object') return '';
  return [
    value.id,
    value.providerKey,
    value.modelKey,
    value.name,
    value.displayName,
    value.adapter,
  ].map(item => String(item || '').trim().toLowerCase()).filter(Boolean).join(' ');
}

function isCanvasGptImage2Pro(value) {
  const text = identityText(value);
  const dashed = text.replace(/[\s_]+/g, '-');
  const compact = text.replace(/[\s_-]+/g, '');
  return dashed.includes('canvas-gpt-image-2-pro')
    || dashed.includes('gpt-image-2-pro')
    || compact.includes('canvasgptimage2pro')
    || compact.includes('gptimage2pro');
}

function mergeProtocol(existing) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  return { ...base, ...FIX_PROTOCOL };
}

async function main() {
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { providerKey: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
        { providerKey: { contains: 'canvas_gpt-image-2-pro', mode: 'insensitive' } },
        { name: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
        { name: { contains: 'GPT-Image-2-pro', mode: 'insensitive' } },
      ],
    },
    include: { models: true },
  });

  const providerIds = new Set(providers.filter(isCanvasGptImage2Pro).map(provider => provider.id));
  const directModels = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
        { modelKey: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
        { displayName: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
        { displayName: { contains: 'GPT-Image-2-pro', mode: 'insensitive' } },
      ],
    },
  });
  directModels.filter(isCanvasGptImage2Pro).forEach(model => providerIds.add(model.providerId));

  const targetProviders = providers.filter(provider => providerIds.has(provider.id));
  const providerModels = providerIds.size
    ? await prisma.aiModel.findMany({ where: { providerId: { in: Array.from(providerIds) }, type: 'IMAGE' } })
    : [];
  const targetModels = new Map();
  [...directModels, ...providerModels].forEach(model => {
    if (model.type !== 'IMAGE') return;
    if (!providerIds.has(model.providerId) && !isCanvasGptImage2Pro(model)) return;
    targetModels.set(model.id, model);
  });

  for (const provider of targetProviders) {
    await prisma.upstreamProvider.update({
      where: { id: provider.id },
      data: {
        adapter: 'openai-edits',
        endpointPath: '/images/edits',
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        requestMethod: 'sync',
      },
    });
    console.log(`[fix] provider ${provider.providerKey} -> openai-edits /images/edits object_storage`);
  }

  for (const model of targetModels.values()) {
    await prisma.aiModel.update({
      where: { id: model.id },
      data: {
        name: 'gpt-image-2',
        adapter: 'openai-edits',
        endpointPath: '/images/edits',
        statusEndpointPath: null,
        uploadMode: 'object_storage',
        protocol: mergeProtocol(model.protocol),
      },
    });
    console.log(`[fix] model ${model.id}/${model.displayName} -> gpt-image-2 openai-edits /images/edits object_storage`);
  }

  if (!targetProviders.length && !targetModels.size) {
    console.log('[fix] no canvas GPT-Image2 Pro provider/model rows matched; code route guard still remains active');
  }
}

main()
  .catch(err => {
    console.error('[fix] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
