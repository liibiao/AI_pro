import type { User, UserRole } from '@prisma/client';

import type { UserClientType } from './security.js';

export type AuthUser = Pick<User, 'id' | 'role' | 'status' | 'nickname'> & { sessionId?: string; clientType?: UserClientType };

export type OpenApiPrincipal = {
  type: 'PERSONAL_API' | 'ENTERPRISE_API';
  billingUserId: string;
  userId?: string;
  enterpriseId?: string;
  apiTokenId: string;
  discountMode: 'FOLLOW_USER_MEMBERSHIP' | 'FORCE_MEMBER_40_OFF';
};

export type EnterpriseAuthUser = {
  id: string;
  enterpriseId: string;
  role: 'ENTERPRISE_ADMIN' | 'ENTERPRISE_VIEWER';
  status: 'ACTIVE';
  nickname: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      openApiPrincipal?: OpenApiPrincipal;
      enterpriseUser?: EnterpriseAuthUser;
    }
  }
}

export const adminRoles: UserRole[] = ['ADMIN', 'SUPER_ADMIN'];
