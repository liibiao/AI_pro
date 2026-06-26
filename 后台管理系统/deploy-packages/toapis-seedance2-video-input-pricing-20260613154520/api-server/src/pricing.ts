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

function marginCost(memberCredits: number) {
  return Number((memberCredits * (1 - TARGET_GROSS_MARGIN_RATE)).toFixed(4));
}

function toapisSeedanceTier(
  resolution: string,
  noVideoOriginal: number,
  noVideoMember: number,
  videoOriginalOutput: number,
  videoMemberOutput: number,
  videoOriginalInput: number,
  videoMemberInput: number,
) {
  const withVideoOriginal = videoOriginalOutput + videoOriginalInput;
  const withVideoMember = videoMemberOutput + videoMemberInput;
  return {
    resolution,
    chargedCreditsPerSecond: noVideoMember,
    memberCreditsPerSecond: noVideoMember,
    originalCreditsPerSecond: noVideoOriginal,
    costCreditsPerSecond: marginCost(noVideoMember),
    scenarioTiers: [
      {
        scenario: 'no_video_input',
        label: '无视频输入',
        hasVideoInput: false,
        outputCreditsPerSecond: noVideoMember,
        inputCreditsPerSecond: 0,
        chargedCreditsPerSecond: noVideoMember,
        memberCreditsPerSecond: noVideoMember,
        originalOutputCreditsPerSecond: noVideoOriginal,
        originalInputCreditsPerSecond: 0,
        originalCreditsPerSecond: noVideoOriginal,
        costCreditsPerSecond: marginCost(noVideoMember),
      },
      {
        scenario: 'with_video_input',
        label: '有视频输入',
        hasVideoInput: true,
        outputCreditsPerSecond: videoMemberOutput,
        inputCreditsPerSecond: videoMemberInput,
        chargedCreditsPerSecond: withVideoMember,
        memberCreditsPerSecond: withVideoMember,
        originalOutputCreditsPerSecond: videoOriginalOutput,
        originalInputCreditsPerSecond: videoOriginalInput,
        originalCreditsPerSecond: withVideoOriginal,
        costCreditsPerSecond: marginCost(withVideoMember),
      },
    ],
  };
}

export const TOAPIS_SEEDANCE2_VIDEO_PRICING = {
  chargedCreditsPerSecond: 45,
  memberCreditsPerSecond: 45,
  originalCreditsPerSecond: 50,
  costCreditsPerSecond: 31.5,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
  memberDiscountRate: 0.9,
  resolutionTiers: [
    toapisSeedanceTier('480p', 50, 45, 30, 27, 30, 27),
    toapisSeedanceTier('720p', 100, 90, 60, 54, 60, 54),
    toapisSeedanceTier('1080p', 250, 225, 150, 135, 150, 135),
  ],
};

export const TOAPIS_SEEDANCE2_FAST_VIDEO_PRICING = {
  chargedCreditsPerSecond: 36,
  memberCreditsPerSecond: 36,
  originalCreditsPerSecond: 40,
  costCreditsPerSecond: 25.2,
  grossMarginRate: TARGET_GROSS_MARGIN_RATE,
  memberDiscountRate: 0.9,
  resolutionTiers: [
    toapisSeedanceTier('480p', 40, 36, 20, 18, 20, 18),
    toapisSeedanceTier('720p', 80, 72, 50, 45, 50, 45),
  ],
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
  memberCreditsPerSecond?: number;
  originalCreditsPerSecond?: number;
  costCreditsPerSecond: number;
  grossMarginRate: number;
  memberDiscountRate?: number;
  resolutionTiers?: ReadonlyArray<{
    resolution: string;
    memberCreditsPerSecond?: number;
    chargedCreditsPerSecond: number;
    originalCreditsPerSecond?: number;
    costCreditsPerSecond: number;
    scenarioTiers?: ReadonlyArray<{
      scenario?: string;
      label?: string;
      hasVideoInput?: boolean;
      inputCreditsPerSecond?: number;
      outputCreditsPerSecond?: number;
      chargedCreditsPerSecond?: number;
      memberCreditsPerSecond?: number;
      originalInputCreditsPerSecond?: number;
      originalOutputCreditsPerSecond?: number;
      originalCreditsPerSecond?: number;
      costCreditsPerSecond?: number;
    }>;
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
