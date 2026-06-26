import { Prisma, type AiModel, type PrismaClient } from '@prisma/client';
import { fail } from './http.js';
import { IMAGE_PRICING_TIERS, MEMBER_CREDIT_DISCOUNT_RATE, VIDEO_PRICING } from './pricing.js';
import type { OpenApiPrincipal } from './types.js';

export type CreditInput = {
  quantity: number;
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
  size?: string;
  resolution?: string;
  imageSize?: string;
  params?: Record<string, unknown>;
  inputFiles?: unknown[];
};

export type UsageInput = CreditInput & {
  userId: string;
  model: AiModel;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  requestId?: string;
  upstreamTaskId?: string;
  errorMessage?: string;
  prompt?: string;
  requestJson?: Prisma.InputJsonValue;
  responseJson?: Prisma.InputJsonValue;
  resultUrl?: string;
};

type BillingClient = PrismaClient | Prisma.TransactionClient;

export type CreditDiscountBenefit = {
  discountActive: boolean;
  discountRate: number;
  label: string;
  source?: string;
  expiresAt?: Date | string | null;
  message: string;
};

export function buildCreditDiscountBenefit(membership?: { source?: string | null; expiredAt?: Date | string | null; plan?: { name?: string | null } | null } | null): CreditDiscountBenefit {
  if (membership) {
    const source = String(membership.source || '');
    const sourceName = source === 'TRIAL_CARD' ? '体验卡' : (membership.plan?.name || '会员');
    return {
      discountActive: true,
      discountRate: MEMBER_CREDIT_DISCOUNT_RATE,
      label: 'VIP 4折',
      source,
      expiresAt: membership.expiredAt || null,
      message: `${sourceName}有效期内按 VIP 4 折扣积分，到期后自动恢复原价计费。`,
    };
  }
  return {
    discountActive: false,
    discountRate: 1,
    label: '原价',
    expiresAt: null,
    message: '当前为原价计费；开通会员或兑换体验卡后，生图/生视频/文本模型按 VIP 4 折扣积分。',
  };
}

export async function getActiveCreditDiscountBenefit(client: BillingClient, userId: string, now = new Date()) {
  const membership = await client.userMembership.findFirst({
    where: { userId, expiredAt: { gt: now } },
    include: { plan: true },
    orderBy: { expiredAt: 'desc' },
  });
  return buildCreditDiscountBenefit(membership);
}

export async function calculateCreditsForUser(client: BillingClient, userId: string, model: Parameters<typeof calculateCredits>[0], input: CreditInput) {
  const benefit = await getActiveCreditDiscountBenefit(client, userId);
  return calculateCredits(model, input, benefit);
}

export function buildEnterpriseApiDiscountBenefit(): CreditDiscountBenefit {
  return {
    discountActive: true,
    discountRate: MEMBER_CREDIT_DISCOUNT_RATE,
    label: '企业API 4折',
    source: 'ENTERPRISE_API',
    expiresAt: null,
    message: '企业 API Token 按 VIP 4 折计费，无需单独开通会员。',
  };
}

export async function calculateCreditsForPrincipal(client: BillingClient, principal: OpenApiPrincipal, model: Parameters<typeof calculateCredits>[0], input: CreditInput) {
  if (principal.discountMode === 'FORCE_MEMBER_40_OFF') {
    return calculateCredits(model, input, buildEnterpriseApiDiscountBenefit());
  }
  return calculateCreditsForUser(client, principal.billingUserId, model, input);
}

