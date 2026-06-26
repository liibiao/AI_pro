import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });
dotenv.config();
loadObjectStorageEnvFile(process.env.OBJECT_STORAGE_ENV_FILE || process.env.CANVAS_OBJECT_STORAGE_ENV_FILE);

function required(name: string, fallback = ''): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/ai_admin_platform?schema=public'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  encryptionSecret: required('ENCRYPTION_SECRET', 'change-this-32-byte-secret-key'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins: (process.env.CORS_ORIGIN || '*').split(',').map(item => item.trim()).filter(Boolean),
  generationMockMode: process.env.GENERATION_MOCK_MODE === 'true',
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 120000),
  generationReconcileEnabled: process.env.GENERATION_RECONCILE_ENABLED !== 'false',
  generationReconcileIntervalMs: Number(process.env.GENERATION_RECONCILE_INTERVAL_MS || 60000),
  generationStaleTaskMinutes: Number(process.env.GENERATION_STALE_TASK_MINUTES || 10),
  generationSubmitStaleTaskMinutes: Number(process.env.GENERATION_SUBMIT_STALE_TASK_MINUTES || 60),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_BASE_URL || process.env.PLATFORM_PUBLIC_BASE_URL || process.env.CANVAS_PUBLIC_BASE_URL || '',
  paymentMode: process.env.PAYMENT_MODE || 'voucher',
  rechargeCreditsPerCny: Number(process.env.RECHARGE_CREDITS_PER_CNY || 100),
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
  },
  objectStorage: {
    provider: process.env.OBJECT_STORAGE_PROVIDER || 's3',
    endpointUrl: process.env.OBJECT_STORAGE_ENDPOINT_URL || '',
    region: process.env.OBJECT_STORAGE_REGION || process.env.AWS_REGION || 'auto',
    bucket: process.env.OBJECT_STORAGE_BUCKET || '',
    publicBaseUrl: process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || '',
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    prefix: process.env.OBJECT_STORAGE_PREFIX || 'uploads',
    maxBytes: Number(process.env.OBJECT_STORAGE_MAX_BYTES || 20 * 1024 * 1024),
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
  },
  generationResultObjectStorageMaxBytes: Number(
    process.env.GENERATION_RESULT_OBJECT_STORAGE_MAX_BYTES
    || process.env.OBJECT_STORAGE_RESULT_MAX_BYTES
    || 80 * 1024 * 1024
  ),
};

function loadObjectStorageEnvFile(filePath: string | undefined) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return;
  const parsed = dotenv.parse(fs.readFileSync(resolved));
  Object.entries(parsed).forEach(([key, value]) => {
    if (!key.startsWith('OBJECT_STORAGE_')) return;
    if (process.env[key] !== undefined) return;
    process.env[key] = value;
  });
}
