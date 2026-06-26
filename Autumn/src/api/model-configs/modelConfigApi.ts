import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type { ListModelConfigsResponseDto } from './modelConfigDto';

const modelConfigApiBase =
  import.meta.env?.VITE_MODEL_CONFIG_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

export type BackendModelConfigType = 'IMAGE' | 'VIDEO' | 'LLM';

interface ModelConfigApiOptions {
  authHeaders?: Record<string, string>;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(modelConfigApiBase, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Model config API request failed: ${response.status}`;
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
    const message = 'error' in payload ? String(payload.error) : '模型配置接口返回失败。';
    throw new Error(message);
  }

  return payload as TResponse;
}

export function listModelConfigs(
  options: ModelConfigApiOptions = {},
): Promise<ListModelConfigsResponseDto> {
  return requestJson('/api/models', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function listModelConfigsByType(
  type: BackendModelConfigType,
  options: ModelConfigApiOptions = {},
): Promise<ListModelConfigsResponseDto> {
  return requestJson(`/api/models?type=${encodeURIComponent(type)}`, {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function listAdminModelConfigs(
  options: ModelConfigApiOptions = {},
): Promise<ListModelConfigsResponseDto> {
  return requestJson('/api/admin/models', {
    method: 'GET',
    headers: options.authHeaders,
  });
}
