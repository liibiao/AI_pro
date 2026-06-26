import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-artifex-seedance2-helper-${stamp}`);
}

function insertBefore(text, marker, insertion, file) {
  if (text.includes('function isArtifexSeedance2Channel')) return text;
  const index = text.indexOf(marker);
  if (index < 0) throw new Error(`marker not found in ${file}: ${marker}`);
  return `${text.slice(0, index)}${insertion.trimEnd()}\n\n${text.slice(index)}`;
}

const tsHelper = `
function isArtifexSeedance2ModelName(modelName: string) {
  return [
    'seedance-2-fast',
    'seedance-2',
    'seedance-2-pro-1080p',
    'video-fast-480p',
    'video-fast-720p',
    'video-pro-480p',
    'video-pro-720p',
    'video-pro-1080p',
  ].includes(String(modelName || '').trim().toLowerCase());
}

function isArtifexSeedance2Channel(ctx: AdapterContext, modelName = resolveSeedance2ModelName(ctx)) {
  const providerKey = String(ctx.provider.providerKey || '').trim().toLowerCase();
  return ['artifex-seedance2-fast', 'artifex-seedance2', 'artifex-seedance2-pro-1080p'].includes(providerKey)
    || isArtifexSeedance2ModelName(modelName);
}
`;

const jsHelper = `
function isArtifexSeedance2ModelName(modelName) {
    return [
        'seedance-2-fast',
        'seedance-2',
        'seedance-2-pro-1080p',
        'video-fast-480p',
        'video-fast-720p',
        'video-pro-480p',
        'video-pro-720p',
        'video-pro-1080p',
    ].includes(String(modelName || '').trim().toLowerCase());
}
function isArtifexSeedance2Channel(ctx, modelName = resolveSeedance2ModelName(ctx)) {
    const providerKey = String(ctx.provider.providerKey || '').trim().toLowerCase();
    return ['artifex-seedance2-fast', 'artifex-seedance2', 'artifex-seedance2-pro-1080p'].includes(providerKey)
        || isArtifexSeedance2ModelName(modelName);
}
`;

const files = [
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    marker: '\nfunction isSeedance2FullModelName(modelName: string)',
    insertion: tsHelper,
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    marker: '\nfunction isSeedance2FullModelName(modelName)',
    insertion: jsHelper,
  },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = insertBefore(before, item.marker, item.insertion, item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-artifex-seedance2-helper] patched ${item.rel}`);
  } else {
    console.log(`[patch-artifex-seedance2-helper] unchanged ${item.rel}`);
  }
}

console.log(`[patch-artifex-seedance2-helper] changed=${changed}`);
