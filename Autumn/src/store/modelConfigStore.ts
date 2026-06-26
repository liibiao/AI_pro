import { useEffect, useMemo, useReducer } from 'react';
import { fallbackModelOptions } from '../mock/modelConfigMock';
import { readStoredAuthSession } from '../services/auth/authSession';
import { listConfiguredModelOptions } from '../services/model-configs/modelConfigRepository';
import type { ModelConfigOption } from '../types/modelConfig';
import type { AuthSession } from '../types/user';

interface ModelConfigState {
  error: string | null;
  isLoading: boolean;
  models: ModelConfigOption[];
}

type ModelConfigAction =
  | { type: 'setError'; error: string | null }
  | { type: 'setLoading'; isLoading: boolean }
  | { type: 'setModels'; models: ModelConfigOption[] };

function modelConfigReducer(
  state: ModelConfigState,
  action: ModelConfigAction,
): ModelConfigState {
  switch (action.type) {
    case 'setError':
      return { ...state, error: action.error, isLoading: false };
    case 'setLoading':
      return { ...state, isLoading: action.isLoading };
    case 'setModels':
      return {
        ...state,
        error: null,
        isLoading: false,
        models: action.models,
      };
    default:
      return state;
  }
}

export function useModelConfigStore(authSessionOverride?: AuthSession) {
  const [state, dispatch] = useReducer(modelConfigReducer, {
    error: null,
    isLoading: false,
    models: fallbackModelOptions,
  });
  const storedAuthSession = useMemo(() => readStoredAuthSession(), []);
  const authSession = authSessionOverride ?? storedAuthSession;

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'setLoading', isLoading: true });

    listConfiguredModelOptions({ authSession })
      .then((models) => {
        if (!cancelled) {
          dispatch({ type: 'setModels', models });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'setError',
            error: error instanceof Error ? error.message : '模型配置加载失败。',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession]);

  return useMemo(
    () => ({
      error: state.error,
      isLoading: state.isLoading,
      models: state.models,
      state,
    }),
    [state],
  );
}
