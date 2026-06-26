import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-video-${stamp}`);
}

function insertAfter(text, needle, insert, label, file) {
  if (text.includes(insert.trim())) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${needle}${insert}`);
}

function insertBefore(text, needle, insert, label, file) {
  if (text.includes('async function submitFullbloodVideo')) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${insert.trimEnd()}\n\n${needle}`);
}

const tsBlock = `
function fullbloodVideoSize(aspectRatio: string) {
  return aspectRatio === '9:16' ? '720x1280' : '1280x720';
}

function fullbloodVideoMetadata(ctx: AdapterContext, aspectRatio: string, seconds: number) {
  const rawMetadata = isRecord(ctx.params.metadata) ? ctx.params.metadata : {};
  return compactJson({
    ...rawMetadata,
    aspect_ratio: aspectRatio,
    requestedAspectRatio: aspectRatio,
    fixedSeconds: seconds,
  });
}

async function submitFullbloodVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx);
  const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16'], '16:9');
  const seconds = 15;
  const configuredSize = String(ctx.params.size || ctx.params.videoSize || ctx.params.video_size || '').trim();
  const requestJson = compactJson({
    model: ctx.model.name,
    prompt: ctx.prompt,
    size: configuredSize || fullbloodVideoSize(aspectRatio),
    seconds: String(seconds),
    images: imageUrls,
    metadata: fullbloodVideoMetadata(ctx, aspectRatio, seconds),
  });
  const endpointPath = ctx.model.endpointPath || ctx.provider.endpointPath || '/videos';
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(endpointPath, ctx), requestJson, ctx.timeoutMs);
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFailedTaskStatus(statusText);
  const done = isDoneTaskStatus(statusText);
  return {
    status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
    progress: done && urls.length ? 100 : Number((upstream as any)?.progress || (upstream as any)?.data?.progress || 0),
    upstreamTaskId: taskId || String((upstream as any)?.id || (upstream as any)?.task_id || (upstream as any)?.data?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorMessage: failed ? extractErrorMessage(upstream) : undefined,
  };
}
`;

const jsBlock = `
function fullbloodVideoSize(aspectRatio) {
    return aspectRatio === '9:16' ? '720x1280' : '1280x720';
}
function fullbloodVideoMetadata(ctx, aspectRatio, seconds) {
    const rawMetadata = isRecord(ctx.params.metadata) ? ctx.params.metadata : {};
    return compactJson({
        ...rawMetadata,
        aspect_ratio: aspectRatio,
        requestedAspectRatio: aspectRatio,
        fixedSeconds: seconds,
    });
}
async function submitFullbloodVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx);
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16'], '16:9');
    const seconds = 15;
    const configuredSize = String(ctx.params.size || ctx.params.videoSize || ctx.params.video_size || '').trim();
    const requestJson = compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        size: configuredSize || fullbloodVideoSize(aspectRatio),
        seconds: String(seconds),
        images: imageUrls,
        metadata: fullbloodVideoMetadata(ctx, aspectRatio, seconds),
    });
    const endpointPath = ctx.model.endpointPath || ctx.provider.endpointPath || '/videos';
    const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(endpointPath, ctx), requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    return {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId || String(upstream?.id || upstream?.task_id || upstream?.data?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorMessage: failed ? extractErrorMessage(upstream) : undefined,
    };
}
`;

const files = [
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    entryNeedle: "  'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },\n",
    entryInsert: "  'fullblood-video': { submit: submitFullbloodVideo, query: queryGenericVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {',
    block: tsBlock,
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    entryNeedle: "    'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },\n",
    entryInsert: "    'fullblood-video': { submit: submitFullbloodVideo, query: queryGenericVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx) {',
    block: jsBlock,
  },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  let after = insertAfter(before, item.entryNeedle, item.entryInsert, 'adapter registry', item.rel);
  after = insertBefore(after, item.functionNeedle, item.block, 'fullblood submit function', item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-fullblood-video] patched ${item.rel}`);
  } else {
    console.log(`[patch-fullblood-video] unchanged ${item.rel}`);
  }
}

console.log(`[patch-fullblood-video] changed=${changed}`);
