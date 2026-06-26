import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';
import type {
  AccountSummaryResponseDto,
  CurrentUserResponseDto,
  PlatformAuthResponseDto,
} from './authDto';

const authApiBase =
  import.meta.env?.VITE_AUTH_API_BASE?.replace(/\/+$/, '') ?? sharedAdminApiBase;

interface AuthApiOptions {
  authHeaders?: Record<string, string>;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(authApiBase, path), {
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
        : `Auth API request failed: ${response.status}`;
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && 'ok' in payload && payload.ok === false) {
    const message = 'error' in payload ? String(payload.error) : '账号接口返回失败。';
    throw new Error(message);
  }

  return payload as TResponse;
}

export function getCurrentUser(options: AuthApiOptions = {}): Promise<CurrentUserResponseDto> {
  return requestJson('/api/auth/me', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function getAccountSummary(
  options: AuthApiOptions = {},
): Promise<AccountSummaryResponseDto> {
  return requestJson('/api/account/summary', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function loginPlatformAccount(
  account: string,
  password: string,
): Promise<PlatformAuthResponseDto> {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password, clientType: 'ADMIN_WEB' }),
  });
}

export function registerPlatformAccount(input: {
  account: string;
  agentId?: string;
  nickname?: string;
  password: string;
}): Promise<PlatformAuthResponseDto> {
  const account = input.account.trim();
  const payload = {
    agentId: input.agentId?.trim() || undefined,
    nickname: input.nickname?.trim() || account,
    password: input.password,
    ...(account.includes('@') ? { email: account } : { phone: account }),
  };

  return requestJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
