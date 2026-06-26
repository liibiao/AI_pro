import {
  mapPlatformAccountSummary,
  mapUserProfile,
} from '../../adapters/auth/mapUserProfile';
import {
  getAccountSummary,
  getCurrentUser,
} from '../../api/auth/authApi';
import { getAuthDataSource } from '../../config/authRuntime';
import { mockUserProfileDto } from '../../mock/userMock';
import type { AuthSession, UserProfile } from '../../types/user';
import { createAuthHeaders } from './authSession';

export async function loadConfiguredUserProfile(
  session: AuthSession,
): Promise<UserProfile | null> {
  if (session.status !== 'authenticated') {
    return null;
  }

  if (getAuthDataSource() === 'api') {
    const authHeaders = createAuthHeaders(session);

    try {
      const summary = await getAccountSummary({ authHeaders });
      return mapPlatformAccountSummary(summary);
    } catch {
      const response = await getCurrentUser({ authHeaders });
      return mapUserProfile(response.user);
    }
  }

  return mapUserProfile(mockUserProfileDto);
}
