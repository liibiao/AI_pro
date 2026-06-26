import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MARKER = 'SEEDANCE_FULL_SZ_SEEDANCE2_ADAPTER';
const FILES = [
  { rel: 'src/modules/generation/adapters/registry.ts', kind: 'ts', required: false },
  { rel: 'dist/modules/generation/adapters/registry.js', kind: 'js', required: true },
];

const tsBlock = `
// ${MARKER}
function seedanceFullSubmitEndpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
  if (!configured || configured === '/video/generations') return '/seedance-full/generate';
  if (configured.endsWith('/seedance-full/generate')) return configured;
  if (configured.endsWith('/api/v1')) return configured + '/seedance-full/generate';
  if (configured.endsWith('/seedance-full')) return configured + '/generate';
  return configured;
}

function seedanceFullStatusEndpoint(ctx: AdapterContext) {
  const configured = String(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '').trim();
  if (!configured || configured === '{taskId}' || configured === '/{taskId}' || configured === '/video/status') return '/seedance-full/task/{taskId}';
  if (configured.endsWith('/seedance-full')) return configured + '/task/{taskId}';
  return configured;
}

function normalizeSeedanceFullModelName(ctx: AdapterContext) {
  const requestedResolution = [
    ctx.params.resolution,
    ctx.params.quality,
    ctx.params.videoResolution,
    ctx.params.requestedResolution,
  ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '720p' || item === '1080p') || '';
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
  if (raw === 'sz-seedance2-1080p') return raw;
  if (raw === 'sz-seedance2') return requestedResolution === '1080p' ? 'sz-seedance2-1080p' : 'sz-seedance2';
  if (raw.includes('1080') || requestedResolution === '1080p') return 'sz-seedance2-1080p';
  return 'sz-seedance2';
}

function normalizeSeedanceFullResolution(ctx: AdapterContext, modelName: string) {
  const raw = String(ctx.params.resolution || ctx.params.quality || ctx.params.videoResolution || ctx.params.requestedResolution || '').trim().toLowerCase();
  const expected = modelName === 'sz-seedance2-1080p' ? '1080p' : '720p';
  const resolution = raw || expected;
  if (!['720p', '1080p'].includes(resolution)) throw new Error('Seedance2.0 满血分辨率只支持 720p 或 1080p');
  if (resolution !== expected) throw new Error('Seedance2.0 满血模型 ' + modelName + ' 只能使用 ' + expected);
  return resolution;
}

function normalizeSeedanceFullSeconds(ctx: AdapterContext) {
  const rawValue = ctx.params.seconds ?? ctx.params.duration ?? ctx.params.durationSeconds ?? ctx.params.duration_seconds ?? 10;
  const text = String(rawValue).trim().toLowerCase().replace(/秒/g, '').replace(/s$/i, '');
  const seconds = Number(text);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 15) throw new Error('Seedance2.0 满血时长只支持 10-15 秒整数');
  return seconds;
}

function normalizeSeedanceFullAspectRatio(ctx: AdapterContext) {
  const raw = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.ratio || '16:9').trim() || '16:9';
  const allowed = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
  if (!allowed.includes(raw)) throw new Error('Seedance2.0 满血比例只支持 16:9、9:16、1:1、4:3、3:4、21:9、adaptive');
  return raw;
}

async function buildSeedanceFullRequestJson(ctx: AdapterContext) {
  const modelName = normalizeSeedanceFullModelName(ctx);
  const resolution = normalizeSeedanceFullResolution(ctx, modelName);
  const seconds = normalizeSeedanceFullSeconds(ctx);
  const aspectRatio = normalizeSeedanceFullAspectRatio(ctx);
  const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'image_url', 'imageUrl', 'image_urls', 'imageUrls',
    'reference_image_urls', 'referenceImageUrls', 'reference_images', 'referenceImages',
    'images', 'image', 'input_image', 'first_frame_image_url', 'last_frame_image_url',
  ], 'image', 9), 9);
  const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'video_urls', 'videoUrls', 'reference_video_urls', 'referenceVideoUrls',
    'reference_videos', 'referenceVideos', 'videos', 'video', 'videoUrl', 'video_url', 'refVideo',
  ], 'video', 3), 'video', 3);
  const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
    'audio_urls', 'audioUrls', 'reference_audio_urls', 'referenceAudioUrls',
    'reference_audios', 'referenceAudios', 'audios', 'audio', 'audioUrl', 'audio_url', 'refAudio',
  ], 'audio', 3), 'audio', 3);
  return compactJson({
    prompt: ctx.prompt,
    model: modelName,
    seconds,
    aspect_ratio: aspectRatio,
    resolution,
    ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
    ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls } : {}),
    ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
    ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
  });
}

async function submitSeedanceFullVideo(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  const requestJson = await buildSeedanceFullRequestJson(ctx);
  const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(seedanceFullSubmitEndpoint(ctx), ctx), requestJson, ctx.timeoutMs);
  return normalizeSeedanceFullResult(ctx, upstream, requestJson);
}

async function querySeedanceFullVideo(ctx: AdapterContext & { upstreamTaskId: string }): Promise<AdapterQueryResult> {
  const endpoint = resolveEndpointPath(seedanceFullStatusEndpoint(ctx), { ...ctx, taskId: ctx.upstreamTaskId });
  const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
  return normalizeSeedanceFullResult(ctx, upstream, undefined, ctx.upstreamTaskId);
}

async function normalizeSeedanceFullResult(ctx: AdapterContext & { upstreamTaskId?: string }, upstream: unknown, requestJson?: Prisma.InputJsonValue, fallbackTaskId = ''): Promise<AdapterSubmitResult | AdapterQueryResult> {
  const taskId = extractVideoTask(upstream)
    || fallbackTaskId
    || String((upstream as any)?.task_id || (upstream as any)?.taskId || (upstream as any)?.id || (upstream as any)?.data?.task_id || (upstream as any)?.data?.taskId || (upstream as any)?.data?.id || '');
  const statusText = extractTaskStatusText(upstream);
  const failed = isSeedanceFullFailedStatus(statusText) || isFinalFailedTaskStatus(upstream, statusText, taskId);
  const resultUrl = extractVideoResultUrl(upstream);
  const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
  const done = isSeedanceFullDoneStatus(statusText) || (urls.length > 0 && !isSeedanceFullBusyStatus(statusText));
  const missingResult = done && !urls.length;
  const base = {
    status: failed || missingResult ? 'FAILED' as const : (done && urls.length ? 'SUCCESS' as const : (taskId ? 'RUNNING' as const : 'FAILED' as const)),
    progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
    upstreamTaskId: taskId,
    upstreamRequestId: String((upstream as any)?.request_id || (upstream as any)?.requestId || (upstream as any)?.id || taskId || ''),
    responseJson: upstream as Prisma.InputJsonValue,
    resultJson: { url: urls[0] || '', outputs: urls } as Prisma.InputJsonValue,
    resultUrls: urls,
    errorCode: failed ? 'SEEDANCE_FULL_TASK_FAILED' : (missingResult || (!taskId && !urls.length) ? 'SEEDANCE_FULL_TASK_MISSING' : undefined),
    errorMessage: failed ? extractErrorMessage(upstream) : (missingResult ? 'Seedance2.0 满血任务已完成，但上游没有返回视频地址' : (!taskId && !urls.length ? 'Seedance2.0 满血上游响应未包含 taskId 或 video_url' : undefined)),
  };
  return requestJson ? { ...base, requestJson } : base;
}

function isSeedanceFullDoneStatus(status: string) {
  return ['completed', 'succeeded', 'success', 'done'].includes(String(status || '').trim().toLowerCase()) || isDoneTaskStatus(status);
}

function isSeedanceFullBusyStatus(status: string) {
  return ['queued', 'pending', 'processing', 'running', 'in_progress', ''].includes(String(status || '').trim().toLowerCase());
}

function isSeedanceFullFailedStatus(status: string) {
  return ['failed', 'error', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase());
}
`;

