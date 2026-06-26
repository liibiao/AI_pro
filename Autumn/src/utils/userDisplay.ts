import type { UserPlan } from '../types/user';

const planLabels: Record<UserPlan, string> = {
  enterprise: 'Enterprise',
  free: 'Free',
  pro: 'Pro',
};

export function formatUserPlan(plan: UserPlan | undefined, fallback = 'Pro'): string {
  return plan ? planLabels[plan] : fallback;
}

export function formatCreditBalance(creditBalance: number | undefined, fallback = 2581): string {
  return new Intl.NumberFormat('en-US').format(creditBalance ?? fallback);
}
