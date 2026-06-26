import type {
  AssetItem,
  AssetType,
  GenerationStageStatus,
  StoryboardElement,
} from '../../types/pipeline';

export type AssetLibraryTypeFilter = AssetType | 'all';
export type AssetLibraryStatusFilter = GenerationStageStatus | 'all';
export type AssetLibraryAssignmentFilter = 'all' | 'unassigned';
export type AssetLibraryFavoriteFilter = 'all' | 'favorite';

export interface AssetLibraryFilters {
  type?: AssetLibraryTypeFilter;
  status?: AssetLibraryStatusFilter;
  assignment?: AssetLibraryAssignmentFilter;
  favorite?: AssetLibraryFavoriteFilter;
}

export interface AssetLibrarySummary {
  total: number;
  favorites: number;
  unassigned: number;
  byType: Record<AssetType, number>;
  byStatus: Record<GenerationStageStatus, number>;
}

export function getAssignedAssetIds(storyboardElements: StoryboardElement[]): Set<string> {
  return new Set(
    storyboardElements.flatMap((element) => element.assets.map((asset) => asset.id)),
  );
}

export function filterAssetLibraryItems(
  assets: AssetItem[],
  filters: AssetLibraryFilters = {},
  assignedAssetIds: Set<string> = new Set(),
): AssetItem[] {
  const typeFilter = filters.type ?? 'all';
  const statusFilter = filters.status ?? 'all';
  const assignmentFilter = filters.assignment ?? 'all';
  const favoriteFilter = filters.favorite ?? 'all';

  return assets.filter((asset) => {
    const matchesType = typeFilter === 'all' || asset.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    const matchesAssignment =
      assignmentFilter === 'all' || !assignedAssetIds.has(asset.id);
    const matchesFavorite = favoriteFilter === 'all' || Boolean(asset.isFavorite);

    return matchesType && matchesStatus && matchesAssignment && matchesFavorite;
  });
}

export function summarizeAssetLibrary(
  assets: AssetItem[],
  assignedAssetIds: Set<string> = new Set(),
): AssetLibrarySummary {
  const byType: Record<AssetType, number> = {
    image: 0,
    audio: 0,
    video: 0,
    document: 0,
  };
  const byStatus: Record<GenerationStageStatus, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };

  assets.forEach((asset) => {
    byType[asset.type] += 1;
    byStatus[asset.status] += 1;
  });

  return {
    total: assets.length,
    favorites: assets.filter((asset) => asset.isFavorite).length,
    unassigned: assets.filter((asset) => !assignedAssetIds.has(asset.id)).length,
    byType,
    byStatus,
  };
}