const jsBlock = `
// ${MARKER}
function seedanceFullSubmitEndpoint(ctx) {
    const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
    if (!configured || configured === '/video/generations')
        return '/seedance-full/generate';
    if (configured.endsWith('/seedance-full/generate'))
        return configured;
    if (configured.endsWith('/api/v1'))
        return configured + '/seedance-full/generate';
    if (configured.endsWith('/seedance-full'))
        return configured + '/generate';
    return configured;
}
function seedanceFullStatusEndpoint(ctx) {
    const configured = String(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '').trim();
    if (!configured || configured === '{taskId}' || configured === '/{taskId}' || configured === '/video/status')
        return '/seedance-full/task/{taskId}';
    if (configured.endsWith('/seedance-full'))
        return configured + '/task/{taskId}';
    return configured;
}
function normalizeSeedanceFullModelName(ctx) {
    const requestedResolution = [
        ctx.params.resolution,
        ctx.params.quality,
        ctx.params.videoResolution,
        ctx.params.requestedResolution,
    ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '720p' || item === '1080p') || '';
    const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
    if (raw === 'sz-seedance2-1080p')
        return raw;
    if (raw === 'sz-seedance2')
        return requestedResolution === '1080p' ? 'sz-seedance2-1080p' : 'sz-seedance2';
    if (raw.includes('1080') || requestedResolution === '1080p')
        return 'sz-seedance2-1080p';
    return 'sz-seedance2';
}
function normalizeSeedanceFullResolution(ctx, modelName) {
    const raw = String(ctx.params.resolution || ctx.params.quality || ctx.params.videoResolution || ctx.params.requestedResolution || '').trim().toLowerCase();
    const expected = modelName === 'sz-seedance2-1080p' ? '1080p' : '720p';
    const resolution = raw || expected;
    if (!['720p', '1080p'].includes(resolution))
        throw new Error('Seedance2.0 满血分辨率只支持 720p 或 1080p');
    if (resolution !== expected)
        throw new Error('Seedance2.0 满血模型 ' + modelName + ' 只能使用 ' + expected);
    return resolution;
}
function normalizeSeedanceFullSeconds(ctx) {
    const rawValue = ctx.params.seconds ?? ctx.params.duration ?? ctx.params.durationSeconds ?? ctx.params.duration_seconds ?? 10;
    const text = String(rawValue).trim().toLowerCase().replace(/秒/g, '').replace(/s$/i, '');
    const seconds = Number(text);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 15)
        throw new Error('Seedance2.0 满血时长只支持 10-15 秒整数');
    return seconds;
}
function normalizeSeedanceFullAspectRatio(ctx) {
    const raw = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.ratio || '16:9').trim() || '16:9';
    const allowed = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
    if (!allowed.includes(raw))
        throw new Error('Seedance2.0 满血比例只支持 16:9、9:16、1:1、4:3、3:4、21:9、adaptive');
    return raw;
}
async function buildSeedanceFullRequestJson(ctx) {
    const modelName = normalizeSeedanceFullModelName(ctx);
    const resolution = normalizeSeedanceFullResolution(ctx, modelName);
    const seconds = normalizeSeedanceFullSeconds(ctx);
    const aspectRatio = normalizeSeedanceFullAspectRatio(ctx);
    const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, [
        'image_url', 'imageUrl', 'image_urls', 'imageUrls',
        'reference_image_urls', 'referenceImageUrls', 'reference_images', 'referenceImages',
        'images', 'image', 'input_image', 'first_frame_image_url', 'last_frame_image_url',
    ], 'image', 9), 9);
    const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
        'video_urls', 'videoUrls', 'reference_video_urls', 'referenceVideoUrls',
        'reference_videos', 'referenceVideos', 'videos', 'video', 'videoUrl', 'video_url', 'refVideo',
    ], 'video', 3), 'video', 3);
    const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
        'audio_urls', 'audioUrls', 'reference_audio_urls', 'referenceAudioUrls',
        'reference_audios', 'referenceAudios', 'audios', 'audio', 'audioUrl', 'audio_url', 'refAudio',
    ], 'audio', 3), 'audio', 3);
    return compactJson({
        prompt: ctx.prompt,
        model: modelName,
        seconds,
        aspect_ratio: aspectRatio,
        resolution,
        ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
        ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls } : {}),
        ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
        ...(audioUrls.length ? { audio_urls: audioUrls } : {}),
    });
}
async function submitSeedanceFullVideo(ctx) {
    const requestJson = await buildSeedanceFullRequestJson(ctx);
    const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(seedanceFullSubmitEndpoint(ctx), ctx), requestJson, ctx.timeoutMs);
    return normalizeSeedanceFullResult(ctx, upstream, requestJson);
}
async function querySeedanceFullVideo(ctx) {
    const endpoint = resolveEndpointPath(seedanceFullStatusEndpoint(ctx), { ...ctx, taskId: ctx.upstreamTaskId });
    const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
    return normalizeSeedanceFullResult(ctx, upstream, undefined, ctx.upstreamTaskId);
}
async function normalizeSeedanceFullResult(ctx, upstream, requestJson, fallbackTaskId = '') {
    const taskId = extractVideoTask(upstream)
        || fallbackTaskId
        || String(upstream?.task_id || upstream?.taskId || upstream?.id || upstream?.data?.task_id || upstream?.data?.taskId || upstream?.data?.id || '');
    const statusText = extractTaskStatusText(upstream);
    const failed = isSeedanceFullFailedStatus(statusText) || isFinalFailedTaskStatus(upstream, statusText, taskId);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const done = isSeedanceFullDoneStatus(statusText) || (urls.length > 0 && !isSeedanceFullBusyStatus(statusText));
    const missingResult = done && !urls.length;
    const base = {
        status: failed || missingResult ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
        progress: done && urls.length ? 100 : extractGenericVideoProgress(upstream, statusText),
        upstreamTaskId: taskId,
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        responseJson: upstream,
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'SEEDANCE_FULL_TASK_FAILED' : (missingResult || (!taskId && !urls.length) ? 'SEEDANCE_FULL_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (missingResult ? 'Seedance2.0 满血任务已完成，但上游没有返回视频地址' : (!taskId && !urls.length ? 'Seedance2.0 满血上游响应未包含 taskId 或 video_url' : undefined)),
    };
    return requestJson ? { ...base, requestJson } : base;
}
function isSeedanceFullDoneStatus(status) {
    return ['completed', 'succeeded', 'success', 'done'].includes(String(status || '').trim().toLowerCase()) || isDoneTaskStatus(status);
}
function isSeedanceFullBusyStatus(status) {
    return ['queued', 'pending', 'processing', 'running', 'in_progress', ''].includes(String(status || '').trim().toLowerCase());
}
function isSeedanceFullFailedStatus(status) {
    return ['failed', 'error', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase());
}
`;

