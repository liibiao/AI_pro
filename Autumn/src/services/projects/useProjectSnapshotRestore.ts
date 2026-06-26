import { useEffect, useState } from 'react';
import type { ProjectSnapshot, ProjectSnapshotPayload } from '../../types/project';
import { listConfiguredProjectSnapshots } from './projectSnapshotRepository';

interface ProjectSnapshotRestoreState {
  isRestoring: boolean;
  restoredSnapshot?: ProjectSnapshot;
  error: string | null;
}

interface UseProjectSnapshotRestoreOptions {
  projectId?: string | null;
  enabled?: boolean;
  initialSnapshot?: ProjectSnapshot;
  onRestore: (payload: ProjectSnapshotPayload) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Project snapshot restore failed';
}

export function getLatestProjectSnapshot(
  snapshots: ProjectSnapshot[],
): ProjectSnapshot | undefined {
  return snapshots.reduce<ProjectSnapshot | undefined>(
    (latest, snapshot) => (!latest || snapshot.version > latest.version ? snapshot : latest),
    undefined,
  );
}

export function useProjectSnapshotRestore({
  projectId,
  enabled = true,
  initialSnapshot,
  onRestore,
}: UseProjectSnapshotRestoreOptions): ProjectSnapshotRestoreState {
  const [restoreState, setRestoreState] = useState<ProjectSnapshotRestoreState>({
    isRestoring: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !projectId) {
      setRestoreState({
        isRestoring: false,
        restoredSnapshot: undefined,
        error: null,
      });
      return;
    }

    if (initialSnapshot && initialSnapshot.projectId === projectId) {
      onRestore(initialSnapshot.payload);
      setRestoreState({
        isRestoring: false,
        restoredSnapshot: initialSnapshot,
        error: null,
      });
      return;
    }

    let cancelled = false;

    setRestoreState((current) => ({
      ...current,
      isRestoring: true,
      error: null,
    }));

    listConfiguredProjectSnapshots(projectId)
      .then((snapshots) => {
        if (cancelled) {
          return;
        }

        const latestSnapshot = getLatestProjectSnapshot(snapshots);

        if (latestSnapshot) {
          onRestore(latestSnapshot.payload);
        }

        setRestoreState({
          isRestoring: false,
          restoredSnapshot: latestSnapshot,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setRestoreState({
          isRestoring: false,
          restoredSnapshot: undefined,
          error: getErrorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, initialSnapshot, onRestore, projectId]);

  return restoreState;
}
