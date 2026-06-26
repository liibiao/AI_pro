import { prisma } from './db.js';

async function main() {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: 'database', ok: true });
  } catch (err) {
    checks.push({ name: 'database', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  const adminCount = await prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }).catch(() => 0);
  checks.push({ name: 'admin_user', ok: adminCount > 0, detail: `${adminCount} admin users` });

  const providerCount = await prisma.upstreamProvider.count().catch(() => 0);
  checks.push({ name: 'upstream_provider', ok: providerCount > 0, detail: `${providerCount} providers` });

  const activeModels = await prisma.aiModel.groupBy({ by: ['type'], where: { status: 'ACTIVE' }, _count: { id: true } }).catch(() => []);
  const modelSummary = Object.fromEntries(activeModels.map(item => [item.type, item._count.id]));
  checks.push({ name: 'image_model', ok: Number(modelSummary.IMAGE || 0) > 0, detail: `${modelSummary.IMAGE || 0} active image models` });
  checks.push({ name: 'video_model', ok: Number(modelSummary.VIDEO || 0) > 0, detail: `${modelSummary.VIDEO || 0} active video models` });
  checks.push({ name: 'llm_model', ok: Number(modelSummary.LLM || 0) > 0, detail: `${modelSummary.LLM || 0} active llm models` });

  const failed = checks.filter(item => !item.ok);
  checks.forEach(item => {
    const mark = item.ok ? 'OK' : 'FAIL';
    console.log(`[${mark}] ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
  });

  if (failed.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