export function calculateCredits(
  model: Pick<AiModel, 'type' | 'unit' | 'salePrice' | 'costPrice' | 'pricePerSecond' | 'inputPriceUsdPer1m' | 'outputPriceUsdPer1m' | 'creditsPerUsdCost' | 'markupRate'> & {
    defaults?: Prisma.JsonValue | null;
    protocol?: Prisma.JsonValue | null;
    capabilities?: Prisma.JsonValue | null;
  },
  input: CreditInput,
  benefit: CreditDiscountBenefit = buildCreditDiscountBenefit(null),
) {
  if (model.type === 'IMAGE') {
    const tier = resolveImageTier(input);
    const tierPrice = imageTierPrice(model, tier);
    const unitCredits = benefit.discountActive ? tierPrice.memberCredits : tierPrice.originalCredits;
    return {
      chargedCredits: unitCredits * input.quantity,
      memberCredits: tierPrice.memberCredits * input.quantity,
      originalCredits: tierPrice.originalCredits * input.quantity,
      costAmount: roundCredits(tierPrice.costCredits * input.quantity),
      costUsd: 0,
      pricingTier: tier,
      discountActive: benefit.discountActive,
      discountRate: benefit.discountRate,
      discountLabel: benefit.label,
      discountExpiresAt: benefit.expiresAt || null,
    };
  }
  if (model.type === 'VIDEO') {
    const flatPrice = videoFlatPriceForInput(model);
    if (flatPrice) {
      const unitCredits = benefit.discountActive ? flatPrice.memberCredits : flatPrice.originalCredits;
      const quantity = Math.max(1, input.quantity || 1);
      return {
        chargedCredits: unitCredits * quantity,
        memberCredits: flatPrice.memberCredits * quantity,
        originalCredits: flatPrice.originalCredits * quantity,
        chargedCreditsPerGeneration: unitCredits,
        memberCreditsPerGeneration: flatPrice.memberCredits,
        originalCreditsPerGeneration: flatPrice.originalCredits,
        costAmount: roundCredits(flatPrice.costCredits * quantity),
        costUsd: 0,
        pricingUnit: 'generation',
        discountActive: benefit.discountActive,
        discountRate: benefit.discountRate,
        discountLabel: benefit.label,
        discountExpiresAt: benefit.expiresAt || null,
      };
    }
    const videoPrice = videoPriceForInput(model, input);
    const memberPerSecond = videoPrice.memberCreditsPerSecond;
    const originalPerSecond = videoPrice.originalCreditsPerSecond;
    const chargedPerSecond = benefit.discountActive ? memberPerSecond : originalPerSecond;
    const costPerSecond = videoPrice.costCreditsPerSecond;
    return {
      chargedCredits: chargedPerSecond * input.durationSeconds,
      memberCredits: memberPerSecond * input.durationSeconds,
      originalCredits: originalPerSecond * input.durationSeconds,
      chargedCreditsPerSecond: chargedPerSecond,
      memberCreditsPerSecond: memberPerSecond,
      originalCreditsPerSecond: originalPerSecond,
      costAmount: roundCredits(costPerSecond * input.durationSeconds),
      costUsd: 0,
      discountActive: benefit.discountActive,
      discountRate: benefit.discountRate,
      discountLabel: benefit.label,
      discountExpiresAt: benefit.expiresAt || null,
    };
  }
  const inputUsd = (input.inputTokens / 1_000_000) * Number(model.inputPriceUsdPer1m);
  const outputUsd = (input.outputTokens / 1_000_000) * Number(model.outputPriceUsdPer1m);
  const costUsd = inputUsd + outputUsd;
  const creditsPerUsdCost = Number(model.creditsPerUsdCost);
  const markupRate = Number(model.markupRate) || 1;
  const memberCredits = Math.ceil(Math.max(0, costUsd * (Number.isFinite(creditsPerUsdCost) ? creditsPerUsdCost : 0) * markupRate));
  const originalCredits = originalCreditsFromMember(memberCredits);
  const chargedCredits = benefit.discountActive ? memberCredits : originalCredits;
  return {
    chargedCredits,
    memberCredits,
    originalCredits,
    costAmount: 0,
    costUsd,
    discountActive: benefit.discountActive,
    discountRate: benefit.discountRate,
    discountLabel: benefit.label,
    discountExpiresAt: benefit.expiresAt || null,
  };
}

