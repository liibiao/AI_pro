import type {
  CreateProjectRequestDto,
  OpenProjectResponseDto,
  ProjectListItemDto,
} from './projectDto';
import type {
  CreateProjectExportTaskRequestDto,
  ProjectExportTaskDto,
} from './projectExportDto';
import type {
  ProjectSnapshotDto,
  SaveProjectSnapshotRequestDto,
} from './projectSnapshotDto';
import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';

const projectApiBase =
  import.meta.env?.VITE_PROJECT_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

interface ProjectApiOptions {
  authHeaders?: Record<string, string>;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(projectApiBase, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Project API request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function listProjects(options: ProjectApiOptions = {}): Promise<ProjectListItemDto[]> {
  return requestJson('/projects', {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function createProject(
  input: CreateProjectRequestDto,
  options: ProjectApiOptions = {},
): Promise<ProjectListItemDto> {
  return requestJson('/projects', {
    method: 'POST',
    headers: options.authHeaders,
    body: JSON.stringify(input),
  });
}

export function openProject(
  projectId: string,
  options: ProjectApiOptions = {},
): Promise<OpenProjectResponseDto> {
  return requestJson(`/projects/${projectId}/open`, {
    method: 'POST',
    headers: options.authHeaders,
  });
}

export function saveProjectSnapshot(
  projectId: string,
  input: SaveProjectSnapshotRequestDto,
  options: ProjectApiOptions = {},
): Promise<ProjectSnapshotDto> {
  return requestJson(`/projects/${projectId}/snapshot`, {
    method: 'POST',
    headers: options.authHeaders,
    body: JSON.stringify(input),
  });
}

export function listProjectSnapshots(
  projectId: string,
  options: ProjectApiOptions = {},
): Promise<ProjectSnapshotDto[]> {
  return requestJson(`/projects/${projectId}/snapshots`, {
    method: 'GET',
    headers: options.authHeaders,
  });
}

export function createProjectExportTask(
  projectId: string,
  input: CreateProjectExportTaskRequestDto,
  options: ProjectApiOptions = {},
): Promise<ProjectExportTaskDto> {
  return requestJson(`/projects/${projectId}/export-tasks`, {
    method: 'POST',
    headers: options.authHeaders,
    body: JSON.stringify(input),
  });
}

export function getProjectExportTask(
  taskId: string,
  options: ProjectApiOptions = {},
): Promise<ProjectExportTaskDto> {
  return requestJson(`/export-tasks/${taskId}`, {
    method: 'GET',
    headers: options.authHeaders,
  });
}
