import type {
  ProjectExportFormat,
  ProjectExportFrameRate,
  ProjectExportResolution,
  ProjectExportStatus,
  ProjectExportTaskEventType,
} from '../../types/project';

export interface ProjectExportOptionsDto {
  format: ProjectExportFormat;
  resolution: ProjectExportResolution;
  frame_rate: ProjectExportFrameRate;
  include_subtitles: boolean;
  compress_quality: boolean;
}

export interface ProjectExportTaskDto {
  task_id: string;
  project_id: string;
  status: ProjectExportStatus;
  progress: number;
  options: ProjectExportOptionsDto;
  created_at: string;
  updated_at: string;
  download_url?: string;
  error_message?: string;
}

export interface CreateProjectExportTaskRequestDto {
  options: ProjectExportOptionsDto;
}

export interface ProjectExportTaskEventDto {
  event_id: string;
  task_id: string;
  project_id: string;
  type: ProjectExportTaskEventType;
  status: ProjectExportStatus;
  progress: number;
  updated_at: string;
  download_url?: string;
  error_message?: string;
}
