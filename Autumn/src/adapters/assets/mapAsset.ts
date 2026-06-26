import type { BackendAssetDto, UploadAssetResponseDto } from '../../api/assets/assetDto';
import type { AssetItem, AssetType, GenerationStageStatus } from '../../types/pipeline';

interface AssetMappingFallback {
  createdAt?: string;
  fileSize?: number;
  id: string;
  mimeType?: string;
  name: string;
  sourceUrl?: string;
  thumbnail?: string;
  type: AssetType;
}

function mapAssetType(type: string | null | undefined, fallbackType: AssetType): AssetType {
  const normalized = String(type ?? '').trim().toLowerCase();

  if (['image', 'audio', 'video', 'document'].includes(normalized)) {
    return normalized as AssetType;
  }

  return fallbackType;
}

function mapAssetStatus(status: string | null | undefined): GenerationStageStatus {
  const normalized = String(status ?? '').trim().toUpperCase();

  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'DONE'].includes(normalized)) {
    return 'completed';
  }

  if (['FAILED', 'FAILURE', 'ERROR', 'CANCELED', 'CANCELLED'].includes(normalized)) {
    return 'failed';
  }

  if (['RUNNING', 'PROCESSING', 'UPLOADING', 'IN_PROGRESS'].includes(normalized)) {
    return 'running';
  }

  return 'completed';
}

function clampProgress(progress: number | null | undefined, status: GenerationStageStatus): number {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  return status === 'completed' ? 100 : 0;
}

function getThumbnail(dto: BackendAssetDto, sourceUrl: string | undefined, type: AssetType): string | undefined {
  if (dto.thumbnailStyle) {
    return dto.thumbnailStyle;
  }

  if (dto.thumbnailUrl) {
    return `url(${dto.thumbnailUrl}) center/cover`;
  }

  if (sourceUrl && (type === 'image' || type === 'video')) {
    return `url(${sourceUrl}) center/cover`;
  }

  return undefined;
}

export function mapBackendAsset(dto: BackendAssetDto, fallback: AssetMappingFallback): AssetItem {
  const type = mapAssetType(dto.type, fallback.type);
  const status = mapAssetStatus(dto.status);
  const sourceUrl = dto.sourceUrl ?? dto.url ?? fallback.sourceUrl;
  const thumbnail = getThumbnail(dto, sourceUrl, type) ?? fallback.thumbnail;

  return {
    id: fallback.id,
    name: dto.name ?? fallback.name,
    type,
    status,
    createdAt: dto.createdAt ?? dto.updatedAt ?? fallback.createdAt,
    fileSize: dto.fileSize ?? fallback.fileSize,
    isFavorite: Boolean(dto.isFavorite),
    mimeType: dto.mimeType ?? fallback.mimeType,
    origin: dto.origin === 'generated' ? 'generated' : 'uploaded',
    progress: clampProgress(dto.progress, status),
    ...(dto.id && dto.id !== fallback.id ? { remoteId: dto.id } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}

export function mapUploadAssetResponse(
  response: UploadAssetResponseDto,
  fallback: AssetMappingFallback,
): AssetItem {
  return mapBackendAsset(response.asset, fallback);
}
