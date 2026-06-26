import { mapProjectListItems } from '../adapters/projects/mapProject';
import type { ProjectListItemDto } from '../api/projects/projectDto';

export const mockProjectDtos: ProjectListItemDto[] = [];

export const mockProjects = mapProjectListItems(mockProjectDtos);
