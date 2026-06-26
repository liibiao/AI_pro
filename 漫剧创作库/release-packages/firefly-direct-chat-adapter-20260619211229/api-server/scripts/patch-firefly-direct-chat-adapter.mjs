import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'AIYUNZHI_FIREFLY_DIRECT_CHAT_ADAPTER';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-firefly-direct-chat-${stamp}`);
}

function patchRegistryTs(text, file) {
  let next = text;
  if (!next.includes("'aiyunzhi-firefly-gpt-image': { submit: submitAiyunzhiFireflyGptImage")) {
    const needle = "  'openai-chat-image': { submit: submitOpenAiChatImage, query: queryGenericImage },\n";
    const insert = "  'aiyunzhi-firefly-gpt-image': { submit: submitAiyunzhiFireflyGptImage, query: queryGenericImage },\n  'aiyunzhi-firefly-chat-image': { submit: submitAiyunzhiFireflyGptImage, query: queryGenericImage },\n";
    if (!next.includes(needle)) throw new Error(`registry ts adapter needle not found in ${file}`);
    next = next.replace(needle, `${needle}${insert}`);
  }
  if (!next.includes(`async function submitAiyunzhiFireflyGptImage(ctx: AdapterContext): Promise<AdapterSubmitResult>`) || !next.includes(marker)) {
    const needle = "async function submitOpenAiChatImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {\n";
    if (!next.includes(needle)) throw new Error(`registry ts function needle not found in ${file}`);
    next = next.replace(needle, `${fireflyDirectTs()}\n${needle}`);
  }
  next = fixFireflyEndpointTs(next);
  return next;
}

function patchRegistryJs(text, file) {
  let next = text;
  if (!next.includes("'aiyunzhi-firefly-gpt-image': { submit: submitAiyunzhiFireflyGptImage")) {
    const needle = "    'openai-chat-image': { submit: submitOpenAiChatImage, query: queryGenericImage },\n";
    const insert = "    'aiyunzhi-firefly-gpt-image': { submit: submitAiyunzhiFireflyGptImage, query: queryGenericImage },\n    'aiyunzhi-firefly-chat-image': { submit: submitAiyunzhiFireflyGptImage, query: queryGenericImage },\n";
    if (!next.includes(needle)) throw new Error(`registry js adapter needle not found in ${file}`);
    next = next.replace(needle, `${needle}${insert}`);
  }
  if (!next.includes('async function submitAiyunzhiFireflyGptImage(ctx)') || !next.includes(marker)) {
    const needle = "async function submitOpenAiChatImage(ctx) {\n";
    if (!next.includes(needle)) throw new Error(`registry js function needle not found in ${file}`);
    next = next.replace(needle, `${fireflyDirectJs()}\n${needle}`);
  }
  next = fixFireflyEndpointJs(next);
  next = fixGeneratedFireflyDirectJs(next);
  return next;
}

function patchRoutesTs(text, file) {
  let next = text;
  const guard = "  if (isAiyunzhiFireflyDirectGenerationHint(modelHint, hint, configuredLower)) return 'aiyunzhi-firefly-gpt-image';\n";
  if (!next.includes(guard)) {
    const needle = "  if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image') return configuredLower;\n";
    if (!next.includes(needle)) throw new Error(`routes ts priority needle not found in ${file}`);
    next = next.replace(needle, `${guard}${needle}`);
  }
  if (!next.includes('function isAiyunzhiFireflyDirectGenerationHint(')) {
    next = insertBeforeAny(next, [
      "function isCanvasGptImage2ProGenerationHint(modelHint: string, hint: string) {\n",
      "function isCanvasGptImage2ProGenerationHint(modelHint, hint) {\n",
      "function isGptImage2GenerationHint(",
      "function resolveUpstreamTimeoutMs(",
    ], `${fireflyRouteHelperTs()}\n`, `routes ts helper needle not found in ${file}`);
  }
  return next;
}

function patchRoutesJs(text, file) {
  let next = text;
  const guard = "    if (isAiyunzhiFireflyDirectGenerationHint(modelHint, hint, configuredLower))\n        return 'aiyunzhi-firefly-gpt-image';\n";
  if (!next.includes(guard)) {
    const needle = "    if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image')\n        return configuredLower;\n";
    if (!next.includes(needle)) throw new Error(`routes js priority needle not found in ${file}`);
    next = next.replace(needle, `${guard}${needle}`);
  }
  if (!next.includes('function isAiyunzhiFireflyDirectGenerationHint(')) {
    next = insertBeforeAny(next, [
      "function isCanvasGptImage2ProGenerationHint(modelHint, hint) {\n",
      "function isGptImage2GenerationHint(",
      "function resolveUpstreamTimeoutMs(",
    ], `${fireflyRouteHelperJs()}\n`, `routes js helper needle not found in ${file}`);
  }
  return next;
}

function insertBeforeAny(text, needles, insert, errorMessage) {
  for (const needle of needles) {
    const index = text.indexOf(needle);
    if (index >= 0) return `${text.slice(0, index)}${insert}${text.slice(index)}`;
  }
  if (/^\s*export\s+/m.test(text) || /\bfunction\s+\w+\s*\(/.test(text)) {
    return `${text}\n${insert}`;
  }
  throw new Error(errorMessage);
}

function fireflyRouteHelperTs() {
  return `function isAiyunzhiFireflyDirectGenerationHint(modelHint: string, hint: string, configuredLower: string) {
  // ${marker}: route Aiyunzhi Firefly GPT Image directly instead of through gpt-5.x image_generation tools.
  const text = \`\${modelHint || ''} \${hint || ''} \${configuredLower || ''}\`.toLowerCase();
  const dashed = text.replace(/[\\s_]+/g, '-');
  const compact = text.replace(/[\\s_-]+/g, '');
  if (dashed.includes('gpt-image-2-pro') || compact.includes('gptimage2pro') || dashed.includes('canvas-gpt-image-2-pro')) return false;
  if (configuredLower === 'aiyunzhi-firefly-gpt-image' || configuredLower === 'aiyunzhi-firefly-chat-image') return true;
  if (dashed.includes('firefly-gpt-image')) return true;
  return dashed.includes('aiyunzhi') && (dashed.includes('gpt-image-2') || compact.includes('gptimage2'));
}
`;
}

