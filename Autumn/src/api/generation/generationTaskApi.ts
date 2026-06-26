import {
  getPlatformNetworkErrorMessage,
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type {
  CreateGenerationTaskRequestDto,
  GenerationTaskResponseDto,
  ListGenerationTasksQueryDto,
  ListGenerationTasksResponseDto,
} from './generationTaskDto';

const generationTaskApiBase =
  import.meta.env?.VITE_GENERATION_TASK_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface GenerationTaskApiOptions {
  authHeaders?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatValidationIssue(issue: unknown): string | null {
  if (typeof issue === 'string') {
    return issue.trim() || null;
  }

  if (!isRecord(issue)) {
    return null;
  }

  const message =
    typeof issue.message === 'string'
      ? issue.message
      : typeof issue.error === 'string'
        ? issue.error
        : '';
  const pathValue = issue.path ?? issue.field ?? issue.property;
  const path = Array.isArray(pathValue)
    ? pathValue.join('.')
    : typeof pathValue === 'string'
      ? pathValue
      : '';

  if (path && message) {
    return `${path}: ${message}`;
  }

  return message || path || null;
}

function collectValidationMessages(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectValidationMessages(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const ownIssue = formatValidationIssue(value);
  const nestedKeys = ['details', 'errors', 'issues', 'validationErrors'];
  const nestedMessages = nestedKeys.flatMap((key) => collectValidationMessages(value[key], depth + 1));

  return ownIssue ? [ownIssue, ...nestedMessages] : nestedMessages;
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const validationMessages = collectValidationMessages(payload)
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .slice(0, 8);

  if (validationMessages.length > 0) {
    const combined = validationMessages.join('; ');
    const normalizedCombined = combined.replace(/；/g, ';');

    if (/^(Required;?\s*)+$/.test(normalizedCombined)) {
      return '后台任务创建校验失败：缺少必填字段。请检查模型配置和任务参数。';
    }

    return combined;
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim();
  }

  return fallback;
}

function buildQueryString(query: ListGenerationTasksQueryDto = {}): string {
  const params = new URLSearchParams();

  if (typeof query.limit === 'number') {
    params.set('limit', String(query.limit));
  }

  if (typeof query.offset === 'number') {
    params.set('offset', String(query.offset));
  }

  if (query.clientRequestId) {
    params.set('clientRequestId', query.clientRequestId);
  }

  const value = params.toString();
  return value ? `?${value}` : '';
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  let response: Response;

  try {
    response = await fetch(joinPlatformApiUrl(generationTaskApiBase, path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch (error) {
    const message = getPlatformNetworkErrorMessage(error, generationTaskApiBase);
    throw new Error(message ?? (error instanceof Error ? error.message : '生成任务接口网络请求失败。'));
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, `Generation task API request failed: ${response.status}`));
  }

  if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
    throw new Error(getApiErrorMessage(payload, '生成任务接口返回失败。'));
  }

  return payload as TResponse;
}

export function listGenerationTasks(
  query: ListGenerationTasksQueryDto = {},
  options: GenerationTaskApiOptions = {},
): Promise<ListGenerationTasksResponseDto> {
  return requestJson(`/api/generation/tasks${buildQueryString(query)}`, {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function getGenerationTask(
  taskId: string,
  options: GenerationTaskApiOptions = {},
): Promise<GenerationTaskResponseDto> {
  return requestJson(`/api/generation/tasks/${taskId}`, {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function createGenerationTask(
  input: CreateGenerationTaskRequestDto,
  options: GenerationTaskApiOptions = {},
): Promise<GenerationTaskResponseDto> {
  return requestJson('/api/generation/tasks', {
    method: 'POST',
    headers: options.authHeaders,
    body: JSON.stringify({
      inputFiles: [],
      negativePrompt: '',
      params: {},
      ...input,
    }),
  });
}

export function queryGenerationTask(
  taskId: string,
  options: GenerationTaskApiOptions = {},
): Promise<GenerationTaskResponseDto> {
  return requestJson(`/api/generation/tasks/${taskId}/query`, {
    method: 'POST',
    headers: options.authHeaders,
  });
}