export async function assertEnoughBalance(prisma: PrismaClient, userId: string, credits: number) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
  if (wallet.balance < credits) fail(400, '余额不足', 'INSUFFICIENT_BALANCE');
  return wallet;
}

export async function applyWalletDelta(tx: Prisma.TransactionClient, input: { userId: string; delta: number; requireNonNegative?: boolean }) {
  const guard = input.requireNonNegative
    ? Prisma.sql`AND "balance" + ${input.delta} >= 0`
    : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ balance_before: number; balance_after: number }>>`
    UPDATE "wallets"
    SET "balance" = "balance" + ${input.delta}, "updated_at" = NOW()
    WHERE "user_id" = ${input.userId} ${guard}
    RETURNING "balance" - ${input.delta} AS "balance_before", "balance" AS "balance_after"
  `;

  const row = rows[0];
  if (!row) {
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    fail(400, '余额不足', 'INSUFFICIENT_BALANCE');
  }
  return { balanceBefore: Number(row.balance_before), balanceAfter: Number(row.balance_after) };
}

export async function recordUsageAndCharge(tx: Prisma.TransactionClient, input: UsageInput) {
  const cost = await calculateCreditsForUser(tx, input.userId, input.model, input);
  const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
  if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
  if (input.status === 'SUCCESS' && wallet.balance < cost.chargedCredits) fail(400, '余额不足', 'INSUFFICIENT_BALANCE');

  const usage = await tx.modelUsage.create({
    data: {
      userId: input.userId,
      modelId: input.model.id,
      modelType: input.model.type,
      quantity: input.quantity,
      durationSeconds: input.durationSeconds,
      saleAmount: cost.chargedCredits,
      costAmount: cost.costAmount,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.inputTokens + input.outputTokens,
      costUsd: new Prisma.Decimal(cost.costUsd),
      chargedCredits: cost.chargedCredits,
      status: input.status,
      prompt: input.prompt,
      requestJson: input.requestJson,
      responseJson: input.responseJson,
      resultUrl: input.resultUrl,
      requestId: input.requestId,
      upstreamTaskId: input.upstreamTaskId,
      errorMessage: input.errorMessage,
    },
  });

  if (input.status === 'SUCCESS') {
    const walletChange = await applyWalletDelta(tx, { userId: input.userId, delta: -cost.chargedCredits, requireNonNegative: true });
    await tx.walletLog.create({
      data: {
        userId: input.userId,
        type: 'CONSUME',
        amount: -cost.chargedCredits,
        balanceBefore: walletChange.balanceBefore,
        balanceAfter: walletChange.balanceAfter,
        relatedType: 'MODEL_USAGE',
        relatedId: usage.id,
        remark: `${input.model.displayName} 消耗`,
      },
    });
    return { usage, balance: walletChange.balanceAfter, ...cost };
  }

  return { usage, balance: wallet.balance, ...cost };
}

