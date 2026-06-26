import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type {
  AssetUploadProgressDto,
  UploadAssetRequestMetaDto,
  UploadAssetResponseDto,
} from './assetDto';

const assetApiBase =
  import.meta.env?.VITE_ASSET_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface AssetApiOptions {
  authHeaders?: Record<string, string>;
  onProgress?: (progress: AssetUploadProgressDto) => void;
}

function createUploadFormData(file: File, meta: UploadAssetRequestMetaDto): FormData {
  const formData = new FormData();
  formData.append('file', file);

  if (meta.clientAssetId) {
    formData.append('clientAssetId', meta.clientAssetId);
  }

  if (meta.projectId) {
    formData.append('projectId', meta.projectId);
  }

  return formData;
}

function parseUploadResponse(text: string): UploadAssetResponseDto {
  try {
    return JSON.parse(text) as UploadAssetResponseDto;
  } catch {
    throw new Error('Asset upload API returned invalid JSON.');
  }
}

function uploadAssetWithXhr(
  file: File,
  meta: UploadAssetRequestMetaDto,
  options: AssetApiOptions,
): Promise<UploadAssetResponseDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const assetId = meta.clientAssetId ?? file.name;

    xhr.open('POST', joinPlatformApiUrl(assetApiBase, '/api/assets/upload'));

    Object.entries(options.authHeaders ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      options.onProgress?.({
        assetId,
        progress: Math.max(1, Math.min(95, Math.round((event.loaded / event.total) * 95))),
        status: 'running',
      });
    };

    xhr.onerror = () => reject(new Error('Asset upload API request failed.'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Asset upload API request failed: ${xhr.status}`));
        return;
      }

      options.onProgress?.({ assetId, progress: 100, status: 'completed' });
      resolve(parseUploadResponse(xhr.responseText));
    };

    xhr.send(createUploadFormData(file, meta));
  });
}

async function uploadAssetWithFetch(
  file: File,
  meta: UploadAssetRequestMetaDto,
  options: AssetApiOptions,
): Promise<UploadAssetResponseDto> {
  const assetId = meta.clientAssetId ?? file.name;
  options.onProgress?.({ assetId, progress: 25, status: 'running' });

  const response = await fetch(joinPlatformApiUrl(assetApiBase, '/api/assets/upload'), {
    method: 'POST',
    headers: options.authHeaders,
    body: createUploadFormData(file, meta),
  });

  if (!response.ok) {
    throw new Error(`Asset upload API request failed: ${response.status}`);
  }

  options.onProgress?.({ assetId, progress: 100, status: 'completed' });
  return response.json() as Promise<UploadAssetResponseDto>;
}

export function uploadAsset(
  file: File,
  meta: UploadAssetRequestMetaDto = {},
  options: AssetApiOptions = {},
): Promise<UploadAssetResponseDto> {
  if (typeof XMLHttpRequest !== 'undefined') {
    return uploadAssetWithXhr(file, meta, options);
  }

  return uploadAssetWithFetch(file, meta, options);
}
