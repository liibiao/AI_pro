import type {
  AssetItem,
  ChatFlowState,
  DocumentItem,
  GenerationStageStatus,
  PipelineStage,
  ProductionWorkspaceState,
  StoryboardElement,
  TimelineTrack,
} from './pipeline';

export interface ProjectListItem {
  id: string;
  title: string;
  updatedAt: string;
  status: GenerationStageStatus;
  thumbnail: string;
  description?: string;
  latestSnapshot?: ProjectSnapshot;
}

export type ProjectSnapshotReason = 'autosave' | 'manual';

export interface ProjectSnapshotPayload {
  projectTitle: string;
  stage: PipelineStage;
  chatFlowState: ChatFlowState;
  workspaceState: ProductionWorkspaceState;
  storyboardElements: StoryboardElement[];
  timelineTracks: TimelineTrack[];
  assets: AssetItem[];
  documents: DocumentItem[];
  creditBalance: number;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  version: number;
  reason: ProjectSnapshotReason;
  savedAt: string;
  payload: ProjectSnapshotPayload;
}

export type ProjectSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export type ProjectExportStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ProjectExportFormat = 'mp4' | 'gif' | 'mov';

export type ProjectExportResolution = '720p' | '1080p' | '4k';

export type ProjectExportFrameRate = 24 | 30 | 60;

export interface ProjectExportOptions {
  format: ProjectExportFormat;
  resolution: ProjectExportResolution;
  frameRate: ProjectExportFrameRate;
  includeSubtitles: boolean;
  compressQuality: boolean;
}

export interface ProjectExportTask {
  id: string;
  projectId: string;
  status: ProjectExportStatus;
  progress: number;
  options: ProjectExportOptions;
  createdAt: string;
  updatedAt: string;
  downloadUrl?: string;
  error?: string;
}

export type ProjectExportTaskEventType =
  | 'export:progress'
  | 'export:succeeded'
  | 'export:failed';

export interface ProjectExportTaskEvent {
  id: string;
  taskId: string;
  projectId: string;
  type: ProjectExportTaskEventType;
  status: ProjectExportStatus;
  progress: number;
  updatedAt: string;
  downloadUrl?: string;
  error?: string;
}
