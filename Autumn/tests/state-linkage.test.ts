import assert from 'node:assert/strict';
import { chatReducer, initialChatComposerState } from '../src/store/chatStore';
import { createTasksFromAssets } from '../src/store/generationTaskStore';
import { initialGenerationParams, paramReducer } from '../src/store/paramStore';
import {
  addStoryboardShotToWorkspace,
  applyGeneratedAssetsToWorkspace,
  bindGenerationParamsToStoryboardElement,
  deleteAssetFromWorkspace,
  deleteAssetsFromWorkspace,
  deleteStoryboardElementFromWorkspace,
  duplicateStoryboardElementInWorkspace,
  markStoryboardElementFailedInWorkspace,
  markStoryboardElementRegeneratingInWorkspace,
  replaceStoryboardElementsInWorkspace,
  reorderStoryboardElementInWorkspace,
  selectDocumentInWorkspace,
  toggleAssetFavoriteInWorkspace,
  updateStoryboardElementInWorkspace,
  upsertDocumentInWorkspace,
  upsertLibraryAssetsToWorkspace,
} from '../src/store/workspaceStore';
import type { WorkspaceState } from '../src/store/workspaceStore';
import {
  findStoryboardElementForTimelineClip,
  selectShotAcrossWorkspace,
} from '../src/services/orchestration/selectShotAcrossWorkspace';
import { syncShotToTimeline } from '../src/services/orchestration/syncShotToTimeline';
import type { AssetItem, DocumentItem, StoryboardElement, TimelineTrack } from '../src/types/pipeline';

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

const shotAsset: AssetItem = {
  id: 'asset-shot-1',
  name: 'Shot_One_video',
  type: 'video',
  status: 'running',
  progress: 64,
};

const storyboardElements: StoryboardElement[] = [
  {
    id: 'role-1',
    name: 'Role_One',
    type: 'role',
    description: '角色',
    status: 'completed',
    assets: [],
  },
  {
    id: 'shot-1',
    name: 'Shot_One',
    type: 'shot',
    description: '第一镜',
    status: 'running',
    progress: 64,
    assets: [shotAsset],
  },
  {
    id: 'shot-2',
    name: 'Shot_Two',
    type: 'shot',
    description: '第二镜',
    status: 'completed',
    assets: [],
  },
];

const timelineTracks: TimelineTrack[] = [
  {
    id: 'video',
    title: '视频',
    type: 'video',
    clips: [
      {
        id: 'clip-shot-1',
        title: 'Shot_One',
        start: 12,
        duration: 8,
        status: 'running',
        sourceElementId: 'shot-1',
      },
    ],
  },
  {
    id: 'audio',
    title: '音频',
    type: 'audio',
    clips: [
      {
        id: 'audio-1',
        title: 'Narration',
        start: 0,
        duration: 20,
        status: 'completed',
      },
    ],
  },
];

function cloneTestStoryboardElements(): StoryboardElement[] {
  return storyboardElements.map((element) => ({
    ...element,
    assets: element.assets.map((asset) => ({ ...asset })),
  }));
}

function cloneTestTimelineTracks(): TimelineTrack[] {
  return timelineTracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip })),
  }));
}

function createWorkspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    theme: 'dark',
    projectTitle: '测试项目',
    stage: 'asset_preview_ready',
    openPanels: ['storyboard', 'media'],
    chatFlowState: 'mediaGenerating',
    workspaceState: 'assetPreview',
    selectedElementId: 'shot-1',
    selectedTimelineClipId: 'clip-shot-1',
    assets: [],
    documents: [],
    storyboardElements: cloneTestStoryboardElements(),
    timelineTracks: cloneTestTimelineTracks(),
    creditBalance: 100,
    ...overrides,
  };
}