function fireflyRouteHelperJs() {
  return `function isAiyunzhiFireflyDirectGenerationHint(modelHint, hint, configuredLower) {
    // ${marker}: route Aiyunzhi Firefly GPT Image directly instead of through gpt-5.x image_generation tools.
    const text = \`\${modelHint || ''} \${hint || ''} \${configuredLower || ''}\`.toLowerCase();
    const dashed = text.replace(/[\\s_]+/g, '-');
    const compact = text.replace(/[\\s_-]+/g, '');
    if (dashed.includes('gpt-image-2-pro') || compact.includes('gptimage2pro') || dashed.includes('canvas-gpt-image-2-pro'))
        return false;
    if (configuredLower === 'aiyunzhi-firefly-gpt-image' || configuredLower === 'aiyunzhi-firefly-chat-image')
        return true;
    if (dashed.includes('firefly-gpt-image'))
        return true;
    return dashed.includes('aiyunzhi') && (dashed.includes('gpt-image-2') || compact.includes('gptimage2'));
}
`;
}

function fireflyDirectTs() {
  return `async function submitAiyunzhiFireflyGptImage(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  // ${marker}: direct /v1/chat/completions Firefly image model. No outer gpt-5.x model.
  assertImageModelName(ctx);
  const references = await collectAiyunzhiFireflyDirectDataUrls(ctx);
  if (!references.length && generationModeRequiresImageReference(ctx)) {
    fail(400, '图生图/修图任务没有拿到可用参考图，已阻止降级为纯文生图。请重新上传参考图后再试。', 'IMAGE_REFERENCE_REQUIRED');
  }
  const promptText = [ctx.prompt, ctx.negativePrompt ? \`Negative prompt: \${ctx.negativePrompt}\` : ''].filter(Boolean).join('\\n\\n').trim();
  if (!promptText) fail(400, 'Firefly GPT Image 请求缺少文本提示词', 'PROMPT_REQUIRED');
  const content = [
    ...references.map(url => ({ type: 'image_url', image_url: { url } })),
    { type: 'text', text: promptText },
  ];
  const requestJson = compactJson({
    model: resolveAiyunzhiFireflyDirectModel(ctx),
    stream: true,
    messages: [{ role: 'user', content }],
  });
  const endpoint = resolveEndpointPath(ctx.model.endpointPath || ctx.provider.endpointPath || '/v1/chat/completions', ctx);
  const rawText = await postAiyunzhiFireflyDirectChat(ctx, endpoint, requestJson);
  const upstream = normalizeAiyunzhiFireflyDirectResponse(rawText);
  return normalizeImageSubmit(ctx.provider, upstream, requestJson, resolveImageResponseType(ctx));
}

function resolveAiyunzhiFireflyDirectModel(ctx: AdapterContext) {
  const explicit = String(firstDefined(ctx.params.model, ctx.params.image_model, ctx.params.imageModel, ctx.model.name, ctx.provider.defaultModel) || '').trim();
  const normalizedExplicit = normalizeAiyunzhiFireflyModelGeometry(explicit);
  const explicitModel = validAiyunzhiFireflyDirectModelName(normalizedExplicit);
  if (explicitModel) return explicitModel;
  const base = normalizeAiyunzhiFireflyBaseModel(explicit);
  const resolution = normalizeAiyunzhiFireflyResolution(firstDefined(ctx.params.imageSize, ctx.params.image_size, ctx.params.resolution, ctx.params.requestedResolution, ctx.params.requested_resolution, ctx.params.size));
  const ratio = normalizeAiyunzhiFireflyAspectRatio(firstDefined(ctx.params.aspectRatio, ctx.params.aspect_ratio, ctx.params.requestedRatio, ctx.params.requested_ratio, ctx.params.size, ctx.params.requestedPixelSize, ctx.params.requested_pixel_size));
  return \`\${base}-\${resolution}-\${ratio.replace(':', 'x')}\`;
}

function validAiyunzhiFireflyDirectModelName(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(firefly-gpt-image)-((?:1|2|4)k)-([0-9]+x[0-9]+)$/i);
  if (!match) return '';
  const allowed = new Set(['16x9', '1x1', '21x9', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16']);
  if (!allowed.has(match[3].toLowerCase())) return '';
  return \`\${match[1].toLowerCase()}-\${match[2].toLowerCase()}-\${match[3].toLowerCase()}\`;
}

async function collectAiyunzhiFireflyDirectDataUrls(ctx: AdapterContext) {
  const groups = await collectPublicImageReferenceUrlGroups(ctx, 3500, { allowLocalFiles: true });
  const refs = Array.from(new Set(groups.flat().filter(Boolean)));
  if (refs.length > 6) {
    fail(400, \`Firefly GPT Image 最多支持 6 张参考图，当前 \${refs.length} 张\`, 'IMAGE_REFERENCE_LIMIT_EXCEEDED');
  }
  const dataUrls: string[] = [];
  for (const ref of refs) {
    const dataUrl = await aiyunzhiFireflyReferenceToDataUrl(ref);
    if (dataUrl && !dataUrls.includes(dataUrl)) dataUrls.push(dataUrl);
  }
  if (dataUrls.length > 6) {
    fail(400, \`Firefly GPT Image 最多支持 6 张参考图，当前 \${dataUrls.length} 张\`, 'IMAGE_REFERENCE_LIMIT_EXCEEDED');
  }
  return dataUrls;
}

async function aiyunzhiFireflyReferenceToDataUrl(ref: string) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  if (/^data:image\\/[^;]+;base64,/i.test(raw)) return raw;
  const image = await compatibleImageRefToBlob(raw, 15000, 'Firefly GPT Image ');
  const bytes = Buffer.from(await image.blob.arrayBuffer());
  const mime = normalizeImageMime(image.blob.type || inferImageMimeType(image.filename || raw) || 'image/png');
  return \`data:\${mime};base64,\${bytes.toString('base64')}\`;
}

function normalizeAiyunzhiFireflyBaseModel(value: unknown) {
  const raw = normalizeAiyunzhiFireflyModelGeometry(value);
  const base = raw.replace(/-(?:1|2|4)k-[0-9]+x[0-9]+$/i, '');
  return /^firefly-gpt-image/i.test(base) ? base : 'firefly-gpt-image';
}

function normalizeAiyunzhiFireflyModelGeometry(value: unknown) {
  return String(value || 'firefly-gpt-image').trim().replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i, match => {
    const clean = match.replace(/-(?:1|2|4)k$/i, '');
    return clean;
  }) || 'firefly-gpt-image';
}

function normalizeAiyunzhiFireflyResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '1k';
  if (raw === '4k') return '4k';
  if (raw === '2k') return '2k';
  if (raw === '1k') return '1k';
  if (/^3k$/.test(raw)) fail(400, 'Firefly GPT Image 仅支持 1k、2k、4k，不支持 3k', 'IMAGE_SIZE_UNSUPPORTED');
  const normalized = normalizeResponseTypeResolution(raw);
  if (normalized === '4k') return '4k';
  if (normalized === '2k') return '2k';
  if (normalized === '3k') fail(400, 'Firefly GPT Image 仅支持 1k、2k、4k，不支持 3k', 'IMAGE_SIZE_UNSUPPORTED');
  return '1k';
}

function normalizeAiyunzhiFireflyAspectRatio(value: unknown) {
  const allowed = new Set(['16:9', '1:1', '21:9', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16']);
  let raw = String(value || '').trim().replace('：', ':').replace('×', 'x');
  if (/^\\d+(?:\\.\\d+)?x\\d+(?:\\.\\d+)?$/i.test(raw)) raw = raw.replace(/x/i, ':');
  if (allowed.has(raw)) return raw;
  const match = raw.match(/^(\\d{3,5})\\s*x\\s*(\\d{3,5})$/i) || raw.match(/^(\\d{3,5})\\s*:\\s*(\\d{3,5})$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = nearestAiyunzhiFireflyRatio(width, height);
    if (ratio) return ratio;
  }
  return '16:9';
}

function nearestAiyunzhiFireflyRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  const ratios: Array<[string, number]> = [['16:9', 16 / 9], ['1:1', 1], ['21:9', 21 / 9], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', 3 / 4], ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16]];
  const value = width / height;
  return ratios.slice().sort((a, b) => Math.abs(a[1] - value) - Math.abs(b[1] - value))[0]?.[0] || '';
}

async function postAiyunzhiFireflyDirectChat(ctx: AdapterContext, endpoint: string, requestJson: Prisma.InputJsonValue) {
  const apiKey = await decryptAiyunzhiFireflyProviderKey(ctx.provider);
  const controller = new AbortController();
  const timeoutMs = Number(ctx.timeoutMs || 0);
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${apiKey}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestJson),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const reason = extractAiyunzhiFireflyErrorMessage(text) || response.statusText || 'upstream request failed';
      throw new Error(\`HTTP \${response.status}: \${reason}\`);
    }
    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function decryptAiyunzhiFireflyProviderKey(provider: UpstreamProvider) {
  const plain = String((provider as any)?.apiKey || '').trim();
  if (plain) return plain;
  const encrypted = String(provider.apiKeyEncrypted || '').trim();
  if (!encrypted) fail(400, 'Aiyunzhi Firefly GPT Image 渠道未配置 API Key', 'UPSTREAM_API_KEY_MISSING');
  try {
    const security = await import('../../../security.js');
    const decryptSecret = (security as any).decryptSecret;
    const value = typeof decryptSecret === 'function' ? String(decryptSecret(encrypted) || '').trim() : '';
    if (value) return value;
  } catch (error) {
    throw new Error(\`Aiyunzhi Firefly GPT Image API Key 解密失败：\${error instanceof Error ? error.message : String(error)}\`);
  }
  throw new Error('Aiyunzhi Firefly GPT Image API Key 解密为空');
}

function absolutizeAiyunzhiFireflyEndpoint(ctx: AdapterContext, endpoint: string) {
  const raw = String(endpoint || '').trim() || '/v1/chat/completions';
  if (/^https?:\\/\\//i.test(raw)) return raw;
  const base = String(ctx.provider.baseUrl || 'https://aiyunzhi.top').trim().replace(/\\/+$/, '') || 'https://aiyunzhi.top';
  const path = raw.startsWith('/') ? raw : \`/\${raw}\`;
  if (/\\/v1$/i.test(base) && /^\\/v1\\//i.test(path)) return \`\${base}\${path.slice(3)}\`;
  return \`\${base}\${path}\`;
}

function normalizeAiyunzhiFireflyDirectResponse(rawText: string) {
  const text = String(rawText || '').trim();
  if (!text) return { error: { message: 'Firefly GPT Image 返回为空' } };
  try {
    const payload = JSON.parse(text);
    const url = extractAiyunzhiFireflyImageUrlFromText(JSON.stringify(payload));
    return url ? { data: [{ url }], rawResponse: payload } : payload;
  } catch {
    // Streaming responses are parsed below.
  }
  const chunks: unknown[] = [];
  const textFragments: string[] = [];
  for (const line of text.split(/\\r?\\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const body = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
    if (!body || body === '[DONE]') continue;
    try {
      const payload = JSON.parse(body);
      chunks.push(payload);
      collectAiyunzhiFireflyTextFragments(payload, textFragments);
    } catch {
      textFragments.push(body);
    }
  }
  const combined = textFragments.join('\\n') || text;
  const url = extractAiyunzhiFireflyImageUrlFromText(combined) || extractAiyunzhiFireflyImageUrlFromText(JSON.stringify(chunks));
  if (url) return { data: [{ url }], rawResponse: { chunks, text: combined } };
  return { choices: [{ message: { content: combined } }], rawResponse: { chunks, text: combined } };
}

function collectAiyunzhiFireflyTextFragments(value: unknown, output: string[]) {
  if (value == null) return;
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectAiyunzhiFireflyTextFragments(item, output));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (/content|text|url|uri|image|output|result|delta|message/i.test(key) || isRecord(item) || Array.isArray(item)) {
      collectAiyunzhiFireflyTextFragments(item, output);
    }
  }
}

function extractAiyunzhiFireflyImageUrlFromText(value: unknown) {
  const source = String(value || '').replace(/\\\\\\//g, '/');
  const markdown = source.match(/!\\[[^\\]]*\\]\\((https?:\\/\\/[^)\\s]+)\\)/);
  if (markdown) return cleanAiyunzhiFireflyUrl(markdown[1]);
  const matches = source.match(/https?:\\/\\/[^\\s"'<>\\\\),]+/g) || [];
  const imageUrl = matches.find(url => /\\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url));
  return cleanAiyunzhiFireflyUrl(imageUrl || matches[0] || '');
}

function cleanAiyunzhiFireflyUrl(value: unknown) {
  return String(value || '').trim().replace(/[\\\\)"'\\]}]+$/g, '');
}

function extractAiyunzhiFireflyErrorMessage(text: string) {
  try {
    const payload = JSON.parse(String(text || ''));
    return extractErrorMessage(payload) || JSON.stringify(payload).slice(0, 500);
  } catch {
    return String(text || '').trim().slice(0, 500);
  }
}
`;
}

