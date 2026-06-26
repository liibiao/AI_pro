import { mapModelConfigDtos } from '../../adapters/model-configs/mapModelConfig';
import {
  listAdminModelConfigs,
  listModelConfigsByType,
} from '../../api/model-configs/modelConfigApi';
import type {
  BackendModelConfigType,
} from '../../api/model-configs/modelConfigApi';
import type {
  BackendModelConfigDto,
  ListModelConfigsResponseDto,
} from '../../api/model-configs/modelConfigDto';
import { getModelConfigDataSource } from '../../config/modelConfigRuntime';
import { fallbackModelOptions } from '../../mock/modelConfigMock';
import type { ModelConfigOption } from '../../types/modelConfig';
import type { AuthSession } from '../../types/user';
import { createAuthHeaders } from '../auth/authSession';

export interface ModelConfigRepositoryContext {
  authSession?: AuthSession;
}

const enabledModelTypes: BackendModelConfigType[] = ['IMAGE', 'VIDEO', 'LLM'];

function getModelConfigItems(response: ListModelConfigsResponseDto): BackendModelConfigDto[] {
  if (Array.isArray(response.items)) {
    return response.items;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items;
  }

  return [];
}

function withType(items: BackendModelConfigDto[], type: BackendModelConfigType): BackendModelConfigDto[] {
  return items.map((item) => ({
    ...item,
    type: item.type ?? item.modelType ?? type,
  }));
}

function getModelType(dto: BackendModelConfigDto, fallbackType?: BackendModelConfigType): string {
  return String(dto.type ?? dto.modelType ?? fallbackType ?? '').toUpperCase();
}

function isAdminModelEnabled(dto: BackendModelConfigDto, type: BackendModelConfigType): boolean {
  const providerStatus = String(dto.provider?.status ?? '').toUpperCase();
  const modelStatus = String(dto.status ?? '').toUpperCase();
  const modelType = getModelType(dto);

  return (
    modelType === type &&
    dto.enabled !== false &&
    dto.isEnabled !== false &&
    modelStatus !== 'DISABLED' &&
    (type === 'LLM' || providerStatus !== 'DISABLED')
  );
}

function isTypedModelEnabled(dto: BackendModelConfigDto, type: BackendModelConfigType): boolean {
  const modelStatus = String(dto.status ?? '').toUpperCase();

  return (
    getModelType(dto, type) === type &&
    dto.enabled !== false &&
    dto.isEnabled !== false &&
    modelStatus !== 'DISABLED'
  );
}

function uniqueModels(models: ModelConfigOption[]): ModelConfigOption[] {
  const seen = new Set<string>();

  return models.filter((model) => {
    const key = `${model.kind}:${model.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function requireAuthSession(context: ModelConfigRepositoryContext): AuthSession {
  const session = context.authSession;

  if (session?.status === 'authenticated' && session.accessToken) {
    return session;
  }

  throw new Error('请先登录后台管理系统，模型列表需要 ai_admin_token。');
}

export async function listConfiguredModelOptions(
  context: ModelConfigRepositoryContext = {},
): Promise<ModelConfigOption[]> {
  if (getModelConfigDataSource() === 'api') {
    const authHeaders = createAuthHeaders(requireAuthSession(context));
    const typedResponses = await Promise.all(enabledModelTypes.map(async (type) => ({
      items: withType(getModelConfigItems(await listModelConfigsByType(type, { authHeaders })), type)
        .filter((item) => isTypedModelEnabled(item, type)),
      type,
    })));
    let adminItems: BackendModelConfigDto[] | null = null;
    const mergedItems = (
      await Promise.all(typedResponses.map(async ({ items, type }) => {
        if (items.length > 0) {
          return items;
        }

        if (!adminItems) {
          adminItems = getModelConfigItems(await listAdminModelConfigs({ authHeaders }));
        }

        return adminItems.filter((item) => isAdminModelEnabled(item, type));
      }))
    ).flat();
    const models = mapModelConfigDtos(mergedItems);

    return uniqueModels(models);
  }

  return fallbackModelOptions;
}
