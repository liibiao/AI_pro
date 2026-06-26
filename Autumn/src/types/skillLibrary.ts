import type {
  AgentPackageStorageScope,
  AgentPackageSyncStatus,
} from './agentPackage';

export type SkillLibrarySource = 'backend' | 'local' | 'agentPackage';

export type SkillLibraryCategory =
  | 'script'
  | 'storyboard'
  | 'image'
  | 'video'
  | 'audio'
  | 'timeline'
  | 'utility';

export interface SkillLibraryItem {
  id: string;
  name: string;
  version: string;
  description: string;
  source: SkillLibrarySource;
  category: SkillLibraryCategory;
  storageScope: AgentPackageStorageScope;
  syncStatus: AgentPackageSyncStatus;
  updatedAt: string;
  originPackageId?: string;
  compatibleStages: string[];
}

export interface LocalSkillManifest {
  name: string;
  version: string;
  description?: string;
  category?: SkillLibraryCategory;
  compatibleStages?: string[];
}

