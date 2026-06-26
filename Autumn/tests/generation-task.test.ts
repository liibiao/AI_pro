import assert from 'node:assert/strict';
import {
  extractBackendGenerationResultText,
  extractBackendGenerationResultUrls,
  createMockGenerationTask,
  mapBackendGenerationTask,
  mapBackendGenerationTaskResponse,
} from '../src/adapters/generation/mapGenerationTask';
import { createLlmChatCompletion } from '../src/api/generation/llmChatApi';
import { normalizeGenerationTaskDataSource } from '../src/config/generationTaskRuntime';
import { createAssetsFromGenerationTask } from '../src/services/generation/createAssetsFromGenerationTask';
import { createComposerGenerationTaskInput } from '../src/services/generation/createComposerGenerationTaskInput';
import { createStoryboardRegenerationTaskInput } from '../src/services/generation/createStoryboardRegenerationTaskInput';
import { listConfiguredGenerationTasks } from '../src/services/generation/generationTaskRepository';
import { createLlmChatRequest } from '../src/services/generation/llmChatRepository';
import type { BackendGenerationTaskDto } from '../src/api/generation/generationTaskDto';
import { getGenerationTaskErrorMessage } from '../src/utils/generationTaskDisplay';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('mapBackendGenerationTask maps backend image task status and progress', () => {
  const task = mapBackendGenerationTask({
    id: 'generation-task-1',
    model: { displayName: 'GPT Image 2' },
    progress: 37,
    status: 'RUNNING',
    type: 'IMAGE',
    updatedAt: '2026-06-17T10:00:00+08:00',
  });

  assert.deepEqual(task, {
    id: 'generation-task-1',
    label: 'GPT Image 2',
    kind: 'image',
    status: 'running',
    progress: 37,
    updatedAt: '2026-06-17T10:00:00+08:00',
  });
});

await test('mapBackendGenerationTaskResponse maps video and LLM tasks conservatively', () => {
  const dtos: BackendGenerationTaskDto[] = [
    {
      id: 'video-task',
      mode: 'seedance-storyboard',
      progress: 100,
      status: 'SUCCESS',
      type: 'VIDEO',
      updatedAt: '2026-06-17T10:02:00+08:00',
    },
    {
      id: 'llm-task',
      mode: 'storyboard-planning',
      status: 'FAILED',
      type: 'LLM',
      updatedAt: '2026-06-17T10:03:00+08:00',
    },
  ];

  assert.deepEqual(
    mapBackendGenerationTaskResponse({ items: dtos }).map((task) => ({
      id: task.id,
      label: task.label,
      kind: task.kind,
      status: task.status,
      progress: task.progress,
    })),
    [
      {
        id: 'video-task',
        label: 'seedance-storyboard',
        kind: 'video',
        status: 'completed',
        progress: 100,
      },
      {
        id: 'llm-task',
        label: 'storyboard-planning',
        kind: 'pipeline',
        status: 'failed',
        progress: 0,
      },
    ],
  );
});

await test('normalizeGenerationTaskDataSource defaults unknown values to api', () => {
  assert.equal(normalizeGenerationTaskDataSource(undefined), 'api');
  assert.equal(normalizeGenerationTaskDataSource('api'), 'api');
  assert.equal(normalizeGenerationTaskDataSource('mock'), 'mock');
  assert.equal(normalizeGenerationTaskDataSource('other'), 'api');
});

await test('listConfiguredGenerationTasks requires admin auth in api mode', async () => {
  await assert.rejects(
    () => listConfiguredGenerationTasks(),
    /请先登录后台管理系统/,
  );
});

await test('createMockGenerationTask creates a pending local task for non-api mode', () => {
  const task = createMockGenerationTask(
    {
      channelKey: 'openai',
      clientRequestId: 'request-1',
      mode: 'image-reference-board',
      modelId: 'image-model-1',
      prompt: '生成角色设定图',
      type: 'IMAGE',
    },
    new Date('2026-06-17T10:04:00+08:00'),
  );

  assert.deepEqual(task, {
    id: 'task-request-1',
    label: 'image-reference-board',
    kind: 'image',
    status: 'pending',
    progress: 0,
    updatedAt: '2026-06-17T02:04:00.000Z',
  });
});

