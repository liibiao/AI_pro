import crypto from 'node:crypto';
import { config } from '../../config.js';
import { fail } from '../../http.js';

type AlipayPrecreateInput = {
  orderNo: string;
  amountCents: number;
  subject: string;
};

export type AlipayRuntimeConfig = {
  appId: string;
  gateway: string;
  privateKey: string;
  publicKey: string;
  notifyUrl: string;
};

function formatTimestamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeKey(value: string, type: 'PRIVATE KEY' | 'PUBLIC KEY') {
  const raw = value.replace(/\\n/g, '\n').trim();
  if (!raw) return '';
  if (raw.includes('BEGIN')) return raw;
  const lines = raw.match(/.{1,64}/g)?.join('\n') || raw;
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
}

function signParams(params: Record<string, string>, alipay: AlipayRuntimeConfig) {
  const content = signatureContent(params);
  return crypto.sign('RSA-SHA256', Buffer.from(content, 'utf8'), normalizeKey(alipay.privateKey, 'PRIVATE KEY')).toString('base64');
}

export function signatureContent(params: Record<string, string>) {
  return Object.keys(params)
    .filter(key => key !== 'sign' && key !== 'sign_type' && params[key] !== undefined && params[key] !== '')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
}

export function verifyAlipayNotify(params: Record<string, string>, alipay: AlipayRuntimeConfig = config.alipay) {
  if (!alipay.publicKey) return false;
  const sign = params.sign || '';
  const content = signatureContent(params);
  try {
    return crypto.verify('RSA-SHA256', Buffer.from(content, 'utf8'), normalizeKey(alipay.publicKey, 'PUBLIC KEY'), Buffer.from(sign, 'base64'));
  } catch {
    return false;
  }
}

export function amountCentsToYuan(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export async function createAlipayPrecreate(input: AlipayPrecreateInput, alipay: AlipayRuntimeConfig = config.alipay) {
  if (!alipay.appId || !alipay.privateKey || !alipay.notifyUrl) {
    fail(500, '支付宝参数未配置完整', 'ALIPAY_NOT_CONFIGURED');
  }

  const bizContent = {
    out_trade_no: input.orderNo,
    total_amount: amountCentsToYuan(input.amountCents),
    subject: input.subject,
    timeout_express: '30m',
  };
  const params: Record<string, string> = {
    app_id: alipay.appId,
    method: 'alipay.trade.precreate',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatTimestamp(),
    version: '1.0',
    notify_url: alipay.notifyUrl,
    biz_content: JSON.stringify(bizContent),
  };
  params.sign = signParams(params, alipay);

  const resp = await fetch(alipay.gateway || config.alipay.gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await resp.json() as Record<string, unknown>;
  const result = data.alipay_trade_precreate_response as { code?: string; msg?: string; sub_msg?: string; qr_code?: string } | undefined;
  if (!resp.ok || !result || result.code !== '10000' || !result.qr_code) {
    fail(502, result?.sub_msg || result?.msg || '支付宝预下单失败', 'ALIPAY_PRECREATE_FAILED');
  }
  return result.qr_code;
}
