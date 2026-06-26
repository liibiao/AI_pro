export interface LlmChatMessageDto {
  content: string;
  role: string;
}

export interface CreateLlmChatRequestDto {
  endpointPath?: string;
  extra?: Record<string, unknown>;
  maxOutputTokens?: number;
  messages: LlmChatMessageDto[];
  modelId: string;
  queryTimeoutMs?: number;
  requestTimeoutMs?: number;
  temperature?: number;
  timeoutMs?: number;
  upstreamTimeoutMs?: number;
}

export interface LlmChatResponseDto {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  content?: unknown;
  data?: {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
    content?: unknown;
    message?: {
      content?: unknown;
    };
    outputText?: unknown;
    text?: unknown;
  };
  error?: string | null;
  message?: {
    content?: unknown;
  } | string | null;
  ok?: boolean;
  outputText?: unknown;
  result?: {
    content?: unknown;
    text?: unknown;
  };
  text?: unknown;
}
