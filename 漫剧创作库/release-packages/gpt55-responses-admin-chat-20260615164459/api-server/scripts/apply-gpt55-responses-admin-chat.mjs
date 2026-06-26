import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../dist/config.js';
import { prisma } from '../dist/db.js';
import { decryptSecret, encryptSecret } from '../dist/security.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, '..');
const modelsDir = process.env.CANVAS_MODELS_DIR || '/var/www/ai-admin/workbench-web/models';
const fallbackModelsDir = '/var/www/ai-admin/models';
const targetConfigFile = 'gpt-5.5-responses-llm.json';

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'model';
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function jsonValue(value, fallback = {}) {
  return value === undefined || value === null ? fallback : value;
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized
    || normalized === 'replace-me'
    || normalized === 'your-api-key'
    || normalized.startsWith('replace-with-')
    || normalized.includes('placeholder');
}

function decryptIfUsable(encrypted) {
  try {
    const value = decryptSecret(encrypted || '').trim();
    return isPlaceholderSecret(value) ? '' : value;
  } catch {
    return '';
  }
}

async function readJsonMaybe(fullPath) {
  const raw = await readFile(fullPath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function readTargetConfig() {
  const candidates = [
    path.join(modelsDir, targetConfigFile),
    path.join(fallbackModelsDir, targetConfigFile),
  ];
  for (const fullPath of candidates) {
    try {
      const config = await readJsonMaybe(fullPath);
      console.log(`[gpt55-responses-admin] config=${fullPath}`);
      return config;
    } catch {
      // Try the next installed model JSON location.
    }
  }
  throw new Error(`missing ${targetConfigFile} in ${modelsDir} or ${fallbackModelsDir}`);
}

async function findReusableCliproxyKey(config) {
  const providers = await prisma.upstreamProvider.findMany({
    where: {
      OR: [
        { baseUrl: { contains: '45.77.211.38', mode: 'insensitive' } },
        { providerKey: { contains: 'cliproxy', mode: 'insensitive' } },
        { providerKey: { contains: 'grok', mode: 'insensitive' } },
        { name: { contains: 'grok', mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  const provider = providers.find(row => decryptIfUsable(row.apiKeyEncrypted));
  if (provider) return { encrypted: provider.apiKeyEncrypted, source: `provider:${provider.providerKey}` };

  const jsonKey = String(config.apiKey || config.key || config.api_key || '').trim();
  if (!isPlaceholderSecret(jsonKey)) return { encrypted: encryptSecret(jsonKey), source: `model-json:${targetConfigFile}` };

  for (const filename of ['grok-llm.json', 'grok-image-edit.json', 'grok-image.json', 'grok-video.json']) {
    for (const root of [modelsDir, fallbackModelsDir]) {
      try {
        const item = await readJsonMaybe(path.join(root, filename));
        const key = String(item.apiKey || item.key || item.api_key || '').trim();
        if (!isPlaceholderSecret(key)) return { encrypted: encryptSecret(key), source: `model-json:${filename}` };
      } catch {
        // Try the next likely existing Cliproxy/Grok config.
      }
    }
  }

  throw new Error('No reusable Cliproxy/Grok key found in existing providers or model JSON files');
}

function displayName(config) {
  return String(config.displayName || config.label || config.ui?.label || config.name || config.model || config.id || 'GPT-5.5 Responses').trim();
}

async function upsertGpt55ResponsesModel(config, apiKeyEncrypted) {
  const sourceId = String(config.id || config.configId || 'gpt-5.5-responses-llm').trim();
  const sourceSlug = slug(sourceId);
  const providerId = `canvas-provider-${sourceSlug}`;
  const modelId = `canvas-${sourceSlug}`;
  const providerKey = `canvas_${sourceSlug}`;
  const protocolInput = isObject(config.protocol) ? config.protocol : {};
  const adapter = String(config.adapter || protocolInput.adapter || 'openai-responses').trim() || 'openai-responses';
  const baseUrl = String(config.baseUrl || config.url || 'http://45.77.211.38:8317/v1').trim().replace(/\/+$/, '');
  const endpointPath = String(config.endpointPath || protocolInput.endpointPath || '/responses').trim() || '/responses';
  const realModel = String(config.model || 'gpt-5.5').trim() || 'gpt-5.5';
  const protocol = {
    ...protocolInput,
    adapter,
    endpointPath,
    method: protocolInput.method || 'sync',
    messageFormat: protocolInput.messageFormat || 'responses',
  };

  const provider = await prisma.upstreamProvider.upsert({
    where: { id: providerId },
    update: {
      providerKey,
      name: `画布渠道 ${displayName(config)}`,
      type: 'LLM',
      adapter,
      baseUrl,
      endpointPath,
      statusEndpointPath: null,
      uploadMode: null,
      requestMethod: 'sync',
      defaultModel: realModel,
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
    create: {
      id: providerId,
      providerKey,
      name: `画布渠道 ${displayName(config)}`,
      type: 'LLM',
      adapter,
      baseUrl,
      endpointPath,
      statusEndpointPath: null,
      uploadMode: null,
      requestMethod: 'sync',
      defaultModel: realModel,
      apiKeyEncrypted,
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: modelId },
    update: {
      providerId: provider.id,
      modelKey: sourceId,
      name: realModel,
      displayName: displayName(config),
      type: 'LLM',
      unit: 'token_usd_ratio',
      salePrice: 0,
      costPrice: 0,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter,
      endpointPath,
      statusEndpointPath: null,
      uploadMode: null,
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: displayName(config) }),
      status: 'ACTIVE',
    },
    create: {
      id: modelId,
      providerId: provider.id,
      modelKey: sourceId,
      name: realModel,
      displayName: displayName(config),
      type: 'LLM',
      unit: 'token_usd_ratio',
      salePrice: 0,
      costPrice: 0,
      pricePerSecond: 0,
      inputPriceUsdPer1m: 0,
      outputPriceUsdPer1m: 0,
      cnyPerUsdCost: 0,
      creditsPerUsdCost: 0,
      markupRate: 1,
      adapter,
      endpointPath,
      statusEndpointPath: null,
      uploadMode: null,
      protocol,
      supports: jsonValue(config.supports),
      defaults: jsonValue(config.defaults),
      capabilities: jsonValue(config.capabilities),
      modelAssembly: jsonValue(config.modelAssembly),
      ui: jsonValue(config.ui, { label: displayName(config) }),
      status: 'ACTIVE',
    },
  });

  const row = await prisma.aiModel.findUnique({ where: { id: modelId }, include: { provider: true } });
  if (!row || row.status !== 'ACTIVE' || row.provider?.status !== 'ACTIVE' || row.adapter !== 'openai-responses' || row.endpointPath !== '/responses') {
    throw new Error(`GPT-5.5 Responses model verification failed: ${modelId}`);
  }
  console.log(`[gpt55-responses-admin] upserted ${modelId} ${row.type} ${row.adapter} ${row.endpointPath}`);
}

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`patch marker not found: ${label}`);
  return source.replace(search, replacement);
}

function insertBeforeRequired(source, marker, insertion, label) {
  if (source.includes('function isResponsesLlmChannel')) return source;
  if (!source.includes(marker)) throw new Error(`insert marker not found: ${label}`);
  return source.replace(marker, `${insertion}\n${marker}`);
}

const jsHelpers = `
function compactLlmPayload(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}
function llmJsonText(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value || '');
    }
}
function isResponsesLlmChannel(model, endpointPath) {
    const protocol = model?.protocol && typeof model.protocol === 'object' ? model.protocol : {};
    const provider = model?.provider && typeof model.provider === 'object' ? model.provider : {};
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
function chatImageUrlFromPart(part) {
    return (typeof part?.image_url === 'string' ? part.image_url : part?.image_url?.url) ||
        part?.imageUrl ||
        part?.image_url_url ||
        part?.url ||
        part?.input_image?.image_url ||
        part?.input_image?.url ||
        '';
}
function chatContentToPromptText(content) {
    if (typeof content === 'string') return content;
    const parts = [];
    const visit = value => {
        if (value == null) return;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            const text = String(value).trim();
            if (text) parts.push(text);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object') return;
        if (typeof value.text === 'string') parts.push(value.text);
        if (typeof value.content === 'string') parts.push(value.content);
        const imageUrl = chatImageUrlFromPart(value);
        if (imageUrl) parts.push('参考图 URL：' + String(imageUrl));
    };
    visit(content);
    return parts.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
}
function responsesContentFromChatContent(content) {
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
            const imageUrl = chatImageUrlFromPart(value);
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
function responsesInputFromChatMessages(messages) {
    const input = [];
    const instructions = [];
    for (const message of Array.isArray(messages) ? messages : []) {
        const role = String(message?.role || 'user').trim().toLowerCase();
        const content = responsesContentFromChatContent(message?.content);
        if (!content.length) continue;
        if (role === 'system' || role === 'developer') {
            instructions.push(content.map(part => part.text).filter(Boolean).join('\\n'));
            continue;
        }
        input.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
    }
    return { input, instructions: instructions.filter(Boolean).join('\\n\\n').trim() };
}
function buildResponsesLlmRequestPayload(body, modelName) {
    const converted = responsesInputFromChatMessages(body.messages);
    if (!converted.input.length) throw new Error('Responses API input is required');
    return compactLlmPayload({
        model: modelName,
        input: converted.input,
        instructions: converted.instructions || undefined,
        temperature: body.temperature,
        max_output_tokens: body.maxOutputTokens,
    });
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

async function patchDistGenerateRoute() {
  const filePath = path.join(apiRoot, 'dist/modules/generate/routes.js');
  let source = await readFile(filePath, 'utf8');
  source = replaceRequired(
    source,
    `    messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),`,
    `    messages: z.array(z.object({ role: z.string(), content: z.any() })).min(1),`,
    'dist chat schema content',
  );
  source = replaceRequired(
    source,
    `    const promptText = body.messages.map(m => \`\${m.role}: \${m.content}\`).join('\\n');`,
    `    const promptText = body.messages.map(m => \`\${m.role}: \${chatContentToPromptText(m.content)}\`).join('\\n');`,
    'dist promptText',
  );
  source = replaceRequired(
    source,
    `    const requestPayload = {
        model: model.name,
        messages: body.messages,
        temperature: body.temperature,
        max_tokens: body.maxOutputTokens,
        ...(body.extra || {}),
    };`,
    `    let requestPayload = {
        model: model.name,
        messages: body.messages,
        temperature: body.temperature,
        max_tokens: body.maxOutputTokens,
        ...(body.extra || {}),
    };`,
    'dist requestPayload let',
  );
  source = replaceRequired(
    source,
    `        const endpointPath = resolveEndpointPath(body.endpointPath || model.endpointPath || model.provider.endpointPath || '/chat/completions', { model: model.name });
        const upstream = runtime.generationMockMode
            ? mockChatResponse(body.messages, estimatedInputTokens)
            : await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
        const text = extractChatText(upstream);`,
    `        const endpointPath = resolveEndpointPath(body.endpointPath || model.endpointPath || model.provider.endpointPath || '/chat/completions', { model: model.name });
        const useResponsesLlm = isResponsesLlmChannel(model, endpointPath);
        if (useResponsesLlm) requestPayload = buildResponsesLlmRequestPayload(body, model.name);
        const upstream = runtime.generationMockMode
            ? mockChatResponse(body.messages.map(m => ({ ...m, content: chatContentToPromptText(m.content) })), estimatedInputTokens)
            : await callUpstreamJson(model.provider, endpointPath, requestPayload, runtime.upstreamTimeoutMs);
        const text = useResponsesLlm ? extractResponsesText(upstream) : extractChatText(upstream);`,
    'dist responses route branch',
  );
  source = insertBeforeRequired(source, 'async function getModel(modelId, type) {', jsHelpers, 'dist helper insertion');
  await writeFile(filePath, source, 'utf8');
  console.log(`[gpt55-responses-admin] patched ${filePath}`);
}

async function main() {
  await patchDistGenerateRoute();
  const config = await readTargetConfig();
  const key = await findReusableCliproxyKey(config);
  await upsertGpt55ResponsesModel(config, key.encrypted);
  console.log(`[gpt55-responses-admin] keySource=${key.source}`);
}

main()
  .catch(err => {
    console.error('[gpt55-responses-admin] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
