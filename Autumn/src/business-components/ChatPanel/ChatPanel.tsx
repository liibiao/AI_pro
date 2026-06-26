import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { Panel } from '../../components/Panel';
import { fallbackModelOptions } from '../../mock/modelConfigMock';
import {
  createCoreRequirementSummary,
  createCreativeFlowPlan,
  createCreativeFlowPlanFromModelResult,
  createCreativePipelineDocumentsFromAgentResult,
  createCreativePipelineGenerationTaskInput,
  createCreativePipelineStoryboardElementsFromAgentResult,
  createCreativePipelineTextAgentRunInput,
  createCreativeQuestion,
  createCreativeScriptDraft,
  createCreativeScriptDraftGenerationTaskInput,
  createCreativeScriptTitle,
  createCreativeSkillPlanningGenerationTaskInput,
  createStyleRequirementSummary,
  getDefaultCreativeSelections,
  shouldStartCreativeScriptFlow,
  type CreativeFlowPlan,
  type CreativeQuestionStep,
  type CreativeSelections,
} from '../../services/chat/creativeScriptFlow';
import { createComposerGenerationTaskInput } from '../../services/generation/createComposerGenerationTaskInput';
import { generationParamLimits } from '../../services/params/generationParamValidation';
import { useChatStore } from '../../store/chatStore';
import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import type { CreateTextAgentRunRequestDto } from '../../api/workbench/textAgentDto';
import type { AgentPackage } from '../../types/agentPackage';
import type { ComposerModelTab } from '../../types/chat';
import type { GenerationTask } from '../../types/generationTask';
import type { ModelConfigOption } from '../../types/modelConfig';
import type { ReferenceKind } from '../../types/params';
import type { AssetItem, ChatMessage, DocumentItem, StoryboardElement } from '../../types/pipeline';
import type { SkillLibraryItem } from '../../types/skillLibrary';
import type { ParamStoreController } from '../../store/paramStore';

interface ChatPanelProps {
  messages: ChatMessage[];
  activeAgentPackage?: AgentPackage;
  agentPackages?: AgentPackage[];
  assets?: AssetItem[];
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  generationTasks?: GenerationTask[];
  modelError?: string | null;
  modelOptions?: ModelConfigOption[];
  onPrimaryAction?: () => void;
  onRefreshGenerationTask?: (taskId: string) => Promise<GenerationTask | null>;
  onRunCreativePipelineTask?: (
    input: CreateTextAgentRunRequestDto,
  ) => Promise<GenerationTask | void> | GenerationTask | void;
  onRunLlmChatTask?: (
    input: CreateGenerationTaskRequestDto,
  ) => Promise<GenerationTask | void> | GenerationTask | void;
  onSkillDocumentGenerated?: (document: DocumentItem) => void;
  onStoryboardElementsGenerated?: (elements: StoryboardElement[]) => void;
  onSubmitGenerationTask?: (
    input: CreateGenerationTaskRequestDto,
  ) => Promise<GenerationTask | void> | GenerationTask | void;
  onSwitchAgentPackage?: (packageId: string) => void;
  onToggleSkill?: (skillId: string) => void;
  paramStore: ParamStoreController;
  skills?: SkillLibraryItem[];
}

const modelTabs: ComposerModelTab[] = ['图片模型', '视频模型', '大语言模型'];

const creativeQuestionSteps: CreativeQuestionStep[] = ['coreRequirements', 'styleConstraints'];

type CreativeFlowPhase = CreativeQuestionStep | 'scriptGenerating' | 'scriptReview' | 'idle';

interface CreativeFlowRuntimeState {
  confirmationChoice: 'confirm' | 'revise';
  generatedScript: string | null;
  phase: CreativeFlowPhase;
  plan: CreativeFlowPlan | null;
  selections: CreativeSelections;
}

const initialCreativeFlowState: CreativeFlowRuntimeState = {
  confirmationChoice: 'confirm',
  generatedScript: null,
  phase: 'idle',
  plan: null,
  selections: {},
};

function isReferenceAsset(asset?: AssetItem): asset is AssetItem {
  return Boolean(asset && asset.type === 'image' && asset.status !== 'failed');
}

function getAssetTypeLabel(type?: AssetItem['type']): string {
  switch (type) {
    case 'audio':
      return '音频';
    case 'document':
      return '文档';
    case 'image':
      return '图片';
    case 'video':
      return '视频';
    default:
      return '素材';
  }
}

function getReferenceKindLabel(kind: ReferenceKind): string {
  return kind === 'cref' ? 'CRef' : 'SRef';
}

function formatImageWeight(value: number): string {
  return `${value.toFixed(2)}x`;
}

function getTaskStatusLabel(status: GenerationTask['status']): string {
  if (status === 'completed') {
    return '已完成';
  }

  if (status === 'running') {
    return '运行中';
  }

  if (status === 'failed') {
    return '失败';
  }

  return '已提交';
}

function createRuntimeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createUserRuntimeMessage(prompt: string): ChatMessage {
  return {
    id: createRuntimeMessageId('user'),
    role: 'user',
    kind: 'text',
    content: prompt,
  };
}

function createCreativePipelineDocumentsRuntimeMessage(documents: DocumentItem[]): ChatMessage {
  return {
    id: createRuntimeMessageId('assistant-creative-pipeline-documents'),
    role: 'assistant',
    kind: 'resultCard',
    title: '视频规格与故事板已生成',
    content: `已生成并写入文档列表：${documents.map((document) => document.title).join('、')}。下一步可以基于故事板继续生成关键元素、音色锚点和镜头视频。`,
  };
}

function createRuntimeProgressMessage(
  id: string,
  title: string,
  content: string,
  steps: ChatMessage['steps'],
): ChatMessage {
  return {
    id,
    role: 'assistant',
    kind: 'progressCard',
    title,
    content,
    steps,
  };
}

function createTaskErrorRuntimeMessage(error: unknown): ChatMessage {
  return {
    id: createRuntimeMessageId('assistant-error'),
    role: 'assistant',
    kind: 'progressCard',
    title: '任务创建失败',
    content:
      error instanceof Error
        ? error.message
        : '后台生成任务创建失败，请检查模型渠道、Agent 系统或登录状态。',
    steps: [
      { id: 'model', label: '模型渠道已选择', status: 'completed' },
      { id: 'task', label: '后台任务创建失败', status: 'failed' },
    ],
  };
}

function createWaitingForModelResultRuntimeMessage(
  input: CreateGenerationTaskRequestDto,
  task?: GenerationTask,
): ChatMessage {
  const isLlmChat = input.type === 'LLM' && input.mode === 'chat';

  return {
    id: createRuntimeMessageId('assistant-waiting-model-result'),
    role: 'assistant',
    kind: 'progressCard',
    title: '等待模型结果',
    content:
      `已提交 ${isLlmChat ? '语言模型请求' : `${input.mode} 任务`}${task?.id ? `：${task.id}` : ''}。` +
      '当前还没有拿到语言模型返回文本，所以先暂停在这里；收到结果后再继续生成 skill.md、引导卡片或剧本。',
    steps: [
      { id: 'task', label: isLlmChat ? '语言模型请求已提交' : '真实生成任务已提交', status: task?.status ?? 'pending' },
      { id: 'result', label: '等待 resultText / resultJson 文本', status: 'pending' },
    ],
  };
}

