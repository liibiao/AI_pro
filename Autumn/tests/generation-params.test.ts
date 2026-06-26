import assert from 'node:assert/strict';
import {
  generationParamLimits,
  normalizeGenerationParams,
  normalizeReferenceAssetIds,
  normalizeSeed,
} from '../src/services/params/generationParamValidation';
import type { GenerationParams } from '../src/types/params';

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

const baseParams: GenerationParams = {
  aspectRatio: '16:9',
  contentWeight: 75,
  crefAssetIds: [],
  durationSeconds: 15,
  imageWeight: 1.2,
  modelId: 'seedance-2',
  seed: null,
  srefAssetIds: [],
  styleWeight: 550,
};

test('normalizeSeed keeps nullable seed and clamps to unsigned 32-bit integer', () => {
  assert.equal(normalizeSeed(null), null);
  assert.equal(normalizeSeed(Number.NaN), null);
  assert.equal(normalizeSeed(-12), generationParamLimits.seed.min);
  assert.equal(normalizeSeed(12.9), 12);
  assert.equal(normalizeSeed(4_294_967_296), generationParamLimits.seed.max);
});

test('normalizeGenerationParams clamps seed, iw, cw, sw, and duration ranges', () => {
  const normalized = normalizeGenerationParams({
    ...baseParams,
    contentWeight: 110,
    durationSeconds: 0,
    imageWeight: 0.1,
    seed: -1,
    styleWeight: 1200,
  });

  assert.equal(normalized.contentWeight, generationParamLimits.contentWeight.max);
  assert.equal(normalized.durationSeconds, generationParamLimits.durationSeconds.min);
  assert.equal(normalized.imageWeight, generationParamLimits.imageWeight.min);
  assert.equal(normalized.seed, generationParamLimits.seed.min);
  assert.equal(normalized.styleWeight, generationParamLimits.styleWeight.max);
});

test('normalizeReferenceAssetIds trims, removes empties, and dedupes ids', () => {
  assert.deepEqual(normalizeReferenceAssetIds([' role-a ', '', 'role-a', 'style-b']), [
    'role-a',
    'style-b',
  ]);
});