test('selectShotAcrossWorkspace links selected shot to timeline clip and opens panels', () => {
  const result = selectShotAcrossWorkspace({
    elementId: 'shot-1',
    storyboardElements,
    timelineTracks,
    openPanels: ['media'],
    revealTimeline: true,
  });

  assert.equal(result.selectedElementId, 'shot-1');
  assert.equal(result.selectedTimelineClipId, 'clip-shot-1');
  assert.deepEqual(result.openPanels, ['media', 'storyboard', 'timeline']);
});

test('timeline clip selection resolves back to storyboard shot', () => {
  const element = findStoryboardElementForTimelineClip(
    'clip-shot-1',
    timelineTracks,
    storyboardElements,
  );

  assert.equal(element?.id, 'shot-1');
});

test('syncShotToTimeline follows storyboard shot order and preserves non-video tracks', () => {
  const syncedTracks = syncShotToTimeline(
    [storyboardElements[2], storyboardElements[0], storyboardElements[1]],
    timelineTracks,
    { defaultClipDuration: 10, gapDuration: 2 },
  );
  const videoTrack = syncedTracks.find((track) => track.type === 'video');
  const audioTrack = syncedTracks.find((track) => track.type === 'audio');

  assert.deepEqual(
    videoTrack?.clips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      start: clip.start,
      duration: clip.duration,
      status: clip.status,
      sourceElementId: clip.sourceElementId,
    })),
    [
      {
        id: 'clip-shot-2',
        title: 'Shot_Two',
        start: 0,
        duration: 10,
        status: 'completed',
        sourceElementId: 'shot-2',
      },
      {
        id: 'clip-shot-1',
        title: 'Shot_One',
        start: 12,
        duration: 8,
        status: 'running',
        sourceElementId: 'shot-1',
      },
    ],
  );
  assert.equal(audioTrack?.clips[0]?.id, 'audio-1');
});

test('chatReducer toggles overlay and records submitted drafts', () => {
  const withDraft = chatReducer(initialChatComposerState, {
    type: 'setDraft',
    draft: '生成下一镜',
  });
  const withOverlay = chatReducer(withDraft, {
    type: 'toggleOverlay',
    overlay: 'model',
  });
  const submitted = chatReducer(withOverlay, { type: 'submitDraft' });

  assert.equal(withOverlay.activeOverlay, 'model');
  assert.equal(submitted.draft, '');
  assert.equal(submitted.activeOverlay, null);
  assert.deepEqual(submitted.submittedPrompts, ['生成下一镜']);
});

test('paramReducer clamps numeric params and toggles references', () => {
  const withImageWeight = paramReducer(initialGenerationParams, {
    type: 'setImageWeight',
    imageWeight: 9,
  });
  const withDuration = paramReducer(withImageWeight, {
    type: 'setDuration',
    durationSeconds: 360,
  });
  const withReference = paramReducer(withDuration, {
    type: 'toggleReferenceAsset',
    kind: 'cref',
    assetId: 'asset-shot-1',
  });
  const withStyleReference = paramReducer(withReference, {
    type: 'toggleReferenceAsset',
    kind: 'sref',
    assetId: 'asset-style-1',
  });
  const withContentWeight = paramReducer(withStyleReference, {
    type: 'setReferenceWeight',
    kind: 'cref',
    weight: -10,
  });
  const withStyleWeight = paramReducer(withContentWeight, {
    type: 'setReferenceWeight',
    kind: 'sref',
    weight: 1200,
  });
  const withSeed = paramReducer(withStyleWeight, {
    type: 'setSeed',
    seed: 4_294_967_296,
  });
  const withoutReference = paramReducer(withReference, {
    type: 'toggleReferenceAsset',
    kind: 'cref',
    assetId: 'asset-shot-1',
  });

  assert.equal(withImageWeight.imageWeight, 3);
  assert.equal(withDuration.durationSeconds, 180);
  assert.deepEqual(withReference.crefAssetIds, ['asset-shot-1']);
  assert.deepEqual(withStyleReference.srefAssetIds, ['asset-style-1']);
  assert.equal(withContentWeight.contentWeight, 0);
  assert.equal(withStyleWeight.styleWeight, 1000);
  assert.equal(withSeed.seed, 4_294_967_295);
  assert.deepEqual(withoutReference.crefAssetIds, []);
});

