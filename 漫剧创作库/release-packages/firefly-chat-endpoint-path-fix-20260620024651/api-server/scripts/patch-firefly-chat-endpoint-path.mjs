import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'AIYUNZHI_FIREFLY_CHAT_ENDPOINT_PATH';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-firefly-chat-endpoint-${stamp}`);
}

function patchFile(file, options = {}) {
  const full = path.join(apiRoot, file);
  const required = options.required === true;
  if (!fs.existsSync(full)) {
    if (required) throw new Error(`required file not found: ${file}`);
    console.log(`[patch-firefly-chat-endpoint] skip missing optional file ${file}`);
    return false;
  }
  const before = fs.readFileSync(full, 'utf8');
  if (!before.includes('submitAiyunzhiFireflyGptImage')) {
    if (required) throw new Error(`Firefly submitter not found in required file ${file}`);
    console.log(`[patch-firefly-chat-endpoint] skip optional file without Firefly submitter ${file}`);
    return false;
  }
  let after = before;
  after = after.replace(
    /const endpoint = resolveEndpointPath\(ctx\.model\.endpointPath \|\| ctx\.provider\.endpointPath \|\| '\/v1\/chat\/completions', ctx\);/g,
    'const endpoint = resolveEndpointPath(resolveAiyunzhiFireflyEndpointPath(ctx), ctx);',
  );
  if (!after.includes('resolveAiyunzhiFireflyEndpointPath(ctx)')) {
    throw new Error(`Firefly endpoint expression was not patched in ${file}`);
  }
  if (!after.includes(`// ${marker}`)) {
    const helper = file.endsWith('.ts') ? tsHelper() : jsHelper();
    const insertBefore = after.indexOf('async function callAiyunzhiFireflyJson');
    if (insertBefore < 0) throw new Error(`callAiyunzhiFireflyJson needle not found in ${file}`);
    after = `${after.slice(0, insertBefore)}${helper}\n\n${after.slice(insertBefore)}`;
  }
  if (after !== before) {
    backup(full);
    fs.writeFileSync(full, after);
    console.log(`[patch-firefly-chat-endpoint] patched ${file}`);
    return true;
  }
  console.log(`[patch-firefly-chat-endpoint] unchanged ${file}`);
  return false;
}

function tsHelper() {
  return `function resolveAiyunzhiFireflyEndpointPath(ctx: AdapterContext) {
  // ${marker}: Firefly Chat API must use /v1/chat/completions even if legacy image endpoints remain in top-level fields.
  const modelAny = ctx.model as any;
  const providerAny = ctx.provider as any;
  const protocol = fireflyEndpointRecord(firstDefined(modelAny.protocol, providerAny.protocol));
  const candidates = [
    protocol.endpointPath,
    protocol.endpoint_path,
    modelAny.endpointPath,
    modelAny.endpoint_path,
    providerAny.endpointPath,
    providerAny.endpoint_path,
    '/v1/chat/completions',
  ];
  for (const value of candidates) {
    const normalized = normalizeAiyunzhiFireflyEndpointPath(value);
    if (normalized) return normalized;
  }
  return '/v1/chat/completions';
}

function normalizeAiyunzhiFireflyEndpointPath(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/\\/v1\\/chat\\/completions$/i.test(raw) || /\\/chat\\/completions$/i.test(raw)) return raw;
  if (/\\/images\\/(?:generations|edits)$/i.test(raw)) return '/v1/chat/completions';
  return raw;
}

function fireflyEndpointRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}`;
}

function jsHelper() {
  return `function resolveAiyunzhiFireflyEndpointPath(ctx) {
    // ${marker}: Firefly Chat API must use /v1/chat/completions even if legacy image endpoints remain in top-level fields.
    const modelAny = ctx.model;
    const providerAny = ctx.provider;
    const protocol = fireflyEndpointRecord(firstDefined(modelAny.protocol, providerAny.protocol));
    const candidates = [
        protocol.endpointPath,
        protocol.endpoint_path,
        modelAny.endpointPath,
        modelAny.endpoint_path,
        providerAny.endpointPath,
        providerAny.endpoint_path,
        '/v1/chat/completions',
    ];
    for (const value of candidates) {
        const normalized = normalizeAiyunzhiFireflyEndpointPath(value);
        if (normalized)
            return normalized;
    }
    return '/v1/chat/completions';
}
function normalizeAiyunzhiFireflyEndpointPath(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/\\/v1\\/chat\\/completions$/i.test(raw) || /\\/chat\\/completions$/i.test(raw))
        return raw;
    if (/\\/images\\/(?:generations|edits)$/i.test(raw))
        return '/v1/chat/completions';
    return raw;
}
function fireflyEndpointRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}`;
}

patchFile('src/modules/generation/adapters/registry.ts', { required: false });
patchFile('dist/modules/generation/adapters/registry.js', { required: true });
