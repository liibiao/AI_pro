import type { AssetType, GenerationStageStatus } from '../../types/pipeline';

export interface BackendAssetDto {
  createdAt?: string | null;
  fileSize?: number | null;
  id?: string | null;
  isFavorite?: boolean | null;
  mimeType?: string | null;
  name?: string | null;
  origin?: string | null;
  progress?: number | null;
  sourceUrl?: string | null;
  status?: string | null;
  thumbnailUrl?: string | null;
  thumbnailStyle?: string | null;
  type?: AssetType | string | null;
  updatedAt?: string | null;
  url?: string | null;
}

export interface UploadAssetResponseDto {
  asset: BackendAssetDto;
  ok?: boolean;
}

export interface UploadAssetRequestMetaDto {
  clientAssetId?: string;
  projectId?: string;
}

export interface AssetUploadProgressDto {
  assetId: string;
  progress: number;
  status: GenerationStageStatus;
}
