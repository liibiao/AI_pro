import fs from 'node:fs/promises';
import path from 'node:path';

export type AgentPack = {
  id: string;
  label: string;
  description: string;
  sourcePath?: string;
  capabilities?: unknown;
  metadata?: unknown;
  roots?: unknown;
};

const DEFAULT_PACKS: AgentPack[] = [
  { id: 'manju-creation-library', label: '漫剧创作库 Writer Agent', description: '默认调用漫剧创作库 agents / skills / docs / templates / wordlists 的创作流水线规范。', sourcePath: '/Users/billy/Documents/AI_pro/漫剧创作库' },
  { id: 'movie-agent', label: '电影 Agent', description: '电影 Agent 包，适合长片剧本、导演阐述、镜头设计和资产拆解。', sourcePath: '/Users/billy/Documents/gpt图库/电影agent.7z' },
  { id: 'tv-drama-agent', label: '电视剧 Agent', description: '电视剧 Agent 包，适合剧集结构、人物弧线、分集剧情和连续资产规划。', sourcePath: '/Users/billy/Documents/电视剧agent1.7z' },
  { id: 'shortdrama-agent-1-5', label: '短剧 Agent 1.5', description: '短剧 Agent 包，适合短剧剧本、分场与商业化节奏。', sourcePath: '/Users/billy/Documents/短剧agent 1.5.7z' },
  { id: 'ad-agent', label: '广告 Agent', description: '广告 Agent 包，适合广告创意、卖点脚本与投放素材提示词。', sourcePath: '/Users/billy/Documents/广告agent.7z' },
];

const DATA_PATH = path.resolve(process.cwd(), '..', 'data', 'agent-packs.json');
const DATA_PACK_REGISTRY_PATH = process.env.DATA_PACK_REGISTRY_FILE
  ? path.resolve(process.env.DATA_PACK_REGISTRY_FILE)
  : path.resolve(process.cwd(), '..', 'data', 'data-pack-registry.json');

export async function listAgentPacks(): Promise<AgentPack[]> {
  const adminPacks = await listRegistryAgentPacks();
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const legacyPacks = Array.isArray(parsed?.items) ? parsed.items : DEFAULT_PACKS;
    return mergeAgentPacks(adminPacks, legacyPacks);
  } catch {
    return mergeAgentPacks(adminPacks, DEFAULT_PACKS);
  }
}

export async function resolveAgentPack(id = 'manju-creation-library') {
  const normalizedId = id === 'manga-writer' ? 'manju-creation-library' : id;
  const packs = await listAgentPacks();
  return packs.find(item => item.id === normalizedId) || packs[0] || DEFAULT_PACKS[0];
}

async function listRegistryAgentPacks(): Promise<AgentPack[]> {
  try {
    const raw = JSON.parse(await fs.readFile(DATA_PACK_REGISTRY_PATH, 'utf8'));
    const packs = Array.isArray(raw?.packs) ? raw.packs : [];
    return packs
      .filter((pack: any) => pack && pack.status !== 'disabled')
      .map((pack: any) => ({
        id: String(pack.id || '').trim(),
        label: String(pack.title || pack.label || pack.name || pack.id || '').trim(),
        description: dataPackDescription(pack),
        sourcePath: String(pack.rootBasePath || '').trim() || undefined,
        capabilities: pack.capabilities,
        metadata: pack.metadata,
        roots: pack.roots,
      }))
      .filter((pack: AgentPack) => pack.id && pack.label);
  } catch {
    return [];
  }
}

function dataPackDescription(pack: any) {
  const parts = [
    pack?.description,
    pack?.summary,
    pack?.defaultTaskType ? `默认任务：${pack.defaultTaskType}` : '',
    pack?.tags?.length ? `标签：${pack.tags.join('、')}` : '',
    pack?.capabilities ? `能力：${safeJson(pack.capabilities, 1800)}` : '',
    pack?.metadata ? `元数据：${safeJson(pack.metadata, 1800)}` : '',
    pack?.roots?.length ? `数据源：${pack.roots.map((root: any) => root.title || root.root || root.id).filter(Boolean).join('、')}` : '',
  ].map(value => String(value || '').trim()).filter(Boolean);
  return parts.join('\n') || '后台管理系统数据包。';
}

function mergeAgentPacks(primary: AgentPack[], fallback: AgentPack[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter(pack => {
    const id = String(pack?.id || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function safeJson(value: unknown, limit = 2000) {
  try {
    const text = JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  } catch {
    return '';
  }
}