function createCreativeQuestionRuntimeMessage(
  plan: CreativeFlowPlan,
  step: CreativeQuestionStep,
  selectedOptionId?: string,
): ChatMessage {
  const question = createCreativeQuestion(plan, step, selectedOptionId);

  return {
    id: createRuntimeMessageId(`creative-question-${step}`),
    role: 'assistant',
    kind: 'questionCard',
    title: question.title,
    content: question.content,
    question: question.question,
    pageIndex: question.pageIndex,
    pageTotal: question.pageTotal,
    actionLabel: question.actionLabel,
    options: question.options,
  };
}

function createGeneratedScriptRuntimeMessage(prompt: string, script: string): ChatMessage {
  return {
    id: createRuntimeMessageId('creative-script-draft'),
    role: 'assistant',
    kind: 'scriptDraft',
    title: prompt,
    content: script,
  };
}

function createGeneratedScriptDocument(plan: CreativeFlowPlan, script: string): DocumentItem {
  const scriptLines = script
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    id: `script-draft-${Date.now()}`,
    title: `${plan.title || '剧本'}_Script.md`,
    active: true,
    body: [`${plan.title || '剧本'} 剧本`, ...scriptLines],
  };
}

function createScriptConfirmationRuntimeMessage(selectedOptionId: 'confirm' | 'revise' = 'confirm'): ChatMessage {
  return {
    id: createRuntimeMessageId('creative-script-confirm'),
    role: 'assistant',
    kind: 'confirmationCard',
    title: '剧本确认',
    content: '剧本已完整呈现，请确认是否进入故事板和视频制作流程。',
    actionLabel: '发送',
    options: [
      {
        id: 'confirm',
        title: '剧本确认，开始制作',
        description: '继续进入故事板、关键元素、素材生成和镜头视频制作流程。',
        selected: selectedOptionId === 'confirm',
      },
      {
        id: 'revise',
        title: '需要修改剧本',
        description: '先补充修改意见，再重新生成剧本。',
        selected: selectedOptionId === 'revise',
      },
    ],
  };
}

