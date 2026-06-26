import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'FULLBLOOD_VIDEO_ASPECT_RATIO_PAYLOAD';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-aspectratio-payload-${stamp}`);
}

function patchText(text, rel) {
  if (!text.includes('async function submitFullbloodVideo')) {
    throw new Error(`${rel} missing submitFullbloodVideo; deploy registry adapter fix first`);
  }
  if (text.includes(marker)) return text;

  if (rel.endsWith('.ts')) {
    const needle = `    size: resolveFullbloodVideoSize(ctx),
    seconds: String(resolveFullbloodVideoSeconds(ctx)),
`;
    const insert = `    size: resolveFullbloodVideoSize(ctx),
    // ${marker}: upstream requires camelCase aspectRatio even when size is present.
    aspectRatio: resolveFullbloodVideoAspectRatio(ctx),
    seconds: String(resolveFullbloodVideoSeconds(ctx)),
`;
    if (!text.includes(needle)) throw new Error(`${rel} fullblood TS requestJson needle not found`);
    return text.replace(needle, insert);
  }

  const needle = `        size: resolveFullbloodVideoSize(ctx),
        seconds: String(resolveFullbloodVideoSeconds(ctx)),
`;
  const insert = `        size: resolveFullbloodVideoSize(ctx),
        // ${marker}: upstream requires camelCase aspectRatio even when size is present.
        aspectRatio: resolveFullbloodVideoAspectRatio(ctx),
        seconds: String(resolveFullbloodVideoSeconds(ctx)),
`;
  if (!text.includes(needle)) throw new Error(`${rel} fullblood JS requestJson needle not found`);
  return text.replace(needle, insert);
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
  const after = patchText(before, rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-fullblood-aspectratio-payload] patched ${rel}`);
  } else {
    console.log(`[patch-fullblood-aspectratio-payload] unchanged ${rel}`);
  }
}

console.log(`[patch-fullblood-aspectratio-payload] changed=${changed}`);
