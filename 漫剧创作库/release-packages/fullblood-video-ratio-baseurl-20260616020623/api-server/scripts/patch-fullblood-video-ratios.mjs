import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-video-ratios-${stamp}`);
}

function replaceFunction(text, functionName, nextFunctionName, replacement, file) {
  const start = text.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${functionName} not found in ${file}`);
  const end = text.indexOf(`\nfunction ${nextFunctionName}`, start);
  if (end < 0) throw new Error(`${nextFunctionName} marker not found in ${file}`);
  const current = text.slice(start, end);
  if (current.includes("'21:9'") && current.includes('1680x720')) return text;
  return `${text.slice(0, start)}${replacement.trimEnd()}\n${text.slice(end)}`;
}

function patchAllowedRatios(text, file) {
  const tsNeedle = "normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['16:9', '9:16'], '16:9')";
  const tsReplacement = "normalizeAllowedString(ctx.params.aspectRatio || ctx.params.aspect_ratio || ctx.params.requestedRatio, ['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'], '16:9')";
  if (text.includes(tsReplacement)) return text;
  if (!text.includes(tsNeedle)) throw new Error(`fullblood allowed ratios target not found in ${file}`);
  return text.replace(tsNeedle, tsReplacement);
}

const tsFunction = `
function fullbloodVideoSize(aspectRatio: string) {
  const sizes: Record<string, string> = {
    '9:16': '720x1280',
    '16:9': '1280x720',
    '4:3': '960x720',
    '3:4': '720x960',
    '1:1': '720x720',
    '21:9': '1680x720',
  };
  return sizes[aspectRatio] || '1280x720';
}
`;

const jsFunction = `
function fullbloodVideoSize(aspectRatio) {
    const sizes = {
        '9:16': '720x1280',
        '16:9': '1280x720',
        '4:3': '960x720',
        '3:4': '720x960',
        '1:1': '720x720',
        '21:9': '1680x720',
    };
    return sizes[aspectRatio] || '1280x720';
}
`;

const files = [
  { rel: 'src/modules/generation/adapters/registry.ts', replacement: tsFunction },
  { rel: 'dist/modules/generation/adapters/registry.js', replacement: jsFunction },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  let after = replaceFunction(before, 'fullbloodVideoSize', 'fullbloodVideoMetadata', item.replacement, item.rel);
  after = patchAllowedRatios(after, item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-fullblood-video-ratios] patched ${item.rel}`);
  } else {
    console.log(`[patch-fullblood-video-ratios] unchanged ${item.rel}`);
  }
}

console.log(`[patch-fullblood-video-ratios] changed=${changed}`);
