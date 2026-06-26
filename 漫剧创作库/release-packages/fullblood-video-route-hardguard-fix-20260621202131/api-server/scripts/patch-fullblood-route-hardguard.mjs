import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'FULLBLOOD_ROUTE_HARD_GUARD';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-fullblood-route-hardguard-${stamp}`);
}

function patchText(text, rel) {
  if (text.includes(marker)) return text;

  const needle = rel.endsWith('.ts')
    ? `  const hint = [
    provider.providerKey,
    provider.name,
    model.modelKey,
    model.name,
    model.displayName,
    configured,
  ].join(' ').toLowerCase();
`
    : `    const hint = [
        provider.providerKey,
        provider.name,
        model.modelKey,
        model.name,
        model.displayName,
        configured,
    ].join(' ').toLowerCase();
`;

  const insert = rel.endsWith('.ts')
    ? `  // ${marker}: canvas fullblood routes must win before seedance/sora/configured-adapter heuristics.
  if (
    configuredLower === 'fullblood-video' ||
    hint.includes('canvas_fullblood-video') ||
    hint.includes('fullblood-video') ||
    hint.includes('fullblood-seedance-2') ||
    hint.includes('fullblood-omni-video-2') ||
    hint.includes('canvas-fullblood-seedance-2') ||
    hint.includes('canvas-fullblood-omni-video-2') ||
    hint.includes('全能视频2.0(线路s)') ||
    (hint.includes('全能视频2.0') && hint.includes('满血')) ||
    (hint.includes('seedance-2.0') && hint.includes('满血'))
  ) return 'fullblood-video';
`
    : `    // ${marker}: canvas fullblood routes must win before seedance/sora/configured-adapter heuristics.
    if (configuredLower === 'fullblood-video' ||
        hint.includes('canvas_fullblood-video') ||
        hint.includes('fullblood-video') ||
        hint.includes('fullblood-seedance-2') ||
        hint.includes('fullblood-omni-video-2') ||
        hint.includes('canvas-fullblood-seedance-2') ||
        hint.includes('canvas-fullblood-omni-video-2') ||
        hint.includes('全能视频2.0(线路s)') ||
        (hint.includes('全能视频2.0') && hint.includes('满血')) ||
        (hint.includes('seedance-2.0') && hint.includes('满血')))
        return 'fullblood-video';
`;

  if (!text.includes(needle)) throw new Error(`${rel} route hint needle not found`);
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
    console.log(`[patch-fullblood-route-hardguard] patched ${rel}`);
  } else {
    console.log(`[patch-fullblood-route-hardguard] unchanged ${rel}`);
  }
}

console.log(`[patch-fullblood-route-hardguard] changed=${changed}`);
