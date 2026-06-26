export type AgentPackageDataSource = 'mock' | 'api';

export function normalizeAgentPackageDataSource(
  value: string | undefined,
): AgentPackageDataSource {
  return value === 'mock' ? 'mock' : 'api';
}

export function getAgentPackageDataSource(): AgentPackageDataSource {
  return normalizeAgentPackageDataSource(import.meta.env?.VITE_AGENT_PACKAGE_DATA_SOURCE);
}
