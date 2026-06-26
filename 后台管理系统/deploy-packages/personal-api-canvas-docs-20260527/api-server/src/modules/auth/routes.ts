import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { hashPassword, signToken, verifyPassword } from '../../security.js';
import { normalizeEmail, normalizeLoginAccount, normalizeNickname, normalizePhone } from '../../identity-normalize.js';
import { bindInvitedCustomer } from '../agent-credit/service.js';
import { buildCreditDiscountBenefit } from '../../billing.js';

const router = Router();
const loginFailures = new Map<string, { count: number; firstAt: number }>();
const loginWindowMs = 15 * 60_000;
const maxLoginFailures = 10;

const registerSchema = z.object({
  phone: z.preprocess(normalizePhone, z.string().min(6).optional()),
  email: z.preprocess(normalizeEmail, z.string().email().optional()),
  password: z.string().min(6),
  nickname: z.preprocess(value => normalizeNickname(value), z.string().min(1)).default('新用户'),
  agentId: z.preprocess(value => normalizeOptionalString(value), z.string().min(1).optional()),
});

router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (!body.phone && !body.email) fail(400, '手机号和邮箱至少填写一个', 'ACCOUNT_REQUIRED');
  const exists = await prisma.user.findFirst({
    where: { OR: [{ phone: body.phone || undefined }, { email: body.email || undefined }] },
  });
  if (exists) fail(409, '账号已存在', 'ACCOUNT_EXISTS');
  const sessionId = newSessionId();
  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({
      data: {
        phone: body.phone,
        email: body.email,
        nickname: body.nickname,
        passwordHash: await hashPassword(body.password),
        currentSessionId: sessionId,
      },
    });
    await tx.wallet.create({ data: { userId: created.id, balance: 0 } });
    if (body.agentId) {
      await bindInvitedCustomer(tx, {
        agentId: body.agentId,
        userId: created.id,
        customerPhone: created.phone,
        customerName: created.nickname,
      });
      return { ...created, agentId: body.agentId };
    }
    return created;
  });
  const token = signToken({ id: user.id, role: user.role, nickname: user.nickname, status: user.status, sessionId });
  ok(res, { token, user: publicUser(user) });
}));

const loginSchema = z.object({
  account: z.preprocess(normalizeLoginAccount, z.string().min(1)),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  account: z.preprocess(normalizeLoginAccount, z.string().min(1)),
});

router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const failureKey = loginFailureKey(req.ip, body.account);
  assertLoginAllowed(failureKey);
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: body.account }, { email: body.account.toLowerCase() }] },
  });
  if (!user) {
    recordLoginFailure(failureKey);
    fail(401, '账号或密码错误', 'INVALID_LOGIN');
  }
  if (user.status !== 'ACTIVE') {
    recordLoginFailure(failureKey);
    fail(403, '账号已被禁用', 'USER_DISABLED');
  }
  const matched = await verifyPassword(body.password, user.passwordHash);
  if (!matched) {
    recordLoginFailure(failureKey);
    fail(401, '账号或密码错误', 'INVALID_LOGIN');
  }
  loginFailures.delete(failureKey);
  const sessionId = newSessionId();
  await prisma.user.update({ where: { id: user.id }, data: { currentSessionId: sessionId } });
  const token = signToken({ id: user.id, role: user.role, nickname: user.nickname, status: user.status, sessionId });
  ok(res, { token, user: publicUser(user) });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const body = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: body.account }, { email: body.account.toLowerCase() }] },
    select: { id: true, status: true },
  });
  // Do not reveal whether the account exists. Passwords are hash-only; recovery is completed by an admin reset.
  if (user?.status === 'ACTIVE') {
    console.log(`[auth] password reset requested for user=${user.id}`);
  }
  ok(res, { message: '如果账号存在，请联系管理员在后台用户管理中重置密码。' });
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  if (req.user?.sessionId) {
    await prisma.user.updateMany({
      where: { id: req.user.id, currentSessionId: req.user.sessionId },
      data: { currentSessionId: null },
    });
  }
  ok(res);
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { wallet: true, memberships: { include: { plan: true }, orderBy: { expiredAt: 'desc' }, take: 1 } },
  });
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  const membership = user.memberships.find(item => item.expiredAt > new Date()) || null;
  ok(res, { user: publicUser(user), wallet: user.wallet, membership, pricingBenefit: buildCreditDiscountBenefit(membership) });
}));

function publicUser(user: { id: string; phone: string | null; email: string | null; nickname: string; role: string; status: string; agentId?: string | null }) {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
    status: user.status,
    agentId: user.agentId || null,
  };
}

function loginFailureKey(ip: string | undefined, account: string) {
  return `${ip || 'unknown'}:${account.toLowerCase()}`;
}

function normalizeOptionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function newSessionId() {
  return crypto.randomBytes(24).toString('base64url');
}

function assertLoginAllowed(key: string) {
  const item = loginFailures.get(key);
  if (!item) return;
  if (Date.now() - item.firstAt > loginWindowMs) {
    loginFailures.delete(key);
    return;
  }
  if (item.count >= maxLoginFailures) fail(429, '登录失败次数过多，请稍后再试', 'LOGIN_RATE_LIMITED');
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginFailures.get(key);
  if (!current || now - current.firstAt > loginWindowMs) {
    loginFailures.set(key, { count: 1, firstAt: now });
    return;
  }
  loginFailures.set(key, { count: current.count + 1, firstAt: current.firstAt });
}

export default router;
