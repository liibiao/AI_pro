import { runTextAgent } from '../../api/workbench/textAgentApi';
import type {
  CreateTextAgentRunRequestDto,
  TextAgentRunResponseDto,
} from '../../api/workbench/textAgentDto';
import { getGenerationTaskDataSource } from '../../config/generationTaskRuntime';
import type { GenerationTask } from '../../types/generationTask';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

interface TextAgentRepositoryContext {
  authSession?: AuthSession;
}

function requireApiAuth(context: TextAgentRepositoryContext): AuthSession {
  const session = context.authSession;

  if (
    getGenerationTaskDataSource() === 'api' &&
    session?.status === 'authenticated' &&
    session.accessToken
  ) {
    return session;
  }

  throw new Error('请先登录后台管理系统，再调用 Agent 文本节点。');
}

function textFromValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => textFromValue(item)).filter(Boolean).join('\n').trim();
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct = [
      record.text,
      record.outputText,
      record.content,
      record.message,
      record.prompt,
    ];

    for (const item of direct) {
      const text = textFromValue(item);

      if (text) {
        return text;
      }
    }
  }

  return '';
}

function getTextAgentResultText(payload: TextAgentRunResponseDto): string {
  return textFromValue(payload.text) || textFromValue(payload.prompt);
}

function createMockTextAgentTask(input: CreateTextAgentRunRequestDto): GenerationTask {
  return {
    id: `text-agent-${Date.now()}`,
    label: 'Agent 视频流水线规划',
    kind: 'pipeline',
    modelId: input.modelKey,
    progress: 100,
    providerKey: input.agentPackId,
    resultText: input.inputText,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };
}

export async function runConfiguredTextAgentTask(
  input: CreateTextAgentRunRequestDto,
  context: TextAgentRepositoryContext = {},
): Promise<GenerationTask> {
  if (getGenerationTaskDataSource() === 'mock') {
    return createMockTextAgentTask(input);
  }

  const authHeaders = createAuthHeaders(requireApiAuth(context));
  const payload = await runTextAgent(input, { authHeaders });
  const resultText = getTextAgentResultText(payload);

  if (!resultText) {
    throw new Error('Agent 文本节点未返回可用文本。');
  }

  return {
    id: `text-agent-${Date.now()}`,
    label: payload.stageLabel || 'Agent 视频流水线规划',
    kind: 'pipeline',
    modelId: input.modelKey,
    progress: 100,
    providerKey: input.agentPackId,
    resultText,
    status: 'completed',
    updatedAt: new Date().toISOString(),
  };
}
