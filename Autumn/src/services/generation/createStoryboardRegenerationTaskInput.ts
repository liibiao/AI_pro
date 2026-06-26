import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import { normalizeGenerationParams } from '../params/generationParamValidation';
import type { ModelConfigKind, ModelConfigOption } from '../../types/modelConfig';
import type { GenerationParams } from '../../types/params';
import type { StoryboardElement } from '../../types/pipeline';

interface CreateStoryboardRegenerationTaskInputOptions {
  element: StoryboardElement;
  modelOptions: ModelConfigOption[];
  params: GenerationParams;
  timestamp?: number;
}

function getPreferredKind(element: StoryboardElement): ModelConfigKind {
  if (element.type === 'shot') {
    return 'video';
  }

  if (element.type === 'audio') {
    return 'voice';
  }

  return 'image';
}

function resolveModel(
  modelOptions: ModelConfigOption[],
  modelId: string,
  preferredKind: ModelConfigKind,
): ModelConfigOption {
  const selectedById = modelOptions.find((model) => model.id === modelId);

  if (selectedById?.kind === preferredKind) {
    return selectedById;
  }

  const selectedModel =
    modelOptions.find((model) => model.kind === preferredKind) ??
    selectedById ??
    modelOptions[0];

  if (!selectedModel) {
    throw new Error('未找到可用生成模型。');
  }

  return selectedModel;
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

function getTargetAssetSlot(element: StoryboardElement): string {
  if (element.type === 'shot') {
    return 'shotVideo';
  }

  if (element.type === 'audio') {
    return 'audioReference';
  }

  return 'elementReference';
}

function createClientRequestId(timestamp: number, elementId: string): string {
  return `autumn-regenerate-${elementId}-${timestamp}`;
}

function createPrompt(element: StoryboardElement): string {
  const assetNames = element.assets.map((asset) => asset.name).join('、');
  const assetContext = assetNames ? `\n参考素材：${assetNames}` : '';

  return `请重生成故事板卡片 ${element.name}。\n类型：${element.type}\n描述：${element.description}${assetContext}`;
}

export function createStoryboardRegenerationTaskInput({
  element,
  modelOptions,
  params,
  timestamp = Date.now(),
}: CreateStoryboardRegenerationTaskInputOptions): CreateGenerationTaskRequestDto {
  const normalizedParams = normalizeGenerationParams(params);
  const model = resolveModel(modelOptions, normalizedParams.modelId, getPreferredKind(element));

  return {
    channelKey: model.providerKey || model.id,
    clientRequestId: createClientRequestId(timestamp, element.id),
    inputFiles: element.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
    })),
    mode: 'autumn-storyboard-regeneration',
    modelId: model.id,
    params: {
      aspectRatio: normalizedParams.aspectRatio,
      contentWeight: normalizedParams.contentWeight,
      crefAssetIds: normalizedParams.crefAssetIds,
      durationSeconds: normalizedParams.durationSeconds,
      imageWeight: normalizedParams.imageWeight,
      seed: normalizedParams.seed,
      source: 'autumn',
      sourceElementId: element.id,
      sourceElementName: element.name,
      srefAssetIds: normalizedParams.srefAssetIds,
      storyboardElementType: element.type,
      styleWeight: normalizedParams.styleWeight,
      targetAssetSlot: getTargetAssetSlot(element),
    },
    prompt: createPrompt(element),
    type: getTaskType(model.kind),
  };
}
