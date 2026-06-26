export type AuthDataSource = 'mock' | 'api';

export function normalizeAuthDataSource(value: string | undefined): AuthDataSource {
  return value === 'api' ? 'api' : 'mock';
}

export function getAuthDataSource(): AuthDataSource {
  return normalizeAuthDataSource(import.meta.env?.VITE_AUTH_DATA_SOURCE);
}
