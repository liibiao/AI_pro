import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-artifex-sd2-adapter-${stamp}`);
}

function replaceFunction(text, functionName, nextFunctionName, replacement, file) {
  const start = text.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${functionName} not found in ${file}`);
  const end = text.indexOf(`\nfunction ${nextFunctionName}`, start);
  if (end < 0) throw new Error(`${nextFunctionName} marker not found in ${file}`);
  const current = text.slice(start, end);
  if (
    current.includes('video-fast-480p') &&
    current.includes('video-pro-480p') &&
    current.includes('sd2-preview') &&
    current.includes('video-${quality}-${resolution}')
  ) {
    return text;
  }
  return `${text.slice(0, start)}${replacement.trimEnd()}\n${text.slice(end)}`;
}

const tsResolveSeedance2ModelName = `
function resolveSeedance2ModelName(ctx: AdapterContext) {
  const sdModel = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim();
  if (/^(?:sd2-(?:720p|1080p)(?:-(?:fast|preview))?|seedance-2)$/i.test(sdModel)) return sdModel.toLowerCase();
  const requestedResolution = [
    ctx.params.resolution,
    ctx.params.quality,
    ctx.params.videoResolution,
    ctx.params.requestedResolution,
  ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '720p' || item === '1080p') || '720p';
  if (/^sd2-fast$/i.test(sdModel)) return \`sd2-\${requestedResolution}-fast\`;
  if (/^sd2-full$/i.test(sdModel)) return \`sd2-\${requestedResolution}\`;
  if (/^sd2-preview$/i.test(sdModel)) return \`sd2-\${requestedResolution}-preview\`;
  if (/^sd2$/i.test(sdModel)) return 'seedance-2';
  const allowed = ['video-fast-480p', 'video-fast-720p', 'video-pro-480p', 'video-pro-720p'];
  const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
  const exact = allowed.find(item => item === raw);
  const legacyRequestedResolution = [
    ctx.params.resolution,
    ctx.params.quality,
    ctx.params.videoResolution,
    ctx.params.requestedResolution,
  ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '480p' || item === '720p');
  if (exact && !legacyRequestedResolution) return exact;
  const key = [
    ctx.params.model,
    ctx.model.name,
    ctx.model.displayName,
    ctx.model.modelKey,
    ctx.provider.defaultModel,
    ctx.provider.name,
  ].map(item => String(item || '').toLowerCase()).join(' ');
  const quality = (exact || raw).includes('pro') || key.includes('pro') || key.includes('高质量') ? 'pro' : 'fast';
  const resolution = legacyRequestedResolution || (key.includes('480p') ? '480p' : '720p');
  return \`video-\${quality}-\${resolution}\`;
}
`;

const jsResolveSeedance2ModelName = `
function resolveSeedance2ModelName(ctx) {
    const sdModel = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim();
    if (/^(?:sd2-(?:720p|1080p)(?:-(?:fast|preview))?|seedance-2)$/i.test(sdModel))
        return sdModel.toLowerCase();
    const requestedResolution = [
        ctx.params.resolution,
        ctx.params.quality,
        ctx.params.videoResolution,
        ctx.params.requestedResolution,
    ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '720p' || item === '1080p') || '720p';
    if (/^sd2-fast$/i.test(sdModel))
        return \`sd2-\${requestedResolution}-fast\`;
    if (/^sd2-full$/i.test(sdModel))
        return \`sd2-\${requestedResolution}\`;
    if (/^sd2-preview$/i.test(sdModel))
        return \`sd2-\${requestedResolution}-preview\`;
    if (/^sd2$/i.test(sdModel))
        return 'seedance-2';
    const allowed = ['video-fast-480p', 'video-fast-720p', 'video-pro-480p', 'video-pro-720p'];
    const raw = String(ctx.params.model || ctx.model.name || ctx.provider.defaultModel || '').trim().toLowerCase();
    const exact = allowed.find(item => item === raw);
    const legacyRequestedResolution = [
        ctx.params.resolution,
        ctx.params.quality,
        ctx.params.videoResolution,
        ctx.params.requestedResolution,
    ].map(item => String(item || '').trim().toLowerCase()).find(item => item === '480p' || item === '720p');
    if (exact && !legacyRequestedResolution)
        return exact;
    const key = [
        ctx.params.model,
        ctx.model.name,
        ctx.model.displayName,
        ctx.model.modelKey,
        ctx.provider.defaultModel,
        ctx.provider.name,
    ].map(item => String(item || '').toLowerCase()).join(' ');
    const quality = (exact || raw).includes('pro') || key.includes('pro') || key.includes('高质量') ? 'pro' : 'fast';
    const resolution = legacyRequestedResolution || (key.includes('480p') ? '480p' : '720p');
    return \`video-\${quality}-\${resolution}\`;
}
`;

const files = [
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    replacement: tsResolveSeedance2ModelName,
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    replacement: jsResolveSeedance2ModelName,
  },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = replaceFunction(before, 'resolveSeedance2ModelName', 'isSeedance2FullModelName', item.replacement, item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-artifex-sd2] patched ${item.rel}`);
  } else {
    console.log(`[patch-artifex-sd2] unchanged ${item.rel}`);
  }
}

console.log(`[patch-artifex-sd2] changed=${changed}`);
