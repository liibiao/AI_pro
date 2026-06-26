import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpError, fail } from '../../../http.js';
import { config } from '../../../config.js';
import { uploadObjectStorageBuffer } from '../../../object-storage.js';
import { callUpstreamGetJson, callUpstreamJson, callUpstreamMultipart, extractChatText, extractImageResult, extractUpstreamTaskId, extractVideoResultUrl, extractVideoTask } from '../../../upstream.js';
import { getUploadedFileFallbackUrl, getUploadedFileFallbackUrlAsync } from '../file-fallback-store.js';
const registry = {
    'openai-image': { submit: submitOpenAiImage },
    'openai-generations': { submit: submitOpenAiImage },
    'openai-edits': { submit: submitOpenAiEdits, query: queryGenericImage },
    'openai-responses-image': { submit: submitOpenAiResponsesImage, query: queryGenericImage },
    'openai-chat-image': { submit: submitOpenAiChatImage, query: queryGenericImage },
    'openai-chat': { submit: submitOpenAiChat },
    'grok_image': { submit: submitGrokUnifiedImage, query: queryGrokImage },
    'grok-image-unified': { submit: submitGrokUnifiedImage, query: queryGrokImage },
    'grok-image': { submit: submitGrokImage, query: queryGrokImage },
    'grok-image-edit': { submit: submitGrokImageEdit },
    'grok-chat': { submit: submitOpenAiChat },
    'grok-llm': { submit: submitOpenAiChat },
    'gemini-chat': { submit: submitOpenAiChat },
    'gemini-llm': { submit: submitOpenAiChat },
    'gpt-image-v2': { submit: submitGptImageV2, query: queryGenericImage },
    'gemini-image': { submit: submitGeminiImage },
    'gemini-image-generate': { submit: submitGeminiUnifiedImage },
    'gemini-image-edit': { submit: submitGeminiUnifiedImageEdit },
    'midjourney-imagine': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
    'midjourney': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
    'mj-imagine': { submit: submitMidjourneyImagine, query: queryMidjourneyImagine },
    'sora-video': { submit: submitSoraVideo, query: queryGenericVideo },
    'sora-video-pro': { submit: submitSoraVideoPro, query: queryGenericVideo },
    'seedance2-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
    'seedance2.0-vip': { submit: submitSeedance2VipVideo, query: queryGenericVideo },
    'grok-video': { submit: submitGrokVideo, query: queryGenericVideo },
    'gemini-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
    'veo-video': { submit: submitGeminiVideo, query: queryGeminiVideo },
    'notevideo': { submit: submitGenericVideo, query: queryGenericVideo },
    'seedance': { submit: submitGenericVideo, query: queryGenericVideo },
    'jimeng': { submit: submitGenericVideo, query: queryGenericVideo },
    'runninghub': { submit: submitGenericVideo, query: queryGenericVideo },
    'cli-proxy': { submit: submitCliProxy, query: queryGenericVideo },
    'veo-chat': { submit: submitVeoChatVideo },
    'veo-3.1': { submit: submitVeoChatVideo },
};
const GENERATED_IMAGE_DIR = path.join(os.tmpdir(), 'ai-admin-generated-images');
const CANVAS_LOCAL_ASSET_DIRS = uniqueResolvedPaths([
    process.env.CANVAS_LOCAL_ASSET_DIR,
    process.env.CANVAS_LOCAL_ASSET_ROOT,
    process.env.WORKBENCH_LOCAL_ASSET_DIR,
    process.env.WORKBENCH_LOCAL_ASSET_ROOT,
    path.resolve(process.cwd(), 'runninghub_outputs', 'image-studio-v3'),
    path.resolve(process.cwd(), '..', 'runninghub_outputs', 'image-studio-v3'),
    path.resolve(process.cwd(), '..', '..', 'runninghub_outputs', 'image-studio-v3'),
    path.resolve(process.cwd(), '..', '..', '..', 'runninghub_outputs', 'image-studio-v3'),
    '/var/www/ai-admin/runninghub_outputs/image-studio-v3',
    '/var/www/runninghub_outputs/image-studio-v3',
]);
const LOCAL_IMAGE_FILE_REF_PREFIX = 'local-image-file:';
const generatedResultObjectStorageCache = new Map();
const remoteImageObjectStorageCache = new Map();
const remoteMediaObjectStorageCache = new Map();
const IMAGE_RESULT_MATERIALIZE_TIMEOUT_MS = 120000;
const MEDIA_RESULT_MATERIALIZE_TIMEOUT_MS = 300000;
const GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 160 * 1024 * 1024;
const MEDIA_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR = 800 * 1024 * 1024;
function uniqueResolvedPaths(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        const raw = String(value || '').trim();
        if (!raw)
            continue;
        const resolved = path.resolve(raw);
        if (seen.has(resolved))
            continue;
        seen.add(resolved);
        result.push(resolved);
    }
    return result;
}
export function getGenerationAdapter(adapterName) {
    const adapter = registry[adapterName];
    if (!adapter)
        fail(400, `未支持的生成适配器：${adapterName}`, 'ADAPTER_NOT_SUPPORTED');
    return adapter;
}
export function listGenerationAdapters() {
    return Object.keys(registry);
}
function openAiImageUpstreamOptions(params, options = {}) {
    // Canvas tasks keep audit/UI metadata in paramsJson. Only provider fields belong upstream.
    return compactJson({
        ...(options.allowBackground ? { background: params.background } : {}),
        quality: params.quality,
        output_format: params.output_format ?? params.outputFormat,
        output_compression: params.output_compression ?? params.outputCompression,
        moderation: params.moderation,
        input_fidelity: params.input_fidelity ?? params.inputFidelity,
        partial_images: params.partial_images ?? params.partialImages,
        user: params.user,
    });
}
async function submitOpenAiImage(ctx) {
    assertImageModelName(ctx);
    const responseFormat = openAiImageResponseFormat(ctx);
    const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        negative_prompt: ctx.negativePrompt,
        size: ctx.params.size || ctx.params.imageSize || '1024x1024',
        n: ctx.params.n || ctx.params.quantity || 1,
        ...openAiImageUpstreamOptions(ctx.params, { allowBackground: true }),
        response_format: responseFormat,
    }));
    const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(resolveGptImageV2Endpoint(ctx), ctx), requestJson, ctx.timeoutMs);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}
async function submitOpenAiEdits(ctx) {
    assertImageModelName(ctx);
    if (!shouldUseOpenAiEditsInputImage(ctx)) {
        if (generationModeRequiresImageReference(ctx))
            fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
        return submitOpenAiTextImage(ctx);
    }
    const references = await buildOpenAiEditsReferencePayload(ctx);
    const responseFormat = openAiImageResponseFormat(ctx);
    const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        ...references,
        mask: ctx.params.mask,
        size: ctx.params.size || ctx.params.imageSize || '1024x1024',
        n: ctx.params.n || ctx.params.quantity || 1,
        ...openAiImageUpstreamOptions(ctx.params, { allowBackground: false }),
        response_format: responseFormat,
    }));
    const endpoint = resolveEndpointPath(resolveOpenAiEditsEndpoint(ctx), ctx);
    if (!collectOpenAiPrimaryFileRefs(requestJson).length) {
        const imageUrlRequestJson = await buildOpenAiEditsImageUrlFallbackRequest(ctx, requestJson);
        if (imageUrlRequestJson) {
            const upstream = await callOpenAiImageJson(ctx, endpoint, imageUrlRequestJson);
            return normalizeImageSubmit(ctx.provider, upstream, imageUrlRequestJson, resolveImageResponseType(ctx));
        }
    }
    try {
        const upstream = await callOpenAiImageJson(ctx, endpoint, requestJson);
        return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    }
    catch (err) {
        const running = submitRunningImageTaskFromTransientError(err, requestJson);
        if (running)
            return running;
        if (!isFileIdRejectedImageUrlError(err))
            throw err;
        const fallbackRequestJson = await buildOpenAiEditsImageUrlFallbackRequest(ctx, requestJson);
        if (!fallbackRequestJson) {
            fail(400, '上游拒绝 file_id，且当前请求没有可用的 COS 兜底 URL。请刷新页面后重新上传参考图再生成。', 'OPENAI_EDITS_FILE_FALLBACK_MISSING');
        }
        try {
            const fallbackUpstream = await callOpenAiImageJson(ctx, endpoint, fallbackRequestJson);
            return normalizeImageSubmit(ctx.provider, fallbackUpstream, fallbackRequestJson, resolveImageResponseType(ctx));
        }
        catch (fallbackErr) {
            const runningFallback = submitRunningImageTaskFromTransientError(fallbackErr, fallbackRequestJson);
            if (runningFallback)
                return runningFallback;
            throw fallbackErr;
        }
    }
}
async function submitOpenAiTextImage(ctx) {
    assertImageModelName(ctx);
    const responseFormat = openAiImageResponseFormat(ctx);
    const endpoint = resolveEndpointPath(resolveOpenAiTextImageEndpoint(ctx), ctx);
    const allowBackground = !/\/images\/edits(?:$|[?#])/i.test(endpoint);
    const requestJson = withOpenAiImageRequestOptions(ctx, compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        negative_prompt: ctx.negativePrompt,
        size: ctx.params.size || ctx.params.imageSize || '1024x1024',
        n: ctx.params.n || ctx.params.quantity || 1,
        ...openAiImageUpstreamOptions(ctx.params, { allowBackground }),
        response_format: responseFormat,
    }));
    const upstream = await callOpenAiImageJson(ctx, endpoint, requestJson);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}
