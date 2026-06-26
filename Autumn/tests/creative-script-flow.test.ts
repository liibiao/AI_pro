import assert from 'node:assert/strict';
import {
  classifyCreativeInput,
  createCoreRequirementSummary,
  createCreativeFlowPlan,
  createCreativeFlowPlanFromModelResult,
  createCreativePipelineGenerationTaskInput,
  createCreativePipelineDocumentsFromAgentResult,
  createCreativePipelineTextAgentRunInput,
  createCreativePipelineStoryboardElementsFromAgentResult,
  createCreativeSkillPlanningGenerationTaskInput,
  createCreativeScriptDraft,
  createStyleRequirementSummary,
  getDefaultCreativeSelections,
  shouldStartCreativeScriptFlow,
} from '../src/services/chat/creativeScriptFlow';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('one-line story concepts enter the script intake flow', () => {
  assert.equal(shouldStartCreativeScriptFlow('帮我做一个人族在城门口抗衡魔族入侵的故事'), true);
  assert.equal(shouldStartCreativeScriptFlow('人族大战魔族'), true);
  assert.equal(shouldStartCreativeScriptFlow('生成一个魔法学院短片'), true);
});

await test('complete scripts and ordinary generation prompts skip the intake flow', () => {
  assert.equal(
    classifyCreativeInput('第一幕：城楼全景。\n镜头 1：人族将领拔剑。\n角色：魔族统帅。\n旁白：城门将倾。'),
    'script',
  );
  assert.equal(
    shouldStartCreativeScriptFlow('第一幕：城楼全景。\n镜头 1：人族将领拔剑。\n角色：魔族统帅。\n旁白：城门将倾。'),
    false,
  );
  assert.equal(shouldStartCreativeScriptFlow('生成第一镜视频'), false);
  assert.equal(shouldStartCreativeScriptFlow('做一张人族大战魔族海报'), false);
});

await test('core summary and script draft preserve selected story direction', () => {
  const prompt = '帮我做一个人族在城门口抗衡魔族入侵的故事';
  const plan = createCreativeFlowPlan(prompt, {
    id: 'manju-creation-library',
    name: '漫剧创作库',
    version: '0.2.0',
    description: '工业化漫剧创作数据包。',
    source: 'backend',
    storageScope: 'account',
    syncStatus: 'synced',
    importedAt: '',
    updatedAt: '',
    agents: [{ id: 'script-agent', name: '剧本 Agent' }],
    skills: [{ id: 'storyboard-skill', name: '故事板 Skill' }],
    templates: [],
  });
  const selections = getDefaultCreativeSelections(plan);
  const summary = createCoreRequirementSummary(plan, selections);
  const draft = createCreativeScriptDraft(plan, selections);

  assert.equal(plan.coreOptions.length >= 10, true);
  assert.equal(plan.styleOptions.length >= 10, true);
  assert.match(plan.markdown, /完整视频的阶段逻辑和依赖关系/);
  assert.match(plan.document.body[0] ?? '', /流程规划/);
  assert.match(summary, /人族在城门口抗衡魔族入侵/);
  assert.match(summary, /视频类型：剧情短片/);
  assert.match(draft, /第一场：建立主题与目标/);
  assert.match(draft, /人族在城门口抗衡魔族入侵/);
});

