import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });
dotenv.config();

const prisma = new PrismaClient();

function redactProvider(provider) {
  return {
    id: provider.id,
    providerKey: provider.providerKey,
    name: provider.name,
    baseUrl: provider.baseUrl,
    adapter: provider.adapter,
    endpointPath: provider.endpointPath,
    statusEndpointPath: provider.statusEndpointPath,
    uploadMode: provider.uploadMode,
    requestMethod: provider.requestMethod,
    status: provider.status,
    defaultModel: provider.defaultModel,
    hasApiKey: Boolean(String(provider.apiKey || '').trim()),
    models: (provider.models || []).map(model => ({
      id: model.id,
      modelKey: model.modelKey,
      name: model.name,
      displayName: model.displayName,
      type: model.type,
      adapter: model.adapter,
      endpointPath: model.endpointPath,
      statusEndpointPath: model.statusEndpointPath,
      uploadMode: model.uploadMode,
      status: model.status,
    })),
  };
}

async function main() {
  const providerFields = Object.keys(await prisma.upstreamProvider.findFirst({ take: 1 }) || {});
  const modelFields = Object.keys(await prisma.aiModel.findFirst({ take: 1 }) || {});
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { providerKey: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { providerKey: { contains: 'sd2', mode: 'insensitive' } },
        { name: { contains: 'aiyunzhi', mode: 'insensitive' } },
        { name: { contains: '云智', mode: 'insensitive' } },
        { baseUrl: { contains: 'aiyunzhi.top', mode: 'insensitive' } },
      ],
    },
    include: { models: true },
    orderBy: { createdAt: 'asc' },
  });
  const targetIds = [
    'aiyunzhi-sd2-preview-fast',
    'aiyunzhi-sd2-preview',
    'aiyunzhi-sd2-preview-1080p',
    'aiyunzhi-grok-1-5-video',
    'aiyunzhi-grok-3-pro-video',
    'aiyunzhi-veo-3-1',
    'aiyunzhi-veo-3-1-fast',
    'aiyunzhi-firefly-gpt-image',
    'aiyunzhi-gpt-image-2',
    'aiyunzhi-gemini-2-5-flash-image',
    'aiyunzhi-gemini-2-5-flash-image-preview',
    'aiyunzhi-gemini-3-1-flash-image',
    'aiyunzhi-gemini-3-pro-image',
  ];
  const targetModels = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: targetIds } },
        { modelKey: { in: targetIds } },
        { displayName: { contains: 'Aiyunzhi', mode: 'insensitive' } },
        { displayName: { contains: '云智', mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(JSON.stringify({
    providerFields,
    modelFields,
    aiyunzhiProviders: providers.map(redactProvider),
    targetModelCount: targetModels.length,
    targetModels: targetModels.map(model => ({
      id: model.id,
      modelKey: model.modelKey,
      name: model.name,
      displayName: model.displayName,
      type: model.type,
      adapter: model.adapter,
      endpointPath: model.endpointPath,
      statusEndpointPath: model.statusEndpointPath,
      uploadMode: model.uploadMode,
      status: model.status,
      providerKey: model.provider?.providerKey,
      providerBaseUrl: model.provider?.baseUrl,
      providerHasApiKey: Boolean(String(model.provider?.apiKey || '').trim()),
    })),
  }, null, 2));
}

main()
  .catch(err => {
    console.error('[inspect] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
