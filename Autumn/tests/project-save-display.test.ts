import assert from 'node:assert/strict';
import {
  formatProjectSavedAt,
  getLatestProjectSnapshot,
  getProjectLatestVersionLabel,
  getProjectSaveStatusLabel,
  getProjectSnapshotReasonLabel,
  sortProjectSnapshotsByVersionDesc,
} from '../src/utils/projectSaveDisplay';
import type { ProjectSnapshot } from '../src/types/project';

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

function createSnapshot(version: number, reason: ProjectSnapshot['reason']): ProjectSnapshot {
  return {
    id: `snapshot-${version}`,
    projectId: 'project-save-display',
    version,
    reason,
    savedAt: new Date(2026, 5, 17, 9, version).toISOString(),
    payload: {
      projectTitle: '保存展示',
      stage: 'storyboard_ready',
      chatFlowState: 'scriptConfirm',
      workspaceState: 'storyboardOverview',
      storyboardElements: [],
      timelineTracks: [],
      assets: [],
      documents: [],
      creditBalance: 2581,
    },
  };
}

await test('project save display helpers format status labels', () => {
  const savedAt = new Date(2026, 5, 17, 9, 5).toISOString();
  const savedAtDate = new Date(savedAt);
  const expectedTime = `${String(savedAtDate.getHours()).padStart(2, '0')}:${String(
    savedAtDate.getMinutes(),
  ).padStart(2, '0')}`;

  assert.equal(formatProjectSavedAt(savedAt), expectedTime);
  assert.equal(getProjectSaveStatusLabel('idle'), '未保存');
  assert.equal(getProjectSaveStatusLabel('saving'), '保存中');
  assert.equal(getProjectSaveStatusLabel('failed'), '保存失败');
  assert.equal(getProjectSaveStatusLabel('saved', savedAt), `已保存 ${expectedTime}`);
});

await test('project save display helpers sort and label snapshots', () => {
  const snapshots = [createSnapshot(2, 'autosave'), createSnapshot(4, 'manual'), createSnapshot(3, 'autosave')];
  const sortedSnapshots = sortProjectSnapshotsByVersionDesc(snapshots);

  assert.deepEqual(sortedSnapshots.map((snapshot) => snapshot.version), [4, 3, 2]);
  assert.equal(getLatestProjectSnapshot(snapshots)?.version, 4);
  assert.equal(getProjectLatestVersionLabel(snapshots), 'v4');
  assert.equal(getProjectLatestVersionLabel([]), '无版本');
  assert.equal(getProjectSnapshotReasonLabel('manual'), '手动保存');
  assert.equal(getProjectSnapshotReasonLabel('autosave'), '自动保存');
});
