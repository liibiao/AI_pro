import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { hashPassword, makeInitialPassword } from '../../security.js';
import { normalizeEmail, normalizeNickname, normalizePhone } from '../../identity-normalize.js';

const router = Router();

router.get('/', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
  const keyword = String(req.query.keyword || '').trim();
  const where = keyword
    ? { OR: [{ phone: { contains: keyword } }, { email: { contains: keyword } }, { nickname: { contains: keyword } }] }
    : {};
  const now = new Date();
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        wallet: true,
        agent: true,
        memberships: {
          where: { expiredAt: { gt: now } },
          include: { plan: true },
          orderBy: { expiredAt: 'desc' },
          take: 1,
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);
  ok(res, { items, total, page, pageSize });
}));

router.get('/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: routeParam(req.params.id) },
    include: { wallet: true, memberships: { include: { plan: true } }, agent: true },
  });
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  ok(res, { user });
}));

const createSchema = z.object({
  phone: z.preprocess(normalizePhone, z.string().min(6).optional()),
  email: z.preprocess(normalizeEmail, z.string().email().optional()),
  nickname: z.preprocess(value => normalizeNickname(value), z.string().min(1)).default('新用户'),
  password: z.string().min(6).optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).default('USER'),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

router.post('/', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  if (!body.phone && !body.email) fail(400, '手机号和邮箱至少填写一个', 'ACCOUNT_REQUIRED');
  if ((body.role === 'ADMIN' || body.role === 'SUPER_ADMIN') && req.user!.role !== 'SUPER_ADMIN') {
    fail(403, '只有超级管理员可以创建后台管理员账号', 'SUPER_ADMIN_REQUIRED');
  }
  const exists = await prisma.user.findFirst({
    where: { OR: [{ phone: body.phone || undefined }, { email: body.email || undefined }] },
  });
  if (exists) fail(409, '账号已存在', 'ACCOUNT_EXISTS');

  const initialPassword = body.password || makeInitialPassword();
  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({
      data: {
        phone: body.phone,
        email: body.email,
        nickname: body.nickname,
        role: body.role,
        status: body.status,
        passwordHash: await hashPassword(initialPassword),
      },
    });
    await tx.wallet.create({ data: { userId: created.id, balance: 0 } });
    await tx.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'USER_CREATE', targetType: 'USER', targetId: created.id, remark: created.role },
    });
    return created;
  });
  ok(res, { user, ...(body.password ? {} : { initialPassword }) });
}));

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

router.patch('/:id/status', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = statusSchema.parse(req.body);
  const targetId = routeParam(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) fail(404, '用户不存在', 'USER_NOT_FOUND');
  if (targetId === req.user!.id && body.status === 'DISABLED') fail(400, '不能禁用当前登录账号', 'CANNOT_DISABLE_SELF');
  assertCanManageUser(req.user!.role, existing.role);
  const user = await prisma.user.update({ where: { id: targetId }, data: { status: body.status } });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'USER_STATUS_UPDATE', targetType: 'USER', targetId: user.id, remark: body.status },
  });
  ok(res, { user });
}));

const resetPasswordSchema = z.object({ password: z.string().min(6).optional() });

router.patch('/:id/password', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);
  const targetId = routeParam(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) fail(404, '用户不存在', 'USER_NOT_FOUND');
  assertCanManageUser(req.user!.role, existing.role);
  const initialPassword = body.password || makeInitialPassword();
  const user = await prisma.user.update({
    where: { id: targetId },
    data: { passwordHash: await hashPassword(initialPassword) },
  });
  await prisma.adminLog.create({
    data: { adminUserId: req.user!.id, action: 'USER_PASSWORD_RESET', targetType: 'USER', targetId: user.id },
  });
  ok(res, { user, ...(body.password ? {} : { initialPassword }) });
}));

const setCreditsSchema = z.object({
  balance: z.preprocess(value => Number(value), z.number().int().min(0)),
  remark: z.string().optional(),
});

router.patch('/:id/credits', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  const body = setCreditsSchema.parse(req.body);
  const targetId = routeParam(req.params.id);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
    const wallet = await tx.wallet.upsert({
      where: { userId: targetId },
      update: {},
      create: { userId: targetId, balance: 0 },
    });
    const balanceBefore = wallet.balance;
    const balanceAfter = body.balance;
    const delta = balanceAfter - balanceBefore;
    const updatedWallet = await tx.wallet.update({
      where: { userId: targetId },
      data: { balance: balanceAfter },
    });
    const remark = body.remark || (balanceAfter === 0
      ? `超级管理员将用户积分清零，原余额 ${balanceBefore} 积分`
      : `超级管理员将用户积分从 ${balanceBefore} 调整为 ${balanceAfter}`);
    const log = await tx.walletLog.create({
      data: {
        userId: targetId,
        type: delta < 0 ? 'ADMIN_DEDUCT' : 'ADMIN_ADD',
        amount: delta,
        balanceBefore,
        balanceAfter,
        relatedType: 'ADMIN_SET_BALANCE',
        relatedId: req.user!.id,
        remark,
      },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: req.user!.id,
        action: balanceAfter === 0 ? 'USER_CREDITS_CLEAR' : 'USER_CREDITS_SET',
        targetType: 'USER',
        targetId,
        remark,
      },
    });
    return { user, wallet: updatedWallet, log, balanceBefore, balanceAfter, delta };
  });
  ok(res, result);
}));

router.post('/:id/credits/clear', requireAuth, requireRole(['SUPER_ADMIN']), asyncHandler(async (req, res) => {
  req.body = { ...req.body, balance: 0 };
  const body = setCreditsSchema.parse(req.body);
  const targetId = routeParam(req.params.id);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: targetId } });
    if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
    const wallet = await tx.wallet.upsert({
      where: { userId: targetId },
      update: {},
      create: { userId: targetId, balance: 0 },
    });
    const balanceBefore = wallet.balance;
    const updatedWallet = await tx.wallet.update({
      where: { userId: targetId },
      data: { balance: 0 },
    });
    const remark = body.remark || `超级管理员清零用户积分，原余额 ${balanceBefore} 积分`;
    const log = await tx.walletLog.create({
      data: {
        userId: targetId,
        type: 'ADMIN_DEDUCT',
        amount: -balanceBefore,
        balanceBefore,
        balanceAfter: 0,
        relatedType: 'ADMIN_CLEAR_BALANCE',
        relatedId: req.user!.id,
        remark,
      },
    });
    await tx.adminLog.create({
      data: { adminUserId: req.user!.id, action: 'USER_CREDITS_CLEAR', targetType: 'USER', targetId, remark },
    });
    return { user, wallet: updatedWallet, log, balanceBefore, balanceAfter: 0, delta: -balanceBefore };
  });
  ok(res, result);
}));

function assertCanManageUser(actorRole: string, targetRole: string) {
  if ((targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN') && actorRole !== 'SUPER_ADMIN') {
    fail(403, '只有超级管理员可以管理后台管理员账号', 'SUPER_ADMIN_REQUIRED');
  }
}

export default router;
