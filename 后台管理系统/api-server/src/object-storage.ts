import crypto from 'node:crypto';
import path from 'node:path';
import type { Request } from 'express';
import { config } from './config.js';
import { fail } from './http.js';

type UploadFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  size: number;
  fields: Record<string, string>;
};

type UploadResult = {
  key: string;
  url: string;
  contentType: string;
  size: number;
  provider: string;
  filename: string;
};

type BrowserUploadTarget = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
  contentType: string;
  size: number;
  provider: string;
  filename: string;
  expiresInSeconds: number;
};

export async function uploadRequestFileToObjectStorage(req: Request, input: { userId: string; mode?: string }) {
  const file = await readUploadFile(req, config.objectStorage.maxBytes);
  return uploadObjectStorageBuffer({
    userId: input.userId,
    buffer: file.buffer,
    filename: file.filename,
    contentType: file.contentType,
  });
}

export async function uploadObjectStorageBuffer(input: {
  userId: string;
  buffer: Buffer;
  filename: string;
  contentType?: string;
  maxBytes?: number;
}): Promise<UploadResult> {
  assertObjectStorageConfigured();
  const maxBytes = Number.isFinite(Number(input.maxBytes)) && Number(input.maxBytes) > 0
    ? Number(input.maxBytes)
    : config.objectStorage.maxBytes;
  if (input.buffer.length > maxBytes) {
    fail(413, `上传文件超过大小限制：${Math.round(maxBytes / 1024 / 1024)}MB`, 'OBJECT_STORAGE_FILE_TOO_LARGE');
  }
  const contentType = input.contentType || inferContentType(input.filename);
  const key = objectKey(input.userId, input.filename);
  const target = buildObjectUrl(key);
  const provider = config.objectStorage.provider.toLowerCase();
  const headers = provider === 'cos' || provider === 'tencent_cos'
    ? signTencentCosPut(target.uploadUrl, input.buffer.length, contentType)
    : signAwsS3Put(target.uploadUrl, input.buffer, contentType);
  const resp = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers,
    body: input.buffer as unknown as BodyInit,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    fail(resp.status >= 500 ? 502 : 400, `对象存储上传失败 HTTP ${resp.status}${detail ? `：${detail.slice(0, 240)}` : ''}`, 'OBJECT_STORAGE_UPLOAD_FAILED');
  }
  return {
    key,
    url: target.publicUrl,
    contentType,
    size: input.buffer.length,
    provider: config.objectStorage.provider,
    filename: input.filename,
  };
}

export function createObjectStorageBrowserUploadTarget(input: {
  userId: string;
  filename: string;
  contentType?: string;
  size?: number;
}): BrowserUploadTarget {
  assertObjectStorageConfigured();
  const size = Number(input.size || 0);
  if (Number.isFinite(size) && size > config.objectStorage.maxBytes) {
    fail(413, `上传文件超过大小限制：${Math.round(config.objectStorage.maxBytes / 1024 / 1024)}MB`, 'OBJECT_STORAGE_FILE_TOO_LARGE');
  }
  const provider = config.objectStorage.provider.toLowerCase();
  if (provider !== 'cos' && provider !== 'tencent_cos') {
    fail(400, '当前对象存储暂不支持浏览器直传，请继续使用后台上传', 'OBJECT_STORAGE_DIRECT_UPLOAD_UNSUPPORTED');
  }
  const filename = sanitizeFilename(input.filename || 'upload.bin');
  const contentType = input.contentType || inferContentType(filename);
  const key = objectKey(input.userId, filename);
  const target = buildObjectUrl(key);
  const uploadUrl = signTencentCosPutUrl(target.uploadUrl);
  return {
    key,
    uploadUrl: uploadUrl.toString(),
    publicUrl: target.publicUrl,
    headers: {},
    contentType,
    size,
    provider: config.objectStorage.provider,
    filename,
    expiresInSeconds: 900,
  };
}

