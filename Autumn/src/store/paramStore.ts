import { useMemo, useReducer } from 'react';
import {
  normalizeContentWeight,
  normalizeDurationSeconds,
  normalizeGenerationParams,
  normalizeImageWeight,
  normalizeSeed,
  normalizeStyleWeight,
} from '../services/params/generationParamValidation';
import type { GenerationParams, ReferenceKind } from '../types/params';

type ParamStoreAction =
  | { type: 'setModel'; modelId: string }
  | { type: 'setSeed'; seed: number | null }
  | { type: 'setImageWeight'; imageWeight: number }
  | { type: 'toggleReferenceAsset'; kind: ReferenceKind; assetId: string }
  | { type: 'setReferenceWeight'; kind: ReferenceKind; weight: number }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setAspectRatio'; aspectRatio: GenerationParams['aspectRatio'] };

export const initialGenerationParams: GenerationParams = {
  modelId: 'seedance-2',
  seed: null,
  imageWeight: 1.2,
  crefAssetIds: [],
  srefAssetIds: [],
  contentWeight: 75,
  styleWeight: 550,
  durationSeconds: 15,
  aspectRatio: '16:9',
};

export interface ParamStoreController {
  state: GenerationParams;
  setModel: (modelId: string) => void;
  setSeed: (seed: number | null) => void;
  setImageWeight: (imageWeight: number) => void;
  toggleReferenceAsset: (kind: ReferenceKind, assetId: string) => void;
  setReferenceWeight: (kind: ReferenceKind, weight: number) => void;
  setDuration: (durationSeconds: number) => void;
  setAspectRatio: (aspectRatio: GenerationParams['aspectRatio']) => void;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function paramReducer(
  state: GenerationParams,
  action: ParamStoreAction,
): GenerationParams {
  switch (action.type) {
    case 'setModel':
      return { ...state, modelId: action.modelId };
    case 'setSeed':
      return { ...state, seed: normalizeSeed(action.seed) };
    case 'setImageWeight':
      return { ...state, imageWeight: normalizeImageWeight(action.imageWeight) };
    case 'toggleReferenceAsset':
      return action.kind === 'cref'
        ? { ...state, crefAssetIds: toggleValue(state.crefAssetIds, action.assetId) }
        : { ...state, srefAssetIds: toggleValue(state.srefAssetIds, action.assetId) };
    case 'setReferenceWeight':
      return action.kind === 'cref'
        ? { ...state, contentWeight: normalizeContentWeight(action.weight) }
        : { ...state, styleWeight: normalizeStyleWeight(action.weight) };
    case 'setDuration':
      return { ...state, durationSeconds: normalizeDurationSeconds(action.durationSeconds) };
    case 'setAspectRatio':
      return { ...state, aspectRatio: action.aspectRatio };
    default:
      return normalizeGenerationParams(state);
  }
}

export function useParamStore(): ParamStoreController {
  const [state, dispatch] = useReducer(paramReducer, initialGenerationParams);

  return useMemo(
    () => ({
      state,
      setModel: (modelId: string) => dispatch({ type: 'setModel', modelId }),
      setSeed: (seed: number | null) => dispatch({ type: 'setSeed', seed }),
      setImageWeight: (imageWeight: number) => dispatch({ type: 'setImageWeight', imageWeight }),
      toggleReferenceAsset: (kind: ReferenceKind, assetId: string) =>
        dispatch({ type: 'toggleReferenceAsset', kind, assetId }),
      setReferenceWeight: (kind: ReferenceKind, weight: number) =>
        dispatch({ type: 'setReferenceWeight', kind, weight }),
      setDuration: (durationSeconds: number) => dispatch({ type: 'setDuration', durationSeconds }),
      setAspectRatio: (aspectRatio: GenerationParams['aspectRatio']) =>
        dispatch({ type: 'setAspectRatio', aspectRatio }),
    }),
    [state],
  );
}
