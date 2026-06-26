export type ModelConfigDataSource = 'mock' | 'api';

export function normalizeModelConfigDataSource(
  value: string | undefined,
): ModelConfigDataSource {
  return value === 'mock' ? 'mock' : 'api';
}

export function getModelConfigDataSource(): ModelConfigDataSource {
  return normalizeModelConfigDataSource(import.meta.env?.VITE_MODEL_CONFIG_DATA_SOURCE);
}
