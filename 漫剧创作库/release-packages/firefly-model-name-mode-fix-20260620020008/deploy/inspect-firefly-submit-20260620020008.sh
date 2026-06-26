#!/usr/bin/env bash
set -euo pipefail

node --input-type=module - <<'NODE'
import fs from 'node:fs';
for (const file of [
  '/var/www/ai-admin/ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js',
  '/var/www/ai-admin/ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts',
]) {
  const text = fs.readFileSync(file, 'utf8');
  console.log(`\n[inspect-submit] ${file}`);
  for (const needle of ['function submitAiyunzhiFireflyGptImage', 'async function submitAiyunzhiFireflyGptImage', 'buildAiyunzhiFirefly', 'resolveImageModelName', 'modelAssembly']) {
    const idx = text.indexOf(needle);
    console.log(`needle=${needle} idx=${idx}`);
    if (idx >= 0) {
      const start = Math.max(0, idx - 600);
      const end = Math.min(text.length, idx + 4200);
      console.log(text.slice(start, end));
    }
  }
}
NODE
