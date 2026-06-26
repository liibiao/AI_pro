import { useMemo, useReducer } from 'react';
import { createProjectSnapshotPayload } from '../adapters/projects/mapProjectSnapshot';
import {
  chatMessagesByState,
  documents,
  mockAssets,
  storyboardElements as mockStoryboardElements,
  timelineTracks as mockTimelineTracks,
} from '../mock/pipelineMock';
import {
  findStoryboardElementForTimelineClip,
  selectShotAcrossWorkspace,
} from '../services/orchestration/selectShotAcrossWorkspace';
import { syncShotToTimeline } from '../services/orchestration/syncShotToTimeline';
import {
  getNextPipelineStage,
  getPipelineSnapshotByStage,
  getPreviousPipelineStage,
  pipelineEvents,
  pipelineStageOrder,
} from '../services/pipeline/applyPipelineEvent';
import { normalizeGenerationParams } from '../services/params/generationParamValidation';
import type { GenerationParams } from '../types/params';
import type { ProjectSnapshotPayload } from '../types/project';
import type {
  ChatFlowState,
  PipelineStage,
  ProductionWorkspaceState,
  AssetItem,
  DocumentItem,
  StoryboardElement,
  ThemeMode,
  TimelineTrack,
  WorkspacePanel,
} from '../types/pipeline';

export interface WorkspaceState {
  theme: ThemeMode;
  projectTitle: string;
  stage: PipelineStage;
  openPanels: WorkspacePanel[];
  chatFlowState: ChatFlowState;
  workspaceState: ProductionWorkspaceState;
  selectedElementId: string;
  selectedTimelineClipId: string | null;
  assets: AssetItem[];
  documents: DocumentItem[];
  storyboardElements: StoryboardElement[];
  timelineTracks: TimelineTrack[];
  creditBalance: number;
}

export type WorkspaceAction =
  | { type: 'setTheme'; theme: ThemeMode }
  | { type: 'setStage'; stage: PipelineStage }
  | { type: 'advanceStage' }
  | { type: 'previousStage' }
  | { type: 'resetPipeline' }
  | { type: 'hydrateProjectSnapshot'; payload: ProjectSnapshotPayload }
  | { type: 'upsertDocument'; document: DocumentItem }
  | { type: 'selectDocument'; documentId: string }
  | { type: 'replaceStoryboardElements'; elements: StoryboardElement[] }
  | { type: 'togglePanel'; panel: WorkspacePanel }
  | { type: 'selectElement'; elementId: string }
  | { type: 'selectTimelineClip'; clipId: string }
  | { type: 'bindGenerationParamsToElement'; elementId: string; params: GenerationParams }
  | { type: 'addStoryboardShot'; timestamp: number; params: GenerationParams }
  | { type: 'updateStoryboardElement'; elementId: string; name: string; description: string }
  | { type: 'duplicateStoryboardElement'; elementId: string; timestamp: number }
  | { type: 'deleteStoryboardElement'; elementId: string }
  | { type: 'markStoryboardElementRegenerating'; elementId: string; params: GenerationParams }
  | { type: 'markStoryboardElementFailed'; elementId: string; errorMessage: string }
  | { type: 'reorderStoryboardElement'; elementId: string; toIndex: number }
  | { type: 'upsertAssets'; assets: AssetItem[] }
  | { type: 'deleteAsset'; assetId: string }
  | { type: 'deleteAssets'; assetIds: string[] }
  | { type: 'toggleAssetFavorite'; assetId: string }
  | { type: 'upsertGeneratedAssets'; assets: AssetItem[]; sourceElementId?: string }
  | { type: 'syncStoryboardToTimeline' };

const initialStage: PipelineStage = 'skill_matched';

function getInitialStage(): PipelineStage {
  if (typeof window === 'undefined') {
    return initialStage;
  }

  const stage = new URLSearchParams(window.location.search).get('stage');
  return pipelineStageOrder.includes(stage as PipelineStage) ? (stage as PipelineStage) : initialStage;
}

function cloneStoryboardElements(): StoryboardElement[] {
  return mockStoryboardElements.map((element) => cloneStoryboardElement(element));
}

function cloneTimelineTracks(): TimelineTrack[] {
  return mockTimelineTracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip })),
  }));
}

function cloneAssets(): AssetItem[] {
  return mockAssets.map((asset) => ({ ...asset }));
}

