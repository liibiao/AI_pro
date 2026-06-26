import type {
  BackendAgentPackageDto,
  ListDataPacksResponseDto,
  ImportBackendAgentPackageRequestDto,
  SwitchAgentPackageRequestDto,
} from './agentPackageDto';
import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';

const agentPackageApiBase =
  import.meta.env?.VITE_AGENT_PACKAGE_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface AgentPackageApiOptions {
  authHeaders?: Record<string, string>;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(agentPackageApiBase, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Agent package API request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function listBackendAgentPackages(
  options: AgentPackageApiOptions = {},
): Promise<BackendAgentPackageDto[]> {
  return requestJson('/api/agent-packages', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function listBackendDataPacks(
  options: AgentPackageApiOptions = {},
): Promise<ListDataPacksResponseDto> {
  return requestJson('/api/data-packs', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function importBackendAgentPackage(
  input: ImportBackendAgentPackageRequestDto,
): Promise<BackendAgentPackageDto> {
  return requestJson(`/agent-packages/${input.packageId}/import`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function switchProjectAgentPackage(input: SwitchAgentPackageRequestDto): Promise<BackendAgentPackageDto> {
  return requestJson(`/projects/${input.projectId}/agent-package`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
