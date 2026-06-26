import http from 'node:http';
import https from 'node:https';
import type { UpstreamProvider } from '@prisma/client';
import { config } from './config.js';
import { HttpError, fail } from './http.js';
import { decryptSecret } from './security.js';

type UpstreamQuery = Record<string, string | number | boolean | undefined>;

type UpstreamCallOptions = {
  method: 'GET' | 'POST';
  payload?: unknown;
  query?: UpstreamQuery;
  allowDisabled?: boolean;
  timeoutMs?: number;
  multipart?: boolean;
};

export function buildEndpoint(baseUrl: string, endpointPath: string) {
  const endpoint = String(endpointPath || '').trim();
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) fail(400, `上游 API Base URL 为空，无法请求 ${endpoint || '未配置端点'}`, 'PROVIDER_BASE_URL_MISSING');
  if (!/^https?:\/\//i.test(base)) {
    fail(400, `上游 API Base URL 非法：${base}。请配置为 https://... 开头的完整地址`, 'PROVIDER_BASE_URL_INVALID');
  }
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (base.endsWith('/v1') && path.startsWith('/v1/')) path = path.slice(3);
  return `${base}${path}`;
}

export async function callUpstreamJson(provider: UpstreamProvider, endpointPath: string, payload: unknown, timeoutMs?: number) {
  return callUpstream(provider, endpointPath, { method: 'POST', payload, timeoutMs });
}

export async function callUpstreamMultipart(provider: UpstreamProvider, endpointPath: string, form: FormData, timeoutMs?: number) {
  return callUpstream(provider, endpointPath, { method: 'POST', payload: form, timeoutMs, multipart: true });
}

export async function callUpstreamGetJson(provider: UpstreamProvider, endpointPath: string, query: UpstreamQuery = {}, timeoutMs?: number) {
  return callUpstream(provider, endpointPath, { method: 'GET', query, timeoutMs });
}

export async function testUpstreamProvider(provider: UpstreamProvider, endpointPath: string, options: Omit<UpstreamCallOptions, 'allowDisabled'>) {
  return callUpstream(provider, endpointPath, { ...options, allowDisabled: true });
}

async function callUpstream(provider: UpstreamProvider, endpointPath: string, options: UpstreamCallOptions) {
  if (!options.allowDisabled && provider.status !== 'ACTIVE') fail(400, '上游渠道未启用', 'PROVIDER_DISABLED');
  const apiKey = decryptSecret(provider.apiKeyEncrypted);
  if (!apiKey) fail(400, '上游 API Key 未配置', 'PROVIDER_KEY_MISSING');

  const url = new URL(buildEndpoint(provider.baseUrl, endpointPath));
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (options.method === 'POST' && !options.multipart) headers['Content-Type'] = 'application/json';
  headers.Accept = 'application/json';
  if (url.protocol === 'https:') headers.Connection = 'close';
  const attempts = upstreamHttpAttempts(options);
  let lastHttpError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: options.method,
        headers,
        ...(options.method === 'POST' ? { body: options.multipart ? options.payload as BodyInit : JSON.stringify(options.payload || {}) } : {}),
      }, options.timeoutMs);
      const data = await readUpstreamJson(resp);
      if (!resp.ok) {
        if (isRecoverableImageSuccessPayload(endpointPath, data)) return data;
        const message = String(data?.error?.message || data?.error || data?.message || `上游请求失败 HTTP ${resp.status}`);
        const err = new HttpError(resp.status >= 500 ? 502 : 400, message, 'UPSTREAM_ERROR') as HttpError & { responseJson?: unknown; upstreamStatus?: number };
        err.responseJson = data;
        err.upstreamStatus = resp.status;
        throw err;
      }
      return data;
    } catch (err) {
      lastHttpError = err;
      if (attempt >= attempts || !isRetryableUpstreamHttpError(err)) throw err;
      await delay(900 * attempt);
    }
  }
  throw lastHttpError;
}

async function readUpstreamJson(resp: Response) {
  try {
    const text = await resp.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch (err) {
    if (isRetryableUpstreamNetworkError(err)) throw err;
    return {};
  }
}

function isRecoverableImageSuccessPayload(endpointPath: string, payload: any) {
  if (!/\/images\//i.test(String(endpointPath || ''))) return false;
  if (!payload || typeof payload !== 'object') return false;
  if (hasMeaningfulPayloadError(payload?.error ?? payload?.response?.error)) return false;
  const status = String(payload?.status || payload?.response?.status || '').trim().toLowerCase();
  if (status && !['completed', 'success', 'succeeded', 'done'].includes(status)) return false;
  const result = extractImageResult(payload);
  return Boolean(result.url || result.b64);
}

function hasMeaningfulPayloadError(error: unknown) {
  if (error === undefined || error === null || error === false) return false;
  if (typeof error === 'string') return error.trim() !== '' && error.trim() !== 'null';
  if (typeof error !== 'object') return true;
  const item = error as Record<string, unknown>;
  const message = String(item.message || item.error || '').trim();
  const code = String(item.code || '').trim();
  return Boolean(message || code);
}

function upstreamHttpAttempts(options: UpstreamCallOptions) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method === 'GET') return 3;
  if (options.timeoutMs === 0) return 1;
  if (options.multipart) return 2;
  return 3;
}

