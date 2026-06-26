import type {
  ImportBackendSkillRequestDto,
  SkillLibraryItemDto,
  ToggleProjectSkillRequestDto,
} from './skillLibraryDto';
import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';

const skillLibraryApiBase =
  import.meta.env?.VITE_SKILL_LIBRARY_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(skillLibraryApiBase, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Skill library API request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function listBackendSkills(): Promise<SkillLibraryItemDto[]> {
  return requestJson('/skills', {
    method: 'GET',
  });
}

export function importBackendSkill(input: ImportBackendSkillRequestDto): Promise<SkillLibraryItemDto> {
  return requestJson(`/skills/${input.skillId}/import`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function toggleProjectSkill(input: ToggleProjectSkillRequestDto): Promise<SkillLibraryItemDto> {
  return requestJson(`/projects/${input.projectId}/skills/${input.skillId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
