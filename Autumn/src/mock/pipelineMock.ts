import type {
  AssetItem,
  ChatFlowState,
  ChatMessage,
  DocumentItem,
  StoryboardElement,
  TimelineTrack,
} from '../types/pipeline';
import type { PipelineEventDto } from '../api/pipeline/pipelineDto';
import mountainThumbUrl from '../assets/project-thumbnails/home-mountain-thumb.png';
import warriorThumbUrl from '../assets/project-thumbnails/home-warrior-thumb.png';

const pipelineEventSeeds = [
  {
    stage: 'skill_matched',
    label: 'Skill 已完成',
    description: '后台漫剧创作库流水线已匹配到剧情短片技能。',
  },
  {
    stage: 'question_style',
    label: '风格确认',
    description: '等待用户选择整体视觉风格。',
  },
  {
    stage: 'question_duration',
    label: '时长确认',
    description: '等待用户选择短片时长。',
  },
  {
    stage: 'script_draft_ready',
    label: '剧本草稿',
    description: '后台流水线已生成剧本草稿。',
  },
  {
    stage: 'script_confirmation',
    label: '脚本确认',
    description: '等待用户确认脚本并进入正式生产。',
  },
  {
    stage: 'video_spec_ready',
    label: '视频规格',
    description: '规格文档已生成并写入项目文档区。',
  },
  {
    stage: 'storyboard_ready',
    label: '故事板',
    description: '关键元素、分镜和旁白音乐结构已生成。',
  },
  {
    stage: 'media_assets_generating',
    label: '媒体资产生成中',
    description: '后台流水线正在生成角色、场景、道具和音频素材。',
  },
  {
    stage: 'asset_preview_ready',
    label: '角色 / 场景预览',
    description: '部分图片素材已生成，可在预览区检查。',
  },
  {
    stage: 'audio_ready',
    label: '音频预览',
    description: '旁白、配乐和音效已生成，可试听。',
  },
  {
    stage: 'shot_script_ready',
    label: '分镜脚本卡片',
    description: '镜头脚本、元素绑定和旁白音乐信息已写入分镜卡片。',
  },
  {
    stage: 'shot_video_generating',
    label: '镜头视频生成中',
    description: '后台流水线正在生成镜头视频片段。',
  },
  {
    stage: 'timeline_ready',
    label: '时间线就绪',
    description: '镜头视频已进入时间线，可预览成片。',
  },
] satisfies Array<Pick<PipelineEventDto, 'stage' | 'label' | 'description'>>;

export const pipelineEventDtos: PipelineEventDto[] = pipelineEventSeeds.map((event, index) => ({
  ...event,
  id: `mock-pipeline-event-${String(index + 1).padStart(2, '0')}`,
  taskId: 'mock-manjv-pipeline-task-001',
  projectId: 'autumn-project-001',
  status: index < 11 ? 'completed' : 'running',
  occurredAt: `2026-06-14T00:${String(10 + index).padStart(2, '0')}:00+08:00`,
  payload: {
    creditBalance: Math.max(195, 215 - index * 2),
  },
}));

export const mockAssets: AssetItem[] = [
  {
    id: 'asset-general-human-audio',
    name: 'Element_General_Human_theme_music_audio',
    type: 'audio',
    status: 'completed',
    duration: '01:32',
  },
  {
    id: 'asset-demon-leader-img',
    name: 'Element_Demon_Leader_img',
    type: 'image',
    status: 'completed',
    thumbnail: `url(${warriorThumbUrl}) center/cover`,
  },
  {
    id: 'asset-fortress-img',
    name: 'Element_Fortress_img',
    type: 'image',
    status: 'running',
    progress: 80,
    thumbnail: `url(${mountainThumbUrl}) center/cover`,
  },
  {
    id: 'asset-shot-video',
    name: 'Shot_Twist_Awakening_video',
    type: 'video',
    status: 'running',
    progress: 65,
    duration: '00:15',
    thumbnail: `url(${warriorThumbUrl}) center/cover`,
  },
];

export const storyboardElements: StoryboardElement[] = [
  {
    id: 'element-general-human',
    name: 'Element_General_Human',
    type: 'role',
    status: 'completed',
    description: '中年人族将帅，面容刚毅，身穿银色鱼鳞铠甲，头戴传统东方发髻束冠。',
    assets: [mockAssets[0]],
  },
  {
    id: 'element-demon-leader',
    name: 'Element_Demon_Leader',
    type: 'role',
    status: 'completed',
    description: '魔族首领，带有东方上古凶神的恐怖特征，背后长有巨大的骨翼。',
    assets: [mockAssets[1]],
  },
  {
    id: 'element-fortress',
    name: 'Element_Fortress',
    type: 'scene',
    status: 'running',
    progress: 80,
    description: '中式古典山门要塞，青砖斑驳，城墙上插满战旗。',
    assets: [mockAssets[2]],
  },
  {
    id: 'shot-twist-awakening',
    name: 'Shot_Twist_Awakening',
    type: 'shot',
    status: 'running',
    progress: 65,
    description: '城门崩塌前的关键镜头，人族将领与魔族大军正面相抗。',
    assets: [mockAssets[3]],
  },
];

export const documents: DocumentItem[] = [
  {
    id: 'final-video-spec',
    title: 'Final_Video_Spec.md',
    active: true,
    body: [
      'Final Video Spec —《城门·守》',
      'Video Type: 东方玄幻战争剧情短片',
      'Output Language: 中文（旁白）',
      'Duration: 1-2 分钟',
      'Aspect Ratio: 16:9',
      'Narrative Driver: 叙事驱动（旁白 + 角色动作）',
      'Visual Style: 东方玄幻风格，融合中国古典美学与战争压迫感',
      'Model Preference: 后台漫剧创作库流水线自动选择模型组合',
    ],
  },
  {
    id: 'skill',
    title: 'skill.md',
    body: ['剧情短片 Skill：剧本 -> 故事板 -> 角色设计 -> 视频生成 -> 时间线合成。'],
  },
];