function cloneElementAssets(assets: AssetItem[]): AssetItem[] {
  return assets.map((asset) => ({ ...asset }));
}

function cloneGenerationParams(params: GenerationParams | undefined): GenerationParams | undefined {
  return params ? normalizeGenerationParams(params) : undefined;
}

function cloneDocuments(): DocumentItem[] {
  return documents.map((document) => ({
    ...document,
    body: [...document.body],
  }));
}

function upsertDocument(documents: DocumentItem[], document: DocumentItem): DocumentItem[] {
  const nextDocument = {
    ...document,
    active: true,
    body: [...document.body],
  };
  const existing = documents.some((item) => item.id === document.id || item.title === document.title);
  const inactiveDocuments = documents.map((item) => ({
    ...item,
    active: false,
  }));

  return existing
    ? inactiveDocuments.map((item) =>
        item.id === document.id || item.title === document.title ? nextDocument : item,
      )
    : [nextDocument, ...inactiveDocuments];
}

export function upsertDocumentInWorkspace(
  state: WorkspaceState,
  document: DocumentItem,
): WorkspaceState {
  return {
    ...state,
    documents: upsertDocument(state.documents, document),
    openPanels: ['document'],
    workspaceState: 'videoSpecDocument',
  };
}

export function selectDocumentInWorkspace(
  state: WorkspaceState,
  documentId: string,
): WorkspaceState {
  const hasDocument = state.documents.some((document) => document.id === documentId);

  if (!hasDocument) {
    return state;
  }

  return {
    ...state,
    documents: state.documents.map((document) => ({
      ...document,
      active: document.id === documentId,
    })),
    openPanels: ['document'],
  };
}

export function replaceStoryboardElementsInWorkspace(
  state: WorkspaceState,
  elements: StoryboardElement[],
): WorkspaceState {
  if (!elements.length) {
    return state;
  }

  const storyboardElements = elements.map((element) => cloneStoryboardElement(element));
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selectedShot =
    storyboardElements.find((element) => element.type === 'shot') ?? storyboardElements[0]!;
  const selection = selectShotAcrossWorkspace({
    elementId: selectedShot.id,
    storyboardElements,
    timelineTracks,
    openPanels: ['storyboard'],
    revealTimeline: selectedShot.type === 'shot',
  });

  return {
    ...state,
    stage: 'storyboard_ready',
    openPanels: selection.openPanels,
    chatFlowState: 'mediaGenerating',
    workspaceState: 'storyboardOverview',
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
    storyboardElements,
    timelineTracks,
  };
}

function createInitialState(): WorkspaceState {
  const initialSnapshot = getPipelineSnapshotByStage(getInitialStage());
  const initialStoryboardElements = cloneStoryboardElements();
  const initialTimelineTracks = cloneTimelineTracks();
  const initialSelection = selectShotAcrossWorkspace({
    elementId: initialSnapshot.selectedElementId,
    storyboardElements: initialStoryboardElements,
    timelineTracks: initialTimelineTracks,
    openPanels: initialSnapshot.openPanels,
  });

  return {
    theme: 'dark',
    projectTitle: '未命名项目',
    stage: initialSnapshot.stage,
    openPanels: initialSelection.openPanels,
    chatFlowState: initialSnapshot.chatFlowState,
    workspaceState: initialSnapshot.workspaceState,
    selectedElementId: initialSelection.selectedElementId,
    selectedTimelineClipId: initialSelection.selectedTimelineClipId,
    assets: cloneAssets(),
    documents: cloneDocuments(),
    storyboardElements: initialStoryboardElements,
    timelineTracks: initialTimelineTracks,
    creditBalance: initialSnapshot.creditBalance,
  };
}

const initialState = createInitialState();

function applyStage(state: WorkspaceState, stage: PipelineStage): WorkspaceState {
  const snapshot = getPipelineSnapshotByStage(stage);
  const selection = selectShotAcrossWorkspace({
    elementId: snapshot.selectedElementId,
    storyboardElements: state.storyboardElements,
    timelineTracks: state.timelineTracks,
    openPanels: snapshot.openPanels,
  });

  return {
    ...state,
    stage: snapshot.stage,
    openPanels: selection.openPanels,
    chatFlowState: snapshot.chatFlowState,
    workspaceState: snapshot.workspaceState,
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
    creditBalance: snapshot.creditBalance,
  };
}

