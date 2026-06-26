import '../dist/config.js';
import { prisma } from '../dist/db.js';

const ADAPTER = 'aiyunzhi-firefly-gpt-image';
const ENDPOINT = '/v1/chat/completions';
const BASE_URL = 'https://aiyunzhi.top';
const TARGETS = [
  { id: 'canvas-aiyunzhi-firefly-gpt-image', mode: 'template' },
  { id: 'canvas-aiyunzhi-gpt-image-2', mode: 'literal' },
];

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nextProtocol(current, mode) {
  return {
    ...asObject(current),
    adapter: ADAPTER,
    endpointPath: ENDPOINT,
    endpoint_path: ENDPOINT,
    method: 'sync',
    uploadMode: 'object_storage',
    upload_mode: 'object_storage',
    modelNameMode: mode,
    model_name_mode: mode,
  };
}

function nextSupports(current) {
  return {
    ...asObject(current),
    txt2img: true,
    img2img: true,
    imageToImage: true,
    image2image: true,
    image_to_image: true,
    storyboard: true,
  };
}

function nextCapabilities(current) {
  return {
    ...asObject(current),
    maxImages: 6,
    imageSizes: ['1K', '2K', '4K'],
    resolutions: ['1k', '2k', '4k'],
    imageResolutions: ['1k', '2k', '4k'],
    image_resolutions: ['1k', '2k', '4k'],
    aspectRatios: ['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16'],
  };
}

function nextModelAssembly(current, mode) {
  return {
    ...asObject(current),
    type: mode,
    template: 'firefly-gpt-image-{resolution}-{aspectRatioSlug}',
  };
}

try {
  for (const target of TARGETS) {
    const model = await prisma.aiModel.findUnique({ where: { id: target.id }, include: { provider: true } });
    if (!model) {
      console.log(`[repair] skip missing model ${target.id}`);
      continue;
    }
    if (model.providerId) {
      await prisma.upstreamProvider.update({
        where: { id: model.providerId },
        data: {
          adapter: ADAPTER,
          endpointPath: ENDPOINT,
          uploadMode: 'object_storage',
          requestMethod: 'sync',
          defaultModel: 'firefly-gpt-image',
          baseUrl: model.provider?.baseUrl || BASE_URL,
          defaultParams: nextProtocol(model.provider?.defaultParams, target.mode),
        },
      });
    }
    const updated = await prisma.aiModel.update({
      where: { id: target.id },
      data: {
        adapter: ADAPTER,
        endpointPath: ENDPOINT,
        uploadMode: 'object_storage',
        protocol: nextProtocol(model.protocol, target.mode),
        supports: nextSupports(model.supports),
        capabilities: nextCapabilities(model.capabilities),
        modelAssembly: nextModelAssembly(model.modelAssembly, target.mode),
      },
      include: { provider: true },
    });
    console.log(`[repair] ${updated.id} adapter=${updated.adapter} endpoint=${updated.endpointPath} mode=${target.mode} providerEndpoint=${updated.provider?.endpointPath || ''}`);
  }
} finally {
  await prisma.$disconnect();
}
