import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import { normalizeGenerationParams } from '../params/generationParamValidation';
import type { ComposerModelTab } from '../../types/chat';
import type { AgentPackage } from '../../types/agentPackage';
import type { ModelConfigKind, ModelConfigOption } from '../../types/modelConfig';
import type { GenerationParams } from '../../types/params';
import type { AssetItem } from '../../types/pipeline';
import type { SkillLibraryItem } from '../../types/skillLibrary';

interface CreateComposerGenerationTaskInputOptions {
  agentPackage?: AgentPackage;
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  modelOptions: ModelConfigOption[];
  modelTab: ComposerModelTab;
  params: GenerationParams;
  prompt: string;
  selectedAsset?: AssetItem;
  timestamp?: number;
}

function resolveModel(
  modelOptions: ModelConfigOption[],
  modelId: string,
  modelTab: ComposerModelTab,
  preferredKind?: ModelConfigKind,
): ModelConfigOption {
  const selectedById = modelOptions.find((model) => model.id === modelId);

  if (preferredKind) {
    if (selectedById?.kind === preferredKind) {
      return selectedById;
    }

    const preferredModel = modelOptions.find((model) => model.kind === preferredKind);

    if (preferredModel) {
      return preferredModel;
    }

    throw new Error(preferredKind === 'image' ? '未找到可用图片模型，无法生成资产图。' : '未找到匹配的生成模型。');
  }

  const selectedModel =
    (selectedById?.tab === modelTab ? selectedById : undefined) ??
    modelOptions.find((model) => model.tab === modelTab) ??
    selectedById ??
    modelOptions[0];

  if (!selectedModel) {
    throw new Error('未找到可用生成模型。');
  }

  return selectedModel;
}

function getPromptPreferredKind(prompt: string): ModelConfigKind | undefined {
  const text = prompt.trim();

  if (!text) {
    return undefined;
  }

  const mentionsAssetImage = /资产图|资产图片|素材图|元素图|关键元素|角色图|人物图|场景图|道具图|设定图|参考图|生图|图片|图像/.test(text);
  const explicitVideo = /镜头视频|生成视频|做视频|视频节点|成片|动画|运镜/.test(text);

  if (mentionsAssetImage && !explicitVideo) {
    return 'image';
  }

  return undefined;
}

function getTaskType(kind: ModelConfigKind): CreateGenerationTaskRequestDto['type'] {
  if (kind === 'image') {
    return 'IMAGE';
  }

  if (kind === 'video') {
    return 'VIDEO';
  }

  if (kind === 'audio') {
    return 'AUDIO';
  }

  if (kind === 'voice') {
    return 'VOICE';
  }

  return 'LLM';
}

function getTaskMode(kind: ModelConfigKind): string {
  if (kind === 'image') {
    return 'txt2img';
  }

  if (kind === 'video') {
    return 'text-to-video';
  }

  if (kind === 'audio') {
    return 'autumn-audio-generation';
  }

  if (kind === 'voice') {
    return 'autumn-voice-generation';
  }

  return 'chat';
}

function createClientRequestId(timestamp: number, modelId: string): string {
  return `autumn-${modelId}-${timestamp}`;
}

function getTaskParams(
  model: ModelConfigOption,
  normalizedParams: GenerationParams,
  context: {
    agentPackage?: AgentPackage;
    enabledSkillIds: string[];
    enabledSkills: SkillLibraryItem[];
    selectedAsset?: AssetItem;
  },
): Record<string, unknown> {
  const orchestrationParams = {
    agentIds: context.agentPackage?.agents.map((agent) => agent.id) ?? [],
    agentPackageId: context.agentPackage?.id ?? null,
    agentPackageName: context.agentPackage?.name ?? null,
    enabledSkillIds: context.enabledSkillIds,
    selectedAssetId: context.selectedAsset?.id ?? null,
    skillNames: context.enabledSkills.map((skill) => skill.name),
    source: 'autumn',
  };

  if (model.kind === 'image') {
    return {
      ...orchestrationParams,
      n: 1,
      quantity: 1,
      seed: normalizedParams.seed,
      size: normalizedParams.aspectRatio === '9:16'
        ? '1024x1536'
        : normalizedParams.aspectRatio === '16:9'
          ? '1536x1024'
          : '1024x1024',
    };
  }

  if (model.kind === 'video') {
    return {
      ...orchestrationParams,
      aspectRatio: normalizedParams.aspectRatio,
      contentWeight: normalizedParams.contentWeight,
      crefAssetIds: normalizedParams.crefAssetIds,
      durationSeconds: normalizedParams.durationSeconds,
      imageWeight: normalizedParams.imageWeight,
      resolution: '720p',
      seed: normalizedParams.seed,
      srefAssetIds: normalizedParams.srefAssetIds,
      styleWeight: normalizedParams.styleWeight,
    };
  }

  if (model.kind === 'llm') {
    return {
      ...orchestrationParams,
      canvasNodeType: 'textPrompt',
      jsonEntry: {},
      maxOutputTokens: 800,
      messages: [
        {
          content: '',
          role: 'user',
        },
      ],
    };
  }

  return {
    ...orchestrationParams,
    aspectRatio: normalizedParams.aspectRatio,
    durationSeconds: normalizedParams.durationSeconds,
    seed: normalizedParams.seed,
  };
}

export function createComposerGenerationTaskInput({
  agentPackage,
  enabledSkillIds = [],
  enabledSkills = [],
  modelOptions,
  modelTab,
  params,
  prompt,
  selectedAsset,
  timestamp = Date.now(),
}: CreateComposerGenerationTaskInputOptions): CreateGenerationTaskRequestDto {
  const normalizedParams = normalizeGenerationParams(params);
  const promptPreferredKind = getPromptPreferredKind(prompt);
  const model = resolveModel(modelOptions, normalizedParams.modelId, modelTab, promptPreferredKind);
  const channelKey = model.providerKey || model.id;

  const taskInput: CreateGenerationTaskRequestDto = {
    channelKey,
    clientRequestId: createClientRequestId(timestamp, model.id),
    inputFiles: selectedAsset
      ? [
          {
            id: selectedAsset.id,
            name: selectedAsset.name,
            type: selectedAsset.type,
          },
        ]
      : [],
    mode: getTaskMode(model.kind),
    modelId: model.id,
    params: getTaskParams(model, normalizedParams, {
      agentPackage,
      enabledSkillIds,
      enabledSkills,
      selectedAsset,
    }),
    prompt,
    type: getTaskType(model.kind),
  };

  if (model.kind === 'llm' && taskInput.params) {
    taskInput.params.messages = [
      {
        content: prompt,
        role: 'user',
      },
    ];
  }

  if (promptPreferredKind === 'image' && taskInput.params) {
    taskInput.params.orchestration = 'creative-asset-image';
    taskInput.params.storyboardElementType = 'asset';
    taskInput.params.targetAssetSlot = 'elementReference';
  }

  return taskInput;
}
