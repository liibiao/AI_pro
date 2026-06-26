import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { applyWalletDelta } from '../../billing.js';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { requireEnterpriseUserAuth } from '../../open-auth.js';
import { apiTokenPrefix, hashApiToken, hashPassword, makeApiToken, makeInitialPassword, signEnterpriseUserToken, verifyPassword } from '../../security.js';
import { adminRoles } from '../../types.js';

const adminRouter = Router();
const enterpriseRouter = Router();

const createEnterpriseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  remark: z.string().trim().optional(),
  adminEmail: z.string().email().optional(),
  adminPhone: z.string().trim().min(6).optional(),
  adminNickname: z.string().trim().min(1).default('企业管理员'),
  adminPassword: z.string().min(6).optional(),
});

adminRouter.get('/accounts', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.enterpriseAccount.findMany({
    include: { billingUser: { include: { wallet: true } }, users: true, tokens: true },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, { items });
}));

adminRouter.post('/accounts', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = createEnterpriseSchema.parse(req.body || {});
  if (!body.adminEmail && !body.adminPhone) fail(400, '企业登录邮箱或手机号至少填写一个', 'ENTERPRISE_LOGIN_REQUIRED');
  const initialPassword = body.adminPassword || makeInitialPassword();
  const result = await prisma.$transaction(async tx => {
    const billingUser = await tx.user.create({
      data: {
        email: `enterprise-billing-${Date.now()}-${Math.random().toString(36).slice(2)}@internal.local`,
        passwordHash: await hashPassword(makeInitialPassword()),
        nickname: `${body.name}（企业结算）`,
        role: 'USER',
      },
    });
    await tx.wallet.create({ data: { userId: billingUser.id, balance: 0 } });
    const enterprise = await tx.enterpriseAccount.create({
      data: { name: body.name, remark: body.remark, billingUserId: billingUser.id, createdById: req.user!.id },
    });
    const enterpriseUser = await tx.enterpriseUser.create({
      data: {
        enterpriseId: enterprise.id,
        email: body.adminEmail?.toLowerCase(),
        phone: body.adminPhone,
        nickname: body.adminNickname,
        passwordHash: await hashPassword(initialPassword),
      },
    });
    return { enterprise, enterpriseUser, billingUser };
  });
  ok(res, { ...result, ...(body.adminPassword ? {} : { initialPassword }) });
}));

const tokenSchema = z.object({ name: z.string().trim().min(1).max(80).default('生产环境 Token'), expiredAt: z.string().datetime().optional().nullable() });

adminRouter.post('/accounts/:id/tokens', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = tokenSchema.parse(req.body || {});
  const enterprise = await prisma.enterpriseAccount.findUnique({ where: { id: routeParam(req.params.id) } });
  if (!enterprise) fail(404, '企业不存在', 'ENTERPRISE_NOT_FOUND');
  const plainToken = makeApiToken('ent_live');
  const token = await prisma.enterpriseApiToken.create({
    data: {
      enterpriseId: enterprise.id,
      name: body.name,
      tokenHash: hashApiToken(plainToken),
      tokenPrefix: apiTokenPrefix(plainToken),
      expiredAt: body.expiredAt ? new Date(body.expiredAt) : null,
      createdById: req.user!.id,
    },
    select: { id: true, name: true, tokenPrefix: true, status: true, expiredAt: true, createdAt: true },
  });
  ok(res, { token: { ...token, plainToken } });
}));

adminRouter.patch('/tokens/:id/disable', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const token = await prisma.enterpriseApiToken.update({
    where: { id: routeParam(req.params.id) },
    data: { status: 'DISABLED' },
    select: { id: true, name: true, tokenPrefix: true, status: true, lastUsedAt: true, createdAt: true },
  });
  ok(res, { token });
}));

const rechargeSchema = z.object({ amount: z.number().int().positive(), remark: z.string().trim().optional() });

adminRouter.post('/accounts/:id/recharge', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = rechargeSchema.parse(req.body || {});
  const enterprise = await prisma.enterpriseAccount.findUnique({ where: { id: routeParam(req.params.id) }, include: { billingUser: true } });
  if (!enterprise) fail(404, '企业不存在', 'ENTERPRISE_NOT_FOUND');
  const result = await prisma.$transaction(async tx => {
    const walletChange = await applyWalletDelta(tx, { userId: enterprise.billingUserId, delta: body.amount });
    const log = await tx.walletLog.create({
      data: {
        userId: enterprise.billingUserId,
        type: 'ADMIN_ADD',
        amount: body.amount,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'ENTERPRISE_RECHARGE',
        relatedId: enterprise.id,
        remark: body.remark || `企业 ${enterprise.name} 充值`,
      },
    });
    await tx.adminLog.create({ data: { adminUserId: req.user!.id, action: 'ENTERPRISE_RECHARGE', targetType: 'ENTERPRISE', targetId: enterprise.id, remark: body.remark } });
    return { balance: walletChange.balanceAfter, log };
  });
  ok(res, result);
}));

const loginSchema = z.object({ account: z.string().trim().min(1), password: z.string().min(1) });

