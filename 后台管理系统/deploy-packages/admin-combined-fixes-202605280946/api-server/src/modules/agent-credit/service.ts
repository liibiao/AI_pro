import crypto from 'node:crypto';
import { Prisma, type Agent, type PrismaClient } from '@prisma/client';
import { prisma } from '../../db.js';
import { fail } from '../../http.js';
import { applyWalletDelta } from '../../billing.js';
import { decryptSecret, encryptSecret } from '../../security.js';

type Tx = Prisma.TransactionClient;

export function agentVoucherRequestInclude() {
  return {
    agent: { include: { user: { select: { id: true, nickname: true, phone: true, email: true } } } },
    user: { select: { id: true, nickname: true, phone: true, email: true } },
    voucher: true,
    reconciliationOrder: true,
    reviewedByAdmin: { select: { id: true, nickname: true } },
  } as const;
}

function decryptVoucherCode(value?: string | null) {
  if (!value) return '';
  try {
    return decryptSecret(value);
  } catch {
    return '';
  }
}

function isVoucherCodeUsable(voucher?: { status?: string | null; expiredAt?: Date | string | null } | null) {
  if (!voucher) return false;
  if (voucher.status !== 'AVAILABLE') return false;
  if (!voucher.expiredAt) return false;
  return new Date(voucher.expiredAt).getTime() > Date.now();
}

export function withVoucherCode<T extends { codeEncrypted?: string | null; status?: string | null; expiredAt?: Date | string | null }>(voucher: T) {
  const { codeEncrypted: _codeEncrypted, ...safeVoucher } = voucher;
  const code = isVoucherCodeUsable(voucher) ? decryptVoucherCode(_codeEncrypted) : '';
  return { ...safeVoucher, code: code || undefined, codeAvailable: Boolean(code) };
}

export function withCodeAvailability<T extends { codeEncrypted?: string | null; codeViewedAt?: Date | null; status?: string | null; voucher?: any | null }>(request: T) {
  const { codeEncrypted: _codeEncrypted, ...safeRequest } = request;
  const voucher = request.voucher ? withVoucherCode(request.voucher) : request.voucher;
  const legacyCode = !voucher?.code && request.status === 'APPROVED' && isVoucherCodeUsable(request.voucher) ? decryptVoucherCode(_codeEncrypted) : '';
  const code = voucher?.code || legacyCode || '';
  return { ...safeRequest, voucher, code: code || undefined, codeAvailable: Boolean(code) };
}

