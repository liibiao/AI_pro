import type { GenerationStageStatus } from './pipeline';

export type GenerationTaskKind = 'pipeline' | 'image' | 'video' | 'audio' | 'document';

export interface GenerationTask {
  id: string;
  label: string;
  kind: GenerationTaskKind;
  status: GenerationStageStatus;
  progress: number;
  clientRequestId?: string;
  errorMessage?: string;
  modelId?: string;
  providerKey?: string;
  resultText?: string;
  resultUrls?: string[];
  sourceAssetId?: string;
  sourceElementId?: string;
  targetAssetSlot?: string;
  updatedAt: string;
}
