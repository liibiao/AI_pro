import type { AgentPackageStorageScope, AgentPackageSyncStatus } from '../../types/agentPackage';

export interface AgentPackageModuleDto {
  id: string;
  name: string;
  description?: string;
}

export interface BackendAgentPackageDto {
  package_id: string;
  name: string;
  version: string;
  description: string;
  storage_scope: AgentPackageStorageScope;
  sync_status: AgentPackageSyncStatus;
  imported_at: string;
  updated_at: string;
  agents: AgentPackageModuleDto[];
  skills: AgentPackageModuleDto[];
  templates: AgentPackageModuleDto[];
}

export interface ImportBackendAgentPackageRequestDto {
  packageId: string;
}

export interface SwitchAgentPackageRequestDto {
  packageId: string;
  projectId: string;
}

export interface BackendDataPackRootDto {
  description?: string;
  id?: string;
  root: string;
  sourceKind?: string;
  title?: string;
}

export interface BackendDataPackDto {
  capabilities?: Record<string, unknown>;
  defaultTaskType?: string;
  description?: string;
  id: string;
  metadata?: Record<string, unknown>;
  roots: BackendDataPackRootDto[];
  source?: string;
  sourceVersion?: string;
  status?: 'active' | 'disabled' | 'draft';
  tags?: string[];
  title: string;
  type?: string;
}

export interface ListDataPacksResponseDto {
  activeDataPack?: BackendDataPackDto | null;
  activeDataPackId?: string;
  items?: BackendDataPackDto[];
  ok?: boolean;
  packs?: BackendDataPackDto[];
  updatedAt?: string;
}