export function hydrateWorkspaceFromProjectSnapshotPayload(
  state: WorkspaceState,
  payload: ProjectSnapshotPayload,
): WorkspaceState {
  const restoredPayload = createProjectSnapshotPayload(payload);
  const snapshot = getPipelineSnapshotByStage(restoredPayload.stage);
  const storyboardElements =
    restoredPayload.storyboardElements.length > 0
      ? restoredPayload.storyboardElements
      : cloneStoryboardElements();
  const timelineTracks =
    restoredPayload.timelineTracks.length > 0 ? restoredPayload.timelineTracks : cloneTimelineTracks();
  const assets = restoredPayload.assets.length > 0 ? restoredPayload.assets : cloneAssets();
  const restoredDocuments =
    restoredPayload.documents.length > 0 ? restoredPayload.documents : cloneDocuments();
  const selection = selectShotAcrossWorkspace({
    elementId: snapshot.selectedElementId,
    storyboardElements,
    timelineTracks,
    openPanels: snapshot.openPanels,
  });

  return {
    ...state,
    projectTitle: restoredPayload.projectTitle,
    stage: restoredPayload.stage,
    openPanels: selection.openPanels,
    chatFlowState: restoredPayload.chatFlowState,
    workspaceState: restoredPayload.workspaceState,
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
    assets,
    documents: restoredDocuments,
    storyboardElements,
    timelineTracks,
    creditBalance: restoredPayload.creditBalance,
  };
}

function upsertAssets(currentAssets: AssetItem[], nextAssets: AssetItem[]): AssetItem[] {
  const nextById = new Map(nextAssets.map((asset) => [asset.id, asset]));
  const merged = currentAssets.map((asset) => nextById.get(asset.id) ?? asset);
  const existingIds = new Set(currentAssets.map((asset) => asset.id));

  return [
    ...merged,
    ...nextAssets.filter((asset) => !existingIds.has(asset.id)),
  ];
}

function attachAssetsToElement(
  elements: StoryboardElement[],
  elementId: string | undefined,
  assets: AssetItem[],
): StoryboardElement[] {
  if (!elementId || assets.length === 0) {
    return elements;
  }

  return elements.map((element) => {
    if (element.id !== elementId) {
      return element;
    }

    const nextAssets = upsertAssetsByTargetSlot(element.assets, assets);
    const latestAsset = assets[0];

    const nextElement: StoryboardElement = {
      ...element,
      assets: nextAssets,
      progress: latestAsset?.progress ?? element.progress,
      status: latestAsset?.status ?? element.status,
    };

    delete nextElement.errorMessage;
    return nextElement;
  });
}

function assetMatchesTargetSlot(asset: AssetItem, targetAssetSlot: string): boolean {
  if (asset.targetAssetSlot === targetAssetSlot) {
    return true;
  }

  if (targetAssetSlot === 'shotVideo') {
    return asset.type === 'video';
  }

  if (targetAssetSlot === 'elementReference') {
    return asset.type === 'image';
  }

  if (targetAssetSlot === 'audioReference') {
    return asset.type === 'audio';
  }

  return false;
}

function upsertAssetsByTargetSlot(currentAssets: AssetItem[], nextAssets: AssetItem[]): AssetItem[] {
  return nextAssets.reduce((assets, nextAsset) => {
    if (!nextAsset.targetAssetSlot) {
      return upsertAssets(assets, [nextAsset]);
    }

    const replacedAssets = assets.filter(
      (asset) => !assetMatchesTargetSlot(asset, nextAsset.targetAssetSlot!),
    );
    return upsertAssets(replacedAssets, [nextAsset]);
  }, currentAssets);
}

function parseClipDuration(asset: AssetItem): number {
  if (!asset.duration) {
    return 15;
  }

  const parts = asset.duration.split(':').map((part) => Number(part));

  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return Math.max(1, parts[0]! * 60 + parts[1]!);
  }

  return 15;
}

function getNextClipStart(clips: TimelineTrack['clips']): number {
  if (!clips.length) {
    return 0;
  }

  return Math.max(...clips.map((clip) => clip.start + clip.duration)) + 2;
}

