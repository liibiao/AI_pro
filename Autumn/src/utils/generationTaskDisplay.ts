import type { GenerationTask } from '../types/generationTask';

const defaultGenerationTaskErrorMessage = '生成任务失败，请调整参数后重试。';
const videoGenerationTaskErrorPattern = /lingdong|video task failed|视频生成/i;

function normalizeMessage(message: string): string {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return defaultGenerationTaskErrorMessage;
  }

  if (videoGenerationTaskErrorPattern.test(trimmedMessage)) {
    return '视频生成任务失败，请检查参考图链接是否可访问，或调整生成参数后重试。';
  }

  if (/generation task api request failed/i.test(trimmedMessage)) {
    return '生成任务提交失败，请检查后台连接后重试。';
  }

  return trimmedMessage;
}

function getErrorMessageFromRecord(value: Record<string, unknown>): string | null {
  const errorMessage = value.errorMessage ?? value.error_message ?? value.message ?? value.error;
  return typeof errorMessage === 'string' ? normalizeMessage(errorMessage) : null;
}

export function getGenerationTaskErrorMessage(taskOrError: GenerationTask | unknown): string {
  if (taskOrError instanceof Error) {
    return normalizeMessage(taskOrError.message);
  }

  if (taskOrError && typeof taskOrError === 'object') {
    return getErrorMessageFromRecord(taskOrError as Record<string, unknown>) ?? defaultGenerationTaskErrorMessage;
  }

  return defaultGenerationTaskErrorMessage;
}