export async function readUploadFile(req: Request, maxBytes = config.objectStorage.maxBytes): Promise<UploadFile> {
  const contentType = String(req.headers['content-type'] || '');
  const body = await readRequestBody(req, maxBytes);
  if (/multipart\/form-data/i.test(contentType)) {
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
    if (!boundary) fail(400, 'multipart 上传缺少 boundary', 'UPLOAD_BOUNDARY_MISSING');
    return parseMultipart(body, boundary);
  }
  if (!body.length) fail(400, '上传文件为空', 'UPLOAD_FILE_EMPTY');
  return {
    buffer: body,
    filename: sanitizeFilename(String(req.query.filename || req.headers['x-file-name'] || 'upload.bin')),
    contentType: contentType || 'application/octet-stream',
    size: body.length,
    fields: {},
  };
}

async function readRequestBody(req: Request, maxBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) fail(413, `上传文件超过大小限制：${Math.round(maxBytes / 1024 / 1024)}MB`, 'UPLOAD_FILE_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(body: Buffer, boundary: string): UploadFile {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let cursor = body.indexOf(boundaryBuffer);
  while (cursor >= 0) {
    let partStart = cursor + boundaryBuffer.length;
    if (body.slice(partStart, partStart + 2).toString() === '--') break;
    if (body.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;
    const nextBoundary = body.indexOf(boundaryBuffer, partStart);
    if (nextBoundary < 0) break;
    let part = body.slice(partStart, nextBoundary);
    if (part.length >= 2 && part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > 0) {
      const headersText = part.slice(0, headerEnd).toString('utf8');
      const data = part.slice(headerEnd + 4);
      const headers = parsePartHeaders(headersText);
      const disposition = headers['content-disposition'] || '';
      const name = disposition.match(/\bname="([^"]+)"/i)?.[1] || '';
      const filename = disposition.match(/\bfilename="([^"]*)"/i)?.[1] || '';
      if (filename) {
        if (!data.length) fail(400, '上传文件为空', 'UPLOAD_FILE_EMPTY');
        return {
          buffer: data,
          filename: sanitizeFilename(filename),
          contentType: headers['content-type'] || inferContentType(filename),
          size: data.length,
          fields,
        };
      }
      if (name) fields[name] = data.toString('utf8');
    }
    cursor = nextBoundary;
  }
  fail(400, 'multipart 请求中未找到文件字段', 'UPLOAD_FILE_MISSING');
}

function parsePartHeaders(headersText: string) {
  const headers: Record<string, string> = {};
  headersText.split(/\r\n/).forEach(line => {
    const index = line.indexOf(':');
    if (index <= 0) return;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  });
  return headers;
}

function assertObjectStorageConfigured() {
  const missing = [
    ['OBJECT_STORAGE_ENDPOINT_URL', config.objectStorage.endpointUrl],
    ['OBJECT_STORAGE_ACCESS_KEY_ID', config.objectStorage.accessKeyId],
    ['OBJECT_STORAGE_SECRET_ACCESS_KEY', config.objectStorage.secretAccessKey],
    ['OBJECT_STORAGE_BUCKET', config.objectStorage.bucket],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    fail(500, `S3/R2/COS 上传缺少配置：${missing.join(' / ')}`, 'OBJECT_STORAGE_CONFIG_MISSING');
  }
}

function objectKey(userId: string, filename: string) {
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('/');
  const ext = safeExt(filename);
  const prefix = config.objectStorage.prefix.replace(/^\/+|\/+$/g, '');
  const user = sanitizeSegment(userId || 'anonymous');
  const random = crypto.randomBytes(8).toString('hex');
  return [prefix, user, datePath, `${Date.now().toString(36)}-${random}${ext}`].filter(Boolean).join('/');
}

function buildObjectUrl(key: string) {
  const endpoint = new URL(config.objectStorage.endpointUrl);
  const bucket = config.objectStorage.bucket;
  const forcePathStyle = config.objectStorage.forcePathStyle;
  const hostHasBucket = endpoint.hostname === bucket || endpoint.hostname.startsWith(`${bucket}.`);
  const uploadUrl = new URL(endpoint.toString());
  if (forcePathStyle) {
    uploadUrl.pathname = joinUrlPath(endpoint.pathname, bucket, key);
  } else {
    uploadUrl.hostname = hostHasBucket ? endpoint.hostname : `${bucket}.${endpoint.hostname}`;
    uploadUrl.pathname = joinUrlPath(endpoint.pathname, key);
  }
  uploadUrl.search = '';
  const publicUrl = config.objectStorage.publicBaseUrl
    ? `${config.objectStorage.publicBaseUrl.replace(/\/+$/, '')}/${encodeKeyPath(key)}`
    : uploadUrl.toString();
  return { uploadUrl, publicUrl };
}