function upsertVideoAssetsToTimeline(
  tracks: TimelineTrack[],
  assets: AssetItem[],
  sourceElementId?: string,
): TimelineTrack[] {
  const videoAssets = assets.filter((asset) => asset.type === 'video');

  if (!videoAssets.length) {
    return tracks;
  }

  const hasVideoTrack = tracks.some((track) => track.type === 'video');
  const baseTracks = hasVideoTrack
    ? tracks
    : [{ id: 'video', title: '视频', type: 'video' as const, clips: [] }, ...tracks];

  return baseTracks.map((track) => {
    if (track.type !== 'video') {
      return track;
    }

    let clips = [...track.clips];

    videoAssets.forEach((asset) => {
      const clipId = `clip-${asset.id}`;
      const existingIndex = clips.findIndex(
        (clip) =>
          clip.id === clipId ||
          (asset.targetAssetSlot === 'shotVideo' &&
            sourceElementId &&
            clip.sourceElementId === sourceElementId),
      );
      const existingClip = existingIndex >= 0 ? clips[existingIndex] : undefined;
      const clip = {
        id: existingClip?.id ?? clipId,
        title: asset.name,
        start: existingClip ? existingClip.start : getNextClipStart(clips),
        duration: parseClipDuration(asset),
        status: asset.status,
        sourceElementId,
      };

      clips =
        existingIndex >= 0
          ? clips.map((item, index) => (index === existingIndex ? clip : item))
          : [...clips, clip];
    });

    return { ...track, clips };
  });
}

export function applyGeneratedAssetsToWorkspace(
  state: WorkspaceState,
  assets: AssetItem[],
  sourceElementId?: string,
): WorkspaceState {
  if (!assets.length) {
    return state;
  }

  const elementId = sourceElementId ?? state.selectedElementId;

  return {
    ...state,
    assets: upsertAssets(state.assets, assets),
    storyboardElements: attachAssetsToElement(state.storyboardElements, elementId, assets),
    timelineTracks: upsertVideoAssetsToTimeline(state.timelineTracks, assets, elementId),
  };
}

export function upsertLibraryAssetsToWorkspace(
  state: WorkspaceState,
  assets: AssetItem[],
): WorkspaceState {
  if (!assets.length) {
    return state;
  }

  return {
    ...state,
    assets: upsertAssets(state.assets, assets),
  };
}

function updateStoryboardAssetById(
  elements: StoryboardElement[],
  assetId: string,
  updateAsset: (asset: AssetItem) => AssetItem,
): StoryboardElement[] {
  return elements.map((element) => ({
    ...element,
    assets: element.assets.map((asset) => (asset.id === assetId ? updateAsset(asset) : asset)),
  }));
}

export function toggleAssetFavoriteInWorkspace(
  state: WorkspaceState,
  assetId: string,
): WorkspaceState {
  const sourceAsset =
    state.assets.find((asset) => asset.id === assetId) ??
    state.storyboardElements.flatMap((element) => element.assets).find((asset) => asset.id === assetId);

  if (!sourceAsset) {
    return state;
  }

  const nextFavorite = !sourceAsset.isFavorite;
  const updateAsset = (asset: AssetItem): AssetItem => ({ ...asset, isFavorite: nextFavorite });

  return {
    ...state,
    assets: state.assets.map((asset) => (asset.id === assetId ? updateAsset(asset) : asset)),
    storyboardElements: updateStoryboardAssetById(state.storyboardElements, assetId, updateAsset),
  };
}

export function deleteAssetFromWorkspace(
  state: WorkspaceState,
  assetId: string,
): WorkspaceState {
  const timelineClipId = `clip-${assetId}`;

  return {
    ...state,
    assets: state.assets.filter((asset) => asset.id !== assetId),
    storyboardElements: state.storyboardElements.map((element) => ({
      ...element,
      assets: element.assets.filter((asset) => asset.id !== assetId),
    })),
    timelineTracks: state.timelineTracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== timelineClipId),
    })),
    selectedTimelineClipId:
      state.selectedTimelineClipId === timelineClipId ? null : state.selectedTimelineClipId,
  };
}

export function deleteAssetsFromWorkspace(
  state: WorkspaceState,
  assetIds: string[],
): WorkspaceState {
  if (!assetIds.length) {
    return state;
  }

  return assetIds.reduce(
    (nextState, assetId) => deleteAssetFromWorkspace(nextState, assetId),
    state,
  );
}

