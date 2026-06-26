import assert from 'node:assert/strict';
import {
  createProjectSnapshotPayload,
  mapProjectSnapshotDto,
  mapProjectSnapshotPayloadDto,
  mapProjectSnapshotPayloadToDto,
} from '../src/adapters/projects/mapProjectSnapshot';
import {
  clearMockProjectSnapshots,
  listConfiguredProjectSnapshots,
  saveConfiguredProjectSnapshot,
} from '../src/services/projects/projectSnapshotRepository';
import { getLatestProjectSnapshot } from '../src/services/projects/useProjectSnapshotRestore';
import type { ProjectSnapshot, ProjectSnapshotPayload } from '../src/types/project';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

function createSamplePayload(): ProjectSnapshotPayload {
  return {
    projectTitle: 'Snapshot 测试',
    stage: 'storyboard_ready',
    chatFlowState: 'scriptConfirm',
    workspaceState: 'storyboardOverview',
    storyboardElements: [
      {
        id: 'shot-1',
        name: '镜头 1',
        type: 'shot',
        description: '开场镜头',
        status: 'completed',
        assets: [
          {
            id: 'asset-1',
            name: '角色图',
            type: 'image',
            status: 'completed',
            thumbnail: '/asset.png',
          },
        ],
      },
    ],
    timelineTracks: [
      {
        id: 'track-1',
        title: '主视频',
        type: 'video',
        clips: [
          {
            id: 'clip-1',
            title: '开场',
            start: 0,
            duration: 4,
            status: 'completed',
            sourceElementId: 'shot-1',
          },
        ],
      },
    ],
    assets: [
      {
        id: 'asset-2',
        name: '配乐',
        type: 'audio',
        status: 'running',
        duration: '00:12',
      },
    ],
    documents: [
      {
        id: 'doc-1',
        title: '脚本',
        active: true,
        body: ['第一页', '第二页'],
      },
    ],
    creditBalance: 2581,
  };
}

await test('createProjectSnapshotPayload clones persisted editor state without transient UI fields', () => {
  const payload = createSamplePayload();
  const inputWithTransientState = {
    ...payload,
    openPanels: ['media'],
    selectedElementId: 'shot-1',
    selectedTimelineClipId: 'clip-1',
  } as ProjectSnapshotPayload & Record<string, unknown>;

  const snapshotPayload = createProjectSnapshotPayload(inputWithTransientState);

  assert.equal('openPanels' in snapshotPayload, false);
  assert.equal('selectedElementId' in snapshotPayload, false);
  assert.equal('selectedTimelineClipId' in snapshotPayload, false);
  assert.notEqual(snapshotPayload.storyboardElements, payload.storyboardElements);
  assert.notEqual(snapshotPayload.storyboardElements[0]?.assets, payload.storyboardElements[0]?.assets);
  assert.notEqual(snapshotPayload.timelineTracks[0]?.clips, payload.timelineTracks[0]?.clips);
  assert.notEqual(snapshotPayload.documents[0]?.body, payload.documents[0]?.body);

  payload.storyboardElements[0]!.assets[0]!.name = '被外部修改';
  payload.timelineTracks[0]!.clips[0]!.title = '被外部修改';
  payload.documents[0]!.body[0] = '被外部修改';

  assert.equal(snapshotPayload.storyboardElements[0]?.assets[0]?.name, '角色图');
  assert.equal(snapshotPayload.timelineTracks[0]?.clips[0]?.title, '开场');
  assert.equal(snapshotPayload.documents[0]?.body[0], '第一页');
});

await test('project snapshot dto mapper roundtrips payload fields', () => {
  const payload = createSamplePayload();
  const dto = mapProjectSnapshotPayloadToDto(payload);
  const mappedPayload = mapProjectSnapshotPayloadDto(dto);
  const snapshot = mapProjectSnapshotDto({
    snapshot_id: 'snapshot-api-1',
    project_id: 'project-api-1',
    version: 7,
    reason: 'manual',
    saved_at: '2026-06-17T01:00:00.000Z',
    payload: dto,
  });

  assert.equal(dto.project_title, 'Snapshot 测试');
  assert.equal(dto.chat_flow_state, 'scriptConfirm');
  assert.equal(dto.workspace_state, 'storyboardOverview');
  assert.deepEqual(mappedPayload, payload);
  assert.equal(snapshot.id, 'snapshot-api-1');
  assert.equal(snapshot.projectId, 'project-api-1');
  assert.equal(snapshot.version, 7);
  assert.equal(snapshot.reason, 'manual');
  assert.deepEqual(snapshot.payload, payload);
});

await test('mock project snapshot repository appends versioned snapshots', async () => {
  const projectId = 'project-snapshot-test';
  const originalDateNow = Date.now;

  clearMockProjectSnapshots(projectId);
  Date.now = () => 1771333333333;

  try {
    const first = await saveConfiguredProjectSnapshot(projectId, {
      reason: 'autosave',
      payload: createSamplePayload(),
    });
    Date.now = () => 1771333334444;
    const second = await saveConfiguredProjectSnapshot(projectId, {
      reason: 'manual',
      payload: {
        ...createSamplePayload(),
        projectTitle: '第二版',
      },
    });
    const snapshots = await listConfiguredProjectSnapshots(projectId);

    assert.equal(first.id, 'snapshot-project-snapshot-test-1-1771333333333');
    assert.equal(first.version, 1);
    assert.equal(first.reason, 'autosave');
    assert.equal(second.id, 'snapshot-project-snapshot-test-2-1771333334444');
    assert.equal(second.version, 2);
    assert.equal(second.reason, 'manual');
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0]?.payload.projectTitle, 'Snapshot 测试');
    assert.equal(snapshots[1]?.payload.projectTitle, '第二版');

    first.payload.assets[0]!.name = '外部污染';
    const freshSnapshots = await listConfiguredProjectSnapshots(projectId);
    assert.equal(freshSnapshots[0]?.payload.assets[0]?.name, '配乐');
  } finally {
    Date.now = originalDateNow;
    clearMockProjectSnapshots(projectId);
  }
});

await test('getLatestProjectSnapshot returns highest version snapshot', () => {
  const snapshots: ProjectSnapshot[] = [
    {
      id: 'snapshot-v2',
      projectId: 'project-1',
      version: 2,
      reason: 'autosave',
      savedAt: '2026-06-17T01:00:00.000Z',
      payload: createSamplePayload(),
    },
    {
      id: 'snapshot-v5',
      projectId: 'project-1',
      version: 5,
      reason: 'manual',
      savedAt: '2026-06-17T01:10:00.000Z',
      payload: {
        ...createSamplePayload(),
        projectTitle: '第五版',
      },
    },
    {
      id: 'snapshot-v3',
      projectId: 'project-1',
      version: 3,
      reason: 'autosave',
      savedAt: '2026-06-17T01:05:00.000Z',
      payload: createSamplePayload(),
    },
  ];

  const latestSnapshot = getLatestProjectSnapshot(snapshots);

  assert.equal(latestSnapshot?.id, 'snapshot-v5');
  assert.equal(latestSnapshot?.payload.projectTitle, '第五版');
  assert.equal(getLatestProjectSnapshot([]), undefined);
});
