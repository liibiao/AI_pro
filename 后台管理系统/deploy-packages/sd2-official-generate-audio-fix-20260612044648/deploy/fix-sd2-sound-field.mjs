const { prisma } = await import(`file://${process.cwd()}/dist/db.js`);

const targetIds = ['canvas-sd2', 'canvas-sd2-fast', 'canvas-sd2-full'];
const targetKeys = ['sd2', 'sd2-fast', 'sd2-full'];

const rows = await prisma.aiModel.findMany({
  where: {
    OR: [
      { id: { in: targetIds } },
      { modelKey: { in: targetKeys } },
    ],
  },
  select: {
    id: true,
    modelKey: true,
    name: true,
    displayName: true,
    capabilities: true,
  },
});

for (const row of rows) {
  const capabilities = row.capabilities && typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
    ? { ...row.capabilities }
    : {};
  const before = capabilities.soundControlField;
  if (!before || before === 'metadata.enableSound') capabilities.soundControlField = 'generate_audio';
  if (capabilities.defaultEnableSound == null) capabilities.defaultEnableSound = true;
  await prisma.aiModel.update({
    where: { id: row.id },
    data: { capabilities },
  });
  console.log(`${row.id} | ${row.displayName} | soundControlField: ${String(before || '(empty)')} -> ${String(capabilities.soundControlField)}`);
}

await prisma.$disconnect();
