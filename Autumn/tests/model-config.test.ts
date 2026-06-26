import assert from 'node:assert/strict';
import { mapModelConfigDtos } from '../src/adapters/model-configs/mapModelConfig';
import { normalizeModelConfigDataSource } from '../src/config/modelConfigRuntime';
import { listConfiguredModelOptions } from '../src/services/model-configs/modelConfigRepository';
import type { BackendModelConfigDto } from '../src/api/model-configs/modelConfigDto';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('mapModelConfigDtos maps shared backend enabled model capabilities', () => {
  const dtos: BackendModelConfigDto[] = [
    {
      id: 'model-image-1',
      displayName: '写实角色图',
      endpointPath: '/images/generations',
      provider: { adapter: 'openai-image', providerKey: 'image-channel' },
      salePrice: 80,
      status: 'ACTIVE',
      supports: { storyboard: true },
      type: 'IMAGE',
      ui: { badges: ['2K'], featured: true },
    },
    {
      id: 'model-video-1',
      displayName: 'seedance-2.0-fast-1080不卡真人',
      endpointPath: '/videos',
      provider: {
        adapter: 'lingdong-sd-2-vip',
        baseUrl: 'https://www.lingdongapi.com',
        providerKey: 'lingdong',
      },
      pricePerSecond: 250,
      status: 'ACTIVE',
      type: 'VIDEO',
    },
    {
      id: 'model-llm-1',
      creditsPerUsdCost: 20,
      displayName: '剧情规划大语言模型',
      status: 'ACTIVE',
      type: 'LLM',
    },
    {
      id: 'model-disabled-1',
      displayName: 'Disabled Video',
      enabled: false,
      status: 'ACTIVE',
      type: 'VIDEO',
    },
  ];

  const models = mapModelConfigDtos(dtos);

  assert.deepEqual(
    models.map((model) => ({
      id: model.id,
      name: model.name,
      tab: model.tab,
      kind: model.kind,
      description: model.description,
      badges: model.badges,
      featured: model.featured,
    })),
    [
      {
        id: 'model-image-1',
        name: '写实角色图',
        tab: '图片模型',
        kind: 'image',
        description: '后台已启用图片模型，适合角色、场景、道具和分镜资产生成。',
        badges: ['2K', 'IMAGE', '80 积分', '分镜'],
        featured: true,
      },
      {
        id: 'model-video-1',
        name: 'seedance-2.0-fast-1080不卡真人',
        tab: '视频模型',
        kind: 'video',
        description: '后台已启用视频模型，适合镜头片段、角色动作和成片预览生成。',
        badges: ['VIDEO', '250 积分/秒'],
        featured: false,
      },
      {
        id: 'model-llm-1',
        name: '剧情规划大语言模型',
        tab: '大语言模型',
        kind: 'llm',
        description: '后台已启用大语言模型，适合需求理解、剧本拆解、分镜规划和任务调度。',
        badges: ['LLM', '20 积分'],
        featured: false,
      },
    ],
  );
});

await test('mapModelConfigDtos falls back to modelId when backend omits id', () => {
  const models = mapModelConfigDtos([
    {
      modelId: 'llm-runtime-id',
      displayName: '规划模型',
      provider: { id: 'openai-provider' },
      status: 'ACTIVE',
      type: 'LLM',
    },
  ]);

  assert.equal(models[0]?.id, 'llm-runtime-id');
  assert.equal(models[0]?.providerKey, 'openai-provider');
});

await test('normalizeModelConfigDataSource defaults unknown values to api', () => {
  assert.equal(normalizeModelConfigDataSource(undefined), 'api');
  assert.equal(normalizeModelConfigDataSource('api'), 'api');
  assert.equal(normalizeModelConfigDataSource('mock'), 'mock');
  assert.equal(normalizeModelConfigDataSource('other'), 'api');
});

await test('listConfiguredModelOptions requires admin auth in api mode', async () => {
  await assert.rejects(
    () => listConfiguredModelOptions(),
    /请先登录后台管理系统/,
  );
});
