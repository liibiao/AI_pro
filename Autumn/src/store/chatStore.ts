import { useMemo, useReducer } from 'react';
import type { ChatComposerState, ComposerModelTab, ComposerOverlay } from '../types/chat';

type ChatStoreAction =
  | { type: 'setDraft'; draft: string }
  | { type: 'submitDraft' }
  | { type: 'toggleOverlay'; overlay: Exclude<ComposerOverlay, null> }
  | { type: 'closeOverlay' }
  | { type: 'setModelTab'; modelTab: ComposerModelTab }
  | { type: 'selectAsset'; assetId: string | null };

export const initialChatComposerState: ChatComposerState = {
  draft: '',
  activeOverlay: null,
  modelTab: '视频模型',
  selectedAssetId: null,
  submittedPrompts: [],
};

export function chatReducer(
  state: ChatComposerState,
  action: ChatStoreAction,
): ChatComposerState {
  switch (action.type) {
    case 'setDraft':
      return { ...state, draft: action.draft };
    case 'submitDraft': {
      const prompt = state.draft.trim();

      return {
        ...state,
        draft: '',
        activeOverlay: null,
        submittedPrompts: prompt ? [...state.submittedPrompts, prompt] : state.submittedPrompts,
      };
    }
    case 'toggleOverlay':
      return {
        ...state,
        activeOverlay: state.activeOverlay === action.overlay ? null : action.overlay,
      };
    case 'closeOverlay':
      return { ...state, activeOverlay: null };
    case 'setModelTab':
      return { ...state, modelTab: action.modelTab };
    case 'selectAsset':
      return { ...state, selectedAssetId: action.assetId };
    default:
      return state;
  }
}

export function useChatStore() {
  const [state, dispatch] = useReducer(chatReducer, initialChatComposerState);

  return useMemo(
    () => ({
      state,
      setDraft: (draft: string) => dispatch({ type: 'setDraft', draft }),
      submitDraft: () => dispatch({ type: 'submitDraft' }),
      toggleOverlay: (overlay: Exclude<ComposerOverlay, null>) =>
        dispatch({ type: 'toggleOverlay', overlay }),
      closeOverlay: () => dispatch({ type: 'closeOverlay' }),
      setModelTab: (modelTab: ComposerModelTab) => dispatch({ type: 'setModelTab', modelTab }),
      selectAsset: (assetId: string | null) => dispatch({ type: 'selectAsset', assetId }),
    }),
    [state],
  );
}
