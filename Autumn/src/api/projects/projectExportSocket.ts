import type { ProjectExportTaskEventDto } from './projectExportDto';

export type ProjectExportTaskEventHandler = (event: ProjectExportTaskEventDto) => void;

export interface ProjectExportTaskSubscription {
  close: () => void;
}

const exportEventNames = ['export:progress', 'export:succeeded', 'export:failed'];

export function createProjectExportTaskEventsUrl(taskId: string): string {
  const socketBase =
    import.meta.env?.VITE_PROJECT_EXPORT_SOCKET_BASE ?? import.meta.env?.VITE_PIPELINE_SOCKET_BASE ?? '';
  return `${socketBase}/api/export-tasks/${taskId}/events`;
}

function parseProjectExportTaskEvent(message: MessageEvent): ProjectExportTaskEventDto {
  return JSON.parse(message.data) as ProjectExportTaskEventDto;
}

export function subscribeProjectExportTaskEvents(
  taskId: string,
  onEvent: ProjectExportTaskEventHandler,
  onError?: (error: Event) => void,
): ProjectExportTaskSubscription {
  const source = new EventSource(createProjectExportTaskEventsUrl(taskId));
  const handleMessage = (message: MessageEvent) => {
    onEvent(parseProjectExportTaskEvent(message));
  };

  source.addEventListener('message', handleMessage);
  exportEventNames.forEach((eventName) => {
    source.addEventListener(eventName, handleMessage);
  });

  if (onError) {
    source.addEventListener('error', onError);
  }

  return {
    close: () => source.close(),
  };
}