export function makeVoucherCode() {
  return `AC-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function hashVoucherCode(code: string) {
  return crypto.createHash('sha256').update(normalizeVoucherCode(code)).digest('hex');
}

export function normalizeVoucherCode(code: string) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function makeReconciliationOrderNo(prefix = 'AR') {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}${stamp}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function ensureAgentCreditAccount(tx: Tx, agentId: string) {
  return tx.agentCreditAccount.upsert({
    where: { agentId },
    create: { agentId },
    update: {},
  });
}

export async function assertCustomerBelongsToAgent(tx: Tx, input: { agentId: string; userId: string }) {
  const user = await tx.user.findUnique({ where: { id: input.userId } });
  if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
  const customer = await tx.agentCustomer.findUnique({ where: { userId: input.userId }, include: { agent: true } });
  if (!customer) fail(409, '客户不属于当前代理', 'CUSTOMER_NOT_BOUND_TO_AGENT');
  const ownerAgentId = customer.agentId;
  if (user.agentId !== ownerAgentId) {
    fail(409, '客户绑定关系异常，请联系管理员核对', 'CUSTOMER_AGENT_RELATION_CONFLICT');
  }
  if (ownerAgentId !== input.agentId) {
    const actor = await tx.agent.findUnique({ where: { id: input.agentId } });
    const allowed = actor?.level === 'FOUNDER' ? await isAgentDescendantOf(tx, ownerAgentId, input.agentId) : false;
    if (!allowed) {
      const owner = customer.agent || (ownerAgentId ? await tx.agent.findUnique({ where: { id: ownerAgentId } }) : null);
      fail(409, ownerAgentId ? `客户已绑定代理：${owner?.name || '其他代理'}` : '客户未通过当前代理绑定', 'CUSTOMER_NOT_BOUND_TO_AGENT');
    }
  }
  return { user, customer };
}

async function isAgentDescendantOf(tx: Tx, childAgentId: string | null | undefined, ancestorAgentId: string) {
  if (!childAgentId || childAgentId === ancestorAgentId) return false;
  let cursor: string | null = childAgentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === ancestorAgentId) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const next: { parentAgentId: string | null } | null = await tx.agent.findUnique({ where: { id: cursor }, select: { parentAgentId: true } });
    cursor = next?.parentAgentId || null;
  }
  return false;
}

export async function createRechargeCommission(tx: Tx, input: {
  userId: string;
  sourceType: string;
  sourceId: string;
  credits: number;
}) {
  const user = await tx.user.findUnique({ where: { id: input.userId }, include: { agent: true } });
  if (!user?.agent || user.agent.status !== 'ACTIVE') return null;
  const amount = Math.ceil(input.credits * Number(user.agent.commissionRate));
  if (amount <= 0) return null;
  return tx.commissionLog.create({
    data: {
      agentId: user.agent.id,
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount,
    },
  });
}

export async function bindInvitedCustomer(tx: Tx, input: {
  agentId: string;
  userId: string;
  customerPhone?: string | null;
  customerName?: string | null;
}) {
  const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
  if (!agent || agent.status !== 'ACTIVE') fail(404, '邀请代理不存在或已停用', 'AGENT_NOT_FOUND');
  const user = await tx.user.findUnique({ where: { id: input.userId } });
  if (!user) fail(404, '用户不存在', 'USER_NOT_FOUND');
  if (user.agentId && user.agentId !== agent.id) {
    const owner = await tx.agent.findUnique({ where: { id: user.agentId } });
    fail(409, `用户已绑定代理：${owner?.name || '其他代理'}`, 'USER_BOUND_TO_OTHER_AGENT');
  }
  const existing = await tx.agentCustomer.findUnique({ where: { userId: user.id }, include: { agent: true } });
  if (existing && existing.agentId !== agent.id) fail(409, `用户已绑定代理：${existing.agent.name}`, 'USER_BOUND_TO_OTHER_AGENT');
  if (!user.agentId) await tx.user.update({ where: { id: user.id }, data: { agentId: agent.id } });
  if (!existing) {
    await tx.agentCustomer.create({
      data: {
        agentId: agent.id,
        userId: user.id,
        customerPhone: input.customerPhone || user.phone,
        customerName: input.customerName || user.nickname,
      },
    });
  }
  return agent;
}

export async function grantAgentCredits(input: {
  adminUserId: string;
  agentId: string;
  credits: number;
  amountCents?: number;
  transferChannel?: string;
  transferNo?: string;
  proofImageUrl?: string;
  remark?: string;
}) {
  return prisma.$transaction(async tx => {
    const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
    if (!agent || agent.status !== 'ACTIVE') fail(404, '代理不存在或已停用', 'AGENT_NOT_FOUND');
    const account = await ensureAgentCreditAccount(tx, agent.id);
    const updated = await tx.agentCreditAccount.update({
      where: { agentId: agent.id },
      data: { availableCredits: { increment: input.credits } },
    });
    const ledger = await tx.agentCreditLedger.create({
      data: {
        agentId: agent.id,
        type: 'ADMIN_GRANT',
        amount: input.credits,
        balanceBefore: account.availableCredits,
        balanceAfter: updated.availableCredits,
        relatedType: 'AGENT_RECONCILIATION_ORDER',
        remark: input.remark || '后台手动给代理配额度',
      },
    });
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeReconciliationOrderNo(),
        agentId: agent.id,
        type: 'PREPAID_GRANT',
        status: 'CONFIRMED',
        credits: input.credits,
        amountCents: input.amountCents || 0,
        transferChannel: input.transferChannel,
        transferNo: input.transferNo,
        proofImageUrl: input.proofImageUrl,
        relatedType: 'AGENT_CREDIT_LEDGER',
        relatedId: ledger.id,
        remark: input.remark,
        confirmedByAdminId: input.adminUserId,
        confirmedAt: new Date(),
      },
    });
    await tx.agentCreditLedger.update({ where: { id: ledger.id }, data: { relatedId: order.id } });
    await tx.adminLog.create({
      data: { adminUserId: input.adminUserId, action: 'AGENT_CREDIT_GRANT', targetType: 'AGENT', targetId: agent.id, remark: `${agent.name} +${input.credits}` },
    });
    return { account: updated, ledger, order };
  });
}

export async function grantSubAgentCredits(input: {
  actor: Agent;
  targetAgentId: string;
  credits: number;
  amountCents?: number;
  transferChannel?: string;
  transferNo?: string;
  proofImageUrl?: string;
  remark?: string;
}) {
  if (input.actor.level !== 'FOUNDER') fail(403, '只有一级代理可以给线下代理配置额度', 'FOUNDER_AGENT_REQUIRED');
  return prisma.$transaction(async tx => {
    const targetAgent = await tx.agent.findUnique({ where: { id: input.targetAgentId } });
    if (!targetAgent || targetAgent.status !== 'ACTIVE') fail(404, '线下代理不存在或已停用', 'SUB_AGENT_NOT_FOUND');
    if (targetAgent.id === input.actor.id) fail(400, '不能给自己转配额', 'SUB_AGENT_SELF_GRANT');
    const belongsToActor = await isAgentDescendantOf(tx, targetAgent.id, input.actor.id);
    if (!belongsToActor) fail(403, '只能给自己发展的线下代理配置额度', 'SUB_AGENT_NOT_IN_TEAM');

    const sourceBefore = await ensureAgentCreditAccount(tx, input.actor.id);
    await ensureAgentCreditAccount(tx, targetAgent.id);
    if (sourceBefore.availableCredits < input.credits) fail(400, '一级代理可用额度不足', 'AGENT_CREDIT_NOT_ENOUGH');
    const sourceChanged = await tx.agentCreditAccount.updateMany({
      where: { agentId: input.actor.id, availableCredits: { gte: input.credits } },
      data: { availableCredits: { decrement: input.credits } },
    });
    if (sourceChanged.count !== 1) fail(400, '一级代理可用额度不足', 'AGENT_CREDIT_NOT_ENOUGH');
    const targetBefore = await tx.agentCreditAccount.findUnique({ where: { agentId: targetAgent.id } });
    if (!targetBefore) fail(404, '线下代理额度账户不存在', 'SUB_AGENT_CREDIT_ACCOUNT_NOT_FOUND');
    const targetAfter = await tx.agentCreditAccount.update({
      where: { agentId: targetAgent.id },
      data: { availableCredits: { increment: input.credits } },
    });
    const sourceAfter = await tx.agentCreditAccount.findUnique({ where: { agentId: input.actor.id } });
    if (!sourceAfter) fail(404, '一级代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeReconciliationOrderNo('AT'),
        agentId: targetAgent.id,
        type: 'MANUAL_ADJUST',
        status: 'CONFIRMED',
        credits: input.credits,
        amountCents: input.amountCents || 0,
        transferChannel: input.transferChannel,
        transferNo: input.transferNo,
        proofImageUrl: input.proofImageUrl,
        relatedType: 'AGENT_TEAM_CREDIT_GRANT',
        relatedId: input.actor.id,
        remark: input.remark || `一级代理 ${input.actor.name} 给线下代理配置额度`,
        confirmedAt: new Date(),
      },
    });
    const sourceLedger = await tx.agentCreditLedger.create({
      data: {
        agentId: input.actor.id,
        type: 'MANUAL_ADJUST',
        amount: -input.credits,
        balanceBefore: sourceBefore.availableCredits,
        balanceAfter: sourceAfter.availableCredits,
        relatedType: 'AGENT_RECONCILIATION_ORDER',
        relatedId: order.id,
        remark: input.remark || `给线下代理 ${targetAgent.name} 配置额度`,
      },
    });
    const targetLedger = await tx.agentCreditLedger.create({
      data: {
        agentId: targetAgent.id,
        type: 'MANUAL_ADJUST',
        amount: input.credits,
        balanceBefore: targetBefore.availableCredits,
        balanceAfter: targetAfter.availableCredits,
        relatedType: 'AGENT_RECONCILIATION_ORDER',
        relatedId: order.id,
        remark: input.remark || `一级代理 ${input.actor.name} 配置额度`,
      },
    });
    return { sourceAccount: sourceAfter, targetAccount: targetAfter, targetAgent, sourceLedger, targetLedger, order };
  });
}

export async function createAgentCreditGrantRequest(input: {
  agent: Agent;
  credits: number;
  amountCents?: number;
  transferChannel?: string;
  transferNo?: string;
  proofImageUrl?: string;
  remark?: string;
}) {
  return prisma.$transaction(async tx => {
    await ensureAgentCreditAccount(tx, input.agent.id);
    const order = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeReconciliationOrderNo(),
        agentId: input.agent.id,
        type: 'PREPAID_GRANT',
        status: 'PENDING',
        credits: input.credits,
        amountCents: input.amountCents || 0,
        transferChannel: input.transferChannel,
        transferNo: input.transferNo,
        proofImageUrl: input.proofImageUrl,
        relatedType: 'AGENT_CREDIT_GRANT_REQUEST',
        remark: input.remark || '代理申请配额',
      },
    });
    return { order };
  });
}

export async function approveAgentCreditGrantRequest(input: { adminUserId: string; orderId: string; remark?: string }) {
  return prisma.$transaction(async tx => {
    const order = await tx.agentReconciliationOrder.findUnique({ where: { id: input.orderId }, include: { agent: true } });
    if (!order) fail(404, '配额申请不存在', 'AGENT_CREDIT_GRANT_REQUEST_NOT_FOUND');
    if (order.type !== 'PREPAID_GRANT') fail(400, '该对账单不是配额申请', 'AGENT_CREDIT_GRANT_REQUEST_TYPE_INVALID');
    if (order.status !== 'PENDING') fail(400, '只有待审核配额申请可以通过', 'AGENT_CREDIT_GRANT_REQUEST_NOT_PENDING');
    if (order.agent.status !== 'ACTIVE') fail(400, '申请所属代理不可用', 'AGENT_DISABLED');
    const before = await ensureAgentCreditAccount(tx, order.agentId);
    const after = await tx.agentCreditAccount.update({
      where: { agentId: order.agentId },
      data: { availableCredits: { increment: order.credits } },
    });
    const ledger = await tx.agentCreditLedger.create({
      data: {
        agentId: order.agentId,
        type: 'ADMIN_GRANT',
        amount: order.credits,
        balanceBefore: before.availableCredits,
        balanceAfter: after.availableCredits,
        relatedType: 'AGENT_RECONCILIATION_ORDER',
        relatedId: order.id,
        remark: input.remark || `审核通过代理配额申请 ${order.orderNo}`,
      },
    });
    const updatedOrder = await tx.agentReconciliationOrder.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        relatedType: 'AGENT_CREDIT_LEDGER',
        relatedId: ledger.id,
        confirmedByAdminId: input.adminUserId,
        confirmedAt: new Date(),
        remark: input.remark || order.remark,
      },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'AGENT_CREDIT_GRANT_REQUEST_APPROVE',
        targetType: 'AGENT_RECONCILIATION_ORDER',
        targetId: order.id,
        remark: `${order.orderNo} +${order.credits}`,
      },
    });
    return { order: updatedOrder, account: after, ledger };
  });
}

export async function rejectAgentCreditGrantRequest(input: { adminUserId: string; orderId: string; reason?: string }) {
  return prisma.$transaction(async tx => {
    const order = await tx.agentReconciliationOrder.findUnique({ where: { id: input.orderId } });
    if (!order) fail(404, '配额申请不存在', 'AGENT_CREDIT_GRANT_REQUEST_NOT_FOUND');
    if (order.type !== 'PREPAID_GRANT') fail(400, '该对账单不是配额申请', 'AGENT_CREDIT_GRANT_REQUEST_TYPE_INVALID');
    if (order.status !== 'PENDING') fail(400, '只有待审核配额申请可以驳回', 'AGENT_CREDIT_GRANT_REQUEST_NOT_PENDING');
    const updatedOrder = await tx.agentReconciliationOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        confirmedByAdminId: input.adminUserId,
        confirmedAt: new Date(),
        remark: input.reason || order.remark || '配额申请已驳回',
      },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'AGENT_CREDIT_GRANT_REQUEST_REJECT',
        targetType: 'AGENT_RECONCILIATION_ORDER',
        targetId: order.id,
        remark: order.orderNo,
      },
    });
    return { order: updatedOrder };
  });
}

export async function createAgentVoucher(input: {
  agent: Agent;
  userId: string;
  credits: number;
  amountCents?: number;
  validDays: number;
}) {
  return prisma.$transaction(async tx => {
    return createVoucherFromAgentCredits(tx, {
      agentId: input.agent.id,
      userId: input.userId,
      credits: input.credits,
      amountCents: input.amountCents,
      validDays: input.validDays,
    });
  });
}

async function createVoucherFromAgentCredits(tx: Tx, input: {
  agentId: string;
  userId: string;
  credits: number;
  amountCents?: number;
  validDays: number;
  remark?: string;
}) {
  const code = makeVoucherCode();
  const normalizedCode = normalizeVoucherCode(code);
  const expiredAt = new Date(Date.now() + input.validDays * 86400_000);
  await assertCustomerBelongsToAgent(tx, { agentId: input.agentId, userId: input.userId });
  await ensureAgentCreditAccount(tx, input.agentId);
  const before = await tx.agentCreditAccount.findUnique({ where: { agentId: input.agentId } });
  if (!before) fail(404, '代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
  if (before.availableCredits < input.credits) fail(400, '代理可用额度不足', 'AGENT_CREDIT_NOT_ENOUGH');
  const changed = await tx.agentCreditAccount.updateMany({
    where: { agentId: input.agentId, availableCredits: { gte: input.credits } },
    data: { availableCredits: { decrement: input.credits }, frozenCredits: { increment: input.credits } },
  });
  if (changed.count !== 1) fail(400, '代理可用额度不足', 'AGENT_CREDIT_NOT_ENOUGH');
  const after = await tx.agentCreditAccount.findUnique({ where: { agentId: input.agentId } });
  if (!after) fail(404, '代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
  const voucher = await tx.agentCreditVoucher.create({
    data: {
      voucherNo: makeReconciliationOrderNo('AV'),
      codeHash: hashVoucherCode(normalizedCode),
      codeEncrypted: encryptSecret(normalizedCode),
      codeLast4: normalizedCode.slice(-4),
      source: 'AGENT',
      agentId: input.agentId,
      userId: input.userId,
      credits: input.credits,
      amountCents: input.amountCents || 0,
      expiredAt,
    },
    include: { user: { select: { id: true, nickname: true, phone: true } } },
  });
  const ledger = await tx.agentCreditLedger.create({
    data: {
      agentId: input.agentId,
      type: 'VOUCHER_FREEZE',
      amount: -input.credits,
      balanceBefore: before.availableCredits,
      balanceAfter: after.availableCredits,
      relatedType: 'AGENT_CREDIT_VOUCHER',
      relatedId: voucher.id,
      remark: input.remark || `生成客户额度凭证 ${voucher.voucherNo}`,
    },
  });
  return { voucher: withVoucherCode(voucher), code: normalizedCode, account: after, ledger };
}

export async function createAdminRechargeVoucher(input: {
  adminUserId: string;
  userId: string;
  credits: number;
  amountCents?: number;
  validDays: number;
  transferChannel?: string;
  transferNo?: string;
  proofImageUrl?: string;
  remark?: string;
}) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) fail(404, '客户用户不存在', 'CUSTOMER_USER_NOT_FOUND');
    const code = makeVoucherCode();
    const normalizedCode = normalizeVoucherCode(code);
    const expiredAt = new Date(Date.now() + input.validDays * 86400_000);
    const voucher = await tx.agentCreditVoucher.create({
      data: {
        voucherNo: makeReconciliationOrderNo('RV'),
        codeHash: hashVoucherCode(normalizedCode),
        codeEncrypted: encryptSecret(normalizedCode),
        codeLast4: normalizedCode.slice(-4),
        source: 'ADMIN',
        createdByAdminId: input.adminUserId,
        userId: input.userId,
        credits: input.credits,
        amountCents: input.amountCents || 0,
        expiredAt,
      },
      include: {
        user: { select: { id: true, nickname: true, phone: true, email: true, agent: { select: { id: true, name: true } } } },
        createdByAdmin: { select: { id: true, nickname: true } },
      },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'ADMIN_RECHARGE_VOUCHER_CREATE',
        targetType: 'AGENT_CREDIT_VOUCHER',
        targetId: voucher.id,
        remark: input.remark || `后台线下充值码 ${voucher.voucherNo} +${input.credits}`,
      },
    });
    return { voucher: withVoucherCode(voucher), code: normalizedCode };
  });
}

export async function cancelAdminRechargeVoucher(input: { adminUserId: string; voucherId: string; remark?: string }) {
  return prisma.$transaction(async tx => {
    const voucher = await tx.agentCreditVoucher.findUnique({ where: { id: input.voucherId } });
    if (!voucher) fail(404, '充值兑换码不存在', 'RECHARGE_VOUCHER_NOT_FOUND');
    if (voucher.source !== 'ADMIN') fail(400, '只有后台线下充值码可以在此取消', 'RECHARGE_VOUCHER_NOT_ADMIN');
    if (voucher.status !== 'AVAILABLE') fail(400, '只有未兑换兑换码可以取消', 'RECHARGE_VOUCHER_NOT_CANCELABLE');
    const changed = await tx.agentCreditVoucher.update({
      where: { id: voucher.id },
      data: { status: 'CANCELLED' },
      include: { user: { select: { id: true, nickname: true, phone: true } }, createdByAdmin: { select: { id: true, nickname: true } } },
    });
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'ADMIN_RECHARGE_VOUCHER_CANCEL',
        targetType: 'AGENT_CREDIT_VOUCHER',
        targetId: voucher.id,
        remark: input.remark || voucher.voucherNo,
      },
    });
    return { voucher: withVoucherCode(changed) };
  });
}

export async function createAgentVoucherRequest(input: {
  agent: Agent;
  userId: string;
  credits: number;
  amountCents?: number;
  validDays: number;
  transferChannel?: string;
  transferNo?: string;
  proofImageUrl?: string;
  remark?: string;
}) {
  return prisma.$transaction(async tx => {
    await assertCustomerBelongsToAgent(tx, { agentId: input.agent.id, userId: input.userId });
    const request = await tx.agentCreditVoucherRequest.create({
      data: {
        requestNo: makeReconciliationOrderNo('VR'),
        agentId: input.agent.id,
        userId: input.userId,
        credits: input.credits,
        amountCents: input.amountCents || 0,
        validDays: input.validDays,
        transferChannel: input.transferChannel,
        transferNo: input.transferNo,
        proofImageUrl: input.proofImageUrl,
        remark: input.remark,
      },
    });
    const reconciliationOrder = await tx.agentReconciliationOrder.create({
      data: {
        orderNo: makeReconciliationOrderNo(),
        agentId: input.agent.id,
        type: 'VOUCHER_REQUEST',
        status: 'PENDING',
        credits: input.credits,
        amountCents: input.amountCents || 0,
        transferChannel: input.transferChannel,
        transferNo: input.transferNo,
        proofImageUrl: input.proofImageUrl,
        relatedType: 'AGENT_CREDIT_VOUCHER_REQUEST',
        relatedId: request.id,
        remark: input.remark || `代理申请生成客户充值凭证 ${request.requestNo}`,
      },
    });
    const updatedRequest = await tx.agentCreditVoucherRequest.update({
      where: { id: request.id },
      data: { reconciliationOrderId: reconciliationOrder.id },
      include: agentVoucherRequestInclude(),
    });
    return { request: withCodeAvailability(updatedRequest), reconciliationOrder };
  });
}

export async function approveAgentVoucherRequest(input: {
  adminUserId: string;
  requestId: string;
  remark?: string;
}) {
  return prisma.$transaction(async tx => {
    const request = await tx.agentCreditVoucherRequest.findUnique({
      where: { id: input.requestId },
      include: { agent: true },
    });
    if (!request) fail(404, '充值码申请不存在', 'AGENT_VOUCHER_REQUEST_NOT_FOUND');
    if (request.status !== 'PENDING') fail(400, '只有待审核申请可以通过', 'AGENT_VOUCHER_REQUEST_NOT_PENDING');
    if (request.agent.status !== 'ACTIVE') fail(400, '申请所属代理不可用', 'AGENT_DISABLED');
    await assertCustomerBelongsToAgent(tx, { agentId: request.agentId, userId: request.userId });
    const accountBeforeGrant = await ensureAgentCreditAccount(tx, request.agentId);
    const accountAfterGrant = await tx.agentCreditAccount.update({
      where: { agentId: request.agentId },
      data: { availableCredits: { increment: request.credits } },
    });
    await tx.agentCreditLedger.create({
      data: {
        agentId: request.agentId,
        type: 'ADMIN_GRANT',
        amount: request.credits,
        balanceBefore: accountBeforeGrant.availableCredits,
        balanceAfter: accountAfterGrant.availableCredits,
        relatedType: 'AGENT_CREDIT_VOUCHER_REQUEST',
        relatedId: request.id,
        remark: input.remark || `审核通过充值码申请 ${request.requestNo}`,
      },
    });
    const voucherResult = await createVoucherFromAgentCredits(tx, {
      agentId: request.agentId,
      userId: request.userId,
      credits: request.credits,
      amountCents: request.amountCents,
      validDays: request.validDays,
      remark: `审核生成客户额度凭证 ${request.requestNo}`,
    });
    const now = new Date();
    const updatedRequest = await tx.agentCreditVoucherRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        voucherId: voucherResult.voucher.id,
        reviewedByAdminId: input.adminUserId,
        reviewedAt: now,
        codeEncrypted: encryptSecret(voucherResult.code),
      },
      include: agentVoucherRequestInclude(),
    });
    if (request.reconciliationOrderId) {
      await tx.agentReconciliationOrder.update({
        where: { id: request.reconciliationOrderId },
        data: {
          status: 'CONFIRMED',
          confirmedByAdminId: input.adminUserId,
          confirmedAt: now,
          remark: input.remark || request.remark || `充值码申请已通过 ${request.requestNo}`,
        },
      });
    }
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'AGENT_VOUCHER_REQUEST_APPROVE',
        targetType: 'AGENT_CREDIT_VOUCHER_REQUEST',
        targetId: request.id,
        remark: request.requestNo,
      },
    });
    return { request: withCodeAvailability(updatedRequest), voucher: voucherResult.voucher, code: voucherResult.code, account: voucherResult.account };
  });
}

export async function rejectAgentVoucherRequest(input: {
  adminUserId: string;
  requestId: string;
  reason?: string;
}) {
  return prisma.$transaction(async tx => {
    const request = await tx.agentCreditVoucherRequest.findUnique({ where: { id: input.requestId } });
    if (!request) fail(404, '充值码申请不存在', 'AGENT_VOUCHER_REQUEST_NOT_FOUND');
    if (request.status !== 'PENDING') fail(400, '只有待审核申请可以驳回', 'AGENT_VOUCHER_REQUEST_NOT_PENDING');
    const now = new Date();
    const updatedRequest = await tx.agentCreditVoucherRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        reviewedByAdminId: input.adminUserId,
        reviewedAt: now,
        rejectReason: input.reason,
      },
      include: agentVoucherRequestInclude(),
    });
    if (request.reconciliationOrderId) {
      await tx.agentReconciliationOrder.update({
        where: { id: request.reconciliationOrderId },
        data: {
          status: 'CANCELLED',
          confirmedByAdminId: input.adminUserId,
          confirmedAt: now,
          remark: input.reason || request.remark || `充值码申请已驳回 ${request.requestNo}`,
        },
      });
    }
    await tx.adminLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: 'AGENT_VOUCHER_REQUEST_REJECT',
        targetType: 'AGENT_CREDIT_VOUCHER_REQUEST',
        targetId: request.id,
        remark: input.reason || request.requestNo,
      },
    });
    return { request: withCodeAvailability(updatedRequest) };
  });
}

export async function revealAgentVoucherRequestCode(input: { agent: Agent; requestId: string }) {
  return prisma.$transaction(async tx => {
    const request = await tx.agentCreditVoucherRequest.findFirst({
      where: { id: input.requestId, agentId: input.agent.id },
      include: agentVoucherRequestInclude(),
    });
    if (!request) fail(404, '充值码申请不存在', 'AGENT_VOUCHER_REQUEST_NOT_FOUND');
    if (request.status !== 'APPROVED' || !request.voucherId) fail(400, '申请尚未生成兑换码', 'AGENT_VOUCHER_REQUEST_NOT_APPROVED');
    const code = isVoucherCodeUsable(request.voucher)
      ? decryptVoucherCode(request.voucher?.codeEncrypted || request.codeEncrypted)
      : '';
    if (!code) fail(400, '兑换码不可查看，可能已兑换、已过期或历史记录未保存完整码', 'AGENT_VOUCHER_CODE_UNAVAILABLE');
    const updatedRequest = await tx.agentCreditVoucherRequest.update({
      where: { id: request.id },
      data: { codeViewedAt: request.codeViewedAt || new Date() },
      include: agentVoucherRequestInclude(),
    });
    return { request: withCodeAvailability(updatedRequest), code };
  });
}

export async function cancelAgentVoucher(input: { agent: Agent; voucherId: string }) {
  return prisma.$transaction(async tx => {
    const voucher = await tx.agentCreditVoucher.findFirst({ where: { id: input.voucherId, agentId: input.agent.id } });
    if (!voucher) fail(404, '额度凭证不存在', 'AGENT_CREDIT_VOUCHER_NOT_FOUND');
    if (voucher.status !== 'AVAILABLE') fail(400, '只有未兑换凭证可以取消', 'AGENT_CREDIT_VOUCHER_NOT_CANCELABLE');
    const before = await tx.agentCreditAccount.findUnique({ where: { agentId: input.agent.id } });
    if (!before) fail(404, '代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
    const changed = await tx.agentCreditVoucher.updateMany({
      where: { id: voucher.id, agentId: input.agent.id, status: 'AVAILABLE' },
      data: { status: 'CANCELLED' },
    });
    if (changed.count !== 1) fail(409, '额度凭证状态已变化，请刷新后重试', 'AGENT_CREDIT_VOUCHER_CONFLICT');
    const accountChanged = await tx.agentCreditAccount.updateMany({
      where: { agentId: input.agent.id, frozenCredits: { gte: voucher.credits } },
      data: { availableCredits: { increment: voucher.credits }, frozenCredits: { decrement: voucher.credits } },
    });
    if (accountChanged.count !== 1) fail(409, '代理冻结额度异常，请联系管理员核对', 'AGENT_CREDIT_ACCOUNT_CONFLICT');
    const [updatedVoucher, after] = await Promise.all([
      tx.agentCreditVoucher.findUnique({ where: { id: voucher.id } }),
      tx.agentCreditAccount.findUnique({ where: { agentId: input.agent.id } }),
    ]);
    if (!updatedVoucher || !after) fail(404, '额度凭证或账户不存在', 'AGENT_CREDIT_STATE_NOT_FOUND');
    const ledger = await tx.agentCreditLedger.create({
      data: {
        agentId: input.agent.id,
        type: 'VOUCHER_CANCEL',
        amount: voucher.credits,
        balanceBefore: before.availableCredits,
        balanceAfter: after.availableCredits,
        relatedType: 'AGENT_CREDIT_VOUCHER',
        relatedId: voucher.id,
        remark: `取消客户额度凭证 ${voucher.voucherNo}`,
      },
    });
    return { voucher: withVoucherCode(updatedVoucher), account: after, ledger };
  });
}

export async function redeemAgentVoucher(input: { userId: string; code: string }) {
  const codeHash = hashVoucherCode(input.code);
  const existing = await prisma.agentCreditVoucher.findUnique({ where: { codeHash } });
  if (existing?.status === 'AVAILABLE' && existing.expiredAt <= new Date()) {
    await prisma.$transaction(tx => expireSingleVoucher(tx, existing.id));
  }
  return prisma.$transaction(async tx => {
    const voucher = await tx.agentCreditVoucher.findUnique({ where: { codeHash }, include: { agent: true } });
    if (!voucher || voucher.status !== 'AVAILABLE') fail(400, '额度凭证不可用', 'AGENT_CREDIT_VOUCHER_INVALID');
    if (voucher.expiredAt <= new Date()) fail(400, '额度凭证已过期', 'AGENT_CREDIT_VOUCHER_EXPIRED');
    if (voucher.userId !== input.userId) fail(403, '充值兑换码仅限绑定用户兑换', 'AGENT_CREDIT_VOUCHER_USER_MISMATCH');
    const isAgentVoucher = voucher.source === 'AGENT';
    if (isAgentVoucher) {
      if (!voucher.agentId || !voucher.agent || voucher.agent.status !== 'ACTIVE') fail(400, '凭证所属代理不可用', 'AGENT_DISABLED');
      await assertCustomerBelongsToAgent(tx, { agentId: voucher.agentId, userId: input.userId });
    }
    const now = new Date();
    const claimed = await tx.agentCreditVoucher.updateMany({
      where: { id: voucher.id, userId: input.userId, status: 'AVAILABLE' },
      data: { status: 'REDEEMED', redeemedAt: now },
    });
    if (claimed.count !== 1) fail(409, '额度凭证已被兑换或状态已变化', 'AGENT_CREDIT_VOUCHER_CONFLICT');

    const order = await tx.rechargeOrder.create({
      data: {
        orderNo: makeReconciliationOrderNo('R'),
        userId: input.userId,
        channel: isAgentVoucher ? 'AGENT_VOUCHER' : 'ADMIN_MANUAL',
        status: 'PAID',
        amountCents: voucher.amountCents,
        credits: voucher.credits,
        qrCode: `${isAgentVoucher ? 'agent-voucher' : 'admin-voucher'}://${voucher.voucherNo}`,
        paymentTradeNo: voucher.voucherNo,
        notifyPayload: { voucherId: voucher.id, voucherNo: voucher.voucherNo, agentId: voucher.agentId, source: voucher.source },
        paidAt: now,
        expiredAt: now,
      },
    });
    await tx.wallet.upsert({ where: { userId: input.userId }, update: {}, create: { userId: input.userId, balance: 0 } });
    const walletChange = await applyWalletDelta(tx, { userId: input.userId, delta: voucher.credits });
    await tx.walletLog.create({
      data: {
        userId: input.userId,
        type: 'RECHARGE',
        amount: voucher.credits,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'RECHARGE_ORDER',
        relatedId: order.id,
        remark: `${isAgentVoucher ? '代理额度凭证' : '后台线下充值码'}充值 ${voucher.credits} 积分`,
      },
    });

    const redeemed = await tx.agentCreditVoucher.update({
      where: { id: voucher.id },
      data: { rechargeOrderId: order.id },
    });
    let account = null;
    let reconciliation = null;
    if (isAgentVoucher) {
      const agentId = voucher.agentId!;
      const before = await tx.agentCreditAccount.findUnique({ where: { agentId } });
      if (!before) fail(404, '代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
      const accountChanged = await tx.agentCreditAccount.updateMany({
        where: { agentId, frozenCredits: { gte: voucher.credits } },
        data: { frozenCredits: { decrement: voucher.credits }, usedCredits: { increment: voucher.credits } },
      });
      if (accountChanged.count !== 1) fail(409, '代理冻结额度异常，请联系管理员核对', 'AGENT_CREDIT_ACCOUNT_CONFLICT');
      account = await tx.agentCreditAccount.findUnique({ where: { agentId } });
      if (!account) fail(404, '代理额度账户不存在', 'AGENT_CREDIT_ACCOUNT_NOT_FOUND');
      await tx.agentCreditLedger.create({
        data: {
          agentId,
          type: 'VOUCHER_REDEEM',
          amount: -voucher.credits,
          balanceBefore: before.availableCredits,
          balanceAfter: account.availableCredits,
          relatedType: 'AGENT_CREDIT_VOUCHER',
          relatedId: voucher.id,
          remark: `客户兑换额度凭证 ${voucher.voucherNo}`,
        },
      });
      reconciliation = await tx.agentReconciliationOrder.create({
        data: {
          orderNo: makeReconciliationOrderNo(),
          agentId,
          type: 'VOUCHER_REDEEM',
          status: 'PENDING',
          credits: voucher.credits,
          amountCents: voucher.amountCents,
          relatedType: 'AGENT_CREDIT_VOUCHER',
          relatedId: voucher.id,
          remark: `客户 ${input.userId} 兑换凭证 ${voucher.voucherNo}`,
        },
      });
    }
    const commission = null;
    return { voucher: withVoucherCode(redeemed), order, balance: walletChange.balanceAfter, account, reconciliation, commission };
  });
}

