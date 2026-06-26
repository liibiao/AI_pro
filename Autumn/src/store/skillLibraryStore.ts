import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  backendSkillCandidates,
  importedSkillLibraryItems,
} from '../mock/skillLibraryMock';
import { readStoredAuthSession } from '../services/auth/authSession';
import { listConfiguredSkillLibraryItems } from '../services/skills/skillLibraryRepository';
import { importLocalSkillFile } from '../services/skills/importLocalSkill';
import type { AgentPackage } from '../types/agentPackage';
import type { SkillLibraryItem } from '../types/skillLibrary';

const localSkillsKey = 'autumn.localSkills.v1';

interface SkillLibraryState {
  importedSkills: SkillLibraryItem[];
  enabledSkillIds: string[];
  importError: string | null;
  isLoadingBackend: boolean;
}

type SkillLibraryAction =
  | { type: 'toggleSkill'; skillId: string }
  | { type: 'importBackendSkill'; skill: SkillLibraryItem }
  | { type: 'importLocalSkill'; skill: SkillLibraryItem }
  | { type: 'setBackendSkills'; skills: SkillLibraryItem[] }
  | { type: 'setImportError'; error: string | null }
  | { type: 'setLoadingBackend'; isLoading: boolean };

function readLocalSkills(): SkillLibraryItem[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(localSkillsKey);
    return raw ? (JSON.parse(raw) as SkillLibraryItem[]) : [];
  } catch {
    return [];
  }
}

function persistLocalSkills(skills: SkillLibraryItem[]) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    localSkillsKey,
    JSON.stringify(skills.filter((skill) => skill.storageScope === 'device')),
  );
}

function createInitialState(): SkillLibraryState {
  const importedSkills = [...importedSkillLibraryItems, ...readLocalSkills()];

  return {
    importedSkills,
    enabledSkillIds: importedSkills.slice(0, 2).map((skill) => skill.id),
    importError: null,
    isLoadingBackend: false,
  };
}

function upsertSkill(skills: SkillLibraryItem[], skill: SkillLibraryItem): SkillLibraryItem[] {
  const exists = skills.some((item) => item.id === skill.id);
  return exists
    ? skills.map((item) => (item.id === skill.id ? skill : item))
    : [...skills, skill];
}

function skillLibraryReducer(
  state: SkillLibraryState,
  action: SkillLibraryAction,
): SkillLibraryState {
  switch (action.type) {
    case 'toggleSkill': {
      const enabled = state.enabledSkillIds.includes(action.skillId);
      return {
        ...state,
        enabledSkillIds: enabled
          ? state.enabledSkillIds.filter((skillId) => skillId !== action.skillId)
          : [...state.enabledSkillIds, action.skillId],
      };
    }
    case 'importBackendSkill': {
      const skill: SkillLibraryItem = {
        ...action.skill,
        syncStatus: 'synced',
      };
      return {
        ...state,
        importedSkills: upsertSkill(state.importedSkills, skill),
        enabledSkillIds: [...new Set([...state.enabledSkillIds, skill.id])],
        importError: null,
      };
    }
    case 'importLocalSkill':
      return {
        ...state,
        importedSkills: upsertSkill(state.importedSkills, action.skill),
        enabledSkillIds: [...new Set([...state.enabledSkillIds, action.skill.id])],
        importError: null,
      };
    case 'setBackendSkills': {
      const localSkills = state.importedSkills.filter((skill) => skill.storageScope === 'device');
      const importedSkills = [...action.skills, ...localSkills];

      return {
        ...state,
        importedSkills,
        enabledSkillIds:
          state.enabledSkillIds.length > 0
            ? state.enabledSkillIds.filter((skillId) =>
                importedSkills.some((skill) => skill.id === skillId),
              )
            : importedSkills.slice(0, 2).map((skill) => skill.id),
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

function dedupeSkills(skills: SkillLibraryItem[]): SkillLibraryItem[] {
  const seen = new Set<string>();

  return skills.filter((skill) => {
    if (seen.has(skill.id)) {
      return false;
    }

    seen.add(skill.id);
    return true;
  });
}

function mapPackageSkills(activePackage?: AgentPackage): SkillLibraryItem[] {
  if (!activePackage) {
    return [];
  }

  return activePackage.skills.map((skill) => ({
    id: `package-${activePackage.id}-${skill.id}`,
    name: skill.name,
    version: activePackage.version,
    description: skill.description ?? `来自 ${activePackage.name} 的内置 Skill。`,
    source: 'agentPackage',
    category: 'utility',
    storageScope: activePackage.storageScope,
    syncStatus: activePackage.syncStatus,
    updatedAt: activePackage.updatedAt,
    originPackageId: activePackage.id,
    compatibleStages: [],
  }));
}

export function useSkillLibraryStore(activePackage?: AgentPackage) {
  const [state, dispatch] = useReducer(skillLibraryReducer, undefined, createInitialState);
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const authSession = useMemo(() => readStoredAuthSession(), []);

  useEffect(() => {
    persistLocalSkills(state.importedSkills);
  }, [state.importedSkills]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'setLoadingBackend', isLoading: true });

    listConfiguredSkillLibraryItems({ authSession })
      .then((skills) => {
        if (!cancelled) {
          dispatch({ type: 'setBackendSkills', skills });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'setImportError',
            error: error instanceof Error ? error.message : '后台 Skill 库加载失败。',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession]);

  const packageSkills = useMemo(() => mapPackageSkills(activePackage), [activePackage]);

  const skills = useMemo(
    () => dedupeSkills([...packageSkills, ...state.importedSkills]),
    [packageSkills, state.importedSkills],
  );

  const enabledSkillIds = useMemo(
    () => [
      ...packageSkills.map((skill) => skill.id),
      ...state.enabledSkillIds,
    ],
    [packageSkills, state.enabledSkillIds],
  );

  return useMemo(
    () => ({
      state,
      skills,
      enabledSkillIds,
      enabledSkills: skills.filter((skill) => enabledSkillIds.includes(skill.id)),
      backendImportCandidate: backendSkillCandidates.find(
        (item) => !state.importedSkills.some((skill) => skill.id === item.id),
      ),
      isLoadingBackend: state.isLoadingBackend,
      toggleSkill: (skillId: string) => dispatch({ type: 'toggleSkill', skillId }),
      importBackendSkill: () => {
        const candidate = backendSkillCandidates.find(
          (item) => !state.importedSkills.some((skill) => skill.id === item.id),
        );
        if (candidate) {
          dispatch({ type: 'importBackendSkill', skill: candidate });
        }
      },
      importLocalSkill: async (file: File) => {
        setIsImportingLocal(true);
        try {
          const skill = await importLocalSkillFile(file);
          dispatch({ type: 'importLocalSkill', skill });
        } catch (error) {
          dispatch({
            type: 'setImportError',
            error: error instanceof Error ? error.message : '本地 Skill 导入失败。',
          });
        } finally {
          setIsImportingLocal(false);
        }
      },
      isImportingLocal,
    }),
    [enabledSkillIds, isImportingLocal, skills, state],
  );
}
