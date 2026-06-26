import {
  getPlatformNetworkErrorMessage,
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type {
  CreateLlmChatRequestDto,
  LlmChatResponseDto,
} from './llmChatDto';

const llmChatApiBase =
  import.meta.env?.VITE_LLM_CHAT_API_BASE?.replace(/\/+$/, '') ??
  import.meta.env?.VITE_GENERATION_TASK_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface LlmChatApiOptions {
  authHeaders?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatValidationIssue(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const message = value.message ?? value.error ?? value.msg;

  if (typeof message !== 'string' || !message.trim()) {
    return null;
  }

  const rawPath = value.path ?? value.field ?? value.param;
  const path = Array.isArray(rawPath) ? rawPath.join('.') : rawPath;

  return typeof path === 'string' && path.trim()
    ? `${path.trim()}: ${message.trim()}`
    : message.trim();
}

function collectValidationMessages(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) {
    return [];
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

function getLlmChatErrorMessage(payload: unknown, fallback: string): string {
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
      return '语言模型请求校验失败：缺少必填字段。请检查已选模型和消息内容。';
    }

    return combined;
  }

  const message = payload.error ?? payload.message ?? payload.msg;

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { message?: unknown; name?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';

  return name === 'AbortError' || /aborted|abort/i.test(message);
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
  timeoutMs = 0,
): Promise<TResponse> {
  const controller =
    timeoutMs > 0 && !init.signal && typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;
  const timer = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(joinPlatformApiUrl(llmChatApiBase, path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(getLlmChatErrorMessage(payload, `LLM chat API request failed: ${response.status}`));
    }

    if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
      throw new Error(getLlmChatErrorMessage(payload, '语言模型接口返回失败。'));
    }

    return payload as TResponse;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('语言模型请求被浏览器中断或等待超时。请重试，或切换响应更快的大语言模型。');
    }

    const message = getPlatformNetworkErrorMessage(error, llmChatApiBase);
    throw new Error(message ?? (error instanceof Error ? error.message : '语言模型接口网络请求失败。'));
  } finally {
    if (timer) {
      globalThis.clearTimeout(timer);
    }
  }
}

export function createLlmChatCompletion(
  input: CreateLlmChatRequestDto,
  options: LlmChatApiOptions = {},
): Promise<LlmChatResponseDto> {
  return requestJson(
    '/api/generate/llm/chat',
    {
      method: 'POST',
      headers: options.authHeaders,
      body: JSON.stringify(input),
    },
    input.requestTimeoutMs,
  );
}
