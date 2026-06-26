import { useEffect, useMemo, useReducer } from 'react';
import {
  anonymousSession,
  persistAuthSession,
  readStoredAuthSession,
} from '../services/auth/authSession';
import { loadConfiguredUserProfile } from '../services/auth/authRepository';
import type { AuthSession, UserProfile } from '../types/user';

interface UserState {
  isLoadingProfile: boolean;
  profile: UserProfile | null;
  profileError: string | null;
  session: AuthSession;
}

type UserAction =
  | { type: 'setSession'; session: AuthSession }
  | { type: 'setProfile'; profile: UserProfile | null }
  | { type: 'setProfileError'; error: string | null }
  | { type: 'setProfileLoading'; isLoading: boolean }
  | { type: 'signOut' };

function createInitialState(): UserState {
  return {
    isLoadingProfile: false,
    profile: null,
    profileError: null,
    session: readStoredAuthSession(),
  };
}

function userReducer(state: UserState, action: UserAction): UserState {
  switch (action.type) {
    case 'setSession':
      return { ...state, profileError: null, session: action.session };
    case 'setProfile':
      return {
        ...state,
        isLoadingProfile: false,
        profile: action.profile,
        profileError: null,
      };
    case 'setProfileError':
      return {
        ...state,
        isLoadingProfile: false,
        profileError: action.error,
      };
    case 'setProfileLoading':
      return { ...state, isLoadingProfile: action.isLoading };
    case 'signOut':
      return {
        ...state,
        isLoadingProfile: false,
        profile: null,
        profileError: null,
        session: anonymousSession,
      };
    default:
      return state;
  }
}

export function useUserStore() {
  const [state, dispatch] = useReducer(userReducer, undefined, createInitialState);

  useEffect(() => {
    persistAuthSession(state.session);
  }, [state.session]);

  useEffect(() => {
    let cancelled = false;

    if (state.session.status !== 'authenticated') {
      dispatch({ type: 'setProfile', profile: null });
      return () => {
        cancelled = true;
      };
    }

    dispatch({ type: 'setProfileLoading', isLoading: true });

    loadConfiguredUserProfile(state.session)
      .then((profile) => {
        if (!cancelled) {
          dispatch({ type: 'setProfile', profile });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          dispatch({
            type: 'setProfileError',
            error: error instanceof Error ? error.message : '用户资料加载失败。',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state.session]);

  return useMemo(
    () => ({
      state,
      session: state.session,
      profile: state.profile,
      isLoadingProfile: state.isLoadingProfile,
      profileError: state.profileError,
      isAuthenticated: state.session.status === 'authenticated',
      setSession: (session: AuthSession) => dispatch({ type: 'setSession', session }),
      signOut: () => dispatch({ type: 'signOut' }),
    }),
    [state],
  );
}
