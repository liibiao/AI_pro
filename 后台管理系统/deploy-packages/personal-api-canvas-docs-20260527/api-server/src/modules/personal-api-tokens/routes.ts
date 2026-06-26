import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { apiTokenPrefix, hashApiToken, makeApiToken } from '../../security.js';

const router = Router();

const createSchema = z.object({ name: z.string().trim().min(1).max(80).default('默认 API Key') });

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const items = await prisma.personalApiToken.findMany({
    where: { userId: req.user!.id },
    select: { id: true, name: true, tokenPrefix: true, status: true, lastUsedAt: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  ok(res, { items });
}));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body || {});
  const plainToken = makeApiToken('sk_live');
  const token = await prisma.personalApiToken.create({
    data: {
      userId: req.user!.id,
      name: body.name,
      tokenHash: hashApiToken(plainToken),
      tokenPrefix: apiTokenPrefix(plainToken),
    },
    select: { id: true, name: true, tokenPrefix: true, status: true, createdAt: true },
  });
  ok(res, { token: { ...token, plainToken } });
}));

router.patch('/:id/disable', requireAuth, asyncHandler(async (req, res) => {
  const token = await prisma.personalApiToken.findFirst({ where: { id: routeParam(req.params.id), userId: req.user!.id } });
  if (!token) fail(404, 'API Key 不存在', 'PERSONAL_API_TOKEN_NOT_FOUND');
  const updated = await prisma.personalApiToken.update({
    where: { id: token.id },
    data: { status: 'DISABLED' },
    select: { id: true, name: true, tokenPrefix: true, status: true, lastUsedAt: true, createdAt: true },
  });
  ok(res, { token: updated });
}));

router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const token = await prisma.personalApiToken.findFirst({ where: { id: routeParam(req.params.id), userId: req.user!.id } });
  if (!token) fail(404, 'API Key 不存在', 'PERSONAL_API_TOKEN_NOT_FOUND');
  await prisma.personalApiToken.delete({ where: { id: token.id } });
  ok(res);
}));

export default router;
