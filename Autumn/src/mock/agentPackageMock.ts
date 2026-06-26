import type { AgentPackage } from '../types/agentPackage';

export const importedAgentPackages: AgentPackage[] = [
  {
    id: 'backend-manjv-industrial-v1',
    name: '漫剧创作库',
    version: '1.0.0',
    description: '后台管理系统已接入的剧本、故事板、素材、镜头视频和时间线工业化 Agent 流水线。',
    source: 'backend',
    storageScope: 'account',
    syncStatus: 'synced',
    importedAt: '2026-06-14T08:40:00+08:00',
    updatedAt: '2026-06-14T08:40:00+08:00',
    agents: [
      { id: 'chief-orchestrator', name: '总架构师 Agent' },
      { id: 'script-agent', name: '剧本 Agent' },
      { id: 'storyboard-agent', name: '故事板 Agent' },
      { id: 'media-agent', name: '媒体生成 Agent' },
    ],
    skills: [
      { id: 'short-drama-video', name: '剧情短片制作' },
      { id: 'role-consistency', name: '角色一致性控制' },
      { id: 'timeline-compose', name: '时间线合成' },
    ],
    templates: [
      { id: 'final-video-spec', name: '视频规格文档' },
      { id: 'storyboard-blueprint', name: '故事板蓝图' },
    ],
  },
];

export const backendAgentPackageCandidates: AgentPackage[] = [
  {
    id: 'backend-manjv-fast-preview-v1',
    name: '漫剧快速预览包',
    version: '1.0.0',
    description: '从后台导入的快速预览 Agent 数据包，适合低成本生成脚本、角色草图和短镜头预览。',
    source: 'backend',
    storageScope: 'account',
    syncStatus: 'available',
    importedAt: '',
    updatedAt: '2026-06-14T09:50:00+08:00',
    agents: [
      { id: 'fast-script-agent', name: '快速剧本 Agent' },
      { id: 'fast-preview-agent', name: '快速预览 Agent' },
    ],
    skills: [
      { id: 'fast-storyboard', name: '快速故事板' },
      { id: 'low-cost-preview', name: '低成本预览' },
    ],
    templates: [
      { id: 'preview-spec', name: '预览规格文档' },
    ],
  },
];
