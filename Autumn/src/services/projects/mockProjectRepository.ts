import { mapProjectListItems } from '../../adapters/projects/mapProject';
import type { CreateProjectRequestDto } from '../../api/projects/projectDto';
import { mockProjectDtos } from '../../mock/projectMock';
import type { ProjectListItem } from '../../types/project';

const newProjectThumbnail =
  'linear-gradient(135deg, rgba(25, 29, 34, .84), rgba(42, 52, 58, .62))';

export function listMockProjects(): ProjectListItem[] {
  return mapProjectListItems(mockProjectDtos);
}

export function createMockProject(input: CreateProjectRequestDto = {}): ProjectListItem {
  return {
    id: `project-local-${Date.now()}`,
    title: input.title?.trim() || '无标题',
    updatedAt: '刚刚',
    status: 'pending',
    description: input.description?.trim() || '开启您的创作之旅',
    thumbnail: newProjectThumbnail,
  };
}

export function openMockProject(
  projects: ProjectListItem[],
  projectId: string,
): ProjectListItem | null {
  return projects.find((project) => project.id === projectId) ?? null;
}
