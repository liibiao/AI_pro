import type { UserPlan } from '../../types/user';

export interface AuthSessionDto {
  access_token: string;
  expires_at?: string;
}

export interface UserProfileDto {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  plan: UserPlan;
  credit_balance: number;
  permissions: string[];
  updated_at: string;
}

export interface CurrentUserResponseDto {
  session?: AuthSessionDto;
  user: UserProfileDto;
}

export interface PlatformAccountUserDto {
  agentId?: string | null;
  email?: string | null;
  id: string;
  nickname?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
}

export interface PlatformWalletDto {
  balance?: number | string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
}

export interface PlatformMembershipDto {
  expiredAt?: string | null;
  plan?: {
    code?: string | null;
    name?: string | null;
  } | null;
  source?: string | null;
}

export interface AccountSummaryResponseDto {
  membership?: PlatformMembershipDto | null;
  pricingBenefit?: {
    active?: boolean;
    label?: string;
  } | null;
  user: PlatformAccountUserDto;
  wallet?: PlatformWalletDto | null;
}

export interface PlatformAuthResponseDto {
  token: string;
  user: PlatformAccountUserDto;
}