export async function refundUsageCharge(tx: Prisma.TransactionClient, input: {
  userId: string;
  usageId: string;
  responseJson?: Prisma.InputJsonValue;
  resultUrl?: string;
  errorMessage?: string;
}) {
  const usage = await tx.modelUsage.findFirst({
    where: { id: input.usageId, userId: input.userId },
    include: { model: true },
  });
  if (!usage) fail(404, '调用记录不存在', 'USAGE_NOT_FOUND');

  if (usage.status === 'FAILED') {
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    return { usage, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: true };
  }

  const updatedUsage = await tx.modelUsage.update({
    where: { id: usage.id },
    data: {
      status: 'FAILED',
      responseJson: input.responseJson,
      resultUrl: input.resultUrl || undefined,
      errorMessage: input.errorMessage || '上游任务失败，已自动退款',
    },
  });

  if (usage.status !== 'SUCCESS' || usage.chargedCredits <= 0) {
    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet) fail(404, '钱包不存在', 'WALLET_NOT_FOUND');
    return { usage: updatedUsage, refundedCredits: 0, balance: wallet.balance, alreadyRefunded: false };
  }

  const walletChange = await applyWalletDelta(tx, { userId: input.userId, delta: usage.chargedCredits });
  await tx.walletLog.create({
    data: {
      userId: input.userId,
      type: 'REFUND',
      amount: usage.chargedCredits,
      balanceBefore: walletChange.balanceBefore,
      balanceAfter: walletChange.balanceAfter,
      relatedType: 'MODEL_USAGE',
      relatedId: usage.id,
      remark: `${usage.model.displayName} 失败退款`,
    },
  });

  return { usage: updatedUsage, refundedCredits: usage.chargedCredits, balance: walletChange.balanceAfter, alreadyRefunded: false };
}

export function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(Array.from(text).length / 3));
}

function imageTierPrice(model: { defaults?: Prisma.JsonValue | null; salePrice: number; costPrice: unknown }, tier: string) {
  const custom = customImageTiers(model.defaults).find(item => item.tier === tier);
  if (custom) return custom;
  const fallback = IMAGE_PRICING_TIERS.find(item => item.tier === tier) || IMAGE_PRICING_TIERS[0];
  return { tier: fallback.tier, memberCredits: fallback.chargedCredits, originalCredits: fallback.originalCredits, costCredits: fallback.costCredits };
}

function customImageTiers(defaults: Prisma.JsonValue | null | undefined) {
  const pricing = recordValue(recordValue(defaults)?.pricing);
  const tiers = Array.isArray(pricing?.tiers) ? pricing.tiers : [];
  return tiers
    .map(item => {
      const row = recordValue(item);
      const tier = normalizeTier(String(row?.tier || row?.label || row?.resolution || ''));
      const memberCredits = Number(row?.memberCredits ?? row?.chargedCredits ?? row?.credits ?? row?.price ?? NaN);
      const originalCredits = Number(row?.originalCredits ?? row?.listCredits ?? row?.standardCredits ?? NaN);
      const costCredits = Number(row?.costCredits ?? row?.cost ?? NaN);
      if (!tier || !Number.isFinite(memberCredits) || memberCredits < 0) return null;
      const normalizedOriginalCredits = Number.isFinite(originalCredits) && originalCredits >= memberCredits
        ? originalCredits
        : originalCreditsFromMember(memberCredits);
      return {
        tier,
        memberCredits,
        originalCredits: normalizedOriginalCredits,
        costCredits: Number.isFinite(costCredits) && costCredits >= 0 ? costCredits : roundCredits(memberCredits * 0.7),
      };
    })
    .filter((item): item is { tier: string; memberCredits: number; originalCredits: number; costCredits: number } => Boolean(item));
}

