import {
  mapOpenProjectResponse,
  mapProjectListItem,
  mapProjectListItems,
} from '../../adapters/projects/mapProject';
import {
  createProject,
  listProjects,
  openProject,
} from '../../api/projects/projectApi';
import type { CreateProjectRequestDto } from '../../api/projects/projectDto';
import { getProjectDataSource } from '../../config/projectRuntime';
import { createAuthHeaders } from '../auth/authSession';
import type { AuthSession } from '../../types/user';
import type { ProjectListItem } from '../../types/project';
import {
  createMockProject,
  listMockProjects,
  openMockProject,
} from './mockProjectRepository';

export interface ProjectRepositoryContext {
  authSession?: AuthSession;
}

function getAuthHeaders(context: ProjectRepositoryContext): Record<string, string> {
  return context.authSession ? createAuthHeaders(context.authSession) : {};
}

export async function listConfiguredProjects(
  context: ProjectRepositoryContext = {},
): Promise<ProjectListItem[]> {
  if (getProjectDataSource() === 'api') {
    return mapProjectListItems(await listProjects({ authHeaders: getAuthHeaders(context) }));
  }

  return listMockProjects();
}

export async function createConfiguredProject(
  input: CreateProjectRequestDto = {},
  context: ProjectRepositoryContext = {},
): Promise<ProjectListItem> {
  if (getProjectDataSource() === 'api') {
    return mapProjectListItem(await createProject(input, { authHeaders: getAuthHeaders(context) }));
  }

  return createMockProject(input);
}

export async function openConfiguredProject(
  projects: ProjectListItem[],
  projectId: string,
  context: ProjectRepositoryContext = {},
): Promise<ProjectListItem | null> {
  if (getProjectDataSource() === 'api') {
    const response = await openProject(projectId, { authHeaders: getAuthHeaders(context) });
    return mapOpenProjectResponse(response);
  }

  return openMockProject(projects, projectId);
}
