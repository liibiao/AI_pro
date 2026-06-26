import type {
  AnswerPipelineQuestionRequestDto,
  ConfirmPipelineScriptRequestDto,
  PipelineEventDto,
  StartCreativePipelineRequestDto,
  StartCreativePipelineResponseDto,
} from './pipelineDto';
import {
  joinPlatformApiUrl,
  sharedAdminApiBase,
} from '../../config/platformRuntime';

const pipelineApiBase =
  import.meta.env.VITE_PIPELINE_API_BASE?.replace(/\/+$/, '') ??
  sharedAdminApiBase;

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  const response = await fetch(joinPlatformApiUrl(pipelineApiBase, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Pipeline API request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function startCreativePipeline(
  input: StartCreativePipelineRequestDto,
): Promise<StartCreativePipelineResponseDto> {
  return requestJson('/pipeline/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function answerPipelineQuestion(input: AnswerPipelineQuestionRequestDto): Promise<PipelineEventDto> {
  return requestJson(`/pipeline/tasks/${input.taskId}/questions/${input.questionId}/answer`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmPipelineScript(input: ConfirmPipelineScriptRequestDto): Promise<PipelineEventDto> {
  return requestJson(`/pipeline/tasks/${input.taskId}/script/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function retryPipelineStage(taskId: string, stage: string): Promise<PipelineEventDto> {
  return requestJson(`/pipeline/tasks/${taskId}/stages/${stage}/retry`, {
    method: 'POST',
  });
}

export function stopPipelineTask(taskId: string): Promise<PipelineEventDto> {
  return requestJson(`/pipeline/tasks/${taskId}/stop`, {
    method: 'POST',
  });
}
