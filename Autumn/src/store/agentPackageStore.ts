import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  backendAgentPackageCandidates,
  importedAgentPackages,
} from '../mock/agentPackageMock';
import { readStoredAuthSession } from '../services/auth/authSession';
import { listConfiguredAgentPackages } from '../services/agent-packages/agentPackageRepository';
import { importLocalAgentPackageFile } from '../services/agent-packages/importLocalAgentPackage';
import type { AgentPackage } from '../types/agentPackage';

const localPackagesKey = 'autumn.localAgentPackages.v1';

interface AgentPackageState {
  packages: AgentPackage[];
  activePackageId: string;
  importError: string | null;
  isLoadingBackend: boolean;
}

type AgentPackageAction =
  | { type: 'switchPackage'; packageId: string }
  | { type: 'importBackendPackage'; agentPackage: AgentPackage }
  | { type: 'importLocalPackage'; agentPackage: AgentPackage }
  | { type: 'setBackendPackages'; packages: AgentPackage[] }
  | { type: 'setImportError'; error: string | null }
  | { type: 'setLoadingBackend'; isLoading: boolean };

function readLocalPackages(): AgentPackage[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(localPackagesKey);
    return raw ? (JSON.parse(raw) as AgentPackage[]) : [];
  } catch {
    return [];
  }
}

function persistLocalPackages(packages: AgentPackage[]) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    localPackagesKey,
    JSON.stringify(packages.filter((item) => item.storageScope === 'device')),
  );
}

function createInitialState(): AgentPackageState {
  const packages = [...importedAgentPackages, ...readLocalPackages()];

  return {
    packages,
    activePackageId: packages[0]?.id ?? '',
    importError: null,
    isLoadingBackend: false,
  };
}

function upsertPackage(packages: AgentPackage[], agentPackage: AgentPackage): AgentPackage[] {
  const exists = packages.some((item) => item.id === agentPackage.id);
  return exists
    ? packages.map((item) => (item.id === agentPackage.id ? agentPackage : item))
    : [...packages, agentPackage];
}

function agentPackageReducer(
  state: AgentPackageState,
  action: AgentPackageAction,
): AgentPackageState {
  switch (action.type) {
    case 'switchPackage':
      return { ...state, activePackageId: action.packageId };
    case 'importBackendPackage': {
      const importedPackage: AgentPackage = {
        ...action.agentPackage,
        syncStatus: 'synced',
        importedAt: new Date().toISOString(),
      };
      return {
        ...state,
        packages: upsertPackage(state.packages, importedPackage),
        activePackageId: importedPackage.id,
        importError: null,
      };
    }
    case 'importLocalPackage':
      return {
        ...state,
        packages: upsertPackage(state.packages, action.agentPackage),
        activePackageId: action.agentPackage.id,
        importError: null,
      };
    case 'setBackendPackages': {
      const localPackages = state.packages.filter((item) => item.storageScope === 'device');
      const packages = [...action.packages, ...localPackages];

      return {
        ...state,
        packages,
        activePackageId:
          packages.find((item) => item.syncStatus === 'synced')?.id ||
          (packages.some((item) => item.id === state.activePackageId)
            ? state.activePackageId
            : packages[0]?.id ?? ''),
        importError: null,
        isLoadingBackend: false,
      };
    }
    case 'setImportError':
      return { ...state, importError: action.error, isLoadingBackend: false };
    case 'setLoadingBackend':
      return { ...state, isLoadingBackend: action.isLoading };
    default:
      return state;
  }
}

export function useAgentPackageStore() {
  const [state, dispatch] = useReducer(agentPackageReducer, undefined, createInitialState);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const authSession = useMemo(() => readStoredAuthSession(), []);

  useEffect(() => {
    persistLocalPackages(state.packages);
  }, [state.packages]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'setLoadingBackend', isLoading: true });

    listConfiguredAgentPackages({ authSession })
      .then((packages) => {
        if (!cancelled) {
          dispatch({ type: 'setBackendPackages', packages });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'setImportError',
            error: error instanceof Error ? error.message : '后台 Agent 数据包加载失败。',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession]);

  const activePackage =
    state.packages.find((item) => item.id === state.activePackageId) ?? state.packages[0];

  return useMemo(
    () => ({
      state,
      activePackage,
      backendImportCandidate: backendAgentPackageCandidates.find(
        (item) => !state.packages.some((agentPackage) => agentPackage.id === item.id),
      ),
      isLoadingBackend: state.isLoadingBackend,
      switchPackage: (packageId: string) => dispatch({ type: 'switchPackage', packageId }),
      importBackendPackage: () => {
        const candidate = backendAgentPackageCandidates.find(
          (item) => !state.packages.some((agentPackage) => agentPackage.id === item.id),
        );
        if (candidate) {
          dispatch({ type: 'importBackendPackage', agentPackage: candidate });
        }
      },
      importLocalPackage: async (file: File) => {
        setIsImportingLocal(true);
        try {
          const agentPackage = await importLocalAgentPackageFile(file);
          dispatch({ type: 'importLocalPackage', agentPackage });
        } catch (error) {
          dispatch({
            type: 'setImportError',
            error: error instanceof Error ? error.message : '本地 Agent 数据包导入失败。',
          });
        } finally {
          setIsImportingLocal(false);
        }
      },
      isImportingLocal,
    }),
    [activePackage, isImportingLocal, state],
  );
}
