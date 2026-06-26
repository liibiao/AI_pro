export type AgentPackageSource = 'backend' | 'local';

export type AgentPackageStorageScope = 'account' | 'device';

export type AgentPackageSyncStatus = 'available' | 'imported' | 'synced' | 'localOnly';

export interface AgentPackageModule {
  id: string;
  name: string;
  description?: string;
}

export interface AgentPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  source: AgentPackageSource;
  storageScope: AgentPackageStorageScope;
  syncStatus: AgentPackageSyncStatus;
  importedAt: string;
  updatedAt: string;
  agents: AgentPackageModule[];
  skills: AgentPackageModule[];
  templates: AgentPackageModule[];
}

export interface LocalAgentPackageManifest {
  name: string;
  version: string;
  description?: string;
  agents?: AgentPackageModule[];
  skills?: AgentPackageModule[];
  templates?: AgentPackageModule[];
}

