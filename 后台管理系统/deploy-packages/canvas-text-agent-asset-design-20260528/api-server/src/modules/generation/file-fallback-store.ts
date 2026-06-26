const FILE_FALLBACK_TTL_MS = 6 * 60 * 60 * 1000;
const fileFallbackUrls = new Map<string, { url: string; expiresAt: number }>();
const pendingFileFallbackUrls = new Map<string, { promise: Promise<string>; expiresAt: number }>();

export function rememberUploadedFileFallback(fileId: string, url: string) {
  const id = String(fileId || '').trim();
  const publicUrl = String(url || '').trim();
  if (!/^file-[\w-]+$/i.test(id) || !/^https?:\/\//i.test(publicUrl)) return;
  fileFallbackUrls.set(id, { url: publicUrl, expiresAt: Date.now() + FILE_FALLBACK_TTL_MS });
  pruneExpiredFileFallbacks();
}

export function rememberUploadedFileFallbackPromise(fileId: string, promise: Promise<string>) {
  const id = String(fileId || '').trim();
  if (!/^file-[\w-]+$/i.test(id)) return;
  const wrapped = promise
    .then(url => {
      const publicUrl = String(url || '').trim();
      if (/^https?:\/\//i.test(publicUrl)) rememberUploadedFileFallback(id, publicUrl);
      return publicUrl;
    })
    .catch(() => '')
    .finally(() => {
      pendingFileFallbackUrls.delete(id);
    });
  pendingFileFallbackUrls.set(id, { promise: wrapped, expiresAt: Date.now() + FILE_FALLBACK_TTL_MS });
  pruneExpiredFileFallbacks();
}

export function getUploadedFileFallbackUrl(fileId: string) {
  const id = String(fileId || '').trim();
  const entry = fileFallbackUrls.get(id);
  if (!entry) return '';
  if (entry.expiresAt <= Date.now()) {
    fileFallbackUrls.delete(id);
    return '';
  }
  return entry.url;
}

export async function getUploadedFileFallbackUrlAsync(fileId: string, timeoutMs = 15000) {
  const existing = getUploadedFileFallbackUrl(fileId);
  if (existing) return existing;
  const id = String(fileId || '').trim();
  const pending = pendingFileFallbackUrls.get(id);
  if (!pending) return '';
  if (pending.expiresAt <= Date.now()) {
    pendingFileFallbackUrls.delete(id);
    return '';
  }
  const timeout = new Promise<string>(resolve => setTimeout(() => resolve(''), Math.max(1000, timeoutMs)));
  const publicUrl = await Promise.race([pending.promise, timeout]);
  return getUploadedFileFallbackUrl(id) || publicUrl || '';
}

function pruneExpiredFileFallbacks() {
  const now = Date.now();
  for (const [id, entry] of fileFallbackUrls.entries()) {
    if (entry.expiresAt <= now) fileFallbackUrls.delete(id);
  }
  for (const [id, entry] of pendingFileFallbackUrls.entries()) {
    if (entry.expiresAt <= now) pendingFileFallbackUrls.delete(id);
  }
}
