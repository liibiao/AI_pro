import type {
  ProjectExportTaskEventDto,
  ProjectExportOptionsDto,
  ProjectExportTaskDto,
} from '../../api/projects/projectExportDto';
import type {
  ProjectExportOptions,
  ProjectExportTask,
  ProjectExportTaskEvent,
} from '../../types/project';

export const defaultProjectExportOptions: ProjectExportOptions = {
  format: 'mp4',
  resolution: '1080p',
  frameRate: 30,
  includeSubtitles: true,
  compressQuality: false,
};

export function mapProjectExportOptionsToDto(
  options: ProjectExportOptions,
): ProjectExportOptionsDto {
  return {
    format: options.format,
    resolution: options.resolution,
    frame_rate: options.frameRate,
    include_subtitles: options.includeSubtitles,
    compress_quality: options.compressQuality,
  };
}

export function mapProjectExportOptionsDto(
  dto: ProjectExportOptionsDto,
): ProjectExportOptions {
  return {
    format: dto.format,
    resolution: dto.resolution,
    frameRate: dto.frame_rate,
    includeSubtitles: dto.include_subtitles,
    compressQuality: dto.compress_quality,
  };
}

export function mapProjectExportTaskDto(dto: ProjectExportTaskDto): ProjectExportTask {
  return {
    id: dto.task_id,
    projectId: dto.project_id,
    status: dto.status,
    progress: dto.progress,
    options: mapProjectExportOptionsDto(dto.options),
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    downloadUrl: dto.download_url,
    error: dto.error_message,
  };
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress));
}

export function mapProjectExportTaskEventDto(
  dto: ProjectExportTaskEventDto,
): ProjectExportTaskEvent {
  return {
    id: dto.event_id,
    taskId: dto.task_id,
    projectId: dto.project_id,
    type: dto.type,
    status: dto.status,
    progress: clampProgress(dto.progress),
    updatedAt: dto.updated_at,
    downloadUrl: dto.download_url,
    error: dto.error_message,
  };
}

export function applyProjectExportTaskEvent(
  task: ProjectExportTask,
  event: ProjectExportTaskEvent,
): ProjectExportTask {
  if (task.id !== event.taskId) {
    return task;
  }

  return {
    ...task,
    status: event.status,
    progress: event.status === 'completed' ? 100 : clampProgress(event.progress),
    updatedAt: event.updatedAt,
    downloadUrl: event.downloadUrl ?? task.downloadUrl,
    error: event.error,
  };
}
