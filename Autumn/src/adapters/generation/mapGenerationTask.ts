import type {
  BackendGenerationTaskDto,
  CreateGenerationTaskRequestDto,
  GenerationTaskResponseDto,
  ListGenerationTasksResponseDto,
} from '../../api/generation/generationTaskDto';
import type { GenerationTask, GenerationTaskKind } from '../../types/generationTask';
import type { GenerationStageStatus } from '../../types/pipeline';

function mapBackendStatus(status: string | null | undefined): GenerationStageStatus {
  const normalized = String(status ?? '').trim().toUpperCase();

  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'DONE'].includes(normalized)) {
    return 'completed';
  }

  if (['FAILED', 'FAILURE', 'ERROR', 'CANCELED', 'CANCELLED'].includes(normalized)) {
    return 'failed';
  }

  if (['RUNNING', 'PROCESSING', 'SUBMITTED', 'IN_PROGRESS'].includes(normalized)) {
    return 'running';
  }

  return 'pending';
}

function mapBackendKind(type: string | null | undefined): GenerationTaskKind {
  const normalized = String(type ?? '').trim().toUpperCase();

  if (normalized === 'IMAGE') {
    return 'image';
  }

  if (normalized === 'VIDEO') {
    return 'video';
  }

  if (normalized === 'AUDIO' || normalized === 'VOICE') {
    return 'audio';
  }

  if (normalized === 'DOCUMENT') {
    return 'document';
  }

  return 'pipeline';
}

function clampProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function getProgress(dto: BackendGenerationTaskDto, status: GenerationStageStatus): number {
  const progress = clampProgress(dto.progress);

  if (progress !== null) {
    return progress;
  }

  if (status === 'completed') {
    return 100;
  }

  if (status === 'running') {
    return 50;
  }

  return 0;
}

function getDefaultLabel(kind: GenerationTaskKind): string {
  if (kind === 'image') {
    return '图片生成';
  }

  if (kind === 'video') {
    return '视频生成';
  }

  if (kind === 'audio') {
    return '音频生成';
  }

  if (kind === 'document') {
    return '文档生成';
  }

  return '生成任务';
}

function getLabel(dto: BackendGenerationTaskDto, kind: GenerationTaskKind): string {
  const modelName =
    dto.model?.displayName ||
    dto.model?.name ||
    dto.modelId ||
    dto.mode ||
    getDefaultLabel(kind);

  return String(modelName).trim() || getDefaultLabel(kind);
}

function getUpdatedAt(dto: BackendGenerationTaskDto): string {
  return (
    dto.updatedAt ||
    dto.completedAt ||
    dto.failedAt ||
    dto.createdAt ||
    new Date(0).toISOString()
  );
}

function isResultUrl(value: string): boolean {
  return /^(https?:\/\/|data:(image|video|audio)\/|\/api\/|\/generated\/)/i.test(value.trim());
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

function collectResultUrls(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return isResultUrl(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectResultUrls(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (
      [
        'url',
        'urls',
        'output',
        'outputs',
        'resultUrl',
        'resultUrls',
        'result_urls',
        'imageUrl',
        'videoUrl',
        'audioUrl',
        'data',
      ].includes(key)
    ) {
      return collectResultUrls(item, depth + 1);
    }

    return depth < 2 ? collectResultUrls(item, depth + 1) : [];
  });
}

function looksLikeReadableResultText(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || isResultUrl(trimmed)) {
    return false;
  }

  return /[\u4e00-\u9fa5A-Za-z]/.test(trimmed);
}

function collectResultTexts(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return looksLikeReadableResultText(value) ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectResultTexts(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (
      [
        'answer',
        'content',
        'markdown',
        'message',
        'output',
        'outputText',
        'output_text',
        'result',
        'text',
      ].includes(key)
    ) {
      return collectResultTexts(item, depth + 1);
    }

    if (['choices', 'data', 'messages', 'outputs', 'response'].includes(key)) {
      return collectResultTexts(item, depth + 1);
    }

    return depth < 2 ? collectResultTexts(item, depth + 1) : [];
  });
}

function parseParamsJson(value: unknown): Record<string, unknown> {
  if (value == null) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseParamsJson(parsed);
    } catch {
      return {};
    }
  }

  if (!Array.isArray(value) && typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return {};
}

function getStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function extractBackendGenerationResultUrls(dto: BackendGenerationTaskDto): string[] {
  return uniqueUrls([
    ...collectResultUrls(dto.resultUrlsJson),
    ...collectResultUrls(dto.resultJson),
  ]);
}

export function extractBackendGenerationResultText(dto: BackendGenerationTaskDto): string | undefined {
  return collectResultTexts(dto.resultJson)[0];
}

export function mapBackendGenerationTask(dto: BackendGenerationTaskDto): GenerationTask {
  const status = mapBackendStatus(dto.status);
  const kind = mapBackendKind(dto.type);
  const resultUrls = extractBackendGenerationResultUrls(dto);
  const resultText = extractBackendGenerationResultText(dto);
  const params = parseParamsJson(dto.paramsJson);
  const sourceElementId = getStringParam(params, 'sourceElementId');
  const targetAssetSlot = getStringParam(params, 'targetAssetSlot');

  return {
    id: dto.id,
    label: getLabel(dto, kind),
    kind,
    ...(dto.clientRequestId ? { clientRequestId: dto.clientRequestId } : {}),
    ...(dto.errorMessage ? { errorMessage: dto.errorMessage } : {}),
    ...(dto.modelId || dto.model?.id ? { modelId: dto.modelId ?? dto.model?.id ?? undefined } : {}),
    ...(dto.channelKey || dto.provider?.providerKey
      ? { providerKey: dto.channelKey ?? dto.provider?.providerKey ?? undefined }
      : {}),
    ...(resultText ? { resultText } : {}),
    ...(resultUrls.length ? { resultUrls } : {}),
    ...(sourceElementId ? { sourceElementId } : {}),
    ...(targetAssetSlot ? { targetAssetSlot } : {}),
    status,
    progress: getProgress(dto, status),
    updatedAt: getUpdatedAt(dto),
  };
}

export function mapBackendGenerationTaskResponse(
  response: ListGenerationTasksResponseDto,
): GenerationTask[] {
  return response.items.map(mapBackendGenerationTask);
}

export function mapBackendGenerationTaskResult(
  response: GenerationTaskResponseDto,
): GenerationTask {
  return mapBackendGenerationTask(response.task);
}

export function createMockGenerationTask(
  input: CreateGenerationTaskRequestDto,
  now = new Date(),
): GenerationTask {
  const kind = mapBackendKind(input.type);
  const sourceElementId =
    input.params && getStringParam(input.params, 'sourceElementId');
  const targetAssetSlot =
    input.params && getStringParam(input.params, 'targetAssetSlot');

  return {
    id: input.clientRequestId ? `task-${input.clientRequestId}` : `task-${now.getTime()}`,
    label: input.mode || getDefaultLabel(kind),
    kind,
    ...(sourceElementId ? { sourceElementId } : {}),
    ...(targetAssetSlot ? { targetAssetSlot } : {}),
    status: 'pending',
    progress: 0,
    updatedAt: now.toISOString(),
  };
}
