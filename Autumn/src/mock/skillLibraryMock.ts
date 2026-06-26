import type { SkillLibraryItem } from '../types/skillLibrary';

export const importedSkillLibraryItems: SkillLibraryItem[] = [
  {
    id: 'backend-skill-role-consistency',
    name: '角色一致性控制',
    version: '1.0.0',
    description: '锁定角色参考、服饰特征和镜头内人物数量，降低多镜头变脸风险。',
    source: 'backend',
    category: 'image',
    storageScope: 'account',
    syncStatus: 'synced',
    updatedAt: '2026-06-14T09:50:00+08:00',
    compatibleStages: ['asset_preview_ready', 'shot_video_generating'],
  },
  {
    id: 'backend-skill-storyboard-breakdown',
    name: '剧情分镜拆解',
    version: '1.0.0',
    description: '将长故事自动拆成幕、镜头、旁白、角色动作和场景素材需求。',
    source: 'backend',
    category: 'storyboard',
    storageScope: 'account',
    syncStatus: 'synced',
    updatedAt: '2026-06-14T09:50:00+08:00',
    compatibleStages: ['script_draft_ready', 'storyboard_ready'],
  },
];

export const backendSkillCandidates: SkillLibraryItem[] = [
  {
    id: 'backend-skill-cinematic-audio',
    name: '电影感音频设计',
    version: '1.0.0',
    description: '生成旁白、配乐和音效设计，并绑定到故事板与时间线。',
    source: 'backend',
    category: 'audio',
    storageScope: 'account',
    syncStatus: 'available',
    updatedAt: '2026-06-14T09:58:00+08:00',
    compatibleStages: ['audio_ready', 'timeline_ready'],
  },
];

