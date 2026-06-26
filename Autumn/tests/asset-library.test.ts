import assert from 'node:assert/strict';
import {
  filterAssetLibraryItems,
  getAssignedAssetIds,
  summarizeAssetLibrary,
} from '../src/services/assets/assetLibrary';
import type { AssetItem, StoryboardElement } from '../src/types/pipeline';

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

const assets: AssetItem[] = [
  { id: 'asset-role', name: '角色图', type: 'image', status: 'completed' },
  {
    id: 'asset-video',
    name: '镜头视频',
    type: 'video',
    status: 'running',
    progress: 42,
    isFavorite: true,
  },
  { id: 'asset-audio', name: '旁白', type: 'audio', status: 'pending' },
];

const storyboardElements: StoryboardElement[] = [
  {
    id: 'element-role',
    name: '角色',
    type: 'role',
    description: '角色设定',
    status: 'completed',
    assets: [assets[0]!],
  },
];

test('asset library derives assigned ids from storyboard elements', () => {
  const assignedAssetIds = getAssignedAssetIds(storyboardElements);

  assert.deepEqual([...assignedAssetIds], ['asset-role']);
});

test('asset library filters by type and unassigned state', () => {
  const assignedAssetIds = getAssignedAssetIds(storyboardElements);
  const filteredAssets = filterAssetLibraryItems(
    assets,
    { type: 'video', assignment: 'unassigned' },
    assignedAssetIds,
  );

  assert.deepEqual(filteredAssets.map((asset) => asset.id), ['asset-video']);
});

test('asset library filters favorite assets', () => {
  const filteredAssets = filterAssetLibraryItems(assets, { favorite: 'favorite' });

  assert.deepEqual(filteredAssets.map((asset) => asset.id), ['asset-video']);
});

test('asset library summary counts type, status, and unassigned assets', () => {
  const assignedAssetIds = getAssignedAssetIds(storyboardElements);
  const summary = summarizeAssetLibrary(assets, assignedAssetIds);

  assert.equal(summary.total, 3);
  assert.equal(summary.favorites, 1);
  assert.equal(summary.unassigned, 2);
  assert.equal(summary.byType.image, 1);
  assert.equal(summary.byType.video, 1);
  assert.equal(summary.byStatus.running, 1);
});
