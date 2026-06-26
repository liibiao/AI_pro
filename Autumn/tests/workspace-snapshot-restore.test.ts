import assert from 'node:assert/strict';
import {
  hydrateWorkspaceFromProjectSnapshotPayload,
  type WorkspaceState,
} from '../src/store/workspaceStore';
import type { ProjectSnapshotPayload } from '../src/types/project';

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

function createBaseState(): WorkspaceState {
  return {
    theme: 'light',
    projectTitle: '旧项目',
    stage: 'skill_matched',
    openPanels: ['media'],
    chatFlowState: 'skillMatched',
    workspaceState: 'skillCompleted',
    selectedElementId: 'old-shot',
    selectedTimelineClipId: null,
    assets: [],
    documents: [],
    storyboardElements: [],
    timelineTracks: [],
    creditBalance: 12,
  };
}

function createRestorePayload(): ProjectSnapshotPayload {
  return {
    projectTitle: '恢复项目',
    stage: 'timeline_ready',
    chatFlowState: 'mediaGenerating',
    workspaceState: 'timelinePreview',
    storyboardElements: [
      {
        id: 'shot-restore',
        name: '恢复镜头',
        type: 'shot',
        description: '从快照恢复的镜头',
        status: 'completed',
        assets: [
          {
            id: 'asset-restore',
            name: '恢复视频',
            type: 'video',
            status: 'completed',
          },
        ],
      },
    ],
    timelineTracks: [
      {
        id: 'video',
        title: '视频',
        type: 'video',
        clips: [
          {
            id: 'clip-restore',
            title: '恢复镜头',
            start: 0,
            duration: 8,
            status: 'completed',
            sourceElementId: 'shot-restore',
          },
        ],
      },
    ],
    assets: [],
    documents: [],
    creditBalance: 88,
  };
}

test('hydrateWorkspaceFromProjectSnapshotPayload restores persisted workspace state', () => {
  const payload = createRestorePayload();
  const restoredState = hydrateWorkspaceFromProjectSnapshotPayload(createBaseState(), payload);

  assert.equal(restoredState.theme, 'light');
  assert.equal(restoredState.projectTitle, '恢复项目');
  assert.equal(restoredState.stage, 'timeline_ready');
  assert.equal(restoredState.chatFlowState, 'mediaGenerating');
  assert.equal(restoredState.workspaceState, 'timelinePreview');
  assert.equal(restoredState.creditBalance, 88);
  assert.deepEqual(restoredState.openPanels, ['storyboard', 'timeline']);
  assert.equal(restoredState.selectedElementId, 'shot-restore');
  assert.equal(restoredState.selectedTimelineClipId, 'clip-restore');
  assert.equal(restoredState.storyboardElements[0]?.assets[0]?.name, '恢复视频');
  assert.equal(restoredState.timelineTracks[0]?.clips[0]?.title, '恢复镜头');

  payload.storyboardElements[0]!.assets[0]!.name = '外部污染';
  payload.timelineTracks[0]!.clips[0]!.title = '外部污染';

  assert.equal(restoredState.storyboardElements[0]?.assets[0]?.name, '恢复视频');
  assert.equal(restoredState.timelineTracks[0]?.clips[0]?.title, '恢复镜头');
});