function isRetryableUpstreamHttpError(err: unknown) {
  if (err instanceof HttpError) {
    return err.status >= 500 && /stream disconnected|disconnected before completion|premature close|socket hang up|connection reset|temporarily unavailable|gateway timeout|bad gateway|upstream request timeout|timeout/i.test(err.message);
  }
  return isRetryableUpstreamNetworkError(err);
}

async function fetchWithTimeout(input: URL, init: RequestInit, timeoutMs = config.upstreamTimeoutMs) {
  const attempts = upstreamFetchAttempts(init, timeoutMs);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const useTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const controller = useTimeout ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const requestInit = { ...init, ...(controller ? { signal: controller.signal } : {}) };
      return useTimeout ? await fetch(input, requestInit) : await fetchWithoutImplicitTimeout(input, requestInit);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        fail(504, `上游请求超时（${timeoutMs}ms）`, 'UPSTREAM_TIMEOUT');
      }
      lastError = err;
      if (attempt >= attempts || !isRetryableUpstreamNetworkError(err)) break;
      await delay(600 * attempt);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const retryText = attempts > 1 ? `（已重试 ${attempts - 1} 次）` : '';
  fail(502, `上游网络请求失败${retryText}：${formatFetchError(lastError)}`, 'UPSTREAM_NETWORK_ERROR');
}

function fetchWithoutImplicitTimeout(input: URL, init: RequestInit) {
  const body = nodeHttpRequestBody(init.body);
  if (init.body !== undefined && body === undefined) return fetch(input, init);
  const transport = input.protocol === 'https:' ? https : http;
  const headers = normalizeRequestHeaders(init.headers);
  if (body !== undefined && !hasHeader(headers, 'content-length')) {
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(input, {
      method: init.method || 'GET',
      headers,
      timeout: 0,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        resolve(new Response(Buffer.concat(chunks) as unknown as BodyInit, {
          status: res.statusCode || 0,
          statusText: res.statusMessage,
          headers: normalizeResponseHeaders(res.headers),
        }));
      });
    });
    req.setTimeout(0);
    req.on('error', reject);
    if (init.signal) {
      if (init.signal.aborted) {
        req.destroy(new DOMException('Aborted', 'AbortError'));
        return;
      }
      init.signal.addEventListener('abort', () => req.destroy(new DOMException('Aborted', 'AbortError')), { once: true });
    }
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function nodeHttpRequestBody(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return undefined;
}

function normalizeRequestHeaders(headers: RequestInit['headers']) {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => { result[key] = value; });
    return result;
  }
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => { result[String(key).toLowerCase()] = String(value); });
    return result;
  }
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined) result[key.toLowerCase()] = String(value);
  });
  return result;
}

function normalizeResponseHeaders(headers: http.IncomingHttpHeaders) {
  const result: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) result[key] = value.join(', ');
    else if (value !== undefined) result[key] = String(value);
  });
  return result;
}

function hasHeader(headers: Record<string, string>, name: string) {
  const key = name.toLowerCase();
  return Object.keys(headers).some(item => item.toLowerCase() === key);
}

function upstreamFetchAttempts(init: RequestInit, timeoutMs?: number) {
  const method = String(init.method || 'GET').toUpperCase();
  if (method !== 'GET' && timeoutMs === 0) return 1;
  return method === 'GET' ? 3 : 2;
}

function isRetryableUpstreamNetworkError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const cause = (err as Error & { cause?: { code?: string; name?: string; message?: string } }).cause;
  const code = String(cause?.code || '').toUpperCase();
  if (['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET_CLOSED'].includes(code)) return true;
  return /fetch failed|socket|network|connection|disconnected|terminated|premature close|socket hang up|tls|ssl|econnreset|timeout/i.test(`${err.message} ${cause?.message || ''}`);
}