function createSkillPlanRuntimeMessage(plan: CreativeFlowPlan): ChatMessage {
  return {
    id: createRuntimeMessageId('creative-skill-plan'),
    role: 'assistant',
    kind: 'resultCard',
    title: 'Skill 已完成',
    content:
      `已为“${plan.topic}”生成流程规划 skill.md，并加载到当前项目文档。` +
      `这套流程将通过 ${plan.agentPackageName} 继续推进：剧本确认 -> Final_Video_Spec -> 故事板 -> 元素/音色 -> 镜头视频 -> 音频层 -> 剪辑导出。`,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForGenerationTaskText(
  task: GenerationTask | void,
  refreshTask: ChatPanelProps['onRefreshGenerationTask'],
): Promise<GenerationTask | undefined> {
  if (!task || task.resultText || task.status === 'failed' || !refreshTask) {
    return task ?? undefined;
  }

  let latestTask = task;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(1500);
    const refreshedTask = await refreshTask(latestTask.id);

    if (!refreshedTask) {
      continue;
    }

    latestTask = refreshedTask;

    if (latestTask.resultText || latestTask.status === 'failed') {
      return latestTask;
    }
  }

  return latestTask;
}

const fallbackSkillItems: SkillLibraryItem[] = [
  {
    id: 'fallback-music-video',
    name: '音乐MV（需上传音乐）',
    version: '1.0.0',
    description: '专为音乐 MV 制作设计的工作流，根据上传音乐驱动主角演唱表演。',
    source: 'backend',
    category: 'video',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '',
    compatibleStages: [],
  },
  {
    id: 'fallback-drama-voice',
    name: '剧情短片（音色参考）',
    version: '1.0.0',
    description: '角色语音锚定，适合剧情短片、角色对白和旁白音频。',
    source: 'backend',
    category: 'storyboard',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '',
    compatibleStages: [],
  },
  {
    id: 'fallback-script-video',
    name: '剧本生视频（需上传剧本）',
    version: '1.0.0',
    description: '分析上传剧本，提取脚本、镜头结构和角色场景。',
    source: 'backend',
    category: 'video',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '',
    compatibleStages: [],
  },
  {
    id: 'fallback-doc-short',
    name: '人文纪录短片',
    version: '1.0.0',
    description: '适合真实人文观察、纪录片式旁白和生活化影像。',
    source: 'backend',
    category: 'video',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '',
    compatibleStages: [],
  },
  {
    id: 'fallback-product-ad',
    name: '商品宣传短片',
    version: '1.0.0',
    description: '快速创建商业广告短片，呈现专业视觉效果和创意故事。',
    source: 'backend',
    category: 'video',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '',
    compatibleStages: [],
  },
];

export function ChatPanel({
  messages,
  activeAgentPackage,
  agentPackages = [],
  assets = [],
  enabledSkillIds = [],
  enabledSkills = [],
  generationTasks = [],
  modelError = null,
  modelOptions = fallbackModelOptions,
  onPrimaryAction,
  onRefreshGenerationTask,
  onRunCreativePipelineTask,
  onRunLlmChatTask,
  onSkillDocumentGenerated,
  onStoryboardElementsGenerated,
  onSubmitGenerationTask,
  onSwitchAgentPackage,
  onToggleSkill,
  paramStore,
  skills = [],
}: ChatPanelProps) {
  const chatStore = useChatStore();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runtimeMessages, setRuntimeMessages] = useState<ChatMessage[]>([]);
  const [creativeFlow, setCreativeFlow] = useState<CreativeFlowRuntimeState>(initialCreativeFlowState);
  const [selectedModelIdsByTab, setSelectedModelIdsByTab] = useState<
    Partial<Record<ComposerModelTab, string>>
  >({});
  const selectedAsset =
    assets.find((asset) => asset.id === chatStore.state.selectedAssetId) ??
    assets.find(isReferenceAsset) ??
    assets[0];
  const canUseSelectedAssetAsReference = isReferenceAsset(selectedAsset);
  const selectedAssetReferenceState = selectedAsset
    ? {
        cref: paramStore.state.crefAssetIds.includes(selectedAsset.id),
        sref: paramStore.state.srefAssetIds.includes(selectedAsset.id),
      }
    : { cref: false, sref: false };
  const crefAssets = assets.filter((asset) => paramStore.state.crefAssetIds.includes(asset.id));
  const srefAssets = assets.filter((asset) => paramStore.state.srefAssetIds.includes(asset.id));
  const referenceAssetCount = crefAssets.length + srefAssets.length;
  const skillItems = skills.length > 0 ? skills : fallbackSkillItems;
  const composerModelOptions = modelOptions;
  const availableModelTabs = useMemo(
    () => {
      const tabsWithEnabledModels = modelTabs.filter((tab) =>
        composerModelOptions.some((model) => model.tab === tab),
      );

      return tabsWithEnabledModels.length > 0 ? tabsWithEnabledModels : modelTabs;
    },
    [composerModelOptions],
  );
  const activeModelTab = availableModelTabs.includes(chatStore.state.modelTab)
    ? chatStore.state.modelTab
    : availableModelTabs[0] ?? '视频模型';
  const activeModelOptions = composerModelOptions.filter((model) => model.tab === activeModelTab);
  const selectedAgentPackage = activeAgentPackage ?? agentPackages[0];
  const displayedMessages = [...messages, ...runtimeMessages];
  const lastDisplayedMessage = displayedMessages.at(-1);
  const canSubmit =
    !isSubmitting && (chatStore.state.draft.trim().length > 0 || Boolean(lastDisplayedMessage?.actionLabel));
  const submitStatusLabel = isSubmitting
    ? '已发送，Autumn 正在思考和制作...'
    : null;
  const summaryTasks =
    generationTasks.length > 0
      ? generationTasks.slice(0, 4)
      : [
          { id: 'fallback-asset', label: '素材分析', status: 'completed' as const },
          { id: 'fallback-shot', label: '镜头脚本', status: 'completed' as const },
          { id: 'fallback-video', label: '视频生成', status: 'running' as const },
          { id: 'fallback-compose', label: '成片合成', status: 'pending' as const },
        ];

  useEffect(() => {
    const selectedModel = composerModelOptions.find((model) => model.id === paramStore.state.modelId);

    if (!selectedModel) {
      return;
    }

    setSelectedModelIdsByTab((current) => {
      if (current[selectedModel.tab] === selectedModel.id) {
        return current;
      }

      return {
        ...current,
        [selectedModel.tab]: selectedModel.id,
      };
    });
  }, [composerModelOptions, paramStore.state.modelId]);

  useEffect(() => {
    const scrollElement = chatScrollRef.current;

    if (!scrollElement) {
      return;
    }

    scrollElement.scrollTo({
      top: scrollElement.scrollHeight,
      behavior: 'smooth',
    });
  }, [displayedMessages.length, isSubmitting]);

  function updateRuntimeMessage(
    messageId: string,
    updateMessage: (message: ChatMessage) => ChatMessage,
  ) {
    setRuntimeMessages((current) =>
      current.map((message) => (message.id === messageId ? updateMessage(message) : message)),
    );
  }

  function selectComposerModel(model: ModelConfigOption) {
    setSelectedModelIdsByTab((current) => ({
      ...current,
      [model.tab]: model.id,
    }));
    paramStore.setModel(model.id);
  }

  function selectModelTab(tab: ComposerModelTab) {
    chatStore.setModelTab(tab);

    const selectedModelInTab = composerModelOptions.find(
      (model) => model.id === paramStore.state.modelId && model.tab === tab,
    );
    const rememberedModelId = selectedModelIdsByTab[tab];
    const rememberedModel =
      rememberedModelId
        ? composerModelOptions.find((model) => model.id === rememberedModelId && model.tab === tab)
        : undefined;
    const fallbackModel = composerModelOptions.find((model) => model.tab === tab);
    const nextModel = selectedModelInTab ?? rememberedModel ?? fallbackModel;

    if (nextModel) {
      selectComposerModel(nextModel);
    }
  }

  function getCreativeQuestionStepFromMessage(message?: ChatMessage): CreativeQuestionStep | null {
    const match = message?.id.match(/^creative-question-(coreRequirements|styleConstraints)-/);
    const step = match?.[1] as CreativeQuestionStep | undefined;

    return step && creativeQuestionSteps.includes(step) ? step : null;
  }

  function getSelectionsWithDefaults(
    plan: CreativeFlowPlan,
    selections: CreativeSelections,
  ): Required<CreativeSelections> {
    return {
      ...getDefaultCreativeSelections(plan),
      ...selections,
    };
  }

  function updateRuntimeMessageOption(messageId: string, optionId: string) {
    setRuntimeMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              options: message.options?.map((option) => ({
                ...option,
                selected: option.id === optionId,
              })),
            }
          : message,
      ),
    );
  }

  function selectCreativeOption(message: ChatMessage, optionId: string) {
    const step = getCreativeQuestionStepFromMessage(message);

    if (step) {
      if (creativeFlow.phase !== step) {
        return;
      }

      setCreativeFlow((current) => ({
        ...current,
        selections: {
          ...current.selections,
          [step]: optionId,
        },
      }));
      updateRuntimeMessageOption(message.id, optionId);
      return;
    }

    if (
      message.id.startsWith('creative-script-confirm') &&
      creativeFlow.phase === 'scriptReview' &&
      (optionId === 'confirm' || optionId === 'revise')
    ) {
      setCreativeFlow((current) => ({
        ...current,
        confirmationChoice: optionId,
      }));
      updateRuntimeMessageOption(message.id, optionId);
    }
  }

  async function startCreativeFlow(prompt: string) {
    const progressMessageId = createRuntimeMessageId('assistant-flow-progress');
    const slowPlanningTimer = globalThis.setTimeout(() => {
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '模型响应较慢',
          '语言模型还在返回流程规划。我会再等一小会；如果仍没有结果，会自动切换成本地流程规划继续推进。',
          [
            { id: 'thinking', label: '思考中：理解主题与视频目标', status: 'running' },
            { id: 'task', label: '等待语言模型响应', status: 'running' },
            { id: 'document', label: '写入流程文档', status: 'pending' },
          ],
        ),
      );
    }, 8_000);

    function completeWithPlan(plan: CreativeFlowPlan, progressTitle: string, progressContent: string) {
      const selections = getDefaultCreativeSelections(plan);

      onSkillDocumentGenerated?.(plan.document);
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          progressTitle,
          progressContent,
          [
            { id: 'thinking', label: '思考中：理解主题与视频目标', status: 'completed' },
            { id: 'task', label: '流程规划已生成', status: 'completed' },
            { id: 'document', label: 'skill.md 已写入文档列表', status: 'completed' },
          ],
        ),
      );

      setCreativeFlow({
        confirmationChoice: 'confirm',
        generatedScript: null,
        phase: 'coreRequirements',
        plan,
        selections,
      });
      setRuntimeMessages((current) => [
        ...current,
        createSkillPlanRuntimeMessage(plan),
        createCreativeQuestionRuntimeMessage(plan, 'coreRequirements', selections.coreRequirements),
      ]);
    }

    function completeWithLocalPlan(reason: string) {
      const plan = createCreativeFlowPlan(prompt, selectedAgentPackage);

      setSubmitError(null);
      completeWithPlan(
        plan,
        '已切换本地流程规划',
        `${reason} 我已先根据你的故事灵感和当前 Agent 数据包生成流程规划、10 项以上核心需求推荐和 10 项以上风格约束推荐。`,
      );
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setRuntimeMessages((current) => [
      ...current,
      createUserRuntimeMessage(prompt),
      createRuntimeProgressMessage(
        progressMessageId,
        '正在理解创意',
        'Autumn 正在拆解你的需求、匹配 Agent / Skill，并准备创作流程。',
        [
          { id: 'thinking', label: '思考中：理解主题与视频目标', status: 'running' },
          { id: 'task', label: '创建流程规划任务', status: 'pending' },
          { id: 'document', label: '写入流程文档', status: 'pending' },
        ],
      ),
    ]);

    try {
      const planningTaskInput = createCreativeSkillPlanningGenerationTaskInput({
        agentPackage: selectedAgentPackage,
        enabledSkillIds,
        enabledSkills,
        generationParams: paramStore.state,
        modelOptions: composerModelOptions,
        selectedModelIdsByTab,
        userPrompt: prompt,
      });
      const createdTask =
        onRunLlmChatTask
          ? await onRunLlmChatTask(planningTaskInput)
          : await onSubmitGenerationTask?.(planningTaskInput);
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '流程规划制作中',
          `已调用 ${planningTaskInput.channelKey} / ${planningTaskInput.modelId}，正在等待语言模型返回流程规划。`,
          [
            { id: 'thinking', label: '思考中：理解主题与视频目标', status: 'completed' },
            { id: 'task', label: `流程规划任务${getTaskStatusLabel(createdTask?.status ?? 'running')}`, status: createdTask?.status ?? 'running' },
            { id: 'document', label: '等待写入流程文档', status: 'pending' },
          ],
        ),
      );

      const planningTask = await waitForGenerationTaskText(createdTask, onRefreshGenerationTask);

      if (planningTask?.status === 'failed') {
        throw new Error(planningTask.errorMessage ?? '语言模型流程规划任务失败。');
      }

      if (!planningTask?.resultText) {
        completeWithLocalPlan('后台语言模型暂未返回流程规划文本。');
        return;
      }

      const plan = createCreativeFlowPlanFromModelResult(
        prompt,
        planningTask.resultText,
        selectedAgentPackage,
      );

      completeWithPlan(plan, '流程规划已完成', '已生成创作流程，并把 skill.md 写入文档列表。');
    } catch (error) {
      completeWithLocalPlan(
        error instanceof Error
          ? `语言模型流程规划没有及时完成：${error.message}`
          : '语言模型流程规划没有及时完成。',
      );
    } finally {
      globalThis.clearTimeout(slowPlanningTimer);
      setIsSubmitting(false);
    }
  }

  function getNextCreativeStep(step: CreativeQuestionStep): CreativeQuestionStep | null {
    if (step === 'coreRequirements') {
      return 'styleConstraints';
    }

    return null;
  }

  function syncDurationParam(selectionId?: string) {
    if (selectionId === 'style-genre') {
      paramStore.setDuration(30);
      return;
    }

    if (selectionId === 'style-expanded') {
      paramStore.setDuration(180);
      return;
    }

    paramStore.setDuration(120);
  }

  async function submitCreativeScriptDraftTask(
    plan: CreativeFlowPlan,
    selections: Required<CreativeSelections>,
  ) {
    const progressMessageId = createRuntimeMessageId('assistant-script-progress');

    function completeScriptDraft(script: string, progressTitle: string, progressContent: string) {
      const scriptDocument = createGeneratedScriptDocument(plan, script);

      onSkillDocumentGenerated?.(scriptDocument);
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          progressTitle,
          `${progressContent} 文档已保存到：${scriptDocument.title}。`,
          [
            { id: 'thinking', label: '思考中：整理角色、冲突和节奏', status: 'completed' },
            { id: 'task', label: '剧本草稿已生成', status: 'completed' },
            { id: 'document', label: '剧本文档已写入文档列表', status: 'completed' },
          ],
        ),
      );

      setCreativeFlow((current) => ({
        ...current,
        confirmationChoice: 'confirm',
        generatedScript: script,
        phase: 'scriptReview',
        selections,
      }));
      setRuntimeMessages((current) => [
        ...current,
        createGeneratedScriptRuntimeMessage(createCreativeScriptTitle(plan), script),
        createScriptConfirmationRuntimeMessage('confirm'),
      ]);
    }

    function completeWithLocalScriptDraft(reason: string) {
      setSubmitError(null);
      completeScriptDraft(
        createCreativeScriptDraft(plan, selections),
        '已切换本地剧本草稿',
        `${reason} 我已先根据当前核心需求和风格约束生成本地剧本草稿。`,
      );
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setRuntimeMessages((current) => [
      ...current,
      createRuntimeProgressMessage(
        progressMessageId,
        '剧本制作中',
        'Autumn 正在根据你的选择起草完整剧本，请稍等片刻。',
        [
          { id: 'thinking', label: '思考中：整理角色、冲突和节奏', status: 'running' },
          { id: 'task', label: '调用语言模型生成剧本', status: 'pending' },
          { id: 'document', label: '保存剧本文档', status: 'pending' },
        ],
      ),
    ]);

    try {
      const scriptTaskInput = createCreativeScriptDraftGenerationTaskInput({
        agentPackage: selectedAgentPackage,
        enabledSkillIds,
        enabledSkills,
        generationParams: paramStore.state,
        modelOptions: composerModelOptions,
        plan,
        selectedModelIdsByTab,
        selections,
      });
      const createdTask =
        onRunLlmChatTask
          ? await onRunLlmChatTask(scriptTaskInput)
          : await onSubmitGenerationTask?.(scriptTaskInput);
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '剧本制作中',
          `已调用 ${scriptTaskInput.channelKey} / ${scriptTaskInput.modelId}，正在等待剧本草稿。`,
          [
            { id: 'thinking', label: '思考中：整理角色、冲突和节奏', status: 'completed' },
            { id: 'task', label: `剧本生成任务${getTaskStatusLabel(createdTask?.status ?? 'running')}`, status: createdTask?.status ?? 'running' },
            { id: 'document', label: '等待保存剧本文档', status: 'pending' },
          ],
        ),
      );

      const scriptTask = await waitForGenerationTaskText(createdTask, onRefreshGenerationTask);

      if (scriptTask?.status === 'failed') {
        throw new Error(scriptTask.errorMessage ?? '语言模型剧本生成任务失败。');
      }

      if (!scriptTask?.resultText) {
        completeWithLocalScriptDraft('后台语言模型暂未返回剧本文本。');
        return;
      }

      completeScriptDraft(scriptTask.resultText, '剧本制作完成', '剧本已由语言模型生成。');
    } catch (error) {
      completeWithLocalScriptDraft(
        error instanceof Error
          ? `语言模型剧本生成没有及时完成：${error.message}`
          : '语言模型剧本生成没有及时完成。',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCreativeQuestionAction(message: ChatMessage): boolean {
    const step = getCreativeQuestionStepFromMessage(message);
    const plan = creativeFlow.plan;

    if (!step || !plan) {
      return false;
    }

    if (creativeFlow.phase !== step) {
      return true;
    }

    const selections = getSelectionsWithDefaults(plan, creativeFlow.selections);
    const nextStep = getNextCreativeStep(step);

    if (step === 'styleConstraints') {
      syncDurationParam(selections.styleConstraints);

      setCreativeFlow((current) => ({
        ...current,
        phase: 'scriptGenerating',
        selections,
      }));
      setRuntimeMessages((current) => [
        ...current,
        createUserRuntimeMessage(createStyleRequirementSummary(plan, selections)),
      ]);
      void submitCreativeScriptDraftTask(plan, selections);
      return true;
    }

    if (nextStep) {
      setCreativeFlow((current) => ({
        ...current,
        phase: nextStep,
        selections,
      }));
      setRuntimeMessages((current) => [
        ...current,
        createUserRuntimeMessage(createCoreRequirementSummary(plan, selections)),
        createCreativeQuestionRuntimeMessage(plan, nextStep, selections[nextStep]),
      ]);
      return true;
    }

    return false;
  }

  async function submitGenerationPrompt(prompt: string, options: { clearDraft?: boolean; echoUser?: boolean } = {}) {
    const { clearDraft = false, echoUser = true } = options;
    const progressMessageId = createRuntimeMessageId('assistant-generation-progress');

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      setRuntimeMessages((current) => [
        ...current,
        ...(echoUser ? [createUserRuntimeMessage(prompt)] : []),
        createRuntimeProgressMessage(
          progressMessageId,
          '正在创建生成任务',
          'Autumn 已收到你的消息，正在整理参数并提交给生成队列。',
          [
            { id: 'thinking', label: '思考中：整理提示词和参考素材', status: 'running' },
            { id: 'task', label: '创建生成任务', status: 'pending' },
            { id: 'queue', label: '等待后台制作', status: 'pending' },
          ],
        ),
      ]);

      const taskInput = createComposerGenerationTaskInput({
        agentPackage: selectedAgentPackage,
        enabledSkillIds,
        enabledSkills,
        modelOptions: composerModelOptions,
        modelTab: activeModelTab,
        params: paramStore.state,
        prompt,
        selectedAsset,
      });
      const task = await onSubmitGenerationTask?.(taskInput);
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '生成任务已提交',
          `已通过 ${taskInput.channelKey} / ${taskInput.modelId} 创建任务${task?.id ? `：${task.id}` : ''}。`,
          [
            { id: 'thinking', label: '思考中：整理提示词和参考素材', status: 'completed' },
            { id: 'task', label: '生成任务已创建', status: 'completed' },
            { id: 'queue', label: `后台制作${getTaskStatusLabel(task?.status ?? 'pending')}`, status: task?.status ?? 'pending' },
          ],
        ),
      );

      if (clearDraft) {
        chatStore.submitDraft();
      }

      onPrimaryAction?.();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '生成任务创建失败。');
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '生成任务创建失败',
          error instanceof Error ? error.message : '生成任务创建失败。',
          [
            { id: 'thinking', label: '思考中：整理提示词和参考素材', status: 'completed' },
            { id: 'task', label: '创建生成任务失败', status: 'failed' },
            { id: 'queue', label: '后台制作未开始', status: 'pending' },
          ],
        ),
      );
      setRuntimeMessages((current) => [...current, createTaskErrorRuntimeMessage(error)]);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  async function submitCreativePipelineTask(confirmedScript: string) {
    const plan = creativeFlow.plan;
    const progressMessageId = createRuntimeMessageId('assistant-pipeline-progress');

    if (!plan) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setRuntimeMessages((current) => [
      ...current,
      createRuntimeProgressMessage(
        progressMessageId,
        '开始制作视频规格',
        '已收到剧本确认，正在进入故事板和视频制作准备流程。',
        [
          { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
          { id: 'agent', label: 'Agent 制作中', status: 'running' },
          { id: 'document', label: '等待写入文档列表', status: 'pending' },
          { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
        ],
      ),
    ]);

    try {
      const selections = getSelectionsWithDefaults(plan, creativeFlow.selections);
      const persistPipelineResult = (resultText: string) => {
        const documents = createCreativePipelineDocumentsFromAgentResult(
          plan,
          selections,
          confirmedScript,
          resultText,
        );
        const storyboardElements = createCreativePipelineStoryboardElementsFromAgentResult(resultText);

        documents.forEach((document) => onSkillDocumentGenerated?.(document));
        if (storyboardElements.length > 0) {
          onStoryboardElementsGenerated?.(storyboardElements);
        }

        updateRuntimeMessage(progressMessageId, () =>
          createRuntimeProgressMessage(
            progressMessageId,
            '视频规格制作完成',
            `已生成规格与故事板，并写入文档列表：${documents.map((document) => document.title).join('、')}。`,
            [
              { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
              { id: 'agent', label: 'Agent 制作已完成', status: 'completed' },
              { id: 'document', label: '规格与故事板已写入文档列表', status: 'completed' },
              {
                id: 'storyboard',
                label: storyboardElements.length > 0 ? '故事板元素已生成' : '故事板元素等待后续拆分',
                status: storyboardElements.length > 0 ? 'completed' : 'pending',
              },
            ],
          ),
        );
        setRuntimeMessages((current) => [
          ...current,
          createCreativePipelineDocumentsRuntimeMessage(documents),
        ]);
      };
      const submitLlmPipelineTask = async (fallbackError?: unknown) => {
        const taskInput = createCreativePipelineGenerationTaskInput({
          agentPackage: selectedAgentPackage,
          confirmedScript,
          enabledSkillIds,
          enabledSkills,
          generationParams: paramStore.state,
          modelOptions: composerModelOptions,
          plan,
          selectedModelIdsByTab,
          selections,
        });

        updateRuntimeMessage(progressMessageId, () =>
          createRuntimeProgressMessage(
            progressMessageId,
            fallbackError ? '切换模型流水线制作' : '视频规格制作中',
            fallbackError
              ? `Text Agent 暂时不可用，已切换到语言模型流水线继续生成规格与故事板。原因：${fallbackError instanceof Error ? fallbackError.message : 'Agent 接口异常'}`
              : `已通过 ${taskInput.channelKey} / ${taskInput.modelId} 创建流水线任务。`,
            [
              { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
              {
                id: 'agent',
                label: fallbackError ? 'Text Agent 暂不可用，已降级' : '准备创建流水线任务',
                status: fallbackError ? 'completed' : 'running',
              },
              { id: 'fallback', label: '语言模型流水线制作中', status: 'running' },
              { id: 'document', label: '等待写入文档列表', status: 'pending' },
              { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
            ],
          ),
        );

        const task = await onSubmitGenerationTask?.(taskInput);
        updateRuntimeMessage(progressMessageId, () =>
          createRuntimeProgressMessage(
            progressMessageId,
            '视频规格制作中',
            `已通过 ${taskInput.channelKey} / ${taskInput.modelId} 创建流水线任务${task?.id ? `：${task.id}` : ''}。`,
            [
              { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
              {
                id: 'agent',
                label: fallbackError ? 'Text Agent 暂不可用，已降级' : '流水线任务已创建',
                status: 'completed',
              },
              {
                id: 'fallback',
                label: `语言模型流水线${getTaskStatusLabel(task?.status ?? 'running')}`,
                status: task?.status ?? 'running',
              },
              { id: 'document', label: '等待写入文档列表', status: 'pending' },
              { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
            ],
          ),
        );
        const latestTask = await waitForGenerationTaskText(task, onRefreshGenerationTask);

        if (latestTask?.status === 'failed') {
          throw new Error(latestTask.errorMessage ?? '语言模型流水线任务失败。');
        }

        if (latestTask?.resultText) {
          persistPipelineResult(latestTask.resultText);
        } else {
          updateRuntimeMessage(progressMessageId, () =>
            createRuntimeProgressMessage(
              progressMessageId,
              '后台仍在制作',
              '流水线任务已提交，后台还在生成规格与故事板；当前暂未拿到可写入文档的结果文本。',
              [
                { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
                {
                  id: 'agent',
                  label: fallbackError ? 'Text Agent 暂不可用，已降级' : '流水线任务已创建',
                  status: 'completed',
                },
                { id: 'fallback', label: '语言模型流水线制作中', status: latestTask?.status ?? 'running' },
                { id: 'document', label: '等待写入文档列表', status: 'pending' },
                { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
              ],
            ),
          );
        }
      };

      if (onRunCreativePipelineTask) {
        const textAgentInput = createCreativePipelineTextAgentRunInput({
          agentPackage: selectedAgentPackage,
          confirmedScript,
          enabledSkillIds,
          enabledSkills,
          modelOptions: composerModelOptions,
          plan,
          selectedModelIdsByTab,
          selections,
        });
        let task: GenerationTask | void;

        try {
          task = await onRunCreativePipelineTask(textAgentInput);
        } catch (textAgentError) {
          if (!onSubmitGenerationTask) {
            throw textAgentError;
          }

          await submitLlmPipelineTask(textAgentError);
          onPrimaryAction?.();
          setIsSubmitting(false);
          return;
        }

        updateRuntimeMessage(progressMessageId, () =>
          createRuntimeProgressMessage(
            progressMessageId,
            'Agent 制作中',
            `已通过 ${textAgentInput.agentPackId} / ${textAgentInput.modelKey || 'LLM'} 启动视频规格与故事板制作${task?.id ? `：${task.id}` : ''}。`,
            [
              { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
              { id: 'agent', label: `Agent 制作${getTaskStatusLabel(task?.status ?? 'running')}`, status: task?.status ?? 'running' },
              { id: 'document', label: '等待写入文档列表', status: 'pending' },
              { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
            ],
          ),
        );

        const latestTask = await waitForGenerationTaskText(task, onRefreshGenerationTask);

        if (latestTask?.status === 'failed') {
          throw new Error(latestTask.errorMessage ?? 'Agent 流程任务失败。');
        }

        if (latestTask?.resultText) {
          persistPipelineResult(latestTask.resultText);
        } else {
          updateRuntimeMessage(progressMessageId, () =>
            createRuntimeProgressMessage(
              progressMessageId,
              '后台仍在制作',
              'Agent 任务已提交，后台还在生成规格与故事板；当前暂未拿到可写入文档的结果文本。',
              [
                { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
                { id: 'agent', label: 'Agent 任务制作中', status: latestTask?.status ?? 'running' },
                { id: 'document', label: '等待写入文档列表', status: 'pending' },
                { id: 'storyboard', label: '等待生成故事板元素', status: 'pending' },
              ],
            ),
          );
        }

        onPrimaryAction?.();
        setIsSubmitting(false);
        return;
      }

      await submitLlmPipelineTask();
      onPrimaryAction?.();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Agent 流程任务创建失败。');
      updateRuntimeMessage(progressMessageId, () =>
        createRuntimeProgressMessage(
          progressMessageId,
          '视频规格制作失败',
          error instanceof Error ? error.message : 'Agent 流程任务创建失败。',
          [
            { id: 'confirm', label: '剧本确认已收到', status: 'completed' },
            { id: 'agent', label: 'Agent 制作失败', status: 'failed' },
            { id: 'document', label: '文档暂未写入', status: 'pending' },
            { id: 'storyboard', label: '故事板暂未生成', status: 'pending' },
          ],
        ),
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  function handleScriptConfirmationAction(message: ChatMessage): boolean {
    if (!message.id.startsWith('creative-script-confirm')) {
      return false;
    }

    if (creativeFlow.phase !== 'scriptReview') {
      return true;
    }

    if (creativeFlow.confirmationChoice === 'revise') {
      setRuntimeMessages((current) => [
        ...current,
        createUserRuntimeMessage('需要修改剧本'),
        {
          id: createRuntimeMessageId('assistant-revise-hint'),
          role: 'assistant',
          kind: 'resultCard',
          title: '收到',
          content: '请直接在输入框补充要修改的结局、角色、节奏或台词，我会基于当前核心需求重新整理剧本。',
        },
      ]);
      return true;
    }

    const script = creativeFlow.generatedScript;

    if (!script) {
      return false;
    }

    setRuntimeMessages((current) => [...current, createUserRuntimeMessage('剧本确认，开始制作')]);
    void submitCreativePipelineTask(script);
    return true;
  }

  function handleMessageAction(message?: ChatMessage) {
    if (isSubmitting) {
      return;
    }

    if (message && handleCreativeQuestionAction(message)) {
      return;
    }

    if (message && handleScriptConfirmationAction(message)) {
      return;
    }

    onPrimaryAction?.();
  }

  async function submitComposerPrompt() {
    if (!canSubmit) {
      return;
    }

    const prompt = chatStore.state.draft.trim();

    if (!prompt) {
      handleMessageAction(lastDisplayedMessage);
      return;
    }

    chatStore.submitDraft();
    composerInputRef.current?.focus();

    if (shouldStartCreativeScriptFlow(prompt)) {
      setSubmitError(null);
      await startCreativeFlow(prompt);
      return;
    }

    await submitGenerationPrompt(prompt, { clearDraft: false, echoUser: true });
  }

  function handleSubmit() {
    void submitComposerPrompt();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (!chatStore.state.draft.trim()) {
      return;
    }

    void submitComposerPrompt();
  }

  function toggleSelectedReference(kind: ReferenceKind) {
    if (!selectedAsset || !canUseSelectedAssetAsReference) {
      return;
    }

    paramStore.toggleReferenceAsset(kind, selectedAsset.id);
  }

  return (
    <Panel title="对话" icon="◱" actions={<button className="close-button">×</button>} className="chat-panel">
      <div className="chat-scroll" ref={chatScrollRef}>
        {displayedMessages.length === 0 ? <div className="chat-empty">暂无消息</div> : null}
        {displayedMessages.map((message) => (
          <article className={`chat-message chat-message--${message.kind}`} key={message.id}>
            {message.role === 'assistant' ? <strong className="autumn-assistant-logo">Autumn</strong> : null}
            {message.title ? <h3>{message.title}</h3> : null}
            <p>{message.content}</p>

            {message.options ? (
              <div className="option-list">
                {message.question ? <strong className="option-list__question">{message.question}</strong> : null}
                {message.options.map((option) => (
                  <button
                    className={option.selected ? 'option option--selected' : 'option'}
                    disabled={isSubmitting}
                    key={option.id}
                    onClick={() => selectCreativeOption(message, option.id)}
                    type="button"
                  >
                    <span className="radio-mark">{option.selected ? '●' : '○'}</span>
                    <div>
                      <strong>{option.title}</strong>
                      {option.description ? <p>{option.description}</p> : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {message.steps ? (
              <div className="step-list">
                {message.steps.map((step) => (
                  <div className={`step step--${step.status}`} key={step.id}>
                    <span>
                      {step.status === 'completed'
                        ? '✓'
                        : step.status === 'failed'
                          ? '!'
                          : step.status === 'running'
                            ? '•••'
                            : '○'}
                    </span>
                    <strong>{step.label}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {message.pageTotal || message.actionLabel ? (
              <footer className="question-footer">
                <span>{message.pageTotal ? `${message.pageIndex}/${message.pageTotal}` : ''}</span>
                {message.actionLabel ? (
                  <button disabled={isSubmitting} onClick={() => handleMessageAction(message)} type="button">
                    {isSubmitting ? '制作中...' : message.actionLabel}
                  </button>
                ) : null}
              </footer>
            ) : null}
          </article>
        ))}
        {assets.length > 0 ? (
          <section className="chat-production-summary" aria-label="生产状态摘要">
            <div className="production-summary-hero">
              <strong>Autumn</strong>
              <p>规格文档已建立，现在自动生成故事板设计。</p>
            </div>
            <div className="production-summary-cards">
              <span>
                <i aria-hidden="true">▣</i>
                <strong>视频规格</strong>
                <small>已完成</small>
              </span>
              <span>
                <i aria-hidden="true">▦</i>
                <strong>故事板</strong>
                <small>已更新</small>
              </span>
            </div>
            <div className="production-summary-pipeline">
              {summaryTasks.map((task) => (
                <span className={`production-summary-step production-summary-step--${task.status}`} key={task.id}>
                  <i aria-hidden="true" />
                  {task.label}
                </span>
              ))}
            </div>
            <div className="production-summary-grid">
              {assets.slice(0, 4).map((asset) => (
                <span key={asset.id}>
                  <i className={`production-summary-dot production-summary-dot--${asset.status}`} />
                  {asset.name}
                  {typeof asset.progress === 'number' ? <small>{asset.progress}%</small> : null}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <div className="chat-floaters" aria-hidden="true">
        <button type="button">⌘✦</button>
        <button type="button">↔A</button>
      </div>
      <div className="chat-composer">
        {chatStore.state.activeOverlay === 'model' ? (
          <section className="composer-popover composer-popover--model" aria-label="模型选择">
            <header className="composer-popover__header">
              <h2>模型</h2>
            </header>
            <div className="model-tabs" role="tablist">
              {availableModelTabs.map((tab) => (
                <button
                  className={activeModelTab === tab ? 'model-tab model-tab--active' : 'model-tab'}
                  key={tab}
                  onClick={() => selectModelTab(tab)}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="composer-popover__section-title">
              {activeModelTab} · 已启用 {activeModelOptions.length}
            </span>
            <div className="model-option-list">
              {modelError ? (
                <div className="composer-empty-state composer-empty-state--error">{modelError}</div>
              ) : null}
              {activeModelOptions.length === 0 ? (
                <div className="composer-empty-state">后台暂未启用该分类模型</div>
              ) : null}
              {activeModelOptions
                .map((model) => {
                  const isSelected = paramStore.state.modelId === model.id;

                  return (
                    <article
                      className={[
                        'model-option',
                        model.featured ? 'model-option--featured' : '',
                        isSelected ? 'model-option--selected' : '',
                      ].filter(Boolean).join(' ')}
                      key={model.id}
                      onClick={() => selectComposerModel(model)}
                    >
                      <span className="model-option__mark" aria-hidden="true" />
                      <div className="model-option__content">
                        <div className="model-option__title-row">
                          <strong title={model.name}>{model.name}</strong>
                          <div className="model-option__badges">
                            {model.badges.map((badge) => (
                              <span key={badge}>{badge}</span>
                            ))}
                          </div>
                        </div>
                        <p>{model.description}</p>
                      </div>
                      <button
                        aria-label={`选择模型 ${model.name}`}
                        aria-pressed={isSelected}
                        onClick={(event: MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          selectComposerModel(model);
                        }}
                        type="button"
                      >
                        {isSelected ? '✓' : '+'}
                      </button>
                    </article>
                  );
                })}
            </div>
          </section>
        ) : null}

        {chatStore.state.activeOverlay === 'skill' ? (
          <section className="composer-popover composer-popover--skill" aria-label="Skill 和 Agent 选择">
            <header className="composer-popover__header">
              <h2>Agent / Skill</h2>
              <button type="button">后台系统</button>
            </header>
            <span className="composer-popover__section-title">Agent 系统</span>
            <div className="agent-system-list">
              {agentPackages.map((agentPackage) => (
                <button
                  className={[
                    'agent-system-card',
                    selectedAgentPackage?.id === agentPackage.id ? 'agent-system-card--active' : '',
                  ].filter(Boolean).join(' ')}
                  key={agentPackage.id}
                  onClick={() => onSwitchAgentPackage?.(agentPackage.id)}
                  type="button"
                >
                  <span>{selectedAgentPackage?.id === agentPackage.id ? '✓' : '▣'}</span>
                  <strong>{agentPackage.name}</strong>
                  <small>
                    {agentPackage.agents.length} Agents · {agentPackage.skills.length} Skills
                    {agentPackage.syncStatus === 'synced' ? ' · 已启用' : ''}
                  </small>
                </button>
              ))}
              {agentPackages.length === 0 ? (
                <div className="composer-empty-state">后台暂未返回 Agent 系统</div>
              ) : null}
            </div>
            <span className="composer-popover__section-title">Skill 能力</span>
            <div className="skill-picker-list">
              {skillItems.slice(0, 5).map((skill, index) => (
                <article
                  className={[
                    'skill-picker-item',
                    enabledSkillIds.includes(skill.id) ? 'skill-picker-item--active' : '',
                  ].filter(Boolean).join(' ')}
                  key={skill.id}
                >
                  <span className={`skill-picker-thumb skill-picker-thumb--${(index % 5) + 1}`} />
                  <div>
                    <strong>{skill.name}</strong>
                    <p>{skill.description}</p>
                    <small>
                      {skill.source === 'agentPackage'
                        ? '数据包内置'
                        : skill.source === 'backend'
                          ? '后台 Skill'
                          : '本地 Skill'}
                      {skill.storageScope === 'device' ? ' | 仅本设备' : ''}
                      {enabledSkillIds.includes(skill.id) ? ' | 已启用' : ''}
                    </small>
                  </div>
                  <div className="skill-picker-actions">
                    <button aria-label={`预览 ${skill.name}`} type="button">◎</button>
                    <button
                      aria-label={`${enabledSkillIds.includes(skill.id) ? '停用' : '启用'} ${skill.name}`}
                      disabled={!onToggleSkill || skill.source === 'agentPackage'}
                      onClick={() => onToggleSkill?.(skill.id)}
                      type="button"
                    >
                      {enabledSkillIds.includes(skill.id) ? '✓' : '+'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {selectedAgentPackage ? (
              <div className="agent-picker-row">
                <span>当前 Agents</span>
                {selectedAgentPackage.agents.slice(0, 3).map((agent) => (
                  <button key={agent.id} type="button">
                    {agent.name}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {chatStore.state.activeOverlay === 'asset' ? (
          <section className="composer-popover composer-popover--asset" aria-label="素材库">
            <div className="asset-reference-preview">
              <div
                className="asset-preview-large"
                style={selectedAsset?.thumbnail ? { background: selectedAsset.thumbnail } : undefined}
              >
                <strong>{selectedAsset?.name ?? '暂无素材'}</strong>
                <span>{getAssetTypeLabel(selectedAsset?.type)}</span>
              </div>
              {selectedAsset ? (
                <div className="asset-reference-actions" aria-label="参考素材">
                  <button
                    className={selectedAssetReferenceState.cref ? 'is-active' : undefined}
                    disabled={!canUseSelectedAssetAsReference}
                    title={canUseSelectedAssetAsReference ? '绑定为角色参考' : '只有图片素材可作为角色参考'}
                    type="button"
                    onClick={() => toggleSelectedReference('cref')}
                  >
                    CRef
                  </button>
                  <button
                    className={selectedAssetReferenceState.sref ? 'is-active' : undefined}
                    disabled={!canUseSelectedAssetAsReference}
                    title={canUseSelectedAssetAsReference ? '绑定为风格参考' : '只有图片素材可作为风格参考'}
                    type="button"
                    onClick={() => toggleSelectedReference('sref')}
                  >
                    SRef
                  </button>
                </div>
              ) : null}
            </div>
            <div className="asset-reference-panel" aria-label="参考参数">
              <header>
                <div>
                  <strong>参考参数</strong>
                  <small>垫图 / 角色 / 风格</small>
                </div>
                <span>{referenceAssetCount} refs</span>
              </header>
              <div className="asset-reference-selected">
                <span>垫图</span>
                <strong>{selectedAsset?.name ?? '未选择素材'}</strong>
                <small>
                  {selectedAsset ? getAssetTypeLabel(selectedAsset.type) : '请选择图片素材'}
                  {canUseSelectedAssetAsReference ? ' | 可绑定 CRef/SRef' : ''}
                </small>
              </div>
              <label className="asset-weight-control">
                <span>
                  <strong>IW</strong>
                  <small>{formatImageWeight(paramStore.state.imageWeight)}</small>
                </span>
                <input
                  aria-label="垫图权重"
                  max={generationParamLimits.imageWeight.max}
                  min={generationParamLimits.imageWeight.min}
                  step="0.05"
                  type="range"
                  value={paramStore.state.imageWeight}
                  onChange={(event) => paramStore.setImageWeight(Number(event.target.value))}
                />
              </label>
              <label className="asset-weight-control">
                <span>
                  <strong>CW</strong>
                  <small>{Math.round(paramStore.state.contentWeight)}</small>
                </span>
                <input
                  aria-label="角色参考权重"
                  max={generationParamLimits.contentWeight.max}
                  min={generationParamLimits.contentWeight.min}
                  step="1"
                  type="range"
                  value={paramStore.state.contentWeight}
                  onChange={(event) => paramStore.setReferenceWeight('cref', Number(event.target.value))}
                />
              </label>
              <label className="asset-weight-control">
                <span>
                  <strong>SW</strong>
                  <small>{Math.round(paramStore.state.styleWeight)}</small>
                </span>
                <input
                  aria-label="风格参考权重"
                  max={generationParamLimits.styleWeight.max}
                  min={generationParamLimits.styleWeight.min}
                  step="10"
                  type="range"
                  value={paramStore.state.styleWeight}
                  onChange={(event) => paramStore.setReferenceWeight('sref', Number(event.target.value))}
                />
              </label>
              <label className="asset-seed-control">
                <span>
                  <strong>Seed</strong>
                  <small>固定构图</small>
                </span>
                <input
                  inputMode="numeric"
                  max={generationParamLimits.seed.max}
                  min={generationParamLimits.seed.min}
                  placeholder="随机"
                  type="number"
                  value={paramStore.state.seed ?? ''}
                  onChange={(event) =>
                    paramStore.setSeed(event.target.value === '' ? null : Number(event.target.value))
                  }
                />
                <button type="button" onClick={() => paramStore.setSeed(null)}>
                  清空
                </button>
              </label>
              <div className="asset-reference-groups">
                <section className="asset-reference-group">
                  <header>
                    <strong>CRef</strong>
                    <small>角色参考</small>
                  </header>
                  {crefAssets.length === 0 ? <span className="asset-reference-empty">未选择</span> : null}
                  {crefAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => paramStore.toggleReferenceAsset('cref', asset.id)}
                    >
                      <i
                        aria-hidden="true"
                        style={asset.thumbnail ? { background: asset.thumbnail } : undefined}
                      />
                      {asset.name}
                    </button>
                  ))}
                </section>
                <section className="asset-reference-group">
                  <header>
                    <strong>SRef</strong>
                    <small>风格参考</small>
                  </header>
                  {srefAssets.length === 0 ? <span className="asset-reference-empty">未选择</span> : null}
                  {srefAssets.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => paramStore.toggleReferenceAsset('sref', asset.id)}
                    >
                      <i
                        aria-hidden="true"
                        style={asset.thumbnail ? { background: asset.thumbnail } : undefined}
                      />
                      {asset.name}
                    </button>
                  ))}
                </section>
              </div>
            </div>
            <div className="asset-picker-list">
              <span className="asset-picker-filter">全部</span>
              {assets.map((asset, index) => (
                <button
                  className={selectedAsset?.id === asset.id ? 'asset-picker-item asset-picker-item--active' : 'asset-picker-item'}
                  key={asset.id}
                  onClick={() => chatStore.selectAsset(asset.id)}
                  type="button"
                >
                  <span
                    className="asset-picker-thumb"
                    style={asset.thumbnail ? { background: asset.thumbnail } : undefined}
                  >
                    {index + 1}
                  </span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>
                      {getAssetTypeLabel(asset.type)}
                      {asset.isFavorite ? ' | 收藏' : ''}
                      {isReferenceAsset(asset) ? ' | 可参考' : ''}
                      {paramStore.state.crefAssetIds.includes(asset.id)
                        ? ` | ${getReferenceKindLabel('cref')}`
                        : ''}
                      {paramStore.state.srefAssetIds.includes(asset.id)
                        ? ` | ${getReferenceKindLabel('sref')}`
                        : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <textarea
          onChange={(event) => chatStore.setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="请输入你的消息..."
          ref={composerInputRef}
          value={chatStore.state.draft}
        />
        {submitStatusLabel ? (
          <div className="chat-submit-status chat-submit-status--loading">
            <span aria-hidden="true" />
            {submitStatusLabel}
          </div>
        ) : null}
        {submitError && !submitStatusLabel ? (
          <div className="chat-submit-status chat-submit-status--error">{submitError}</div>
        ) : null}
        <div className="composer-actions">
          <button type="button">＋</button>
          <button
            className={chatStore.state.activeOverlay === 'model' ? 'composer-tool composer-tool--active' : 'composer-tool'}
            onClick={() => chatStore.toggleOverlay('model')}
            type="button"
          >
            ⌘ 模型 <small>新</small>
          </button>
          <button
            className={chatStore.state.activeOverlay === 'skill' ? 'composer-tool composer-tool--active' : 'composer-tool'}
            onClick={() => chatStore.toggleOverlay('skill')}
            type="button"
          >
            ▣ Skill
          </button>
          <button
            className={chatStore.state.activeOverlay === 'asset' ? 'composer-tool composer-tool--active' : 'composer-tool'}
            onClick={() => chatStore.toggleOverlay('asset')}
            type="button"
          >
            ☻ 元素
          </button>
          <button
            aria-busy={isSubmitting}
            aria-label={isSubmitting ? '正在制作' : '发送'}
            className={isSubmitting ? 'send-button send-button--submitting' : 'send-button'}
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? '…' : '↑'}
          </button>
        </div>
      </div>
    </Panel>
  );
}
