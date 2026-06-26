import type {
  StoryboardElement,
  TimelineClip,
  TimelineTrack,
  WorkspacePanel,
} from '../../types/pipeline';

interface SelectShotAcrossWorkspaceInput {
  elementId: string;
  storyboardElements: StoryboardElement[];
  timelineTracks: TimelineTrack[];
  openPanels: WorkspacePanel[];
  revealTimeline?: boolean;
}

interface SelectShotAcrossWorkspaceResult {
  openPanels: WorkspacePanel[];
  selectedElementId: string;
  selectedTimelineClipId: string | null;
}

function ensurePanel(openPanels: WorkspacePanel[], panel: WorkspacePanel): WorkspacePanel[] {
  return openPanels.includes(panel) ? openPanels : [...openPanels, panel];
}

export function findTimelineClipForStoryboardElement(
  element: StoryboardElement | undefined,
  timelineTracks: TimelineTrack[],
): TimelineClip | null {
  if (!element) {
    return null;
  }

  const videoTrack = timelineTracks.find((track) => track.type === 'video');
  const clip = videoTrack?.clips.find(
    (item) => item.sourceElementId === element.id || item.title === element.name,
  );

  return clip ?? null;
}

export function findStoryboardElementForTimelineClip(
  clipId: string,
  timelineTracks: TimelineTrack[],
  storyboardElements: StoryboardElement[],
): StoryboardElement | null {
  const clip = timelineTracks.flatMap((track) => track.clips).find((item) => item.id === clipId);

  if (!clip) {
    return null;
  }

  const element = storyboardElements.find(
    (item) => item.id === clip.sourceElementId || item.name === clip.title,
  );

  return element ?? null;
}

export function selectShotAcrossWorkspace({
  elementId,
  storyboardElements,
  timelineTracks,
  openPanels,
  revealTimeline = false,
}: SelectShotAcrossWorkspaceInput): SelectShotAcrossWorkspaceResult {
  const selectedElement =
    storyboardElements.find((element) => element.id === elementId) ?? storyboardElements[0];
  const selectedTimelineClip = findTimelineClipForStoryboardElement(selectedElement, timelineTracks);

  const nextOpenPanels =
    revealTimeline && selectedElement?.type === 'shot'
      ? ensurePanel(ensurePanel(openPanels, 'storyboard'), 'timeline')
      : openPanels;

  return {
    openPanels: nextOpenPanels,
    selectedElementId: selectedElement?.id ?? elementId,
    selectedTimelineClipId: selectedTimelineClip?.id ?? null,
  };
}