await test('skill planning task uses selected LLM and carries model/agent context', () => {
  const taskInput = createCreativeSkillPlanningGenerationTaskInput({
    agentPackage: {
      id: 'creative-pack',
      name: '剧情短片数据包',
      version: '1.0.0',
      description: '短片生成流程。',
      source: 'backend',
      storageScope: 'account',
      syncStatus: 'synced',
      importedAt: '',
      updatedAt: '',
      agents: [{ id: 'planner-agent', name: '流程规划 Agent' }],
      skills: [],
      templates: [],
    },
    enabledSkillIds: ['skill-a'],
    enabledSkills: [
      {
        id: 'skill-a',
        name: '剧本拆解',
        version: '1.0.0',
        description: '拆解剧本。',
        source: 'backend',
        category: 'storyboard',
        storageScope: 'account',
        syncStatus: 'synced',
        updatedAt: '',
        compatibleStages: [],
      },
    ],
    modelOptions: [
      {
        badges: ['IMAGE'],
        description: '图片模型',
        id: 'image-1',
        kind: 'image',
        name: 'Image 1',
        providerKey: 'image-provider',
        tab: '图片模型',
      },
      {
        badges: ['VIDEO'],
        description: '视频模型',
        id: 'video-1',
        kind: 'video',
        name: 'Video 1',
        providerKey: 'video-provider',
        tab: '视频模型',
      },
      {
        badges: ['LLM'],
        description: '语言模型',
        id: 'llm-1',
        kind: 'llm',
        name: 'LLM 1',
        providerKey: 'openai',
        tab: '大语言模型',
      },
    ],
    selectedModelIdsByTab: {
      图片模型: 'image-1',
      视频模型: 'video-1',
      大语言模型: 'llm-1',
    },
    timestamp: 1781857200000,
    userPrompt: '人族在城墙上抗衡魔族的故事',
  });

  assert.equal(taskInput.type, 'LLM');
  assert.equal(taskInput.mode, 'chat');
  assert.equal(taskInput.modelId, 'llm-1');
  assert.equal(taskInput.channelKey, 'openai');
  assert.equal(taskInput.params?.orchestration, 'creative-skill-planning');
  assert.equal(taskInput.params?.agentPackageId, 'creative-pack');
  assert.deepEqual(taskInput.params?.enabledSkillIds, ['skill-a']);
  assert.equal(taskInput.params?.sourceElementId, 'autumn-creative-skill-planning');
  assert.equal(taskInput.params?.sourceElementName, '对话流程规划');
  assert.equal(taskInput.params?.storyboardElementType, 'shot');
  assert.equal(taskInput.params?.targetAssetSlot, 'shotVideo');
  assert.equal(taskInput.params?.requestTimeoutMs, 30000);
  assert.equal(taskInput.params?.timeoutMs, 30000);
  assert.equal(taskInput.params?.upstreamTimeoutMs, 30000);
  assert.equal(taskInput.params?.aspectRatio, '16:9');
  assert.equal(taskInput.params?.durationSeconds, 15);
  assert.match(taskInput.prompt, /基础 planner 模板/);
  assert.match(taskInput.prompt, /人族在城墙上抗衡魔族的故事/);
  assert.deepEqual(taskInput.params?.selectedModels, {
    audio: null,
    image: {
      channelKey: 'image-provider',
      id: 'image-1',
      kind: 'image',
      name: 'Image 1',
      tab: '图片模型',
    },
    language: {
      channelKey: 'openai',
      id: 'llm-1',
      kind: 'llm',
      name: 'LLM 1',
      tab: '大语言模型',
    },
    video: {
      channelKey: 'video-provider',
      id: 'video-1',
      kind: 'video',
      name: 'Video 1',
      tab: '视频模型',
    },
  });
});

await test('skill planning refuses to use image or video models as LLM fallback', () => {
  assert.throws(
    () => createCreativeSkillPlanningGenerationTaskInput({
      modelOptions: [
        {
          badges: ['IMAGE'],
          description: '图片模型',
          id: 'image-1',
          kind: 'image',
          name: 'Image 1',
          providerKey: 'image-provider',
          tab: '图片模型',
        },
        {
          badges: ['VIDEO'],
          description: '视频模型',
          id: 'video-1',
          kind: 'video',
          name: 'Video 1',
          providerKey: 'video-provider',
          tab: '视频模型',
        },
      ],
      selectedModelIdsByTab: {
        图片模型: 'image-1',
        视频模型: 'video-1',
      },
      userPrompt: '人族在城墙上抗衡魔族的故事',
    }),
    /未找到可用的大语言模型/,
  );
});

