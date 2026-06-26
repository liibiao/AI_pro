import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { calculateCreditsForUser, recordUsageAndCharge } from '../../billing.js';

const router = Router();

const checkSchema = z.object({
  modelId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  durationSeconds: z.number().int().nonnegative().default(0),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  size: z.string().optional(),
  resolution: z.string().optional(),
  imageSize: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

router.post('/check', requireAuth, asyncHandler(async (req, res) => {
  const body = checkSchema.parse(req.body);
  const model = await prisma.aiModel.findUnique({ where: { id: body.modelId } });
  if (!model || model.status !== 'ACTIVE') fail(404, '模型不可用', 'MODEL_NOT_FOUND');
  const cost = await calculateCreditsForUser(prisma, req.user!.id, model, body);
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
  ok(res, { enough: wallet.balance >= cost.chargedCredits, balance: wallet.balance, ...cost, model });
}));

const consumeSchema = checkSchema.extend({
  requestId: z.string().optional(),
  upstreamTaskId: z.string().optional(),
  status: z.enum(['SUCCESS', 'FAILED']).default('SUCCESS'),
  errorMessage: z.string().optional(),
});

router.post('/consume', requireAuth, asyncHandler(async (req, res) => {
  const body = consumeSchema.parse(req.body);
  const model = await prisma.aiModel.findUnique({ where: { id: body.modelId } });
  if (!model || model.status !== 'ACTIVE') fail(404, '模型不可用', 'MODEL_NOT_FOUND');
  const result = await prisma.$transaction(async tx => {
    return recordUsageAndCharge(tx, {
      userId: req.user!.id,
      model,
      quantity: body.quantity,
      durationSeconds: body.durationSeconds,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      requestId: body.requestId,
      upstreamTaskId: body.upstreamTaskId,
      errorMessage: body.errorMessage,
      status: body.status,
    });
  });
  ok(res, result);
}));

export default router;
