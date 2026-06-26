import type { UserProfileDto } from '../api/auth/authDto';

export const mockUserProfileDto: UserProfileDto = {
  user_id: 'user-demo-001',
  display_name: 'Autumn Creator',
  plan: 'pro',
  credit_balance: 2581,
  permissions: ['project:read', 'project:create', 'pipeline:start'],
  updated_at: '2026年6月16日 23:59',
};
