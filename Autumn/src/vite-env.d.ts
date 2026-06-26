/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_PACKAGE_API_BASE?: string;
  readonly VITE_AGENT_PACKAGE_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_ASSET_API_BASE?: string;
  readonly VITE_ASSET_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_AUTH_API_BASE?: string;
  readonly VITE_AUTH_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_GENERATION_TASK_API_BASE?: string;
  readonly VITE_GENERATION_TASK_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_LLM_CHAT_API_BASE?: string;
  readonly VITE_MODEL_CONFIG_API_BASE?: string;
  readonly VITE_MODEL_CONFIG_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_PLATFORM_API_BASE?: string;
  readonly VITE_PIPELINE_API_BASE?: string;
  readonly VITE_PIPELINE_SOCKET_BASE?: string;
  readonly VITE_PROJECT_EXPORT_SOCKET_BASE?: string;
  readonly VITE_PROJECT_API_BASE?: string;
  readonly VITE_PROJECT_DATA_SOURCE?: 'mock' | 'api';
  readonly VITE_SKILL_LIBRARY_API_BASE?: string;
  readonly VITE_SKILL_LIBRARY_DATA_SOURCE?: 'mock' | 'api';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
