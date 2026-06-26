import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'FULLBLOOD_VIDEO_REGISTRY_ADAPTER';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-video-registry-${stamp}`);
}

function insertAfter(text, needle, insert, label, file) {
  if (text.includes(insert.trim())) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${needle}${insert}`);
}

function insertBefore(text, needle, insert, markerText, label, file) {
  if (text.includes(markerText)) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${insert.trimEnd()}\n\n${needle}`);
}

const tsBlock = `
// ${marker}: hongniao fullblood video API accepts a strict /videos JSON schema.
function resolveFullbloodVideoModelName(ctx: AdapterContext) {
  return String(ctx.model.name || ctx.params.model || ctx.provider.defaultModel || '').trim();
}

function resolveFullbloodVideoAspectRatio(ctx: AdapterContext) {
  const raw = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.ratio || '16:9').trim().replace('：', ':');
  const match = raw.match(/\\d+(?:\\.\\d+)?\\s*:\\s*\\d+(?:\\.\\d+)?/);
  const ratio = match ? match[0].replace(/\\s+/g, '') : raw;
  return normalizeAllowedString(ratio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
}

function fullbloodVideoSizeByAspectRatio(ctx: AdapterContext) {
  const defaults: Record<string, string> = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3': '960x720',
    '3:4': '720x960',
    '1:1': '720x720',
    '21:9': '1680x720',
  };
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  for (const source of [
    protocol.sizeByAspectRatio,
    protocol.size_by_aspect_ratio,
    modelProtocol.sizeByAspectRatio,
    modelProtocol.size_by_aspect_ratio,
  ]) {
    if (!isRecord(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      const size = String(value || '').trim().toLowerCase().replace('×', 'x').replace(/\\s+/g, '');
      if (/^\\d{3,5}x\\d{3,5}$/.test(size)) defaults[key] = size;
    }
  }
  return defaults;
}

function resolveFullbloodVideoSize(ctx: AdapterContext) {
  const explicit = String(ctx.params.size || ctx.params.videoSize || ctx.params.pixelSize || ctx.params.requestedPixelSize || '').trim().toLowerCase().replace('×', 'x').replace(/\\s+/g, '');
  if (/^\\d{3,5}x\\d{3,5}$/.test(explicit)) return explicit;
  const ratio = resolveFullbloodVideoAspectRatio(ctx);
  return fullbloodVideoSizeByAspectRatio(ctx)[ratio] || '1280x720';
}

function resolveFullbloodVideoSeconds(ctx: AdapterContext) {
  const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
  const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
  const raw = protocol.fixedSeconds || modelProtocol.fixedSeconds || protocol.seconds || modelProtocol.seconds || 15;
  const parsed = Number.parseInt(String(raw).replace(/s$/i, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

function buildFullbloodVideoMetadata(ctx: AdapterContext) {
  if (!isRecord(ctx.params.metadata)) return undefined;
  const metadata = compactJson({ ...ctx.params.metadata });
  return Object.keys(metadata as Record<string, unknown>).length ? metadata : undefined;
}

async function submitFullbloodVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const requestJson = compactJson({
    model: resolveFullbloodVideoModelName(ctx),
    prompt: ctx.prompt,
    size: resolveFullbloodVideoSize(ctx),
    seconds: String(resolveFullbloodVideoSeconds(ctx)),
    ...(imageUrls.length ? { images: imageUrls } : {}),
    metadata: buildFullbloodVideoMetadata(ctx),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeFullbloodVideoSubmit(ctx, upstream, requestJson);
}

async function queryFullbloodVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/videos/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeVideoQueryResult(ctx, upstream);
}

async function normalizeFullbloodVideoSubmit(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || String((upstream as any)?.taskId || (upstream as any)?.task_id || (upstream as any)?.id || (upstream as any)?.data?.id || '');
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const status = failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId || !done ? 'RUNNING' : 'FAILED'));
  return {
    status,
    progress: urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: sanitizeUpstreamPayload(upstream) as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'FULLBLOOD_VIDEO_TASK_FAILED' : (status === 'FAILED' ? 'FULLBLOOD_VIDEO_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'fullblood-video upstream response did not include a task id or video URL' : undefined),
  };
}
`;

const jsBlock = `
// ${marker}: hongniao fullblood video API accepts a strict /videos JSON schema.
function resolveFullbloodVideoModelName(ctx) {
    return String(ctx.model.name || ctx.params.model || ctx.provider.defaultModel || '').trim();
}
function resolveFullbloodVideoAspectRatio(ctx) {
    const raw = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.ratio || '16:9').trim().replace('：', ':');
    const match = raw.match(/\\d+(?:\\.\\d+)?\\s*:\\s*\\d+(?:\\.\\d+)?/);
    const ratio = match ? match[0].replace(/\\s+/g, '') : raw;
    return normalizeAllowedString(ratio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
}
function fullbloodVideoSizeByAspectRatio(ctx) {
    const defaults = {
        '16:9': '1280x720',
        '9:16': '720x1280',
        '4:3': '960x720',
        '3:4': '720x960',
        '1:1': '720x720',
        '21:9': '1680x720',
    };
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    for (const source of [
        protocol.sizeByAspectRatio,
        protocol.size_by_aspect_ratio,
        modelProtocol.sizeByAspectRatio,
        modelProtocol.size_by_aspect_ratio,
    ]) {
        if (!isRecord(source))
            continue;
        for (const [key, value] of Object.entries(source)) {
            const size = String(value || '').trim().toLowerCase().replace('×', 'x').replace(/\\s+/g, '');
            if (/^\\d{3,5}x\\d{3,5}$/.test(size))
                defaults[key] = size;
        }
    }
    return defaults;
}
function resolveFullbloodVideoSize(ctx) {
    const explicit = String(ctx.params.size || ctx.params.videoSize || ctx.params.pixelSize || ctx.params.requestedPixelSize || '').trim().toLowerCase().replace('×', 'x').replace(/\\s+/g, '');
    if (/^\\d{3,5}x\\d{3,5}$/.test(explicit))
        return explicit;
    const ratio = resolveFullbloodVideoAspectRatio(ctx);
    return fullbloodVideoSizeByAspectRatio(ctx)[ratio] || '1280x720';
}
function resolveFullbloodVideoSeconds(ctx) {
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const raw = protocol.fixedSeconds || modelProtocol.fixedSeconds || protocol.seconds || modelProtocol.seconds || 15;
    const parsed = Number.parseInt(String(raw).replace(/s$/i, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}
function buildFullbloodVideoMetadata(ctx) {
    if (!isRecord(ctx.params.metadata))
        return undefined;
    const metadata = compactJson({ ...ctx.params.metadata });
    return Object.keys(metadata).length ? metadata : undefined;
}
async function submitFullbloodVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
    const requestJson = compactJson({
        model: resolveFullbloodVideoModelName(ctx),
        prompt: ctx.prompt,
        size: resolveFullbloodVideoSize(ctx),
        seconds: String(resolveFullbloodVideoSeconds(ctx)),
        ...(imageUrls.length ? { images: imageUrls } : {}),
        metadata: buildFullbloodVideoMetadata(ctx),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    return normalizeFullbloodVideoSubmit(ctx, upstream, requestJson);
}
async function queryFullbloodVideo(ctx) {
    const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/videos/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
    const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
    return normalizeVideoQueryResult(ctx, upstream);
}
async function normalizeFullbloodVideoSubmit(ctx, upstream, requestJson) {
    const taskId = extractVideoTask(upstream) || extractUpstreamTaskId(upstream) || String(upstream?.taskId || upstream?.task_id || upstream?.id || upstream?.data?.id || '');
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
    const done = isDoneTaskStatus(statusText);
    const status = failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId || !done ? 'RUNNING' : 'FAILED'));
    return {
        status,
        progress: urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
        upstreamTaskId: taskId,
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'FULLBLOOD_VIDEO_TASK_FAILED' : (status === 'FAILED' ? 'FULLBLOOD_VIDEO_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'fullblood-video upstream response did not include a task id or video URL' : undefined),
    };
}
`;

const files = [
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    entryNeedle: "  'sora-video-pro': { submit: submitSoraVideoPro, query: queryGenericVideo },\n",
    entryInsert: "  'fullblood-video': { submit: submitFullbloodVideo, query: queryFullbloodVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {',
    block: tsBlock,
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    entryNeedle: "    'sora-video-pro': { submit: submitSoraVideoPro, query: queryGenericVideo },\n",
    entryInsert: "    'fullblood-video': { submit: submitFullbloodVideo, query: queryFullbloodVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx) {',
    block: jsBlock,
  },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  let after = insertAfter(before, item.entryNeedle, item.entryInsert, 'fullblood registry entry', item.rel);
  after = insertBefore(after, item.functionNeedle, item.block, 'async function submitFullbloodVideo', 'fullblood submit function', item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-fullblood-adapter-registry] patched ${item.rel}`);
  } else {
    console.log(`[patch-fullblood-adapter-registry] unchanged ${item.rel}`);
  }
}

console.log(`[patch-fullblood-adapter-registry] changed=${changed}`);
