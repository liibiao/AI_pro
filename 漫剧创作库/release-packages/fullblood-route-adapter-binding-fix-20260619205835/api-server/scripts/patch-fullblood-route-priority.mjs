import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'FULLBLOOD_ROUTE_PRIORITY_GUARD';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-route-priority-${stamp}`);
}

function patchText(text, file) {
  if (text.includes(marker)) return text;
  if (file.endsWith('.ts')) {
    const needle = "  if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image') return configuredLower;\n";
    const insert = `  // ${marker}: keep canvas_fullblood-video away from seedance/sora heuristics.\n  if (configuredLower === 'fullblood-video' || hint.includes('fullblood-video') || hint.includes('canvas_fullblood-video') || modelHint.includes('fullblood-seedance-2') || modelHint.includes('fullblood-omni-video-2') || modelHint.includes('canvas-fullblood-seedance-2') || modelHint.includes('canvas-fullblood-omni-video-2')) return 'fullblood-video';\n`;
    if (!text.includes(needle)) throw new Error(`route adapter ts needle not found in ${file}`);
    return text.replace(needle, `${needle}${insert}`);
  }
  const needle = "    if (configuredLower === 'openai-responses-image' || configuredLower === 'openai-chat-image')\n        return configuredLower;\n";
  const insert = `    // ${marker}: keep canvas_fullblood-video away from seedance/sora heuristics.\n    if (configuredLower === 'fullblood-video' || hint.includes('fullblood-video') || hint.includes('canvas_fullblood-video') || modelHint.includes('fullblood-seedance-2') || modelHint.includes('fullblood-omni-video-2') || modelHint.includes('canvas-fullblood-seedance-2') || modelHint.includes('canvas-fullblood-omni-video-2'))\n        return 'fullblood-video';\n`;
  if (!text.includes(needle)) throw new Error(`route adapter js needle not found in ${file}`);
  return text.replace(needle, `${needle}${insert}`);
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
    console.log(`[patch-fullblood-route-priority] patched ${rel}`);
  } else {
    console.log(`[patch-fullblood-route-priority] unchanged ${rel}`);
  }
}

console.log(`[patch-fullblood-route-priority] changed=${changed}`);