test('createTasksFromAssets normalizes generation task progress', () => {
  const tasks = createTasksFromAssets([
    { id: 'asset-complete', name: 'Complete', type: 'image', status: 'completed' },
    { id: 'asset-running', name: 'Running', type: 'video', status: 'running', progress: 42 },
    { id: 'asset-pending', name: 'Pending', type: 'audio', status: 'pending' },
  ]);

  assert.deepEqual(
    tasks.map((task) => ({
      id: task.id,
      kind: task.kind,
      status: task.status,
      progress: task.progress,
    })),
    [
      { id: 'task-asset-complete', kind: 'image', status: 'completed', progress: 100 },
      { id: 'task-asset-running', kind: 'video', status: 'running', progress: 42 },
      { id: 'task-asset-pending', kind: 'audio', status: 'pending', progress: 0 },
    ],
  );
});

test('upsertDocumentInWorkspace stores generated documents as the active document view', () => {
  const existingDocument: DocumentItem = {
    id: 'doc-existing',
    title: 'Final_Video_Spec.md',
    active: true,
    body: ['旧规格'],
  };
  const nextDocument: DocumentItem = {
    id: 'doc-generated',
    title: 'Final_Video_Spec.md',
    body: ['# Final_Video_Spec', '标题：城墙之战'],
  };
  const nextState = upsertDocumentInWorkspace(
    createWorkspaceState({
      documents: [
        existingDocument,
        {
          id: 'doc-storyboard',
          title: 'Storyboard.md',
          active: true,
          body: ['旧故事板'],
        },
      ],
      openPanels: ['storyboard', 'media'],
      workspaceState: 'storyboardReady',
    }),
    nextDocument,
  );

  assert.deepEqual(nextState.openPanels, ['document']);
  assert.equal(nextState.workspaceState, 'videoSpecDocument');
  assert.equal(nextState.documents.length, 2);
  assert.equal(nextState.documents[0]?.id, 'doc-generated');
  assert.equal(nextState.documents[0]?.active, true);
  assert.deepEqual(nextState.documents[0]?.body, ['# Final_Video_Spec', '标题：城墙之战']);
  assert.equal(nextState.documents[1]?.active, false);
});

test('selectDocumentInWorkspace activates a clicked document', () => {
  const nextState = selectDocumentInWorkspace(
    createWorkspaceState({
      documents: [
        {
          id: 'doc-script',
          title: '荒原血誓_Script.md',
          active: true,
          body: ['剧本'],
        },
        {
          id: 'doc-skill',
          title: 'skill.md',
          active: false,
          body: ['流程规划'],
        },
      ],
      openPanels: ['storyboard'],
    }),
    'doc-skill',
  );

  assert.deepEqual(nextState.openPanels, ['document']);
  assert.equal(nextState.documents[0]?.active, false);
  assert.equal(nextState.documents[1]?.active, true);
});

test('replaceStoryboardElementsInWorkspace stores agent storyboard and syncs timeline', () => {
  const nextState = replaceStoryboardElementsInWorkspace(
    createWorkspaceState({
      openPanels: ['document'],
      storyboardElements: [],
      timelineTracks: [],
      workspaceState: 'videoSpecDocument',
    }),
    [
      {
        id: 'role-general',
        name: '人族将领',
        type: 'role',
        description: '守城主角',
        status: 'pending',
        assets: [],
      },
      {
        id: 'shot-wall',
        name: '镜头 1',
        type: 'shot',
        description: '城墙全景，魔族压境',
        status: 'pending',
        assets: [],
      },
    ],
  );

  assert.equal(nextState.stage, 'storyboard_ready');
  assert.equal(nextState.workspaceState, 'storyboardOverview');
  assert.deepEqual(nextState.openPanels, ['storyboard', 'timeline']);
  assert.equal(nextState.selectedElementId, 'shot-wall');
  assert.equal(nextState.selectedTimelineClipId, 'clip-shot-wall');
  assert.equal(nextState.storyboardElements[0]?.id, 'role-general');
  assert.deepEqual(
    nextState.timelineTracks.find((track) => track.type === 'video')?.clips.map((clip) => ({
      id: clip.id,
      sourceElementId: clip.sourceElementId,
      title: clip.title,
    })),
    [
      {
        id: 'clip-shot-wall',
        sourceElementId: 'shot-wall',
        title: '镜头 1',
      },
    ],
  );
});

