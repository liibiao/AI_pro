import type { AgentPackage, LocalAgentPackageManifest } from '../../types/agentPackage';

function isModuleList(value: unknown): value is LocalAgentPackageManifest['agents'] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'name' in item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string',
    )
  );
}

function assertLocalManifest(value: unknown): asserts value is LocalAgentPackageManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('本地 Agent 数据包必须是 JSON 对象。');
  }

  const manifest = value as Record<string, unknown>;

  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    throw new Error('本地 Agent 数据包缺少 name。');
  }

  if (typeof manifest.version !== 'string' || manifest.version.trim().length === 0) {
    throw new Error('本地 Agent 数据包缺少 version。');
  }

  for (const key of ['agents', 'skills', 'templates']) {
    if (manifest[key] !== undefined && !isModuleList(manifest[key])) {
      throw new Error(`本地 Agent 数据包的 ${key} 格式不正确。`);
    }
  }
}

export async function importLocalAgentPackageFile(file: File): Promise<AgentPackage> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;
  assertLocalManifest(parsed);

  const now = new Date().toISOString();
  const safeId = parsed.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: `local-${safeId}-${Date.now()}`,
    name: parsed.name.trim(),
    version: parsed.version.trim(),
    description: parsed.description ?? '本地导入 Agent 数据包，仅当前设备可用。',
    source: 'local',
    storageScope: 'device',
    syncStatus: 'localOnly',
    importedAt: now,
    updatedAt: now,
    agents: parsed.agents ?? [],
    skills: parsed.skills ?? [],
    templates: parsed.templates ?? [],
  };
}

