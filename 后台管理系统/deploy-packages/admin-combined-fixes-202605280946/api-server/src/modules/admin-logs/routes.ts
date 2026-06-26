import { Router } from 'express';
import { prisma } from '../../db.js';
import { ok } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';

const router = Router();

router.get('/admin-logs', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const items = await prisma.adminLog.findMany({ include: { adminUser: { select: { id: true, nickname: true, phone: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  ok(res, { items });
}));

router.get('/dashboard', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  const [users, agents, usageStatus, usageTotals, redemptions, commissions, rechargeTotals] = await Promise.all([
    prisma.user.count(),
    prisma.agent.count(),
    prisma.modelUsage.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.modelUsage.aggregate({ where: { status: 'SUCCESS' }, _sum: { chargedCredits: true, costAmount: true, costUsd: true } }),
    prisma.accountRedemption.count(),
    prisma.commissionLog.aggregate({ _sum: { amount: true } }),
    prisma.rechargeOrder.aggregate({ where: { status: 'PAID' }, _sum: { credits: true, amountCents: true } }),
  ]);
  const usageSummary = Object.fromEntries(usageStatus.map(item => [item.status, item._count.id]));
  ok(res, {
    users,
    agents,
    usages: usageSummary.SUCCESS || 0,
    failedUsages: usageSummary.FAILED || 0,
    pendingUsages: usageSummary.PENDING || 0,
    redemptions,
    chargedCredits: usageTotals._sum.chargedCredits || 0,
    usageCostAmount: usageTotals._sum.costAmount || 0,
    usageCostUsd: usageTotals._sum.costUsd || 0,
    rechargeCredits: rechargeTotals._sum.credits || 0,
    rechargeAmountCents: rechargeTotals._sum.amountCents || 0,
    commissionAmount: commissions._sum.amount || 0,
  });
}));

export default router;