test('applyGeneratedAssetsToWorkspace attaches video results to storyboard and timeline', () => {
  const generatedAsset: AssetItem = {
    id: 'asset-generated-video',
    name: '生成视频',
    type: 'video',
    status: 'completed',
    sourceUrl: 'https://cdn.example.com/generated.mp4',
  };
  const nextState = applyGeneratedAssetsToWorkspace(
    {
      theme: 'dark',
      projectTitle: '测试项目',
      stage: 'shot_video_generating',
      openPanels: ['storyboard', 'timeline'],
      chatFlowState: 'mediaGenerating',
      workspaceState: 'shotVideoGenerating',
      selectedElementId: 'shot-1',
      selectedTimelineClipId: null,
      assets: [],
      documents: [],
      storyboardElements,
      timelineTracks,
      creditBalance: 100,
    },
    [generatedAsset],
    'shot-1',
  );

  assert.equal(nextState.assets[0]?.id, 'asset-generated-video');
  assert.equal(nextState.storyboardElements[1]?.assets.at(-1)?.id, 'asset-generated-video');
  assert.equal(nextState.storyboardElements[1]?.status, 'completed');
  assert.equal(nextState.timelineTracks[0]?.clips.at(-1)?.id, 'clip-asset-generated-video');
  assert.equal(nextState.timelineTracks[0]?.clips.at(-1)?.sourceElementId, 'shot-1');
});

test('applyGeneratedAssetsToWorkspace replaces target slot assets and keeps timeline clip stable', () => {
  const regeneratedAsset: AssetItem = {
    id: 'asset-regenerated-shot-video',
    name: '重生成第一镜',
    type: 'video',
    status: 'completed',
    sourceUrl: 'https://cdn.example.com/regenerated.mp4',
    targetAssetSlot: 'shotVideo',
  };
  const nextState = applyGeneratedAssetsToWorkspace(
    createWorkspaceState({
      stage: 'shot_video_generating',
      openPanels: ['storyboard', 'timeline'],
      workspaceState: 'shotVideoGenerating',
    }),
    [regeneratedAsset],
    'shot-1',
  );
  const shotElement = nextState.storyboardElements.find((element) => element.id === 'shot-1');
  const videoClip = nextState.timelineTracks
    .find((track) => track.type === 'video')
    ?.clips.find((clip) => clip.sourceElementId === 'shot-1');

  assert.deepEqual(shotElement?.assets.map((asset) => asset.id), ['asset-regenerated-shot-video']);
  assert.equal(videoClip?.id, 'clip-shot-1');
  assert.equal(videoClip?.title, '重生成第一镜');
  assert.equal(videoClip?.status, 'completed');
});

test('upsertLibraryAssetsToWorkspace adds uploaded assets without binding storyboard', () => {
  const uploadedAsset: AssetItem = {
    id: 'asset-uploaded-image',
    name: 'uploaded.png',
    type: 'image',
    status: 'completed',
    origin: 'uploaded',
  };
  const nextState = upsertLibraryAssetsToWorkspace(
    {
      theme: 'dark',
      projectTitle: '测试项目',
      stage: 'asset_preview_ready',
      openPanels: ['media'],
      chatFlowState: 'mediaGenerating',
      workspaceState: 'assetPreview',
      selectedElementId: 'shot-1',
      selectedTimelineClipId: null,
      assets: [],
      documents: [],
      storyboardElements,
      timelineTracks,
      creditBalance: 100,
    },
    [uploadedAsset],
  );

  assert.equal(nextState.assets[0]?.id, 'asset-uploaded-image');
  assert.equal(nextState.storyboardElements[1]?.assets.length, 1);
});

