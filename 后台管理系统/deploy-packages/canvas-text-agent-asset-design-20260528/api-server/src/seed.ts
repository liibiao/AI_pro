import { prisma } from './db.js';
import { hashPassword, encryptSecret } from './security.js';
import { defaultPricingDefaults, IMAGE_PRICING_TIERS, MEMBERSHIP_PRICING, VIDEO_PRICING } from './pricing.js';

async function main() {
  const defaultPhone = '13800000000';
  const defaultPassword = 'admin123456';
  const isProduction = process.env.NODE_ENV === 'production';
  const phone = process.env.ADMIN_INITIAL_PHONE || (isProduction ? '' : defaultPhone);
  const password = process.env.ADMIN_INITIAL_PASSWORD || (isProduction ? '' : defaultPassword);
  if (!phone || !password) {
    throw new Error('生产环境必须显式设置 ADMIN_INITIAL_PHONE 和 ADMIN_INITIAL_PASSWORD 后才能创建初始管理员。');
  }
  if (isProduction && (phone === defaultPhone || password === defaultPassword)) {
    throw new Error('生产环境禁止使用默认测试管理员账号或密码。');
  }
  const admin = await prisma.user.upsert({
    where: { phone },
    update: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
    create: {
      phone,
      nickname: '超级管理员',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(password),
      wallet: { create: { balance: 0 } },
    },
  });

  const provider = await prisma.upstreamProvider.upsert({
    where: { id: 'seed-provider' },
    update: {},
    create: {
      id: 'seed-provider',
      providerKey: 'seed_default',
      name: '默认上游中转',
      type: null,
      adapter: 'openai-image',
      baseUrl: 'https://example.com/v1',
      apiKeyEncrypted: encryptSecret('replace-me'),
      status: 'DISABLED',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: 'seed-gpt-image-2' },
    update: {
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: IMAGE_PRICING_TIERS[0].costCredits,
      defaults: defaultPricingDefaults('IMAGE'),
    },
    create: {
      id: 'seed-gpt-image-2',
      providerId: provider.id,
      name: 'gpt-image-2',
      displayName: 'GPT Image 2',
      type: 'IMAGE',
      unit: 'image_resolution_tier',
      salePrice: IMAGE_PRICING_TIERS[0].chargedCredits,
      costPrice: IMAGE_PRICING_TIERS[0].costCredits,
      adapter: 'openai-edits',
      endpointPath: '/images/edits',
      uploadMode: 'files',
      protocol: { adapter: 'openai-edits', endpointPath: '/images/edits', uploadMode: 'files' },
      supports: { txt2img: true, img2img: true },
      defaults: defaultPricingDefaults('IMAGE'),
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: 'seed-video-basic' },
    update: {
      unit: 'second',
      pricePerSecond: VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: VIDEO_PRICING.costCreditsPerSecond,
      defaults: defaultPricingDefaults('VIDEO'),
    },
    create: {
      id: 'seed-video-basic',
      providerId: provider.id,
      name: 'video-generation',
      displayName: '视频生成模型',
      type: 'VIDEO',
      unit: 'second',
      pricePerSecond: VIDEO_PRICING.chargedCreditsPerSecond,
      costPrice: VIDEO_PRICING.costCreditsPerSecond,
      adapter: 'notevideo',
      endpointPath: '/videos',
      statusEndpointPath: '/videos/{taskId}',
      protocol: { adapter: 'notevideo', method: 'async-poll', endpointPath: '/videos', statusEndpointPath: '/videos/{taskId}' },
      supports: { txt2video: true, img2video: true },
      defaults: defaultPricingDefaults('VIDEO'),
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: 'seed-gpt-5-4' },
    update: {
      unit: 'token_usd_ratio',
      cnyPerUsdCost: 0.2,
      creditsPerUsdCost: 20,
      markupRate: 1,
      defaults: defaultPricingDefaults('LLM'),
    },
    create: {
      id: 'seed-gpt-5-4',
      providerId: provider.id,
      name: 'gpt-5.4',
      displayName: 'GPT 5.4',
      type: 'LLM',
      unit: 'token_usd_ratio',
      inputPriceUsdPer1m: 1,
      outputPriceUsdPer1m: 5,
      cnyPerUsdCost: 0.2,
      creditsPerUsdCost: 20,
      markupRate: 1,
      defaults: defaultPricingDefaults('LLM'),
      adapter: 'openai-chat',
      endpointPath: '/chat/completions',
      status: 'ACTIVE',
    },
  });

  await prisma.aiModel.upsert({
    where: { id: 'seed-gpt-5-5' },
    update: {
      unit: 'token_usd_ratio',
      cnyPerUsdCost: 0.8,
      creditsPerUsdCost: 80,
      markupRate: 1,
      defaults: defaultPricingDefaults('LLM'),
    },
    create: {
      id: 'seed-gpt-5-5',
      providerId: provider.id,
      name: 'gpt-5.5',
      displayName: 'GPT 5.5',
      type: 'LLM',
      unit: 'token_usd_ratio',
      inputPriceUsdPer1m: 1,
      outputPriceUsdPer1m: 5,
      cnyPerUsdCost: 0.8,
      creditsPerUsdCost: 80,
      markupRate: 1,
      defaults: defaultPricingDefaults('LLM'),
      adapter: 'openai-chat',
      endpointPath: '/chat/completions',
      status: 'ACTIVE',
    },
  });

  await prisma.membershipPlan.upsert({
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
  });

  console.log(`Seed complete. Admin phone=${phone}, password=${password}, id=${admin.id}`);
}

main().finally(() => prisma.$disconnect());