function videoPriceForInput(
  model: { defaults?: Prisma.JsonValue | null; pricePerSecond: number; costPrice: unknown },
  input: CreditInput,
) {
  const pricing = recordValue(recordValue(model.defaults)?.pricing);
  const resolution = normalizeVideoResolution(input.resolution || stringParam(input.params || {}, ['resolution', 'requestedResolution', 'quality']));
  const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
  const matched = tiers
    .map(item => recordValue(item))
    .find(item => normalizeVideoResolution(String(item?.resolution || item?.label || item?.quality || '')) === resolution);
  const scenarioTier = matched ? videoScenarioTierForInput(matched, input) : null;
  if (scenarioTier) {
    const member = videoScenarioMemberCreditsPerSecond(scenarioTier);
    if (Number.isFinite(member) && member >= 0) {
      const original = videoScenarioOriginalCreditsPerSecond(scenarioTier);
      const cost = videoScenarioCostCreditsPerSecond(scenarioTier);
      return {
        memberCreditsPerSecond: member,
        originalCreditsPerSecond: Number.isFinite(original) && original >= member ? original : originalCreditsFromMember(member),
        costCreditsPerSecond: Number.isFinite(cost) && cost >= 0 ? cost : roundCredits(member * 0.7),
      };
    }
  }
  const memberCreditsPerSecond = Number(matched?.memberCreditsPerSecond ?? matched?.chargedCreditsPerSecond ?? matched?.creditsPerSecond ?? matched?.pricePerSecond ?? NaN);
  const originalCreditsPerSecond = Number(matched?.originalCreditsPerSecond ?? matched?.listCreditsPerSecond ?? matched?.standardCreditsPerSecond ?? NaN);
  const costCreditsPerSecond = Number(matched?.costCreditsPerSecond ?? matched?.costPerSecond ?? NaN);
  const configuredMember = Number(pricing?.memberCreditsPerSecond ?? pricing?.chargedCreditsPerSecond ?? pricing?.creditsPerSecond ?? pricing?.pricePerSecond ?? NaN);
  const modelMember = Number(model.pricePerSecond);
  const fallbackMember = Number.isFinite(modelMember) && modelMember >= 0
    ? modelMember
    : (Number.isFinite(configuredMember) && configuredMember >= 0 ? configuredMember : VIDEO_PRICING.chargedCreditsPerSecond);
  const member = matched && Number.isFinite(memberCreditsPerSecond) && memberCreditsPerSecond >= 0 ? memberCreditsPerSecond : fallbackMember;
  const original = matched && Number.isFinite(originalCreditsPerSecond) && originalCreditsPerSecond >= member
    ? originalCreditsPerSecond
    : originalCreditsFromMember(member);
  return {
    memberCreditsPerSecond: member,
    originalCreditsPerSecond: original,
    costCreditsPerSecond: Number.isFinite(costCreditsPerSecond) && costCreditsPerSecond >= 0
      ? costCreditsPerSecond
      : (numberValue(model.costPrice) || VIDEO_PRICING.costCreditsPerSecond),
  };
}

function videoScenarioTierForInput(resolutionTier: Record<string, unknown>, input: CreditInput) {
  const scenarioTiers = Array.isArray(resolutionTier.scenarioTiers)
    ? resolutionTier.scenarioTiers.map(item => recordValue(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  if (!scenarioTiers.length) return null;
  const withVideoInput = hasVideoInputForPricing(input);
  const byFlag = scenarioTiers.find(item => typeof item.hasVideoInput === 'boolean' && item.hasVideoInput === withVideoInput);
  if (byFlag) return byFlag;
  const wanted = withVideoInput ? 'with_video_input' : 'no_video_input';
  return scenarioTiers.find(item => normalizeVideoPricingScenario(item.scenario || item.key || item.name || item.label) === wanted) || null;
}

function normalizeVideoPricingScenario(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('有视频') || raw.includes('with_video') || raw.includes('has_video') || raw.includes('video_input')) return 'with_video_input';
  if (raw.includes('无视频') || raw.includes('without_video') || raw.includes('no_video') || raw.includes('text_to_video')) return 'no_video_input';
  return raw.replace(/[\s-]+/g, '_');
}

function videoScenarioMemberCreditsPerSecond(tier: Record<string, unknown>) {
  const direct = firstFiniteNumber(tier, ['memberCreditsPerSecond', 'chargedCreditsPerSecond', 'creditsPerSecond', 'pricePerSecond']);
  if (Number.isFinite(direct)) return direct;
  return sumVideoScenarioParts(tier, [
    'memberOutputCreditsPerSecond',
    'chargedOutputCreditsPerSecond',
    'outputCreditsPerSecond',
  ], [
    'memberInputCreditsPerSecond',
    'chargedInputCreditsPerSecond',
    'inputCreditsPerSecond',
  ]);
}

function videoScenarioOriginalCreditsPerSecond(tier: Record<string, unknown>) {
  const direct = firstFiniteNumber(tier, ['originalCreditsPerSecond', 'listCreditsPerSecond', 'standardCreditsPerSecond']);
  if (Number.isFinite(direct)) return direct;
  return sumVideoScenarioParts(tier, [
    'originalOutputCreditsPerSecond',
    'listOutputCreditsPerSecond',
    'standardOutputCreditsPerSecond',
  ], [
    'originalInputCreditsPerSecond',
    'listInputCreditsPerSecond',
    'standardInputCreditsPerSecond',
  ]);
}

function videoScenarioCostCreditsPerSecond(tier: Record<string, unknown>) {
  const direct = firstFiniteNumber(tier, ['costCreditsPerSecond', 'costPerSecond']);
  if (Number.isFinite(direct)) return direct;
  return sumVideoScenarioParts(tier, ['costOutputCreditsPerSecond'], ['costInputCreditsPerSecond']);
}

function firstFiniteNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return NaN;
}

