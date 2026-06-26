import type { GenerationParams } from './params';

export type ThemeMode = 'dark' | 'light';

export type WorkspacePanel = 'storyboard' | 'media' | 'timeline' | 'document';

export type ChatFlowState =
  | 'skillMatched'
  | 'questionStyle'
  | 'questionDuration'
  | 'scriptDraft'
  | 'scriptConfirm'
  | 'mediaGenerating';

export type ProductionWorkspaceState =
  | 'skillCompleted'
  | 'videoSpecDocument'
  | 'storyboardOverview'
  | 'assetPreview'
  | 'audioPreview'
  | 'shotScriptCard'
  | 'shotVideoGenerating'
  | 'timelinePreview';

export type PipelineStage =
  | 'skill_matched'
  | 'question_style'
  | 'question_duration'
  | 'script_draft_ready'
  | 'script_confirmation'
  | 'video_spec_ready'
  | 'storyboard_ready'
  | 'media_assets_generating'
  | 'asset_preview_ready'
  | 'audio_ready'
  | 'shot_script_ready'
  | 'shot_video_generating'
  | 'timeline_ready';

export type GenerationStageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PipelineStep {
  id: string;
  label: string;
  status: GenerationStageStatus;
  description?: string;
}

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatMessageKind =
  | 'text'
  | 'resultCard'
  | 'questionCard'
  | 'scriptDraft'
  | 'confirmationCard'
  | 'progressCard';

export interface ChatOption {
  id: string;
  title: string;
  description?: string;
  selected?: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  title?: string;
  content: string;
  question?: string;
  options?: ChatOption[];
  steps?: PipelineStep[];
  pageIndex?: number;
  pageTotal?: number;
  actionLabel?: string;
}

export type AssetType = 'image' | 'audio' | 'video' | 'document';

export interface AssetItem {
  id: string;
  name: string;
  type: AssetType;
  status: GenerationStageStatus;
  createdAt?: string;
  fileSize?: number;
  isFavorite?: boolean;
  mimeType?: string;
  origin?: 'generated' | 'uploaded' | 'mock';
  thumbnail?: string;
  duration?: string;
  progress?: number;
  remoteId?: string;
  sourceUrl?: string;
  targetAssetSlot?: string;
}

export type StoryboardElementType = 'role' | 'scene' | 'prop' | 'audio' | 'shot';

export interface StoryboardElement {
  id: string;
  name: string;
  type: StoryboardElementType;
  description: string;
  status: GenerationStageStatus;
  assets: AssetItem[];
  errorMessage?: string;
  generationParams?: GenerationParams;
  progress?: number;
}

export interface TimelineClip {
  id: string;
  title: string;
  start: number;
  duration: number;
  status: GenerationStageStatus;
  sourceElementId?: string;
}

export interface TimelineTrack {
  id: string;
  title: string;
  type: 'video' | 'audio' | 'subtitle';
  clips: TimelineClip[];
}

export interface DocumentItem {
  id: string;
  title: string;
  active?: boolean;
  body: string[];
}

export interface PipelineEvent {
  id: string;
  taskId: string;
  projectId: string;
  stage: PipelineStage;
  label: string;
  description: string;
  status: GenerationStageStatus;
  occurredAt: string;
}

export interface PipelineSnapshot {
  stage: PipelineStage;
  stageLabel: string;
  stageDescription: string;
  openPanels: WorkspacePanel[];
  chatFlowState: ChatFlowState;
  workspaceState: ProductionWorkspaceState;
  selectedElementId: string;
  creditBalance: number;
}
