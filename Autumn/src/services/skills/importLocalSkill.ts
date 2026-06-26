import type { LocalSkillManifest, SkillLibraryItem } from '../../types/skillLibrary';

const validCategories = new Set([
  'script',
  'storyboard',
  'image',
  'video',
  'audio',
  'timeline',
  'utility',
]);

function assertLocalSkillManifest(value: unknown): asserts value is LocalSkillManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('本地 Skill 必须是 JSON 对象。');
  }

  const manifest = value as Record<string, unknown>;

  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    throw new Error('本地 Skill 缺少 name。');
  }

  if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
    throw new Error('本地 Skill 缺少 version。');
  }

  if (manifest.category !== undefined && !validCategories.has(String(manifest.category))) {
    throw new Error('本地 Skill category 不在允许范围内。');
  }

  if (
    manifest.compatibleStages !== undefined &&
    (!Array.isArray(manifest.compatibleStages) ||
      !manifest.compatibleStages.every((item) => typeof item === 'string'))
  ) {
    throw new Error('本地 Skill compatibleStages 必须是字符串数组。');
  }
}

export async function importLocalSkillFile(file: File): Promise<SkillLibraryItem> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  assertLocalSkillManifest(parsed);

  const now = new Date().toISOString();
  const safeId = parsed.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: `local-skill-${safeId}-${Date.now()}`,
    name: parsed.name.trim(),
    version: parsed.version.trim(),
    description: parsed.description ?? '本地导入 Skill，仅当前设备可用。',
    source: 'local',
    category: parsed.category ?? 'utility',
    storageScope: 'device',
    syncStatus: 'localOnly',
    updatedAt: now,
    compatibleStages: parsed.compatibleStages ?? [],
  };
}