await test('createComposerGenerationTaskInput builds backend task payload from composer state', () => {
  const input = createComposerGenerationTaskInput({
    agentPackage: {
      id: 'manju-creation-library',
      name: '漫剧创作库',
      version: '0.2.0',
      description: '工业化漫剧创作数据包。',
      source: 'backend',
      storageScope: 'account',
      syncStatus: 'synced',
      importedAt: '',
      updatedAt: '2026-06-17T13:40:00.000Z',
      agents: [
        { id: 'script-agent', name: '剧本 Agent' },
        { id: 'storyboard-agent', name: '故事板 Agent' },
      ],
      skills: [{ id: 'skill-storyboard', name: '剧情分镜拆解' }],
      templates: [],
    },
    enabledSkillIds: ['skill-storyboard'],
    enabledSkills: [
      {
        id: 'skill-storyboard',
        name: '剧情分镜拆解',
        version: '0.2.0',
        description: '将需求拆解为剧情和分镜。',
        source: 'backend',
        category: 'storyboard',
        storageScope: 'account',
        syncStatus: 'synced',
        updatedAt: '2026-06-17T13:40:00.000Z',
        compatibleStages: [],
      },
    ],
    modelOptions: [
      {
        badges: ['后台'],
        description: '视频模型',
        id: 'seedance-2',
        kind: 'video',
        name: 'Seedance 2',
        providerKey: 'seedance',
        tab: '视频模型',
      },
    ],
    modelTab: '视频模型',
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: ['asset-role'],
      durationSeconds: 15,
      imageWeight: 1.2,
      modelId: 'seedance-2',
      seed: 1234,
      srefAssetIds: ['asset-style'],
      styleWeight: 550,
    },
    prompt: '生成第一镜视频',
    selectedAsset: {
      id: 'asset-role',
      name: '主角参考图',
      type: 'image',
      status: 'completed',
    },
    timestamp: 1781680800000,
  });

  assert.deepEqual(input, {
    channelKey: 'seedance',
    clientRequestId: 'autumn-seedance-2-1781680800000',
    inputFiles: [
      {
        id: 'asset-role',
        name: '主角参考图',
        type: 'image',
      },
    ],
    mode: 'text-to-video',
    modelId: 'seedance-2',
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: ['asset-role'],
      durationSeconds: 15,
      agentIds: ['script-agent', 'storyboard-agent'],
      agentPackageId: 'manju-creation-library',
      agentPackageName: '漫剧创作库',
      enabledSkillIds: ['skill-storyboard'],
      imageWeight: 1.2,
      resolution: '720p',
      seed: 1234,
      selectedAssetId: 'asset-role',
      skillNames: ['剧情分镜拆解'],
      source: 'autumn',
      srefAssetIds: ['asset-style'],
      styleWeight: 550,
    },
    prompt: '生成第一镜视频',
    type: 'VIDEO',
  });
});

await test('createComposerGenerationTaskInput routes asset image intent to image model', () => {
  const input = createComposerGenerationTaskInput({
    modelOptions: [
      {
        badges: ['后台'],
        description: '视频模型',
        id: 'seedance-2',
        kind: 'video',
        name: 'Seedance 2',
        providerKey: 'seedance-full',
        tab: '视频模型',
      },
      {
        badges: ['后台'],
        description: '图片模型',
        id: 'gpt-image-2',
        kind: 'image',
        name: 'GPT Image 2',
        providerKey: 'gpt-image',
        tab: '图片模型',
      },
    ],
    modelTab: '视频模型',
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: [],
      durationSeconds: 15,
      imageWeight: 1.2,
      modelId: 'seedance-2',
      seed: 1234,
      srefAssetIds: [],
      styleWeight: 550,
    },
    prompt: '下一步生成关键元素资产图',
    timestamp: 1781680800000,
  });

  assert.equal(input.type, 'IMAGE');
  assert.equal(input.mode, 'txt2img');
  assert.equal(input.channelKey, 'gpt-image');
  assert.equal(input.modelId, 'gpt-image-2');
  assert.equal(input.params?.orchestration, 'creative-asset-image');
  assert.equal(input.params?.targetAssetSlot, 'elementReference');
});