async function submitOpenAiResponsesImage(ctx) {
    assertImageModelName(ctx);
    const references = await collectOpenAiResponsesImageReferences(ctx);
    if (!references.length && generationModeRequiresImageReference(ctx)) {
        fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
    }
    const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
    const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
    if (!references.length)
        delete imageOptions.input_fidelity;
    delete imageOptions.user;
    const tool = compactJson({
        type: 'image_generation',
        model: ctx.model.name,
        size: ctx.params.size || ctx.params.imageSize || '1024x1024',
        ...imageOptions,
    });
    const content = [
        { type: 'input_text', text: promptText },
        ...references.map(ref => openAiResponsesInputImageContent(ref)),
    ];
    const requestJson = compactJson({
        model: resolveOpenAiResponsesImageMainModel(ctx),
        input: [{ role: 'user', content }],
        tools: [tool],
        tool_choice: { type: 'image_generation' },
        stream: false,
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/responses', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}
async function submitOpenAiChatImage(ctx) {
    assertImageModelName(ctx);
    const references = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
    if (!references.length && generationModeRequiresImageReference(ctx)) {
        fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
    }
    const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
    const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
    if (!references.length)
        delete imageOptions.input_fidelity;
    delete imageOptions.user;
    if (!imageOptions.output_format)
        imageOptions.output_format = 'png';
    const tool = compactJson({
        type: 'image_generation',
        model: resolveOpenAiChatImageToolModel(ctx),
        size: normalizeOpenAiChatImageToolSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio),
        ...imageOptions,
    });
    const content = [
        { type: 'text', text: promptText || ctx.prompt || 'Generate image' },
        ...references.map(url => ({ type: 'image_url', image_url: { url } })),
    ];
    const requestJson = compactJson({
        model: resolveOpenAiChatImageMainModel(ctx),
        messages: [{ role: 'user', content }],
        tools: [tool],
        tool_choice: { type: 'image_generation' },
        stream: false,
        reasoning_effort: ctx.params.reasoning_effort || ctx.params.reasoningEffort,
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/chat/completions', ctx);
    try {
        const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
        const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
        if (!shouldFallbackOpenAiChatImageResult(result))
            return result;
        return submitOpenAiChatImageViaImagesEndpoint(ctx, references);
    }
    catch (err) {
        if (!shouldFallbackOpenAiChatImageError(err))
            throw err;
        return submitOpenAiChatImageViaImagesEndpoint(ctx, references);
    }
}
async function submitOpenAiChatImageViaImagesEndpoint(ctx, references) {
    const requestJson = buildOpenAiChatImageImagesRequest(ctx, references);
    const endpoint = resolveEndpointPath(resolveOpenAiChatImageImagesEndpoint(ctx), ctx);
    try {
        const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
        return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    }
    catch (err) {
        const running = submitRunningImageTaskFromTransientError(err, requestJson);
        if (running)
            return running;
        if (!shouldRetryOpenAiImageWithUrlResult(err, requestJson))
            throw err;
        const requestBody = isRecord(requestJson) ? requestJson : {};
        const fallbackJson = compactJson({
            ...requestBody,
            response_format: 'url',
        });
        const upstream = await callUpstreamJson(ctx.provider, endpoint, fallbackJson, ctx.timeoutMs);
        return normalizeImageSubmit(ctx.provider, upstream, fallbackJson, resolveImageResponseType(ctx));
    }
}
function buildOpenAiChatImageImagesRequest(ctx, references) {
    const promptText = [ctx.prompt, ctx.negativePrompt ? `Negative prompt: ${ctx.negativePrompt}` : ''].filter(Boolean).join('\n\n');
    const imageOptions = openAiImageUpstreamOptions(ctx.params, { allowBackground: references.length === 0 });
    if (!references.length)
        delete imageOptions.input_fidelity;
    return withOpenAiImageRequestOptions(ctx, compactJson({
        model: resolveOpenAiChatImageToolModel(ctx),
        prompt: promptText || ctx.prompt || 'Generate image',
        ...(references.length ? { image: references } : {}),
        mask: ctx.params.mask,
        size: normalizeOpenAiChatImageToolSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio),
        n: ctx.params.n || ctx.params.quantity || 1,
        ...imageOptions,
        response_format: openAiImageResponseFormat(ctx),
    }));
}
function resolveOpenAiChatImageImagesEndpoint(ctx) {
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const explicit = String(firstDefined(ctx.params.imageEndpointPath, ctx.params.image_endpoint_path, ctx.params.imagesEndpointPath, ctx.params.images_endpoint_path, ctx.params.fallbackEndpointPath, ctx.params.fallback_endpoint_path, protocol.imageEndpointPath, protocol.image_endpoint_path, protocol.imagesEndpointPath, protocol.images_endpoint_path, protocol.fallbackEndpointPath, protocol.fallback_endpoint_path, modelProtocol.imageEndpointPath, modelProtocol.image_endpoint_path, modelProtocol.imagesEndpointPath, modelProtocol.images_endpoint_path, modelProtocol.fallbackEndpointPath, modelProtocol.fallback_endpoint_path, defaults.imageEndpointPath, defaults.image_endpoint_path, defaults.imagesEndpointPath, defaults.images_endpoint_path, defaults.fallbackEndpointPath, defaults.fallback_endpoint_path, providerDefaults.imageEndpointPath, providerDefaults.image_endpoint_path, providerDefaults.imagesEndpointPath, providerDefaults.images_endpoint_path, providerDefaults.fallbackEndpointPath, providerDefaults.fallback_endpoint_path) || '').trim();
    if (explicit)
        return explicit;
    const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
    if (/\/images\//i.test(configured))
        return configured;
    return '/v1/images/edits';
}
function shouldFallbackOpenAiChatImageResult(result) {
    if (result.status === 'SUCCESS' || result.status === 'RUNNING')
        return false;
    const reason = `${result.errorCode || ''} ${result.errorMessage || ''}`;
    return /IMAGE_RESULT_MISSING|chatgpt service unavailable|auth_unavailable|image_generation|tool_choice|\btools?\b|chat\/completions|no image result/i.test(reason);
}
function shouldFallbackOpenAiChatImageError(err) {
    const message = err instanceof Error ? err.message : String(err || '');
    if (/chatgpt service unavailable|auth_unavailable|no auth available/i.test(message))
        return true;
    if (/image_generation|tool_choice|\btools?\b|unsupported|not supported|unknown field|chat\/completions/i.test(message))
        return true;
    if (err instanceof HttpError) {
        if (err.status >= 500 && /service unavailable|temporarily unavailable|bad gateway|gateway timeout|upstream request timeout|timeout/i.test(message))
            return true;
        if (err.status === 400 && /invalid.*(?:tool|tools|tool_choice)|unsupported|not supported|unknown field/i.test(message))
            return true;
    }
    return false;
}
async function submitOpenAiChat(ctx) {
    const maxTokens = ctx.params.max_tokens || ctx.params.maxOutputTokens || ctx.params.outputTokens || ctx.params.completionTokens;
    const requestJson = compactJson({
        model: ctx.model.name,
        messages: ctx.params.messages || [{ role: 'user', content: ctx.prompt }],
        temperature: ctx.params.temperature,
        max_tokens: maxTokens,
        ...withoutKeys(ctx.params, ['messages', 'temperature', 'max_tokens', 'maxOutputTokens', 'outputTokens', 'completionTokens']),
    });
    const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/chat/completions', ctx), requestJson, ctx.timeoutMs);
    const text = extractChatText(upstream);
    return {
        status: 'SUCCESS',
        progress: 100,
        upstreamRequestId: String(upstream?.id || ''),
        requestJson,
        responseJson: upstream,
        resultJson: compactJson({ text, upstream }),
    };
}
async function submitGrokImage(ctx) {
    assertImageModelName(ctx);
    const geometry = resolveGrokImageRequestGeometry(ctx);
    const requestJson = compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        n: normalizeGrokImageCount(ctx.params.n || ctx.params.quantity),
        size: geometry.size,
        aspect_ratio: geometry.aspectRatio,
        resolution: geometry.resolution,
        stream: false,
        response_format: 'url',
        ...withoutKeys(ctx.params, [
            'model', 'prompt', 'image', 'images', 'input_image', 'reference_images', 'referenceImages',
            'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
            'resolution', 'requestedResolution', 'n', 'quantity', 'stream',
        ]),
    });
    const endpoint = resolveEndpointPath(resolveGrokImageEndpoint(ctx, 'generation'), ctx);
    let upstream;
    try {
        upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    }
    catch (err) {
        if (err instanceof HttpError)
            return grokImageSubmitFailure(err, requestJson);
        throw err;
    }
    const asyncTaskId = extractGrokAsyncTaskId(upstream);
    const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (result.resultUrls?.length)
        return result;
    if (asyncTaskId) {
        return {
            status: 'RUNNING',
            progress: extractGrokTaskProgress(upstream),
            upstreamTaskId: asyncTaskId,
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { outputs: [] },
            resultUrls: [],
        };
    }
    return {
        status: 'FAILED',
        progress: 100,
        upstreamRequestId: result.upstreamRequestId,
        requestJson,
        responseJson: result.responseJson,
        resultJson: result.resultJson,
        resultUrls: [],
        errorCode: 'GROK_IMAGE_RESULT_MISSING',
        errorMessage: extractErrorMessage(upstream) || 'Grok 文生图上游响应未包含图片 URL',
    };
}
async function submitGrokUnifiedImage(ctx) {
    assertImageModelName(ctx);
    const refGroups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
    const requiresReference = generationModeRequiresImageReference(ctx);
    if (refGroups.length)
        return submitGrokImageEdit(ctx);
    if (requiresReference) {
        fail(400, 'Grok 图生图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'GROK_IMAGE_REFERENCE_REQUIRED');
    }
    return submitGrokImage(ctx);
}
function grokImageSubmitFailure(err, requestJson) {
    const rawMessage = String(err.message || 'Grok 上游请求失败');
    const errorMessage = normalizeGrokImageFailureMessage(rawMessage);
    return {
        status: 'FAILED',
        progress: 100,
        requestJson,
        responseJson: {
            error: {
                message: rawMessage,
                status: err.status,
                code: err.code,
            },
        },
        resultJson: { outputs: [] },
        resultUrls: [],
        errorCode: /connection|timeout|timed out|fetch failed|websocket|grok_connection_failed/i.test(rawMessage)
            ? 'GROK_IMAGE_UPSTREAM_UNREACHABLE'
            : 'GROK_IMAGE_UPSTREAM_FAILED',
        errorMessage,
    };
}
function normalizeGrokImageFailureMessage(rawMessage) {
    if (/Image generation blocked or no valid final image/i.test(rawMessage)) {
        return ('Grok 本地适配器没有拿到最终成图。当前失败通常不是文生图参考图问题，' +
            '更可能是 grok2api 到 grok.com 的 App Chat 或 WebSocket 连接失败、代理未配置、' +
            '登录 Token 失效，或上游审核未返回最终图。原始错误：' + rawMessage);
    }
    if (/connection|timeout|timed out|fetch failed|websocket|grok_connection_failed/i.test(rawMessage)) {
        return ('Grok 上游连接失败。请检查 grok2api 代理配置、登录 Token、当前网络能否访问 grok.com，' +
            '然后重试。原始错误：' + rawMessage);
    }
    return rawMessage;
}
async function queryGrokImage(ctx) {
    const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/v1/tasks/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
    const upstream = await callUpstreamGetJson(ctx.provider, endpoint, { language: 'en' }, ctx.timeoutMs);
    const statusText = extractGrokTaskStatus(upstream);
    const urls = await materializeImageResultUrls(ctx.provider, absolutizeProviderUrls(ctx.provider, extractUrls(upstream).filter(url => !/^data:image\//i.test(url))));
    const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
    const done = ['completed', 'success', 'succeeded', 'done'].includes(statusText);
    return {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : extractGrokTaskProgress(upstream),
        upstreamTaskId: ctx.upstreamTaskId,
        upstreamRequestId: String(upstream?.id || upstream?.request_id || upstream?.data?.id || ''),
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'GROK_IMAGE_TASK_FAILED' : undefined,
        errorMessage: failed ? extractErrorMessage(upstream) : undefined,
    };
}
async function queryGenericImage(ctx) {
    let lastErr;
    for (const endpointPath of imageStatusEndpointCandidates(ctx)) {
        const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
        try {
            const method = resolveVideoStatusMethod(ctx);
            const upstream = method === 'POST'
                ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs)
                : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs);
            return await normalizeGenericImageQueryResult(ctx.provider, ctx.upstreamTaskId, upstream, resolveImageResponseType(ctx));
        }
        catch (err) {
            lastErr = err;
            if (!isRetryableVideoStatusEndpointError(err))
                throw err;
        }
    }
    throw lastErr;
}
async function normalizeGenericImageQueryResult(provider, upstreamTaskId, upstream, responseType = 'object_storage') {
    const statusText = extractGenericTaskStatus(upstream);
    const result = extractImageResult(upstream);
    const resultUrl = await imageResultUrl(provider, result, responseType);
    const urls = resultUrl ? [resultUrl] : await resolveImageResultUrls(provider, extractImageOutputUrls(upstream), responseType);
    const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
    const done = ['completed', 'success', 'succeeded', 'done', 'finished'].includes(statusText);
    const missingDoneResult = done && !urls.length;
    return {
        status: failed || missingDoneResult ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : extractGenericImageProgress(upstream),
        upstreamTaskId,
        upstreamRequestId: String(upstream?.id || upstream?.request_id || upstream?.data?.id || ''),
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'IMAGE_TASK_FAILED' : (missingDoneResult ? imageOutputMissingErrorCode(upstream) : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (missingDoneResult ? imageOutputMissingErrorMessage(upstream) : undefined),
    };
}
function submitRunningImageTaskFromTransientError(err, requestJson) {
    if (!(err instanceof HttpError) || err.status < 500)
        return null;
    const responseJson = err.responseJson;
    const taskId = extractUpstreamTaskId(responseJson);
    if (!taskId)
        return null;
    return {
        status: 'RUNNING',
        progress: extractGenericImageProgress(responseJson),
        upstreamTaskId: taskId,
        upstreamRequestId: String(responseJson?.id || responseJson?.request_id || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(responseJson),
        resultJson: { url: '', outputs: [] },
        resultUrls: [],
    };
}
async function submitGrokImageEdit(ctx) {
    assertImageModelName(ctx);
    const refGroups = (await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true })).slice(-3);
    if (!refGroups.length)
        fail(400, 'Grok 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_REQUIRED');
    const geometry = resolveGrokImageRequestGeometry(ctx);
    const form = new FormData();
    form.set('model', ctx.model.name || 'grok-imagine-image');
    form.set('prompt', ctx.prompt);
    form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
    form.set('size', geometry.size);
    form.set('aspect_ratio', geometry.aspectRatio);
    form.set('resolution', geometry.resolution);
    form.set('response_format', 'url');
    for (let i = 0; i < refGroups.length; i += 1) {
        const file = await imageRefCandidatesToBlob(refGroups[i], ctx.timeoutMs, grokImageRefToBlob);
        form.append('image', file.blob, file.filename);
    }
    const requestJson = compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        n: ctx.params.n || ctx.params.quantity || 1,
        size: geometry.size,
        aspect_ratio: geometry.aspectRatio,
        resolution: geometry.resolution,
        response_format: 'url',
        image_count: refGroups.length,
        images: refGroups.map(group => group.map((ref, index) => redactLargeInlineRef(ref, index))),
    });
    const endpoint = resolveEndpointPath(resolveGrokImageEndpoint(ctx, 'edit'), ctx);
    const upstream = await callUpstreamMultipart(ctx.provider, endpoint, form, ctx.timeoutMs);
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}
async function submitGptImageV2(ctx) {
    assertImageModelName(ctx);
    const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
    const resolution = String(ctx.params.resolution || ctx.params.requestedResolution || '1K').toUpperCase();
    const referenceImages = await buildGptImageV2ReferenceImages(ctx);
    if (generationModeRequiresImageReference(ctx) && !referenceImages.length) {
        fail(400, 'GPT-Image2 图生图/修图/全景任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'GPT_IMAGE_V2_REFERENCE_REQUIRED');
    }
    const requestJson = compactJson({
        model: normalizeGptImageV2BaseModel(ctx.model.name),
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        resolution,
        reasoning_effort: ctx.params.reasoning_effort || ctx.params.reasoningEffort || 'medium',
        ...(referenceImages.length ? { reference_images: referenceImages } : {}),
        response_format: 'url',
        ...withoutKeys(ctx.params, [
            'model', 'prompt', 'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
            'resolution', 'requestedResolution', 'n', 'quantity', 'quality', 'image', 'images', 'reference_images', 'referenceImages',
            'response_format', 'background',
        ]),
    });
    const upstream = await callUpstreamJson(ctx.provider, resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/v1/images/generations', ctx), requestJson, ctx.timeoutMs);
    const urls = await materializeImageResultUrls(ctx.provider, absolutizeProviderUrls(ctx.provider, extractGptImageV2Urls(upstream)));
    if (urls.length) {
        return {
            status: 'SUCCESS',
            progress: 100,
            upstreamTaskId: String(upstream?.task?.task_id || upstream?.task_id || ''),
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: urls[0], outputs: urls },
            resultUrls: urls,
        };
    }
    const fallback = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (fallback.resultUrls?.length || fallback.resultJson?.b64)
        return fallback;
    const taskId = extractUpstreamTaskId(upstream);
    if (taskId) {
        return {
            status: 'RUNNING',
            progress: extractGenericImageProgress(upstream),
            upstreamTaskId: taskId,
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', outputs: [] },
            resultUrls: [],
        };
    }
    return {
        status: 'FAILED',
        progress: 100,
        upstreamTaskId: String(upstream?.task?.task_id || upstream?.task_id || ''),
        upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: fallback.resultJson,
        resultUrls: [],
        errorCode: fallback.errorCode || 'GPT_IMAGE_V2_RESULT_MISSING',
        errorMessage: fallback.errorMessage || extractErrorMessage(upstream) || 'GPT-Image-v2 上游响应未包含 data[0].url、task.result_urls 或可轮询任务 ID',
    };
}
async function submitGeminiImage(ctx) {
    assertImageModelName(ctx);
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const aspectRatio = normalizeGeminiImageAspectRatio(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.size || defaults.aspectRatio);
    const resolution = normalizeGeminiImageSizeToken(ctx.params.imageSize || ctx.params.requestedResolution || ctx.params.resolution || ctx.params.quality || defaults.imageSize || defaults.resolution);
    const parts = [{ text: ctx.prompt }, ...buildGeminiImageParts(ctx)];
    const buildRequestJson = (imageSize) => compactJson({
        contents: [{ role: 'user', parts }],
        generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: compactJson({
                ...(aspectRatio && aspectRatio !== 'auto' ? { aspectRatio } : {}),
                ...(imageSize ? { imageSize } : {}),
            }),
        },
        ...withoutKeys(ctx.params, ['model', 'messages', 'stream', 'contents', 'generationConfig', 'config', 'size', 'n', 'quantity', 'imageSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio', 'resolution', 'requestedResolution', 'quality', 'image', 'images', 'reference_images', 'referenceImages']),
    });
    let requestJson = buildRequestJson(resolution);
    const configuredEndpoint = String(ctx.provider.endpointPath || ctx.model.endpointPath || '').trim();
    const endpoint = resolveEndpointPath(!configuredEndpoint || /chat\/completions/i.test(configuredEndpoint) ? '/v1beta/models/{model}:generateContent' : configuredEndpoint, ctx);
    let upstream;
    try {
        upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    }
    catch (err) {
        if (!resolution || !isGeminiImageSizeUnsupportedError(err))
            throw err;
        const lowerResolution = resolution.toLowerCase();
        if (lowerResolution === resolution)
            throw err;
        requestJson = buildRequestJson(lowerResolution);
        upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    }
    return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}
async function submitGeminiUnifiedImage(ctx) {
    assertImageModelName(ctx);
    const size = normalizeGeminiUnifiedImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
    const requestJson = compactJson({
        model: ctx.model.name || 'gemini-3.1-flash-image-preview',
        prompt: ctx.prompt,
        n: normalizeGrokImageCount(ctx.params.n || ctx.params.quantity),
        size,
        response_format: ctx.params.response_format || ctx.params.responseFormat || 'b64_json',
        ...withoutKeys(ctx.params, [
            'model', 'prompt', 'image', 'images', 'input_image', 'reference_images', 'referenceImages',
            'size', 'imageSize', 'requestedPixelSize', 'aspectRatio', 'aspect_ratio', 'requestedRatio',
            'resolution', 'requestedResolution', 'n', 'quantity', 'stream', 'response_format', 'responseFormat',
        ]),
    });
    const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/generations', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (result.resultUrls?.length)
        return result;
    return {
        ...result,
        status: 'FAILED',
        errorCode: 'GEMINI_IMAGE_RESULT_MISSING',
        errorMessage: extractErrorMessage(upstream) || 'Gemini 统一生图上游响应未包含图片 URL 或 b64_json',
    };
}
async function submitGeminiUnifiedImageEdit(ctx) {
    assertImageModelName(ctx);
    const refGroups = (await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true })).slice(-4);
    if (!refGroups.length)
        fail(400, 'Gemini 图生图需要至少 1 张参考图，且参考图必须是公网 URL 或 data URI', 'GEMINI_IMAGE_REFERENCE_REQUIRED');
    const size = normalizeGeminiUnifiedImageSize(ctx.params.size || ctx.params.imageSize || ctx.params.requestedPixelSize || ctx.params.aspectRatio || ctx.params.aspect_ratio);
    const responseFormat = String(ctx.params.response_format || ctx.params.responseFormat || 'b64_json');
    const form = new FormData();
    form.set('model', ctx.model.name || 'gemini-3.1-flash-image-preview');
    form.set('prompt', ctx.prompt);
    form.set('n', String(ctx.params.n || ctx.params.quantity || 1));
    form.set('size', size);
    form.set('response_format', responseFormat);
    for (let i = 0; i < refGroups.length; i += 1) {
        const file = await imageRefCandidatesToBlob(refGroups[i], ctx.timeoutMs, (ref, timeoutMs) => compatibleImageRefToBlob(ref, timeoutMs, 'Gemini 图生图'));
        form.append('image', file.blob, file.filename);
    }
    const requestJson = compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        n: ctx.params.n || ctx.params.quantity || 1,
        size,
        response_format: responseFormat,
        image_count: refGroups.length,
        images: refGroups.map(group => group.map((ref, index) => redactLargeInlineRef(ref, index))),
    });
    const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/images/edits', ctx);
    const upstream = await callUpstreamMultipart(ctx.provider, endpoint, form, ctx.timeoutMs);
    const result = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (result.resultUrls?.length)
        return result;
    return {
        ...result,
        status: 'FAILED',
        errorCode: 'GEMINI_IMAGE_EDIT_RESULT_MISSING',
        errorMessage: extractErrorMessage(upstream) || 'Gemini 统一图生图上游响应未包含图片 URL 或 b64_json',
    };
}
async function submitMidjourneyImagine(ctx) {
    assertImageModelName(ctx);
    const refs = await collectMidjourneyImagineReferences(ctx);
    if (generationModeRequiresImageReference(ctx) && !refs.promptUrls.length && !refs.base64Array.length) {
        fail(400, 'Midjourney 图生图/分镜任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'MIDJOURNEY_REFERENCE_REQUIRED');
    }
    const requestJson = buildMidjourneyImagineRequest(ctx, refs);
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/mj/submit/imagine', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractMidjourneyTaskId(upstream);
    const rejected = midjourneySubmitRejected(upstream);
    if (rejected) {
        return {
            status: 'FAILED',
            progress: 100,
            upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', outputs: [], taskId },
            resultUrls: [],
            errorCode: 'MIDJOURNEY_SUBMIT_FAILED',
            errorMessage: extractErrorMessage(upstream) || String(upstream?.description || 'Midjourney Imagine 提交失败'),
        };
    }
    const directResult = await normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
    if (directResult.status === 'SUCCESS' || directResult.resultUrls?.length)
        return directResult;
    if (taskId) {
        return {
            status: 'RUNNING',
            progress: extractGenericImageProgress(upstream) || 1,
            upstreamTaskId: taskId,
            upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', outputs: [], taskId },
            resultUrls: [],
        };
    }
    return {
        ...directResult,
        status: 'FAILED',
        errorCode: directResult.errorCode || 'MIDJOURNEY_TASK_MISSING',
        errorMessage: directResult.errorMessage || extractErrorMessage(upstream) || 'Midjourney Imagine 上游响应未包含 result 任务 ID 或图片结果',
    };
}
async function queryMidjourneyImagine(ctx) {
    let lastErr;
    for (const endpointPath of midjourneyStatusEndpointCandidates(ctx)) {
        const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
        try {
            const method = resolveMidjourneyStatusMethod(ctx);
            const upstream = method === 'POST'
                ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs)
                : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, 'taskId'), ctx.timeoutMs);
            return await normalizeMidjourneyImagineQueryResult(ctx, upstream);
        }
        catch (err) {
            lastErr = err;
            if (!isRetryableVideoStatusEndpointError(err))
                throw err;
        }
    }
    throw lastErr;
}
function buildMidjourneyImagineRequest(ctx, refs) {
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const botType = String(firstDefined(ctx.params.botType, ctx.params.bot_type, defaults.botType, providerDefaults.botType, 'MID_JOURNEY') || 'MID_JOURNEY').trim() || 'MID_JOURNEY';
    const accountFilter = buildMidjourneyAccountFilter(ctx);
    return compactJson({
        state: firstDefined(ctx.params.state, defaults.state, providerDefaults.state),
        notifyHook: firstDefined(ctx.params.notifyHook, ctx.params.notify_hook, defaults.notifyHook, providerDefaults.notifyHook),
        botType,
        prompt: buildMidjourneyImaginePrompt(ctx, refs.promptUrls),
        ...(refs.base64Array.length ? { base64Array: refs.base64Array } : {}),
        ...(accountFilter ? { accountFilter } : {}),
    });
}
function buildMidjourneyImaginePrompt(ctx, promptUrls) {
    const basePrompt = String(ctx.prompt || '').trim();
    const promptParams = String(firstDefined(ctx.params.mjParams, ctx.params.midjourneyParams, ctx.params.midjourney_params, '') || '').trim();
    const joined = [...promptUrls, basePrompt].filter(Boolean).join(' ').trim();
    const aspectRatio = normalizeMidjourneyAspectRatio(firstDefined(ctx.params.aspectRatio, ctx.params.aspect_ratio, ctx.params.requestedRatio, ctx.params.size));
    const suffixes = [];
    if (promptParams)
        suffixes.push(promptParams);
    if (aspectRatio && !/--(?:ar|aspect)\s+\S+/i.test(`${joined} ${promptParams}`))
        suffixes.push(`--ar ${aspectRatio}`);
    return [joined, ...suffixes].filter(Boolean).join(' ').trim();
}
function buildMidjourneyAccountFilter(ctx) {
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const raw = isRecord(ctx.params.accountFilter)
        ? ctx.params.accountFilter
        : (isRecord(ctx.params.account_filter) ? ctx.params.account_filter : {});
    const modes = normalizeMidjourneySpeedModes(firstDefined(ctx.params.modes, ctx.params.mode, ctx.params.speedMode, ctx.params.speed_mode, ctx.params.mjSpeedMode, ctx.params.mj_speed_mode, raw.modes, defaults.modes, defaults.speedMode, providerDefaults.modes, providerDefaults.speedMode));
    const accountFilter = compactJson({
        instanceId: firstDefined(ctx.params.instanceId, ctx.params.instance_id, raw.instanceId, raw.instance_id, defaults.instanceId, providerDefaults.instanceId),
        ...(modes.length ? { modes } : {}),
        remix: firstDefined(ctx.params.remix, raw.remix, defaults.remix, providerDefaults.remix),
        nijiRemix: firstDefined(ctx.params.nijiRemix, ctx.params.niji_remix, raw.nijiRemix, raw.niji_remix, defaults.nijiRemix, providerDefaults.nijiRemix),
        remixAutoConsidered: firstDefined(ctx.params.remixAutoConsidered, ctx.params.remix_auto_considered, raw.remixAutoConsidered, raw.remix_auto_considered, defaults.remixAutoConsidered, providerDefaults.remixAutoConsidered),
        remark: firstDefined(ctx.params.remark, raw.remark, defaults.remark, providerDefaults.remark),
    });
    return Object.keys(accountFilter).length ? accountFilter : null;
}
async function collectMidjourneyImagineReferences(ctx) {
    const promptUrls = [];
    const base64Array = [];
    const groups = await collectPublicImageReferenceUrlGroups(ctx, 15000, { allowLocalFiles: true });
    for (const group of groups) {
        let used = false;
        for (const ref of group) {
            const raw = String(ref || '').trim();
            if (!raw)
                continue;
            if (isPublicHttpUrl(raw)) {
                if (!promptUrls.includes(raw))
                    promptUrls.push(raw);
                used = true;
                break;
            }
        }
        if (used)
            continue;
        for (const ref of group) {
            const raw = String(ref || '').trim();
            const b64 = await midjourneyBase64FromReference(raw);
            if (b64 && !base64Array.includes(b64)) {
                base64Array.push(b64);
                break;
            }
        }
    }
    return { promptUrls, base64Array };
}
async function midjourneyBase64FromReference(ref) {
    if (!ref)
        return '';
    if (/^data:image\//i.test(ref)) {
        return ref.split(',', 2)[1]?.replace(/\s+/g, '') || '';
    }
    if (isLocalImageFileRef(ref)) {
        const filePath = localImageFileRefPath(ref);
        if (!filePath)
            return '';
        try {
            const buffer = await fs.readFile(filePath);
            return buffer.toString('base64');
        }
        catch {
            return '';
        }
    }
    return '';
}
function normalizeMidjourneySpeedModes(value) {
    const rawValues = Array.isArray(value) ? value : [value];
    const modes = rawValues.map(item => String(item || '').trim().toUpperCase()).filter(item => ['RELAX', 'FAST', 'TURBO'].includes(item));
    return Array.from(new Set(modes));
}
function normalizeMidjourneyAspectRatio(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!raw || raw === 'auto')
        return '';
    const direct = raw.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (direct)
        return `${trimAspectNumber(direct[1])}:${trimAspectNumber(direct[2])}`;
    const size = raw.match(/^(\d+)x(\d+)$/);
    if (!size)
        return '';
    const width = Number(size[1]);
    const height = Number(size[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return '';
    const gcd = greatestCommonDivisor(width, height);
    return `${Math.round(width / gcd)}:${Math.round(height / gcd)}`;
}
function trimAspectNumber(value) {
    return String(Number(value)).replace(/\.0+$/, '');
}
function greatestCommonDivisor(a, b) {
    let left = Math.abs(Math.round(a));
    let right = Math.abs(Math.round(b));
    while (right) {
        const next = left % right;
        left = right;
        right = next;
    }
    return left || 1;
}
function extractMidjourneyTaskId(payload) {
    const data = payload?.data;
    const result = payload?.result;
    const dataResult = data?.result;
    const candidates = [
        result,
        dataResult,
        payload?.taskId,
        payload?.task_id,
        payload?.id,
        payload?.properties?.taskId,
        payload?.properties?.task_id,
        data?.taskId,
        data?.task_id,
        data?.id,
        isRecord(result) ? result.taskId : undefined,
        isRecord(result) ? result.task_id : undefined,
        isRecord(result) ? result.id : undefined,
        isRecord(dataResult) ? dataResult.taskId : undefined,
        isRecord(dataResult) ? dataResult.task_id : undefined,
        isRecord(dataResult) ? dataResult.id : undefined,
    ];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string' && typeof candidate !== 'number' && typeof candidate !== 'bigint')
            continue;
        const value = String(candidate).trim();
        if (value && !/^https?:\/\//i.test(value))
            return value;
    }
    return extractUpstreamTaskId(payload);
}
function midjourneySubmitRejected(payload) {
    const code = payload?.code ?? payload?.data?.code;
    if (code === undefined || code === null || code === '')
        return false;
    const raw = String(code).trim().toLowerCase();
    return !['0', '1', '200', 'success', 'ok'].includes(raw);
}
function midjourneyStatusEndpointCandidates(ctx) {
    return uniqueStrings([
        ctx.params.statusEndpointPath,
        ctx.model.statusEndpointPath,
        ctx.provider.statusEndpointPath,
        '/mj/task/{taskId}/fetch',
        '/mj/task/{taskId}',
        '/mj/task/fetch',
    ]);
}
function resolveMidjourneyStatusMethod(ctx) {
    const explicit = String(ctx.params.statusMethod || ctx.params.status_method || '').trim().toUpperCase();
    if (explicit === 'GET' || explicit === 'POST')
        return explicit;
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const protocolMethod = String(protocol.statusMethod || protocol.status_method || '').trim().toUpperCase();
    if (protocolMethod === 'GET' || protocolMethod === 'POST')
        return protocolMethod;
    const providerMethod = String(ctx.provider.requestMethod || '').trim().toUpperCase();
    if (providerMethod === 'GET' || providerMethod === 'POST')
        return providerMethod;
    return 'GET';
}
async function normalizeMidjourneyImagineQueryResult(ctx, upstream) {
    const normalized = withMidjourneyStatusAliases(upstream);
    const result = await normalizeGenericImageQueryResult(ctx.provider, ctx.upstreamTaskId, normalized, resolveImageResponseType(ctx));
    return {
        ...result,
        responseJson: sanitizeUpstreamPayload(upstream),
        errorCode: result.status === 'FAILED' ? result.errorCode || 'MIDJOURNEY_TASK_FAILED' : result.errorCode,
        errorMessage: result.status === 'FAILED' ? result.errorMessage || extractErrorMessage(upstream) : result.errorMessage,
    };
}
function withMidjourneyStatusAliases(payload) {
    const status = extractGenericTaskStatus(payload);
    const mapped = {
        fail: 'failed',
        failure: 'failed',
        in_progress: 'processing',
        not_start: 'processing',
        submitted: 'processing',
        waiting: 'processing',
        queued: 'processing',
        running: 'processing',
    }[status] || status;
    if (!mapped || mapped === status)
        return payload;
    return isRecord(payload) ? { ...payload, status: mapped } : { status: mapped, result: payload };
}
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isFileIdRejectedImageUrlError(err) {
    const message = err instanceof Error ? err.message : String(err || '');
    return /file[_ -]?id.*not supported|file_id.*not supported|images\[\]\.image_url|image_url.*required/i.test(message);
}
function isGeminiImageSizeUnsupportedError(err) {
    const message = err instanceof Error ? err.message : String(err || '');
    return /size\s*参数取值不受支持|unsupported\s+(?:image\s*)?size|imageSize|image_size|invalid\s+size/i.test(message);
}
async function buildOpenAiEditsImageUrlFallbackRequest(ctx, requestJson) {
    const imageUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx);
    if (!imageUrls.length)
        return null;
    const base = isRecord(requestJson) ? requestJson : {};
    return compactJson({
        ...withoutKeys(base, ['image', 'images', 'input_image']),
        ...buildOpenAiEditsUrlReferencePayload(imageUrls),
    });
}
function collectOpenAiEditsFallbackReferences(ctx) {
    const urls = new Set();
    const fileIds = new Set();
    const push = (value) => {
        if (!value)
            return;
        if (typeof value === 'string') {
            const raw = value.trim();
            const publicUrl = resolvePublicReferenceImageUrl(raw);
            if (publicUrl)
                urls.add(publicUrl);
            else if (/^file-[\w-]+$/i.test(raw)) {
                const fallbackUrl = getUploadedFileFallbackUrl(raw);
                if (fallbackUrl)
                    urls.add(fallbackUrl);
                else
                    fileIds.add(raw);
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => push(item));
            return;
        }
        if (!isRecord(value))
            return;
        const saved = isRecord(value.saved) ? value.saved : {};
        const imageUrl = value.image_url;
        [
            value.fallbackRemoteUrl,
            value.remoteFallbackUrl,
            value.objectStorageUrl,
            value.publicUrl,
            value.cosUrl,
            value.cos_url,
            saved.fallbackRemoteUrl,
            saved.remoteFallbackUrl,
            saved.objectStorageUrl,
            saved.publicUrl,
            saved.remoteUrl,
            saved.url,
            isRecord(imageUrl) ? imageUrl.url : imageUrl,
            value.url,
            value.remoteUrl,
        ].forEach(item => push(item));
    };
    ctx.inputFiles.forEach(item => push(item));
    [
        ctx.params.images,
        ctx.params.reference_images,
        ctx.params.referenceImages,
        ctx.params.input_image,
        ctx.params.image,
    ].forEach(item => push(item));
    return { urls: Array.from(urls), fileIds: Array.from(fileIds) };
}
async function collectOpenAiEditsFallbackImageUrlsForRequest(ctx, fileIdTimeoutMs = 15000) {
    const refs = collectOpenAiEditsFallbackReferences(ctx);
    const resolved = [];
    const fallbackUrls = await Promise.all(refs.fileIds.map(fileId => getUploadedFileFallbackUrlAsync(fileId, fileIdTimeoutMs)));
    for (const fallbackUrl of fallbackUrls) {
        if (fallbackUrl)
            refs.urls.push(fallbackUrl);
    }
    for (const url of refs.urls) {
        resolved.push(await materializeGenerationResultReferenceUrl(url));
    }
    return Array.from(new Set(resolved.filter(Boolean)));
}
async function collectOpenAiResponsesImageReferences(ctx) {
    const publicUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
    if (publicUrls.length)
        return publicUrls;
    const rawReferences = [
        ctx.params.images,
        ctx.params.reference_images,
        ctx.params.referenceImages,
        ctx.params.image,
        ctx.params.input_image,
        ctx.inputFiles,
    ].filter(value => value != null);
    return Array.from(new Set(rawReferences.flatMap(value => collectOpenAiPrimaryFileRefs(value))));
}
function openAiResponsesInputImageContent(ref) {
    const raw = String(ref || '').trim();
    if (/^file-[\w-]+$/i.test(raw))
        return { type: 'input_image', file_id: raw };
    return { type: 'input_image', image_url: raw };
}
function isPublicHttpUrl(value) {
    return /^https?:\/\//i.test(value) && !/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(value);
}
function resolvePublicReferenceImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    const unwrapped = unwrapWorkbenchProxyImageUrl(raw);
    if (unwrapped && unwrapped !== raw)
        return resolvePublicReferenceImageUrl(unwrapped);
    if (isPublicHttpUrl(raw))
        return raw;
    if (!isGenerationResultPath(raw))
        return '';
    const base = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (!base)
        return '';
    try {
        const parsed = new URL(raw, base);
        return parsed.toString();
    }
    catch {
        return '';
    }
}
function unwrapWorkbenchProxyImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    try {
        const parsed = raw.startsWith('http://') || raw.startsWith('https://')
            ? new URL(raw)
            : new URL(raw, 'http://local');
        if (parsed.pathname !== '/api/workbench/image-studio/proxy-image')
            return raw;
        return parsed.searchParams.get('remoteUrl') || parsed.searchParams.get('url') || raw;
    }
    catch {
        return raw;
    }
}
function isGenerationResultPath(value) {
    const raw = String(value || '').trim();
    if (/^\/api\/generation\/results\//i.test(raw))
        return true;
    try {
        const parsed = new URL(raw);
        return /^\/api\/generation\/results\//i.test(parsed.pathname);
    }
    catch {
        return false;
    }
}
async function materializeGenerationResultReferenceUrl(value) {
    const raw = String(value || '').trim();
    if (!isGenerationResultPath(raw))
        return raw;
    const filename = generationResultFilename(raw);
    if (!filename)
        return raw;
    const filePath = generatedImageFilePath(filename);
    if (!filePath)
        return raw;
    const cached = generatedResultObjectStorageCache.get(filename);
    if (cached)
        return cached;
    try {
        const buffer = await fs.readFile(filePath);
        const publicUrl = await uploadImageBufferToObjectStorageBestEffort(buffer, filename, inferImageMimeType(filename));
        if (publicUrl) {
            generatedResultObjectStorageCache.set(filename, publicUrl);
            return publicUrl;
        }
    }
    catch {
        return raw;
    }
    return raw;
}
function generationResultFilename(value) {
    const raw = String(value || '').trim();
    try {
        const parsed = new URL(raw, config.publicBaseUrl || 'http://localhost');
        if (!/^\/api\/generation\/results\//i.test(parsed.pathname))
            return '';
        return path.basename(decodeURIComponent(parsed.pathname));
    }
    catch {
        if (!/^\/api\/generation\/results\//i.test(raw))
            return '';
        return path.basename(raw.split(/[?#]/)[0]);
    }
}
function assertImageModelName(ctx) {
    if (ctx.type !== 'IMAGE')
        return;
    const modelName = String(ctx.model.name || '').trim();
    if (!looksLikeLanguageModelName(modelName))
        return;
    fail(400, `图片模型配置错误：真实模型名称 ${modelName} 看起来是语言模型，不是生图模型。请在后台模型管理中把该模型移到 LLM 类型，或改成真实生图模型名。`, 'IMAGE_MODEL_NAME_INVALID');
}
function looksLikeLanguageModelName(modelName) {
    const raw = String(modelName || '').trim().toLowerCase();
    if (!raw || /gpt[-_ ]?image|image|imagen|imagine|flux|sdxl|midjourney|niji|sora|veo/.test(raw))
        return false;
    return /^(gpt[-_ ]?(?:3|4|4o|5)|gpt\d|deepseek|qwen|glm|claude|grok[-_ ]?4|gemini[-_ ]?(?:1|2|3)(?:[._-]|$))/.test(raw);
}
function shouldUseOpenAiEditsInputImage(ctx) {
    const mode = String(ctx.mode || '').trim().toLowerCase();
    if (/^(txt2img|text-to-image|text2image|generate|generation|文生图)$/.test(mode))
        return false;
    return hasOpenAiEditsInputImage(ctx);
}
function generationModeRequiresImageReference(ctx) {
    if (ctx.type !== 'IMAGE')
        return false;
    const mode = String(ctx.mode || ctx.params.mode || '').trim().toLowerCase();
    return /img2img|image[-_ ]?to[-_ ]?image|edit|repair|refine|panorama|storyboard-img2img/.test(mode);
}
function openAiImageResponseFormat(ctx) {
    const responseType = resolveImageResponseType(ctx);
    if (responseType === 'base64' || responseType === 'server_base64_object_storage' || responseType === 'server_base64_async_object_storage')
        return 'b64_json';
    if (responseType === 'provider_url' || responseType === 'object_storage' || responseType === 'server_object_storage')
        return 'url';
    const explicit = String(ctx.params.response_format || ctx.params.responseFormat || '').trim();
    if (explicit)
        return explicit;
    if (shouldUseProviderUrlImageResult(ctx))
        return 'url';
    if (shouldPreferInlineImageResult(ctx))
        return 'b64_json';
    return 'url';
}
function resolveImageResponseType(ctx) {
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const mode = normalizeResponseTypeMode(modelProtocol.responseTypeMode ??
        modelProtocol.response_type_mode ??
        defaults.responseTypeMode ??
        defaults.response_type_mode ??
        ctx.params.responseTypeMode ??
        ctx.params.response_type_mode ??
        protocol.responseTypeMode ??
        protocol.response_type_mode ??
        providerDefaults.responseTypeMode ??
        providerDefaults.response_type_mode);
    const uniform = normalizeImageResponseTypeValue(modelProtocol.responseType ??
        modelProtocol.response_type ??
        defaults.responseType ??
        defaults.response_type ??
        ctx.params.responseType ??
        ctx.params.response_type ??
        protocol.responseType ??
        protocol.response_type ??
        providerDefaults.responseType ??
        providerDefaults.response_type) || 'object_storage';
    if (mode === 'by_resolution') {
        const map = firstRecord(modelProtocol.responseTypes, modelProtocol.response_types, defaults.responseTypes, defaults.response_types, ctx.params.responseTypes, ctx.params.response_types, protocol.responseTypes, protocol.response_types, providerDefaults.responseTypes, providerDefaults.response_types);
        const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ?? ctx.params.resolution ?? ctx.params.imageSize ?? ctx.params.size);
        const mapped = resolution ? normalizeImageResponseTypeValue(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : '';
        return mapped || uniform;
    }
    return uniform;
}
function firstRecord(...values) {
    return values.find(value => value && typeof value === 'object' && !Array.isArray(value));
}
function normalizeResponseTypeMode(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'by_resolution' || raw === 'by-resolution' || raw === 'resolution' || raw === 'per_resolution')
        return 'by_resolution';
    return 'uniform';
}
function normalizeResponseTypeResolution(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (/^[1-4]k$/.test(raw))
        return raw;
    const match = raw.match(/(\d{3,5})\s*x\s*(\d{3,5})/i);
    if (match) {
        const longSide = Math.max(Number(match[1]), Number(match[2]));
        if (longSide >= 3500)
            return '4k';
        if (longSide >= 2500)
            return '3k';
        if (longSide >= 1500)
            return '2k';
        return '1k';
    }
    return '';
}
function normalizeImageResponseTypeValue(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'default' || raw === 'auto')
        return '';
    if (['cos', 'object_storage', 'object-storage', 'tencent_cos', '转存cos'].includes(raw))
        return 'object_storage';
    if (['server_object_storage', 'server-object-storage', 'server_async_object_storage', 'server-async-object-storage', 'backend_object_storage', 'backend-object-storage', 'backend_async_object_storage', 'backend-async-object-storage', 'backend_cos', 'server_cos', '124_cos', '124_async_cos', '124-server-cos', '124服务器转存cos', '124异步转存cos', '后台转存cos', '后台异步转存cos'].includes(raw))
        return 'server_object_storage';
    if (['server_base64_object_storage', 'server-base64-object-storage', 'base64_object_storage', 'base64-object-storage', 'b64_object_storage', 'b64-object-storage', 'base64_to_object_storage', 'base64-to-object-storage', 'base64_to_cos', 'base64-to-cos', 'b64_to_cos', 'b64-to-cos', '124_base64_cos', '124-base64-cos', '124_base64_to_cos', '124-base64-to-cos', '124_base64_object_storage', '124-base64-object-storage', '124服务器base64转存cos', '124base64转存cos', 'base64转存cos', 'b64转存cos', '后台base64转存cos'].includes(raw))
        return 'server_base64_object_storage';
    if (['server_base64_async_object_storage', 'server-base64-async-object-storage', 'server_async_base64_object_storage', 'server-async-base64-object-storage', 'base64_async_object_storage', 'base64-async-object-storage', 'b64_async_object_storage', 'b64-async-object-storage', 'base64_async_to_object_storage', 'base64-async-to-object-storage', 'base64_async_to_cos', 'base64-async-to-cos', 'b64_async_to_cos', 'b64-async-to-cos', '124_base64_async_cos', '124-base64-async-cos', '124_async_base64_cos', '124-async-base64-cos', '124_base64_async_to_cos', '124-base64-async-to-cos', '124_base64_async_object_storage', '124-base64-async-object-storage', '124服务器base64异步转存cos', '124base64异步转存cos', 'base64异步转存cos', 'b64异步转存cos', '后台base64异步转存cos'].includes(raw))
        return 'server_base64_async_object_storage';
    if (['url', 'provider_url', 'provider-url', 'origin_url', 'original_url', 'raw_url', '43_url', 'service_url', '43服务原地址'].includes(raw))
        return 'provider_url';
    if (['base64', 'b64', 'b64_json'].includes(raw))
        return 'base64';
    return '';
}
function shouldUseProviderUrlImageResult(ctx) {
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const hint = [
        ctx.provider.providerKey,
        ctx.provider.name,
        ctx.provider.baseUrl,
        ctx.provider.adapter,
        ctx.provider.defaultModel,
        ctx.model.id,
        ctx.model.modelKey,
        ctx.model.name,
        ctx.model.displayName,
        ctx.model.adapter,
        ctx.model.endpointPath,
        protocol.adapter,
        protocol.endpointPath,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return (/gpt[-_ ]?image[-_ ]?2/.test(hint) ||
        hint.includes('canvas_gpt-image-2-pro') ||
        hint.includes('canvas-gpt-image-2-pro'));
}
function withGptImage2MainModel(ctx, requestJson) {
    const request = isRecord(requestJson) ? { ...requestJson } : {};
    const mainModel = resolveGptImage2MainModel(ctx);
    if (!mainModel)
        return requestJson;
    return compactJson({
        ...request,
        main_model: mainModel,
        responses_model: mainModel,
        codex_model: mainModel,
        imageMainModel: mainModel,
    });
}
function withOpenAiImageRequestOptions(ctx, requestJson) {
    const request = withGptImage2LargeAsyncTaskHint(ctx, withGptImage2MainModel(ctx, requestJson));
    const stream = resolveImageUpstreamStream(ctx);
    if (stream === undefined)
        return request;
    return compactJson({ ...(isRecord(request) ? request : {}), stream });
}
function withGptImage2LargeAsyncTaskHint(ctx, requestJson) {
    if (!resolveGptImage2AsyncTask(ctx, requestJson))
        return requestJson;
    const request = isRecord(requestJson) ? { ...requestJson } : {};
    return compactJson({
        ...request,
        async_task: true,
        asyncTask: true,
    });
}
function resolveGptImage2AsyncTask(ctx, requestJson) {
    if (!isGptImage2Request(ctx))
        return false;
    const explicit = parseOptionalAsyncTaskMode(ctx.params.async_task ?? ctx.params.asyncTask);
    if (explicit !== undefined)
        return explicit;
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const configMode = normalizeResponseTypeMode(firstDefined(ctx.params.asyncTaskConfigMode, ctx.params.async_task_config_mode, protocol.asyncTaskConfigMode, protocol.async_task_config_mode, modelProtocol.asyncTaskConfigMode, modelProtocol.async_task_config_mode, defaults.asyncTaskConfigMode, defaults.async_task_config_mode, providerDefaults.asyncTaskConfigMode, providerDefaults.async_task_config_mode));
    const rawMode = firstDefined(ctx.params.asyncTaskMode, ctx.params.async_task_mode, protocol.asyncTaskMode, protocol.async_task_mode, modelProtocol.asyncTaskMode, modelProtocol.async_task_mode, defaults.asyncTaskMode, defaults.async_task_mode, providerDefaults.asyncTaskMode, providerDefaults.async_task_mode);
    if (configMode === 'by_resolution') {
        const map = firstRecord(ctx.params.asyncTaskModes, ctx.params.async_task_modes, protocol.asyncTaskModes, protocol.async_task_modes, modelProtocol.asyncTaskModes, modelProtocol.async_task_modes, defaults.asyncTaskModes, defaults.async_task_modes, providerDefaults.asyncTaskModes, providerDefaults.async_task_modes);
        const request = isRecord(requestJson) ? requestJson : {};
        const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ??
            ctx.params.resolution ??
            ctx.params.imageSize ??
            ctx.params.size ??
            request.requestedResolution ??
            request.resolution ??
            request.size);
        const mappedMode = resolution ? normalizeGptImage2AsyncTaskMode(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : 'sync';
        return mappedMode === 'async';
    }
    return normalizeGptImage2AsyncTaskMode(rawMode) === 'async';
}
function isLargeGptImage2Request(ctx, requestJson) {
    const request = isRecord(requestJson) ? requestJson : {};
    const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ??
        ctx.params.resolution ??
        request.requestedResolution ??
        request.resolution);
    if (resolution === '4k')
        return true;
    const rawSize = String(request.size ??
        ctx.params.size ??
        ctx.params.imageSize ??
        ctx.params.requestedPixelSize ??
        request.requestedPixelSize ??
        '').trim();
    const match = rawSize.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
    if (!match)
        return false;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return false;
    return width * height >= 5_800_000 || Math.max(width, height) >= 3500;
}
function resolveImageUpstreamStream(ctx) {
    const explicit = parseOptionalBoolean(ctx.params.stream);
    if (explicit !== undefined)
        return explicit;
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const modelProtocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const configMode = normalizeResponseTypeMode(firstDefined(ctx.params.upstreamStreamConfigMode, ctx.params.upstream_stream_config_mode, protocol.upstreamStreamConfigMode, protocol.upstream_stream_config_mode, modelProtocol.upstreamStreamConfigMode, modelProtocol.upstream_stream_config_mode, defaults.upstreamStreamConfigMode, defaults.upstream_stream_config_mode, providerDefaults.upstreamStreamConfigMode, providerDefaults.upstream_stream_config_mode));
    const rawMode = firstDefined(ctx.params.upstreamStreamMode, ctx.params.upstream_stream_mode, protocol.upstreamStreamMode, protocol.upstream_stream_mode, modelProtocol.upstreamStreamMode, modelProtocol.upstream_stream_mode, defaults.upstreamStreamMode, defaults.upstream_stream_mode, providerDefaults.upstreamStreamMode, providerDefaults.upstream_stream_mode);
    if (configMode === 'by_resolution') {
        const map = firstRecord(ctx.params.upstreamStreamModes, ctx.params.upstream_stream_modes, protocol.upstreamStreamModes, protocol.upstream_stream_modes, modelProtocol.upstreamStreamModes, modelProtocol.upstream_stream_modes, defaults.upstreamStreamModes, defaults.upstream_stream_modes, providerDefaults.upstreamStreamModes, providerDefaults.upstream_stream_modes);
        const resolution = normalizeResponseTypeResolution(ctx.params.requestedResolution ?? ctx.params.resolution ?? ctx.params.imageSize ?? ctx.params.size);
        const mappedMode = resolution ? normalizeUpstreamStreamMode(map?.[resolution] ?? map?.[resolution.toUpperCase()]) : 'auto';
        if (mappedMode === 'stream')
            return true;
        if (mappedMode === 'non_stream')
            return false;
    }
    const mode = normalizeUpstreamStreamMode(rawMode);
    if (mode === 'stream')
        return true;
    if (mode === 'non_stream')
        return false;
    return undefined;
}
function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}
function parseOptionalBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value !== 0;
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw)
        return undefined;
    if (['true', '1', 'yes', 'y', 'on', 'stream'].includes(raw))
        return true;
    if (['false', '0', 'no', 'n', 'off', 'non_stream', 'non-stream', 'nonstream'].includes(raw))
        return false;
    return undefined;
}
function parseOptionalAsyncTaskMode(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return normalizeGptImage2AsyncTaskMode(value) === 'async';
}
function normalizeGptImage2AsyncTaskMode(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (['async', 'async_task', 'async-task', 'background', 'background_task', 'background-task', 'true', '1', 'yes', '异步'].includes(raw))
        return 'async';
    if (['sync', 'normal', 'synchronous', 'false', '0', 'no', '同步', 'off'].includes(raw))
        return 'sync';
    return 'sync';
}
function normalizeUpstreamStreamMode(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'stream' || raw === 'streaming' || raw === 'true')
        return 'stream';
    if (raw === 'non_stream' || raw === 'non-stream' || raw === 'nonstream' || raw === 'false')
        return 'non_stream';
    return 'auto';
}
function resolveGptImage2MainModel(ctx) {
    if (!isGptImage2Request(ctx))
        return '';
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    return normalizeGptImage2MainModel(ctx.params.main_model ??
        ctx.params.mainModel ??
        ctx.params.responses_model ??
        ctx.params.responsesModel ??
        ctx.params.codex_model ??
        ctx.params.codexModel ??
        ctx.params.imageMainModel ??
        protocol.imageMainModel ??
        protocol.responsesModel ??
        protocol.codexModel ??
        defaults.imageMainModel ??
        defaults.responsesModel ??
        defaults.codexModel ??
        providerDefaults.imageMainModel ??
        providerDefaults.responsesModel ??
        providerDefaults.codexModel);
}
function resolveOpenAiResponsesImageMainModel(ctx) {
    const gptImage2MainModel = resolveGptImage2MainModel(ctx);
    if (gptImage2MainModel)
        return gptImage2MainModel;
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const configured = String(firstDefined(ctx.params.main_model, ctx.params.mainModel, ctx.params.responses_model, ctx.params.responsesModel, ctx.params.codex_model, ctx.params.codexModel, ctx.params.imageMainModel, protocol.imageMainModel, protocol.responsesModel, protocol.codexModel, defaults.imageMainModel, defaults.responsesModel, defaults.codexModel, providerDefaults.imageMainModel, providerDefaults.responsesModel, providerDefaults.codexModel) || '').trim();
    if (configured)
        return configured;
    const providerDefault = String(ctx.provider.defaultModel || '').trim();
    return looksLikeLanguageModelName(providerDefault) ? providerDefault : 'gpt-5.4-mini';
}
function resolveOpenAiChatImageMainModel(ctx) {
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const configured = String(firstDefined(ctx.params.main_model, ctx.params.mainModel, ctx.params.responses_model, ctx.params.responsesModel, ctx.params.codex_model, ctx.params.codexModel, ctx.params.imageMainModel, protocol.imageMainModel, protocol.responsesModel, protocol.codexModel, defaults.imageMainModel, defaults.responsesModel, defaults.codexModel, providerDefaults.imageMainModel, providerDefaults.responsesModel, providerDefaults.codexModel) || '').trim();
    if (configured)
        return configured;
    const modelName = String(ctx.model.name || '').trim();
    if (looksLikeLanguageModelName(modelName))
        return modelName;
    const providerDefault = String(ctx.provider.defaultModel || '').trim();
    if (looksLikeLanguageModelName(providerDefault))
        return providerDefault;
    return 'gpt-5.4-mini';
}
function resolveOpenAiChatImageToolModel(ctx) {
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const configured = String(firstDefined(ctx.params.image_tool_model, ctx.params.imageToolModel, ctx.params.image_model, ctx.params.imageModel, ctx.params.imageGenerationModel, ctx.params.toolModel, protocol.imageToolModel, protocol.image_model, protocol.imageModel, protocol.imageGenerationModel, defaults.imageToolModel, defaults.image_model, defaults.imageModel, defaults.imageGenerationModel, providerDefaults.imageToolModel, providerDefaults.image_model, providerDefaults.imageModel, providerDefaults.imageGenerationModel) || '').trim();
    if (looksLikeImageGenerationModelName(configured))
        return configured;
    const paramsModel = String(ctx.params.model || '').trim();
    if (looksLikeImageGenerationModelName(paramsModel))
        return paramsModel;
    const modelName = String(ctx.model.name || '').trim();
    if (looksLikeImageGenerationModelName(modelName))
        return modelName;
    return 'gpt-image-2';
}
function looksLikeImageGenerationModelName(modelName) {
    const raw = String(modelName || '').trim().toLowerCase();
    if (!raw)
        return false;
    return /gpt[-_ ]?image[-_ ]?2|image|imagen|imagine|flux|sdxl|midjourney|niji/.test(raw);
}
function normalizeOpenAiChatImageToolSize(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    if (!raw || raw === 'auto' || raw === '1:1' || raw === 'square')
        return '1024x1024';
    if (raw === '16:9' || raw === 'landscape' || raw === 'wide')
        return '1792x1024';
    if (raw === '9:16' || raw === 'portrait' || raw === 'vertical')
        return '1024x1792';
    const match = raw.match(/^(\d{3,5})\s*x\s*(\d{3,5})$/);
    if (!match)
        return '1024x1024';
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return '1024x1024';
    if (width === height)
        return '1024x1024';
    if (width === 1792 && height === 1024)
        return '1792x1024';
    if (width === 1024 && height === 1792)
        return '1024x1792';
    return width > height ? '1792x1024' : '1024x1792';
}
function normalizeGptImage2MainModel(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    const lower = raw.toLowerCase();
    if (['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'].includes(lower))
        return lower;
    return '';
}
function isGptImage2Request(ctx) {
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const hint = [
        ctx.provider.providerKey,
        ctx.provider.name,
        ctx.provider.baseUrl,
        ctx.provider.adapter,
        ctx.provider.defaultModel,
        ctx.model.id,
        ctx.model.modelKey,
        ctx.model.name,
        ctx.model.displayName,
        ctx.model.adapter,
        ctx.model.endpointPath,
        protocol.adapter,
        protocol.endpointPath,
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return /gpt[-_ ]?image[-_ ]?2/.test(hint) || hint.includes('canvas_gpt-image-2-pro') || hint.includes('canvas-gpt-image-2-pro');
}
function shouldPreferInlineImageResult(ctx) {
    if (!isObjectStorageConfigured())
        return false;
    const protocol = isRecord(ctx.params.protocol) ? ctx.params.protocol : {};
    const mode = String(ctx.params.uploadMode || ctx.params.upload_mode || protocol.uploadMode || protocol.upload_mode || ctx.model.uploadMode || ctx.provider.uploadMode || '').trim().toLowerCase();
    return !mode || mode === 'object_storage' || mode === 'cos' || mode === 'tencent_cos' || mode === 'local_cache_async_cos' || mode === 'local-cache-async-cos';
}
async function callOpenAiImageJson(ctx, endpoint, requestJson) {
    const sanitizedRequestJson = sanitizeOpenAiImageRequestForEndpoint(endpoint, requestJson);
    try {
        return await callUpstreamJson(ctx.provider, endpoint, sanitizedRequestJson, ctx.timeoutMs);
    }
    catch (err) {
        if (!shouldRetryOpenAiImageWithUrlResult(err, sanitizedRequestJson))
            throw err;
        const requestBody = isRecord(sanitizedRequestJson) ? sanitizedRequestJson : {};
        const fallbackJson = compactJson({
            ...requestBody,
            response_format: 'url',
        });
        return callUpstreamJson(ctx.provider, endpoint, sanitizeOpenAiImageRequestForEndpoint(endpoint, fallbackJson), ctx.timeoutMs);
    }
}
function sanitizeOpenAiImageRequestForEndpoint(endpoint, requestJson) {
    if (!/\/images\/edits(?:$|[?#])/i.test(String(endpoint || '')))
        return requestJson;
    if (!isRecord(requestJson))
        return requestJson;
    return withoutKeys(requestJson, ['background', 'images', 'input_image', 'reference_images', 'referenceImages']);
}
function shouldRetryOpenAiImageWithUrlResult(err, requestJson) {
    const requestBody = isRecord(requestJson) ? requestJson : null;
    if (!requestBody || String(requestBody.response_format || '') !== 'b64_json')
        return false;
    const message = err instanceof Error ? err.message : String(err || '');
    return /response_format|b64_json|base64|unsupported|not supported|invalid.*format|unknown field|不支持/i.test(message);
}
function hasOpenAiEditsInputImage(ctx) {
    const values = [
        ctx.params.image,
        ctx.params.input_image,
        ctx.params.images,
        ctx.params.reference_images,
        ctx.params.referenceImages,
        ...ctx.inputFiles,
    ];
    return values.some(value => {
        const fallbackRefs = collectOpenAiEditsFallbackReferences({ ...ctx, inputFiles: [], params: { image: value } });
        return collectOpenAiPrimaryFileRefs(value).length > 0 || fallbackRefs.urls.length > 0 || fallbackRefs.fileIds.length > 0;
    });
}
function collectOpenAiPrimaryFileRefs(value) {
    const refs = new Set();
    const push = (item) => {
        if (!item)
            return;
        if (typeof item === 'string') {
            const raw = item.trim();
            if (/^file-[\w-]+$/i.test(raw))
                refs.add(raw);
            return;
        }
        if (Array.isArray(item)) {
            item.forEach(push);
            return;
        }
        if (!isRecord(item))
            return;
        [
            item.fileId,
            item.file_id,
            item.uploadRef,
            item.providerRef,
            item.id,
        ].forEach(push);
    };
    push(value);
    return Array.from(refs);
}
function collectOpenAiPrimaryFileReferenceEntries(value) {
    const entries = new Map();
    const upsert = (fileId, meta = {}) => {
        const id = String(fileId || '').trim();
        if (!/^file-[\w-]+$/i.test(id))
            return;
        entries.set(id, compactJson({
            ...(entries.get(id) || {}),
            ...meta,
            id,
            fileId: id,
            remoteUrl: id,
        }));
    };
    const push = (item) => {
        if (!item)
            return;
        if (typeof item === 'string') {
            upsert(item);
            return;
        }
        if (Array.isArray(item)) {
            item.forEach(push);
            return;
        }
        if (!isRecord(item))
            return;
        const fileId = [item.fileId, item.file_id, item.uploadRef, item.providerRef, item.id]
            .map(value => String(value || '').trim())
            .find(value => /^file-[\w-]+$/i.test(value));
        if (!fileId)
            return;
        upsert(fileId, {
            name: item.name,
            width: item.width,
            height: item.height,
            contentType: item.contentType || item.mime_type || item.mimeType,
            bytes: item.bytes || item.size,
        });
    };
    push(value);
    return Array.from(entries.values());
}
function buildOpenAiEditsUrlReferencePayload(urls) {
    const refs = Array.from(new Set(urls.map(url => String(url || '').trim()).filter(Boolean)));
    return {
        image: refs,
    };
}
async function buildOpenAiEditsReferencePayload(ctx) {
    const rawReferences = [
        ctx.params.images,
        ctx.params.reference_images,
        ctx.params.referenceImages,
        ctx.params.image,
        ctx.params.input_image,
        ctx.inputFiles,
    ].filter(value => value != null);
    const primaryFileRefMap = new Map();
    rawReferences.flatMap(value => collectOpenAiPrimaryFileReferenceEntries(value)).forEach(entry => {
        const fileId = String(entry.fileId || entry.id || '').trim();
        if (!/^file-[\w-]+$/i.test(fileId))
            return;
        primaryFileRefMap.set(fileId, { ...(primaryFileRefMap.get(fileId) || {}), ...entry, fileId, id: fileId, remoteUrl: fileId });
    });
    const primaryFileRefs = Array.from(primaryFileRefMap.values());
    const primaryFileIds = primaryFileRefs.map(entry => String(entry.fileId || entry.id || '').trim()).filter(Boolean);
    const fallbackUrls = await collectOpenAiEditsFallbackImageUrlsForRequest(ctx, 3500);
    if (primaryFileIds.length) {
        return {
            image: primaryFileIds,
        };
    }
    if (fallbackUrls.length) {
        return buildOpenAiEditsUrlReferencePayload(fallbackUrls);
    }
    const explicit = ctx.params.image || ctx.params.input_image || ctx.params.images || ctx.params.reference_images || ctx.params.referenceImages || ctx.inputFiles;
    return { image: explicit };
}
function resolveOpenAiTextImageEndpoint(ctx) {
    const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
    if (!configured)
        return '/images/edits';
    return configured;
}
function resolveOpenAiEditsEndpoint(ctx) {
    if (isGptImage2Request(ctx))
        return '/images/edits';
    return ctx.model.endpointPath || ctx.provider.endpointPath || '/images/edits';
}
async function submitGenericVideo(ctx) {
    if (isSoraV3NoteVideoProtocol(ctx))
        return submitSoraV3NoteVideo(ctx);
    const imageUrls = buildVideoReferenceUrls(ctx);
    const mediaRefs = buildVideoMediaReferences(ctx);
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'negative_prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode',
        'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
        'video', 'videoUrl', 'refVideo', 'video_url',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name,
        prompt: ctx.prompt,
        negative_prompt: ctx.negativePrompt,
        duration: resolveVideoDurationSeconds(ctx, ctx.params.resolution || ctx.params.quality || '720p', ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds, 5, [5, 10, 15]),
        seconds: resolveVideoDurationSeconds(ctx, ctx.params.resolution || ctx.params.quality || '720p', ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 5, [5, 10, 15]),
        aspect_ratio: ctx.params.aspectRatio || ctx.params.aspect_ratio || '16:9',
        resolution: ctx.params.resolution || ctx.params.quality || '720p',
        ...videoParams,
        ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
        ...(mediaRefs.videoUrl ? { video_url: mediaRefs.videoUrl } : {}),
        ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
    });
    const endpointPath = ctx.model.endpointPath || ctx.provider.endpointPath || '/video/generations';
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
        upstreamTaskId: taskId || String(upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorMessage: failed ? extractErrorMessage(upstream) : undefined,
    };
}
async function submitSoraV3NoteVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx).slice(0, maxSoraV3ReferenceImages(ctx));
    const videoUrls = buildVideoReferenceVideoUrls(ctx).slice(0, maxSoraV3ReferenceVideos(ctx));
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], '16:9');
    const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['480p', '720p'], '720p');
    const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 5, soraV3DefaultDurations(ctx));
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'negative_prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
        'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
        'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
        'referenceMode', 'reference_mode', 'audioMode', 'audio_mode',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name || ctx.provider.defaultModel || 'sora-v3-pro',
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        resolution,
        seconds: String(secondsNumber),
        ...videoParams,
        ...(imageUrls.length ? { reference_images: imageUrls } : {}),
        ...(imageUrls.length ? { reference_mode: normalizeSoraV3ReferenceMode(ctx.params.reference_mode || ctx.params.referenceMode || ctx.params.refMode || ctx.params.ref_mode) } : {}),
        ...(videoUrls.length ? { reference_videos: videoUrls } : {}),
        ...(videoUrls.length ? { audio_mode: normalizeAllowedString(ctx.params.audio_mode || ctx.params.audioMode, ['auto', 'keep_original'], 'auto') } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    return {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId || String(upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorMessage: failed ? extractErrorMessage(upstream) : undefined,
    };
}
async function submitSoraVideo(ctx) {
    if (isSoraV3NoteVideoProtocol(ctx))
        return submitSoraV3NoteVideo(ctx);
    const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
    const mediaRefs = buildVideoMediaReferences(ctx);
    const rawAspectRatio = String(ctx.params.aspectRatio || ctx.params.aspect_ratio || '16:9').trim();
    const aspectRatio = rawAspectRatio === '9:16' ? '9:16' : '16:9';
    const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
    const secondsNumber = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds, 5, [5, 10, 15]);
    const requestJson = compactJson({
        model: ctx.model.name || ctx.provider.defaultModel || 'sora-v3-pro',
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        resolution,
        seconds: String(secondsNumber),
        ...(imageUrls.length ? { reference_image_urls: imageUrls } : {}),
        ...(mediaRefs.videoUrl ? { video_url: mediaRefs.videoUrl } : {}),
        ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    return {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId || String(upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorMessage: failed ? extractErrorMessage(upstream) : undefined,
    };
}
async function submitSoraVideoPro(ctx) {
    const imageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProImageUrls(ctx), 9);
    const explicitImageUrls = await materializeSoraVideoProImageUrls(ctx, buildSoraVideoProUrlList(ctx, ['image_url', 'imageUrl', 'firstFrame', 'first_frame'], 'image', 1), 1);
    const explicitImageUrl = resolveSoraVideoProExplicitImageUrl(explicitImageUrls[0], imageUrls);
    const videoUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
        'extra_videos', 'extraVideos', 'reference_video_urls', 'referenceVideoUrls',
        'reference_videos', 'referenceVideos', 'reference_video', 'referenceVideo',
        'video', 'videoUrl', 'refVideo', 'video_url',
    ], 'video', 3), 'video', 3);
    const audioUrls = await materializeSoraVideoProMediaUrls(ctx, buildSoraVideoProUrlList(ctx, [
        'extra_audios', 'extraAudios', 'reference_audio_urls', 'referenceAudioUrls',
        'reference_audios', 'referenceAudios', 'reference_audio', 'referenceAudio',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ], 'audio', 3), 'audio', 3);
    const duration = resolveVideoDurationSeconds(ctx, '720p', ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds || ctx.params.seconds, 6, Array.from({ length: 12 }, (_, index) => index + 4));
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '1:1', '21:9', '3:4', '4:3'], '16:9');
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'negative_prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
        'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'firstFrame', 'first_frame', 'first_frame_image_url', 'last_frame_image_url',
        'extra_images', 'extraImages',
        'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video', 'referenceVideo', 'reference_videos', 'referenceVideos', 'reference_video_urls', 'referenceVideoUrls',
        'extra_videos', 'extraVideos',
        'audio', 'audioUrl', 'refAudio', 'audio_url', 'reference_audio', 'referenceAudio', 'reference_audios', 'referenceAudios', 'reference_audio_urls', 'referenceAudioUrls',
        'extra_audios', 'extraAudios',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name || ctx.provider.defaultModel || 'video-pro-720p',
        prompt: ctx.prompt,
        duration,
        aspect_ratio: aspectRatio,
        ...videoParams,
        ...(explicitImageUrl ? { image_url: explicitImageUrl } : {}),
        ...(imageUrls.length ? { extra_images: imageUrls } : {}),
        ...(videoUrls.length ? { extra_videos: videoUrls } : {}),
        ...(audioUrls.length ? { extra_audios: audioUrls } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    return {
        status: failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED')),
        progress: failed || urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId || String(upstream?.task_id || upstream?.taskId || upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'SORA_VIDEO_PRO_TASK_FAILED' : (!taskId && !urls.length ? 'SORA_VIDEO_PRO_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'sora-video-pro 上游响应未包含任务 ID 或视频 URL' : undefined),
    };
}
async function submitSeedance2VipVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx).slice(0, 9);
    const mediaRefs = buildVideoMediaReferences(ctx);
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'], '16:9');
    const resolution = normalizeSeedance2VipResolution(ctx.params.resolution || ctx.params.quality);
    const seconds = String(resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 5, [5, 10, 15]));
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'negative_prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
        'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
        'video', 'videoUrl', 'refVideo', 'video_url', 'reference_video',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]);
    const requestJson = compactJson({
        model: resolveSeedance2VipModelName(ctx, resolution),
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        resolution,
        seconds,
        ...videoParams,
        ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
        ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls.slice(1) } : {}),
        ...(mediaRefs.videoUrl ? { reference_video: mediaRefs.videoUrl } : {}),
        ...(mediaRefs.audioUrl ? { audio_url: mediaRefs.audioUrl } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    return {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
        progress: done && urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId || String(upstream?.id || ''),
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'SEEDANCE2_VIP_TASK_FAILED' : (!taskId && !urls.length ? 'SEEDANCE2_VIP_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'Seedance 2.0 VIP 上游响应未包含任务 ID 或视频 URL' : undefined),
    };
}
async function submitVeoChatVideo(ctx) {
    const imageUrls = buildVideoReferenceUrls(ctx);
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16'], '16:9');
    const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
    const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds, 6, [4, 6, 8]);
    const content = imageUrls.length
        ? [
            { type: 'text', text: ctx.prompt },
            ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
        ]
        : ctx.prompt;
    const videoParams = withoutKeys(ctx.params, [
        'model', 'messages', 'prompt', 'stream',
        'duration', 'durationSeconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
        'video', 'videoUrl', 'refVideo', 'video_url',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name || 'veo-3.1',
        messages: [{ role: 'user', content }],
        stream: false,
        aspect_ratio: aspectRatio,
        resolution,
        duration,
        ...videoParams,
    });
    const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/chat/completions', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const urls = absolutizeProviderUrls(ctx.provider, extractVeoChatVideoUrls(upstream));
    if (urls.length) {
        return {
            status: 'SUCCESS',
            progress: 100,
            upstreamRequestId: String(upstream?.responseId || upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: urls[0], outputs: urls },
            resultUrls: urls,
        };
    }
    return {
        status: 'FAILED',
        progress: 100,
        upstreamRequestId: String(upstream?.responseId || upstream?.id || upstream?.request_id || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { outputs: [] },
        resultUrls: [],
        errorCode: 'VEO_CHAT_RESULT_MISSING',
        errorMessage: 'Veo-3.1 上游响应未包含 choices[0].message.content 视频 URL',
    };
}
async function submitGeminiVideo(ctx) {
    const references = buildVideoReferenceUrls(ctx);
    const aspectRatio = normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio, ['16:9', '9:16'], '16:9');
    const resolution = normalizeAllowedString(ctx.params.resolution || ctx.params.quality, ['720p', '1080p'], '720p');
    const duration = resolveVideoDurationSeconds(ctx, resolution, ctx.params.duration || ctx.params.durationSeconds || ctx.params.seconds || ctx.params.duration_seconds, 8, [4, 6, 8]);
    const videoParams = withoutKeys(ctx.params, [
        'model', 'messages', 'prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url',
        'video', 'videoUrl', 'refVideo', 'video_url',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name || 'veo-3.1-generate-preview',
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
        duration,
        seconds: duration,
        resolution,
        ...videoParams,
        ...(references.length ? { image: references[0], image_url: references[0], images: references } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    return normalizeGeminiVideoResult(ctx, extractGeminiVideoTask(upstream), upstream, requestJson);
}
async function queryGeminiVideo(ctx) {
    const endpoint = resolveEndpointPath(ctx.model.statusEndpointPath || ctx.provider.statusEndpointPath || '/videos/{taskId}', { ...ctx, taskId: ctx.upstreamTaskId });
    const upstream = await callUpstreamGetJson(ctx.provider, endpoint, {}, ctx.timeoutMs);
    return normalizeGeminiVideoResult(ctx, ctx.upstreamTaskId, upstream);
}
async function submitGrokVideo(ctx) {
    const referenceCandidates = buildGrokVideoReferenceCandidates(ctx).slice(0, 7);
    const references = await resolveGrokVideoReferenceUrls(referenceCandidates);
    if (referenceCandidates.length && !references.length) {
        throw new Error('Grok 视频参考图必须是 HTTPS URL 或 base64 data URL；当前 HTTP 参考图未能转存为 COS，请重新上传参考图后重试');
    }
    const workflowMode = resolveGrokVideoWorkflowMode(ctx, references);
    const inputImageUrl = workflowMode === 'image-to-video' ? references[0] : '';
    const referenceImages = workflowMode === 'reference-to-video' ? references : [];
    const aspectRatio = normalizeGrokVideoAspectRatio(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio || ctx.params.size);
    const size = normalizeGrokVideoSize(ctx.params.size || aspectRatio);
    const resolution = normalizeGrokVideoResolution(ctx.params.resolution || ctx.params.quality);
    const seconds = resolveVideoDurationSeconds(ctx, resolution, ctx.params.seconds || ctx.params.duration || ctx.params.durationSeconds || ctx.params.duration_seconds, 6, grokVideoDefaultDurations(ctx));
    const videoParams = withoutKeys(ctx.params, [
        'model', 'prompt', 'stream',
        'duration', 'durationSeconds', 'duration_seconds', 'seconds',
        'aspectRatio', 'aspect_ratio', 'requestedRatio',
        'resolution', 'quality', 'size',
        'adapter', 'method', 'requestMethod', 'endpointPath', 'statusEndpointPath', 'uploadMode', 'protocol',
        'outputDir', 'taskType', 'sourceNodeType', 'refMode', 'ref_mode',
        'images', 'image', 'input_image', 'reference_images', 'referenceImages', 'reference_image_urls', 'referenceImageUrls',
        'image_url', 'imageUrl', 'first_frame_image_url', 'last_frame_image_url', 'image_reference',
        'video', 'videoUrl', 'refVideo', 'video_url',
        'audio', 'audioUrl', 'refAudio', 'audio_url',
    ]);
    const requestJson = compactJson({
        model: ctx.model.name || 'grok-imagine-video',
        prompt: ctx.prompt,
        aspect_ratio: aspectRatio,
        size,
        duration: seconds,
        seconds: String(seconds),
        resolution,
        ...videoParams,
        ...(inputImageUrl ? { image: grokVideoImageReferencePayload(inputImageUrl) } : {}),
        ...(referenceImages.length ? { reference_images: referenceImages.map(grokVideoImageReferencePayload) } : {}),
    });
    const endpoint = resolveEndpointPath(ctx.provider.endpointPath || ctx.model.endpointPath || '/videos', ctx);
    const upstream = await callUpstreamJson(ctx.provider, endpoint, requestJson, ctx.timeoutMs);
    const taskId = extractVideoTask(upstream) || String(upstream?.id || upstream?.request_id || upstream?.requestId || upstream?.task_id || '');
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    const status = failed ? 'FAILED' : (urls.length ? 'SUCCESS' : (taskId && !done ? 'RUNNING' : 'FAILED'));
    return {
        status,
        progress: failed || urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: taskId,
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        requestJson,
        responseJson: upstream,
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: urls.length || failed ? undefined : 'GROK_VIDEO_RESULT_MISSING',
        errorMessage: failed ? extractErrorMessage(upstream) : (status === 'FAILED' ? 'Grok 视频上游响应未包含任务 ID 或视频 URL' : undefined),
    };
}
async function submitCliProxy(ctx) {
    return ctx.type === 'IMAGE' ? submitOpenAiImage(ctx) : submitGenericVideo(ctx);
}
async function queryGenericVideo(ctx) {
    const endpoints = videoStatusEndpointCandidates(ctx);
    const taskParam = String(ctx.params.taskParam || 'taskId');
    let lastEndpointError;
    for (const endpointPath of endpoints) {
        const endpoint = resolveEndpointPath(endpointPath, { ...ctx, taskId: ctx.upstreamTaskId });
        const method = resolveVideoStatusMethod(ctx);
        try {
            const upstream = method === 'POST'
                ? await callUpstreamJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs)
                : await callUpstreamGetJson(ctx.provider, endpoint, videoStatusPayload(ctx.upstreamTaskId, taskParam), ctx.timeoutMs);
            return normalizeVideoQueryResult(ctx, upstream);
        }
        catch (err) {
            if (!isRetryableVideoStatusEndpointError(err))
                throw err;
            lastEndpointError = err;
        }
    }
    throw lastEndpointError;
}
async function normalizeVideoQueryResult(ctx, upstream) {
    const statusText = extractTaskStatusText(upstream);
    const failed = isFailedTaskStatus(statusText);
    const done = isDoneTaskStatus(statusText);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const missingDoneResult = done && !urls.length;
    return {
        status: failed || missingDoneResult ? 'FAILED' : (done && urls.length ? 'SUCCESS' : 'RUNNING'),
        progress: done && urls.length ? 100 : Number(upstream?.progress || upstream?.data?.progress || 0),
        upstreamTaskId: ctx.upstreamTaskId,
        responseJson: upstream,
        resultJson: { outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'VIDEO_TASK_FAILED' : (missingDoneResult ? 'VIDEO_RESULT_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (missingDoneResult ? '视频任务已完成，但上游没有返回可用的视频 URL。若响应里只有图片/封面 URL，系统不会把它当作视频结果。' : undefined),
    };
}
async function normalizeGeminiVideoResult(ctx, upstreamTaskId, upstream, requestJson) {
    const statusText = extractGeminiVideoStatus(upstream);
    const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(statusText);
    const resultUrl = extractVideoResultUrl(upstream);
    const urls = await resolveVideoResultUrls(ctx, resultUrl ? [resultUrl] : extractUrls(upstream));
    const done = ['success', 'succeeded', 'completed', 'done'].includes(statusText) || (!!urls.length && !['queued', 'processing', 'running'].includes(statusText));
    const taskId = upstreamTaskId || extractGeminiVideoTask(upstream);
    const base = {
        status: failed ? 'FAILED' : (done && urls.length ? 'SUCCESS' : (taskId ? 'RUNNING' : 'FAILED')),
        progress: done && urls.length ? 100 : extractGeminiVideoProgress(upstream),
        upstreamTaskId: taskId,
        upstreamRequestId: String(upstream?.request_id || upstream?.requestId || upstream?.id || taskId || ''),
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { url: urls[0] || '', outputs: urls },
        resultUrls: urls,
        errorCode: failed ? 'GEMINI_VIDEO_TASK_FAILED' : (!taskId && !urls.length ? 'GEMINI_VIDEO_TASK_MISSING' : undefined),
        errorMessage: failed ? extractErrorMessage(upstream) : (!taskId && !urls.length ? 'Gemini Veo 上游响应未包含任务 ID 或视频 URL' : undefined),
    };
    return requestJson ? { ...base, requestJson } : base;
}
function videoStatusPayload(taskId, taskParam) {
    return { [taskParam]: taskId, taskId, task_id: taskId, id: taskId };
}
function resolveVideoStatusMethod(ctx) {
    const explicit = String(ctx.params.statusMethod || '').trim().toUpperCase();
    if (explicit === 'GET' || explicit === 'POST')
        return explicit;
    const providerMethod = String(ctx.provider.requestMethod || '').trim().toUpperCase();
    if (providerMethod === 'GET' || providerMethod === 'POST')
        return providerMethod;
    return 'GET';
}
function videoStatusEndpointCandidates(ctx) {
    return uniqueStrings([
        ctx.params.statusEndpointPath,
        ctx.model.statusEndpointPath,
        ctx.provider.statusEndpointPath,
        '/videos/{taskId}',
        '/video/generations/{taskId}',
        '/video/status/{taskId}',
        '/video/status',
    ]);
}
function imageStatusEndpointCandidates(ctx) {
    return uniqueStrings([
        ctx.params.statusEndpointPath,
        ctx.model.statusEndpointPath,
        ctx.provider.statusEndpointPath,
        '/v1/tasks/{taskId}',
        '/tasks/{taskId}',
        '/v1/images/generations/{taskId}',
        '/images/generations/{taskId}',
        '/image/status/{taskId}',
        '/image/status',
    ]);
}
function isRetryableVideoStatusEndpointError(err) {
    if (!(err instanceof HttpError) || err.code !== 'UPSTREAM_ERROR')
        return false;
    if (![400, 404, 405, 502].includes(err.status))
        return false;
    return /Invalid URL|unsupported method|not found|cannot (?:get|post)|method not allowed|deprecated endpoint/i.test(err.message);
}
function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    values.forEach(value => {
        const raw = String(value || '').trim();
        if (!raw || seen.has(raw))
            return;
        seen.add(raw);
        result.push(raw);
    });
    return result;
}
function normalizeAllowedString(value, allowed, fallback) {
    const raw = String(value || '').trim();
    const matched = allowed.find(item => item.toLowerCase() === raw.toLowerCase());
    return matched || fallback;
}
function normalizeAllowedNumber(value, allowed, fallback) {
    const raw = Number.parseInt(String(value || '').replace(/s$/i, ''), 10);
    return allowed.includes(raw) ? raw : fallback;
}
function resolveVideoDurationSeconds(ctx, resolution, value, fallback, defaultAllowed = []) {
    const requested = Number.parseInt(String(value || '').replace(/s$/i, ''), 10);
    const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
    const resolutionKey = normalizeVideoResolutionKey(resolution);
    const maxByResolution = normalizeVideoNumberMap(caps.maxVideoDurationSecondsByResolution ?? caps.max_video_duration_seconds_by_resolution);
    const durationsByResolution = normalizeVideoDurationMap(caps.durationsByResolution ?? caps.durations_by_resolution);
    const maxSeconds = maxByResolution[resolutionKey] || normalizePositiveInt(caps.maxVideoDurationSeconds ?? caps.max_video_duration_seconds);
    const configuredAllowed = durationsByResolution[resolutionKey] || normalizeVideoDurationList(caps.durations);
    let allowed = (configuredAllowed.length ? configuredAllowed : defaultAllowed)
        .map(item => normalizePositiveInt(item))
        .filter((item) => Boolean(item));
    if (maxSeconds) {
        allowed = allowed.length ? allowed.filter(item => item <= maxSeconds) : defaultVideoDurationOptions(maxSeconds);
        if (!allowed.includes(maxSeconds))
            allowed.push(maxSeconds);
    }
    allowed = Array.from(new Set(allowed)).sort((a, b) => a - b);
    if (!Number.isFinite(requested) || requested <= 0)
        return allowed.includes(fallback) ? fallback : (allowed[0] || fallback);
    const capped = maxSeconds ? Math.min(requested, maxSeconds) : requested;
    if (!allowed.length)
        return capped;
    if (allowed.includes(capped))
        return capped;
    return allowed.filter(item => item <= capped).pop() || allowed[0] || fallback;
}
function grokVideoDefaultDurations(ctx) {
    const key = [
        ctx.model.name,
        ctx.model.displayName,
        ctx.model.modelKey,
        ctx.provider.defaultModel,
        ctx.params.model,
    ].map(item => String(item || '').toLowerCase()).join(' ');
    const maxSeconds = key.includes('grok-imagine-video-1.5-preview') || key.includes('grok-imagine-video-1.5-2026-05-30') ? 15 : 10;
    return Array.from({ length: maxSeconds }, (_, index) => index + 1);
}
function isSoraV3NoteVideoProtocol(ctx) {
    const adapter = String(ctx.model.adapter || ctx.provider.adapter || '').toLowerCase();
    if (adapter && adapter !== 'notevideo')
        return false;
    const key = [
        ctx.model.name,
        ctx.model.displayName,
        ctx.provider.defaultModel,
        ctx.provider.name,
        ctx.provider.providerKey,
    ].map(item => String(item || '').toLowerCase()).join(' ');
    if (/sora-(?:v3|3\.0)-vip|sora-vip/i.test(key))
        return false;
    const endpoint = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').toLowerCase();
    const baseUrl = String(ctx.provider.baseUrl || '').toLowerCase();
    const usesVideosEndpoint = /\/videos(?:\b|\/|$)/i.test(endpoint) || /\/videos(?:\b|\/|$)/i.test(baseUrl);
    if (key.includes('sora-v4-pro'))
        return true;
    return usesVideosEndpoint && (key.includes('sora-v3-pro') || key.includes('sora-v3-fast') || key.includes('sora-2'));
}
function soraV3DefaultDurations(ctx) {
    const key = [ctx.model.name, ctx.model.displayName, ctx.provider.defaultModel].map(item => String(item || '').toLowerCase()).join(' ');
    if (key.includes('sora-2') && !key.includes('v3'))
        return [4, 8, 12];
    return Array.from({ length: 11 }, (_, index) => index + 5);
}
function maxSoraV3ReferenceImages(ctx) {
    const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
    const rawMaxImages = caps.maxImages;
    if (isRecord(rawMaxImages)) {
        const full = normalizePositiveInt(rawMaxImages.full);
        if (full)
            return full;
    }
    const maxImages = normalizePositiveInt(caps.max_images ?? caps.maxImages);
    return maxImages || 4;
}
function maxSoraV3ReferenceVideos(ctx) {
    const caps = isRecord(ctx.model.capabilities) ? ctx.model.capabilities : {};
    return normalizePositiveInt(caps.maxVideos ?? caps.max_videos) || 3;
}
function normalizeSoraV3ReferenceMode(value) {
    const raw = String(value || '').trim();
    const mapped = raw === 'firstLast'
        ? 'start_end'
        : raw === 'smartMultiFrame'
            ? 'auto'
            : raw === 'full' || raw === 'text2video' || !raw
                ? 'image_reference'
                : raw;
    return normalizeAllowedString(mapped, ['auto', 'start_frame', 'start_end', 'image_reference'], 'image_reference');
}
function normalizeVideoResolutionKey(value) {
    return String(value || '').trim().toLowerCase();
}
function normalizeVideoNumberMap(value) {
    const source = isRecord(value) ? value : {};
    const out = {};
    Object.entries(source).forEach(([key, raw]) => {
        const normalizedKey = normalizeVideoResolutionKey(key);
        const seconds = normalizePositiveInt(raw);
        if (normalizedKey && seconds)
            out[normalizedKey] = seconds;
    });
    return out;
}
function normalizeVideoDurationMap(value) {
    const source = isRecord(value) ? value : {};
    const out = {};
    Object.entries(source).forEach(([key, raw]) => {
        const normalizedKey = normalizeVideoResolutionKey(key);
        const values = normalizeVideoDurationList(raw);
        if (normalizedKey && values.length)
            out[normalizedKey] = values;
    });
    return out;
}
function normalizeVideoDurationList(value) {
    const source = Array.isArray(value) ? value : [];
    return Array.from(new Set(source.map(item => normalizePositiveInt(item)).filter((item) => Boolean(item)))).sort((a, b) => a - b);
}
function normalizePositiveInt(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
}
function defaultVideoDurationOptions(maxSeconds) {
    return [4, 5, 6, 8, 10, 12, 15, 20, 30, 60, 90, 120].filter(value => value <= maxSeconds);
}
function resolveSeedance2VipModelName(ctx, resolution) {
    const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || 'seedance2.0-vip').trim();
    const base = raw.replace(/-(?:480p|720p|1080p)$/i, '') || 'seedance2.0-vip';
    return `${base}-${resolution}`;
}
function normalizeSeedance2VipResolution(value) {
    return normalizeAllowedString(value, ['720p', '1080p'], '720p');
}
function normalizeSeedance2VipSeconds(value) {
    return String(normalizeAllowedNumber(value, [5, 10, 15], 5));
}
function normalizeGrokImageCount(value) {
    const raw = Number.parseInt(String(value || 1), 10);
    if (!Number.isFinite(raw) || raw <= 0)
        return 1;
    return Math.max(1, Math.min(10, raw));
}
const GROK_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20', 'auto'];
const GROK_IMAGE_ASPECT_RATIO_SET = new Set(GROK_IMAGE_ASPECT_RATIOS);
function isApimartGrokImageProvider(ctx) {
    const hay = [
        ctx.provider.baseUrl,
        ctx.provider.name,
        ctx.provider.providerKey,
        ctx.model.name,
        ctx.model.displayName,
        ctx.model.modelKey,
    ].map(value => String(value || '')).join(' ').toLowerCase();
    return /apimart|grok-imagine-1\.0-apimart/.test(hay);
}
function normalizeGrokImageRequestSize(ctx, value) {
    if (!isApimartGrokImageProvider(ctx))
        return normalizeGrokImageSize(value);
    const ratio = ratioFromSize(String(value || '').trim().toLowerCase().replace('×', 'x'));
    return ['16:9', '9:16', '1:1', '3:2', '2:3'].includes(ratio) ? ratio : '1:1';
}
function resolveGrokImageRequestGeometry(ctx) {
    const explicitAspectRatio = normalizeGrokImageAspectRatio(firstDefined(ctx.params.aspect_ratio, ctx.params.aspectRatio, ctx.params.requestedRatio, ctx.params.ratio), '');
    const aspectRatio = explicitAspectRatio || normalizeGrokImageAspectRatio(firstDefined(ctx.params.requestedPixelSize, ctx.params.imageSize, ctx.params.size), '1:1');
    const sizeCandidate = explicitAspectRatio
        ? firstGrokImageSizeMatchingAspectRatio(aspectRatio, ctx.params.requestedPixelSize, ctx.params.imageSize) || aspectRatio
        : firstDefined(ctx.params.requestedPixelSize, ctx.params.imageSize, ctx.params.size, aspectRatio);
    return {
        size: normalizeGrokImageRequestSize(ctx, sizeCandidate),
        aspectRatio,
        resolution: normalizeGrokImageResolution(ctx.params.resolution || ctx.params.requestedResolution || ctx.params.quality),
    };
}
function firstGrokImageSizeMatchingAspectRatio(aspectRatio, ...values) {
    for (const value of values) {
        if (!value)
            continue;
        if (normalizeGrokImageAspectRatio(value, '') === aspectRatio)
            return value;
    }
    return '';
}
function resolveGrokImageEndpoint(ctx, kind) {
    const protocol = isRecord(ctx.model.protocol) ? ctx.model.protocol : {};
    const providerDefaults = isRecord(ctx.provider.defaultParams) ? ctx.provider.defaultParams : {};
    const specific = kind === 'edit'
        ? ctx.params.editEndpointPath || ctx.params.imageEditEndpointPath || protocol.editEndpointPath || protocol.edit_endpoint_path || providerDefaults.editEndpointPath || providerDefaults.imageEditEndpointPath
        : ctx.params.generationEndpointPath || ctx.params.imageGenerationEndpointPath || protocol.generationEndpointPath || protocol.generation_endpoint_path || providerDefaults.generationEndpointPath || providerDefaults.imageGenerationEndpointPath;
    const configured = String(specific || ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
    if (kind === 'edit') {
        if (!configured || /\/images\/generations(?:\?|$|\/)?/i.test(configured))
            return '/images/edits';
        return configured;
    }
    if (!configured || /\/images\/edits(?:\?|$|\/)?/i.test(configured))
        return '/images/generations';
    return configured;
}
function normalizeGrokImageSize(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    if (GROK_IMAGE_ASPECT_RATIO_SET.has(raw))
        return raw;
    const direct = ['1024x1024', '2048x2048', '1792x1024', '1024x1792', '1536x1024', '1024x1536', '1280x720', '720x1280'].find(size => size === raw);
    if (direct)
        return direct;
    const ratio = ratioFromSize(raw);
    switch (ratio) {
        case '16:9': return '1792x1024';
        case '9:16': return '1024x1792';
        case '4:3': return '4:3';
        case '3:4': return '3:4';
        case '3:2': return '1536x1024';
        case '2:3': return '1024x1536';
        case '2:1': return '2:1';
        case '1:2': return '1:2';
        case '19.5:9': return '19.5:9';
        case '9:19.5': return '9:19.5';
        case '20:9': return '20:9';
        case '9:20': return '9:20';
        case '1:1': return '1024x1024';
        default: return '1:1';
    }
}
function normalizeGrokImageAspectRatio(value, fallback = '1:1') {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    if (GROK_IMAGE_ASPECT_RATIO_SET.has(raw))
        return raw;
    const ratio = ratioFromSize(raw);
    return GROK_IMAGE_ASPECT_RATIO_SET.has(ratio) ? ratio : fallback;
}
function normalizeGrokImageResolution(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === '2k')
        return '2K';
    return '1K';
}
function normalizeGrokVideoSize(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    const direct = ['1280x720', '720x1280', '1792x1024', '1024x1792'].find(size => size === raw);
    if (direct)
        return direct;
    if (raw === '3:4')
        return '720x1280';
    if (raw === '4:3')
        return '1280x720';
    switch (ratioFromSize(raw)) {
        case '9:16':
            return '720x1280';
        case '2:3':
            return '1024x1792';
        case '3:2':
            return '1792x1024';
        default:
            return '1280x720';
    }
}
function normalizeGrokVideoResolution(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === '480p')
        return '480p';
    return '720p';
}
function normalizeGrokVideoAspectRatio(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    const direct = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].find(item => item === raw);
    if (direct)
        return direct;
    const ratio = ratioFromSize(raw);
    return ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].includes(ratio) ? ratio : '16:9';
}
function resolveGrokVideoWorkflowMode(ctx, references) {
    const raw = [
        ctx.mode,
        ctx.params.videoMode,
        ctx.params.grokVideoMode,
        ctx.params.xaiVideoMode,
        ctx.params.mode,
        ctx.params.referenceMode,
        ctx.params.reference_mode,
    ].map(value => String(value || '').trim().toLowerCase()).filter(Boolean).join(' ');
    if (/reference[-_ ]?to[-_ ]?video|reference/.test(raw))
        return 'reference-to-video';
    if (/image[-_ ]?to[-_ ]?video|img2video|i2v/.test(raw) && references.length)
        return 'image-to-video';
    if (references.length === 1)
        return 'image-to-video';
    if (references.length > 1)
        return 'reference-to-video';
    return 'text-to-video';
}
function grokVideoImageReferencePayload(url) {
    return { url };
}
function normalizeGeminiUnifiedImageSize(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    const direct = ['1024x1024', '1280x720', '720x1280', '1792x1024', '1024x1792'].find(size => size === raw);
    if (direct)
        return direct;
    return normalizeGrokImageSize(raw || '1024x1024');
}
function normalizeGeminiImageAspectRatio(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    if (!raw || raw === 'auto')
        return '1:1';
    const direct = ['1:1', '2:1', '21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '1:3', '3:1'].find(item => item === raw);
    if (direct)
        return direct;
    const sizeMatch = raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
    if (!sizeMatch)
        return '1:1';
    const width = Number(sizeMatch[1] || 0);
    const height = Number(sizeMatch[2] || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return '1:1';
    const ratio = width / height;
    const candidates = [
        ['3:1', 3],
        ['21:9', 21 / 9],
        ['2:1', 2],
        ['16:9', 16 / 9],
        ['3:2', 3 / 2],
        ['4:3', 4 / 3],
        ['1:1', 1],
        ['3:4', 3 / 4],
        ['2:3', 2 / 3],
        ['9:16', 9 / 16],
        ['1:3', 1 / 3],
    ];
    return candidates.reduce((best, item) => Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best, candidates[0])[0];
}
function normalizeGeminiImageSizeToken(value) {
    const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw)
        return '2K';
    if (raw === '1K' || raw === '1024' || raw === '1024X1024')
        return '1K';
    if (raw === '2K' || raw === '2048' || raw === '2048X2048')
        return '2K';
    if (raw === '3K')
        return '2K';
    if (raw === '4K')
        return '4K';
    const sizeMatch = raw.match(/^(\d+)\s*X\s*(\d+)$/);
    if (sizeMatch) {
        const longSide = Math.max(Number(sizeMatch[1] || 0), Number(sizeMatch[2] || 0));
        if (longSide >= 3500)
            return '4K';
        if (longSide >= 2500)
            return '2K';
        return longSide > 1400 ? '2K' : '1K';
    }
    return '2K';
}
function extractGeminiVideoTask(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return String(extractVideoTask(payload) ||
        payload?.operation?.name ||
        payload?.operation?.id ||
        payload?.operation_id ||
        payload?.name ||
        first?.operation?.name ||
        first?.operation?.id ||
        first?.operation_id ||
        first?.name ||
        '').trim();
}
function extractGeminiVideoStatus(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return String(payload?.status ||
        first?.status ||
        payload?.task?.status ||
        payload?.operation?.status ||
        payload?.operation?.metadata?.state ||
        '').trim().toLowerCase();
}
function extractGeminiVideoProgress(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    const raw = Number(payload?.progress ??
        first?.progress ??
        payload?.task?.progress ??
        payload?.operation?.metadata?.progressPercent ??
        0);
    if (!Number.isFinite(raw))
        return 0;
    return Math.max(0, Math.min(99, Math.round(raw)));
}
function ratioFromSize(value) {
    const raw = String(value || '').trim().toLowerCase().replace('×', 'x');
    const ratioMatch = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (ratioMatch)
        return normalizeRatio(Number(ratioMatch[1]), Number(ratioMatch[2]));
    const sizeMatch = raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/);
    if (sizeMatch)
        return normalizeRatio(Number(sizeMatch[1]), Number(sizeMatch[2]));
    return '';
}
function normalizeRatio(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return '';
    const ratio = width / height;
    const candidates = [
        ['20:9', 20 / 9],
        ['19.5:9', 19.5 / 9],
        ['2:1', 2],
        ['16:9', 16 / 9],
        ['9:16', 9 / 16],
        ['4:3', 4 / 3],
        ['3:4', 3 / 4],
        ['3:2', 3 / 2],
        ['2:3', 2 / 3],
        ['1:2', 1 / 2],
        ['9:19.5', 9 / 19.5],
        ['9:20', 9 / 20],
        ['1:1', 1],
    ];
    return candidates.reduce((best, item) => Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best, candidates[0])[0];
}
function extractGrokAsyncTaskId(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return String(payload?.task_id ||
        payload?.taskId ||
        payload?.id ||
        first?.task_id ||
        first?.taskId ||
        first?.id ||
        '').trim();
}
function extractGrokTaskStatus(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return String(payload?.status ||
        first?.status ||
        payload?.task?.status ||
        '').trim().toLowerCase();
}
function extractGrokTaskProgress(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    const raw = Number(payload?.progress ??
        first?.progress ??
        payload?.task?.progress ??
        0);
    if (!Number.isFinite(raw))
        return 0;
    return Math.max(0, Math.min(99, Math.round(raw)));
}
function extractGenericTaskStatus(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    return String(payload?.status ||
        payload?.state ||
        payload?.task?.status ||
        payload?.task?.state ||
        payload?.result?.status ||
        payload?.result?.state ||
        first?.status ||
        first?.state ||
        '').trim().toLowerCase();
}
function extractGenericImageProgress(payload) {
    const data = payload?.data;
    const first = Array.isArray(data) ? data[0] : data;
    const raw = Number(payload?.progress ??
        payload?.task?.progress ??
        payload?.result?.progress ??
        first?.progress ??
        0);
    if (!Number.isFinite(raw))
        return 0;
    return Math.max(0, Math.min(99, Math.round(raw)));
}
function publicImageReferenceCandidateValues(value) {
    if (!value)
        return [];
    if (typeof value === 'string')
        return [[value]];
    if (Array.isArray(value))
        return value.flatMap(item => publicImageReferenceCandidateValues(item));
    if (!isRecord(value))
        return [];
    const saved = isRecord(value.saved) ? value.saved : {};
    const imageUrl = value.image_url;
    const camelImageUrl = value.imageUrl;
    return [[
            value.fallbackRemoteUrl,
            value.remoteFallbackUrl,
            value.objectStorageUrl,
            value.publicUrl,
            value.contentUrl,
            value.downloadUrl,
            value.cosUrl,
            value.cos_url,
            saved.fallbackRemoteUrl,
            saved.remoteFallbackUrl,
            saved.objectStorageUrl,
            saved.publicUrl,
            saved.contentUrl,
            saved.downloadUrl,
            value.remoteUrl,
            value.url,
            value.localUrl,
            value.localPath,
            value.path,
            value.dataUrl,
            isRecord(camelImageUrl) ? camelImageUrl.url : camelImageUrl,
            isRecord(imageUrl) ? imageUrl.url : imageUrl,
            saved.remoteUrl,
            saved.url,
            saved.localUrl,
            saved.localPath,
            saved.path,
            value.uploadRef,
            value.providerRef,
            value.fileId,
            value.file_id,
            value.id,
            saved.fileId,
            saved.file_id,
            saved.id,
        ]];
}
async function resolvePublicImageReferenceCandidate(value, timeoutMs, options = {}) {
    if (!value)
        return '';
    if (isRecord(value)) {
        return resolvePublicImageReferenceCandidate(value.url || value.image_url || value.imageUrl || value.remoteUrl || value.localUrl, timeoutMs, options);
    }
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/^data:image\//i.test(raw))
        return raw;
    if (isGenerationResultPath(raw))
        return materializeGenerationResultReferenceUrl(raw);
    if (options.allowLocalFiles) {
        const localPath = resolveSafeLocalImageReferencePath(raw);
        if (localPath)
            return localImageFileRef(localPath);
    }
    if (/^file-[\w-]+$/i.test(raw)) {
        const fallbackUrl = await getUploadedFileFallbackUrlAsync(raw, timeoutMs);
        return fallbackUrl ? materializeGenerationResultReferenceUrl(fallbackUrl) : '';
    }
    const publicUrl = resolvePublicReferenceImageUrl(raw);
    return publicUrl ? materializeGenerationResultReferenceUrl(publicUrl) : '';
}
async function resolvePublicImageReferenceCandidateGroup(values, timeoutMs, options = {}) {
    const refs = [];
    for (const value of values) {
        const ref = await resolvePublicImageReferenceCandidate(value, timeoutMs, options);
        if (ref)
            refs.push(ref);
    }
    return Array.from(new Set(refs));
}
async function collectPublicImageReferenceUrlGroups(ctx, timeoutMs = 15000, options = {}) {
    const rawGroups = [];
    const push = (value) => {
        rawGroups.push(...publicImageReferenceCandidateValues(value));
    };
    ctx.inputFiles.forEach(push);
    const rawImages = ctx.params.reference_images || ctx.params.referenceImages || ctx.params.images || ctx.params.image || ctx.params.input_image;
    if (Array.isArray(rawImages))
        rawImages.forEach(push);
    else
        push(rawImages);
    const groups = [];
    const seen = new Set();
    for (const rawGroup of rawGroups) {
        const group = await resolvePublicImageReferenceCandidateGroup(rawGroup, timeoutMs, options);
        if (!group.length)
            continue;
        const key = group.join('\n');
        if (seen.has(key))
            continue;
        seen.add(key);
        groups.push(group);
    }
    return groups;
}
async function collectPublicImageReferenceUrls(ctx, timeoutMs = 15000) {
    const groups = await collectPublicImageReferenceUrlGroups(ctx, timeoutMs);
    return Array.from(new Set(groups.flat().filter(Boolean)));
}
async function collectGrokImageRefs(ctx) {
    return collectPublicImageReferenceUrls(ctx);
}
function localImageFileRef(filePath) {
    return `${LOCAL_IMAGE_FILE_REF_PREFIX}${filePath}`;
}
function isLocalImageFileRef(value) {
    return String(value || '').startsWith(LOCAL_IMAGE_FILE_REF_PREFIX);
}
function localImageFileRefPath(value) {
    return isLocalImageFileRef(value) ? String(value || '').slice(LOCAL_IMAGE_FILE_REF_PREFIX.length) : '';
}
function resolveSafeLocalImageReferencePath(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    const candidates = [];
    try {
        const parsed = raw.startsWith('http://') || raw.startsWith('https://')
            ? new URL(raw)
            : new URL(raw, 'http://local');
        if (parsed.pathname === '/api/workbench/image-studio/file') {
            const filePath = parsed.searchParams.get('path') || '';
            if (filePath)
                candidates.push(filePath);
        }
    }
    catch {
        // fall through to direct path handling
    }
    candidates.push(raw);
    if (!path.isAbsolute(raw)) {
        candidates.push(path.resolve(process.cwd(), raw), path.resolve(process.cwd(), '..', raw), path.resolve(process.cwd(), '..', '..', raw), path.resolve(process.cwd(), '..', '..', '..', raw));
    }
    const allowedRoots = [GENERATED_IMAGE_DIR, ...CANVAS_LOCAL_ASSET_DIRS].map(root => path.resolve(root));
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        const normalized = resolved.split(path.sep).join('/');
        const allowed = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep))
            || normalized.includes('/runninghub_outputs/image-studio-v3/');
        if (allowed && /\.(?:png|jpe?g|webp|gif)$/i.test(resolved))
            return resolved;
    }
    return '';
}
async function localImageFileRefToBlob(ref) {
    const filePath = localImageFileRefPath(ref);
    const safePath = resolveSafeLocalImageReferencePath(filePath);
    if (!safePath)
        fail(400, '参考图本地文件不在允许目录内，已拒绝读取', 'IMAGE_REFERENCE_LOCAL_FILE_INVALID');
    try {
        const bytes = await fs.readFile(safePath);
        const mime = normalizeImageMime(inferImageMimeType(safePath));
        return { blob: new Blob([bytes], { type: mime }), filename: path.basename(safePath) || `reference.${imageExtFromMime(mime)}` };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(400, `参考图本地文件读取失败：${message}`, 'IMAGE_REFERENCE_LOCAL_FILE_READ_FAILED');
    }
}
const imageReferenceBaseFetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; CanvasGenerationBot/1.0)',
    Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*',
};
function imageReferenceFetchHeaders() {
    const headers = { ...imageReferenceBaseFetchHeaders };
    const origin = imageReferenceRequestOrigin();
    if (origin) {
        headers.Origin = origin;
        headers.Referer = `${origin}/`;
    }
    return headers;
}
function imageReferenceRequestOrigin() {
    const candidates = [
        config.publicBaseUrl,
        config.objectStorage.publicBaseUrl,
        ...config.corsOrigins.filter(item => item && item !== '*'),
    ];
    for (const candidate of candidates) {
        try {
            return new URL(String(candidate || '').trim()).origin;
        }
        catch {
            // keep scanning configured origins
        }
    }
    return '';
}
async function imageRefCandidatesToBlob(refs, timeoutMs, toBlob) {
    const candidates = Array.from(new Set((refs || []).map(ref => String(ref || '').trim()).filter(Boolean)));
    let lastError = null;
    for (const ref of candidates) {
        try {
            return await toBlob(ref, timeoutMs);
        }
        catch (err) {
            lastError = err;
        }
    }
    if (lastError instanceof HttpError)
        throw lastError;
    if (lastError) {
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        fail(400, `参考图下载失败：${message}`, 'IMAGE_REFERENCE_FETCH_FAILED');
    }
    fail(400, '参考图必须是公网 URL 或 data URI', 'IMAGE_REFERENCE_INVALID');
}
async function grokImageRefToBlob(ref, timeoutMs) {
    const raw = String(ref || '').trim();
    if (/^data:image\//i.test(raw))
        return dataUriToBlob(raw);
    if (isLocalImageFileRef(raw))
        return localImageFileRefToBlob(raw);
    if (!/^https?:\/\//i.test(raw))
        fail(400, 'Grok 图生图参考图必须是公网 URL 或 data URI', 'GROK_IMAGE_REFERENCE_INVALID');
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const resp = await fetch(raw, { signal: controller.signal, headers: imageReferenceFetchHeaders() });
        if (!resp.ok)
            fail(400, `Grok 图生图参考图下载失败 HTTP ${resp.status}`, 'GROK_IMAGE_REFERENCE_FETCH_FAILED');
        const mime = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(raw));
        const bytes = await resp.arrayBuffer();
        return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
    }
    catch (err) {
        if (err instanceof HttpError)
            throw err;
        const message = err instanceof Error ? err.message : String(err);
        fail(400, `Grok 图生图参考图下载失败：${message}`, 'GROK_IMAGE_REFERENCE_FETCH_FAILED');
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function compatibleImageRefToBlob(ref, timeoutMs, label) {
    const raw = String(ref || '').trim();
    if (/^data:image\//i.test(raw))
        return dataUriToBlob(raw);
    if (isLocalImageFileRef(raw))
        return localImageFileRefToBlob(raw);
    if (!/^https?:\/\//i.test(raw))
        fail(400, `${label}参考图必须是公网 URL 或 data URI`, 'IMAGE_REFERENCE_INVALID');
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const resp = await fetch(raw, { signal: controller.signal, headers: imageReferenceFetchHeaders() });
        if (!resp.ok)
            fail(400, `${label}参考图下载失败 HTTP ${resp.status}`, 'IMAGE_REFERENCE_FETCH_FAILED');
        const mime = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(raw));
        const bytes = await resp.arrayBuffer();
        return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
    }
    catch (err) {
        if (err instanceof HttpError)
            throw err;
        const message = err instanceof Error ? err.message : String(err);
        fail(400, `${label}参考图下载失败：${message}`, 'IMAGE_REFERENCE_FETCH_FAILED');
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function dataUriToBlob(value) {
    const match = value.match(/^data:(image\/[^;]+);base64,(.+)$/i);
    if (!match)
        fail(400, 'Grok 图生图 data URI 格式无效', 'GROK_IMAGE_REFERENCE_INVALID');
    const mime = normalizeImageMime(match[1]);
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    return { blob: new Blob([bytes], { type: mime }), filename: `reference.${imageExtFromMime(mime)}` };
}
function normalizeImageMime(value) {
    const raw = String(value || '').split(';')[0].trim().toLowerCase();
    if (raw === 'image/jpg')
        return 'image/jpeg';
    if (['image/png', 'image/jpeg', 'image/webp'].includes(raw))
        return raw;
    return 'image/png';
}
function imageExtFromMime(mime) {
    if (mime.includes('webp'))
        return 'webp';
    if (mime.includes('jpeg') || mime.includes('jpg'))
        return 'jpg';
    return 'png';
}
function normalizeMediaMime(value, mediaType = 'video') {
    const raw = String(value || '').split(';')[0].trim().toLowerCase();
    if (mediaType === 'audio') {
        if (raw === 'audio/mp3')
            return 'audio/mpeg';
        if (['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg'].includes(raw))
            return raw;
        return 'audio/mpeg';
    }
    if (['video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg'].includes(raw))
        return raw;
    return 'video/mp4';
}
function mediaExtFromMime(mime, mediaType = 'video') {
    const raw = String(mime || '').toLowerCase();
    if (mediaType === 'audio') {
        if (raw.includes('wav'))
            return 'wav';
        if (raw.includes('aac'))
            return 'aac';
        if (raw.includes('mp4'))
            return 'm4a';
        if (raw.includes('webm'))
            return 'webm';
        if (raw.includes('ogg'))
            return 'ogg';
        return 'mp3';
    }
    if (raw.includes('webm'))
        return 'webm';
    if (raw.includes('quicktime'))
        return 'mov';
    if (raw.includes('mpeg'))
        return 'mpeg';
    return 'mp4';
}
function redactLargeInlineRef(ref, index) {
    const raw = String(ref || '');
    if (/^data:image\//i.test(raw))
        return `[inline image ${index + 1} omitted: ${raw.length} chars]`;
    return raw;
}
async function normalizeImageSubmit(provider, upstream, requestJson, responseType = 'object_storage') {
    const result = extractImageResult(upstream);
    const resultUrl = await imageResultUrl(provider, result, responseType);
    const extractedUrls = extractImageOutputUrls(upstream);
    const urls = resultUrl ? [resultUrl] : await resolveImageResultUrls(provider, extractedUrls, responseType);
    const primaryUrl = resultUrl || urls[0] || '';
    const taskId = extractUpstreamTaskId(upstream);
    if (!primaryUrl && taskId) {
        return {
            status: 'RUNNING',
            progress: extractGenericImageProgress(upstream),
            upstreamTaskId: taskId,
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', outputs: [] },
            resultUrls: [],
        };
    }
    if (!primaryUrl && (result.url || result.b64 || extractUrls(upstream).length)) {
        return {
            status: 'FAILED',
            progress: 100,
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', mimeType: result.mimeType, outputs: [] },
            resultUrls: [],
            errorCode: 'IMAGE_RESULT_MATERIALIZE_FAILED',
            errorMessage: '生图上游已返回图片，但结果没有成功转存到对象存储；已阻止下发临时中转链接，请检查 COS 配置后重试。',
        };
    }
    if (!primaryUrl) {
        return {
            status: 'FAILED',
            progress: 100,
            upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
            requestJson,
            responseJson: sanitizeUpstreamPayload(upstream),
            resultJson: { url: '', mimeType: result.mimeType, outputs: [] },
            resultUrls: [],
            errorCode: imageOutputMissingErrorCode(upstream),
            errorMessage: imageOutputMissingErrorMessage(upstream),
        };
    }
    return {
        status: 'SUCCESS',
        progress: 100,
        upstreamRequestId: String(upstream?.id || upstream?.request_id || ''),
        requestJson,
        responseJson: sanitizeUpstreamPayload(upstream),
        resultJson: { url: primaryUrl, mimeType: result.mimeType, outputs: urls },
        resultUrls: urls,
    };
}
function extractImageOutputUrls(payload) {
    return Array.from(new Set([
        ...extractGptImageV2Urls(payload),
        ...extractUrls(payload),
    ]));
}
function imageOutputMissingErrorCode(payload) {
    const message = extractErrorMessage(payload);
    if (/policy|safety|safe|moderation|blocked|refusal|refused|content/i.test(message))
        return 'UPSTREAM_IMAGE_REJECTED';
    if (/rate.?limit|too many requests|quota|capacity|429/i.test(message))
        return 'UPSTREAM_RATE_LIMITED';
    if (/timeout|timed out|deadline|connection|disconnect|socket|network/i.test(message))
        return 'UPSTREAM_TIMEOUT';
    return 'IMAGE_RESULT_MISSING';
}
function imageOutputMissingErrorMessage(payload) {
    const message = extractErrorMessage(payload);
    if (message && message !== '上游任务失败')
        return message;
    const status = extractGenericTaskStatus(payload);
    const statusSuffix = status ? `，上游状态：${status}` : '';
    return `上游响应未包含图片 URL、b64_json 或可轮询任务 ID${statusSuffix}；请检查该模型渠道的 adapter/endpointPath 与上游 responseJson.output/error。`;
}
async function imageResultUrl(provider, result, responseType = 'object_storage') {
    const directUrl = absolutizeProviderUrl(provider, result.url);
    if (responseType === 'server_base64_async_object_storage') {
        if (result.b64)
            return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
        if (/^data:image\//i.test(directUrl))
            return directUrl;
        return directUrl || '';
    }
    if (responseType === 'server_base64_object_storage') {
        if (result.b64)
            return persistInlineImage(result.b64, result.mimeType || 'image/png');
        if (/^data:image\//i.test(directUrl))
            return persistInlineImage(directUrl, result.mimeType || 'image/png');
        if (directUrl)
            return materializeImageResultUrl(provider, directUrl);
        return '';
    }
    if (responseType === 'base64') {
        if (result.b64)
            return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
        if (/^data:image\//i.test(directUrl))
            return directUrl;
        return directUrl || '';
    }
    if (responseType === 'provider_url' || responseType === 'server_object_storage') {
        if (directUrl)
            return directUrl;
        if (result.b64)
            return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
        return '';
    }
    if (/^data:image\//i.test(directUrl))
        return persistInlineImage(directUrl, result.mimeType || 'image/png');
    if (directUrl)
        return materializeImageResultUrl(provider, directUrl);
    if (result.b64)
        return persistInlineImage(result.b64, result.mimeType || 'image/png');
    return '';
}
async function resolveImageResultUrls(provider, urls, responseType) {
    if (responseType === 'server_base64_object_storage')
        return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, urls));
    if (responseType === 'server_base64_async_object_storage')
        return absolutizeProviderUrls(provider, urls);
    const clean = urls.filter(url => !/^data:image\//i.test(url));
    if (responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'base64')
        return absolutizeProviderUrls(provider, clean);
    return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
}
async function resolveVideoResultUrls(ctx, urls) {
    const clean = urls.filter(isVideoResultUrlCandidate);
    const responseType = resolveImageResponseType(ctx);
    const absolute = absolutizeProviderUrls(ctx.provider, clean);
    if (responseType === 'provider_url' || responseType === 'base64')
        return absolute;
    return materializeMediaResultUrls(ctx.provider, absolute, 'video');
}
function isVideoResultUrlCandidate(url) {
    const raw = String(url || '').trim();
    if (!raw)
        return false;
    if (/^data:video\//i.test(raw))
        return true;
    if (/^data:/i.test(raw))
        return false;
    if (/\/v1\/images\/results\//i.test(raw))
        return false;
    if (/\.(?:png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(raw))
        return false;
    return true;
}
function inlineImageDataUrl(value, mimeType = 'image/png') {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/^data:image\//i.test(raw))
        return raw;
    return `data:${mimeType || 'image/png'};base64,${raw.replace(/\s+/g, '')}`;
}
async function materializeImageResultUrls(provider, urls) {
    const resolved = [];
    for (const url of urls) {
        const next = await materializeImageResultUrl(provider, url);
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
async function materializeMediaResultUrls(provider, urls, mediaType = 'video') {
    const resolved = [];
    for (const url of urls) {
        const next = await materializeMediaResultUrl(provider, url, mediaType);
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
export async function materializeImageResultUrl(provider, value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/^data:image\//i.test(raw))
        return persistInlineImage(raw);
    if (isGenerationResultPath(raw))
        return materializeGenerationResultReferenceUrl(raw);
    if (!/^https?:\/\//i.test(raw))
        return raw;
    if (isLikelyObjectStoragePublicUrl(raw))
        return raw;
    const cached = remoteImageObjectStorageCache.get(raw);
    if (cached)
        return cached;
    const uploaded = await uploadRemoteImageUrlToObjectStorageBestEffort(provider, raw);
    if (uploaded) {
        remoteImageObjectStorageCache.set(raw, uploaded);
        return uploaded;
    }
    if (isProviderEphemeralImageResultUrl(provider, raw)) {
        console.warn('[generation] result object storage materialize failed, using provider temporary image url fallback:', raw);
    }
    return raw;
}
async function persistInlineImage(value, mimeType = 'image/png') {
    const parsed = parseInlineImageValue(value, mimeType);
    if (!parsed)
        return '';
    const objectStorageUrl = await uploadImageBufferToObjectStorageBestEffort(parsed.bytes, `generated.${parsed.ext}`, parsed.mime);
    if (objectStorageUrl)
        return objectStorageUrl;
    const fallbackUrl = await persistInlineImageLocalFallback(parsed.bytes, parsed.ext);
    if (fallbackUrl)
        return fallbackUrl;
    return '';
}
async function persistInlineImageLocalPreview(value, mimeType = 'image/png') {
    const parsed = parseInlineImageValue(value, mimeType);
    if (!parsed)
        return '';
    return persistInlineImageLocalFallback(parsed.bytes, parsed.ext);
}
function parseInlineImageValue(value, mimeType = 'image/png') {
    const raw = String(value || '').trim();
    if (!raw)
        return null;
    const match = raw.match(/^data:(image\/[^;]+);base64,(.+)$/i);
    const mime = match?.[1] || mimeType || 'image/png';
    const b64 = (match?.[2] || raw).replace(/\s+/g, '');
    const ext = mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('gif') ? 'gif' : 'png';
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length)
        return null;
    return { bytes, ext, mime };
}
async function persistInlineImageLocalFallback(buffer, ext) {
    try {
        await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
        const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        await fs.writeFile(path.join(GENERATED_IMAGE_DIR, filename), buffer);
        return `/api/generation/results/${encodeURIComponent(filename)}`;
    }
    catch (err) {
        console.warn('[generation] result local fallback write failed:', err instanceof Error ? err.message : String(err));
        return '';
    }
}
async function uploadImageBufferToObjectStorageBestEffort(buffer, filename, contentType) {
    if (!isObjectStorageConfigured())
        return '';
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const uploaded = await uploadObjectStorageBuffer({
                userId: 'generation-results',
                buffer,
                filename,
                contentType,
                maxBytes: Math.max(config.generationResultObjectStorageMaxBytes, GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR),
            });
            return uploaded.url || '';
        }
        catch (err) {
            lastErr = err;
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            }
        }
    }
    console.warn('[generation] result object storage upload failed:', lastErr instanceof Error ? lastErr.message : String(lastErr));
    return '';
}
async function uploadRemoteImageUrlToObjectStorageBestEffort(provider, rawUrl) {
    if (!isObjectStorageConfigured())
        return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_RESULT_MATERIALIZE_TIMEOUT_MS);
    try {
        const resp = await fetch(rawUrl, { signal: controller.signal });
        if (!resp.ok)
            return '';
        const contentType = normalizeImageMime(resp.headers.get('content-type') || inferImageMimeType(rawUrl));
        if (!/^image\//i.test(contentType))
            return '';
        const contentLength = Number(resp.headers.get('content-length') || 0);
        if (Number.isFinite(contentLength) && contentLength > config.generationResultObjectStorageMaxBytes)
            return '';
        const bytes = Buffer.from(await resp.arrayBuffer());
        if (!bytes.length || bytes.length > config.generationResultObjectStorageMaxBytes)
            return '';
        const filename = remoteImageFilename(provider, rawUrl, contentType);
        const objectStorageUrl = await uploadImageBufferToObjectStorageBestEffort(bytes, filename, contentType);
        if (objectStorageUrl)
            return objectStorageUrl;
        return '';
    }
    catch {
        return '';
    }
    finally {
        clearTimeout(timer);
    }
}
async function materializeMediaResultUrl(provider, value, mediaType = 'video') {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (!/^https?:\/\//i.test(raw))
        return raw;
    if (isLikelyObjectStoragePublicUrl(raw))
        return raw;
    const cacheKey = `${mediaType}:${raw}`;
    const cached = remoteMediaObjectStorageCache.get(cacheKey);
    if (cached)
        return cached;
    const uploaded = await uploadRemoteMediaUrlToObjectStorageBestEffort(provider, raw, mediaType);
    if (uploaded) {
        remoteMediaObjectStorageCache.set(cacheKey, uploaded);
        return uploaded;
    }
    return raw;
}
async function uploadRemoteMediaUrlToObjectStorageBestEffort(provider, rawUrl, mediaType = 'video') {
    if (!isObjectStorageConfigured())
        return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MEDIA_RESULT_MATERIALIZE_TIMEOUT_MS);
    try {
        const resp = await fetch(rawUrl, { signal: controller.signal });
        if (!resp.ok)
            return '';
        const rawContentType = String(resp.headers.get('content-type') || inferMediaMimeType(rawUrl, mediaType)).split(';')[0].trim().toLowerCase();
        if (mediaType === 'video' && !/^video\//i.test(rawContentType))
            return '';
        if (mediaType === 'audio' && !/^audio\//i.test(rawContentType))
            return '';
        const contentType = normalizeMediaMime(rawContentType, mediaType);
        const contentLength = Number(resp.headers.get('content-length') || 0);
        const maxBytes = Math.max(config.generationResultObjectStorageMaxBytes, MEDIA_RESULT_OBJECT_STORAGE_MAX_BYTES_FLOOR);
        if (Number.isFinite(contentLength) && contentLength > maxBytes)
            return '';
        const bytes = Buffer.from(await resp.arrayBuffer());
        if (!bytes.length || bytes.length > maxBytes)
            return '';
        const filename = remoteMediaFilename(provider, rawUrl, contentType, mediaType);
        const uploaded = await uploadObjectStorageBuffer({
            userId: 'generation-results',
            buffer: bytes,
            filename,
            contentType,
            maxBytes,
        });
        return uploaded.url || '';
    }
    catch (err) {
        console.warn('[generation] result media object storage upload failed:', err instanceof Error ? err.message : String(err));
        return '';
    }
    finally {
        clearTimeout(timer);
    }
}
function remoteImageFilename(provider, rawUrl, contentType) {
    try {
        const parsed = new URL(rawUrl);
        const base = path.basename(parsed.pathname).replace(/[^\w.-]+/g, '-') || `image.${imageExtFromMime(contentType)}`;
        if (/\.(png|jpe?g|webp|gif)$/i.test(base))
            return base;
    }
    catch {
        // fall through
    }
    const providerKey = String(provider.providerKey || provider.id || 'provider').replace(/[^\w.-]+/g, '-');
    return `${providerKey}-${Date.now().toString(36)}.${imageExtFromMime(contentType)}`;
}
function remoteMediaFilename(provider, rawUrl, contentType, mediaType = 'video') {
    const ext = mediaExtFromMime(contentType, mediaType);
    try {
        const parsed = new URL(rawUrl);
        const base = path.basename(parsed.pathname).replace(/[^\w.-]+/g, '') || `${mediaType}.${ext}`;
        if (mediaType === 'audio' && /\.(mp3|m4a|aac|wav|webm|ogg)$/i.test(base))
            return base;
        if (mediaType === 'video' && /\.(mp4|webm|mov|mpe?g)$/i.test(base))
            return base;
    }
    catch {
        // fall through
    }
    const providerKey = String(provider.providerKey || provider.id || 'provider').replace(/[^\w.-]+/g, '-');
    return `${providerKey}-${mediaType}-${Date.now().toString(36)}.${ext}`;
}
function isObjectStorageConfigured() {
    return Boolean(config.objectStorage.endpointUrl &&
        config.objectStorage.accessKeyId &&
        config.objectStorage.secretAccessKey &&
        config.objectStorage.bucket);
}
function isLikelyObjectStoragePublicUrl(value) {
    const raw = String(value || '').trim();
    const publicBase = String(config.objectStorage.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (publicBase && raw.startsWith(`${publicBase}/`))
        return true;
    if (!config.objectStorage.endpointUrl || !config.objectStorage.bucket)
        return false;
    try {
        const url = new URL(raw);
        const endpoint = new URL(config.objectStorage.endpointUrl);
        return url.hostname === endpoint.hostname || url.hostname === `${config.objectStorage.bucket}.${endpoint.hostname}`;
    }
    catch {
        return false;
    }
}
function isProviderEphemeralImageResultUrl(provider, value) {
    try {
        const resultUrl = new URL(value);
        if (!/^\/v1\/images\/results\//i.test(resultUrl.pathname))
            return false;
        const providerUrl = new URL(String(provider.baseUrl || '').replace(/\/+$/, '/') || resultUrl.origin);
        return resultUrl.hostname === providerUrl.hostname;
    }
    catch {
        return false;
    }
}
function sanitizeUpstreamPayload(value) {
    const seen = new WeakSet();
    const visit = (item, key = '', parent) => {
        if (typeof item === 'string') {
            const raw = item.trim();
            const parentMime = String(parent?.mimeType || parent?.mime_type || parent?.mime || parent?.contentType || parent?.content_type || '');
            if (/^data:image\/[^;]+;base64,/i.test(raw))
                return '[inline image omitted: url result used]';
            if (raw.length > 2048 && (/b64|base64|imageData|inlineData|inline_data/i.test(key) || (/^image\//i.test(parentMime) && /data/i.test(key)))) {
                return `[inline image omitted: ${raw.length} chars]`;
            }
            return item;
        }
        if (!item || typeof item !== 'object')
            return item;
        if (seen.has(item))
            return null;
        seen.add(item);
        if (Array.isArray(item))
            return item.map(child => visit(child, key, parent));
        const obj = item;
        return Object.fromEntries(Object.entries(obj).map(([childKey, child]) => [childKey, visit(child, childKey, obj)]));
    };
    return visit(value);
}
export function generatedImageFilePath(name) {
    const safeName = path.basename(String(name || ''));
    if (!/^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(safeName))
        return '';
    return path.join(GENERATED_IMAGE_DIR, safeName);
}
function buildGeminiImageParts(ctx) {
    const refs = new Map();
    const push = (value, mimeHint = '') => {
        if (!value)
            return;
        if (typeof value === 'string') {
            const raw = value.trim();
            if (raw)
                refs.set(raw, mimeHint || inferImageMimeType(raw));
            return;
        }
        if (typeof value === 'object') {
            const obj = value;
            const mime = String(obj.mimeType || obj.mime_type || obj.contentType || obj.content_type || obj.type || '').trim();
            [
                obj.url,
                obj.remoteUrl,
                obj.imageUrl,
                obj.image_url,
                obj.uploadRef,
                obj.providerRef,
                obj.fileId,
                obj.id,
                isRecord(obj.image_url) ? obj.image_url.url : undefined,
            ].forEach(item => push(item, mime));
        }
    };
    ctx.inputFiles.forEach(item => push(item));
    const rawImages = ctx.params.images || ctx.params.image || ctx.params.reference_images || ctx.params.referenceImages;
    if (Array.isArray(rawImages))
        rawImages.forEach(item => push(item));
    else
        push(rawImages);
    return Array.from(refs.entries()).filter(([fileUri]) => !!fileUri).map(([fileUri, mimeType]) => ({
        fileData: {
            mimeType: mimeType || inferImageMimeType(fileUri),
            fileUri,
        },
    }));
}
function inferImageMimeType(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.startsWith('data:image/')) {
        const match = raw.match(/^data:(image\/[^;]+)/);
        if (match?.[1])
            return match[1];
    }
    if (/\.webp(?:$|[?#])/.test(raw))
        return 'image/webp';
    if (/\.png(?:$|[?#])/.test(raw))
        return 'image/png';
    if (/\.gif(?:$|[?#])/.test(raw))
        return 'image/gif';
    return 'image/jpeg';
}
function inferMediaMimeType(value, mediaType = 'video') {
    const raw = String(value || '').toLowerCase();
    if (raw.startsWith('data:')) {
        const match = raw.match(/^data:([^;]+)/);
        if (match?.[1])
            return normalizeMediaMime(match[1], mediaType);
    }
    if (mediaType === 'audio') {
        if (/\.wav(?:$|[?#])/.test(raw))
            return 'audio/wav';
        if (/\.m4a(?:$|[?#])/.test(raw))
            return 'audio/mp4';
        if (/\.aac(?:$|[?#])/.test(raw))
            return 'audio/aac';
        if (/\.webm(?:$|[?#])/.test(raw))
            return 'audio/webm';
        if (/\.ogg(?:$|[?#])/.test(raw))
            return 'audio/ogg';
        return 'audio/mpeg';
    }
    if (/\.webm(?:$|[?#])/.test(raw))
        return 'video/webm';
    if (/\.(mov|qt)(?:$|[?#])/.test(raw))
        return 'video/quicktime';
    if (/\.mpe?g(?:$|[?#])/.test(raw))
        return 'video/mpeg';
    return 'video/mp4';
}
function normalizeGptImageV2BaseModel(modelName) {
    const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
    return raw.replace(/-(?:1|2|4)k$/i, '');
}
async function buildGptImageV2ReferenceImages(ctx) {
    return collectPublicImageReferenceUrls(ctx);
}
function addGrokVideoReferenceCandidate(refs, value) {
    if (!value)
        return;
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw)
            return;
        if (/^data:image\//i.test(raw) || isGenerationResultPath(raw)) {
            refs.add(raw);
            return;
        }
        const publicUrl = resolvePublicReferenceImageUrl(raw);
        if (publicUrl)
            refs.add(publicUrl);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(item => addGrokVideoReferenceCandidate(refs, item));
        return;
    }
    if (typeof value === 'object') {
        const obj = value;
        const saved = isRecord(obj.saved) ? obj.saved : {};
        [
            obj.image_url,
            isRecord(obj.image_url) ? obj.image_url.url : undefined,
            obj.imageUrl,
            isRecord(obj.imageUrl) ? obj.imageUrl.url : undefined,
            obj.remoteUrl,
            obj.providerRef,
            obj.uploadRef,
            obj.fileId,
            obj.file_id,
            obj.id,
            obj.url,
            obj.dataUrl,
            saved.remoteUrl,
            saved.url,
            saved.cachedDataUrl,
        ].forEach(item => addGrokVideoReferenceCandidate(refs, item));
    }
}
function buildGrokVideoReferenceCandidates(ctx) {
    const refs = new Set();
    [
        ctx.params.image_url,
        ctx.params.imageUrl,
        ctx.params.image,
        ctx.params.input_image,
        ctx.params.image_reference,
        ctx.params.first_frame_image_url,
        ctx.params.last_frame_image_url,
        ctx.params.reference_image_urls,
        ctx.params.referenceImageUrls,
        ctx.params.reference_images,
        ctx.params.referenceImages,
        ctx.params.images,
    ].forEach(value => addGrokVideoReferenceCandidate(refs, value));
    if (!refs.size)
        ctx.inputFiles.forEach(item => addGrokVideoReferenceCandidate(refs, item));
    return Array.from(refs);
}
async function resolveGrokVideoReferenceUrls(candidates) {
    const refs = [];
    for (const candidate of candidates) {
        const raw = String(candidate || '').trim();
        if (!raw)
            continue;
        let resolved = raw;
        if (isGenerationResultPath(raw))
            resolved = await materializeGenerationResultReferenceUrl(raw);
        if (/^(https:|data:image\/)/i.test(resolved) && !refs.includes(resolved))
            refs.push(resolved);
    }
    return refs;
}
function buildVideoReferenceUrls(ctx) {
    const refs = new Set();
    const push = (value) => {
        if (!value)
            return;
        if (typeof value === 'string') {
            const raw = value.trim();
            const publicUrl = resolvePublicReferenceImageUrl(raw);
            if (publicUrl)
                refs.add(publicUrl);
            return;
        }
        if (typeof value === 'object') {
            const obj = value;
            const saved = isRecord(obj.saved) ? obj.saved : {};
            [
                obj.remoteUrl,
                obj.providerRef,
                obj.uploadRef,
                obj.fileId,
                obj.file_id,
                obj.id,
                obj.imageUrl,
                obj.image_url,
                isRecord(obj.image_url) ? obj.image_url.url : undefined,
                saved.remoteUrl,
                saved.url,
                obj.url,
            ].forEach(push);
        }
    };
    ctx.inputFiles.forEach(item => push(item));
    const rawImages = ctx.params.reference_image_urls
        || ctx.params.referenceImageUrls
        || ctx.params.reference_images
        || ctx.params.referenceImages
        || ctx.params.images
        || ctx.params.image;
    if (Array.isArray(rawImages))
        rawImages.forEach(item => push(item));
    else
        push(rawImages);
    return Array.from(refs);
}
function buildSoraVideoProImageUrls(ctx) {
    return buildSoraVideoProUrlList(ctx, [
        'extra_images',
        'extraImages',
        'reference_image_urls',
        'referenceImageUrls',
        'reference_images',
        'referenceImages',
        'images',
        'image',
    ], 'image', 9);
}
async function materializeSoraVideoProImageUrls(ctx, urls, limit) {
    const resolved = [];
    for (const url of urls.slice(0, limit)) {
        const next = await materializeImageResultUrl(ctx.provider, url);
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
async function materializeSoraVideoProMediaUrls(ctx, urls, mediaType, limit) {
    const resolved = [];
    for (const url of urls.slice(0, limit)) {
        const next = await materializeMediaResultUrl(ctx.provider, url, mediaType);
        if (next && !resolved.includes(next))
            resolved.push(next);
    }
    return resolved;
}
function resolveSoraVideoProExplicitImageUrl(explicitImageUrl, extraImageUrls) {
    const explicit = String(explicitImageUrl || '').trim();
    if (!explicit)
        return '';
    if (!extraImageUrls.length)
        return explicit;
    if (extraImageUrls.includes(explicit))
        return '';
    return extraImageUrls.length < 9 ? explicit : '';
}
function buildSoraVideoProUrlList(ctx, keys, mediaType, limit) {
    const refs = new Set();
    const push = (value) => {
        if (!value)
            return;
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw)
                return;
            if (mediaType === 'image') {
                const publicUrl = resolvePublicReferenceImageUrl(raw);
                if (publicUrl)
                    refs.add(publicUrl);
            }
            else if (isPublicHttpUrl(raw)) {
                refs.add(raw);
            }
            return;
        }
        if (typeof value === 'object') {
            const obj = value;
            const saved = isRecord(obj.saved) ? obj.saved : {};
            [
                obj.remoteUrl,
                obj.providerRef,
                obj.uploadRef,
                obj.fileId,
                obj.file_id,
                obj.id,
                obj.publicUrl,
                obj.objectStorageUrl,
                obj.contentUrl,
                obj.downloadUrl,
                saved.remoteUrl,
                saved.url,
                saved.publicUrl,
                saved.objectStorageUrl,
                saved.contentUrl,
                saved.downloadUrl,
                obj.url,
                obj.imageUrl,
                obj.image_url,
                obj.videoUrl,
                obj.video_url,
                obj.audioUrl,
                obj.audio_url,
                isRecord(obj.image_url) ? obj.image_url.url : undefined,
                isRecord(obj.video_url) ? obj.video_url.url : undefined,
                isRecord(obj.audio_url) ? obj.audio_url.url : undefined,
            ].forEach(push);
        }
    };
    keys.forEach(key => push(ctx.params[key]));
    if (mediaType === 'image')
        ctx.inputFiles.forEach(push);
    return Array.from(refs).slice(0, limit);
}
function buildVideoMediaReferences(ctx) {
    const pick = (value) => {
        if (!value)
            return '';
        if (typeof value === 'string')
            return /^https?:\/\//i.test(value.trim()) ? value.trim() : '';
        if (typeof value !== 'object')
            return '';
        const obj = value;
        const saved = isRecord(obj.saved) ? obj.saved : {};
        const candidates = [
            obj.remoteUrl,
            obj.providerRef,
            obj.uploadRef,
            obj.fileId,
            obj.file_id,
            obj.id,
            saved.remoteUrl,
            saved.url,
            obj.url,
            obj.videoUrl,
            obj.audioUrl,
            obj.video_url,
            obj.audio_url,
        ];
        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (/^https?:\/\//i.test(raw))
                return raw;
        }
        return '';
    };
    return {
        videoUrl: pick(ctx.params.video_url || ctx.params.videoUrl || ctx.params.refVideo || ctx.params.video),
        audioUrl: pick(ctx.params.audio_url || ctx.params.audioUrl || ctx.params.refAudio || ctx.params.audio),
    };
}
function buildVideoReferenceVideoUrls(ctx) {
    const refs = new Set();
    const push = (value) => {
        if (!value)
            return;
        if (typeof value === 'string') {
            const raw = value.trim();
            if (/^(https?:\/\/|data:video\/)/i.test(raw))
                refs.add(raw);
            return;
        }
        if (typeof value === 'object') {
            const obj = value;
            const saved = isRecord(obj.saved) ? obj.saved : {};
            [
                obj.soraV3ReferenceVideoUrl,
                obj.referenceVideoUrl,
                saved.soraV3ReferenceVideoUrl,
                saved.referenceVideoUrl,
                obj.remoteUrl,
                obj.providerRef,
                obj.uploadRef,
                obj.fileId,
                obj.file_id,
                obj.id,
                saved.remoteUrl,
                saved.url,
                obj.url,
                obj.videoUrl,
                obj.video_url,
            ].forEach(push);
        }
    };
    const rawVideos = ctx.params.reference_videos || ctx.params.referenceVideos || ctx.params.reference_video || ctx.params.referenceVideo;
    if (Array.isArray(rawVideos))
        rawVideos.forEach(item => push(item));
    else
        push(rawVideos);
    const mediaRefs = buildVideoMediaReferences(ctx);
    push(mediaRefs.videoUrl);
    push(ctx.params.soraV3ReferenceVideoUrl || ctx.params.referenceVideoUrl || ctx.params.audioReferenceVideoUrl);
    return Array.from(refs);
}
function extractGptImageV2Urls(payload) {
    const urls = new Set();
    const push = (value) => {
        const raw = String(value || '').trim();
        if (/^(https?:\/\/|\/v1\/(?:images\/results|files|videos)\/)/i.test(raw))
            urls.add(raw);
    };
    const visit = (value, key = '') => {
        if (!value)
            return;
        if (typeof value === 'string') {
            if (/url|uri|result|output|image|b64|base64/i.test(key))
                push(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => visit(item, key));
            return;
        }
        if (typeof value === 'object') {
            Object.entries(value).forEach(([itemKey, item]) => {
                if (/url|uri|result|output|image|data/i.test(itemKey) || typeof item === 'object')
                    visit(item, itemKey);
            });
        }
    };
    visit(payload);
    return Array.from(urls);
}
function extractVeoChatVideoUrls(payload) {
    const urls = new Set();
    const pushText = (value) => {
        const raw = String(value || '').trim();
        if (!raw)
            return;
        const matches = raw.match(/https?:\/\/[^\s"'<>)]*/gi) || [];
        matches.forEach(match => urls.add(match.replace(/[，。,.]+$/g, '')));
    };
    const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === 'string')
        pushText(content);
    else if (Array.isArray(content)) {
        content.forEach(item => {
            if (typeof item === 'string')
                pushText(item);
            else if (item && typeof item === 'object') {
                pushText(item.text);
                const videoUrl = item.video_url;
                if (isRecord(videoUrl))
                    pushText(videoUrl.url);
                else
                    pushText(videoUrl);
                pushText(item.url);
            }
        });
    }
    extractUrls(payload).forEach(url => urls.add(url));
    return Array.from(urls);
}
function resolveGptImageV2Endpoint(ctx) {
    const configured = String(ctx.model.endpointPath || ctx.provider.endpointPath || '').trim();
    if (!configured)
        return '/v1/images/generations';
    if (/\/v1\/images\/generations$/i.test(configured))
        return configured;
    if (/\/images\/generations$/i.test(configured))
        return '/v1/images/generations';
    return configured;
}
function absolutizeProviderUrl(provider, value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/^(https?:|data:image\/)/i.test(raw))
        return raw;
    if (!raw.startsWith('/'))
        return raw;
    try {
        return new URL(raw, provider.baseUrl.replace(/\/+$/, '') + '/').toString();
    }
    catch {
        return raw;
    }
}
function absolutizeProviderUrls(provider, urls) {
    return Array.from(new Set(urls.map(url => absolutizeProviderUrl(provider, url)).filter(Boolean)));
}
function resolveEndpointPath(endpointPath, ctx) {
    return String(endpointPath || '')
        .replaceAll('{model}', encodeURIComponent(ctx.model.name))
        .replaceAll('{baseModel}', encodeURIComponent(ctx.model.name))
        .replaceAll('{taskId}', encodeURIComponent(ctx.taskId || ''))
        .replaceAll('{task_id}', encodeURIComponent(ctx.taskId || ''));
}
function compactJson(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}
function withoutKeys(value, keys) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
function extractUrls(payload) {
    const urls = new Set();
    const visit = (value) => {
        if (!value)
            return;
        if (typeof value === 'string') {
            if (/^(https?:\/\/|\/v1\/(?:images\/results|files|videos)\/)/.test(value))
                urls.add(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value === 'object') {
            Object.entries(value).forEach(([key, item]) => {
                if (/url|uri/i.test(key))
                    visit(item);
                else if (typeof item === 'object')
                    visit(item);
            });
        }
    };
    visit(payload);
    return Array.from(urls);
}
function extractTaskStatusText(payload) {
    const data = payload;
    const candidates = [
        data?.data?.status,
        data?.data?.state,
        data?.data?.task_status,
        data?.data?.taskStatus,
        data?.data?.status_text,
        data?.data?.statusText,
        data?.data?.task?.status,
        data?.data?.task?.state,
        data?.data?.task?.task_status,
        data?.data?.result?.status,
        data?.data?.result?.state,
        data?.data?.video?.status,
        data?.data?.output?.status,
        data?.task?.status,
        data?.task?.state,
        data?.result?.status,
        data?.result?.state,
        data?.state,
        data?.task_status,
        data?.taskStatus,
        data?.status,
    ].map(normalizeTaskStatusValue).filter(Boolean);
    if (candidates.length)
        return candidates[0];
    const recursive = findTaskStatusValue(payload, 0);
    return recursive || '';
}
function findTaskStatusValue(value, depth) {
    if (!value || depth > 5 || typeof value !== 'object')
        return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findTaskStatusValue(item, depth + 1);
            if (found)
                return found;
        }
        return '';
    }
    for (const [key, item] of Object.entries(value)) {
        if (/^(status|state|task_status|taskStatus|status_text|statusText|generation_status|generationStatus)$/i.test(key)) {
            const normalized = normalizeTaskStatusValue(item);
            if (normalized)
                return normalized;
        }
        if (item && typeof item === 'object') {
            const found = findTaskStatusValue(item, depth + 1);
            if (found)
                return found;
        }
    }
    return '';
}
function normalizeTaskStatusValue(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw || /^\d+$/.test(raw))
        return '';
    if (/^(success|succeeded|completed|complete|done|finished|finish)$/i.test(raw) || /成功|完成/.test(raw))
        return 'completed';
    if (/^(failed|failure|fail|error|errored|cancelled|canceled|rejected|blocked|denied)$/i.test(raw) || /失败|错误|拒绝|拦截|审核失败/.test(raw))
        return 'failed';
    if (/^(pending|queued|queue|processing|running|in_progress|generating|submitted|created)$/i.test(raw) || /排队|等待|处理中|进行中|生成中/.test(raw))
        return raw;
    return '';
}
function isFailedTaskStatus(status) {
    return normalizeTaskStatusValue(status) === 'failed';
}
function isDoneTaskStatus(status) {
    return normalizeTaskStatusValue(status) === 'completed';
}
function extractErrorMessage(payload) {
    const direct = [
        payload?.error?.message,
        payload?.error_message,
        payload?.errorMessage,
        payload?.message,
        payload?.msg,
        payload?.reason,
        payload?.fail_reason,
        payload?.failed_reason,
        payload?.failure_reason,
        payload?.data?.error?.message,
        payload?.data?.error_message,
        payload?.data?.errorMessage,
        payload?.data?.message,
        payload?.data?.msg,
        payload?.data?.reason,
        payload?.data?.fail_reason,
        payload?.data?.failed_reason,
        payload?.data?.failure_reason,
        payload?.data?.task?.error?.message,
        payload?.data?.task?.error_message,
        payload?.data?.task?.message,
        payload?.data?.task?.reason,
        payload?.data?.result?.error?.message,
        payload?.data?.result?.error_message,
        payload?.data?.result?.message,
        payload?.data?.result?.reason,
    ].map(formatErrorMessageValue).filter(Boolean);
    if (direct.length)
        return direct[0];
    const recursive = findErrorMessageValue(payload, 0);
    return recursive || '上游任务失败';
}
function findErrorMessageValue(value, depth) {
    if (!value || depth > 6)
        return '';
    if (typeof value === 'string')
        return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findErrorMessageValue(item, depth + 1);
            if (found)
                return found;
        }
        return '';
    }
    if (typeof value !== 'object')
        return '';
    const entries = Object.entries(value);
    for (const [key, item] of entries) {
        if (/error|message|msg|reason|fail|reject|audit|moderation|policy|copyright|safety|blocked/i.test(key)) {
            const formatted = formatErrorMessageValue(item);
            if (formatted)
                return formatted;
        }
    }
    for (const [, item] of entries) {
        if (item && typeof item === 'object') {
            const found = findErrorMessageValue(item, depth + 1);
            if (found)
                return found;
        }
    }
    return '';
}
function formatErrorMessageValue(value) {
    if (value === undefined || value === null || value === false)
        return '';
    if (typeof value === 'string' || typeof value === 'number') {
        const raw = String(value).trim();
        if (!raw || raw === 'null' || raw === 'undefined')
            return '';
        if (/^(failed|failure|fail|error|cancelled|canceled)$/i.test(raw))
            return '';
        return raw.length > 800 ? `${raw.slice(0, 800)}...` : raw;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const formatted = formatErrorMessageValue(item);
            if (formatted)
                return formatted;
        }
        return '';
    }
    if (typeof value !== 'object')
        return '';
    const item = value;
    const message = formatErrorMessageValue(item.message ?? item.error_message ?? item.errorMessage ?? item.msg ?? item.reason ?? item.fail_reason ?? item.failed_reason ?? item.failure_reason ?? item.detail ?? item.description);
    const code = formatErrorMessageValue(item.code ?? item.error_code ?? item.errorCode ?? item.type);
    if (message && code && !message.includes(code))
        return `${message}（${code}）`;
    if (message)
        return message;
    if (code)
        return code;
    return '';
}
