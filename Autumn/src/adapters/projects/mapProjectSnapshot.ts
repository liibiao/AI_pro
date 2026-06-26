import type { ProjectSnapshotDto, ProjectSnapshotPayloadDto } from '../../api/projects/projectSnapshotDto';
import type {
  AssetItem,
  DocumentItem,
  StoryboardElement,
  TimelineTrack,
} from '../../types/pipeline';
import { normalizeGenerationParams } from '../../services/params/generationParamValidation';
import type { ProjectSnapshot, ProjectSnapshotPayload } from '../../types/project';

function cloneAssets(assets: AssetItem[]): AssetItem[] {
  return assets.map((asset) => ({ ...asset }));
}

function cloneStoryboardElements(elements: StoryboardElement[]): StoryboardElement[] {
  return elements.map((element) => {
    const clonedElement: StoryboardElement = {
      ...element,
      assets: cloneAssets(element.assets),
    };

    if (element.generationParams) {
      clonedElement.generationParams = normalizeGenerationParams(element.generationParams);
    } else {
      delete clonedElement.generationParams;
    }

    return clonedElement;
  });
}

function cloneTimelineTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip })),
  }));
}

function cloneDocuments(documents: DocumentItem[]): DocumentItem[] {
  return documents.map((document) => ({
    ...document,
    body: [...document.body],
  }));
}

export function createProjectSnapshotPayload(input: ProjectSnapshotPayload): ProjectSnapshotPayload {
  return {
    projectTitle: input.projectTitle,
    stage: input.stage,
    chatFlowState: input.chatFlowState,
    workspaceState: input.workspaceState,
    storyboardElements: cloneStoryboardElements(input.storyboardElements),
    timelineTracks: cloneTimelineTracks(input.timelineTracks),
    assets: cloneAssets(input.assets),
    documents: cloneDocuments(input.documents),
    creditBalance: input.creditBalance,
  };
}

export function mapProjectSnapshotPayloadToDto(
  payload: ProjectSnapshotPayload,
): ProjectSnapshotPayloadDto {
  return {
    project_title: payload.projectTitle,
    stage: payload.stage,
    chat_flow_state: payload.chatFlowState,
    workspace_state: payload.workspaceState,
    storyboard_elements: cloneStoryboardElements(payload.storyboardElements),
    timeline_tracks: cloneTimelineTracks(payload.timelineTracks),
    assets: cloneAssets(payload.assets),
    documents: cloneDocuments(payload.documents),
    credit_balance: payload.creditBalance,
  };
}

export function mapProjectSnapshotPayloadDto(
  dto: ProjectSnapshotPayloadDto,
): ProjectSnapshotPayload {
  return {
    projectTitle: dto.project_title,
    stage: dto.stage,
    chatFlowState: dto.chat_flow_state,
    workspaceState: dto.workspace_state,
    storyboardElements: cloneStoryboardElements(dto.storyboard_elements),
    timelineTracks: cloneTimelineTracks(dto.timeline_tracks),
    assets: cloneAssets(dto.assets),
    documents: cloneDocuments(dto.documents),
    creditBalance: dto.credit_balance,
  };
}

export function mapProjectSnapshotDto(dto: ProjectSnapshotDto): ProjectSnapshot {
  return {
    id: dto.snapshot_id,
    projectId: dto.project_id,
    version: dto.version,
    reason: dto.reason,
    savedAt: dto.saved_at,
    payload: mapProjectSnapshotPayloadDto(dto.payload),
  };
}
