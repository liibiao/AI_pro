import { useCallback, useEffect, useState } from 'react';
import type {
  ProjectSaveStatus,
  ProjectSnapshot,
  ProjectSnapshotPayload,
  ProjectSnapshotReason,
} from '../../types/project';
import {
  listConfiguredProjectSnapshots,
  saveConfiguredProjectSnapshot,
} from './projectSnapshotRepository';

const defaultAutosaveDelayMs = 30_000;

interface ProjectAutosaveStateData {
  status: ProjectSaveStatus;
  lastSavedAt?: string;
  error: string | null;
  snapshots: ProjectSnapshot[];
  isLoadingSnapshots: boolean;
}

export interface ProjectAutosaveState extends ProjectAutosaveStateData {
  saveNow: () => Promise<ProjectSnapshot | null>;
  reloadSnapshots: () => Promise<ProjectSnapshot[]>;
}

interface UseProjectAutosaveOptions {
  projectId?: string | null;
  payload: ProjectSnapshotPayload;
  enabled?: boolean;
  delayMs?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Project autosave failed';
}

export function useProjectAutosave({
  projectId,
  payload,
  enabled = true,
  delayMs = defaultAutosaveDelayMs,
}: UseProjectAutosaveOptions): ProjectAutosaveState {
  const [autosaveState, setAutosaveState] = useState<ProjectAutosaveStateData>({
    status: 'idle',
    error: null,
    snapshots: [],
    isLoadingSnapshots: false,
  });

  const reloadSnapshots = useCallback(async () => {
    if (!enabled || !projectId) {
      setAutosaveState((current) => ({
        ...current,
        status: 'idle',
        lastSavedAt: undefined,
        error: null,
        snapshots: [],
        isLoadingSnapshots: false,
      }));
      return [];
    }

    setAutosaveState((current) => ({
      ...current,
      isLoadingSnapshots: true,
    }));

    try {
      const snapshots = await listConfiguredProjectSnapshots(projectId);
      const latestSnapshot = snapshots.reduce<ProjectSnapshot | undefined>(
        (latest, snapshot) => (!latest || snapshot.version > latest.version ? snapshot : latest),
        undefined,
      );

      setAutosaveState((current) => ({
        ...current,
        status: current.status === 'idle' && latestSnapshot ? 'saved' : current.status,
        lastSavedAt: current.lastSavedAt ?? latestSnapshot?.savedAt,
        error: null,
        snapshots,
        isLoadingSnapshots: false,
      }));

      return snapshots;
    } catch (error) {
      setAutosaveState((current) => ({
        ...current,
        error: getErrorMessage(error),
        isLoadingSnapshots: false,
      }));
      return [];
    }
  }, [enabled, projectId]);

  const saveSnapshot = useCallback(
    async (reason: ProjectSnapshotReason, shouldCommit: () => boolean = () => true) => {
      if (!enabled || !projectId) {
        return null;
      }

      if (shouldCommit()) {
        setAutosaveState((current) => ({
          ...current,
          status: 'saving',
          error: null,
        }));
      }

      try {
        const snapshot = await saveConfiguredProjectSnapshot(projectId, {
          reason,
          payload,
        });

        if (shouldCommit()) {
          setAutosaveState((current) => ({
            ...current,
            status: 'saved',
            lastSavedAt: snapshot.savedAt,
            error: null,
            snapshots: [...current.snapshots.filter((item) => item.id !== snapshot.id), snapshot],
          }));
        }

        return snapshot;
      } catch (error) {
        if (shouldCommit()) {
          setAutosaveState((current) => ({
            ...current,
            status: 'failed',
            error: getErrorMessage(error),
          }));
        }
        return null;
      }
    },
    [enabled, payload, projectId],
  );

  const saveNow = useCallback(() => saveSnapshot('manual'), [saveSnapshot]);

  useEffect(() => {
    void reloadSnapshots();
  }, [reloadSnapshots]);

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      await saveSnapshot('autosave', () => !cancelled);
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, enabled, projectId, saveSnapshot]);

  return {
    ...autosaveState,
    reloadSnapshots,
    saveNow,
  };
}
