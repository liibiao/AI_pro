export const CREDITS_PER_CNY = 100;
export const CREDITS_PER_FEN = 1;
export const TARGET_GROSS_MARGIN_RATE = 0.3;
export const MEMBER_CREDIT_DISCOUNT_RATE = 0.4;

export const IMAGE_PRICING_TIERS = [
  { tier: '1K', chargedCredits: 5, originalCredits: 12, costCredits: 3.5, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '2K', chargedCredits: 8, originalCredits: 20, costCredits: 5.6, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '3K', chargedCredits: 25, originalCredits: 62, costCredits: 17.5, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '4K', chargedCredits: 50, originalCredits: 125, costCredits: 35, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
] as const;

export const GPT_IMAGE_2_PRO_PRICING_TIERS = [
  { tier: '1K', chargedCredits: 5, originalCredits: 12, costCredits: 3.5, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '2K', chargedCredits: 8, originalCredits: 20, costCredits: 5.6, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '3K', chargedCredits: 20, originalCredits: 50, costCredits: 14, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '4K', chargedCredits: 40, originalCredits: 100, costCredits: 28, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
] as const;

export const GEMINI_IMAGE_PRICING_TIERS = [
  { tier: '1K', chargedCredits: 15, originalCredits: 37, costCredits: 10.5, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '2K', chargedCredits: 15, originalCredits: 37, costCredits: 10.5, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '3K', chargedCredits: 20, originalCredits: 50, costCredits: 14, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
  { tier: '4K', chargedCredits: 20, originalCredits: 50, costCredits: 14, grossMarginRate: TARGET_GROSS_MARGIN_RATE },
] as const;

export const VIDEO_PRICING = {
  chargedCreditsPerSecond: 25,
  originalCreditsPerSecond: 62,
  costCreditsPerSecond: 17.5,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const SEEDANCE_FAST_VIDEO_PRICING = {
  chargedCreditsPerSecond: 18,
  originalCreditsPerSecond: 45,
  costCreditsPerSecond: 12.6,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const SEEDANCE_VIP_VIDEO_PRICING = {
  chargedCreditsPerSecond: 34,
  originalCreditsPerSecond: 85,
  costCreditsPerSecond: 23.8,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
  resolutionTiers: [
    { resolution: '720p', chargedCreditsPerSecond: 34, originalCreditsPerSecond: 85, costCreditsPerSecond: 23.8 },
    { resolution: '1080p', chargedCreditsPerSecond: 54, originalCreditsPerSecond: 135, costCreditsPerSecond: 37.8 },
  ],
};

export const SORA_VIDEO_PRICING = {
  chargedCreditsPerSecond: 5,
  originalCreditsPerSecond: 12,
  costCreditsPerSecond: 3.5,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const SORA_PRO_VIDEO_PRICING = {
  chargedCreditsPerSecond: 25,
  originalCreditsPerSecond: 63,
  costCreditsPerSecond: 17.5,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const SORA_V4_PRO_VIDEO_PRICING = {
  chargedCreditsPerSecond: 48,
  originalCreditsPerSecond: 120,
  costCreditsPerSecond: 33.6,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const SORA_FAST_VIDEO_PRICING = {
  chargedCreditsPerSecond: 18,
  originalCreditsPerSecond: 45,
  costCreditsPerSecond: 12.6,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
};

export const MEMBERSHIP_PRICING = {
  monthlyPriceCredits: 2900,
  monthlyBetaPriceCredits: 2900,
  durationDays: 30,
};

export function imagePricingDefaults(tiers: ReadonlyArray<{ tier: string; chargedCredits: number; originalCredits?: number; costCredits: number; grossMarginRate: number }>) {
  return {
    pricing: {
      unit: 'image_resolution_tier',
      currency: 'credits',
      creditsPerCny: CREDITS_PER_CNY,
      memberDiscountRate: MEMBER_CREDIT_DISCOUNT_RATE,
      tiers,
    },
  };
}

export function videoPricingDefaults(pricing: {
  chargedCreditsPerSecond: number;
  originalCreditsPerSecond?: number;
  costCreditsPerSecond: number;
  grossMarginRate: number;
  resolutionTiers?: ReadonlyArray<{
    resolution: string;
    chargedCreditsPerSecond: number;
    originalCreditsPerSecond?: number;
    costCreditsPerSecond: number;
  }>;
}) {
  return {
    pricing: {
      unit: 'second',
      currency: 'credits',
      creditsPerCny: CREDITS_PER_CNY,
      memberDiscountRate: MEMBER_CREDIT_DISCOUNT_RATE,
      ...pricing,
    },
  };
}

export function defaultPricingDefaults(type: 'IMAGE' | 'VIDEO' | 'LLM') {
  if (type === 'IMAGE') {
    return imagePricingDefaults(IMAGE_PRICING_TIERS);
  }
  if (type === 'VIDEO') {
    return videoPricingDefaults(VIDEO_PRICING);
  }
  return {
    pricing: {
      unit: 'token_usd_ratio',
      currency: 'credits',
      creditsPerCny: CREDITS_PER_CNY,
      memberDiscountRate: MEMBER_CREDIT_DISCOUNT_RATE,
    },
  };
}
