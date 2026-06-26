export type ProjectDataSource = 'mock' | 'api';

export function normalizeProjectDataSource(value: string | undefined): ProjectDataSource {
  return value === 'api' ? 'api' : 'mock';
}

export function getProjectDataSource(): ProjectDataSource {
  return normalizeProjectDataSource(import.meta.env?.VITE_PROJECT_DATA_SOURCE);
}

export function shouldUseProjectApi(): boolean {
  return getProjectDataSource() === 'api';
}
