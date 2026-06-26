import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file, label) {
  fs.copyFileSync(file, `${file}.bak-${label}-${stamp}`);
}

function insertAfter(text, needle, insert, label, file) {
  if (text.includes(insert.trim())) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${needle}${insert}`);
}

function insertBefore(text, needle, insert, marker, label, file) {
  if (text.includes(marker)) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.replace(needle, `${insert.trimEnd()}\n\n${needle}`);
}

function patchRouteResolver(text, file) {
  const tsReturn = "  if (configuredLower === 'sd2-internal' || hint.includes('sd2-internal') || hint.includes('canvas_sd2-internal') || modelHint.includes('dreamina-mini') || modelHint.includes('transit9-fast') || modelHint.includes('transit9-2.0')) return 'sd2-internal';\n";
  const jsReturn = "    if (configuredLower === 'sd2-internal' || hint.includes('sd2-internal') || hint.includes('canvas_sd2-internal') || modelHint.includes('dreamina-mini') || modelHint.includes('transit9-fast') || modelHint.includes('transit9-2.0'))\n        return 'sd2-internal';\n";
  if (text.includes("return 'sd2-internal';")) return text;
  if (file.endsWith('.ts')) {
    const needle = "  if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image') return configuredLower;\n";
    if (!text.includes(needle)) throw new Error(`route resolver ts needle not found in ${file}`);
    return text.replace(needle, `${needle}${tsReturn}`);
  }
  const needle = "    if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image')\n        return configuredLower;\n";
  if (!text.includes(needle)) throw new Error(`route resolver js needle not found in ${file}`);
  return text.replace(needle, `${needle}${jsReturn}`);
}

const tsBlock = `
function resolveSd2InternalModelName(ctx: AdapterContext) {
  return String(ctx.model.name || ctx.params.model || ctx.provider.defaultModel || '').trim();
}

function resolveSd2InternalResolution(ctx: AdapterContext) {
  return normalizeAllowedString(ctx.params.resolution || ctx.params.quality || ctx.params.requestedResolution, ['480p', '720p', '1080p'], '720p');
}

function resolveSd2InternalAspectRatio(ctx: AdapterContext) {
  return normalizeAllowedString(ctx.params.ratio || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
}

function buildSd2InternalAudioUrls(ctx: AdapterContext) {
  return buildSoraVideoProUrlList(ctx, [
    'audios', 'audioUrls', 'audio_urls',
    'reference_audio_urls', 'referenceAudioUrls',
    'reference_audios', 'referenceAudios',
    'reference_audio', 'referenceAudio',
    'audio', 'audioUrl', 'refAudio', 'audio_url',
  ], 'audio', 3).slice(0, 3);
}

async function submitSd2InternalVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
  const videoUrls = buildVideoReferenceVideoUrls(ctx).slice(0, 3);
  const audioUrls = buildSd2InternalAudioUrls(ctx);
  const resolution = resolveSd2InternalResolution(ctx);
  const ratio = resolveSd2InternalAspectRatio(ctx);
  const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds, 5, [5, 10, 15]);
  const videoParams = withoutKeys(ctx.params, [
    'model', 'prompt', 'negative_prompt', 'stream',
    'duration', 'durationSeconds', 'duration_seconds', 'seconds',
    'ratio', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
    'resolution', 'requestedResolution', 'quality',
    'adapter', 'protocolAdapter', 'method', 'requestMethod', 'endpointPath', 'endpoint_path', 'statusEndpointPath', 'status_endpoint_path', 'uploadMode', 'upload_mode', 'protocol',
    'outputDir', 'workspaceId', 'workspaceName', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode', 'videoMode',
    'enableSound', 'generateAudio', 'generate_audio', 'soundField', 'modeType',
    'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
    'image_url', 'imageUrl', 'firstFrame', 'first_frame', 'first_frame_image_url', 'last_frame_image_url',
    'extra_images', 'extraImages',
    'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
    'extra_videos', 'extraVideos', 'videos',
    'audio', 'audioUrl', 'refAudio', 'audio_url', 'reference_audio', 'referenceAudio', 'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
    'extra_audios', 'extraAudios', 'audios',
  ]);
  const requestJson = compactJson({
    ...videoParams,
    model: resolveSd2InternalModelName(ctx),
    prompt: ctx.prompt,
    duration,
    seconds: duration,
    ratio,
    aspect_ratio: ratio,
    resolution,
    ...(imageUrls.length ? { images: imageUrls } : {}),
    ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
    ...(audioUrls.length ? { audios: audioUrls } : {}),
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/sd2/generate', ctx);
  const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
  return normalizeSd2InternalVideoTaskResult(ctx, upstream, requestJson);
}

async function normalizeSd2InternalVideoTaskResult(ctx: AdapterContext, upstream: unknown, requestJson: Prisma.InputJsonValue): Promise<AdapterSubmitResult> {
  const taskId = extractVideoTask(upstream);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const statusText = extractTaskStatusText(upstream);
  const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
  const done = isDoneTaskStatus(statusText);
  const status = failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId || !done ? 'RUNNING' : 'FAILED'));
  return {
    status,
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId || String((upstream as any)?.taskId || (upstream as any)?.task_id || (upstream as any)?.id || ''),
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    requestJson,
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SD2_INTERNAL_TASK_FAILED' : (status === 'FAILED' ? 'SD2_INTERNAL_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'SD2 内测接口响应未包含 taskId 或视频 URL' : undefined),
  };
}
`;

const jsBlock = `
function resolveSd2InternalModelName(ctx) {
    return String(ctx.model.name || ctx.params.model || ctx.provider.defaultModel || '').trim();
}
function resolveSd2InternalResolution(ctx) {
    return normalizeAllowedString(ctx.params.resolution || ctx.params.quality || ctx.params.requestedResolution, ['480p', '720p', '1080p'], '720p');
}
function resolveSd2InternalAspectRatio(ctx) {
    return normalizeAllowedString(ctx.params.ratio || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
}
function buildSd2InternalAudioUrls(ctx) {
    return buildSoraVideoProUrlList(ctx, [
        'audios', 'audioUrls', 'audio_urls',
        'reference_audio_urls', 'referenceAudioUrls',
        'reference_audios', 'referenceAudios',
        'reference_audio', 'referenceAudio',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ], 'audio', 3).slice(0, 3);
}
async function submitSd2InternalVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
    const videoUrls = buildVideoReferenceVideoUrls(ctx).slice(0, 3);
    const audioUrls = buildSd2InternalAudioUrls(ctx);
    const resolution = resolveSd2InternalResolution(ctx);
    const ratio = resolveSd2InternalAspectRatio(ctx);
    const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds, 5, [5, 10, 15]);
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'negative_prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'ratio', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'requestedResolution', 'quality',
        'adapter', 'protocolAdapter', 'method', 'requestMethod', 'endpointPath', 'endpoint_path', 'statusEndpointPath', 'status_endpoint_path', 'uploadMode', 'upload_mode', 'protocol',
        'outputDir', 'workspaceId', 'workspaceName', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode', 'videoMode',
        'enableSound', 'generateAudio', 'generate_audio', 'soundField', 'modeType',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'firstFrame', 'first_frame', 'first_frame_image_url', 'last_frame_image_url',
        'extra_images', 'extraImages',
        'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
        'extra_videos', 'extraVideos', 'videos',
        'audio', 'audioUrl', 'refAudio', 'audio_url', 'reference_audio', 'referenceAudio', 'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
        'extra_audios', 'extraAudios', 'audios',
    ]);
    const requestJson = compactJson({
        ...videoParams,
        model: resolveSd2InternalModelName(ctx),
        prompt: ctx.prompt,
        duration,
        seconds: duration,
        ratio,
        aspect_ratio: ratio,
        resolution,
        ...(imageUrls.length ? { images: imageUrls } : {}),
        ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
        ...(audioUrls.length ? { audios: audioUrls } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/sd2/generate', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    return normalizeSd2InternalVideoTaskResult(ctx, upstream, requestJson);
}
async function normalizeSd2InternalVideoTaskResult(ctx, upstream, requestJson) {
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFinalFailedTaskStatus(upstream, statusText, taskId);
    const done = isDoneTaskStatus(statusText);
    const status = failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId || !done ? 'RUNNING' : 'FAILED'));
    return {
        status,
        progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
        upstreamTaskId: taskId || String(upstream?.taskId || upstream?.task_id || upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'SD2_INTERNAL_TASK_FAILED' : (status === 'FAILED' ? 'SD2_INTERNAL_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'SD2 内测接口响应未包含 taskId 或视频 URL' : undefined),
    };
}
`;

const registryFiles = [
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    entryNeedle: "  'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },\n",
    entryInsert: "  'sd2-internal': { submit: submitSd2InternalVideo, query: queryGenericVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {',
    block: tsBlock,
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    entryNeedle: "    'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },\n",
    entryInsert: "    'sd2-internal': { submit: submitSd2InternalVideo, query: queryGenericVideo },\n",
    functionNeedle: 'async function submitGenericVideo(ctx) {',
    block: jsBlock,
  },
];

const routeFiles = [
  'src/modules/generation/routes.ts',
  'dist/modules/generation/routes.js',
];

let changed = 0;
for (const item of registryFiles) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  let after = insertAfter(before, item.entryNeedle, item.entryInsert, 'adapter registry', item.rel);
  after = insertBefore(after, item.functionNeedle, item.block, 'async function submitSd2InternalVideo', 'sd2-internal submit function', item.rel);
  if (after !== before) {
    backup(file, 'sd2-internal-adapter');
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-sd2-internal-adapter] patched ${item.rel}`);
  } else {
    console.log(`[patch-sd2-internal-adapter] unchanged ${item.rel}`);
  }
}

for (const rel of routeFiles) {
  const file = path.join(apiRoot, rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = patchRouteResolver(before, rel);
  if (after !== before) {
    backup(file, 'sd2-internal-route');
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-sd2-internal-adapter] patched ${rel}`);
  } else {
    console.log(`[patch-sd2-internal-adapter] unchanged ${rel}`);
  }
}

console.log(`[patch-sd2-internal-adapter] changed=${changed}`);
