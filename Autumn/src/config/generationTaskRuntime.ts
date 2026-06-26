export type GenerationTaskDataSource = 'mock' | 'api';

export function normalizeGenerationTaskDataSource(
  value: string | undefined,
): GenerationTaskDataSource {
  return value === 'mock' ? 'mock' : 'api';
}

export function getGenerationTaskDataSource(): GenerationTaskDataSource {
  return normalizeGenerationTaskDataSource(import.meta.env?.VITE_GENERATION_TASK_DATA_SOURCE);
}
