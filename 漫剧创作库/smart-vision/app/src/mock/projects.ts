import type { Project } from '../types';

export const projects: Project[] = [
  {
    id: 'infinite-awakening-001',
    name: '无限强化·灵纹觉醒',
    path: 'projects/无限强化_漫剧_001',
    phase: 'Phase 4.1 提示词输出 / 资产与故事板生产闭环',
    currentEpisode: 'ep001',
    updatedAt: '2026-05-07',
    hasSmartVisionState: false,
    summary: '当前主线项目。第1话分镜、MJ-Niji7 资产任务卡、资产索引与 Seedance 长版镜头提示词已落盘，下一步推进面板与视频生产闭环。',
    episodes: [
      {
        id: 'ep001',
        title: '第1话：灵纹觉醒',
        status: '进行中',
        storyboardCount: 1,
        promptCount: 1,
        assetCount: 18
      }
    ]
  }
];

export const getProjectById = (projectId: string) => projects.find((project) => project.id === projectId) ?? projects[0];