export const timelineTracks: TimelineTrack[] = [
  {
    id: 'video',
    title: '视频',
    type: 'video',
    clips: [
      {
        id: 'clip-1',
        title: 'Shot_Twist_Awakening',
        start: 0,
        duration: 15,
        status: 'running',
        sourceElementId: 'shot-twist-awakening',
      },
      { id: 'clip-2', title: 'Shot_Army_Advance', start: 16, duration: 10, status: 'completed' },
      { id: 'clip-3', title: 'Shot_City_Defense', start: 28, duration: 12, status: 'pending' },
      { id: 'clip-4', title: 'Shot_Final_Showdown', start: 44, duration: 13, status: 'pending' },
      { id: 'clip-5', title: 'Shot_Victory_Aftermath', start: 60, duration: 9, status: 'pending' },
    ],
  },
  {
    id: 'audio',
    title: '音频',
    type: 'audio',
    clips: [
      { id: 'audio-1', title: 'Elder_Telepathy_audio', start: 0, duration: 42, status: 'completed' },
      { id: 'audio-2', title: 'Battle_Ambience_mix', start: 42, duration: 34, status: 'running' },
    ],
  },
  {
    id: 'subtitle',
    title: '字幕',
    type: 'subtitle',
    clips: [
      { id: 'subtitle-1', title: '旁白：城门将倾', start: 0, duration: 18, status: 'completed' },
      { id: 'subtitle-2', title: '魔族压境', start: 20, duration: 20, status: 'completed' },
      { id: 'subtitle-3', title: '守军迎战', start: 43, duration: 28, status: 'running' },
    ],
  },
];

const skillMessage: ChatMessage = {
  id: 'msg-skill',
  role: 'assistant',
  kind: 'resultCard',
  title: 'Skill 已完成',
  content:
    '已为您匹配到剧情短片技能：剧本 -> 故事板 -> 角色设计 -> 资源生成 -> 镜头视频生成 -> 时间线合成。',
  actionLabel: '继续',
};

export const chatMessagesByState: Record<ChatFlowState, ChatMessage[]> = {
  skillMatched: [
    {
      id: 'user-prompt',
      role: 'user',
      kind: 'text',
      content: '帮我做一个人族在城门口抗衡魔族入侵的故事',
    },
    skillMessage,
  ],
  questionStyle: [
    skillMessage,
    {
      id: 'question-style',
      role: 'assistant',
      kind: 'questionCard',
      title: '您希望这部短片的整体视觉风格是？',
      content: '请选择一个方向，后台流水线将用它约束剧本、故事板、素材和镜头视频。',
      pageIndex: 1,
      pageTotal: 2,
      actionLabel: '下一步',
      options: [
        { id: 'dark-fantasy', title: '写实黑暗奇幻', description: '血与铁的史诗战场，真实质感盔甲与宏大城墙。' },
        { id: 'eastern-fantasy', title: '东方玄幻风格', description: '融合中国古典美学、东方神话与古城楼。', selected: true },
        { id: 'cg-animation', title: 'CG动画风格', description: '画面精细但更偏动画质感。' },
      ],
    },
  ],
  questionDuration: [
    {
      id: 'question-duration',
      role: 'assistant',
      kind: 'questionCard',
      title: '短片的大致时长是？',
      content: '请选择视频时长，后台流水线将据此拆分幕和镜头数量。',
      pageIndex: 2,
      pageTotal: 2,
      actionLabel: '发送',
      options: [
        { id: 'under-30', title: '30秒以内', description: '极简版，聚焦核心高光镜头。' },
        { id: 'one-two', title: '1-2分钟', description: '完整叙事弧，包含战前压迫感、正面交锋、转折结局。', selected: true },
        { id: 'two-three', title: '2-3分钟', description: '多场景展开，包含更多角色台词和战场全景。' },
      ],
    },
  ],
  scriptDraft: [
    {
      id: 'script-draft',
      role: 'assistant',
      kind: 'scriptDraft',
      title: '《城门·守》剧本草稿',
      content:
        '类型：东方玄幻战争剧情短片。第一幕：战前压迫感铺垫，约 20s。镜头 1：城楼全景，战旗猎猎作响。镜头 2：人族将领缓缓举目，望向云层之下的魔族大军。',
      actionLabel: '继续审阅',
    },
  ],
  scriptConfirm: [
    {
      id: 'script-confirm',
      role: 'assistant',
      kind: 'confirmationCard',
      title: '剧本确认',
      content: '剧本已完整呈现，请确认是否进入故事板和视频制作流程。',
      actionLabel: '发送',
      options: [
        { id: 'confirm', title: '剧本确认，开始制作', description: '继续进入故事板与视频制作流程。', selected: true },
        { id: 'revise', title: '需要修改剧本', description: '调整结局走向、角色、节奏或台词。' },
      ],
    },
  ],
  mediaGenerating: [
    {
      id: 'media-generating',
      role: 'assistant',
      kind: 'progressCard',
      title: 'Media Assets 生成中',
      content: '后台漫剧创作库流水线正在生成角色、场景、音频和镜头视频素材。',
      steps: [
        { id: 'agent', label: 'Agent 分析完成', status: 'completed' },
        { id: 'config', label: '资产配置完成', status: 'completed' },
        { id: 'search', label: '搜索信息完成', status: 'completed' },
        { id: 'media', label: '生成素材中', status: 'running' },
        { id: 'video', label: '镜头视频生成', status: 'running' },
      ],
    },
  ],
};
