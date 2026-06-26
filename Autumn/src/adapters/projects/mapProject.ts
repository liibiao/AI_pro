import type {
  OpenProjectResponseDto,
  ProjectListItemDto,
} from '../../api/projects/projectDto';
import type { ProjectListItem } from '../../types/project';
import { mapProjectSnapshotDto } from './mapProjectSnapshot';

const fallbackThumbnail =
  'linear-gradient(135deg, rgba(25, 29, 34, .84), rgba(42, 52, 58, .62))';

function mapThumbnail(dto: ProjectListItemDto): string {
  if (dto.thumbnail_url) {
    return `url(${dto.thumbnail_url}) center/cover`;
  }

  return dto.thumbnail_style ?? fallbackThumbnail;
}

export function mapProjectListItem(dto: ProjectListItemDto): ProjectListItem {
  return {
    id: dto.project_id,
    title: dto.title,
    updatedAt: dto.updated_at,
    status: dto.status,
    description: dto.description,
    thumbnail: mapThumbnail(dto),
  };
}

export function mapProjectListItems(dtos: ProjectListItemDto[]): ProjectListItem[] {
  return dtos.map(mapProjectListItem);
}

export function mapOpenProjectResponse(dto: OpenProjectResponseDto): ProjectListItem {
  const project = mapProjectListItem(dto.project);

  return dto.latest_snapshot
    ? {
        ...project,
        latestSnapshot: mapProjectSnapshotDto(dto.latest_snapshot),
      }
    : project;
}