await test('model planning result can drive skill markdown and question options', () => {
  const plan = createCreativeFlowPlanFromModelResult(
    '人族在城墙上抗衡魔族的故事',
    JSON.stringify({
      metadata: {
        durationHint: '2分钟',
        outputLanguage: '中文',
        title: '城墙之誓',
        topic: '人族守军在城墙上抗衡魔族',
        videoType: '史诗剧情短片',
      },
      skillMarkdown: '# 流程规划\n项目专属流程',
      coreQuestion: {
        options: [
          { id: 'last-wall', title: '最后城墙', description: '少数守军守住破城前夜。' },
        ],
      },
      styleQuestion: {
        options: [
          { id: 'epic', title: '史诗写实，2分钟', description: '冷兵器战争质感。' },
        ],
      },
    }),
  );

  assert.equal(plan.topic, '人族守军在城墙上抗衡魔族');
  assert.equal(plan.title, '城墙之誓');
  assert.equal(plan.videoType, '史诗剧情短片');
  assert.equal(plan.coreOptions[0]?.id, 'last-wall');
  assert.equal(plan.styleOptions[0]?.id, 'epic');
  assert.equal(plan.coreOptions.length >= 10, true);
  assert.equal(plan.styleOptions.length >= 10, true);
  assert.match(
    createCoreRequirementSummary(plan, { coreRequirements: 'last-wall' }),
    /少数守军守住破城前夜/,
  );
  assert.match(
    createStyleRequirementSummary(plan, { styleConstraints: 'epic' }),
    /冷兵器战争质感/,
  );
  assert.match(plan.markdown, /项目专属流程/);
});

await test('creative pipeline task carries skill markdown and confirmed script to agent package', () => {
  const plan = createCreativeFlowPlan('生成一个魔法学院短片');
  const selections = getDefaultCreativeSelections(plan);
  const taskInput = createCreativePipelineGenerationTaskInput({
    agentPackage: {
      id: 'creative-pack',
      name: '剧情短片数据包',
      version: '1.0.0',
      description: '短片生成流程。',
      source: 'backend',
      storageScope: 'account',
      syncStatus: 'synced',
      importedAt: '',
      updatedAt: '',
      agents: [{ id: 'planner-agent', name: '流程规划 Agent' }],
      skills: [],
      templates: [],
    },
    confirmedScript: '已确认剧本正文',
    enabledSkillIds: ['skill-a'],
    enabledSkills: [
      {
        id: 'skill-a',
        name: '剧本拆解',
        version: '1.0.0',
        description: '拆解剧本。',
        source: 'backend',
        category: 'storyboard',
        storageScope: 'account',
        syncStatus: 'synced',
        updatedAt: '',
        compatibleStages: [],
      },
    ],
    modelOptions: [
      {
        badges: ['LLM'],
        description: '语言模型',
        id: 'llm-1',
        kind: 'llm',
        name: 'LLM 1',
        providerKey: 'openai',
        tab: '大语言模型',
      },
    ],
    plan,
    selections,
    timestamp: 1781857200000,
  });

  assert.equal(taskInput.type, 'LLM');
  assert.equal(taskInput.mode, 'autumn-creative-video-pipeline');
  assert.equal(taskInput.params?.agentPackageId, 'creative-pack');
  assert.equal(taskInput.params?.confirmedScript, '已确认剧本正文');
  assert.match(String(taskInput.params?.skillMarkdown), /流程规划/);
  assert.deepEqual(taskInput.params?.enabledSkillIds, ['skill-a']);
});

await test('creative pipeline text-agent input targets selected agent pack and LLM', () => {
  const plan = createCreativeFlowPlan('生成一个魔法学院短片');
  const selections = getDefaultCreativeSelections(plan);
  const input = createCreativePipelineTextAgentRunInput({
    agentPackage: {
      id: 'creative-pack',
      name: '剧情短片数据包',
      version: '1.0.0',
      description: '短片生成流程。',
      source: 'backend',
      storageScope: 'account',
      syncStatus: 'synced',
      importedAt: '',
      updatedAt: '',
      agents: [{ id: 'planner-agent', name: '流程规划 Agent' }],
      skills: [],
      templates: [],
    },
    confirmedScript: '已确认剧本正文',
    enabledSkillIds: ['skill-a'],
    enabledSkills: [],
    modelOptions: [
      {
        badges: ['LLM'],
        description: '语言模型',
        id: 'llm-1',
        kind: 'llm',
        name: 'LLM 1',
        providerKey: 'openai',
        tab: '大语言模型',
      },
    ],
    plan,
    selections,
  });

  assert.equal(input.agentPackId, 'creative-pack');
  assert.equal(input.mode, 'script');
  assert.equal(input.outputType, 'storyboard');
  assert.equal(input.modelKey, 'llm-1');
  assert.equal(input.timeoutMs, 120000);
  assert.equal(input.upstreamTimeoutMs, 120000);
  assert.equal(input.requestTimeoutMs, 125000);
  assert.match(input.inputText, /已确认剧本正文/);
  assert.match(input.outputContract ?? '', /finalVideoSpecMarkdown/);
  assert.deepEqual(input.extra?.enabledSkillIds, ['skill-a']);
});

