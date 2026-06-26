import type {
  ProjectExportTaskDto,
  ProjectExportTaskEventDto,
} from '../api/projects/projectExportDto';

export const mockProjectExportTaskDto: ProjectExportTaskDto = {
  task_id: 'export-contract-001',
  project_id: 'project-local-demo',
  status: 'running',
  progress: 12,
  options: {
    format: 'mp4',
    resolution: '1080p',
    frame_rate: 30,
    include_subtitles: true,
    compress_quality: false,
  },
  created_at: '2026-06-17T09:00:00.000Z',
  updated_at: '2026-06-17T09:00:00.000Z',
};

export const mockProjectExportProgressEventDtos: ProjectExportTaskEventDto[] = [
  {
    event_id: 'export-contract-event-001',
    task_id: 'export-contract-001',
    project_id: 'project-local-demo',
    type: 'export:progress',
    status: 'running',
    progress: 28,
    updated_at: '2026-06-17T09:00:03.000Z',
  },
  {
    event_id: 'export-contract-event-002',
    task_id: 'export-contract-001',
    project_id: 'project-local-demo',
    type: 'export:progress',
    status: 'running',
    progress: 73,
    updated_at: '2026-06-17T09:00:09.000Z',
  },
  {
    event_id: 'export-contract-event-003',
    task_id: 'export-contract-001',
    project_id: 'project-local-demo',
    type: 'export:succeeded',
    status: 'completed',
    progress: 100,
    updated_at: '2026-06-17T09:00:15.000Z',
    download_url: '/downloads/project-local-demo/export-contract-001.mp4',
  },
];

export const mockProjectExportFailedEventDto: ProjectExportTaskEventDto = {
  event_id: 'export-contract-event-failed',
  task_id: 'export-contract-001',
  project_id: 'project-local-demo',
  type: 'export:failed',
  status: 'failed',
  progress: 64,
  updated_at: '2026-06-17T09:00:12.000Z',
  error_message: '导出服务暂时不可用，请稍后重试。',
};
