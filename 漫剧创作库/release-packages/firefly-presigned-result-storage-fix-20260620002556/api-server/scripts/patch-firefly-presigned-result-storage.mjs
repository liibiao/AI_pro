import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'FIREFLY_PRESIGNED_RESULT_STORAGE_FIX';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-firefly-presigned-storage-${stamp}`);
}

function patchRegistry(text, rel) {
  let next = text;
  const beforeImageResultTs = `  if (responseType === 'provider_url' || responseType === 'server_object_storage') {
    if (directUrl) return directUrl;
    if (result.b64) return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
    return '';
  }
`;
  const afterImageResultTs = `  // ${marker}: server_object_storage must persist provider temporary image URLs, including Firefly S3 presigned URLs without file extensions.
  if (responseType === 'provider_url') {
    if (directUrl) return directUrl;
    if (result.b64) return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
    return '';
  }
  if (responseType === 'server_object_storage') {
    if (directUrl) return materializeImageResultUrl(provider, directUrl);
    if (result.b64) return persistInlineImage(result.b64, result.mimeType || 'image/png');
    return '';
  }
`;
  if (next.includes(beforeImageResultTs)) {
    next = next.replace(beforeImageResultTs, afterImageResultTs);
  } else {
    const beforeImageResultJs = `    if (responseType === 'provider_url' || responseType === 'server_object_storage') {
        if (directUrl)
            return directUrl;
        if (result.b64)
            return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
        return '';
    }
`;
    const afterImageResultJs = `    // ${marker}: server_object_storage must persist provider temporary image URLs, including Firefly S3 presigned URLs without file extensions.
    if (responseType === 'provider_url') {
        if (directUrl)
            return directUrl;
        if (result.b64)
            return inlineImageDataUrl(result.b64, result.mimeType || 'image/png');
        return '';
    }
    if (responseType === 'server_object_storage') {
        if (directUrl)
            return materializeImageResultUrl(provider, directUrl);
        if (result.b64)
            return persistInlineImage(result.b64, result.mimeType || 'image/png');
        return '';
    }
`;
    if (next.includes(beforeImageResultJs)) next = next.replace(beforeImageResultJs, afterImageResultJs);
    else if (!next.includes(marker)) throw new Error(`imageResultUrl server_object_storage block not found in ${rel}`);
  }

  const beforeResolveTs = `  if (responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'base64') return absolutizeProviderUrls(provider, clean);
  return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
`;
  const afterResolveTs = `  if (responseType === 'server_object_storage') return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
  if (responseType === 'provider_url' || responseType === 'base64') return absolutizeProviderUrls(provider, clean);
  return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
`;
  if (next.includes(beforeResolveTs)) {
    next = next.replace(beforeResolveTs, afterResolveTs);
  } else {
    const beforeResolveJs = `    if (responseType === 'provider_url' || responseType === 'server_object_storage' || responseType === 'base64')
        return absolutizeProviderUrls(provider, clean);
    return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
`;
    const afterResolveJs = `    if (responseType === 'server_object_storage')
        return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
    if (responseType === 'provider_url' || responseType === 'base64')
        return absolutizeProviderUrls(provider, clean);
    return materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean));
`;
    if (next.includes(beforeResolveJs)) next = next.replace(beforeResolveJs, afterResolveJs);
    else if (!next.includes("if (responseType === 'server_object_storage')") || !next.includes('materializeImageResultUrls(provider, absolutizeProviderUrls(provider, clean))')) {
      throw new Error(`resolveImageResultUrls server_object_storage block not found in ${rel}`);
    }
  }

  return next;
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
  const after = patchRegistry(before, rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-firefly-presigned-result-storage] patched ${rel}`);
  } else {
    console.log(`[patch-firefly-presigned-result-storage] unchanged ${rel}`);
  }
}

console.log(`[patch-firefly-presigned-result-storage] changed=${changed}`);
