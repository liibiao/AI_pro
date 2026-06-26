import { mapDataPackResponseSkills } from '../../adapters/skills/mapSkillLibraryItem';
import { listBackendDataPacks } from '../../api/agent-packages/agentPackageApi';
import { getSkillLibraryDataSource } from '../../config/skillLibraryRuntime';
import { importedSkillLibraryItems } from '../../mock/skillLibraryMock';
import type { SkillLibraryItem } from '../../types/skillLibrary';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

export interface SkillLibraryRepositoryContext {
  authSession?: AuthSession;
}

function requireAuthSession(context: SkillLibraryRepositoryContext): AuthSession {
  const session = context.authSession;

  if (session?.status === 'authenticated' && session.accessToken) {
    return session;
  }

  throw new Error('请先登录后台管理系统，Skill 数据包需要 ai_admin_token。');
}

export async function listConfiguredSkillLibraryItems(
  context: SkillLibraryRepositoryContext = {},
): Promise<SkillLibraryItem[]> {
  if (getSkillLibraryDataSource() === 'api') {
    const authSession = requireAuthSession(context);
    const response = await listBackendDataPacks({
      authHeaders: createAuthHeaders(authSession),
    });
    const skills = mapDataPackResponseSkills(response);
    return skills.length > 0 ? skills : importedSkillLibraryItems;
  }

  return importedSkillLibraryItems;
}
