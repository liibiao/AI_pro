import type { AssetItem } from '../../types/pipeline';

type RevokeObjectUrl = (url: string) => void;

const objectUrlPattern = /\bblob:[^'")\s]+/g;

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

export function extractObjectUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return uniqueUrls(value.match(objectUrlPattern) ?? []);
}

export function collectAssetObjectUrls(asset: Pick<AssetItem, 'sourceUrl' | 'thumbnail'>): string[] {
  return uniqueUrls([
    ...extractObjectUrls(asset.sourceUrl),
    ...extractObjectUrls(asset.thumbnail),
  ]);
}

export function collectAssetsObjectUrls(assets: Array<Pick<AssetItem, 'sourceUrl' | 'thumbnail'>>): string[] {
  return uniqueUrls(assets.flatMap(collectAssetObjectUrls));
}

export function revokeObjectUrls(
  urls: string[],
  revokeObjectUrl: RevokeObjectUrl = (url) => URL.revokeObjectURL(url),
) {
  uniqueUrls(urls).forEach((url) => {
    try {
      revokeObjectUrl(url);
    } catch {
      // Object URL cleanup must never interrupt editor state transitions.
    }
  });
}

export function revokeAssetsObjectUrls(
  assets: Array<Pick<AssetItem, 'sourceUrl' | 'thumbnail'>>,
  revokeObjectUrl?: RevokeObjectUrl,
) {
  revokeObjectUrls(collectAssetsObjectUrls(assets), revokeObjectUrl);
}

export function collectReplacedAssetObjectUrls(
  previousAssets: Array<Pick<AssetItem, 'id' | 'sourceUrl' | 'thumbnail'>>,
  nextAssets: Array<Pick<AssetItem, 'id' | 'sourceUrl' | 'thumbnail'>>,
): string[] {
  const nextAssetsById = new Map(nextAssets.map((asset) => [asset.id, asset]));

  return uniqueUrls(
    previousAssets.flatMap((previousAsset) => {
      const nextAsset = nextAssetsById.get(previousAsset.id);

      if (!nextAsset) {
        return collectAssetObjectUrls(previousAsset);
      }

      const nextUrls = new Set(collectAssetObjectUrls(nextAsset));
      return collectAssetObjectUrls(previousAsset).filter((url) => !nextUrls.has(url));
    }),
  );
}

export function revokeReplacedAssetObjectUrls(
  previousAssets: Array<Pick<AssetItem, 'id' | 'sourceUrl' | 'thumbnail'>>,
  nextAssets: Array<Pick<AssetItem, 'id' | 'sourceUrl' | 'thumbnail'>>,
  revokeObjectUrl?: RevokeObjectUrl,
) {
  revokeObjectUrls(collectReplacedAssetObjectUrls(previousAssets, nextAssets), revokeObjectUrl);
}
