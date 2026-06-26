import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { config } from './config.js';

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function makeInitialPassword() {
  return crypto.randomBytes(6).toString('base64url');
}

export function signToken(payload: { id: string; role: UserRole; nickname: string; status: string }) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as { id: string; role: UserRole; nickname: string; status: string };
}

export function signEnterpriseUserToken(payload: { id: string; enterpriseId: string; role: string; nickname: string; status: string }) {
  return jwt.sign({ ...payload, kind: 'ENTERPRISE_USER' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
}

export function verifyEnterpriseUserToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as { kind?: string; id: string; enterpriseId: string; role: 'ENTERPRISE_ADMIN' | 'ENTERPRISE_VIEWER'; nickname: string; status: string };
}

export function makeApiToken(prefix: 'sk_live' | 'ent_live') {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashApiToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function apiTokenPrefix(token: string) {
  return token.slice(0, 16);
}

function encryptionKey() {
  return crypto.createHash('sha256').update(config.encryptionSecret).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}
