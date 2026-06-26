import { useEffect, useMemo, useReducer } from 'react';
import { getGenerationTaskDataSource } from '../config/generationTaskRuntime';
import {
  listConfiguredGenerationTasks,
  queryConfiguredGenerationTask,
} from '../services/generation/generationTaskRepository';
import type { AssetItem, GenerationStageStatus } from '../types/pipeline';
import type { GenerationTask, GenerationTaskKind } from '../types/generationTask';
import type { AuthSession } from '../types/user';

interface GenerationTaskState {
  loadError: string | null;
  tasks: GenerationTask[];
  socketStatus: 'idle' | 'connecting' | 'connected' | 'error';
}

type GenerationTaskAction =
  | { type: 'setLoadError'; error: string | null }
  | { type: 'syncTasks'; tasks: GenerationTask[] }
  | { type: 'upsertTask'; task: GenerationTask }
  | { type: 'setTaskStatus'; taskId: string; status: GenerationStageStatus; progress?: number }
  | { type: 'setSocketStatus'; socketStatus: GenerationTaskState['socketStatus'] };

interface UseGenerationTaskStoreOptions {
  authSession?: AuthSession;
  enabled?: boolean;
  limit?: number;
}

function getTaskKind(assetType: AssetItem['type']): GenerationTaskKind {
  if (assetType === 'document') {
    return 'document';
  }

  return assetType;
}

function normalizeProgress(asset: AssetItem): number {
  if (typeof asset.progress === 'number') {
    return asset.progress;
  }

  if (asset.status === 'completed') {
    return 100;
  }

  return asset.status === 'running' ? 50 : 0;
}

function getTaskLabel(asset: AssetItem): string {
  switch (asset.type) {
    case 'audio':
      return '音频素材';
    case 'video':
      return '镜头视频';
    case 'image':
      return '图片素材';
    case 'document':
      return '文档生成';
    default:
      return asset.name;
  }
}

function createTaskFromAsset(asset: AssetItem): GenerationTask {
  return {
    id: `task-${asset.id}`,
    label: getTaskLabel(asset),
    kind: getTaskKind(asset.type),
    status: asset.status,
    progress: normalizeProgress(asset),
    sourceAssetId: asset.id,
    updatedAt: '2026-06-16T11:37:00+08:00',
  };
}

export function createTasksFromAssets(assets: AssetItem[]): GenerationTask[] {
  return assets.map(createTaskFromAsset);
}

function mergeTasks(primaryTasks: GenerationTask[], fallbackTasks: GenerationTask[]): GenerationTask[] {
  const taskIds = new Set(primaryTasks.map((task) => task.id));

  return [
    ...primaryTasks,
    ...fallbackTasks.filter((task) => !taskIds.has(task.id)),
  ];
}

function generationTaskReducer(
  state: GenerationTaskState,
  action: GenerationTaskAction,
): GenerationTaskState {
  switch (action.type) {
    case 'setLoadError':
      return { ...state, loadError: action.error };
    case 'syncTasks':
      return { ...state, tasks: action.tasks };
    case 'upsertTask':
      return {
        ...state,
        tasks: mergeTasks([action.task], state.tasks),
      };
    case 'setTaskStatus':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
                ...task,
                status: action.status,
                progress: action.progress ?? task.progress,
                updatedAt: new Date().toISOString(),
              }
            : task,
        ),
      };
    case 'setSocketStatus':
      return { ...state, socketStatus: action.socketStatus };
    default:
      return state;
  }
}

export function useGenerationTaskStore(
  assets: AssetItem[],
  options: UseGenerationTaskStoreOptions = {},
) {
  const { authSession, enabled = true, limit = 100 } = options;
  const syncedTasks = useMemo(() => createTasksFromAssets(assets), [assets]);
  const [state, dispatch] = useReducer(generationTaskReducer, {
    loadError: null,
    tasks: createTasksFromAssets(assets),
    socketStatus: 'idle',
  });

  useEffect(() => {
    dispatch({ type: 'syncTasks', tasks: syncedTasks });
  }, [syncedTasks]);

  useEffect(() => {
    let cancelled = false;

    if (
      !enabled ||
      getGenerationTaskDataSource() !== 'api' ||
      authSession?.status !== 'authenticated'
    ) {
      return () => {
        cancelled = true;
      };
    }

    dispatch({ type: 'setSocketStatus', socketStatus: 'connecting' });
    dispatch({ type: 'setLoadError', error: null });

    listConfiguredGenerationTasks({ limit }, { authSession })
      .then((backendTasks) => {
        if (!cancelled) {
          dispatch({ type: 'syncTasks', tasks: mergeTasks(backendTasks, syncedTasks) });
          dispatch({ type: 'setSocketStatus', socketStatus: 'connected' });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'setLoadError',
            error: error instanceof Error ? error.message : '生成任务加载失败。',
          });
          dispatch({ type: 'setSocketStatus', socketStatus: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession, enabled, limit, syncedTasks]);

  return useMemo(
    () => ({
      state,
      loadError: state.loadError,
      tasks: state.tasks,
      socketStatus: state.socketStatus,
      refreshTask: async (taskId: string) => {
        const task = await queryConfiguredGenerationTask(taskId, { authSession });

        if (task) {
          dispatch({ type: 'upsertTask', task });
        }

        return task;
      },
      upsertTask: (task: GenerationTask) => dispatch({ type: 'upsertTask', task }),
      setTaskStatus: (
        taskId: string,
        status: GenerationStageStatus,
        progress?: number,
      ) => dispatch({ type: 'setTaskStatus', taskId, status, progress }),
      setSocketStatus: (socketStatus: GenerationTaskState['socketStatus']) =>
        dispatch({ type: 'setSocketStatus', socketStatus }),
    }),
    [authSession, state],
  );
}
