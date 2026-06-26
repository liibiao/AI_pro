import assert from 'node:assert/strict';
import {
  mapPlatformAccountSummary,
  mapPlatformAuthSession,
  mapUserProfile,
} from '../src/adapters/auth/mapUserProfile';
import { normalizeAuthDataSource } from '../src/config/authRuntime';
import {
  canvasPlatformTokenKey,
  getPlatformNetworkErrorMessage,
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../src/config/platformRuntime';
import {
  anonymousSession,
  createAuthHeaders,
  readStoredAuthSession,
} from '../src/services/auth/authSession';
import { loadConfiguredUserProfile } from '../src/services/auth/authRepository';
import type {
  AccountSummaryResponseDto,
  UserProfileDto,
} from '../src/api/auth/authDto';
import type { AuthSession } from '../src/types/user';
import { formatCreditBalance, formatUserPlan } from '../src/utils/userDisplay';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

await test('mapUserProfile maps backend dto into user profile', () => {
  const dto: UserProfileDto = {
    user_id: 'user-1',
    display_name: '创作者',
    avatar_url: '/avatar.png',
    plan: 'pro',
    credit_balance: 2581,
    permissions: ['project:read'],
    updated_at: '2026年6月17日 00:01',
  };

  assert.deepEqual(mapUserProfile(dto), {
    id: 'user-1',
    displayName: '创作者',
    avatarUrl: '/avatar.png',
    plan: 'pro',
    creditBalance: 2581,
    permissions: ['project:read'],
    updatedAt: '2026年6月17日 00:01',
  });
});

await test('mapPlatformAccountSummary maps shared canvas account summary', () => {
  const summary: AccountSummaryResponseDto = {
    membership: {
      expiredAt: '2026-07-01T00:00:00.000Z',
      plan: { name: 'Pro' },
    },
    user: {
      agentId: 'agent-9',
      email: 'creator@example.com',
      id: 'user-canvas-1',
      nickname: '共用账号',
      role: 'USER',
      status: 'ACTIVE',
    },
    wallet: {
      balance: 8192,
      updatedAt: '2026-06-17T11:00:00.000Z',
    },
  };

  assert.deepEqual(mapPlatformAccountSummary(summary), {
    id: 'user-canvas-1',
    displayName: '共用账号',
    plan: 'pro',
    creditBalance: 8192,
    permissions: ['role:USER', 'agent:agent-9', 'membership:active'],
    updatedAt: '2026-06-17T11:00:00.000Z',
  });
});

await test('mapPlatformAuthSession maps backend login response into stored session', () => {
  assert.deepEqual(
    mapPlatformAuthSession({
      token: 'admin-token',
      user: {
        email: 'creator@example.com',
        id: 'user-auth-1',
        nickname: '创作者',
        role: 'USER',
        status: 'ACTIVE',
      },
    }),
    {
      accessToken: 'admin-token',
      displayName: '创作者',
      plan: 'free',
      status: 'authenticated',
      userId: 'user-auth-1',
    },
  );
});

await test('normalizeAuthDataSource defaults unknown values to mock', () => {
  assert.equal(normalizeAuthDataSource(undefined), 'mock');
  assert.equal(normalizeAuthDataSource('mock'), 'mock');
  assert.equal(normalizeAuthDataSource('api'), 'api');
  assert.equal(normalizeAuthDataSource('other'), 'mock');
});

await test('createAuthHeaders creates bearer header only when token exists', () => {
  assert.deepEqual(createAuthHeaders(anonymousSession), {});
  assert.deepEqual(
    createAuthHeaders({
      accessToken: 'token-123',
      plan: 'pro',
      status: 'authenticated',
      userId: 'user-1',
    }),
    { Authorization: 'Bearer token-123' },
  );
});

await test('readStoredAuthSession prefers shared canvas platform token', () => {
  const storage = new Map<string, string>();
  const previousLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });

  try {
    localStorage.setItem(canvasPlatformTokenKey, 'shared-token');
    assert.deepEqual(readStoredAuthSession(), {
      accessToken: 'shared-token',
      plan: 'free',
      status: 'authenticated',
    });
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});

await test('joinPlatformApiUrl dedupes api path for shared backend', () => {
  assert.equal(sharedAdminApiBase, '/api');
  assert.equal(joinPlatformApiUrl(sharedAdminApiBase, '/api/generation/tasks'), '/api/generation/tasks');
  assert.equal(
    joinPlatformApiUrl('http://127.0.0.1:4000', '/api/account/summary'),
    'http://127.0.0.1:4000/api/account/summary',
  );
  assert.equal(
    joinPlatformApiUrl('http://127.0.0.1:4000/api', '/api/account/summary'),
    'http://127.0.0.1:4000/api/account/summary',
  );
});

await test('getPlatformNetworkErrorMessage explains fetch network failures', () => {
  assert.match(
    getPlatformNetworkErrorMessage(new TypeError('Failed to fetch'), '/api') ?? '',
    /无法连接后台接口（\/api）/,
  );
  assert.equal(getPlatformNetworkErrorMessage(new Error('业务失败'), '/api'), null);
});

await test('loadConfiguredUserProfile returns null for anonymous session', async () => {
  assert.equal(await loadConfiguredUserProfile(anonymousSession), null);
});

await test('loadConfiguredUserProfile returns mock profile for authenticated mock source', async () => {
  const session: AuthSession = {
    accessToken: 'token-123',
    plan: 'pro',
    status: 'authenticated',
    userId: 'user-demo-001',
  };
  const profile = await loadConfiguredUserProfile(session);

  assert.equal(profile?.id, 'user-demo-001');
  assert.equal(profile?.displayName, 'Autumn Creator');
  assert.equal(profile?.plan, 'pro');
  assert.equal(profile?.creditBalance, 2581);
});

await test('user display helpers format plan and credit fallbacks', () => {
  assert.equal(formatUserPlan(undefined), 'Pro');
  assert.equal(formatUserPlan('free'), 'Free');
  assert.equal(formatUserPlan('enterprise'), 'Enterprise');
  assert.equal(formatCreditBalance(undefined), '2,581');
  assert.equal(formatCreditBalance(1200500), '1,200,500');
});
