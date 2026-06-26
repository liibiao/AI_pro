import type { AssetItem, AssetType } from '../../types/pipeline';

interface CreateLocalAssetOptions {
  progress?: number;
  status?: AssetItem['status'];
}

export function getAssetTypeFromFile(file: Pick<File, 'type'>): AssetType {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  if (file.type.startsWith('video/')) {
    return 'video';
  }

  if (file.type.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
}

export function createLocalAssetId(
  file: Pick<File, 'name'>,
  index: number,
  timestamp: number,
): string {
  const normalizedName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const safeName = normalizedName || 'asset';

  return `asset-upload-${safeName}-${timestamp}-${index + 1}`;
}

function createObjectUrl(file: File): string | undefined {
  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

function createLocalAssetFromFile(
  file: File,
  index: number,
  timestamp: number,
  options: CreateLocalAssetOptions = {},
): AssetItem {
  const type = getAssetTypeFromFile(file);
  const sourceUrl = createObjectUrl(file);
  const status = options.status ?? 'completed';

  return {
    id: createLocalAssetId(file, index, timestamp),
    name: file.name,
    type,
    status,
    createdAt: new Date(timestamp + index).toISOString(),
    fileSize: file.size,
    isFavorite: false,
    mimeType: file.type || undefined,
    origin: 'uploaded',
    ...(typeof options.progress === 'number' ? { progress: options.progress } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(type === 'image' && sourceUrl ? { thumbnail: `url(${sourceUrl}) center/cover` } : {}),
  };
}

export function createLocalAssetsFromFiles(files: File[], timestamp = Date.now()): AssetItem[] {
  return files.map((file, index) => createLocalAssetFromFile(file, index, timestamp));
}

export function createUploadPlaceholderAssetsFromFiles(
  files: File[],
  timestamp = Date.now(),
): AssetItem[] {
  return files.map((file, index) =>
    createLocalAssetFromFile(file, index, timestamp, {
      progress: 1,
      status: 'running',
    }),
  );
}
