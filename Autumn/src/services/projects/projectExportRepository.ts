import {
  defaultProjectExportOptions,
  mapProjectExportOptionsToDto,
  mapProjectExportTaskDto,
} from '../../adapters/projects/mapProjectExport';
import {
  createProjectExportTask,
  getProjectExportTask,
} from '../../api/projects/projectApi';
import { getProjectDataSource } from '../../config/projectRuntime';
import type { ProjectExportOptions, ProjectExportTask } from '../../types/project';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

const exportTaskStorageKey = 'autumn.projectExportTasks.v1';
const mockExportDurationMs = 3_000;
const mockExportInitialProgress = 12;

type ExportTaskStore = Record<string, ProjectExportTask>;

interface CreateProjectExportTaskInput {
  options?: Partial<ProjectExportOptions>;
}

export interface ProjectExportRepositoryContext {
  authSession?: AuthSession;
}

let memoryExportTaskStore: ExportTaskStore = {};

function getAuthHeaders(context: ProjectExportRepositoryContext): Record<string, string> {
  return context.authSession ? createAuthHeaders(context.authSession) : {};
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readExportTaskStore(): ExportTaskStore {
  if (!hasLocalStorage()) {
    return memoryExportTaskStore;
  }

  try {
    const raw = localStorage.getItem(exportTaskStorageKey);
    return raw ? (JSON.parse(raw) as ExportTaskStore) : {};
  } catch {
    return {};
  }
}

function writeExportTaskStore(store: ExportTaskStore) {
  if (!hasLocalStorage()) {
    memoryExportTaskStore = store;
    return;
  }

  localStorage.setItem(exportTaskStorageKey, JSON.stringify(store));
}

function createDownloadUrl(task: ProjectExportTask): string {
  return `/downloads/${task.projectId}/${task.id}.${task.options.format}`;
}

function normalizeExportOptions(options: Partial<ProjectExportOptions> = {}): ProjectExportOptions {
  return {
    ...defaultProjectExportOptions,
    ...options,
  };
}

function cloneProjectExportTask(task: ProjectExportTask): ProjectExportTask {
  return {
    ...task,
    options: { ...task.options },
  };
}

function advanceMockExportTask(task: ProjectExportTask, now = Date.now()): ProjectExportTask {
  if (task.status === 'completed' || task.status === 'failed') {
    return cloneProjectExportTask(task);
  }

  const createdAtTime = new Date(task.createdAt).getTime();
  const elapsed = Math.max(0, now - createdAtTime);
  const progress = Math.min(
    100,
    mockExportInitialProgress +
      Math.floor((elapsed / mockExportDurationMs) * (100 - mockExportInitialProgress)),
  );
  const status = progress >= 100 ? 'completed' : 'running';
  const nextTask: ProjectExportTask = {
    ...task,
    status,
    progress,
    updatedAt: new Date(now).toISOString(),
    downloadUrl: status === 'completed' ? task.downloadUrl ?? createDownloadUrl(task) : task.downloadUrl,
  };

  const store = readExportTaskStore();
  writeExportTaskStore({
    ...store,
    [task.id]: nextTask,
  });

  return cloneProjectExportTask(nextTask);
}

export function clearMockProjectExportTasks() {
  writeExportTaskStore({});
}

export function createMockProjectExportTask(
  projectId: string,
  input: CreateProjectExportTaskInput = {},
): ProjectExportTask {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const task: ProjectExportTask = {
    id: `export-${projectId}-${now}`,
    projectId,
    status: 'running',
    progress: mockExportInitialProgress,
    options: normalizeExportOptions(input.options),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const store = readExportTaskStore();

  writeExportTaskStore({
    ...store,
    [task.id]: task,
  });

  return cloneProjectExportTask(task);
}

export function getMockProjectExportTask(taskId: string): ProjectExportTask | null {
  const task = readExportTaskStore()[taskId];
  return task ? advanceMockExportTask(task) : null;
}

export async function createConfiguredProjectExportTask(
  projectId: string,
  input: CreateProjectExportTaskInput = {},
  context: ProjectExportRepositoryContext = {},
): Promise<ProjectExportTask> {
  const options = normalizeExportOptions(input.options);

  if (getProjectDataSource() === 'api') {
    const task = await createProjectExportTask(
      projectId,
      { options: mapProjectExportOptionsToDto(options) },
      { authHeaders: getAuthHeaders(context) },
    );

    return mapProjectExportTaskDto(task);
  }

  return createMockProjectExportTask(projectId, { options });
}

export async function getConfiguredProjectExportTask(
  taskId: string,
  context: ProjectExportRepositoryContext = {},
): Promise<ProjectExportTask | null> {
  if (getProjectDataSource() === 'api') {
    return mapProjectExportTaskDto(
      await getProjectExportTask(taskId, { authHeaders: getAuthHeaders(context) }),
    );
  }

  return getMockProjectExportTask(taskId);
}
