import type {
  AccountSummaryResponseDto,
  PlatformAuthResponseDto,
  UserProfileDto,
} from '../../api/auth/authDto';
import type { AuthSession, UserPlan, UserProfile } from '../../types/user';

export function mapUserProfile(dto: UserProfileDto): UserProfile {
  return {
    id: dto.user_id,
    displayName: dto.display_name,
    avatarUrl: dto.avatar_url,
    plan: dto.plan,
    creditBalance: dto.credit_balance,
    permissions: dto.permissions,
    updatedAt: dto.updated_at,
  };
}

function normalizePlatformPlan(summary: AccountSummaryResponseDto): UserPlan {
  const role = String(summary.user.role ?? '').toLowerCase();
  const planCode = String(summary.membership?.plan?.code ?? '').toLowerCase();
  const planName = String(summary.membership?.plan?.name ?? '').toLowerCase();

  if (role.includes('enterprise') || planCode.includes('enterprise') || planName.includes('enterprise')) {
    return 'enterprise';
  }

  return summary.membership ? 'pro' : 'free';
}

export function mapPlatformAccountSummary(summary: AccountSummaryResponseDto): UserProfile {
  const displayName =
    summary.user.nickname || summary.user.email || summary.user.phone || 'Autumn Creator';
  const walletUpdatedAt = summary.wallet?.updatedAt ?? summary.wallet?.updated_at;
  const role = summary.user.role ? `role:${summary.user.role}` : null;
  const agent = summary.user.agentId ? `agent:${summary.user.agentId}` : null;
  const membership = summary.membership ? 'membership:active' : null;

  return {
    id: summary.user.id,
    displayName,
    plan: normalizePlatformPlan(summary),
    creditBalance: Number(summary.wallet?.balance ?? 0),
    permissions: [role, agent, membership].filter((item): item is string => Boolean(item)),
    updatedAt: walletUpdatedAt || new Date().toISOString(),
  };
}

export function mapPlatformAuthSession(response: PlatformAuthResponseDto): AuthSession {
  return {
    accessToken: response.token,
    displayName:
      response.user.nickname ||
      response.user.email ||
      response.user.phone ||
      'Autumn Creator',
    plan: response.user.role === 'ENTERPRISE' ? 'enterprise' : 'free',
    status: 'authenticated',
    userId: response.user.id,
  };
}
