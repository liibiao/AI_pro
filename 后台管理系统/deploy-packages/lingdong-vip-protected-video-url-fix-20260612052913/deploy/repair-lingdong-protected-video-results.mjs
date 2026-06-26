import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = process.argv[2] || '/var/www/ai-admin/ai-admin-platform';
const apiDist = path.join(appRoot, 'api-server', 'dist');
const { prisma } = await import(pathToFileURL(path.join(apiDist, 'db.js')).href);
const {
  isProtectedProviderResultUrl,
  materializeMediaResultUrl,
} = await import(pathToFileURL(path.join(apiDist, 'modules/generation/adapters/registry.js')).href);

const TARGET_TASK_IDS = ['cmq9yonsq0001wka7bseiofo6'];
const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function collectResultUrls(task) {
  const urls = [];
  const push = value => {
    const raw = String(value || '').trim();
    if (raw && !urls.includes(raw)) urls.push(raw);
  };
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    visit(value.url);
    visit(value.outputs);
    visit(value.video_url);
    visit(value.result_url);
  };
  visit(task.resultUrlsJson);
  visit(task.resultJson);
  return urls;
}

function mergeResultJson(resultJson, urls) {
  const base = isRecord(resultJson) ? { ...resultJson } : {};
  return {
    ...base,
    url: urls[0] || base.url || '',
    outputs: urls,
  };
}

let checked = 0;
let updated = 0;
try {
  const tasks = await prisma.generationTask.findMany({
    where: {
      status: 'SUCCESS',
      type: 'VIDEO',
      OR: [
        { id: { in: TARGET_TASK_IDS } },
        { updatedAt: { gte: cutoff } },
        { completedAt: { gte: cutoff } },
      ],
    },
    include: { provider: true, model: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  for (const task of tasks) {
    const urls = collectResultUrls(task).filter(url => isProtectedProviderResultUrl(task.provider, url));
    if (!urls.length) continue;
    checked += 1;
    const resolved = [];
    for (const url of urls) {
      const next = await materializeMediaResultUrl(task.provider, url, 'video').catch(() => '');
      if (next && next !== url && !resolved.includes(next)) resolved.push(next);
    }
    if (!resolved.length) continue;
    await prisma.generationTask.update({
      where: { id: task.id },
      data: {
        resultJson: mergeResultJson(task.resultJson, resolved),
        resultUrlsJson: resolved,
        updatedAt: new Date(),
      },
    });
    updated += 1;
    console.log(`[repair] updated ${task.id} -> ${resolved[0]}`);
  }
  console.log(`[repair] checked=${checked} updated=${updated}`);
} finally {
  await prisma.$disconnect();
}