test('toggleAssetFavoriteInWorkspace syncs asset favorite state into storyboard copies', () => {
  const nextState = toggleAssetFavoriteInWorkspace(
    {
      theme: 'dark',
      projectTitle: '测试项目',
      stage: 'asset_preview_ready',
      openPanels: ['media'],
      chatFlowState: 'mediaGenerating',
      workspaceState: 'assetPreview',
      selectedElementId: 'shot-1',
      selectedTimelineClipId: null,
      assets: [shotAsset],
      documents: [],
      storyboardElements,
      timelineTracks,
      creditBalance: 100,
    },
    'asset-shot-1',
  );

  assert.equal(nextState.assets[0]?.isFavorite, true);
  assert.equal(nextState.storyboardElements[1]?.assets[0]?.isFavorite, true);
});

test('deleteAssetFromWorkspace removes library asset, storyboard binding, and generated clip', () => {
  const nextState = deleteAssetFromWorkspace(
    {
      theme: 'dark',
      projectTitle: '测试项目',
      stage: 'timeline_ready',
      openPanels: ['media', 'timeline'],
      chatFlowState: 'mediaGenerating',
      workspaceState: 'timelinePreview',
      selectedElementId: 'shot-1',
      selectedTimelineClipId: 'clip-asset-shot-1',
      assets: [shotAsset],
      documents: [],
      storyboardElements,
      timelineTracks: [
        {
          id: 'video',
          title: '视频',
          type: 'video',
          clips: [
            {
              id: 'clip-asset-shot-1',
              title: 'Shot_One_video',
              start: 0,
              duration: 8,
              status: 'running',
              sourceElementId: 'shot-1',
            },
          ],
        },
      ],
      creditBalance: 100,
    },
    'asset-shot-1',
  );

  assert.deepEqual(nextState.assets, []);
  assert.deepEqual(nextState.storyboardElements[1]?.assets, []);
  assert.deepEqual(nextState.timelineTracks[0]?.clips, []);
  assert.equal(nextState.selectedTimelineClipId, null);
});

test('deleteAssetsFromWorkspace removes multiple assets in one state transition', () => {
  const secondAsset: AssetItem = {
    id: 'asset-shot-2',
    name: 'Shot_Two_video',
    type: 'video',
    status: 'completed',
  };
  const nextState = deleteAssetsFromWorkspace(
    {
      theme: 'dark',
      projectTitle: '测试项目',
      stage: 'timeline_ready',
      openPanels: ['media', 'timeline'],
      chatFlowState: 'mediaGenerating',
      workspaceState: 'timelinePreview',
      selectedElementId: 'shot-1',
      selectedTimelineClipId: 'clip-asset-shot-2',
      assets: [shotAsset, secondAsset],
      documents: [],
      storyboardElements: [
        storyboardElements[0]!,
        { ...storyboardElements[1]!, assets: [shotAsset, secondAsset] },
        storyboardElements[2]!,
      ],
      timelineTracks: [
        {
          id: 'video',
          title: '视频',
          type: 'video',
          clips: [
            {
              id: 'clip-asset-shot-1',
              title: 'Shot_One_video',
              start: 0,
              duration: 8,
              status: 'running',
            },
            {
              id: 'clip-asset-shot-2',
              title: 'Shot_Two_video',
              start: 10,
              duration: 8,
              status: 'completed',
            },
          ],
        },
      ],
      creditBalance: 100,
    },
    ['asset-shot-1', 'asset-shot-2'],
  );

  assert.deepEqual(nextState.assets, []);
  assert.deepEqual(nextState.storyboardElements[1]?.assets, []);
  assert.deepEqual(nextState.timelineTracks[0]?.clips, []);
  assert.equal(nextState.selectedTimelineClipId, null);
});

