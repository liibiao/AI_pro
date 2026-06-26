const { prisma } = await import(`file://${process.cwd()}/dist/db.js`);
const { queryGenerationTaskForPrincipal } = await import(`file://${process.cwd()}/dist/modules/generation/routes.js`);

const tasks = await prisma.generationTask.findMany({
  where: { status: 'RUNNING', type: 'VIDEO' },
  include: {
    model: { select: { id: true, modelKey: true, name: true, displayName: true, adapter: true } },
    provider: { select: { id: true, providerKey: true, name: true, adapter: true } },
  },
  orderBy: { updatedAt: 'asc' },
  take: 100,
});

const targets = tasks.filter(task => [
  task.channelKey,
  task.modelId,
  task.model?.id,
  task.model?.modelKey,
  task.model?.name,
  task.model?.displayName,
  task.model?.adapter,
  task.provider?.providerKey,
  task.provider?.name,
  task.provider?.adapter,
].join(' ').toLowerCase().match(/lingdong|sd-2-vip|sd 2 vip/));

console.log(`lingdong running targets: ${targets.length}`);

for (const task of targets) {
  try {
    const result = await queryGenerationTaskForPrincipal(task.id, {
      type: 'PERSONAL_API',
      billingUserId: task.userId,
      userId: task.userId,
      apiTokenId: 'deploy-refresh-lingdong-vip',
      discountMode: 'FOLLOW_USER_MEMBERSHIP',
    });
    console.log(`${task.id} | ${task.model?.displayName || task.modelId} | ${task.progress}% -> ${result.task.status} ${result.task.progress}%`);
  } catch (err) {
    console.log(`${task.id} | refresh failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await prisma.$disconnect();