function patchRegistryLine(source) {
  if (source.includes("'seedance-full':") || source.includes('"seedance-full":')) return source;
  const line = "  'seedance-full': { submit: submitSeedanceFullVideo, query: querySeedanceFullVideo },\n";
  const anchors = [
    "  'seedance-task': { submit: submitSeedanceTaskVideo, query: querySeedanceTaskVideo },\n",
    "  'seedance2-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },\n",
    "  'notevideo': { submit: submitGenericVideo, query: queryGenericVideo },\n",
  ];
  for (const anchor of anchors) {
    if (source.includes(anchor)) return source.replace(anchor, anchor + line);
  }
  throw new Error('Could not locate registry adapter insertion point');
}

function patchFunctionBlock(source, kind) {
  if (source.includes(MARKER) || source.includes('function submitSeedanceFullVideo')) return source;
  const needle = '\nasync function submitGenericVideo';
  if (!source.includes(needle)) throw new Error('Could not locate submitGenericVideo insertion point');
  return source.replace(needle, '\n' + (kind === 'ts' ? tsBlock : jsBlock) + needle);
}

function patchOne({ rel, kind, required }) {
  const file = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(file)) {
    if (required) throw new Error('Required registry file missing: ' + rel);
    console.log('[patch-seedance-full-adapter] skip missing optional ' + rel);
    return false;
  }
  const before = fs.readFileSync(file, 'utf8');
  let after = patchRegistryLine(before);
  after = patchFunctionBlock(after, kind);
  if (after === before) {
    console.log('[patch-seedance-full-adapter] unchanged ' + rel);
    return false;
  }
  fs.writeFileSync(file, after);
  console.log('[patch-seedance-full-adapter] patched ' + rel);
  return true;
}

let touched = 0;
let seen = 0;
for (const item of FILES) {
  const file = path.resolve(process.cwd(), item.rel);
  if (fs.existsSync(file)) seen += 1;
  if (patchOne(item)) touched += 1;
}
if (!seen) throw new Error('No generation registry files found');

const dist = path.resolve(process.cwd(), 'dist/modules/generation/adapters/registry.js');
if (fs.existsSync(dist)) {
  const result = spawnSync(process.execPath, ['--check', dist], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('[patch-seedance-full-adapter] changed=' + touched);