function reorderStoryboardElements(
  elements: StoryboardElement[],
  elementId: string,
  toIndex: number,
): StoryboardElement[] {
  const fromIndex = elements.findIndex((element) => element.id === elementId);

  if (fromIndex < 0) {
    return elements;
  }

  const nextElements = [...elements];
  const [element] = nextElements.splice(fromIndex, 1);
  nextElements.splice(Math.max(0, Math.min(toIndex, nextElements.length)), 0, element);
  return nextElements;
}

function cloneStoryboardElement(element: StoryboardElement): StoryboardElement {
  const clonedElement: StoryboardElement = {
    ...element,
    assets: cloneElementAssets(element.assets),
  };

  const generationParams = cloneGenerationParams(element.generationParams);

  if (generationParams) {
    clonedElement.generationParams = generationParams;
  } else {
    delete clonedElement.generationParams;
  }

  return clonedElement;
}

function selectElementAfterStoryboardMutation(
  state: WorkspaceState,
  storyboardElements: StoryboardElement[],
  timelineTracks: TimelineTrack[],
  elementId: string,
): Pick<WorkspaceState, 'openPanels' | 'selectedElementId' | 'selectedTimelineClipId'> {
  const selection = selectShotAcrossWorkspace({
    elementId,
    storyboardElements,
    timelineTracks,
    openPanels: state.openPanels,
    revealTimeline: true,
  });

  return {
    openPanels: selection.openPanels,
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
  };
}

export function bindGenerationParamsToStoryboardElement(
  state: WorkspaceState,
  elementId: string,
  params: GenerationParams,
): WorkspaceState {
  const normalizedParams = normalizeGenerationParams(params);
  const hasElement = state.storyboardElements.some((element) => element.id === elementId);

  if (!hasElement) {
    return state;
  }

  return {
    ...state,
    storyboardElements: state.storyboardElements.map((element) =>
      element.id === elementId ? { ...element, generationParams: normalizedParams } : element,
    ),
  };
}

function createStoryboardElementCopy(
  elements: StoryboardElement[],
  sourceElement: StoryboardElement,
  timestamp: number,
): StoryboardElement {
  const copyCount = elements.filter((element) => element.id.startsWith(`${sourceElement.id}-copy`)).length + 1;
  const suffix = copyCount > 1 ? `_${copyCount}` : '';

  return {
    ...cloneStoryboardElement(sourceElement),
    id: `${sourceElement.id}-copy-${timestamp}`,
    name: `${sourceElement.name}_copy${suffix}`,
  };
}

function createStoryboardShot(elements: StoryboardElement[], timestamp: number, params: GenerationParams): StoryboardElement {
  const shotCount = elements.filter((element) => element.type === 'shot').length + 1;

  return {
    id: `shot-new-${timestamp}`,
    name: `Shot_New_${String(shotCount).padStart(2, '0')}`,
    type: 'shot',
    description: '新增分镜镜头，等待镜头脚本与参考素材。',
    status: 'pending',
    assets: [],
    generationParams: normalizeGenerationParams(params),
  };
}

export function addStoryboardShotToWorkspace(
  state: WorkspaceState,
  timestamp: number,
  params: GenerationParams,
): WorkspaceState {
  const newElement = createStoryboardShot(state.storyboardElements, timestamp, params);
  const storyboardElements = [...state.storyboardElements, newElement];
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectElementAfterStoryboardMutation(state, storyboardElements, timelineTracks, newElement.id);

  return {
    ...state,
    ...selection,
    storyboardElements,
    timelineTracks,
  };
}

export function updateStoryboardElementInWorkspace(
  state: WorkspaceState,
  elementId: string,
  input: Pick<StoryboardElement, 'name' | 'description'>,
): WorkspaceState {
  const sourceElement = state.storyboardElements.find((element) => element.id === elementId);

  if (!sourceElement) {
    return state;
  }

  const nextName = input.name.trim() || sourceElement.name;
  const nextDescription = input.description.trim();

  const storyboardElements = state.storyboardElements.map((element) =>
    element.id === elementId
      ? {
          ...element,
          name: nextName,
          description: nextDescription,
        }
      : element,
  );
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectShotAcrossWorkspace({
    elementId: state.selectedElementId,
    storyboardElements,
    timelineTracks,
    openPanels: state.openPanels,
  });

  return {
    ...state,
    storyboardElements,
    timelineTracks,
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
  };
}

