import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, '..');
const MAX_LLM_TIMEOUT_MS = 900000;
const DEFAULT_LLM_TIMEOUT_MS = 900000;

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`patch marker not found: ${label}`);
  return source.replace(search, replacement);
}

function insertBeforeRequired(source, marker, insertion, label, alreadyMarker) {
  if (source.includes(alreadyMarker)) return source;
  if (!source.includes(marker)) throw new Error(`insert marker not found: ${label}`);
  return source.replace(marker, `${insertion}\n${marker}`);
}

const timeoutHelper = `
function resolveLlmRequestTimeoutMs(input, fallback) {
    const values = [
        input?.timeoutMs,
        input?.upstreamTimeoutMs,
        input?.requestTimeoutMs,
        input?.queryTimeoutMs,
        fallback,
        ${DEFAULT_LLM_TIMEOUT_MS},
    ].map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0);
    return Math.min(${MAX_LLM_TIMEOUT_MS}, Math.max(...values));
}
`;

function patchGenerateRoutes(source) {
  source = replaceRequired(
    source,
    `    maxOutputTokens: z.number().int().min(1).max(200000).default(4096),`,
    `    maxOutputTokens: z.number().int().min(1).max(200000).default(4096),
    timeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    upstreamTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    requestTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    queryTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),`,
    'generate chat timeout schema',
  );
  source = replaceRequired(
    source,
    `            : await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);`,
    `            : await callUpstreamJson(model.provider, endpointPath, requestPayload, resolveLlmRequestTimeoutMs(body, runtime.upstreamTimeoutMs));`,
    'generate chat upstream timeout',
  );
  source = insertBeforeRequired(
    source,
    source.includes('function compactLlmPayload') ? 'function compactLlmPayload(value) {' : 'async function getModel(modelId, type) {',
    timeoutHelper,
    'generate timeout helper',
    'function resolveLlmRequestTimeoutMs',
  );
  return source;
}

const textAgentHelpers = `
function resolveTextAgentTimeoutMs(body, fallback) {
    const values = [
        body?.timeoutMs,
        body?.upstreamTimeoutMs,
        body?.requestTimeoutMs,
        body?.queryTimeoutMs,
        fallback,
        ${DEFAULT_LLM_TIMEOUT_MS},
    ].map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0);
    return Math.min(${MAX_LLM_TIMEOUT_MS}, Math.max(...values));
}
function isResponsesTextAgentChannel(model, endpointPath) {
    const protocol = isRecord(model?.protocol) ? model.protocol : {};
    const provider = isRecord(model?.provider) ? model.provider : {};
    const text = [
        model?.adapter,
        protocol.adapter,
        provider.adapter,
        endpointPath,
        model?.endpointPath,
        protocol.endpointPath,
        provider.endpointPath,
        protocol.messageFormat,
    ].map(value => String(value || '').trim().toLowerCase()).join(' ');
    return text.includes('responses') || /\\/responses\\b/.test(text);
}
function textAgentImageUrlFromPart(part) {
    return (typeof part?.image_url === 'string' ? part.image_url : part?.image_url?.url) ||
        part?.imageUrl ||
        part?.remoteUrl ||
        part?.objectStorageUrl ||
        part?.saved?.remoteUrl ||
        part?.saved?.url ||
        part?.saved?.objectStorageUrl ||
        part?.url ||
        part?.dataUrl ||
        part?.previewUrl ||
        part?.input_image?.image_url ||
        part?.input_image?.url ||
        '';
}
function responsesContentFromTextAgentContent(content) {
    if (typeof content === 'string') return content.trim() ? [{ type: 'input_text', text: content }] : [];
    const parts = [];
    const pushText = text => {
        const value = String(text || '').trim();
        if (value) parts.push({ type: 'input_text', text: value });
    };
    const visit = value => {
        if (value == null) return;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            pushText(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object') return;
        const type = String(value.type || '').toLowerCase();
        if (type.includes('image')) {
            const imageUrl = textAgentImageUrlFromPart(value);
            if (imageUrl) parts.push({ type: 'input_image', image_url: String(imageUrl) });
            return;
        }
        if (typeof value.text === 'string') pushText(value.text);
        else if (typeof value.content === 'string') pushText(value.content);
        else visit(value.content);
    };
    visit(content);
    return parts;
}
function buildResponsesTextAgentPayload(modelName, prompt, body) {
    const content = responsesContentFromTextAgentContent(prompt);
    const seenImages = new Set();
    const pushImage = item => {
        const imageUrl = textAgentImageUrlFromPart(item);
        if (!imageUrl || seenImages.has(imageUrl)) return;
        seenImages.add(imageUrl);
        content.push({ type: 'input_image', image_url: String(imageUrl) });
    };
    (Array.isArray(body?.images) ? body.images : []).slice(0, 8).forEach(pushImage);
    if (!content.length) throw new Error('Responses API input is required');
    return {
        model: modelName,
        input: [{ role: 'user', content }],
        instructions: '你是专业的文本、剧本、提示词生产 Agent。',
        temperature: 0.7,
    };
}
function extractResponsesText(payload) {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
    if (typeof payload?.text === 'string' && payload.text.trim()) return payload.text.trim();
    const parts = [];
    const visit = value => {
        if (value == null) return;
        if (typeof value === 'string') {
            const text = value.trim();
            if (text) parts.push(text);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object') return;
        if (typeof value.output_text === 'string') parts.push(value.output_text);
        if (typeof value.text === 'string') parts.push(value.text);
        if (typeof value.content === 'string') parts.push(value.content);
        if (Array.isArray(value.content)) visit(value.content);
        if (Array.isArray(value.output)) visit(value.output);
    };
    visit(payload?.output);
    visit(payload?.content);
    return parts.filter(Boolean).join('\\n').trim();
}
`;

