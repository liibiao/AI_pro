import {
  getPlatformNetworkErrorMessage,
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type {
  CreateTextAgentRunRequestDto,
  TextAgentRunResponseDto,
} from './textAgentDto';

const textAgentApiBase =
  import.meta.env?.VITE_TEXT_AGENT_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface TextAgentApiOptions {
  authHeaders?: Record<string, string>;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message = record.error ?? record.message ?? record.msg;

    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  return fallback;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  return requestJsonWithTimeout(path, init, 0);
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

async function requestJsonWithTimeout<TResponse>(
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
  let response: Response;

  try {
    response = await fetch(joinPlatformApiUrl(textAgentApiBase, path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Text Agent 请求等待超时。请稍后重试，或切换响应更快的大语言模型。');
    }

    const message = getPlatformNetworkErrorMessage(error, textAgentApiBase);
    throw new Error(message ?? (error instanceof Error ? error.message : 'Text agent API network request failed.'));
  } finally {
    if (timer) {
      globalThis.clearTimeout(timer);
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `Text agent API request failed: ${response.status}`));
  }

  if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
    throw new Error(getErrorMessage(payload, 'Text agent API returned ok=false.'));
  }

  return payload as TResponse;
}

export function runTextAgent(
  input: CreateTextAgentRunRequestDto,
  options: TextAgentApiOptions = {},
): Promise<TextAgentRunResponseDto> {
  const requestTimeoutMs =
    input.requestTimeoutMs ??
    (typeof input.timeoutMs === 'number' && input.timeoutMs > 0 ? input.timeoutMs + 5_000 : 0);

  return requestJsonWithTimeout(
    '/api/workbench/text-agent/run',
    {
      method: 'POST',
      headers: options.authHeaders,
      body: JSON.stringify(input),
    },
    requestTimeoutMs,
  );
}
