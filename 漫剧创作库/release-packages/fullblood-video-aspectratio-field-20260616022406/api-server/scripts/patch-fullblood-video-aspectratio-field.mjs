import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-aspectratio-${stamp}`);
}

function patchRequestJson(text, rel) {
  if (text.includes('size: configuredSize || fullbloodVideoSize(aspectRatio),\n    aspectRatio,\n    seconds: String(seconds),')
    || text.includes('size: configuredSize || fullbloodVideoSize(aspectRatio),\n        aspectRatio,\n        seconds: String(seconds),')) {
    return text;
  }
  const tsNeedle = 'size: configuredSize || fullbloodVideoSize(aspectRatio),\n    seconds: String(seconds),';
  const tsReplacement = 'size: configuredSize || fullbloodVideoSize(aspectRatio),\n    aspectRatio,\n    seconds: String(seconds),';
  if (text.includes(tsNeedle)) return text.replace(tsNeedle, tsReplacement);
  const jsNeedle = 'size: configuredSize || fullbloodVideoSize(aspectRatio),\n        seconds: String(seconds),';
  const jsReplacement = 'size: configuredSize || fullbloodVideoSize(aspectRatio),\n        aspectRatio,\n        seconds: String(seconds),';
  if (text.includes(jsNeedle)) return text.replace(jsNeedle, jsReplacement);
  throw new Error(`fullblood requestJson target not found in ${rel}`);
}

const files = [
  'src/modules/generation/adapters/registry.ts',
  'dist/modules/generation/adapters/registry.js',
];

let changed = 0;
for (const rel of files) {
  const file = path.join(apiRoot, rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = patchRequestJson(before, rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-fullblood-aspectratio] patched ${rel}`);
  } else {
    console.log(`[patch-fullblood-aspectratio] unchanged ${rel}`);
  }
}

console.log(`[patch-fullblood-aspectratio] changed=${changed}`);
