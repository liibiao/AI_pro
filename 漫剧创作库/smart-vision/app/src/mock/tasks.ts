import type { CanvasStatus, TaskColumn } from '../types';

export const taskColumns: TaskColumn[] = [
  {
    id: 'source-style',
    title: '创作源 / 风格锁定',
    description: '确认创作源、影片风格、子风格工具集与视觉圣经。',
    status: 'done',
    items: ['创作源输入', 'HZW 子风格约束', '影片风格画质基调']
  },
  {
    id: 'story-script',
    title: '故事 / 剧本',
    description: '剧本、分集结构、角色关系与戏核确认。',
    status: 'done',
    items: ['第1话剧本', '人物关系', '核心冲突']
  },
  {
    id: 'director',
    title: '导演讲戏',
    description: '拆解镜头任务、情绪节拍、空间调度和第一读点。',
    status: 'done',
    items: ['镜头任务', '空间调度', '节拍设计']
  },
  {
    id: 'assets',
    title: '资产生产',
    description: '角色、场景、道具资产任务卡与生成产物追踪。',
    status: 'in_progress',
    items: ['角色卡', '场景卡', '道具卡', 'RunningHub / MJ 任务卡']
  },
  {
    id: 'storyboard',
    title: '故事板生产包',
    description: '分镜表、故事板图、面板和阅读顺序。',
    status: 'waiting_review',
    items: ['ep001 分镜', '故事板图入口', '面板生成待推进']
  },
  {
    id: 'generation-notes',
    title: '配套生成说明',
    description: '长版母稿、平台派生稿、方法论包和负面约束。',
    status: 'done',
    items: ['Seedance 长版母稿', '即梦防崩预留', '负面提示词接口']
  },
  {
    id: 'ai-generation',
    title: '生图 / 生视频',
    description: '通过无限画布或外部平台执行图片、视频生成。',
    status: 'todo',
    items: ['打开无限画布', '导入 Workflow JSON', '回填产物路径']
  },
  {
    id: 'editing',
    title: '剪辑 / 拼接',
    description: '视频拼接、声音、后期和单集成片。',
    status: 'todo',
    items: ['片段拼接', '声音空间', '后期转场']
  },
  {
    id: 'qa-release',
    title: 'QA / 发布',
    description: 'Phase Gate、审核记录、打回与发布检查。',
    status: 'todo',
    items: ['人工审核', 'Phase Gate', '发布包']
  }
];

export const canvasStatus: CanvasStatus = {
  url: 'http://127.0.0.1:8877/image-studio-canvas.html',
  health: 'unknown',
  modelCount: 0,
  hasVideoModels: true,
  note: 'MVP 阶段先提供入口；后续接入健康检查、模型数量与 Workflow JSON 导入。'
};
