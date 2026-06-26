import {
  createGenerationTask,
  getGenerationTask,
  listGenerationTasks,
  queryGenerationTask,
} from '../../api/generation/generationTaskApi';
import type {
  CreateGenerationTaskRequestDto,
  ListGenerationTasksQueryDto,
} from '../../api/generation/generationTaskDto';
import {
  createMockGenerationTask,
  mapBackendGenerationTaskResponse,
  mapBackendGenerationTaskResult,
} from '../../adapters/generation/mapGenerationTask';
import { getGenerationTaskDataSource } from '../../config/generationTaskRuntime';
import type { GenerationTask } from '../../types/generationTask';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

export interface GenerationTaskRepositoryContext {
  authSession?: AuthSession;
}

function getAuthHeaders(context: GenerationTaskRepositoryContext): Record<string, string> {
  return context.authSession ? createAuthHeaders(context.authSession) : {};
}

function shouldUseApi(context: GenerationTaskRepositoryContext): boolean {
  return (
    getGenerationTaskDataSource() === 'api' &&
    context.authSession?.status === 'authenticated' &&
    Boolean(context.authSession.accessToken)
  );
}

function requireApiAuth(context: GenerationTaskRepositoryContext) {
  if (shouldUseApi(context)) {
    return;
  }

  throw new Error('请先登录后台管理系统，再从对话创建真实生成任务。');
}

export async function listConfiguredGenerationTasks(
  query: ListGenerationTasksQueryDto = {},
  context: GenerationTaskRepositoryContext = {},
): Promise<GenerationTask[]> {
  if (getGenerationTaskDataSource() === 'mock') {
    return [];
  }

  requireApiAuth(context);
  const response = await listGenerationTasks(
    { limit: 100, ...query },
    { authHeaders: getAuthHeaders(context) },
  );
  return mapBackendGenerationTaskResponse(response);
}

export async function getConfiguredGenerationTask(
  taskId: string,
  context: GenerationTaskRepositoryContext = {},
): Promise<GenerationTask | null> {
  if (getGenerationTaskDataSource() === 'mock') {
    return null;
  }

  requireApiAuth(context);
  const response = await getGenerationTask(taskId, { authHeaders: getAuthHeaders(context) });
  return mapBackendGenerationTaskResult(response);
}

export async function createConfiguredGenerationTask(
  input: CreateGenerationTaskRequestDto,
  context: GenerationTaskRepositoryContext = {},
): Promise<GenerationTask> {
  if (getGenerationTaskDataSource() === 'mock') {
    return createMockGenerationTask(input);
  }

  requireApiAuth(context);
  const response = await createGenerationTask(input, { authHeaders: getAuthHeaders(context) });
  return mapBackendGenerationTaskResult(response);
}

export async function queryConfiguredGenerationTask(
  taskId: string,
  context: GenerationTaskRepositoryContext = {},
): Promise<GenerationTask | null> {
  if (getGenerationTaskDataSource() === 'mock') {
    return null;
  }

  requireApiAuth(context);
  const response = await queryGenerationTask(taskId, { authHeaders: getAuthHeaders(context) });
  return mapBackendGenerationTaskResult(response);
}