export function duplicateStoryboardElementInWorkspace(
  state: WorkspaceState,
  elementId: string,
  timestamp: number,
): WorkspaceState {
  const sourceIndex = state.storyboardElements.findIndex((element) => element.id === elementId);

  if (sourceIndex < 0) {
    return state;
  }

  const sourceElement = state.storyboardElements[sourceIndex]!;
  const copiedElement = createStoryboardElementCopy(state.storyboardElements, sourceElement, timestamp);
  const storyboardElements = [
    ...state.storyboardElements.slice(0, sourceIndex + 1),
    copiedElement,
    ...state.storyboardElements.slice(sourceIndex + 1),
  ];
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectElementAfterStoryboardMutation(state, storyboardElements, timelineTracks, copiedElement.id);

  return {
    ...state,
    ...selection,
    storyboardElements,
    timelineTracks,
  };
}

export function deleteStoryboardElementFromWorkspace(
  state: WorkspaceState,
  elementId: string,
): WorkspaceState {
  const elementIndex = state.storyboardElements.findIndex((element) => element.id === elementId);

  if (elementIndex < 0 || state.storyboardElements.length <= 1) {
    return state;
  }

  const storyboardElements = state.storyboardElements.filter((element) => element.id !== elementId);
  const nextSelectionIndex = Math.min(elementIndex, storyboardElements.length - 1);
  const nextSelectedElementId =
    state.selectedElementId === elementId
      ? storyboardElements[nextSelectionIndex]?.id ?? state.selectedElementId
      : state.selectedElementId;
  const timelineTracksWithoutDeletedElement = state.timelineTracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.sourceElementId !== elementId),
  }));
  const timelineTracks = syncShotToTimeline(storyboardElements, timelineTracksWithoutDeletedElement);
  const selection = selectElementAfterStoryboardMutation(
    state,
    storyboardElements,
    timelineTracks,
    nextSelectedElementId,
  );

  return {
    ...state,
    ...selection,
    storyboardElements,
    timelineTracks,
  };
}

export function markStoryboardElementRegeneratingInWorkspace(
  state: WorkspaceState,
  elementId: string,
  params: GenerationParams,
): WorkspaceState {
  const hasElement = state.storyboardElements.some((element) => element.id === elementId);

  if (!hasElement) {
    return state;
  }

  const storyboardElements = state.storyboardElements.map((element) =>
    element.id === elementId
      ? (() => {
          const nextElement: StoryboardElement = {
            ...element,
            generationParams: normalizeGenerationParams(params),
            progress: 12,
            status: 'running' as const,
          };

          delete nextElement.errorMessage;
          return nextElement;
        })()
      : element,
  );
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectElementAfterStoryboardMutation(state, storyboardElements, timelineTracks, elementId);

  return {
    ...state,
    ...selection,
    storyboardElements,
    timelineTracks,
  };
}

export function markStoryboardElementFailedInWorkspace(
  state: WorkspaceState,
  elementId: string,
  errorMessage: string,
): WorkspaceState {
  const hasElement = state.storyboardElements.some((element) => element.id === elementId);

  if (!hasElement) {
    return state;
  }

  const storyboardElements = state.storyboardElements.map((element) =>
    element.id === elementId
      ? {
          ...element,
          errorMessage,
          progress: 0,
          status: 'failed' as const,
        }
      : element,
  );
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectElementAfterStoryboardMutation(state, storyboardElements, timelineTracks, elementId);

  return {
    ...state,
    ...selection,
    storyboardElements,
    timelineTracks,
  };
}