function formatFetchError(err: unknown) {
  if (!(err instanceof Error)) return String(err || '未知网络错误');
  const cause = (err as Error & { cause?: { code?: string; name?: string; message?: string } }).cause;
  const detail = [cause?.code, cause?.message].filter(Boolean).join(': ');
  return detail && detail !== err.message ? `${err.message}（${detail}）` : err.message;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractImageResult(payload: any) {
  const first = Array.isArray(payload?.data) ? payload.data[0] : payload?.result || payload;
  const directUrl = String(first?.url || first?.image_url || payload?.url || '').trim();
  const directB64 = String(first?.b64_json || first?.b64 || '').trim();
  const directMime = String(first?.mimeType || first?.mime_type || first?.mime || '').trim();
  const nested = findNestedImageResult(payload);
  return {
    url: directUrl || nested.url,
    b64: normalizeBase64Image(directB64 || nested.b64),
    mimeType: directMime || nested.mimeType || 'image/png',
  };
}

function findNestedImageResult(payload: unknown) {
  const result = { url: '', b64: '', mimeType: 'image/png' };
  const visit = (value: unknown, key = '', parent?: Record<string, unknown>) => {
    if (!value || result.url && result.b64) return;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!result.url && /url|uri|image_url|output/i.test(key) && /^(https?:\/\/|\/v1\/(?:images\/results|files)\/)/i.test(raw)) result.url = raw;
      if (!result.url && /content|text|message/i.test(key)) {
        const dataUrl = raw.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\s_-]+/i)?.[0] || '';
        const imageUrl = raw.match(/https?:\/\/[^\s"'<>)]*(?:\/v1\/images\/results\/|[^\s"'<>)]*\.(?:png|jpe?g|webp|gif))(?:[^\s"'<>)]*)?/i)?.[0] || '';
        if (dataUrl || imageUrl) result.url = dataUrl || imageUrl;
      }
      if (!result.b64 && /b64_json|b64|base64/i.test(key)) result.b64 = raw;
      const parentMime = String(parent?.mimeType || parent?.mime_type || parent?.mime || parent?.contentType || parent?.content_type || '');
      const parentType = String(parent?.type || '').trim();
      if (!result.b64 && key === 'result' && parentType === 'image_generation_call' && looksLikeBase64Image(raw)) {
        result.b64 = raw;
        result.mimeType = imageMimeFromOutputFormat(parent?.output_format || parent?.outputFormat || parentMime);
      }
      if (!result.b64 && /data|inlineData|inline_data/i.test(key) && /^image\//i.test(parentMime)) {
        result.b64 = raw;
        result.mimeType = parentMime;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key, parent));
      return;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const mime = String(obj.mimeType || obj.mime_type || obj.mime || obj.contentType || obj.content_type || '');
      if (mime && /^image\//i.test(mime)) result.mimeType = mime;
      if (!result.b64 && mime && /^image\//i.test(mime) && typeof obj.data === 'string') result.b64 = obj.data;
      const inline = obj.inlineData || obj.inline_data;
      if (inline && typeof inline === 'object') visit(inline, 'inlineData', obj);
      Object.entries(obj).forEach(([itemKey, item]) => visit(item, itemKey, obj));
    }
  };
  visit(payload);
  return result;
}

function looksLikeBase64Image(value: string) {
  const raw = String(value || '').trim();
  if (/^data:image\/[^;]+;base64,/i.test(raw)) return true;
  return raw.length > 100 && /^[A-Za-z0-9+/=_-]+$/.test(raw);
}

function imageMimeFromOutputFormat(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('image/')) return raw;
  if (raw === 'jpg' || raw === 'jpeg') return 'image/jpeg';
  if (raw === 'webp') return 'image/webp';
  if (raw === 'gif') return 'image/gif';
  return 'image/png';
}

function normalizeBase64Image(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^data:image\/[^;]+;base64,(.+)$/i);
  return (match ? match[1] : raw).replace(/\s+/g, '');
}

export function extractVideoTask(payload: any) {
  return String(payload?.taskId || payload?.task_id || payload?.id || payload?.data?.taskId || payload?.data?.id || '').trim();
}

export function extractUpstreamTaskId(payload: any) {
  const first = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  return String(
    payload?.taskId ||
    payload?.task_id ||
    payload?.task?.taskId ||
    payload?.task?.task_id ||
    payload?.result?.taskId ||
    payload?.result?.task_id ||
    first?.taskId ||
    first?.task_id ||
    first?.id ||
    ''
  ).trim();
}

export function extractVideoResultUrl(payload: any) {
  return String(
    payload?.url ||
    payload?.video_url ||
    payload?.videoUrl ||
    payload?.output_url ||
    payload?.downloadUrl ||
    payload?.data?.url ||
    payload?.data?.video_url ||
    payload?.data?.videoUrl ||
    payload?.data?.output_url ||
    ''
  ).trim();
}

export function extractChatText(payload: any) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  return String(choice?.message?.content || choice?.text || payload?.text || '').trim();
}
