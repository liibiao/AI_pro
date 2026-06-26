import type {
  ProjectSaveStatus,
  ProjectSnapshot,
  ProjectSnapshotReason,
} from '../types/project';

function padTimePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatProjectSavedAt(savedAt?: string): string {
  if (!savedAt) {
    return '';
  }

  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

export function getProjectSaveStatusLabel(
  status: ProjectSaveStatus,
  lastSavedAt?: string,
): string {
  if (status === 'saving') {
    return '保存中';
  }

  if (status === 'failed') {
    return '保存失败';
  }

  const savedAt = formatProjectSavedAt(lastSavedAt);

  if (status === 'saved' && savedAt) {
    return `已保存 ${savedAt}`;
  }

  if (status === 'saved') {
    return '已保存';
  }

  return '未保存';
}

export function getProjectSnapshotReasonLabel(reason: ProjectSnapshotReason): string {
  return reason === 'manual' ? '手动保存' : '自动保存';
}

export function sortProjectSnapshotsByVersionDesc(
  snapshots: ProjectSnapshot[],
): ProjectSnapshot[] {
  return [...snapshots].sort((a, b) => b.version - a.version);
}

export function getLatestProjectSnapshot(
  snapshots: ProjectSnapshot[],
): ProjectSnapshot | undefined {
  return sortProjectSnapshotsByVersionDesc(snapshots)[0];
}

export function getProjectLatestVersionLabel(snapshots: ProjectSnapshot[]): string {
  const latestSnapshot = getLatestProjectSnapshot(snapshots);
  return latestSnapshot ? `v${latestSnapshot.version}` : '无版本';
}
