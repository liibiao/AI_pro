import type {
  AssetItem,
  ChatFlowState,
  DocumentItem,
  PipelineStage,
  ProductionWorkspaceState,
  StoryboardElement,
  TimelineTrack,
} from '../../types/pipeline';
import type { ProjectSnapshotReason } from '../../types/project';

export interface ProjectSnapshotPayloadDto {
  project_title: string;
  stage: PipelineStage;
  chat_flow_state: ChatFlowState;
  workspace_state: ProductionWorkspaceState;
  storyboard_elements: StoryboardElement[];
  timeline_tracks: TimelineTrack[];
  assets: AssetItem[];
  documents: DocumentItem[];
  credit_balance: number;
}

export interface ProjectSnapshotDto {
  snapshot_id: string;
  project_id: string;
  version: number;
  reason: ProjectSnapshotReason;
  saved_at: string;
  payload: ProjectSnapshotPayloadDto;
}

export interface SaveProjectSnapshotRequestDto {
  reason: ProjectSnapshotReason;
  payload: ProjectSnapshotPayloadDto;
}