function patchTextAgentRoutes(source) {
  source = replaceRequired(
    source,
    `    videos: z.array(z.unknown()).default([]),`,
    `    videos: z.array(z.unknown()).default([]),
    timeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    upstreamTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    requestTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),
    queryTimeoutMs: z.number().int().min(1000).max(${MAX_LLM_TIMEOUT_MS}).optional(),`,
    'text-agent timeout schema',
  );
  source = replaceRequired(
    source,
    `    const text = await runLlm(body.modelKey, prompt);`,
    `    const text = await runLlm(body.modelKey, prompt, body);`,
    'text-agent body passthrough',
  );
  source = replaceRequired(
    source,
    `async function runLlm(modelKey = '', prompt) {`,
    `async function runLlm(modelKey = '', prompt, body = {}) {`,
    'text-agent runLlm body signature',
  );
  source = replaceRequired(
    source,
    `    const payload = {
        model: model.name,
        messages: [
            { role: 'system', content: '你是专业的文本、剧本、提示词生产 Agent。' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.7,
    };`,
    `    let payload = {
        model: model.name,
        messages: [
            { role: 'system', content: '你是专业的文本、剧本、提示词生产 Agent。' },
            { role: 'user', content: prompt },
        ],
        temperature: 0.7,
    };`,
    'text-agent payload let',
  );
  source = replaceRequired(
    source,
    `    const upstream = await callUpstreamJson(model.provider, endpointPath, payload, model.provider.timeoutMs || undefined);
    const text = extractChatText(upstream) || upstream?.choices?.[0]?.message?.content || upstream?.choices?.[0]?.text || upstream?.text || upstream?.content;`,
    `    const useResponsesLlm = isResponsesTextAgentChannel(model, endpointPath);
    if (useResponsesLlm) payload = buildResponsesTextAgentPayload(model.name, prompt, body);
    const upstream = await callUpstreamJson(model.provider, endpointPath, payload, resolveTextAgentTimeoutMs(body, model.provider.timeoutMs));
    const text = useResponsesLlm ? extractResponsesText(upstream) : (extractChatText(upstream) || upstream?.choices?.[0]?.message?.content || upstream?.choices?.[0]?.text || upstream?.text || upstream?.content);`,
    'text-agent responses timeout branch',
  );
  source = insertBeforeRequired(
    source,
    'function extractInlineFileText(file) {',
    textAgentHelpers,
    'text-agent helper insertion',
    'function resolveTextAgentTimeoutMs',
  );
  return source;
}

async function patchFile(relativePath, patcher, requiredMarkers) {
  const filePath = path.join(apiRoot, relativePath);
  let source = await readFile(filePath, 'utf8');
  source = patcher(source);
  await writeFile(filePath, source, 'utf8');
  for (const marker of requiredMarkers) {
    if (!source.includes(marker)) throw new Error(`patched marker missing in ${relativePath}: ${marker}`);
  }
  console.log(`[gpt55-llm-timeout] patched ${filePath}`);
}

async function main() {
  await patchFile('dist/modules/generate/routes.js', patchGenerateRoutes, [
    'function resolveLlmRequestTimeoutMs',
    'resolveLlmRequestTimeoutMs(body, runtime.upstreamTimeoutMs)',
  ]);
  await patchFile('dist/modules/workbench/text-agent-routes.js', patchTextAgentRoutes, [
    'function resolveTextAgentTimeoutMs',
    'buildResponsesTextAgentPayload',
    'resolveTextAgentTimeoutMs(body, model.provider.timeoutMs)',
  ]);
}

main().catch(err => {
  console.error('[gpt55-llm-timeout] failed:', err);
  process.exitCode = 1;
});
