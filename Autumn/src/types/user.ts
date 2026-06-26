export type UserPlan = 'free' | 'pro' | 'enterprise';

export interface AuthSession {
  accessToken: string | null;
  displayName?: string;
  expiresAt?: string;
  plan: UserPlan;
  status: 'anonymous' | 'authenticated';
  userId?: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  plan: UserPlan;
  creditBalance: number;
  permissions: string[];
  updatedAt: string;
}