function fireflyDirectJs() {
  return fireflyDirectTs()
    .replace(/: AdapterContext/g, '')
    .replace(/: Promise<AdapterSubmitResult>/g, '')
    .replace(/: Prisma.InputJsonValue/g, '')
    .replace(/: UpstreamProvider/g, '')
    .replace(/: unknown\[\]/g, '')
    .replace(/: unknown/g, '')
    .replace(/: string\[\]/g, '')
    .replace(/: string/g, '')
    .replace(/: number/g, '')
    .replace(/: Array<\[string, number\]>/g, '')
    .replace(/\\(provider as any\\)/g, 'provider')
    .replace(/\\(security as any\\)/g, 'security')
    .replace(/ as any/g, '')
    .replace(/ as Record<string, unknown>/g, '');
}

function fixFireflyEndpointTs(text) {
  let next = text.replace(/fetch\(endpoint, \{/g, 'fetch(absolutizeAiyunzhiFireflyEndpoint(ctx, endpoint), {');
  if (next.includes('function absolutizeAiyunzhiFireflyEndpoint(')) return next;
  const needle = "function normalizeAiyunzhiFireflyDirectResponse(rawText: string) {\n";
  const helper = `function absolutizeAiyunzhiFireflyEndpoint(ctx: AdapterContext, endpoint: string) {
  const raw = String(endpoint || '').trim() || '/v1/chat/completions';
  if (/^https?:\\/\\//i.test(raw)) return raw;
  const base = String(ctx.provider.baseUrl || 'https://aiyunzhi.top').trim().replace(/\\/+$/, '') || 'https://aiyunzhi.top';
  const path = raw.startsWith('/') ? raw : \`/\${raw}\`;
  if (/\\/v1$/i.test(base) && /^\\/v1\\//i.test(path)) return \`\${base}\${path.slice(3)}\`;
  return \`\${base}\${path}\`;
}

`;
  return next.includes(needle) ? next.replace(needle, `${helper}${needle}`) : next;
}

function fixFireflyEndpointJs(text) {
  let next = text.replace(/fetch\(endpoint, \{/g, 'fetch(absolutizeAiyunzhiFireflyEndpoint(ctx, endpoint), {');
  if (next.includes('function absolutizeAiyunzhiFireflyEndpoint(')) return next;
  const needle = "function normalizeAiyunzhiFireflyDirectResponse(rawText) {\n";
  const fallbackNeedle = "function normalizeAiyunzhiFireflyDirectResponse(rawText) {\n";
  const helper = `function absolutizeAiyunzhiFireflyEndpoint(ctx, endpoint) {
  const raw = String(endpoint || '').trim() || '/v1/chat/completions';
  if (/^https?:\\/\\//i.test(raw)) return raw;
  const base = String(ctx.provider.baseUrl || 'https://aiyunzhi.top').trim().replace(/\\/+$/, '') || 'https://aiyunzhi.top';
  const path = raw.startsWith('/') ? raw : \`/\${raw}\`;
  if (/\\/v1$/i.test(base) && /^\\/v1\\//i.test(path)) return \`\${base}\${path.slice(3)}\`;
  return \`\${base}\${path}\`;
}

`;
  if (next.includes(needle)) return next.replace(needle, `${helper}${needle}`);
  return next.includes(fallbackNeedle) ? next.replace(fallbackNeedle, `${helper}${fallbackNeedle}`) : next;
}

function fixGeneratedFireflyDirectJs(text) {
  return text
    .replace(/\bconst\s+chunks\[\]\s*=/g, 'const chunks =')
    .replace(/\blet\s+chunks\[\]\s*=/g, 'let chunks =')
    .replace(/\bconst\s+textFragments\[\]\s*=/g, 'const textFragments =')
    .replace(/\blet\s+textFragments\[\]\s*=/g, 'let textFragments =');
}

const files = [
  ['src/modules/generation/adapters/registry.ts', patchRegistryTs],
  ['dist/modules/generation/adapters/registry.js', patchRegistryJs],
  ['src/modules/generation/routes.ts', patchRoutesTs],
  ['dist/modules/generation/routes.js', patchRoutesJs],
];

let changed = 0;
for (const [rel, patch] of files) {
  const file = path.join(apiRoot, rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = patch(before, rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-firefly-direct-chat-adapter] patched ${rel}`);
  } else {
    console.log(`[patch-firefly-direct-chat-adapter] unchanged ${rel}`);
  }
}

console.log(`[patch-firefly-direct-chat-adapter] changed=${changed}`);
