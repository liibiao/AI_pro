import type { PipelineEventDto } from '../../api/pipeline/pipelineDto';
import type {
  ChatFlowState,
  PipelineEvent,
  PipelineSnapshot,
  PipelineStage,
  ProductionWorkspaceState,
  WorkspacePanel,
} from '../../types/pipeline';

export const stageToChatFlow: Record<PipelineStage, ChatFlowState> = {
  skill_matched: 'skillMatched',
  question_style: 'questionStyle',
  question_duration: 'questionDuration',
  script_draft_ready: 'scriptDraft',
  script_confirmation: 'scriptConfirm',
  video_spec_ready: 'scriptConfirm',
  storyboard_ready: 'scriptConfirm',
  media_assets_generating: 'mediaGenerating',
  asset_preview_ready: 'mediaGenerating',
  audio_ready: 'mediaGenerating',
  shot_script_ready: 'mediaGenerating',
  shot_video_generating: 'mediaGenerating',
  timeline_ready: 'mediaGenerating',
};

export const stageToWorkspace: Record<PipelineStage, ProductionWorkspaceState> = {
  skill_matched: 'skillCompleted',
  question_style: 'skillCompleted',
  question_duration: 'skillCompleted',
  script_draft_ready: 'skillCompleted',
  script_confirmation: 'skillCompleted',
  video_spec_ready: 'videoSpecDocument',
  storyboard_ready: 'storyboardOverview',
  media_assets_generating: 'assetPreview',
  asset_preview_ready: 'assetPreview',
  audio_ready: 'audioPreview',
  shot_script_ready: 'shotScriptCard',
  shot_video_generating: 'shotVideoGenerating',
  timeline_ready: 'timelinePreview',
};

export const stageToPanels: Record<PipelineStage, WorkspacePanel[]> = {
  skill_matched: ['storyboard', 'media'],
  question_style: ['storyboard', 'media'],
  question_duration: ['storyboard', 'media'],
  script_draft_ready: ['storyboard', 'media'],
  script_confirmation: ['storyboard', 'media'],
  video_spec_ready: ['document'],
  storyboard_ready: ['storyboard', 'media'],
  media_assets_generating: ['storyboard', 'media'],
  asset_preview_ready: ['storyboard', 'media'],
  audio_ready: ['storyboard', 'media'],
  shot_script_ready: ['storyboard', 'media'],
  shot_video_generating: ['storyboard', 'timeline'],
  timeline_ready: ['storyboard', 'timeline'],
};

const stageToSelectedElement: Record<PipelineStage, string> = {
  skill_matched: 'element-demon-leader',
  question_style: 'element-demon-leader',
  question_duration: 'element-demon-leader',
  script_draft_ready: 'element-demon-leader',
  script_confirmation: 'element-demon-leader',
  video_spec_ready: 'element-general-human',
  storyboard_ready: 'element-demon-leader',
  media_assets_generating: 'element-fortress',
  asset_preview_ready: 'element-demon-leader',
  audio_ready: 'element-general-human',
  shot_script_ready: 'shot-twist-awakening',
  shot_video_generating: 'shot-twist-awakening',
  timeline_ready: 'shot-twist-awakening',
};

export function mapPipelineEvent(dto: PipelineEventDto): PipelineEvent {
  return {
    id: dto.id,
    taskId: dto.taskId,
    projectId: dto.projectId,
    stage: dto.stage,
    label: dto.label,
    description: dto.description,
    status: dto.status,
    occurredAt: dto.occurredAt,
  };
}

export function mapPipelineSnapshot(dto: PipelineEventDto): PipelineSnapshot {
  return {
    stage: dto.stage,
    stageLabel: dto.label,
    stageDescription: dto.description,
    openPanels: stageToPanels[dto.stage],
    chatFlowState: stageToChatFlow[dto.stage],
    workspaceState: stageToWorkspace[dto.stage],
    selectedElementId: dto.payload?.selectedElementId ?? stageToSelectedElement[dto.stage],
    creditBalance: dto.payload?.creditBalance ?? 195,
  };
}
