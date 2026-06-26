import { rm, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests');
const outDir = path.join(rootDir, 'node_modules/.tmp/autumn-tests');

async function findTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return findTestFiles(fullPath);
      }

      return entry.isFile() && entry.name.endsWith('.test.ts') ? [fullPath] : [];
    }),
  );

  return files.flat();
}

const testFiles = await findTestFiles(testsDir);

if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await build({
  assetNames: 'assets/[name]-[hash]',
  bundle: true,
  entryNames: '[dir]/[name]',
  entryPoints: testFiles,
  format: 'esm',
  loader: {
    '.png': 'file',
    '.svg': 'file',
  },
  outbase: testsDir,
  outdir: outDir,
  platform: 'node',
  target: 'node22',
});

for (const testFile of testFiles) {
  const relativePath = path.relative(testsDir, testFile).replace(/\.ts$/, '.js');
  await import(pathToFileURL(path.join(outDir, relativePath)).href);
}
