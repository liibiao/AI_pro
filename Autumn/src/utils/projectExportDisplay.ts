import type {
  ProjectExportFormat,
  ProjectExportFrameRate,
  ProjectExportResolution,
  ProjectExportStatus,
  ProjectExportTask,
} from '../types/project';

export function getProjectExportStatusLabel(status?: ProjectExportStatus): string {
  if (status === 'pending') {
    return '等待导出';
  }

  if (status === 'running') {
    return '导出中';
  }

  if (status === 'completed') {
    return '导出完成';
  }

  if (status === 'failed') {
    return '导出失败';
  }

  return '导出';
}

export function getProjectExportFormatLabel(format: ProjectExportFormat): string {
  return format.toUpperCase();
}

export function getProjectExportResolutionLabel(resolution: ProjectExportResolution): string {
  return resolution === '4k' ? '4K' : resolution.toUpperCase();
}

export function getProjectExportFrameRateLabel(frameRate: ProjectExportFrameRate): string {
  return `${frameRate}fps`;
}

export function getProjectExportSummary(task: ProjectExportTask): string {
  return [
    getProjectExportFormatLabel(task.options.format),
    getProjectExportResolutionLabel(task.options.resolution),
    getProjectExportFrameRateLabel(task.options.frameRate),
  ].join(' | ');
}
