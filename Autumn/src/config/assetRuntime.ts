export type AssetDataSource = 'mock' | 'api';

export function normalizeAssetDataSource(value: string | undefined): AssetDataSource {
  return value === 'api' ? 'api' : 'mock';
}

export function getAssetDataSource(): AssetDataSource {
  return normalizeAssetDataSource(import.meta.env?.VITE_ASSET_DATA_SOURCE);
}
