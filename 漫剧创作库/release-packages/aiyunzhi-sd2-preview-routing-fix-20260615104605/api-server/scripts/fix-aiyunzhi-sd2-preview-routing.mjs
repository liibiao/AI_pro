import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const files = [
  'src/modules/generation/adapters/registry.ts',
  'dist/modules/generation/adapters/registry.js',
];

const replacements = [
  {
    label: 'model-name matcher',
    oldPattern: '/^(?:sd2-(?:720p|1080p)(?:-fast)?|seedance-2)$/i',
    newPattern: '/^(?:sd2-(?:720p|1080p)(?:-fast)?(?:-preview)?|seedance-2)$/i',
  },
  {
    label: 'aiyunzhi protocol matcher',
    oldPattern: '/(?:^|\\s)(?:sd2-(?:720p|1080p)(?:-fast)?|seedance-2)(?:\\s|$)/',
    newPattern: '/(?:^|\\s)(?:sd2-(?:720p|1080p)(?:-fast)?(?:-preview)?|seedance-2)(?:\\s|$)/',
  },
];

let patched = 0;

for (const rel of files) {
  const file = path.join(apiRoot, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`missing file: ${rel}`);
  }
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const replacement of replacements) {
    if (after.includes(replacement.newPattern)) {
      console.log(`[fix-aiyunzhi-sd2-preview-routing] already patched ${replacement.label} in ${rel}`);
      continue;
    }
    if (!after.includes(replacement.oldPattern)) {
      throw new Error(`target pattern not found for ${replacement.label} in ${rel}`);
    }
    after = after.split(replacement.oldPattern).join(replacement.newPattern);
  }
  for (const replacement of replacements) {
    if (!after.includes(replacement.newPattern)) {
      throw new Error(`patch verification failed for ${replacement.label} in ${rel}`);
    }
  }
  if (after === before) {
    console.log(`[fix-aiyunzhi-sd2-preview-routing] unchanged ${rel}`);
    continue;
  }
  fs.copyFileSync(file, `${file}.bak-aiyunzhi-sd2-preview-routing-${stamp}`);
  fs.writeFileSync(file, after);
  patched += 1;
  console.log(`[fix-aiyunzhi-sd2-preview-routing] patched ${rel}`);
}

const previewRegex = /^(?:sd2-(?:720p|1080p)(?:-fast)?(?:-preview)?|seedance-2)$/i;
const checks = [
  'sd2-720p-preview',
  'sd2-720p-fast-preview',
  'sd2-1080p-preview',
  'sd2-720p',
  'seedance-2',
];
for (const value of checks) {
  if (!previewRegex.test(value)) {
    throw new Error(`preview route check failed for ${value}`);
  }
}

console.log(`[fix-aiyunzhi-sd2-preview-routing] done patched=${patched}`);
