import { createLlmChatCompletion } from '../../api/generation/llmChatApi';
import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import type { CreateLlmChatRequestDto, LlmChatMessageDto, LlmChatResponseDto } from '../../api/generation/llmChatDto';
import { createMockGenerationTask } from '../../adapters/generation/mapGenerationTask';
import { getGenerationTaskDataSource } from '../../config/generationTaskRuntime';
import type { GenerationTask } from '../../types/generationTask';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

interface LlmChatRepositoryContext {
  authSession?: AuthSession;
}

function requireApiAuth(context: LlmChatRepositoryContext): AuthSession {
  const session = context.authSession;

  if (
    getGenerationTaskDataSource() === 'api' &&
    session?.status === 'authenticated' &&
    session.accessToken
  ) {
    return session;
  }

  throw new Error('请先登录后台管理系统，再调用真实语言模型。');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isChatMessage(value: unknown): value is LlmChatMessageDto {
  return isRecord(value) && typeof value.role === 'string' && 'content' in value;
}

function normalizeChatMessageContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeChatMessageContent(item)).filter(Boolean).join('\n');
  }

  if (isRecord(value)) {
    const direct = [value.text, value.outputText, value.content];

    for (const item of direct) {
      const text = normalizeChatMessageContent(item);

      if (text) {
        return text;
      }
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getInputMessages(input: CreateGenerationTaskRequestDto): LlmChatMessageDto[] {
  const messages = input.params?.messages;

  if (Array.isArray(messages) && messages.every(isChatMessage)) {
    const normalizedMessages = messages
      .map((message) => ({
        content: normalizeChatMessageContent(message.content).trim(),
        role: message.role.trim() || 'user',
      }))
      .filter((message) => message.content);

    if (normalizedMessages.length > 0) {
      return normalizedMessages;
    }
  }

  return [{ role: 'user', content: normalizeChatMessageContent(input.prompt).trim() }];
}

function toPositiveInteger(value: unknown): number | undefined {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : undefined;
}

function getStringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumberParam(value: unknown): number | undefined {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function createLlmChatExtra(input: CreateGenerationTaskRequestDto): Record<string, unknown> {
  const params = input.params ?? {};
  const blockedKeys = new Set([
    'messages',
    'maxOutputTokens',
    'temperature',
    'timeoutMs',
    'upstreamTimeoutMs',
    'requestTimeoutMs',
    'queryTimeoutMs',
    'endpointPath',
  ]);

  return Object.fromEntries(
    Object.entries(params).filter(([key, value]) => !blockedKeys.has(key) && value !== undefined),
  );
}

export function createLlmChatRequest(input: CreateGenerationTaskRequestDto): CreateLlmChatRequestDto {
  const modelId = input.modelId.trim();
  const messages = getInputMessages(input);
  const extra = createLlmChatExtra(input);

  if (!modelId) {
    throw new Error('语言模型请求缺少 modelId，请先选择可用的大语言模型。');
  }

  if (messages.length === 0 || messages.some((message) => !message.content.trim())) {
    throw new Error('语言模型请求缺少消息内容，请输入创意或剧本后再发送。');
  }

  return {
    endpointPath: getStringParam(input.params?.endpointPath) ?? '/chat/completions',
    extra,
    maxOutputTokens: toPositiveInteger(input.params?.maxOutputTokens),
    messages,
    modelId,
    queryTimeoutMs: toPositiveInteger(input.params?.queryTimeoutMs),
    requestTimeoutMs: toPositiveInteger(input.params?.requestTimeoutMs),
    temperature: getNumberParam(input.params?.temperature),
    timeoutMs: toPositiveInteger(input.params?.timeoutMs) ?? 600_000,
    upstreamTimeoutMs: toPositiveInteger(input.params?.upstreamTimeoutMs) ?? 600_000,
  };
}

function llmContentToText(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => llmContentToText(item)).filter(Boolean).join('\n').trim();
  }

  if (isRecord(value)) {
    const direct = [
      value.text,
      value.outputText,
      value.content,
      isRecord(value.message) ? value.message.content : undefined,
      isRecord(value.data) ? value.data.text : undefined,
      isRecord(value.data) ? value.data.outputText : undefined,
      isRecord(value.data) ? value.data.content : undefined,
      isRecord(value.data) && isRecord(value.data.message) ? value.data.message.content : undefined,
      isRecord(value.result) ? value.result.text : undefined,
      isRecord(value.result) ? value.result.content : undefined,
    ];

    for (const item of direct) {
      const text = llmContentToText(item);

      if (text) {
        return text;
      }
    }
  }

  return '';
}

function extractLlmText(payload: LlmChatResponseDto): string {
  const candidates = [
    payload.text,
    payload.outputText,
    payload.content,
    isRecord(payload.message) ? payload.message.content : payload.message,
    payload.data?.text,
    payload.data?.outputText,
    payload.data?.content,
    payload.data?.message?.content,
    payload.choices?.[0]?.message?.content,
    payload.data?.choices?.[0]?.message?.content,
    payload.result?.text,
    payload.result?.content,
  ];

  for (const item of candidates) {
    const text = llmContentToText(item);

    if (text) {
      return text;
    }
  }

  return '';
}

function getPayloadId(payload: LlmChatResponseDto, input: CreateGenerationTaskRequestDto): string {
  const record = payload as Record<string, unknown>;
  const data = isRecord(record.data) ? record.data : {};
  const result = isRecord(record.result) ? record.result : {};
  const id = record.id ?? record.taskId ?? record.requestId ?? data.id ?? data.taskId ?? result.id;

  return String(id || input.clientRequestId || `llm-chat-${Date.now()}`);
}

function mapLlmChatResponseToTask(
  input: CreateGenerationTaskRequestDto,
  payload: LlmChatResponseDto,
): GenerationTask {
  const resultText = extractLlmText(payload);

  if (!resultText) {
    throw new Error('后台 LLM 未返回文本内容。');
  }

  return {
    id: getPayloadId(payload, input),
    label: input.mode || 'chat',
    kind: 'pipeline',
    ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.channelKey ? { providerKey: input.channelKey } : {}),
    resultText,
    progress: 100,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };
}

export async function runConfiguredLlmChatTask(
  input: CreateGenerationTaskRequestDto,
  context: LlmChatRepositoryContext = {},
): Promise<GenerationTask> {
  if (getGenerationTaskDataSource() === 'mock') {
    return createMockGenerationTask(input);
  }

  const authHeaders = createAuthHeaders(requireApiAuth(context));
  const response = await createLlmChatCompletion(createLlmChatRequest(input), { authHeaders });

  return mapLlmChatResponseToTask(input, response);
}
