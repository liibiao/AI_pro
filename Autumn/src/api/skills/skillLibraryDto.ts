import type {
  AgentPackageStorageScope,
  AgentPackageSyncStatus,
} from '../../types/agentPackage';
import type { SkillLibraryCategory } from '../../types/skillLibrary';

export interface SkillLibraryItemDto {
  skill_id: string;
  name: string;
  version: string;
  description: string;
  source: 'backend';
  category: SkillLibraryCategory;
  storage_scope: AgentPackageStorageScope;
  sync_status: AgentPackageSyncStatus;
  updated_at: string;
  compatible_stages: string[];
}

export interface ImportBackendSkillRequestDto {
  skillId: string;
}

export interface ToggleProjectSkillRequestDto {
  projectId: string;
  skillId: string;
  enabled: boolean;
}

