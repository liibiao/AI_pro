import {
  mapProjectSnapshotDto,
  mapProjectSnapshotPayloadToDto,
  createProjectSnapshotPayload,
} from '../../adapters/projects/mapProjectSnapshot';
import {
  listProjectSnapshots,
  saveProjectSnapshot,
} from '../../api/projects/projectApi';
import { getProjectDataSource } from '../../config/projectRuntime';
import type {
  ProjectSnapshot,
  ProjectSnapshotPayload,
  ProjectSnapshotReason,
} from '../../types/project';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

const snapshotStorageKey = 'autumn.projectSnapshots.v1';

type SnapshotStore = Record<string, ProjectSnapshot[]>;

interface SaveProjectSnapshotInput {
  reason: ProjectSnapshotReason;
  payload: ProjectSnapshotPayload;
}

export interface ProjectSnapshotRepositoryContext {
  authSession?: AuthSession;
}

let memorySnapshotStore: SnapshotStore = {};

function getAuthHeaders(context: ProjectSnapshotRepositoryContext): Record<string, string> {
  return context.authSession ? createAuthHeaders(context.authSession) : {};
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readSnapshotStore(): SnapshotStore {
  if (!hasLocalStorage()) {
    return memorySnapshotStore;
  }

  try {
    const raw = localStorage.getItem(snapshotStorageKey);
    return raw ? (JSON.parse(raw) as SnapshotStore) : {};
  } catch {
    return {};
  }
}

function writeSnapshotStore(store: SnapshotStore) {
  if (!hasLocalStorage()) {
    memorySnapshotStore = store;
    return;
  }

  localStorage.setItem(snapshotStorageKey, JSON.stringify(store));
}

function cloneProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    payload: createProjectSnapshotPayload(snapshot.payload),
  };
}

export function clearMockProjectSnapshots(projectId?: string) {
  if (!projectId) {
    writeSnapshotStore({});
    return;
  }

  const store = { ...readSnapshotStore() };
  delete store[projectId];
  writeSnapshotStore(store);
}

export function listMockProjectSnapshots(projectId: string): ProjectSnapshot[] {
  const store = readSnapshotStore();
  return (store[projectId] ?? []).map(cloneProjectSnapshot);
}

export function saveMockProjectSnapshot(
  projectId: string,
  input: SaveProjectSnapshotInput,
): ProjectSnapshot {
  const store = readSnapshotStore();
  const existingSnapshots = store[projectId] ?? [];
  const version = existingSnapshots.length + 1;
  const savedAt = new Date().toISOString();
  const snapshot: ProjectSnapshot = {
    id: `snapshot-${projectId}-${version}-${Date.now()}`,
    projectId,
    version,
    reason: input.reason,
    savedAt,
    payload: createProjectSnapshotPayload(input.payload),
  };

  writeSnapshotStore({
    ...store,
    [projectId]: [...existingSnapshots, snapshot],
  });

  return cloneProjectSnapshot(snapshot);
}

export async function saveConfiguredProjectSnapshot(
  projectId: string,
  input: SaveProjectSnapshotInput,
  context: ProjectSnapshotRepositoryContext = {},
): Promise<ProjectSnapshot> {
  if (getProjectDataSource() === 'api') {
    const snapshot = await saveProjectSnapshot(
      projectId,
      {
        reason: input.reason,
        payload: mapProjectSnapshotPayloadToDto(input.payload),
      },
      { authHeaders: getAuthHeaders(context) },
    );

    return mapProjectSnapshotDto(snapshot);
  }

  return saveMockProjectSnapshot(projectId, input);
}

export async function listConfiguredProjectSnapshots(
  projectId: string,
  context: ProjectSnapshotRepositoryContext = {},
): Promise<ProjectSnapshot[]> {
  if (getProjectDataSource() === 'api') {
    const snapshots = await listProjectSnapshots(projectId, {
      authHeaders: getAuthHeaders(context),
    });

    return snapshots.map(mapProjectSnapshotDto);
  }

  return listMockProjectSnapshots(projectId);
}
