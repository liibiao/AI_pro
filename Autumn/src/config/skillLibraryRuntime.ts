export type SkillLibraryDataSource = 'mock' | 'api';

export function normalizeSkillLibraryDataSource(
  value: string | undefined,
): SkillLibraryDataSource {
  return value === 'mock' ? 'mock' : 'api';
}

export function getSkillLibraryDataSource(): SkillLibraryDataSource {
  return normalizeSkillLibraryDataSource(import.meta.env?.VITE_SKILL_LIBRARY_DATA_SOURCE);
}
