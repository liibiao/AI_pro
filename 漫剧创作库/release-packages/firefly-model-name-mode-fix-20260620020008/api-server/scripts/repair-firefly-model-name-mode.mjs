import '../dist/config.js';
import { prisma } from '../dist/db.js';

const adapter = 'aiyunzhi-firefly-gpt-image';
const literalMode = 'literal';
const templateMode = 'template';
const fireflyTemplate = 'firefly-gpt-image-{resolution}-{aspectRatioSlug}';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stripFireflyGeometry(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (/^firefly-gpt-image/i.test(raw)) {
    return raw.replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i, '') || 'firefly-gpt-image';
  }
  return raw;
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
    model.provider?.baseUrl,
    model.provider?.adapter,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ');
}

function isGptImage2Pro(model = {}) {
  const text = identityText(model).replace(/[\s_-]+/g, '');
  return text.includes('gptimage2pro') || text.includes('canvasgptimage2pro');
}

function isAiyunzhiGptImage2Distributor(model = {}) {
  if (isGptImage2Pro(model)) return false;
  const text = identityText(model);
  const dashed = text.replace(/[\s_]+/g, '-');
  const compact = text.replace(/[\s_-]+/g, '');
  return dashed.includes('aiyunzhi-gpt-image-2')
    || dashed.includes('canvas-aiyunzhi-gpt-image-2')
    || compact.includes('aiyunzhigptimage2')
    || compact.includes('canvasaiyunzhigptimage2');
}

function isFireflyDirectModel(model = {}) {
  if (isGptImage2Pro(model)) return false;
  const text = identityText(model);
  return text.includes('firefly-gpt-image') || text.includes('aiyunzhi-firefly-gpt-image');
}

function modelNameModeFor(model) {
  return isAiyunzhiGptImage2Distributor(model) ? literalMode : templateMode;
}

function mergeProtocol(model, mode) {
  const protocol = isObject(model.protocol) ? model.protocol : {};
  const endpointPath = protocol.endpointPath || protocol.endpoint_path || model.endpointPath || model.provider?.endpointPath || '/v1/chat/completions';
  return {
    ...protocol,
    adapter: protocol.adapter || model.adapter || adapter,
    endpointPath,
    endpoint_path: protocol.endpoint_path || endpointPath,
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
  if (mode === literalMode) return { ...current, type: literalMode };
  return {
    ...current,
    type: current.type || templateMode,
    template: current.template || fireflyTemplate,
  };
}

async function findTargets() {
  const models = await prisma.aiModel.findMany({
    where: {
      OR: [
        { id: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
        { modelKey: { in: ['canvas-aiyunzhi-gpt-image-2', 'aiyunzhi-gpt-image-2', 'canvas-aiyunzhi-firefly-gpt-image', 'aiyunzhi-firefly-gpt-image'] } },
        { modelKey: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
        { name: { contains: 'firefly-gpt-image', mode: 'insensitive' } },
        { adapter },
      ],
    },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  return models.filter(model => !isGptImage2Pro(model) && (isAiyunzhiGptImage2Distributor(model) || isFireflyDirectModel(model) || model.adapter === adapter));
}

async function main() {
  const targets = await findTargets();
  if (!targets.length) throw new Error('No Firefly/GPT Image 2 models found for model-name-mode repair');

  for (const model of targets) {
    const mode = modelNameModeFor(model);
    const nextProtocol = mergeProtocol(model, mode);
    const nextAssembly = mergeModelAssembly(model, mode);
    const data = {
      protocol: nextProtocol,
      modelAssembly: nextAssembly,
    };
    if (mode === literalMode && /^firefly-gpt-image/i.test(String(model.name || ''))) {
      data.name = stripFireflyGeometry(model.name);
    }
    const updated = await prisma.aiModel.update({
      where: { id: model.id },
      data,
      include: { provider: true },
    });

    if (mode === literalMode && updated.provider && /^firefly-gpt-image/i.test(String(updated.provider.defaultModel || ''))) {
      await prisma.upstreamProvider.update({
        where: { id: updated.provider.id },
        data: { defaultModel: stripFireflyGeometry(updated.provider.defaultModel) },
      });
    }

    console.log(`[firefly-model-name-mode] model=${updated.id} key=${updated.modelKey} provider=${updated.provider?.providerKey || ''} mode=${mode} real=${updated.name} adapter=${updated.adapter}`);
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