export function reorderStoryboardElementInWorkspace(
  state: WorkspaceState,
  elementId: string,
  toIndex: number,
): WorkspaceState {
  const hasElement = state.storyboardElements.some((element) => element.id === elementId);

  if (!hasElement) {
    return state;
  }

  const storyboardElements = reorderStoryboardElements(state.storyboardElements, elementId, toIndex);
  const timelineTracks = syncShotToTimeline(storyboardElements, state.timelineTracks);
  const selection = selectShotAcrossWorkspace({
    elementId: state.selectedElementId,
    storyboardElements,
    timelineTracks,
    openPanels: state.openPanels,
  });

  return {
    ...state,
    storyboardElements,
    timelineTracks,
    selectedElementId: selection.selectedElementId,
    selectedTimelineClipId: selection.selectedTimelineClipId,
  };
}

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'setStage':
      return applyStage(state, action.stage);
    case 'advanceStage':
      return applyStage(state, getNextPipelineStage(state.stage));
    case 'previousStage':
      return applyStage(state, getPreviousPipelineStage(state.stage));
    case 'resetPipeline':
      return { ...createInitialState(), theme: state.theme };
    case 'hydrateProjectSnapshot':
      return hydrateWorkspaceFromProjectSnapshotPayload(state, action.payload);
    case 'upsertDocument':
      return upsertDocumentInWorkspace(state, action.document);
    case 'selectDocument':
      return selectDocumentInWorkspace(state, action.documentId);
    case 'replaceStoryboardElements':
      return replaceStoryboardElementsInWorkspace(state, action.elements);
    case 'togglePanel': {
      const exists = state.openPanels.includes(action.panel);
      const openPanels = exists
        ? state.openPanels.filter((panel) => panel !== action.panel)
        : [...state.openPanels, action.panel];
      return { ...state, openPanels };
    }
    case 'selectElement': {
      const selection = selectShotAcrossWorkspace({
        elementId: action.elementId,
        storyboardElements: state.storyboardElements,
        timelineTracks: state.timelineTracks,
        openPanels: state.openPanels,
        revealTimeline: true,
      });

      return {
        ...state,
        openPanels: selection.openPanels,
        selectedElementId: selection.selectedElementId,
        selectedTimelineClipId: selection.selectedTimelineClipId,
      };
    }
    case 'selectTimelineClip': {
      const selectedElement = findStoryboardElementForTimelineClip(
        action.clipId,
        state.timelineTracks,
        state.storyboardElements,
      );

      return {
        ...state,
        selectedElementId: selectedElement?.id ?? state.selectedElementId,
        selectedTimelineClipId: action.clipId,
      };
    }
    case 'bindGenerationParamsToElement':
      return bindGenerationParamsToStoryboardElement(state, action.elementId, action.params);
    case 'addStoryboardShot':
      return addStoryboardShotToWorkspace(state, action.timestamp, action.params);
    case 'updateStoryboardElement':
      return updateStoryboardElementInWorkspace(state, action.elementId, {
        name: action.name,
        description: action.description,
      });
    case 'duplicateStoryboardElement':
      return duplicateStoryboardElementInWorkspace(state, action.elementId, action.timestamp);
    case 'deleteStoryboardElement':
      return deleteStoryboardElementFromWorkspace(state, action.elementId);
    case 'markStoryboardElementRegenerating':
      return markStoryboardElementRegeneratingInWorkspace(state, action.elementId, action.params);
    case 'markStoryboardElementFailed':
      return markStoryboardElementFailedInWorkspace(state, action.elementId, action.errorMessage);
    case 'reorderStoryboardElement':
      return reorderStoryboardElementInWorkspace(state, action.elementId, action.toIndex);
    case 'upsertAssets':
      return upsertLibraryAssetsToWorkspace(state, action.assets);
    case 'deleteAsset':
      return deleteAssetFromWorkspace(state, action.assetId);
    case 'deleteAssets':
      return deleteAssetsFromWorkspace(state, action.assetIds);
    case 'toggleAssetFavorite':
      return toggleAssetFavoriteInWorkspace(state, action.assetId);
    case 'upsertGeneratedAssets':
      return applyGeneratedAssetsToWorkspace(state, action.assets, action.sourceElementId);
    case 'syncStoryboardToTimeline': {
      const timelineTracks = syncShotToTimeline(state.storyboardElements, state.timelineTracks);
      const selection = selectShotAcrossWorkspace({
        elementId: state.selectedElementId,
        storyboardElements: state.storyboardElements,
        timelineTracks,
        openPanels: state.openPanels,
      });

      return {
        ...state,
        timelineTracks,
        selectedTimelineClipId: selection.selectedTimelineClipId,
      };
    }
    default:
      return state;
  }
}

export function useWorkspaceStore() {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  return useMemo(() => {
    const selectedElement =
      state.storyboardElements.find((element) => element.id === state.selectedElementId) ??
      state.storyboardElements[0];

    return {
      state,
      dispatch,
      pipelineEvents,
      chatMessages: chatMessagesByState[state.chatFlowState],
      documents: state.documents,
      assets: state.assets,
      storyboardElements: state.storyboardElements,
      selectedElement,
      timelineTracks: state.timelineTracks,
    };
  }, [state]);
}
