import { useCallback, useEffect, useState } from 'react';
import {
  applyProjectExportTaskEvent,
  mapProjectExportTaskEventDto,
} from '../../adapters/projects/mapProjectExport';
import { subscribeProjectExportTaskEvents } from '../../api/projects/projectExportSocket';
import { getProjectDataSource } from '../../config/projectRuntime';
import type { ProjectExportOptions, ProjectExportTask } from '../../types/project';
import {
  createConfiguredProjectExportTask,
  getConfiguredProjectExportTask,
} from './projectExportRepository';

interface UseProjectExportTaskOptions {
  projectId?: string | null;
  enabled?: boolean;
  pollMs?: number;
}

export interface ProjectExportTaskState {
  task: ProjectExportTask | null;
  isCreating: boolean;
  error: string | null;
  startExport: (options?: Partial<ProjectExportOptions>) => Promise<ProjectExportTask | null>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Project export failed';
}

export function useProjectExportTask({
  projectId,
  enabled = true,
  pollMs = 1_000,
}: UseProjectExportTaskOptions): ProjectExportTaskState {
  const [task, setTask] = useState<ProjectExportTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventStreamFailed, setEventStreamFailed] = useState(false);
  const shouldUseEventStream =
    getProjectDataSource() === 'api' && typeof EventSource !== 'undefined';
  const taskId = task?.id;
  const taskStatus = task?.status;

  const startExport = useCallback(
    async (options: Partial<ProjectExportOptions> = {}) => {
      if (!enabled || !projectId) {
        return null;
      }

      setIsCreating(true);
      setError(null);

      try {
        const nextTask = await createConfiguredProjectExportTask(projectId, { options });
        setEventStreamFailed(false);
        setTask(nextTask);
        return nextTask;
      } catch (exportError) {
        setError(getErrorMessage(exportError));
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [enabled, projectId],
  );

  useEffect(() => {
    if (
      !taskId ||
      !shouldUseEventStream ||
      eventStreamFailed ||
      taskStatus === 'completed' ||
      taskStatus === 'failed'
    ) {
      return;
    }

    const subscription = subscribeProjectExportTaskEvents(
      taskId,
      (eventDto) => {
        const event = mapProjectExportTaskEventDto(eventDto);

        setTask((currentTask) =>
          currentTask ? applyProjectExportTaskEvent(currentTask, event) : currentTask,
        );
        setError(event.error ?? null);
      },
      () => {
        setEventStreamFailed(true);
      },
    );

    return () => subscription.close();
  }, [eventStreamFailed, shouldUseEventStream, taskId, taskStatus]);

  useEffect(() => {
    if (!taskId || taskStatus === 'completed' || taskStatus === 'failed') {
      return;
    }

    if (shouldUseEventStream && !eventStreamFailed) {
      return;
    }

    let cancelled = false;
    let isPolling = false;
    const intervalId = window.setInterval(async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;

      try {
        const nextTask = await getConfiguredProjectExportTask(taskId);

        if (!cancelled && nextTask) {
          setTask(nextTask);
          setError(nextTask.error ?? null);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(getErrorMessage(pollError));
        }
      } finally {
        isPolling = false;
      }
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [eventStreamFailed, pollMs, shouldUseEventStream, taskId, taskStatus]);

  useEffect(() => {
    if (!enabled || !projectId) {
      setTask(null);
      setIsCreating(false);
      setError(null);
      setEventStreamFailed(false);
    }
  }, [enabled, projectId]);

  return {
    task,
    isCreating,
    error,
    startExport,
  };
}
