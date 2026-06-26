import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-route-adapter-${stamp}`);
}

function patchText(text, file) {
  const earlyReturnTs = "  if (configuredLower === 'fullblood-video' || hint.includes('fullblood-video') || hint.includes('canvas_fullblood-video') || modelHint.includes('fullblood-seedance-2') || modelHint.includes('fullblood-omni-video-2')) return 'fullblood-video';\n";
  const earlyReturnJs = "    if (configuredLower === 'fullblood-video' || hint.includes('fullblood-video') || hint.includes('canvas_fullblood-video') || modelHint.includes('fullblood-seedance-2') || modelHint.includes('fullblood-omni-video-2'))\n        return 'fullblood-video';\n";
  if (text.includes("return 'fullblood-video';")) return text;
  if (file.endsWith('.ts')) {
    const needle = "  if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image') return configuredLower;\n";
    if (!text.includes(needle)) throw new Error(`route adapter ts needle not found in ${file}`);
    return text.replace(needle, `${needle}${earlyReturnTs}`);
  }
  const needle = "    if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image')\n        return configuredLower;\n";
  if (!text.includes(needle)) throw new Error(`route adapter js needle not found in ${file}`);
  return text.replace(needle, `${needle}${earlyReturnJs}`);
}

const files = [
  'src/modules/generation/routes.ts',
  'dist/modules/generation/routes.js',
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
    console.log(`[patch-fullblood-route-adapter] patched ${rel}`);
  } else {
    console.log(`[patch-fullblood-route-adapter] unchanged ${rel}`);
  }
}

console.log(`[patch-fullblood-route-adapter] changed=${changed}`);
