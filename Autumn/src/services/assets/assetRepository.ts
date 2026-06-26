import { uploadAsset } from '../../api/assets/assetApi';
import type { AssetUploadProgressDto } from '../../api/assets/assetDto';
import { mapUploadAssetResponse } from '../../adapters/assets/mapAsset';
import { getAssetDataSource } from '../../config/assetRuntime';
import type { AssetItem } from '../../types/pipeline';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';
import {
  createLocalAssetId,
  createLocalAssetsFromFiles,
  createUploadPlaceholderAssetsFromFiles,
} from './createLocalAssets';

export interface AssetRepositoryContext {
  authSession?: AuthSession;
  onProgress?: (progress: AssetUploadProgressDto) => void;
  projectId?: string;
  timestamp?: number;
}

function getAuthHeaders(context: AssetRepositoryContext): Record<string, string> {
  return context.authSession ? createAuthHeaders(context.authSession) : {};
}

function canUseApi(context: AssetRepositoryContext): boolean {
  return (
    getAssetDataSource() === 'api' &&
    context.authSession?.status === 'authenticated' &&
    Boolean(context.authSession.accessToken)
  );
}

export function createUploadPlaceholderAssets(
  files: File[],
  timestamp = Date.now(),
): AssetItem[] {
  return createUploadPlaceholderAssetsFromFiles(files, timestamp);
}

export async function uploadConfiguredAssets(
  files: File[],
  context: AssetRepositoryContext = {},
): Promise<AssetItem[]> {
  const timestamp = context.timestamp ?? Date.now();

  if (!canUseApi(context)) {
    const assets = createLocalAssetsFromFiles(files, timestamp);
    assets.forEach((asset) => {
      context.onProgress?.({
        assetId: asset.id,
        progress: 100,
        status: 'completed',
      });
    });
    return assets;
  }

  return Promise.all(
    files.map(async (file, index) => {
      const fallbackAsset = createLocalAssetsFromFiles([file], timestamp + index)[0]!;
      const clientAssetId = createLocalAssetId(file, index, timestamp);
      const response = await uploadAsset(
        file,
        {
          clientAssetId,
          projectId: context.projectId,
        },
        {
          authHeaders: getAuthHeaders(context),
          onProgress: context.onProgress,
        },
      );

      return mapUploadAssetResponse(response, {
        createdAt: fallbackAsset.createdAt,
        fileSize: fallbackAsset.fileSize,
        id: clientAssetId,
        mimeType: fallbackAsset.mimeType,
        name: fallbackAsset.name,
        sourceUrl: fallbackAsset.sourceUrl,
        thumbnail: fallbackAsset.thumbnail,
        type: fallbackAsset.type,
      });
    }),
  );
}