await test('createLlmChatRequest sends backend LLM chat fields', () => {
  const request = createLlmChatRequest({
    channelKey: 'openai',
    clientRequestId: 'request-llm-1',
    mode: 'chat',
    modelId: 'llm-1',
    prompt: '人族大战魔族',
    type: 'LLM',
    params: {
      agentIds: ['planner-agent'],
      endpointPath: '/chat/completions',
      maxOutputTokens: 2400,
      messages: [
        {
          content: {
            text: '根据一句话创意生成流程规划。',
          },
          role: 'system',
        },
        {
          content: '人族大战魔族',
          role: 'user',
        },
      ],
      plannerTemplate: '# 流程规划',
      selectedModels: {
        language: { id: 'llm-1' },
      },
      skillMarkdown: '# skill',
      timeoutMs: 90000,
    },
  });

  assert.equal(request.endpointPath, '/chat/completions');
  assert.equal(request.extra?.agentIds instanceof Array, true);
  assert.equal(request.extra?.plannerTemplate, '# 流程规划');
  assert.equal(request.maxOutputTokens, 2400);
  assert.equal(request.modelId, 'llm-1');
  assert.equal(request.requestTimeoutMs, undefined);
  assert.equal(request.timeoutMs, 90000);
  assert.equal(request.upstreamTimeoutMs, 600000);
  assert.deepEqual(request.messages, [
    {
      content: '根据一句话创意生成流程规划。',
      role: 'system',
    },
    {
      content: '人族大战魔族',
      role: 'user',
    },
  ]);
});

await test('createLlmChatRequest falls back to prompt when nested messages are empty', () => {
  const request = createLlmChatRequest({
    channelKey: 'openai',
    mode: 'chat',
    modelId: '  llm-1  ',
    prompt: '人族大战魔族',
    type: 'LLM',
    params: {
      messages: [
        {
          content: '',
          role: 'user',
        },
      ],
    },
  });

  assert.equal(request.modelId, 'llm-1');
  assert.equal(request.endpointPath, '/chat/completions');
  assert.equal(request.timeoutMs, 600000);
  assert.deepEqual(request.messages, [
    {
      content: '人族大战魔族',
      role: 'user',
    },
  ]);
});

await test('createLlmChatRequest rejects missing model id or message content before fetch', () => {
  assert.throws(
    () => createLlmChatRequest({
      channelKey: 'openai',
      mode: 'chat',
      modelId: '',
      prompt: '人族大战魔族',
      type: 'LLM',
    }),
    /缺少 modelId/,
  );

  assert.throws(
    () => createLlmChatRequest({
      channelKey: 'openai',
      mode: 'chat',
      modelId: 'llm-1',
      prompt: '   ',
      type: 'LLM',
    }),
    /缺少消息内容/,
  );
});

await test('createLlmChatCompletion keeps json content type when auth headers are present', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ text: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await createLlmChatCompletion(
      {
        messages: [{ role: 'user', content: '人族大战魔族' }],
        modelId: 'llm-1',
      },
      { authHeaders: { Authorization: 'Bearer token' } },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('Authorization'), 'Bearer token');
});

