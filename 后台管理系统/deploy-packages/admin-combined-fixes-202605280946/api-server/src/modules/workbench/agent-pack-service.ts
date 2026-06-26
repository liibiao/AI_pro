import fs from 'node:fs/promises';
import path from 'node:path';

export type AgentPack = {
  id: string;
  label: string;
  description: string;
  sourcePath?: string;
};

const DEFAULT_PACKS: AgentPack[] = [
  { id: 'manga-writer', label: '漫剧创作库 Writer Agent', description: '调用漫剧创作库 Writer / Skill / Doc / Template 的剧本与提示词生产规范。' },
  { id: 'shortdrama-agent-1-5', label: '短剧 Agent 1.5', description: '短剧 Agent 包，适合短剧剧本、分场与商业化节奏。', sourcePath: '/Users/billy/Documents/短剧agent 1.5.7z' },
  { id: 'ad-agent', label: '广告 Agent', description: '广告 Agent 包，适合广告创意、卖点脚本与投放素材提示词。', sourcePath: '/Users/billy/Documents/广告agent.7z' },
];

const DATA_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'agent-packs.json');

export async function listAgentPacks(): Promise<AgentPack[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : DEFAULT_PACKS;
  } catch {
    return DEFAULT_PACKS;
  }
}

export async function resolveAgentPack(id = 'manga-writer') {
  const packs = await listAgentPacks();
  return packs.find(item => item.id === id) || packs[0] || DEFAULT_PACKS[0];
}