test('bindGenerationParamsToStoryboardElement stores normalized params on a storyboard element', () => {
  const nextState = bindGenerationParamsToStoryboardElement(
    createWorkspaceState(),
    'shot-1',
    {
      ...initialGenerationParams,
      crefAssetIds: [' asset-role ', 'asset-role'],
      imageWeight: 6,
      seed: 4_294_967_296,
    },
  );

  const boundParams = nextState.storyboardElements.find((element) => element.id === 'shot-1')?.generationParams;

  assert.equal(boundParams?.imageWeight, 3);
  assert.equal(boundParams?.seed, 4_294_967_295);
  assert.deepEqual(boundParams?.crefAssetIds, ['asset-role']);
});

test('duplicateStoryboardElementInWorkspace inserts a copied card and syncs timeline selection', () => {
  const nextState = duplicateStoryboardElementInWorkspace(createWorkspaceState(), 'shot-1', 1781800000000);
  const copiedElement = nextState.storyboardElements[2];
  const copiedClip = nextState.timelineTracks
    .find((track) => track.type === 'video')
    ?.clips.find((clip) => clip.sourceElementId === copiedElement?.id);

  assert.equal(copiedElement?.id, 'shot-1-copy-1781800000000');
  assert.equal(copiedElement?.name, 'Shot_One_copy');
  assert.equal(nextState.selectedElementId, copiedElement?.id);
  assert.equal(nextState.selectedTimelineClipId, copiedClip?.id);
});

test('deleteStoryboardElementFromWorkspace removes a shot and selects the nearest remaining card', () => {
  const nextState = deleteStoryboardElementFromWorkspace(createWorkspaceState(), 'shot-1');
  const videoClips = nextState.timelineTracks.find((track) => track.type === 'video')?.clips ?? [];

  assert.equal(nextState.storyboardElements.some((element) => element.id === 'shot-1'), false);
  assert.equal(videoClips.some((clip) => clip.sourceElementId === 'shot-1'), false);
  assert.equal(nextState.selectedElementId, 'shot-2');
});

test('addStoryboardShotToWorkspace creates a selected pending shot with params and timeline clip', () => {
  const nextState = addStoryboardShotToWorkspace(
    createWorkspaceState(),
    1781880000000,
    {
      ...initialGenerationParams,
      imageWeight: 4,
      seed: 1234,
    },
  );
  const newElement = nextState.storyboardElements.at(-1);
  const videoClips = nextState.timelineTracks.find((track) => track.type === 'video')?.clips ?? [];
  const newClip = videoClips.find((clip) => clip.sourceElementId === newElement?.id);

  assert.equal(newElement?.id, 'shot-new-1781880000000');
  assert.equal(newElement?.name, 'Shot_New_03');
  assert.equal(newElement?.type, 'shot');
  assert.equal(newElement?.status, 'pending');
  assert.deepEqual(newElement?.assets, []);
  assert.equal(newElement?.generationParams?.imageWeight, 3);
  assert.equal(newElement?.generationParams?.seed, 1234);
  assert.equal(nextState.selectedElementId, newElement?.id);
  assert.equal(nextState.selectedTimelineClipId, newClip?.id);
  assert.equal(newClip?.status, 'pending');
});

