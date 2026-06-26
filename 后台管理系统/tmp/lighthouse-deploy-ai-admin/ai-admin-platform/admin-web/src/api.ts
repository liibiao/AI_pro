const TOKEN_KEY = 'ai_admin_token';
const TOKEN_MODE_KEY = 'ai_admin_token_mode';

export type TokenMode = 'admin' | 'enterprise';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getTokenMode(): TokenMode {
  return localStorage.getItem(TOKEN_MODE_KEY) === 'enterprise' ? 'enterprise' : 'admin';
}

export function setToken(token: string, mode: TokenMode = 'admin') {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_MODE_KEY, mode);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_MODE_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const timeoutMs = 20000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(path, { cache: 'no-store', ...options, headers, signal: controller.signal });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) {
      const message = data.error || data.message || `HTTP ${resp.status}`;
      if (resp.status === 401 || data.code === 'SESSION_REPLACED') {
        clearToken();
        if (data.code === 'SESSION_REPLACED') window.setTimeout(() => window.location.reload(), 1200);
      }
      throw new Error(message);
    }
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请确认后台服务正常后重试');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function money(value: number | string) {
  return `${value} 积分`;
}
