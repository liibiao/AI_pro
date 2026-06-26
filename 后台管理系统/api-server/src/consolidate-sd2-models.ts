import './config.js';
import { prisma } from './db.js';

const mappings = [
  {
    targetModelId: 'canvas-sd2-fast',
    legacyModelIds: ['canvas-sd2-720p-fast', 'canvas-sd2-1080p-fast'],
    name: 'sd2-fast',
    displayName: 'SD 2.0 Fast',
    modelAssembly: { type: 'template', template: 'sd2-{resolution}-fast' },
    unit: 'second',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
  },
  {
    targetModelId: 'canvas-sd2-full',
    legacyModelIds: ['canvas-sd2-720p', 'canvas-sd2-1080p'],
    name: 'sd2-full',
    displayName: 'SD 2.0 Full',
    modelAssembly: { type: 'template', template: 'sd2-{resolution}' },
    unit: 'second',
    endpointPath: '/videos',
    statusEndpointPath: '/videos/{taskId}',
  },
  {
    targetModelId: 'canvas-sd2',
    legacyModelIds: ['canvas-seedance-2'],
    name: 'seedance-2',
    displayName: 'SD 2.0',
    modelAssembly: { type: 'passthrough' },
    unit: 'generation',
    endpointPath: '/video/generations',
    statusEndpointPath: '/video/generations/{taskId}',
  },
] as const;
const legacyModelIds = mappings.flatMap(mapping => [...mapping.legacyModelIds]);
const legacyProviderIds = legacyModelIds.map(modelId => modelId.replace(/^canvas-/, 'canvas-provider-'));

async function main() {
  for (const mapping of mappings) {
    const target = await prisma.aiModel.update({
      where: { id: mapping.targetModelId },
      data: {
        name: mapping.name,
        displayName: mapping.displayName,
        modelAssembly: mapping.modelAssembly,
        unit: mapping.unit,
        endpointPath: mapping.endpointPath,
        statusEndpointPath: mapping.statusEndpointPath,
        status: 'ACTIVE',
      },
      include: { provider: true },
    }).catch(() => null);
    if (!target) throw new Error(`Target SD model is missing: ${mapping.targetModelId}`);
    await prisma.upstreamProvider.update({
      where: { id: target.providerId },
      data: {
        endpointPath: mapping.endpointPath,
        statusEndpointPath: mapping.statusEndpointPath,
        status: 'ACTIVE',
      },
    });

    for (const legacyModelId of mapping.legacyModelIds) {
      const legacy = await prisma.aiModel.findUnique({
        where: { id: legacyModelId },
        include: { provider: true },
      });
      if (!legacy) {
        console.log(`- skip missing legacy model ${legacyModelId}`);
        continue;
      }

      await prisma.$transaction(async tx => {
        await tx.modelUsage.updateMany({
          where: { modelId: legacy.id },
          data: { modelId: target.id },
        });
        await tx.generationTask.updateMany({
          where: {
            OR: [
              { modelId: legacy.id },
              { providerId: legacy.providerId },
            ],
          },
          data: {
            modelId: target.id,
            providerId: target.providerId,
            channelKey: target.provider.providerKey,
          },
        });
        await tx.providerHealthLog.updateMany({
          where: {
            OR: [
              { modelId: legacy.id },
              { providerId: legacy.providerId },
            ],
          },
          data: {
            modelId: target.id,
            providerId: target.providerId,
          },
        });
        await tx.aiModel.delete({ where: { id: legacy.id } });
        await tx.upstreamProvider.deleteMany({
          where: {
            id: legacy.providerId,
            models: { none: {} },
            tasks: { none: {} },
            healthLogs: { none: {} },
          },
        });
      });

      console.log(`- consolidated ${legacy.id} -> ${target.id}`);
    }
  }

  const activeModels = await prisma.aiModel.findMany({
    where: {
      id: { in: mappings.map(item => item.targetModelId) },
      status: 'ACTIVE',
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      displayName: true,
      providerId: true,
      modelAssembly: true,
    },
  });
  if (activeModels.length !== mappings.length) {
    throw new Error(`Expected ${mappings.length} active SD models, found ${activeModels.length}`);
  }
  const [remainingLegacyModels, remainingLegacyProviders] = await Promise.all([
    prisma.aiModel.count({ where: { id: { in: legacyModelIds } } }),
    prisma.upstreamProvider.count({ where: { id: { in: legacyProviderIds } } }),
  ]);
  if (remainingLegacyModels || remainingLegacyProviders) {
    throw new Error(`Legacy SD rows remain: models=${remainingLegacyModels}, providers=${remainingLegacyProviders}`);
  }

  console.log('SD 2.0 channel consolidation complete.');
  activeModels.forEach(model => console.log(`- ${model.id}: ${model.displayName} (${model.name})`));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