test('updateStoryboardElementInWorkspace edits card text and syncs timeline clip title', () => {
  const nextState = updateStoryboardElementInWorkspace(createWorkspaceState(), 'shot-1', {
    name: ' Shot_One_Edit ',
    description: ' 第一镜更新 ',
  });
  const element = nextState.storyboardElements.find((item) => item.id === 'shot-1');
  const clip = nextState.timelineTracks
    .find((track) => track.type === 'video')
    ?.clips.find((item) => item.sourceElementId === 'shot-1');

  assert.equal(element?.name, 'Shot_One_Edit');
  assert.equal(element?.description, '第一镜更新');
  assert.equal(clip?.id, 'clip-shot-1');
  assert.equal(clip?.title, 'Shot_One_Edit');
  assert.equal(nextState.selectedElementId, 'shot-1');
  assert.equal(nextState.selectedTimelineClipId, 'clip-shot-1');
});

test('reorderStoryboardElementInWorkspace reorders storyboard and syncs timeline clip order', () => {
  const nextState = reorderStoryboardElementInWorkspace(createWorkspaceState(), 'shot-2', 1);
  const videoClips = nextState.timelineTracks.find((track) => track.type === 'video')?.clips ?? [];

  assert.deepEqual(
    nextState.storyboardElements.map((element) => element.id),
    ['role-1', 'shot-2', 'shot-1'],
  );
  assert.deepEqual(
    videoClips.map((clip) => clip.sourceElementId),
    ['shot-2', 'shot-1'],
  );
  assert.equal(nextState.selectedElementId, 'shot-1');
  assert.equal(nextState.selectedTimelineClipId, 'clip-shot-1');
  assert.equal(videoClips.find((clip) => clip.sourceElementId === 'shot-1')?.start, 13);
});

test('markStoryboardElementRegeneratingInWorkspace binds params and updates timeline status', () => {
  const nextState = markStoryboardElementRegeneratingInWorkspace(
    createWorkspaceState(),
    'shot-1',
    {
      ...initialGenerationParams,
      contentWeight: 120,
      srefAssetIds: ['asset-style'],
    },
  );
  const element = nextState.storyboardElements.find((item) => item.id === 'shot-1');
  const clip = nextState.timelineTracks
    .find((track) => track.type === 'video')
    ?.clips.find((item) => item.sourceElementId === 'shot-1');

  assert.equal(element?.status, 'running');
  assert.equal(element?.progress, 12);
  assert.equal(element?.generationParams?.contentWeight, 100);
  assert.deepEqual(element?.generationParams?.srefAssetIds, ['asset-style']);
  assert.equal(clip?.status, 'running');
});

test('markStoryboardElementFailedInWorkspace stores error message and updates timeline status', () => {
  const nextState = markStoryboardElementFailedInWorkspace(
    createWorkspaceState(),
    'shot-1',
    '视频生成任务失败，请检查参考图链接是否可访问，或调整生成参数后重试。',
  );
  const element = nextState.storyboardElements.find((item) => item.id === 'shot-1');
  const clip = nextState.timelineTracks
    .find((track) => track.type === 'video')
    ?.clips.find((item) => item.sourceElementId === 'shot-1');

  assert.equal(element?.status, 'failed');
  assert.equal(element?.progress, 0);
  assert.equal(element?.errorMessage, '视频生成任务失败，请检查参考图链接是否可访问，或调整生成参数后重试。');
  assert.equal(clip?.status, 'failed');
  assert.equal(nextState.selectedElementId, 'shot-1');
});

test('applyGeneratedAssetsToWorkspace clears storyboard element failure after successful result', () => {
  const failedState = markStoryboardElementFailedInWorkspace(
    createWorkspaceState(),
    'shot-1',
    '生成任务失败，请调整参数后重试。',
  );
  const nextState = applyGeneratedAssetsToWorkspace(
    failedState,
    [
      {
        id: 'asset-task-video-success',
        name: 'Shot_One_video_success',
        type: 'video',
        status: 'completed',
        progress: 100,
        targetAssetSlot: 'shotVideo',
      },
    ],
    'shot-1',
  );
  const element = nextState.storyboardElements.find((item) => item.id === 'shot-1');

  assert.equal(element?.status, 'completed');
  assert.equal(element?.progress, 100);
  assert.equal(element?.errorMessage, undefined);
});
