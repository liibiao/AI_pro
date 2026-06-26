import '../dist/config.js';
import { prisma } from '../dist/db.js';

const adapter = 'aiyunzhi-firefly-gpt-image';
const endpointPath = '/v1/chat/completions';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function identityText(model = {}) {
  return [
    model.id,
    model.modelKey,
    model.name,
    model.displayName,
    model.adapter,
    model.endpointPath,
    model.provider?.providerKey,
    model.provider?.name,
    model.provider?.adapter,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
}

function isGptImage2Pro(model = {}) {
  const text = identityText(model).replace(/[\s_-]+/g, '');
  return text.includes('gptimage2pro') || text.includes('canvasgptimage2pro');
}

function isAiyunzhiGptImage2Distributor(model = {}) {
  if (isGptImage2Pro(model)) return false;
  const text = identityText(model).replace(/[\s_]+/g, '-');
  return text.includes('aiyunzhi-gpt-image-2') || text.includes('canvas-aiyunzhi-gpt-image-2');
}

function modelNameModeFor(model) {
  return isAiyunzhiGptImage2Distributor(model) ? 'literal' : 'template';
}

function mergeProtocol(model, mode) {
  const protocol = isObject(model.protocol) ? model.protocol : {};
  return {
    ...protocol,
    adapter: protocol.adapter || model.adapter || adapter,
    endpointPath,
    endpoint_path: endpointPath,
    method: protocol.method || model.requestMethod || 'sync',
    uploadMode: protocol.uploadMode || protocol.upload_mode || model.uploadMode || 'object_storage',
    upload_mode: protocol.upload_mode || protocol.uploadMode || model.uploadMode || 'object_storage',
    responseType: protocol.responseType || protocol.response_type || 'server_object_storage',
    response_type: protocol.response_type || protocol.responseType || 'server_object_storage',
    upstreamStreamMode: protocol.upstreamStreamMode || protocol.upstream_stream_mode || 'stream',
    upstream_stream_mode: protocol.upstream_stream_mode || protocol.upstreamStreamMode || 'stream',
    modelNameMode: mode,
    model_name_mode: mode,
  };
}

function mergeModelAssembly(model, mode) {
  const current = isObject(model.modelAssembly) ? model.modelAssembly : {};
  if (mode === 'literal') return { ...current, type: 'literal' };
  return {
    ...current,
    type: current.type || 'template',
    template: current.template || 'firefly-gpt-image-{resolution}-{aspectRatioSlug}',
  };
}

async function findTargets() {
  const models = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
        { modelKey: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
        { adapter },
        { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  return models.filter(model => !isGptImage2Pro(model) && (model.adapter === adapter || identityText(model).includes('firefly-gpt-image') || identityText(model).includes('aiyunzhi-gpt-image-2')));
}

async function main() {
  const targets = await findTargets();
  if (!targets.length) throw new Error('No Firefly models found for endpoint repair');

  const seenProviders = new Set();
  for (const model of targets) {
    const mode = modelNameModeFor(model);
    const updated = await prisma.aiModel.update({
      where: { id: model.id },
      data: {
        name: /^firefly-gpt-image/i.test(String(model.name || '')) ? 'firefly-gpt-image' : model.name,
        endpointPath,
        protocol: mergeProtocol(model, mode),
        modelAssembly: mergeModelAssembly(model, mode),
      },
      include: { provider: true },
    });
    if (updated.provider && !seenProviders.has(updated.provider.id)) {
      seenProviders.add(updated.provider.id);
      await prisma.upstreamProvider.update({
        where: { id: updated.provider.id },
        data: {
          endpointPath,
          defaultModel: /^firefly-gpt-image/i.test(String(updated.provider.defaultModel || '')) ? 'firefly-gpt-image' : updated.provider.defaultModel,
        },
      });
    }
    console.log(`[firefly-endpoint] model=${updated.id} provider=${updated.provider?.providerKey || ''} endpoint=${updated.endpointPath} protocolEndpoint=${updated.protocol?.endpointPath || updated.protocol?.endpoint_path || ''} mode=${mode} responseType=${updated.protocol?.responseType || updated.protocol?.response_type || ''}`);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
