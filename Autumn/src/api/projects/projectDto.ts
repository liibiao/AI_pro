import type { GenerationStageStatus } from '../../types/pipeline';
import type { ProjectSnapshotDto } from './projectSnapshotDto';

export interface ProjectListItemDto {
  project_id: string;
  title: string;
  updated_at: string;
  status: GenerationStageStatus;
  description?: string;
  thumbnail_url?: string;
  thumbnail_style?: string;
}

export interface CreateProjectRequestDto {
  title?: string;
  description?: string;
  agentPackageId?: string;
  skillIds?: string[];
}

export interface OpenProjectResponseDto {
  project: ProjectListItemDto;
  opened_at: string;
  latest_snapshot?: ProjectSnapshotDto;
}
