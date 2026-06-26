export const canvasPlatformTokenKey = 'canvas_platform_token';
export const canvasPlatformApiBaseKey = 'canvas_platform_api_base';
export const canvasPlatformInviteAgentKey = 'canvas_platform_invite_agent_id';
export const adminPlatformTokenKey = 'ai_admin_token';
export const adminPlatformTokenModeKey = 'ai_admin_token_mode';
export const sharedAdminApiBase = '/api';

function readStorageValue(key: string): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  try {
    return String(localStorage.getItem(key) ?? '').trim();
  } catch {
    return '';
  }
}

export function readCanvasPlatformToken(): string {
  return readStorageValue(adminPlatformTokenKey) || readStorageValue(canvasPlatformTokenKey);
}

export function writeCanvasPlatformToken(token: string) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (token) {
      localStorage.setItem(canvasPlatformTokenKey, token);
      localStorage.setItem(adminPlatformTokenKey, token);
      localStorage.setItem(adminPlatformTokenModeKey, 'admin');
    } else {
      localStorage.removeItem(canvasPlatformTokenKey);
      localStorage.removeItem(adminPlatformTokenKey);
      localStorage.removeItem(adminPlatformTokenModeKey);
    }
  } catch {
    // Keep auth usable even when browser storage is unavailable.
  }
}

export function readCanvasPlatformApiBase(fallback = '/api'): string {
  const saved = readStorageValue(canvasPlatformApiBaseKey).replace(/\/+$/, '');
  return saved || fallback;
}

export function getPlatformApiBase(fallback = '/api'): string {
  return (
    import.meta.env?.VITE_PLATFORM_API_BASE?.replace(/\/+$/, '') ||
    readCanvasPlatformApiBase(fallback)
  );
}

export function joinPlatformApiUrl(base: string, path: string): string {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path}`;
  const normalizedBase = String(base || '').replace(/\/+$/, '');

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

export function getPlatformNetworkErrorMessage(error: unknown, apiBase = sharedAdminApiBase): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const isFetchFailure =
    name === 'TypeError' && /failed to fetch|load failed|networkerror|network request failed/i.test(message);

  if (!isFetchFailure) {
    return null;
  }

  const displayBase = apiBase || '/api';
  return `无法连接后台接口（${displayBase}）。请检查当前页面是否通过 124 的 /autumn/ 地址访问，或接口代理 /api 是否可用。`;
}
