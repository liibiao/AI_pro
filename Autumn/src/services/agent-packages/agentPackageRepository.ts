import { mapBackendDataPackResponse } from '../../adapters/agent-packages/mapAgentPackage';
import { listBackendDataPacks } from '../../api/agent-packages/agentPackageApi';
import { getAgentPackageDataSource } from '../../config/agentPackageRuntime';
import { importedAgentPackages } from '../../mock/agentPackageMock';
import type { AgentPackage } from '../../types/agentPackage';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

export interface AgentPackageRepositoryContext {
  authSession?: AuthSession;
}

function requireAuthSession(context: AgentPackageRepositoryContext): AuthSession {
  const session = context.authSession;

  if (session?.status === 'authenticated' && session.accessToken) {
    return session;
  }

  throw new Error('请先登录后台管理系统，Agent 数据包需要 ai_admin_token。');
}

export async function listConfiguredAgentPackages(
  context: AgentPackageRepositoryContext = {},
): Promise<AgentPackage[]> {
  if (getAgentPackageDataSource() === 'api') {
    const authSession = requireAuthSession(context);
    const response = await listBackendDataPacks({
      authHeaders: createAuthHeaders(authSession),
    });
    const packages = mapBackendDataPackResponse(response);
    return packages.length > 0 ? packages : importedAgentPackages;
  }

  return importedAgentPackages;
}
