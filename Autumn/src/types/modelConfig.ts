import type { ComposerModelTab } from './chat';

export type ModelConfigKind = 'image' | 'video' | 'audio' | 'voice' | 'llm';

export interface ModelConfigOption {
  adapter?: string;
  badges: string[];
  description: string;
  endpointPath?: string;
  featured?: boolean;
  id: string;
  kind: ModelConfigKind;
  name: string;
  providerKey?: string;
  tab: ComposerModelTab;
}
