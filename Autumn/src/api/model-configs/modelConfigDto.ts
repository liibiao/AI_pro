export interface BackendModelProviderDto {
  adapter?: string | null;
  baseUrl?: string | null;
  id?: string;
  name?: string;
  providerKey?: string;
  status?: string;
}

export interface BackendModelConfigDto {
  adapter?: string | null;
  baseUrl?: string | null;
  capabilities?: Record<string, unknown> | null;
  channelKey?: string | null;
  creditsPerUsdCost?: number | string | null;
  defaults?: Record<string, unknown> | null;
  displayName?: string | null;
  enabled?: boolean;
  endpointPath?: string | null;
  id?: string | null;
  isEnabled?: boolean;
  model?: string | null;
  modelId?: string | null;
  modelKey?: string | null;
  modelNick?: string | null;
  modelType?: string | null;
  name?: string | null;
  pricePerSecond?: number | string | null;
  provider?: BackendModelProviderDto | null;
  providerKey?: string | null;
  salePrice?: number | string | null;
  status?: string | null;
  supports?: Record<string, unknown> | null;
  type?: string | null;
  url?: string | null;
  ui?: {
    badges?: string[];
    description?: string;
    featured?: boolean;
    group?: string;
    label?: string;
  } | null;
}

export interface ListModelConfigsResponseDto {
  data?: BackendModelConfigDto[] | { items?: BackendModelConfigDto[] };
  items?: BackendModelConfigDto[];
  ok?: boolean;
  total?: number;
}
