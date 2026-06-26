import type {
  BackendAgentPackageDto,
  BackendDataPackDto,
  BackendDataPackRootDto,
  ListDataPacksResponseDto,
} from '../../api/agent-packages/agentPackageDto';
import type { AgentPackage, AgentPackageModule } from '../../types/agentPackage';

export function mapBackendAgentPackage(dto: BackendAgentPackageDto): AgentPackage {
  return {
    id: dto.package_id,
    name: dto.name,
    version: dto.version,
    description: dto.description,
    source: 'backend',
    storageScope: dto.storage_scope,
    syncStatus: dto.sync_status,
    importedAt: dto.imported_at,
    updatedAt: dto.updated_at,
    agents: dto.agents,
    skills: dto.skills,
    templates: dto.templates,
  };
}

function isRootKind(root: BackendDataPackRootDto, kind: 'agents' | 'skills' | 'templates') {
  const tokens = [root.id, root.sourceKind, root.root, root.title]
    .map((value) => String(value ?? '').toLowerCase())
    .filter(Boolean);

  return tokens.some((token) => token.includes(kind) || token.includes(kind.slice(0, -1)));
}

function mapRootsToModules(
  roots: BackendDataPackRootDto[],
  kind: 'agents' | 'skills' | 'templates',
): AgentPackageModule[] {
  return roots
    .filter((root) => isRootKind(root, kind))
    .map((root) => ({
      id: root.id || root.sourceKind || root.root,
      name: root.title || root.id || root.root,
      description: root.description || root.root,
    }));
}

export function mapBackendDataPack(
  dto: BackendDataPackDto,
  context: { activeDataPackId?: string; updatedAt?: string } = {},
): AgentPackage {
  return {
    id: dto.id,
    name: dto.title,
    version: dto.sourceVersion || String(dto.metadata?.version ?? '1.0.0'),
    description: dto.description || `${dto.title} 创作数据包。`,
    source: 'backend',
    storageScope: 'account',
    syncStatus: dto.id === context.activeDataPackId ? 'synced' : 'available',
    importedAt: '',
    updatedAt: context.updatedAt || '',
    agents: mapRootsToModules(dto.roots || [], 'agents'),
    skills: mapRootsToModules(dto.roots || [], 'skills'),
    templates: mapRootsToModules(dto.roots || [], 'templates'),
  };
}

export function mapBackendDataPackResponse(response: ListDataPacksResponseDto): AgentPackage[] {
  const packs = response.items ?? response.packs ?? [];

  return packs
    .filter((pack) => pack.status !== 'disabled')
    .map((pack) =>
      mapBackendDataPack(pack, {
        activeDataPackId: response.activeDataPackId,
        updatedAt: response.updatedAt,
      }),
    );
}
