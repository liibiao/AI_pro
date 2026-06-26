export type TextAgentMode = 'default' | 'script' | 'reverse' | 'parse' | 'optimize';

export type TextAgentOutputType = 'text' | 'script' | 'prompt' | 'storyboard';

export interface CreateTextAgentRunRequestDto {
  agentPackId?: string;
  extra?: Record<string, unknown>;
  files?: unknown[];
  images?: unknown[];
  inputText: string;
  maxOutputTokens?: number;
  maxTokens?: number;
  mode: TextAgentMode;
  modelKey?: string;
  outputContract?: string;
  outputType: TextAgentOutputType;
  queryTimeoutMs?: number;
  requestTimeoutMs?: number;
  taskInstruction?: string;
  temperature?: number;
  timeoutMs?: number;
  upstreamTimeoutMs?: number;
  urls?: unknown[];
  videos?: unknown[];
}

export interface TextAgentRunResponseDto {
  agentPack?: unknown;
  outputType?: string;
  prompt?: unknown;
  stageLabel?: string;
  text?: unknown;
}
