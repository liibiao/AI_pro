import type { Prisma, SystemSettingValueType } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { decryptSecret, encryptSecret } from '../../security.js';

export type SystemSettingDefinition = {
  key: string;
  label: string;
  group: string;
  valueType: SystemSettingValueType;
  isSecret?: boolean;
  defaultValue: string;
  remark?: string;
};

export type PaymentMode = 'mock' | 'alipay' | 'voucher';

export const systemSettingDefinitions: SystemSettingDefinition[] = [
  { key: 'payment.mode', label: '支付模式', group: 'payment', valueType: 'STRING', defaultValue: config.paymentMode, remark: 'mock、alipay 或 voucher；voucher 表示兑换码线下支付' },
  { key: 'recharge.credits_per_cny', label: '每元充值积分', group: 'payment', valueType: 'NUMBER', defaultValue: String(config.rechargeCreditsPerCny) },
  { key: 'alipay.app_id', label: '支付宝 App ID', group: 'alipay', valueType: 'STRING', defaultValue: config.alipay.appId },
  { key: 'alipay.gateway', label: '支付宝网关', group: 'alipay', valueType: 'STRING', defaultValue: config.alipay.gateway },
  { key: 'alipay.notify_url', label: '支付宝异步回调地址', group: 'alipay', valueType: 'STRING', defaultValue: config.alipay.notifyUrl },
  { key: 'alipay.private_key', label: '应用私钥', group: 'alipay', valueType: 'SECRET', isSecret: true, defaultValue: config.alipay.privateKey },
  { key: 'alipay.public_key', label: '支付宝公钥', group: 'alipay', valueType: 'SECRET', isSecret: true, defaultValue: config.alipay.publicKey },
  { key: 'generation.mock_mode', label: '生成 Mock 模式', group: 'generation', valueType: 'BOOLEAN', defaultValue: String(config.generationMockMode) },
  { key: 'upstream.timeout_ms', label: '上游超时毫秒', group: 'generation', valueType: 'NUMBER', defaultValue: String(config.upstreamTimeoutMs) },
];

const definitionMap = new Map(systemSettingDefinitions.map(item => [item.key, item]));

export function getSystemSettingDefinition(key: string) {
  return definitionMap.get(key);
}

export async function listSystemSettings() {
  const rows = await prisma.systemSetting.findMany();
  const rowMap = new Map(rows.map(row => [row.key, row]));
  return systemSettingDefinitions.map(def => {
    const row = rowMap.get(def.key);
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      valueType: def.valueType,
      isSecret: Boolean(def.isSecret),
      value: def.isSecret ? '' : row?.value ?? def.defaultValue,
      hasValue: Boolean(row?.value || def.defaultValue),
      remark: def.remark,
      updatedAt: row?.updatedAt || null,
    };
  });
}

export async function upsertSystemSetting(tx: Prisma.TransactionClient, key: string, rawValue: string) {
  const def = getSystemSettingDefinition(key);
  if (!def) return null;
  const value = def.isSecret ? encryptSecret(rawValue) : rawValue;
  return tx.systemSetting.upsert({
    where: { key },
    update: {
      label: def.label,
      group: def.group,
      value,
      valueType: def.valueType,
      isSecret: Boolean(def.isSecret),
      remark: def.remark,
    },
    create: {
      key,
      label: def.label,
      group: def.group,
      value,
      valueType: def.valueType,
      isSecret: Boolean(def.isSecret),
      remark: def.remark,
    },
  });
}

async function settingValue(key: string) {
  const def = getSystemSettingDefinition(key);
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row?.value) return def?.defaultValue || '';
  return row.isSecret ? decryptSecret(row.value) : row.value;
}

function asNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: string, fallback: boolean) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function normalizePaymentMode(value: string): PaymentMode {
  if (value === 'alipay') return 'alipay';
  if (value === 'voucher') return 'voucher';
  return 'mock';
}

export async function getPaymentRuntimeSettings() {
  const paymentMode = await settingValue('payment.mode');
  const creditsRaw = await settingValue('recharge.credits_per_cny');
  return {
    paymentMode: normalizePaymentMode(paymentMode),
    rechargeCreditsPerCny: asNumber(creditsRaw, config.rechargeCreditsPerCny),
    alipay: {
      appId: await settingValue('alipay.app_id'),
      gateway: await settingValue('alipay.gateway'),
      notifyUrl: await settingValue('alipay.notify_url'),
      privateKey: await settingValue('alipay.private_key'),
      publicKey: await settingValue('alipay.public_key'),
    },
  };
}

export async function getGenerationRuntimeSettings() {
  return {
    generationMockMode: asBoolean(await settingValue('generation.mock_mode'), config.generationMockMode),
    upstreamTimeoutMs: asNumber(await settingValue('upstream.timeout_ms'), config.upstreamTimeoutMs),
  };
}