function sumVideoScenarioParts(record: Record<string, unknown>, outputKeys: string[], inputKeys: string[]) {
  const output = firstFiniteNumber(record, outputKeys);
  const input = firstFiniteNumber(record, inputKeys);
  if (!Number.isFinite(output) && !Number.isFinite(input)) return NaN;
  return (Number.isFinite(output) ? output : 0) + (Number.isFinite(input) ? input : 0);
}

function hasVideoInputForPricing(input: CreditInput) {
  if (hasVideoReference(input.inputFiles)) return true;
  return hasVideoReference(input.params);
}

function hasVideoReference(value: unknown, keyHint = ''): boolean {
  if (value == null) return false;
  const key = keyHint.trim();
  if (Array.isArray(value)) return value.some(item => hasVideoReference(item, key));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return isVideoReferenceKey(key) || looksLikeVideoUrl(trimmed);
  }
  if (typeof value !== 'object') return isVideoReferenceKey(key) && Boolean(value);
  const record = value as Record<string, unknown>;
  const mediaType = String(record.mediaType || record.mimeType || record.contentType || '').trim().toLowerCase();
  if (mediaType.startsWith('video/')) return true;
  const type = String(record.type || record.kind || record.mediaKind || record.category || '').trim().toLowerCase();
  if (['video', 'video_url', 'reference_video', 'input_video'].includes(type)) return true;
  const url = String(record.url || record.remoteUrl || record.fileUrl || record.href || '').trim();
  if (url && looksLikeVideoUrl(url)) return true;
  return Object.entries(record).some(([childKey, childValue]) => {
    if (isVideoReferenceKey(childKey)) return hasNonEmptyValue(childValue);
    if (['files', 'materials', 'inputFiles', 'input_files', 'content'].includes(childKey)) return hasVideoReference(childValue, childKey);
    return false;
  });
}

function isVideoReferenceKey(key: string) {
  const normalized = key.replace(/[\s-]+/g, '_').toLowerCase();
  return [
    'video',
    'videos',
    'video_url',
    'videourl',
    'video_urls',
    'videourls',
    'video_with_roles',
    'videowithroles',
    'reference_video',
    'referencevideo',
    'reference_video_url',
    'referencevideourl',
    'reference_video_urls',
    'referencevideourls',
    'reference_videos',
    'referencevideos',
    'ref_video',
    'refvideo',
    'extra_videos',
    'extravideos',
    'sorav3referencevideourl',
    'audioreferencevideourl',
  ].includes(normalized);
}

function hasNonEmptyValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(hasNonEmptyValue);
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object') return true;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function looksLikeVideoUrl(value: string) {
  return /\.(mp4|mov|m4v|webm|mkv|avi|mpeg|mpg)(?:[?#].*)?$/i.test(value);
}

function videoFlatPriceForInput(
  model: { defaults?: Prisma.JsonValue | null; unit?: string | null; salePrice: number; costPrice: unknown },
) {
  const pricing = recordValue(recordValue(model.defaults)?.pricing);
  const unit = String(pricing?.unit || model.unit || '').trim().toLowerCase();
  const billingMode = String(pricing?.billingMode || pricing?.billing_mode || '').trim().toLowerCase();
  const perGeneration = ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(unit)
    || ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(billingMode);
  if (!perGeneration) return null;
  const configuredMember = Number(
    pricing?.memberCreditsPerGeneration ??
    pricing?.chargedCreditsPerGeneration ??
    pricing?.creditsPerGeneration ??
    pricing?.pricePerGeneration ??
    pricing?.memberCreditsPerRequest ??
    pricing?.chargedCreditsPerRequest ??
    pricing?.creditsPerRequest ??
    pricing?.pricePerRequest ??
    NaN
  );
  const modelMember = Number(model.salePrice);
  const member = Number.isFinite(configuredMember) && configuredMember >= 0
    ? configuredMember
    : (Number.isFinite(modelMember) && modelMember >= 0 ? modelMember : 0);
  const original = Number(
    pricing?.originalCreditsPerGeneration ??
    pricing?.listCreditsPerGeneration ??
    pricing?.standardCreditsPerGeneration ??
    pricing?.originalCreditsPerRequest ??
    NaN
  );
  const cost = Number(
    pricing?.costCreditsPerGeneration ??
    pricing?.costCreditsPerRequest ??
    pricing?.costPerGeneration ??
    pricing?.costPerRequest ??
    NaN
  );
  return {
    memberCredits: member,
    originalCredits: Number.isFinite(original) && original >= member ? original : originalCreditsFromMember(member),
    costCredits: Number.isFinite(cost) && cost >= 0 ? cost : (numberValue(model.costPrice) || roundCredits(member * 0.7)),
  };
}

function normalizeVideoResolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (/1080/.test(raw)) return '1080p';
  if (/720/.test(raw)) return '720p';
  return raw;
}

function originalCreditsFromMember(memberCredits: number) {
  return Math.max(memberCredits, Math.ceil(memberCredits / MEMBER_CREDIT_DISCOUNT_RATE));
}

function resolveImageTier(input: CreditInput) {
  const candidates = [
    input.resolution,
    input.imageSize,
    input.size,
    stringParam(input.params, ['resolution', 'requestedResolution', 'imageSize', 'size', 'requestedPixelSize', 'quality']),
  ].filter(Boolean).map(value => String(value));
  for (const candidate of candidates) {
    const tier = parseTier(candidate);
    if (tier) return tier;
  }
  return '1K';
}

function parseTier(value: string) {
  const raw = value.trim().toUpperCase();
  const direct = normalizeTier(raw);
  if (direct) return direct;
  const dimensions = raw.match(/(\d{3,5})\s*[X*×]\s*(\d{3,5})/);
  if (dimensions) {
    const maxSide = Math.max(Number(dimensions[1]), Number(dimensions[2]));
    if (maxSide <= 1280) return '1K';
    if (maxSide <= 2304) return '2K';
    if (maxSide <= 3584) return '3K';
    return '4K';
  }
  const numberMatch = raw.match(/\b(\d{3,5})\b/);
  if (numberMatch) {
    const pixels = Number(numberMatch[1]);
    if (pixels <= 1280) return '1K';
    if (pixels <= 2304) return '2K';
    if (pixels <= 3584) return '3K';
    return '4K';
  }
  return '';
}

function normalizeTier(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  if (compact.includes('1K')) return '1K';
  if (compact.includes('2K')) return '2K';
  if (compact.includes('3K')) return '3K';
  if (compact.includes('4K') || compact.includes('8K')) return '4K';
  return '';
}

function stringParam(params: Record<string, unknown> | undefined, keys: string[]) {
  if (!params) return '';
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCredits(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