await test('creative pipeline text-agent input requires selected agent package', () => {
  const plan = createCreativeFlowPlan('生成一个魔法学院短片');
  const selections = getDefaultCreativeSelections(plan);

  assert.throws(
    () => createCreativePipelineTextAgentRunInput({
      confirmedScript: '已确认剧本正文',
      enabledSkillIds: [],
      enabledSkills: [],
      modelOptions: [
        {
          badges: ['LLM'],
          description: '语言模型',
          id: 'llm-1',
          kind: 'llm',
          name: 'LLM 1',
          providerKey: 'openai',
          tab: '大语言模型',
        },
      ],
      plan,
      selections,
    }),
    /选择可用的 Agent 数据包/,
  );
});

await test('creative pipeline agent result creates video spec and storyboard documents', () => {
  const plan = createCreativeFlowPlan('生成一个魔法学院短片');
  const selections = getDefaultCreativeSelections(plan);
  const documents = createCreativePipelineDocumentsFromAgentResult(
    plan,
    selections,
    '已确认剧本正文',
    JSON.stringify({
      finalVideoSpecMarkdown: '# Final_Video_Spec\n标题：魔法学院',
      storyboardMarkdown: '# Storyboard\n镜头1：学院钟楼',
      nextStageInstructions: '等待确认',
    }),
  );

  assert.equal(documents[0]?.title, 'Final_Video_Spec.md');
  assert.equal(documents[1]?.title, 'Storyboard.md');
  assert.match(documents[0]?.body.join('\n') ?? '', /标题：魔法学院/);
  assert.match(documents[1]?.body.join('\n') ?? '', /镜头1：学院钟楼/);
});

await test('creative pipeline agent result creates storyboard elements from structured output', () => {
  const elements = createCreativePipelineStoryboardElementsFromAgentResult(
    JSON.stringify({
      storyboardElements: [
        {
          id: 'role-general',
          name: '人族将领',
          type: 'role',
          description: '守城主角',
        },
        {
          id: 'shot-wall',
          name: '镜头 1',
          type: 'shot',
          visual: '城墙全景',
          action: '魔族逼近，人族将领拔剑',
          dialogue: '守住城门',
        },
      ],
    }),
    1781857200000,
  );

  assert.equal(elements[0]?.id, 'role-general');
  assert.equal(elements[0]?.type, 'role');
  assert.equal(elements[1]?.id, 'shot-wall');
  assert.equal(elements[1]?.type, 'shot');
  assert.match(elements[1]?.description ?? '', /城墙全景/);
  assert.match(elements[1]?.description ?? '', /守住城门/);
});

await test('creative pipeline agent result falls back to storyboard markdown shots', () => {
  const elements = createCreativePipelineStoryboardElementsFromAgentResult(
    JSON.stringify({
      storyboardMarkdown: '# Storyboard\n镜头1：城墙远景，魔族压境\n动作：守军点燃烽火\n镜头2：将领拔剑冲锋',
    }),
    1781857200000,
  );

  assert.equal(elements.length, 2);
  assert.equal(elements[0]?.id, 'agent-shot-1781857200000-1');
  assert.equal(elements[0]?.name, '镜头 1');
  assert.match(elements[0]?.description ?? '', /守军点燃烽火/);
  assert.equal(elements[1]?.name, '镜头 2');
});

await test('creative pipeline agent result parses markdown key elements before shots', () => {
  const elements = createCreativePipelineStoryboardElementsFromAgentResult(
    JSON.stringify({
      storyboardMarkdown: [
        '# Storyboard',
        '## 角色',
        '- 人族将领：守城主角，盔甲破损',
        '## 场景',
        '- 荒原城门：残旗与火光',
        '## 分镜',
        '镜头1：城门远景，魔族压境',
      ].join('\n'),
    }),
    1781857200000,
  );

  assert.equal(elements.length, 3);
  assert.equal(elements[0]?.type, 'role');
  assert.equal(elements[0]?.name, '人族将领');
  assert.equal(elements[1]?.type, 'scene');
  assert.equal(elements[1]?.name, '荒原城门');
  assert.equal(elements[2]?.type, 'shot');
});
