import type { StoryboardElement, TimelineClip, TimelineTrack } from '../../types/pipeline';

interface SyncShotToTimelineOptions {
  defaultClipDuration?: number;
  gapDuration?: number;
}

function findExistingClip(element: StoryboardElement, clips: TimelineClip[]): TimelineClip | undefined {
  return clips.find((clip) => clip.sourceElementId === element.id || clip.title === element.name);
}

export function syncShotToTimeline(
  storyboardElements: StoryboardElement[],
  timelineTracks: TimelineTrack[],
  options: SyncShotToTimelineOptions = {},
): TimelineTrack[] {
  const shotElements = storyboardElements.filter((element) => element.type === 'shot');

  if (shotElements.length === 0) {
    return timelineTracks;
  }

  const defaultClipDuration = options.defaultClipDuration ?? 12;
  const gapDuration = options.gapDuration ?? 1;
  const currentVideoTrack = timelineTracks.find((track) => track.type === 'video');
  let cursor = 0;

  const syncedClips = shotElements.map((element) => {
    const existingClip = findExistingClip(element, currentVideoTrack?.clips ?? []);
    const duration = existingClip?.duration ?? defaultClipDuration;
    const clip: TimelineClip = {
      id: existingClip?.id ?? `clip-${element.id}`,
      title: element.name,
      start: cursor,
      duration,
      status: element.status,
      sourceElementId: element.id,
    };

    cursor += duration + gapDuration;
    return clip;
  });

  const syncedVideoTrack: TimelineTrack = {
    id: currentVideoTrack?.id ?? 'video',
    title: currentVideoTrack?.title ?? '视频',
    type: 'video',
    clips: syncedClips,
  };

  const hasVideoTrack = timelineTracks.some((track) => track.type === 'video');

  return hasVideoTrack
    ? timelineTracks.map((track) => (track.type === 'video' ? syncedVideoTrack : track))
    : [syncedVideoTrack, ...timelineTracks];
}