function signTencentCosPut(url: URL, bodyLength: number, contentType: string) {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 900;
  const keyTime = `${now};${expires}`;
  const signKey = hmac('sha1', config.objectStorage.secretAccessKey, keyTime, 'hex');
  const canonicalUri = encodeCanonicalPath(url.pathname);
  const httpString = ['put', canonicalUri, '', `host=${url.host}`, ''].join('\n');
  const stringToSign = ['sha1', keyTime, sha1Hex(httpString), ''].join('\n');
  const signature = hmac('sha1', signKey, stringToSign, 'hex');
  const authorization = [
    'q-sign-algorithm=sha1',
    `q-ak=${config.objectStorage.accessKeyId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  return {
    Authorization: authorization,
    'Content-Type': contentType,
    'Content-Length': String(bodyLength),
  };
}

function signTencentCosPutUrl(url: URL) {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 900;
  const keyTime = `${now};${expires}`;
  const signKey = hmac('sha1', config.objectStorage.secretAccessKey, keyTime, 'hex');
  const canonicalUri = encodeCanonicalPath(url.pathname);
  const httpString = ['put', canonicalUri, '', `host=${url.host}`, ''].join('\n');
  const stringToSign = ['sha1', keyTime, sha1Hex(httpString), ''].join('\n');
  const signature = hmac('sha1', signKey, stringToSign, 'hex');
  const signedUrl = new URL(url.toString());
  signedUrl.searchParams.set('q-sign-algorithm', 'sha1');
  signedUrl.searchParams.set('q-ak', config.objectStorage.accessKeyId);
  signedUrl.searchParams.set('q-sign-time', keyTime);
  signedUrl.searchParams.set('q-key-time', keyTime);
  signedUrl.searchParams.set('q-header-list', 'host');
  signedUrl.searchParams.set('q-url-param-list', '');
  signedUrl.searchParams.set('q-signature', String(signature));
  return signedUrl;
}

function signAwsS3Put(url: URL, body: Buffer, contentType: string) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = config.objectStorage.region || 'auto';
  const service = 's3';
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(key => `${key}:${headers[key]}\n`).join('');
  const canonicalRequest = [
    'PUT',
    encodeCanonicalPath(url.pathname),
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = awsSigningKey(config.objectStorage.secretAccessKey, dateStamp, region, service);
  const signature = hmac('sha256', signingKey, stringToSign, 'hex');
  return {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.objectStorage.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': contentType,
    'Content-Length': String(body.length),
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
}

function awsSigningKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac('sha256', `AWS4${secret}`, dateStamp);
  const kRegion = hmac('sha256', kDate, region);
  const kService = hmac('sha256', kRegion, service);
  return hmac('sha256', kService, 'aws4_request');
}

function hmac(algorithm: 'sha1' | 'sha256', key: crypto.BinaryLike | crypto.KeyObject, value: string, encoding?: crypto.BinaryToTextEncoding) {
  const digest = crypto.createHmac(algorithm, key).update(value).digest();
  return encoding ? digest.toString(encoding) : digest;
}

function sha1Hex(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function sha256Hex(value: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function joinUrlPath(...parts: string[]) {
  return `/${parts.join('/').split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

function encodeKeyPath(key: string) {
  return key.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function encodeCanonicalPath(pathname: string) {
  return `/${pathname.split('/').filter(Boolean).map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/')}`;
}

function sanitizeFilename(filename: string) {
  const base = path.basename(filename || 'upload.bin').replace(/[^\w.\-()\u4e00-\u9fa5]+/g, '_');
  return base || 'upload.bin';
}

function sanitizeSegment(value: string) {
  return String(value || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function safeExt(filename: string) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function inferContentType(filename: string) {
  const ext = safeExt(filename);
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}