enterpriseRouter.post('/auth/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body || {});
  const account = body.account.toLowerCase();
  const user = await prisma.enterpriseUser.findFirst({
    where: { OR: [{ email: account }, { phone: body.account }] },
    include: { enterprise: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.enterprise.status !== 'ACTIVE') fail(401, '账号或密码错误', 'INVALID_ENTERPRISE_LOGIN');
  const matched = await verifyPassword(body.password, user.passwordHash);
  if (!matched) fail(401, '账号或密码错误', 'INVALID_ENTERPRISE_LOGIN');
  await prisma.enterpriseUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = signEnterpriseUserToken({ id: user.id, enterpriseId: user.enterpriseId, role: user.role, nickname: user.nickname, status: user.status });
  ok(res, { token, user: publicEnterpriseUser(user), enterprise: user.enterprise });
}));

enterpriseRouter.get('/auth/me', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const user = await prisma.enterpriseUser.findUnique({ where: { id: req.enterpriseUser!.id }, include: { enterprise: true } });
  if (!user) fail(404, '企业用户不存在', 'ENTERPRISE_USER_NOT_FOUND');
  ok(res, { user: publicEnterpriseUser(user), enterprise: user.enterprise });
}));

enterpriseRouter.get('/dashboard/summary', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const enterprise = await getCurrentEnterprise(req.enterpriseUser!.enterpriseId);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const [wallet, totalConsumed, todayConsumed, monthConsumed, totalTasks, todayTasks, successTasks, failedTasks, imageTasks, videoTasks] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: enterprise.billingUserId } }),
    sumConsumedCredits(enterprise.billingUserId),
    sumConsumedCredits(enterprise.billingUserId, today),
    sumConsumedCredits(enterprise.billingUserId, month),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId } }),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId, createdAt: { gte: today } } }),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId, status: 'SUCCESS' } }),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId, status: 'FAILED' } }),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId, type: 'IMAGE' } }),
    prisma.generationTask.count({ where: { userId: enterprise.billingUserId, type: 'VIDEO' } }),
  ]);
  ok(res, { data: { balance: wallet?.balance || 0, totalConsumedCredits: totalConsumed, todayConsumedCredits: todayConsumed, monthConsumedCredits: monthConsumed, totalTasks, todayTasks, successTasks, failedTasks, imageTasks, videoTasks } });
}));

enterpriseRouter.get('/wallet', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const enterprise = await getCurrentEnterprise(req.enterpriseUser!.enterpriseId);
  const wallet = await prisma.wallet.findUnique({ where: { userId: enterprise.billingUserId } });
  ok(res, { wallet });
}));

enterpriseRouter.get('/wallet/logs', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const enterprise = await getCurrentEnterprise(req.enterpriseUser!.enterpriseId);
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  const where = { userId: enterprise.billingUserId };
  const [items, total] = await Promise.all([
    prisma.walletLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.walletLog.count({ where }),
  ]);
  ok(res, { items, pagination: { page, pageSize, total } });
}));

enterpriseRouter.get('/generation/tasks', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const enterprise = await getCurrentEnterprise(req.enterpriseUser!.enterpriseId);
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  const where: Prisma.GenerationTaskWhereInput = { userId: enterprise.billingUserId };
  if (req.query.type) where.type = String(req.query.type) as any;
  if (req.query.status) where.status = String(req.query.status) as any;
  const [items, total] = await Promise.all([
    prisma.generationTask.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { model: true, provider: { select: { id: true, providerKey: true, name: true } } } }),
    prisma.generationTask.count({ where }),
  ]);
  ok(res, { items, pagination: { page, pageSize, total } });
}));

enterpriseRouter.get('/generation/tasks/:id', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const enterprise = await getCurrentEnterprise(req.enterpriseUser!.enterpriseId);
  const task = await prisma.generationTask.findFirst({ where: { id: routeParam(req.params.id), userId: enterprise.billingUserId }, include: { model: true, provider: true } });
  if (!task) fail(404, '生成任务不存在', 'GENERATION_TASK_NOT_FOUND');
  ok(res, { task });
}));

enterpriseRouter.get('/api-tokens', requireEnterpriseUserAuth, asyncHandler(async (req, res) => {
  const items = await prisma.enterpriseApiToken.findMany({
    where: { enterpriseId: req.enterpriseUser!.enterpriseId },
    select: { id: true, name: true, tokenPrefix: true, status: true, expiredAt: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, { items });
}));

async function getCurrentEnterprise(enterpriseId: string) {
  const enterprise = await prisma.enterpriseAccount.findUnique({ where: { id: enterpriseId } });
  if (!enterprise) fail(404, '企业不存在', 'ENTERPRISE_NOT_FOUND');
  return enterprise;
}

async function sumConsumedCredits(userId: string, since?: Date) {
  const result = await prisma.walletLog.aggregate({
    where: { userId, type: 'CONSUME', ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { amount: true },
  });
  return Math.abs(result._sum.amount || 0);
}

function publicEnterpriseUser(user: { id: string; enterpriseId: string; email: string | null; phone: string | null; nickname: string; role: string; status: string }) {
  return { id: user.id, enterpriseId: user.enterpriseId, email: user.email, phone: user.phone, nickname: user.nickname, role: user.role, status: user.status };
}

export { adminRouter as enterpriseAdminRoutes, enterpriseRouter };
