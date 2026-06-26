import type { GenerationStageStatus, PipelineStage } from '../../types/pipeline';

export interface PipelineEventPayloadDto {
  selectedElementId?: string;
  creditBalance?: number;
  progress?: number;
}

export interface PipelineEventDto {
  id: string;
  taskId: string;
  projectId: string;
  stage: PipelineStage;
  label: string;
  description: string;
  status: GenerationStageStatus;
  occurredAt: string;
  payload?: PipelineEventPayloadDto;
}

export interface StartCreativePipelineRequestDto {
  projectId: string;
  prompt: string;
  attachmentIds?: string[];
  skillId?: string;
}

export interface StartCreativePipelineResponseDto {
  taskId: string;
  projectId: string;
  status: GenerationStageStatus;
}

export interface AnswerPipelineQuestionRequestDto {
  taskId: string;
  questionId: string;
  optionId?: string;
  freeText?: string;
}

export interface ConfirmPipelineScriptRequestDto {
  taskId: string;
  confirmed: boolean;
  revisionPrompt?: string;
}

