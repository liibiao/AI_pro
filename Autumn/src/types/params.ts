export type ReferenceKind = 'cref' | 'sref';

export interface GenerationParams {
  modelId: string;
  seed: number | null;
  imageWeight: number;
  crefAssetIds: string[];
  srefAssetIds: string[];
  contentWeight: number;
  styleWeight: number;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
}
