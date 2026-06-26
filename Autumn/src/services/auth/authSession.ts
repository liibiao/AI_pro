import type { AuthSession } from '../../types/user';
import {
  readCanvasPlatformToken,
  writeCanvasPlatformToken,
} from '../../config/platformRuntime';

const authSessionKey = 'autumn.authSession.v1';

export const anonymousSession: AuthSession = {
  accessToken: null,
  plan: 'free',
  status: 'anonymous',
};

export function readStoredAuthSession(): AuthSession {
  const platformToken = readCanvasPlatformToken();
  if (platformToken) {
    return {
      accessToken: platformToken,
      plan: 'free',
      status: 'authenticated',
    };
  }

  if (typeof localStorage === 'undefined') {
    return anonymousSession;
  }

  try {
    const raw = localStorage.getItem(authSessionKey);
    return raw ? (JSON.parse(raw) as AuthSession) : anonymousSession;
  } catch {
    return anonymousSession;
  }
}

export function persistAuthSession(session: AuthSession) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  if (session.status === 'anonymous') {
    localStorage.removeItem(authSessionKey);
    writeCanvasPlatformToken('');
    return;
  }

  localStorage.setItem(authSessionKey, JSON.stringify(session));
  writeCanvasPlatformToken(session.accessToken ?? '');
}

export function createAuthHeaders(session: AuthSession): Record<string, string> {
  return session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}