export async function expireAgentCreditVouchers(client: PrismaClient | Tx = prisma, agentId?: string) {
  const expired = await client.agentCreditVoucher.findMany({
    where: { status: 'AVAILABLE', expiredAt: { lt: new Date() }, ...(agentId ? { agentId } : {}) },
    take: 200,
  });
  for (const voucher of expired) {
    await prisma.$transaction(tx => expireSingleVoucher(tx, voucher.id));
  }
  return expired.length;
}

async function expireSingleVoucher(tx: Tx, voucherId: string) {
  const voucher = await tx.agentCreditVoucher.findUnique({ where: { id: voucherId } });
  if (!voucher || voucher.status !== 'AVAILABLE') return null;
  if (voucher.source === 'ADMIN' || !voucher.agentId) {
    const changed = await tx.agentCreditVoucher.updateMany({ where: { id: voucher.id, status: 'AVAILABLE' }, data: { status: 'EXPIRED' } });
    if (changed.count !== 1) return null;
    return tx.agentCreditVoucher.findUnique({ where: { id: voucher.id } });
  }
  const before = await tx.agentCreditAccount.findUnique({ where: { agentId: voucher.agentId } });
  if (!before) return null;
  const changed = await tx.agentCreditVoucher.updateMany({ where: { id: voucher.id, status: 'AVAILABLE' }, data: { status: 'EXPIRED' } });
  if (changed.count !== 1) return null;
  const accountChanged = await tx.agentCreditAccount.updateMany({
    where: { agentId: voucher.agentId, frozenCredits: { gte: voucher.credits } },
    data: { availableCredits: { increment: voucher.credits }, frozenCredits: { decrement: voucher.credits } },
  });
  if (accountChanged.count !== 1) fail(409, '代理冻结额度异常，请联系管理员核对', 'AGENT_CREDIT_ACCOUNT_CONFLICT');
  const [updated, account] = await Promise.all([
    tx.agentCreditVoucher.findUnique({ where: { id: voucher.id } }),
    tx.agentCreditAccount.findUnique({ where: { agentId: voucher.agentId } }),
  ]);
  if (!updated || !account) return null;
  await tx.agentCreditLedger.create({
    data: {
      agentId: voucher.agentId,
      type: 'VOUCHER_EXPIRE',
      amount: voucher.credits,
      balanceBefore: before.availableCredits,
      balanceAfter: account.availableCredits,
      relatedType: 'AGENT_CREDIT_VOUCHER',
      relatedId: voucher.id,
      remark: `额度凭证过期返还 ${voucher.voucherNo}`,
    },
  });
  return updated;
}
