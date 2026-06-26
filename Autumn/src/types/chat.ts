export type ComposerOverlay = 'model' | 'skill' | 'asset' | null;

export type ComposerModelTab = '图片模型' | '视频模型' | '音频模型' | '配音模型' | '大语言模型';

export interface ChatComposerState {
  draft: string;
  activeOverlay: ComposerOverlay;
  modelTab: ComposerModelTab;
  selectedAssetId: string | null;
  submittedPrompts: string[];
}
