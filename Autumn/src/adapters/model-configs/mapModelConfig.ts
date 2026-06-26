import type { BackendModelConfigDto } from '../../api/model-configs/modelConfigDto';
import type { ComposerModelTab } from '../../types/chat';
import type { ModelConfigKind, ModelConfigOption } from '../../types/modelConfig';

function getModelKind(dto: BackendModelConfigDto): ModelConfigKind | null {
  const type = String(dto.modelType ?? dto.type ?? '').toUpperCase();

  if (type === 'IMAGE') {
    return 'image';
  }

  if (type === 'VIDEO') {
    return 'video';
  }

  if (type === 'AUDIO') {
    return 'audio';
  }

  if (type === 'VOICE') {
    return 'voice';
  }

  if (['LLM', 'TEXT', 'LANGUAGE', 'LANGUAGE_MODEL', 'CHAT'].includes(type)) {
    return 'llm';
  }

  return null;
}

function getModelTab(kind: ModelConfigKind): ComposerModelTab {
  if (kind === 'image') {
    return '图片模型';
  }

  if (kind === 'audio') {
    return '音频模型';
  }

  if (kind === 'voice') {
    return '配音模型';
  }

  if (kind === 'llm') {
    return '大语言模型';
  }

  return '视频模型';
}

function getNumberLabel(value: number | string | null | undefined): string {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0 ? `${numberValue} 积分` : '';
}

function getDefaultDescription(kind: ModelConfigKind): string {
  if (kind === 'image') {
    return '后台已启用图片模型，适合角色、场景、道具和分镜资产生成。';
  }

  if (kind === 'audio') {
    return '后台已启用音频模型，适合配乐、音效和氛围声音生成。';
  }

  if (kind === 'voice') {
    return '后台已启用配音模型，适合旁白、对白和角色音色生成。';
  }

  if (kind === 'llm') {
    return '后台已启用大语言模型，适合需求理解、剧本拆解、分镜规划和任务调度。';
  }

  return '后台已启用视频模型，适合镜头片段、角色动作和成片预览生成。';
}

function getBadges(dto: BackendModelConfigDto): string[] {
  const uiBadges = Array.isArray(dto.ui?.badges) ? dto.ui.badges : [];
  const badges = new Set(uiBadges.filter(Boolean));
  const imagePrice = getNumberLabel(dto.salePrice);
  const videoPrice = getNumberLabel(dto.pricePerSecond);
  const llmPrice = getNumberLabel(dto.creditsPerUsdCost);

  if (dto.type) {
    badges.add(String(dto.type).toUpperCase());
  }

  if (imagePrice && String(dto.type ?? '').toUpperCase() === 'IMAGE') {
    badges.add(imagePrice);
  }

  if (videoPrice && String(dto.type ?? '').toUpperCase() === 'VIDEO') {
    badges.add(`${videoPrice}/秒`);
  }

  if (llmPrice && String(dto.type ?? '').toUpperCase() === 'LLM') {
    badges.add(llmPrice);
  }

  if (dto.supports?.storyboard || dto.supports?.shotStoryboard) {
    badges.add('分镜');
  }

  return Array.from(badges).slice(0, 4);
}

export function mapModelConfigDto(dto: BackendModelConfigDto): ModelConfigOption | null {
  const kind = getModelKind(dto);
  const id = dto.id ?? dto.modelId ?? dto.modelKey ?? dto.model ?? dto.name;

  if (!kind || !id || dto.status === 'DISABLED' || dto.enabled === false || dto.isEnabled === false) {
    return null;
  }

  const providerKey =
    dto.provider?.providerKey ?? dto.providerKey ?? dto.channelKey ?? dto.provider?.id ?? dto.adapter ?? undefined;
  const name =
    dto.ui?.label || dto.displayName || dto.modelNick || dto.name || dto.model || dto.modelKey || id;

  return {
    id,
    name,
    ...(dto.adapter ? { adapter: dto.adapter } : {}),
    ...(dto.endpointPath ? { endpointPath: dto.endpointPath } : {}),
    description: dto.ui?.description || getDefaultDescription(kind),
    tab: getModelTab(kind),
    kind,
    providerKey,
    badges: getBadges(dto),
    featured: Boolean(dto.ui?.featured),
  };
}

export function mapModelConfigDtos(dtos: BackendModelConfigDto[]): ModelConfigOption[] {
  return dtos
    .map(mapModelConfigDto)
    .filter((item): item is ModelConfigOption => Boolean(item));
}
