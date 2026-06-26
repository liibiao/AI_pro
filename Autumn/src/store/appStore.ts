import { useCallback, useMemo, useReducer } from 'react';
import { createMockProject } from '../services/projects/mockProjectRepository';
import type { ThemeMode } from '../types/pipeline';
import type { ProjectListItem } from '../types/project';

type AppView = 'home' | 'editor';

interface AppState {
  view: AppView;
  theme: ThemeMode;
  projects: ProjectListItem[];
  isLoadingProjects: boolean;
  projectError: string | null;
  selectedProject: ProjectListItem | null;
}

type AppAction =
  | { type: 'openHome' }
  | { type: 'createProjectCompleted'; project: ProjectListItem }
  | { type: 'openProjectCompleted'; project: ProjectListItem }
  | { type: 'setProjects'; projects: ProjectListItem[] }
  | { type: 'setProjectError'; error: string | null }
  | { type: 'setProjectLoading'; isLoading: boolean }
  | { type: 'setTheme'; theme: ThemeMode };

function shouldOpenEditorFromUrl() {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).has('stage');
}

function createInitialState(): AppState {
  return shouldOpenEditorFromUrl()
    ? {
        view: 'editor',
        theme: 'dark',
        projects: [],
        isLoadingProjects: false,
        projectError: null,
        selectedProject: null,
      }
    : {
        view: 'home',
        theme: 'dark',
        projects: [],
        isLoadingProjects: false,
        projectError: null,
        selectedProject: null,
      };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'openHome':
      return { ...state, view: 'home' };
    case 'createProjectCompleted': {
      return {
        ...state,
        view: 'editor',
        projects: [action.project, ...state.projects],
        selectedProject: action.project,
        projectError: null,
      };
    }
    case 'openProjectCompleted':
      return {
        ...state,
        view: 'editor',
        selectedProject: action.project,
        projectError: null,
      };
    case 'setProjects':
      return {
        ...state,
        projects: action.projects,
        isLoadingProjects: false,
        selectedProject:
          state.view === 'editor' && !state.selectedProject
            ? action.projects[0] ?? null
            : state.selectedProject,
      };
    case 'setProjectError':
      return { ...state, isLoadingProjects: false, projectError: action.error };
    case 'setProjectLoading':
      return { ...state, isLoadingProjects: action.isLoading };
    case 'setTheme':
      return { ...state, theme: action.theme };
    default:
      return state;
  }
}

export function useAppStore() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);

  const createProject = useCallback(async () => {
    const project = createMockProject({});
    dispatch({ type: 'createProjectCompleted', project });
  }, []);

  const openProject = useCallback(
    async (project: ProjectListItem) => {
      dispatch({ type: 'openProjectCompleted', project });
    },
    [],
  );

  return useMemo(
    () => ({
      state,
      dispatch,
      projects: state.projects,
      createProject,
      openHome: () => dispatch({ type: 'openHome' }),
      openProject,
      setTheme: (theme: ThemeMode) => dispatch({ type: 'setTheme', theme }),
    }),
    [createProject, openProject, state],
  );
}
