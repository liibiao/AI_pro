import type { SkillLibraryItemDto } from '../../api/skills/skillLibraryDto';
import type { BackendDataPackDto, BackendDataPackRootDto } from '../../api/agent-packages/agentPackageDto';
import type { SkillLibraryCategory, SkillLibraryItem } from '../../types/skillLibrary';

export function mapSkillLibraryItem(dto: SkillLibraryItemDto): SkillLibraryItem {
  return {
    id: dto.skill_id,
    name: dto.name,
    version: dto.version,
    description: dto.description,
    source: dto.source,
    category: dto.category,
    storageScope: dto.storage_scope,
    syncStatus: dto.sync_status,
    updatedAt: dto.updated_at,
    compatibleStages: dto.compatible_stages,
  };
}

function inferSkillCategory(root: BackendDataPackRootDto): SkillLibraryCategory {
  const text = [root.id, root.sourceKind, root.root, root.title]
    .join(' ')
    .toLowerCase();

  if (/audio|music|sound|voice|配音|音乐|音频/.test(text)) {
    return /voice|配音/.test(text) ? 'audio' : 'audio';
  }

  if (/video|timeline|clip|镜头|视频|时间线/.test(text)) {
    return text.includes('timeline') || text.includes('时间线') ? 'timeline' : 'video';
  }

  if (/image|asset|role|scene|图|素材|角色|场景/.test(text)) {
    return 'image';
  }

  if (/storyboard|shot|分镜/.test(text)) {
    return 'storyboard';
  }

  if (/script|writer|剧本|文案/.test(text)) {
    return 'script';
  }

  return 'utility';
}

function isSkillRoot(root: BackendDataPackRootDto) {
  const tokens = [root.id, root.sourceKind, root.root, root.title]
    .map((value) => String(value ?? '').toLowerCase())
    .filter(Boolean);

  return tokens.some((token) => token.includes('skill') || token.includes('能力'));
}

export function mapDataPackSkills(
  dataPack: BackendDataPackDto,
  context: { activeDataPackId?: string; updatedAt?: string } = {},
): SkillLibraryItem[] {
  return (dataPack.roots || [])
    .filter(isSkillRoot)
    .map((root) => ({
      id: `data-pack-${dataPack.id}-${root.id || root.sourceKind || root.root}`,
      name: root.title || root.id || root.root,
      version: dataPack.sourceVersion || String(dataPack.metadata?.version ?? '1.0.0'),
      description:
        root.description ||
        dataPack.description ||
        `来自 ${dataPack.title} 的后台 Skill 能力包。`,
      source: 'backend',
      category: inferSkillCategory(root),
      storageScope: 'account',
      syncStatus: dataPack.id === context.activeDataPackId ? 'synced' : 'available',
      updatedAt: context.updatedAt || '',
      originPackageId: dataPack.id,
      compatibleStages: [],
    }));
}

export function mapDataPackResponseSkills(input: {
  activeDataPackId?: string;
  items?: BackendDataPackDto[];
  packs?: BackendDataPackDto[];
  updatedAt?: string;
}): SkillLibraryItem[] {
  const packs = input.items ?? input.packs ?? [];

  return packs
    .filter((pack) => pack.status !== 'disabled')
    .flatMap((pack) =>
      mapDataPackSkills(pack, {
        activeDataPackId: input.activeDataPackId,
        updatedAt: input.updatedAt,
      }),
    );
}
