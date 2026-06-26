import assert from 'node:assert/strict';
import { mapUploadAssetResponse } from '../src/adapters/assets/mapAsset';
import { normalizeAssetDataSource } from '../src/config/assetRuntime';
import {
  createUploadPlaceholderAssets,
  uploadConfiguredAssets,
} from '../src/services/assets/assetRepository';
import {
  collectAssetObjectUrls,
  collectReplacedAssetObjectUrls,
  revokeAssetsObjectUrls,
} from '../src/services/assets/objectUrlLifecycle';
import type { AssetUploadProgressDto } from '../src/api/assets/assetDto';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

function createFakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

await test('normalizeAssetDataSource defaults unknown values to mock', () => {
  assert.equal(normalizeAssetDataSource(undefined), 'mock');
  assert.equal(normalizeAssetDataSource('api'), 'api');
  assert.equal(normalizeAssetDataSource('other'), 'mock');
});

await test('createUploadPlaceholderAssets creates stable running uploaded assets', () => {
  const assets = createUploadPlaceholderAssets(
    [createFakeFile('Hero Role.png', 'image/png', 2048)],
    1781760000000,
  );

  assert.deepEqual(assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    status: asset.status,
    progress: asset.progress,
    origin: asset.origin,
    fileSize: asset.fileSize,
    mimeType: asset.mimeType,
  })), [
    {
      id: 'asset-upload-hero-role-1781760000000-1',
      name: 'Hero Role.png',
      type: 'image',
      status: 'running',
      progress: 1,
      origin: 'uploaded',
      fileSize: 2048,
      mimeType: 'image/png',
    },
  ]);
});

await test('mapUploadAssetResponse preserves client asset id and stores backend id', () => {
  const asset = mapUploadAssetResponse(
    {
      asset: {
        id: 'backend-asset-1',
        name: '后端素材',
        status: 'SUCCESS',
        thumbnailUrl: 'https://cdn.example.com/thumb.png',
        type: 'IMAGE',
        url: 'https://cdn.example.com/asset.png',
      },
    },
    {
      id: 'asset-upload-client-1',
      name: '本地素材.png',
      type: 'image',
    },
  );

  assert.equal(asset.id, 'asset-upload-client-1');
  assert.equal(asset.remoteId, 'backend-asset-1');
  assert.equal(asset.name, '后端素材');
  assert.equal(asset.status, 'completed');
  assert.equal(asset.progress, 100);
  assert.equal(asset.sourceUrl, 'https://cdn.example.com/asset.png');
  assert.equal(asset.thumbnail, 'url(https://cdn.example.com/thumb.png) center/cover');
});

await test('uploadConfiguredAssets uses mock local upload by default and reports completion', async () => {
  const progressEvents: AssetUploadProgressDto[] = [];
  const assets = await uploadConfiguredAssets(
    [createFakeFile('Narration.wav', 'audio/wav', 4096)],
    {
      onProgress: (progress) => progressEvents.push(progress),
      timestamp: 1781760000000,
    },
  );

  assert.equal(assets[0]?.id, 'asset-upload-narration-1781760000000-1');
  assert.equal(assets[0]?.status, 'completed');
  assert.equal(assets[0]?.type, 'audio');
  assert.deepEqual(progressEvents, [
    {
      assetId: 'asset-upload-narration-1781760000000-1',
      progress: 100,
      status: 'completed',
    },
  ]);
});

await test('collectAssetObjectUrls extracts unique blob urls from source and thumbnail', () => {
  const urls = collectAssetObjectUrls({
    sourceUrl: 'blob:https://autumn.local/source-1',
    thumbnail: 'linear-gradient(#000, #111), url(blob:https://autumn.local/source-1) center/cover',
  });

  assert.deepEqual(urls, ['blob:https://autumn.local/source-1']);
});

await test('collectReplacedAssetObjectUrls returns old object urls not present in replacement assets', () => {
  const urls = collectReplacedAssetObjectUrls(
    [
      {
        id: 'asset-1',
        sourceUrl: 'blob:https://autumn.local/old-1',
        thumbnail: 'url(blob:https://autumn.local/old-1) center/cover',
      },
      {
        id: 'asset-2',
        sourceUrl: 'blob:https://autumn.local/kept-1',
      },
    ],
    [
      {
        id: 'asset-1',
        sourceUrl: 'https://cdn.example.com/asset-1.png',
      },
      {
        id: 'asset-2',
        sourceUrl: 'blob:https://autumn.local/kept-1',
      },
    ],
  );

  assert.deepEqual(urls, ['blob:https://autumn.local/old-1']);
});

await test('revokeAssetsObjectUrls calls revoke once per unique object url', () => {
  const revokedUrls: string[] = [];

  revokeAssetsObjectUrls(
    [
      {
        sourceUrl: 'blob:https://autumn.local/revoke-1',
        thumbnail: 'url(blob:https://autumn.local/revoke-1) center/cover',
      },
      {
        sourceUrl: 'https://cdn.example.com/asset.png',
      },
    ],
    (url) => revokedUrls.push(url),
  );

  assert.deepEqual(revokedUrls, ['blob:https://autumn.local/revoke-1']);
});
