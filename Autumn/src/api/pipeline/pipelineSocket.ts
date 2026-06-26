import type { PipelineEventDto } from './pipelineDto';

export type PipelineEventHandler = (event: PipelineEventDto) => void;

export interface PipelineSubscription {
  close: () => void;
}

export function subscribePipelineEvents(
  taskId: string,
  onEvent: PipelineEventHandler,
  onError?: (error: Event) => void,
): PipelineSubscription {
  const socketBase = import.meta.env.VITE_PIPELINE_SOCKET_BASE ?? '';
  const url = `${socketBase}/api/pipeline/tasks/${taskId}/events`;
  const source = new EventSource(url);

  source.addEventListener('message', (message) => {
    onEvent(JSON.parse(message.data) as PipelineEventDto);
  });

  if (onError) {
    source.addEventListener('error', onError);
  }

  return {
    close: () => source.close(),
  };
}

