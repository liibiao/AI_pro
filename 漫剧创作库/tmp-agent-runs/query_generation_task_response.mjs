import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tasks = await prisma.generationTask.findMany({
  where: {
    type: 'IMAGE',
    OR: [
      { id: 'cmqswoc360001wku8spcnxyh0' },
      { channelKey: 'model_gtp-2-max_mqsufujl' },
      { errorCode: 'IMAGE_RESULT_MISSING' },
      { errorMessage: { contains: '上游响应未包含图片 URL' } },
    ],
  },
  orderBy: { createdAt: 'desc' },
  take: 8,
  include: { model: true, provider: true },
});

function trimLarge(value) {
  if (typeof value === 'string') {
    return value.length > 1200 ? `${value.slice(0, 1200)}...[truncated ${value.length}]` : value;
  }
  if (Array.isArray(value)) return value.map(trimLarge);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, trimLarge(child)]));
  }
  return value;
}

for (const task of tasks) {
  console.log('\n---TASK---');
  console.log(JSON.stringify({
    id: task.id,
    createdAt: task.createdAt,
    status: task.status,
    channelKey: task.channelKey,
    mode: task.mode,
    model: {
      id: task.model.id,
      name: task.model.name,
      displayName: task.model.displayName,
      adapter: task.model.adapter,
      endpointPath: task.model.endpointPath,
      protocol: task.model.protocol,
      defaults: task.model.defaults,
    },
    provider: {
      id: task.provider.id,
      providerKey: task.provider.providerKey,
      name: task.provider.name,
      adapter: task.provider.adapter,
      baseUrl: task.provider.baseUrl,
      endpointPath: task.provider.endpointPath,
      defaultModel: task.provider.defaultModel,
      defaultParams: task.provider.defaultParams,
      status: task.provider.status,
    },
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
    upstreamTaskId: task.upstreamTaskId,
    upstreamRequestId: task.upstreamRequestId,
    requestJson: trimLarge(task.requestJson),
    responseJson: trimLarge(task.responseJson),
    resultJson: trimLarge(task.resultJson),
    resultUrlsJson: task.resultUrlsJson,
    paramsJson: trimLarge(task.paramsJson),
  }, null, 2));
}

await prisma.$disconnect();
