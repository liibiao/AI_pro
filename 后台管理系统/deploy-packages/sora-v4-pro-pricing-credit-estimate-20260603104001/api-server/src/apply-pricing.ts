import { Prisma } from '@prisma/client';
import './config.js';
import { prisma } from './db.js';
import {
  defaultPricingDefaults,
  GEMINI_IMAGE_PRICING_TIERS,
  GPT_IMAGE_2_PRO_PRICING_TIERS,
  imagePricingDefaults,
  IMAGE_PRICING_TIERS,
  MEMBERSHIP_PRICING,
  SEEDANCE_FAST_VIDEO_PRICING,
  SEEDANCE_VIP_VIDEO_PRICING,
  SORA_FAST_VIDEO_PRICING,
  SORA_PRO_VIDEO_PRICING,
  SORA_V4_PRO_VIDEO_PRICING,
  SORA_VIDEO_PRICING,
  videoPricingDefaults,
  VIDEO_PRICING,
} from './pricing.js';

async function main() {
  const imageDefaults = defaultPricingDefaults('IMAGE') as Prisma.InputJsonValue;
  const geminiImageDefaults = imagePricingDefaults(GEMINI_IMAGE_PRICING_TIERS) as Prisma.InputJsonValue;
  const gptImage2ProDefaults = imagePricingDefaults(GPT_IMAGE_2_PRO_PRICING_TIERS) as Prisma.InputJsonValue;
  const videoDefaults = defaultPricingDefaults('VIDEO') as Prisma.InputJsonValue;
  const soraVideoDefaults = videoPricingDefaults(SORA_VIDEO_PRICING) as Prisma.InputJsonValue;
  const soraProVideoDefaults = videoPricingDefaults(SORA_PRO_VIDEO_PRICING) as Prisma.InputJsonValue;
  const soraV4ProVideoDefaults = videoPricingDefaults(SORA_V4_PRO_VIDEO_PRICING) as Prisma.InputJsonValue;
  const soraFastVideoDefaults = videoPricingDefaults(SORA_FAST_VIDEO_PRICING) as Prisma.InputJsonValue;

  const seedanceFastVideoDefaults = videoPricingDefaults(SEEDANCE_FAST_VIDEO_PRICING) as Prisma.InputJsonValue;
  const seedanceVipVideoDefaults = videoPricingDefaults(SEEDANCE_VIP_VIDEO_PRICING) as Prisma.InputJsonValue;

  const [imageModels, videoModels, seedanceVipVideoModels, seedanceFastVideoModels, geminiImageModels, gptImage2ProModels, soraVideoModels, soraV4ProVideoModels, soraProVideoModels, soraFastVideoModels, llmModels, gpt54, gpt55, setting, membership] = await prisma.$transaction([
    prisma.aiModel.updateMany({
      where: { type: 'IMAGE' },
      data: {
        unit: 'image_resolution_tier',
        salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
        costPrice: IMAGE_PRICING_TIERS[0].costCredits,
        defaults: imageDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: { type: 'VIDEO' },
      data: {
        unit: 'second',
        pricePerSecond: VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: VIDEO_PRICING.costCreditsPerSecond,
        defaults: videoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: seedanceVipVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SEEDANCE_VIP_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SEEDANCE_VIP_VIDEO_PRICING.costCreditsPerSecond,
        defaults: seedanceVipVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: seedanceFastVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SEEDANCE_FAST_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SEEDANCE_FAST_VIDEO_PRICING.costCreditsPerSecond,
        defaults: seedanceFastVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: geminiImageModelWhere(),
      data: {
        unit: 'image_resolution_tier',
        salePrice: GEMINI_IMAGE_PRICING_TIERS[0].chargedCredits,
        costPrice: GEMINI_IMAGE_PRICING_TIERS[0].costCredits,
        defaults: geminiImageDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: gptImage2ProModelWhere(),
      data: {
        unit: 'image_resolution_tier',
        salePrice: GPT_IMAGE_2_PRO_PRICING_TIERS[0].chargedCredits,
        costPrice: GPT_IMAGE_2_PRO_PRICING_TIERS[0].costCredits,
        defaults: gptImage2ProDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: soraVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SORA_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SORA_VIDEO_PRICING.costCreditsPerSecond,
        defaults: soraVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: soraV4ProVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SORA_V4_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SORA_V4_PRO_VIDEO_PRICING.costCreditsPerSecond,
        defaults: soraV4ProVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: soraProVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SORA_PRO_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SORA_PRO_VIDEO_PRICING.costCreditsPerSecond,
        defaults: soraProVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: soraFastVideoModelWhere(),
      data: {
        unit: 'second',
        pricePerSecond: SORA_FAST_VIDEO_PRICING.chargedCreditsPerSecond,
        costPrice: SORA_FAST_VIDEO_PRICING.costCreditsPerSecond,
        defaults: soraFastVideoDefaults,
      },
    }),
    prisma.aiModel.updateMany({
      where: { type: 'LLM' },
      data: {
        unit: 'token_usd_ratio',
        defaults: defaultPricingDefaults('LLM') as Prisma.InputJsonValue,
      },
    }),
    prisma.aiModel.updateMany({
      where: { type: 'LLM', OR: [{ name: { contains: '5.4', mode: 'insensitive' } }, { displayName: { contains: '5.4', mode: 'insensitive' } }] },
      data: { cnyPerUsdCost: 0.2, creditsPerUsdCost: 20, markupRate: 1 },
    }),
    prisma.aiModel.updateMany({
      where: { type: 'LLM', OR: [{ name: { contains: '5.5', mode: 'insensitive' } }, { displayName: { contains: '5.5', mode: 'insensitive' } }] },
      data: { cnyPerUsdCost: 0.8, creditsPerUsdCost: 80, markupRate: 1 },
    }),
    prisma.systemSetting.upsert({
      where: { key: 'recharge.credits_per_cny' },
      update: {
        label: '每元充值积分',
        group: 'payment',
        valueType: 'NUMBER',
        value: '100',
        isSecret: false,
      },
      create: {
        key: 'recharge.credits_per_cny',
        label: '每元充值积分',
        group: 'payment',
        valueType: 'NUMBER',
        value: '100',
        isSecret: false,
      },
    }),
    prisma.membershipPlan.upsert({
      where: { id: 'seed-monthly-plan' },
      update: {
        name: '月度会员',
        price: MEMBERSHIP_PRICING.monthlyBetaPriceCredits,
        bonusCredits: 0,
        durationDays: MEMBERSHIP_PRICING.durationDays,
        status: 'ACTIVE',
      },
      create: {
        id: 'seed-monthly-plan',
        name: '月度会员',
        price: MEMBERSHIP_PRICING.monthlyBetaPriceCredits,
        bonusCredits: 0,
        durationDays: MEMBERSHIP_PRICING.durationDays,
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(JSON.stringify({
    ok: true,
    imageModels: imageModels.count,
    videoModels: videoModels.count,
    seedanceVipVideoModels: seedanceVipVideoModels.count,
    seedanceFastVideoModels: seedanceFastVideoModels.count,
    geminiImageModels: geminiImageModels.count,
    gptImage2ProModels: gptImage2ProModels.count,
    soraVideoModels: soraVideoModels.count,
    soraV4ProVideoModels: soraV4ProVideoModels.count,
    soraProVideoModels: soraProVideoModels.count,
    soraFastVideoModels: soraFastVideoModels.count,
    llmModels: llmModels.count,
    gpt54Models: gpt54.count,
    gpt55Models: gpt55.count,
    rechargeCreditsPerCny: setting.value,
    monthlyMembership: {
      id: membership.id,
      priceCredits: membership.price,
      futurePriceCredits: MEMBERSHIP_PRICING.monthlyPriceCredits,
      durationDays: membership.durationDays,
    },
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

function geminiImageModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'IMAGE',
    OR: [
      { id: { contains: 'gemini', mode: 'insensitive' } },
      { modelKey: { contains: 'gemini', mode: 'insensitive' } },
      { name: { contains: 'gemini', mode: 'insensitive' } },
      { displayName: { contains: 'gemini', mode: 'insensitive' } },
      { adapter: { in: ['gemini-image', 'gemini-image-generate', 'gemini-image-edit'] } },
      { provider: { providerKey: { contains: 'gemini', mode: 'insensitive' } } },
      { provider: { adapter: { in: ['gemini-image', 'gemini-image-generate', 'gemini-image-edit'] } } },
    ],
  };
}

function gptImage2ProModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'IMAGE',
    OR: [
      { id: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
      { modelKey: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
      { name: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
      { displayName: { contains: 'gpt-image-2-pro', mode: 'insensitive' } },
      { displayName: { contains: 'gpt image 2 pro', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'gpt-image-2-pro', mode: 'insensitive' } } },
      { provider: { name: { contains: 'gpt-image-2-pro', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'gpt-image-2-pro', mode: 'insensitive' } } },
    ],
  };
}

function seedanceFastVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    AND: [
      {
        OR: [
          { id: { contains: 'seedance', mode: 'insensitive' } },
          { modelKey: { contains: 'seedance', mode: 'insensitive' } },
          { name: { contains: 'seedance', mode: 'insensitive' } },
          { displayName: { contains: 'seedance', mode: 'insensitive' } },
          { provider: { providerKey: { contains: 'seedance', mode: 'insensitive' } } },
          { provider: { defaultModel: { contains: 'seedance', mode: 'insensitive' } } },
        ],
      },
      {
        OR: [
          { id: { contains: 'fast', mode: 'insensitive' } },
          { modelKey: { contains: 'fast', mode: 'insensitive' } },
          { name: { contains: 'fast', mode: 'insensitive' } },
          { displayName: { contains: 'fast', mode: 'insensitive' } },
          { provider: { providerKey: { contains: 'fast', mode: 'insensitive' } } },
          { provider: { defaultModel: { contains: 'fast', mode: 'insensitive' } } },
        ],
      },
    ],
  };
}

function seedanceVipVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    OR: [
      { id: { contains: 'seedance2-vip', mode: 'insensitive' } },
      { id: { contains: 'seedance2.0-vip', mode: 'insensitive' } },
      { id: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
      { modelKey: { contains: 'seedance2-vip', mode: 'insensitive' } },
      { modelKey: { contains: 'seedance2.0-vip', mode: 'insensitive' } },
      { modelKey: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
      { name: { contains: 'seedance2-vip', mode: 'insensitive' } },
      { name: { contains: 'seedance2.0-vip', mode: 'insensitive' } },
      { name: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
      { name: { contains: 'sora-vip3-pro', mode: 'insensitive' } },
      { displayName: { contains: 'seedance 2.0 vip', mode: 'insensitive' } },
      { displayName: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
      { adapter: { in: ['seedance2-vip', 'seedance2.0-vip'] } },
      { provider: { adapter: { in: ['seedance2-vip', 'seedance2.0-vip'] } } },
      { provider: { providerKey: { contains: 'seedance2-vip', mode: 'insensitive' } } },
      { provider: { providerKey: { contains: 'seedance-2.0-vip', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'seedance2.0-vip', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'sora-vip3-pro', mode: 'insensitive' } } },
    ],
  };
}

function soraVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    NOT: [
      { adapter: { in: ['seedance2-vip', 'seedance2.0-vip'] } },
      { provider: { adapter: { in: ['seedance2-vip', 'seedance2.0-vip'] } } },
      { provider: { providerKey: { contains: 'seedance2-vip', mode: 'insensitive' } } },
      { id: { contains: 'seedance2-vip', mode: 'insensitive' } },
      { id: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
      { name: { contains: 'sora-vip3-pro', mode: 'insensitive' } },
      { displayName: { contains: 'seedance 2.0 vip', mode: 'insensitive' } },
      { displayName: { contains: 'seedance-2.0-vip', mode: 'insensitive' } },
    ],
    OR: [
      { id: { contains: 'sora', mode: 'insensitive' } },
      { modelKey: { contains: 'sora', mode: 'insensitive' } },
      { name: { contains: 'sora', mode: 'insensitive' } },
      { displayName: { contains: 'sora', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'sora', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'sora', mode: 'insensitive' } } },
    ],
  };
}

function soraFastVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    OR: [
      { id: { contains: 'sora-v3-fast', mode: 'insensitive' } },
      { modelKey: { contains: 'sora-v3-fast', mode: 'insensitive' } },
      { name: { contains: 'sora-v3-fast', mode: 'insensitive' } },
      { displayName: { contains: 'sora-v3-fast', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'sora-v3-fast', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'sora-v3-fast', mode: 'insensitive' } } },
    ],
  };
}

function soraV4ProVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    OR: [
      { id: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { modelKey: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { name: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { displayName: { contains: 'sora-v4-pro', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'sora-v4-pro', mode: 'insensitive' } } },
      { provider: { name: { contains: 'sora-v4-pro', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'sora-v4-pro', mode: 'insensitive' } } },
    ],
  };
}

function soraProVideoModelWhere(): Prisma.AiModelWhereInput {
  return {
    type: 'VIDEO',
    OR: [
      { id: { contains: 'sora-v3-pro', mode: 'insensitive' } },
      { modelKey: { contains: 'sora-v3-pro', mode: 'insensitive' } },
      { name: { contains: 'sora-v3-pro', mode: 'insensitive' } },
      { displayName: { contains: 'sora-v3-pro', mode: 'insensitive' } },
      { provider: { providerKey: { contains: 'sora-v3-pro', mode: 'insensitive' } } },
      { provider: { defaultModel: { contains: 'sora-v3-pro', mode: 'insensitive' } } },
    ],
  };
}