await test('createLlmChatCompletion does not abort fetch using upstream timeout', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  let capturedBody: CreateLlmChatRequestDto | undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    capturedBody = JSON.parse(String(init?.body)) as CreateLlmChatRequestDto;
    return new Response(JSON.stringify({ text: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await createLlmChatCompletion({
      messages: [{ role: 'user', content: '人族大战魔族' }],
      modelId: 'llm-1',
      timeoutMs: 600000,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(Boolean(capturedInit?.signal), false);
  assert.equal(capturedBody?.timeoutMs, 600000);
});

await test('createLlmChatCompletion aborts fetch using request timeout', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;

    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      if (signal instanceof AbortSignal) {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => createLlmChatCompletion({
        messages: [{ role: 'user', content: '人族大战魔族' }],
        modelId: 'llm-1',
        requestTimeoutMs: 1,
      }),
      /等待超时/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(Boolean(capturedInit?.signal), true);
});

await test('createStoryboardRegenerationTaskInput routes task to the source storyboard element', () => {
  const input = createStoryboardRegenerationTaskInput({
    element: {
      id: 'shot-1',
      name: 'Shot_One',
      type: 'shot',
      description: '第一镜，角色从城门前转身。',
      status: 'completed',
      assets: [
        {
          id: 'asset-shot-1',
          name: 'Shot_One_video',
          type: 'video',
          status: 'completed',
        },
      ],
    },
    modelOptions: [
      {
        badges: ['后台'],
        description: '视频模型',
        id: 'seedance-2',
        kind: 'video',
        name: 'Seedance 2',
        providerKey: 'seedance',
        tab: '视频模型',
      },
    ],
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: ['asset-role'],
      durationSeconds: 15,
      imageWeight: 1.2,
      modelId: 'seedance-2',
      seed: 1234,
      srefAssetIds: ['asset-style'],
      styleWeight: 550,
    },
    timestamp: 1781857200000,
  });

  assert.deepEqual(input, {
    channelKey: 'seedance',
    clientRequestId: 'autumn-regenerate-shot-1-1781857200000',
    inputFiles: [
      {
        id: 'asset-shot-1',
        name: 'Shot_One_video',
        type: 'video',
      },
    ],
    mode: 'autumn-storyboard-regeneration',
    modelId: 'seedance-2',
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: ['asset-role'],
      durationSeconds: 15,
      imageWeight: 1.2,
      seed: 1234,
      source: 'autumn',
      sourceElementId: 'shot-1',
      sourceElementName: 'Shot_One',
      srefAssetIds: ['asset-style'],
      storyboardElementType: 'shot',
      styleWeight: 550,
      targetAssetSlot: 'shotVideo',
    },
    prompt: '请重生成故事板卡片 Shot_One。\n类型：shot\n描述：第一镜，角色从城门前转身。\n参考素材：Shot_One_video',
    type: 'VIDEO',
  });
});

await test('createStoryboardRegenerationTaskInput uses image model for key elements even when seedance is selected', () => {
  const input = createStoryboardRegenerationTaskInput({
    element: {
      id: 'role-general',
      name: '人族将领',
      type: 'role',
      description: '守城主角，盔甲破损。',
      status: 'pending',
      assets: [],
    },
    modelOptions: [
      {
        badges: ['后台'],
        description: '视频模型',
        id: 'seedance-2',
        kind: 'video',
        name: 'Seedance 2',
        providerKey: 'seedance-full',
        tab: '视频模型',
      },
      {
        badges: ['后台'],
        description: '图片模型',
        id: 'gpt-image-2',
        kind: 'image',
        name: 'GPT Image 2',
        providerKey: 'gpt-image',
        tab: '图片模型',
      },
    ],
    params: {
      aspectRatio: '16:9',
      contentWeight: 75,
      crefAssetIds: [],
      durationSeconds: 15,
      imageWeight: 1.2,
      modelId: 'seedance-2',
      seed: 1234,
      srefAssetIds: [],
      styleWeight: 550,
    },
    timestamp: 1781857200000,
  });

  assert.equal(input.type, 'IMAGE');
  assert.equal(input.channelKey, 'gpt-image');
  assert.equal(input.modelId, 'gpt-image-2');
  assert.equal(input.params?.storyboardElementType, 'role');
  assert.equal(input.params?.targetAssetSlot, 'elementReference');
});

await test('generation task adapters preserve source element routing params', () => {
  const backendTask = mapBackendGenerationTask({
    id: 'generation-task-routed',
    paramsJson: JSON.stringify({
      sourceElementId: 'shot-1',
      targetAssetSlot: 'shotVideo',
    }),
    resultUrlsJson: ['https://cdn.example.com/shot-1.mp4'],
    status: 'SUCCESS',
    type: 'VIDEO',
    updatedAt: '2026-06-19T03:00:00+08:00',
  });
  const mockTask = createMockGenerationTask(
    {
      channelKey: 'seedance',
      clientRequestId: 'request-routed',
      mode: 'autumn-storyboard-regeneration',
      modelId: 'seedance-2',
      params: {
        sourceElementId: 'shot-1',
        targetAssetSlot: 'shotVideo',
      },
      prompt: '重生成第一镜',
      type: 'VIDEO',
    },
    new Date('2026-06-19T03:00:00+08:00'),
  );

  assert.equal(backendTask.sourceElementId, 'shot-1');
  assert.equal(backendTask.targetAssetSlot, 'shotVideo');
  assert.deepEqual(backendTask.resultUrls, ['https://cdn.example.com/shot-1.mp4']);
  assert.equal(mockTask.sourceElementId, 'shot-1');
  assert.equal(mockTask.targetAssetSlot, 'shotVideo');
});

await test('getGenerationTaskErrorMessage maps backend failure details to user-facing retry copy', () => {
  const failedTask = mapBackendGenerationTask({
    errorMessage: 'Lingdong video task failed: input image url is unavailable',
    id: 'generation-task-failed',
    status: 'FAILED',
    type: 'VIDEO',
  });

  assert.equal(failedTask.status, 'failed');
  assert.equal(
    getGenerationTaskErrorMessage(failedTask),
    '视频生成任务失败，请检查参考图链接是否可访问，或调整生成参数后重试。',
  );
  assert.equal(
    getGenerationTaskErrorMessage(new Error('Generation task API request failed: 500')),
    '生成任务提交失败，请检查后台连接后重试。',
  );
  assert.equal(
    getGenerationTaskErrorMessage({ error_message: '后台队列繁忙，请稍后重试。' }),
    '后台队列繁忙，请稍后重试。',
  );
});

await test('extractBackendGenerationResultUrls reads result urls from common backend fields', () => {
  const urls = extractBackendGenerationResultUrls({
    id: 'task-with-outputs',
    resultJson: {
      outputs: ['https://cdn.example.com/shot-1.mp4'],
      nested: {
        imageUrl: 'https://cdn.example.com/shot-1-cover.png',
      },
    },
    resultUrlsJson: ['https://cdn.example.com/shot-1.mp4'],
    status: 'SUCCESS',
    type: 'VIDEO',
  });

  assert.deepEqual(urls, [
    'https://cdn.example.com/shot-1.mp4',
    'https://cdn.example.com/shot-1-cover.png',
  ]);
});

await test('extractBackendGenerationResultText reads LLM text from common backend fields', () => {
  const text = extractBackendGenerationResultText({
    id: 'task-with-llm-text',
    resultJson: {
      choices: [
        {
          message: {
            content: '{"skillMarkdown":"# 流程规划\\n动态生成"}',
          },
        },
      ],
    },
    status: 'SUCCESS',
    type: 'LLM',
  });
  const task = mapBackendGenerationTask({
    id: 'task-with-markdown',
    resultJson: {
      markdown: '# 流程规划\n模型生成的流程规范',
    },
    status: 'SUCCESS',
    type: 'LLM',
    updatedAt: '2026-06-19T04:00:00+08:00',
  });

  assert.equal(text, '{"skillMarkdown":"# 流程规划\\n动态生成"}');
  assert.equal(task.resultText, '# 流程规划\n模型生成的流程规范');
});

await test('createAssetsFromGenerationTask maps completed video task results to assets', () => {
  const assets = createAssetsFromGenerationTask({
    id: 'task-video-1',
    label: '第一镜',
    kind: 'video',
    progress: 100,
    resultUrls: ['https://cdn.example.com/shot-1.mp4'],
    status: 'completed',
    targetAssetSlot: 'shotVideo',
    updatedAt: '2026-06-17T14:15:00+08:00',
  });

  assert.deepEqual(assets, [
    {
      id: 'asset-task-video-1-1',
      name: '第一镜',
      type: 'video',
      status: 'completed',
      progress: 100,
      sourceUrl: 'https://cdn.example.com/shot-1.mp4',
      targetAssetSlot: 'shotVideo',
      thumbnail: 'url(https://cdn.example.com/shot-1.mp4) center/cover',
    },
  ]);
});
