import type { GenerationParams } from '../../types/params';

export const generationParamLimits = {
  seed: {
    min: 0,
    max: 4_294_967_295,
  },
  imageWeight: {
    min: 0.5,
    max: 3,
  },
  contentWeight: {
    min: 0,
    max: 100,
  },
  styleWeight: {
    min: 0,
    max: 1000,
  },
  durationSeconds: {
    min: 1,
    max: 180,
  },
} as const;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clampNumber(value, min, max));
}

export function normalizeSeed(seed: number | null): number | null {
  if (seed === null || !Number.isFinite(seed)) {
    return null;
  }

  return clampInteger(seed, generationParamLimits.seed.min, generationParamLimits.seed.max);
}

export function normalizeImageWeight(imageWeight: number): number {
  return clampNumber(
    imageWeight,
    generationParamLimits.imageWeight.min,
    generationParamLimits.imageWeight.max,
  );
}

export function normalizeContentWeight(contentWeight: number): number {
  return clampNumber(
    contentWeight,
    generationParamLimits.contentWeight.min,
    generationParamLimits.contentWeight.max,
  );
}

export function normalizeStyleWeight(styleWeight: number): number {
  return clampNumber(
    styleWeight,
    generationParamLimits.styleWeight.min,
    generationParamLimits.styleWeight.max,
  );
}

export function normalizeDurationSeconds(durationSeconds: number): number {
  return clampInteger(
    durationSeconds,
    generationParamLimits.durationSeconds.min,
    generationParamLimits.durationSeconds.max,
  );
}

export function normalizeReferenceAssetIds(assetIds: string[]): string[] {
  return [...new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean))];
}

export function normalizeGenerationParams(params: GenerationParams): GenerationParams {
  return {
    ...params,
    contentWeight: normalizeContentWeight(params.contentWeight),
    crefAssetIds: normalizeReferenceAssetIds(params.crefAssetIds),
    durationSeconds: normalizeDurationSeconds(params.durationSeconds),
    imageWeight: normalizeImageWeight(params.imageWeight),
    seed: normalizeSeed(params.seed),
    srefAssetIds: normalizeReferenceAssetIds(params.srefAssetIds),
    styleWeight: normalizeStyleWeight(params.styleWeight),
  };
}
