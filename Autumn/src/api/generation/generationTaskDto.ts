export type BackendGenerationTaskType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'LLM';

export type BackendGenerationTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | string;

export interface BackendGenerationModelDto {
  adapter?: string | null;
  displayName?: string | null;
  id?: string | null;
  name?: string | null;
  type?: string | null;
}

export interface BackendGenerationProviderDto {
  id?: string | null;
  name?: string | null;
  providerKey?: string | null;
}

export interface BackendGenerationTaskDto {
  chargedCredits?: number | null;
  channelKey?: string | null;
  clientRequestId?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  failedAt?: string | null;
  id: string;
  inputFilesJson?: unknown;
  mode?: string | null;
  model?: BackendGenerationModelDto | null;
  modelId?: string | null;
  negativePrompt?: string | null;
  paramsJson?: unknown;
  progress?: number | null;
  prompt?: string | null;
  provider?: BackendGenerationProviderDto | null;
  resultJson?: unknown;
  resultUrlsJson?: unknown;
  retryCount?: number | null;
  status?: BackendGenerationTaskStatus | null;
  type?: BackendGenerationTaskType | string | null;
  updatedAt?: string | null;
  upstreamRequestId?: string | null;
  upstreamTaskId?: string | null;
}

export interface ListGenerationTasksResponseDto {
  items: BackendGenerationTaskDto[];
  ok?: boolean;
  pagination?: {
    hasMore?: boolean;
    limit?: number;
    offset?: number;
    total?: number;
  };
}

export interface GenerationTaskResponseDto {
  balance?: number;
  chargedCredits?: number;
  idempotent?: boolean;
  ok?: boolean;
  task: BackendGenerationTaskDto;
}

export interface CreateGenerationTaskRequestDto {
  channelKey: string;
  clientRequestId?: string;
  inputFiles?: unknown[];
  mode: string;
  modelId: string;
  negativePrompt?: string;
  params?: Record<string, unknown>;
  prompt: string;
  type: BackendGenerationTaskType;
}

export interface ListGenerationTasksQueryDto {
  clientRequestId?: string;
  limit?: number;
  offset?: number;
}
