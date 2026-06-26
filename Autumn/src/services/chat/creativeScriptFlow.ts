import type { CreateGenerationTaskRequestDto } from '../../api/generation/generationTaskDto';
import type { CreateTextAgentRunRequestDto } from '../../api/workbench/textAgentDto';
import type { AgentPackage } from '../../types/agentPackage';
import type { ComposerModelTab } from '../../types/chat';
import type { ModelConfigOption } from '../../types/modelConfig';
import type { GenerationParams } from '../../types/params';
import type {
  ChatOption,
  DocumentItem,
  GenerationStageStatus,
  StoryboardElement,
  StoryboardElementType,
} from '../../types/pipeline';
import type { SkillLibraryItem } from '../../types/skillLibrary';
import { normalizeGenerationParams } from '../params/generationParamValidation';

export type CreativeInputKind = 'concept' | 'script';

export type CreativeQuestionStep = 'coreRequirements' | 'styleConstraints';

export type CreativeSelections = Partial<Record<CreativeQuestionStep, string>>;

export interface CreativeQuestionDefinition {
  actionLabel: string;
  content: string;
  options: ChatOption[];
  pageIndex: number;
  pageTotal: number;
  question: string;
  step: CreativeQuestionStep;
  title: string;
}

export interface CreativeFlowPlan {
  agentPackageName: string;
  coreOptions: ChatOption[];
  document: DocumentItem;
  durationHint: string;
  markdown: string;
  outputLanguage: string;
  stagePlan: string[];
  styleOptions: ChatOption[];
  title: string;
  topic: string;
  videoType: string;
}

interface CoreOptionData {
  background: string;
  characters: string;
  description: string;
  id: string;
  title: string;
  videoType: string;
}

interface StyleOptionData {
  description: string;
  duration: string;
  id: string;
  specialRequirements: string;
  title: string;
  visualStyle: string;
}

interface CreateCreativePipelineTaskOptions {
  agentPackage?: AgentPackage;
  confirmedScript: string;
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  generationParams?: GenerationParams;
  modelOptions: ModelConfigOption[];
  plan: CreativeFlowPlan;
  selectedModelIdsByTab?: Partial<Record<ComposerModelTab, string>>;
  selections: Required<CreativeSelections>;
  timestamp?: number;
}

interface CreateCreativePipelineTextAgentTaskOptions {
  agentPackage?: AgentPackage;
  confirmedScript: string;
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  modelOptions: ModelConfigOption[];
  plan: CreativeFlowPlan;
  selectedModelIdsByTab?: Partial<Record<ComposerModelTab, string>>;
  selections: Required<CreativeSelections>;
}

interface CreateCreativeSkillPlanningTaskOptions {
  agentPackage?: AgentPackage;
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  generationParams?: GenerationParams;
  modelOptions: ModelConfigOption[];
  selectedModelIdsByTab?: Partial<Record<ComposerModelTab, string>>;
  timestamp?: number;
  userPrompt: string;
}

interface CreateCreativeScriptDraftTaskOptions {
  agentPackage?: AgentPackage;
  enabledSkillIds?: string[];
  enabledSkills?: SkillLibraryItem[];
  generationParams?: GenerationParams;
  modelOptions: ModelConfigOption[];
  plan: CreativeFlowPlan;
  selectedModelIdsByTab?: Partial<Record<ComposerModelTab, string>>;
  selections: Required<CreativeSelections>;
  timestamp?: number;
}

interface SelectedCreativeModelBundle {
  audioModel?: ModelConfigOption;
  imageModel?: ModelConfigOption;
  llmModel: ModelConfigOption;
  videoModel?: ModelConfigOption;
}

const fallbackCreativeGenerationParams: GenerationParams = {
  aspectRatio: '16:9',
  contentWeight: 75,
  crefAssetIds: [],
  durationSeconds: 15,
  imageWeight: 1.2,
  modelId: 'creative-flow',
  seed: null,
  srefAssetIds: [],
  styleWeight: 550,
};

const minCreativeRecommendationOptions = 10;
const creativePlanningRequestTimeoutMs = 30_000;
const creativeScriptDraftRequestTimeoutMs = 90_000;
const defaultCreativeRequestTimeoutMs = 120_000;

const fullScriptMarkers = [
  /第[一二三四五六七八九十\d]+[幕场镜]/,
  /场景\s*[:：]/,
  /镜头\s*[:：\d]/,
  /对白\s*[:：]/,
  /旁白\s*[:：]/,
  /人物\s*[:：]/,
  /角色\s*[:：]/,
  /分镜/,
  /内景|外景/,
  /CUT TO|FADE IN|FADE OUT/i,
];

const creativeSignals = [
  /故事/,
  /剧本/,
  /剧情/,
  /短片/,
  /微剧/,
  /广告/,
  /宣传片/,
  /纪录/,
  /MV|mv|音乐视频/,
  /主角/,
  /角色/,
  /世界观/,
  /创意/,
  /主题/,
];

const ordinaryGenerationSignals = [
  /生成第[一二三四五六七八九十\d]+镜/,
  /重生成/,
  /重新生成/,
  /生成图片/,
  /生成视频/,
  /做一张/,
  /出图/,
  /海报/,
  /封面/,
  /壁纸/,
  /参考图/,
  /素材/,
];

const shortConceptSignals = [
  /大战/,
  /对战/,
  /对抗/,
  /抗衡/,
  /守城/,
  /入侵/,
  /战争/,
  /拯救/,
  /复仇/,
  /穿越/,
  /末日/,
  /人族|魔族|妖族|神族|兽族/,
  /城墙|城门|王国|帝国|战场/,
  /英雄|反派|将军|骑士|法师|怪物/,
  /科幻|机甲|赛博|未来/,
  /悬疑|校园|古代|奇幻|玄幻|武侠/,
];

export const creativeVideoFlowPlannerTemplate = [
  '# 流程规划',
  '',
  '（告诉 AI 按什么顺序推进、步骤之间有什么依赖，以及应该怎样和用户交互。）',
  '',
  '## 完整视频的阶段逻辑和依赖关系',
  '',
  '1. 剧本获取（二选一）：',
  '   - 用户已上传剧本文件（图片/PDF/文本）：使用 resource_prepare_and_analyze 解析并一句话总结剧本内容，提取故事结构、角色和场景信息。解析完成后，向用户输出摘要并请确认内容理解无误；确认前不得进入步骤2。',
  '   - 用户未上传剧本：通过 reply_to_user 以卡片引导方式分两轮收集信息。',
  '     - 第一轮卡片（核心需求）：视频主题/故事核心一句话描述、视频类型、主要角色数量与大致背景。',
  '     - 第二轮卡片（风格与约束）：整体视觉风格与基调、大致时长、特殊要求或参考作品（选填）。',
  '   - 收到两轮回复后，由 agent 起草完整剧本（含场景划分、角色对话、动作描述），以 reply_to_user 完整输出给用户审阅。',
  '   - 显式确认检查点：剧本草稿输出后必须暂停并请用户确认；收到明确确认前不得进入步骤2。若用户要求修改，根据反馈修改剧本后重新请确认，循环直至确认通过。',
  '2. 编写 Final_Video_Spec.md（标题、类型、画幅、时长、视觉风格、语言、模型偏好） -> text_editor。',
  '3. 生成与第1步剧本相符的故事板（关键元素、镜头列表、音频层） -> storyboard_designer。',
  '4. 设置元素：用户已上传元素资源则绑定到 key_elements；否则为所有关键元素生成图像 -> media_generator。',
  '4b. 为每个有对话台词的角色建立 key_element_audio（音色锚点），保证 Seedance 2.0 跨镜头音色一致性；如无 voice reference，询问用户选择旁白模型生成音色或 Seedance 视频提取音频。',
  '5. 每个镜头生成最终视频；参考元素图像，并将对应角色 key_element_audio 作为音频条件输入 -> media_generator。',
  '6. 基于故事板生成所有 audio_layers -> media_generator。',
  '7. 当所有资源就绪后进行最终剪辑；然后引导用户导出 -> video_assembler。',
  '',
  '依赖关系：2 -> 1；3 -> 1,2；4 -> 3；4b -> 4；5 -> 2,3,4,4b；6 -> 3；7 -> 3,4,5,6。',
  '',
  '注意：用户提供或预先存在的媒体必须优先绑定到适当分镜位置，避免重复生成。',
  '',
  '何时暂停：不要一次性完成所有步骤。在规范确认后、故事板生成后、元素图像生成后、关键帧生成后、镜头视频生成后、音频生成后都应暂停，请用户审阅后再继续。',
].join('\n');

function normalizeCreativePrompt(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function countScriptMarkers(input: string): number {
  return fullScriptMarkers.reduce((count, marker) => count + (marker.test(input) ? 1 : 0), 0);
}

function countDialogueLines(input: string): number {
  return input
    .split(/\n+/)
    .filter((line) => /^[\u4e00-\u9fa5A-Za-z0-9_]{1,14}\s*[:：]/.test(line.trim()))
    .length;
}

function trimPromptSubject(prompt: string): string {
  return normalizeCreativePrompt(prompt)
    .replace(/^(请帮我|帮我|我想|想|请|我要|给我|创建|制作|生成|设计|构思|写)/, '')
    .replace(/^(一个|一部|一支|一条)/, '')
    .replace(/(的视频|的短片|的故事|故事|剧本|短片|视频)$/g, '')
    .replace(/[，。,.!！?？\s]+$/g, '')
    .trim();
}

function compactText(text: string, maxLength: number): string {
  const normalized = normalizeCreativePrompt(text);

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function inferTopic(prompt: string): string {
  const subject = trimPromptSubject(prompt);

  return subject || compactText(prompt, 32) || '这个创意';
}

function inferVideoType(prompt: string): string {
  if (/广告|商品|产品|宣传片|品牌|推广/.test(prompt)) {
    return /广告/.test(prompt) ? '广告短片' : '宣传片';
  }

  if (/微剧|短剧|连续/.test(prompt)) {
    return '微剧';
  }

  if (/纪录|纪实|人文/.test(prompt)) {
    return '纪录短片';
  }

  if (/MV|mv|音乐视频|音乐/.test(prompt)) {
    return '音乐MV';
  }

  return '剧情短片';
}

function inferDurationHint(prompt: string): string {
  if (/(30秒|半分钟|几十秒|快节奏)/.test(prompt)) {
    return '30秒以内';
  }

  if (/(3分钟|三分钟|较完整|完整叙事|长一点)/.test(prompt)) {
    return '3分钟以上';
  }

  if (/(1-2分钟|1–2分钟|一到两分钟|两分钟|2分钟|大概2分钟|大约2分钟)/.test(prompt)) {
    return '1-2分钟';
  }

  return '1-2分钟';
}

function inferOutputLanguage(prompt: string): string {
  if (/[A-Za-z]{24,}/.test(prompt) && !/[\u4e00-\u9fa5]/.test(prompt)) {
    return 'English';
  }

  return '中文';
}

function inferProjectTitle(topic: string): string {
  const cleaned = topic
    .replace(/^(关于|围绕)/, '')
    .replace(/[《》"'“”]/g, '')
    .trim();

  return cleaned.length > 12 ? cleaned.slice(0, 12) : cleaned || '未命名短片';
}

function inferCharacterBackground(topic: string, videoType: string): string {
  if (/广告|宣传/.test(videoType)) {
    return `以产品/品牌使用者、关键展示主体和目标受众代表为主，背景围绕“${topic}”的使用场景展开。`;
  }

  if (/纪录/.test(videoType)) {
    return `以真实受访者或观察对象为核心，搭配环境人物与旁白视角，背景围绕“${topic}”展开。`;
  }

  if (/MV/.test(videoType)) {
    return `以演唱者/主角为核心，搭配情绪化群像或舞台视觉主体，背景围绕“${topic}”的音乐情绪展开。`;
  }

  return `以1名核心主角为主，搭配1-3名关键配角或对立角色，人物背景围绕“${topic}”的冲突关系展开。`;
}

function createCoreOptionData(topic: string, videoType: string): CoreOptionData[] {
  const characterBackground = inferCharacterBackground(topic, videoType);
  const compactTopic = compactText(topic, 14);

  return [
    {
      id: 'core-conflict',
      title: `冲突推进：${compactTopic}`,
      description: `以“${topic}”的一句话核心冲突作为故事发动机，快速建立目标、阻力和转折。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”中的外部压力和关键抉择。`,
    },
    {
      id: 'core-character',
      title: `人物转变：${compactTopic}`,
      description: `以主角的变化作为主线，让观众看见人物从被动到主动的选择过程。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现人物关系、动机和阶段性成长。`,
    },
    {
      id: 'core-world',
      title: `世界/场景驱动：${compactText(topic, 12)}`,
      description: `把场景、时代或世界观作为记忆点，让剧情围绕独特环境展开。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”的世界规则、场景压力和视觉奇观。`,
    },
    {
      id: 'core-mission',
      title: `使命守护：${compactTopic}`,
      description: `让主角或团队承担必须完成的使命，用清晰目标串联开端、升级和高潮。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”里必须守住、抵达、拯救或证明的核心目标。`,
    },
    {
      id: 'core-antagonist',
      title: `对立视角：${compactTopic}`,
      description: `强化对手、环境或压力源的动机，让冲突不只是对抗，也有可理解的立场。`,
      videoType,
      characters: `${characterBackground} 同时补足对立方或阻力方的明确动机。`,
      background: `重点呈现“${topic}”中双方价值、利益或生存压力的碰撞。`,
    },
    {
      id: 'core-ensemble',
      title: `群像协作：${compactTopic}`,
      description: `把故事拆成多个角色的选择与配合，适合需要团队、阵营或多线视角的创意。`,
      videoType,
      characters: `以2-5名关键人物或阵营代表组成群像，背景围绕“${topic}”的协作与分歧展开。`,
      background: `重点呈现不同角色如何在同一目标下产生分工、冲突和互补。`,
    },
    {
      id: 'core-emotion',
      title: `情感代价：${compactTopic}`,
      description: `从亲情、友情、信念、承诺或牺牲切入，让观众先感到人物为什么非做不可。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”背后的情感牵引、失去风险和选择代价。`,
    },
    {
      id: 'core-mystery',
      title: `悬念揭示：${compactTopic}`,
      description: `用疑问、误会或隐藏真相推进剧情，在结尾给出清晰反转或答案。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”中最值得追问的秘密、误判或真相揭开过程。`,
    },
    {
      id: 'core-climax',
      title: `高潮场面：${compactTopic}`,
      description: `优先设计一个强记忆点场面，再倒推人物目标、铺垫和镜头节奏。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”最适合转成视觉高光的关键场面。`,
    },
    {
      id: 'core-aftermath',
      title: `余波收束：${compactTopic}`,
      description: `不只表现事件发生，也表现行动后的结果、代价和新的秩序。`,
      videoType,
      characters: characterBackground,
      background: `重点呈现“${topic}”之后角色关系、世界状态或价值判断如何改变。`,
    },
  ];
}

function createStyleOptionData(topic: string, videoType: string, durationHint: string): StyleOptionData[] {
  const commercial = /广告|宣传/.test(videoType);
  const documentary = /纪录/.test(videoType);
  const music = /MV/.test(videoType);
  const compactTopic = compactText(topic, 12);

  return [
    {
      id: 'style-cinematic',
      title: `电影写实，${durationHint}`,
      description: `克制的电影摄影、自然光影和真实表演，优先保证“${topic}”的可信度。`,
      visualStyle: documentary ? '纪实电影感，真实观察，克制剪辑' : '电影写实风格，真实质感，克制光影',
      duration: durationHint,
      specialRequirements: '无额外参考作品；优先保持剧情清晰和镜头连续。',
    },
    {
      id: 'style-genre',
      title: `${commercial ? '商业高质感' : music ? '音乐视觉化' : '类型化视觉'}，30秒以内`,
      description: commercial
        ? `强化产品/品牌记忆点，使用更直接的视觉钩子和清晰卖点。`
        : music
          ? `强化节奏、色彩和舞台/场景调度，让音乐情绪推动画面。`
          : `强化类型片质感，用更强的光影、构图和节奏制造记忆点。`,
      visualStyle: commercial
        ? '商业广告质感，明快构图，清晰主体，高完成度'
        : music
          ? '音乐影像风格，节奏化剪辑，情绪化色彩'
          : '类型片风格，高对比构图，强情绪光影',
      duration: '30秒以内',
      specialRequirements: '节奏更紧，优先保留一个高记忆度核心场面。',
    },
    {
      id: 'style-expanded',
      title: `完整叙事，3分钟以上`,
      description: `给“${topic}”更多铺垫、人物关系和情绪停顿，适合更完整的故事弧。`,
      visualStyle: '完整叙事短片风格，场景层次更丰富，情绪转折更明确',
      duration: '3分钟以上',
      specialRequirements: '允许更多台词和情绪段落；参考作品可由用户后续补充。',
    },
    {
      id: 'style-epic',
      title: `史诗高燃，1-2分钟`,
      description: `更强调压迫感、宏大调度和高潮爆发，适合把“${compactTopic}”做成强冲突短片。`,
      visualStyle: '史诗感类型片，高对比光影，大场面调度，强节奏推进',
      duration: '1-2分钟',
      specialRequirements: '保留一个高燃高潮镜头；动作和音乐节奏需要同步设计。',
    },
    {
      id: 'style-suspense',
      title: `悬疑冷调，1分钟左右`,
      description: `用克制信息量、阴影和留白制造好奇心，让观众跟随“${compactTopic}”逐步解谜。`,
      visualStyle: '悬疑冷调，低饱和色彩，局部光源，节制剪辑',
      duration: '1分钟左右',
      specialRequirements: '开头必须有疑问钩子，结尾给出明确反转或答案。',
    },
    {
      id: 'style-emotional',
      title: `情绪细腻，90秒`,
      description: `降低外部动作密度，强化人物表演、细节道具和情绪递进。`,
      visualStyle: '情绪化写实，柔和光影，近景表演，慢节奏留白',
      duration: '90秒',
      specialRequirements: '台词少而准，重点保留眼神、动作和环境声。',
    },
    {
      id: 'style-animation',
      title: `动画概念感，1-2分钟`,
      description: `把“${compactTopic}”做得更有设定感和视觉辨识度，适合奇幻、科幻或强想象题材。`,
      visualStyle: '高完成度动画短片，概念设计明确，色彩层次鲜明',
      duration: '1-2分钟',
      specialRequirements: '关键角色和场景需要先固化视觉设定，保证跨镜头一致。',
    },
    {
      id: 'style-vertical',
      title: `竖屏强钩子，45秒`,
      description: `适合移动端传播，前三秒明确矛盾，快速给出视觉记忆点。`,
      visualStyle: '竖屏短视频节奏，主体居中，强钩子开场，快切推进',
      duration: '45秒',
      specialRequirements: '按9:16思考构图；每10秒至少有一次信息推进。',
    },
    {
      id: 'style-documentary',
      title: `伪纪录观察，2分钟`,
      description: `用采访、旁白、现场感和资料感包装“${compactTopic}”，让虚构题材更可信。`,
      visualStyle: '伪纪录片质感，手持镜头，现场收音，真实材料感',
      duration: '2分钟',
      specialRequirements: '可加入旁白、字幕卡或档案式画面，但保持叙事清楚。',
    },
    {
      id: 'style-commercial-polish',
      title: `商业精修，60秒`,
      description: `画面更干净、信息更直接，把故事卖点、角色卖点或品牌记忆点做清楚。`,
      visualStyle: '商业广告精修质感，清晰主体，精确布光，高级调色',
      duration: '60秒',
      specialRequirements: '每个镜头都要服务一个明确卖点或情绪点。',
    },
    {
      id: 'style-minimal',
      title: `极简舞台，60-90秒`,
      description: `减少场景复杂度，用一个空间、一组人物和明确表演完成故事。`,
      visualStyle: '极简舞台化影像，单场景调度，强构图，表演驱动',
      duration: '60-90秒',
      specialRequirements: '控制角色和场景数量，优先保证制作可控和镜头连续。',
    },
    {
      id: 'style-montage',
      title: `蒙太奇诗性，1-2分钟`,
      description: `用画面意象、旁白和音乐组织情绪，让“${compactTopic}”更像一支概念短片。`,
      visualStyle: '诗性蒙太奇，意象化镜头，音乐驱动，弱对白',
      duration: '1-2分钟',
      specialRequirements: '先确定3-5个核心意象，再围绕意象组织镜头。',
    },
  ];
}

function toChatOptions<TOption extends { description: string; id: string; title: string }>(
  options: TOption[],
  selectedOptionId?: string,
): ChatOption[] {
  return options.map((option) => ({
    id: option.id,
    title: option.title,
    description: option.description,
    selected: option.id === selectedOptionId,
  }));
}

function createSkillMarkdown(
  input: {
    agentPackageName: string;
    durationHint: string;
    outputLanguage: string;
    topic: string;
    videoType: string;
  },
): string {
  return [
    creativeVideoFlowPlannerTemplate,
    '',
    `项目主题：${input.topic}`,
    `视频类型：${input.videoType}`,
    `建议时长：${input.durationHint}`,
    `输出语言：${input.outputLanguage}`,
    `当前 Agent 数据包：${input.agentPackageName}`,
  ].join('\n');
}

function markdownToDocumentBody(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^#+\s*/, ''));
}

export function classifyCreativeInput(input: string): CreativeInputKind {
  const normalized = normalizeCreativePrompt(input);
  const lines = input.split(/\n+/).filter((line) => line.trim()).length;
  const markerCount = countScriptMarkers(input);
  const dialogueLines = countDialogueLines(input);

  if (normalized.length >= 320 || lines >= 6 || markerCount >= 2 || dialogueLines >= 2) {
    return 'script';
  }

  return 'concept';
}

export function isCompleteScriptInput(input: string): boolean {
  return classifyCreativeInput(input) === 'script';
}

export function shouldStartCreativeScriptFlow(input: string): boolean {
  const normalized = normalizeCreativePrompt(input);

  if (!normalized || isCompleteScriptInput(input)) {
    return false;
  }

  if (ordinaryGenerationSignals.some((signal) => signal.test(normalized))) {
    return false;
  }

  if (creativeSignals.some((signal) => signal.test(normalized))) {
    return true;
  }

  const compactLength = normalized.replace(/\s+/g, '').length;
  return compactLength >= 4 && compactLength <= 48 && shortConceptSignals.some((signal) => signal.test(normalized));
}

export function createCreativeFlowPlan(
  prompt: string,
  agentPackage?: AgentPackage,
): CreativeFlowPlan {
  const topic = inferTopic(prompt);
  const videoType = inferVideoType(prompt);
  const durationHint = inferDurationHint(prompt);
  const outputLanguage = inferOutputLanguage(prompt);
  const agentPackageName = agentPackage?.name ?? '未选择 Agent 数据包';
  const markdown = createSkillMarkdown({
    agentPackageName,
    durationHint,
    outputLanguage,
    topic,
    videoType,
  });
  const coreOptions = toChatOptions(createCoreOptionData(topic, videoType));
  const styleOptions = toChatOptions(createStyleOptionData(topic, videoType, durationHint));

  return {
    agentPackageName,
    coreOptions,
    document: {
      id: `skill-plan-${Date.now()}`,
      title: 'skill.md',
      active: true,
      body: markdownToDocumentBody(markdown),
    },
    durationHint,
    markdown,
    outputLanguage,
    stagePlan: [
      '剧本获取与确认',
      'Final_Video_Spec.md',
      '故事板设计',
      '关键元素与音色锚点',
      '镜头视频生成',
      '音频层生成',
      '最终剪辑与导出',
    ],
    styleOptions,
    title: inferProjectTitle(topic),
    topic,
    videoType,
  };
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getStringField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function parsePlanningJson(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidates = [
    trimmed,
    fencedJson,
    trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  for (const candidate of candidates) {
    try {
      return getRecord(JSON.parse(candidate));
    } catch {
      // Continue with the next likely JSON envelope.
    }
  }

  return undefined;
}

function ensureMinimumRecommendationOptions(
  options: ChatOption[],
  fallback: ChatOption[],
): ChatOption[] {
  const seenIds = new Set<string>();
  const merged: ChatOption[] = [];

  [...options, ...fallback].forEach((option, index) => {
    const id = option.id.trim() || `recommendation-${index + 1}`;

    if (seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    merged.push({
      ...option,
      id,
    });
  });

  return merged.slice(0, Math.max(minCreativeRecommendationOptions, options.length));
}

function normalizeModelOptions(
  value: unknown,
  prefix: string,
  fallback: ChatOption[],
): ChatOption[] {
  if (!Array.isArray(value)) {
    return ensureMinimumRecommendationOptions([], fallback);
  }

  const options = value
    .map((item, index): ChatOption | null => {
      const record = getRecord(item);

      if (!record) {
        return null;
      }

      const title = getStringField(record, ['title', 'label', 'name']);
      const description = getStringField(record, ['description', 'desc', 'detail', 'summary']);

      if (!title) {
        return null;
      }

      return {
        id: getStringField(record, ['id', 'key', 'value']) ?? `${prefix}-${index + 1}`,
        title,
        ...(description ? { description } : {}),
      };
    })
    .filter((option): option is ChatOption => Boolean(option));

  return ensureMinimumRecommendationOptions(options, fallback);
}

function getNestedRecord(
  record: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const nested = getRecord(record[key]);

    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function getQuestionOptions(
  planning: Record<string, unknown> | undefined,
  questionKeys: string[],
  optionKeys: string[],
  prefix: string,
  fallback: ChatOption[],
): ChatOption[] {
  const question = getNestedRecord(planning, questionKeys);
  const directOptionsKey = optionKeys
    .filter((key) => key !== 'options')
    .find((key) => Array.isArray(planning?.[key]));
  const questionOptionsKey = optionKeys.find((key) => Array.isArray(question?.[key]));
  const source = directOptionsKey
    ? planning?.[directOptionsKey]
    : questionOptionsKey
      ? question?.[questionOptionsKey]
      : question?.options;

  return normalizeModelOptions(source, prefix, fallback);
}

export function createCreativeFlowPlanFromModelResult(
  prompt: string,
  modelResultText: string,
  agentPackage?: AgentPackage,
): CreativeFlowPlan {
  const fallback = createCreativeFlowPlan(prompt, agentPackage);
  const planning = parsePlanningJson(modelResultText);
  const metadata = getNestedRecord(planning, ['metadata', 'project', 'videoSpec']);
  const topic = getStringField(metadata, ['topic', 'subject'])
    ?? getStringField(planning, ['topic', 'subject'])
    ?? fallback.topic;
  const title = getStringField(metadata, ['title', 'projectTitle'])
    ?? getStringField(planning, ['title', 'projectTitle'])
    ?? fallback.title;
  const videoType = getStringField(metadata, ['videoType', 'type'])
    ?? getStringField(planning, ['videoType', 'type'])
    ?? fallback.videoType;
  const durationHint = getStringField(metadata, ['durationHint', 'duration'])
    ?? getStringField(planning, ['durationHint', 'duration'])
    ?? fallback.durationHint;
  const outputLanguage = getStringField(metadata, ['outputLanguage', 'language'])
    ?? getStringField(planning, ['outputLanguage', 'language'])
    ?? fallback.outputLanguage;
  const markdown = getStringField(planning, ['skillMarkdown', 'skill_markdown', 'markdown'])
    ?? getStringField(getNestedRecord(planning, ['skill', 'document']), ['markdown', 'content'])
    ?? (/^#\s/m.test(modelResultText) ? modelResultText.trim() : fallback.markdown);
  const coreOptions = getQuestionOptions(
    planning,
    ['coreQuestion', 'coreRequirements', 'firstQuestion'],
    ['coreOptions', 'core_options', 'options'],
    'core-model',
    fallback.coreOptions,
  );
  const styleOptions = getQuestionOptions(
    planning,
    ['styleQuestion', 'styleConstraints', 'secondQuestion'],
    ['styleOptions', 'style_options', 'options'],
    'style-model',
    fallback.styleOptions,
  );

  return {
    ...fallback,
    coreOptions,
    document: {
      id: `skill-plan-${Date.now()}`,
      title: 'skill.md',
      active: true,
      body: markdownToDocumentBody(markdown),
    },
    durationHint,
    markdown,
    outputLanguage,
    styleOptions,
    title,
    topic,
    videoType,
  };
}

export function getDefaultCreativeSelections(plan: CreativeFlowPlan): Required<CreativeSelections> {
  return {
    coreRequirements: plan.coreOptions[0]?.id ?? 'core-conflict',
    styleConstraints: plan.styleOptions[0]?.id ?? 'style-cinematic',
  };
}

export function createCreativeQuestion(
  plan: CreativeFlowPlan,
  step: CreativeQuestionStep,
  selectedOptionId?: string,
): CreativeQuestionDefinition {
  if (step === 'coreRequirements') {
    return {
      step,
      title: '第一轮 — 核心需求',
      content: `我先为“${plan.topic}”生成了本次视频的流程规划 skill.md。现在收集核心需求，确认剧本应该从哪个方向起草。`,
      question: '请选择或确认视频主题、类型、主要角色与背景方向',
      pageIndex: 1,
      pageTotal: 2,
      actionLabel: '下一步',
      options: plan.coreOptions.map((option) => ({
        ...option,
        selected: option.id === selectedOptionId,
      })),
    };
  }

  return {
    step,
    title: '第二轮 — 风格与约束',
    content: '核心需求收到。现在收集视觉风格、时长和特殊约束，这些会写入剧本、Final_Video_Spec 和后续 Agent 流程。',
    question: '请选择整体视觉风格、时长与约束组合',
    pageIndex: 2,
    pageTotal: 2,
    actionLabel: '生成剧本',
    options: plan.styleOptions.map((option) => ({
      ...option,
      selected: option.id === selectedOptionId,
    })),
  };
}

function findCoreOption(plan: CreativeFlowPlan, optionId?: string): CoreOptionData {
  const source = createCoreOptionData(plan.topic, plan.videoType);
  const sourceOption = source.find((option) => option.id === optionId);

  if (sourceOption) {
    return sourceOption;
  }

  const planOption = plan.coreOptions.find((option) => option.id === optionId);

  if (planOption) {
    return {
      id: planOption.id,
      title: planOption.title,
      description: planOption.description ?? `围绕“${plan.topic}”生成的 Agent 推荐核心方向。`,
      videoType: plan.videoType,
      characters: inferCharacterBackground(plan.topic, plan.videoType),
      background:
        planOption.description ??
        `重点呈现“${plan.topic}”在“${planOption.title}”方向下的角色、冲突和故事重点。`,
    };
  }

  return source[0]!;
}

function inferDurationFromStyleOption(option: ChatOption, fallback: string): string {
  const text = `${option.title} ${option.description ?? ''}`;
  const match = text.match(
    /(30秒以内|45秒|60秒|90秒|60-90秒|1分钟左右|1-2分钟|2分钟|3分钟以上|[一二三四五六七八九十\d]+分钟)/,
  );

  return match?.[1] ?? fallback;
}

function findStyleOption(plan: CreativeFlowPlan, optionId?: string): StyleOptionData {
  const source = createStyleOptionData(plan.topic, plan.videoType, plan.durationHint);
  const sourceOption = source.find((option) => option.id === optionId);

  if (sourceOption) {
    return sourceOption;
  }

  const planOption = plan.styleOptions.find((option) => option.id === optionId);

  if (planOption) {
    return {
      id: planOption.id,
      title: planOption.title,
      description: planOption.description ?? `围绕“${plan.topic}”生成的 Agent 推荐风格方向。`,
      visualStyle: planOption.title,
      duration: inferDurationFromStyleOption(planOption, plan.durationHint),
      specialRequirements:
        planOption.description ??
        `按“${planOption.title}”执行，并保持主题“${plan.topic}”的镜头连续和角色一致性。`,
    };
  }

  return source[0]!;
}

export function createCoreRequirementSummary(
  plan: CreativeFlowPlan,
  selections: CreativeSelections,
): string {
  const core = findCoreOption(plan, selections.coreRequirements);

  return [
    `视频主题：${plan.topic}`,
    `视频类型：${core.videoType}`,
    `核心方向：${core.title}`,
    `主要角色与背景：${core.characters}`,
    `故事重点：${core.background}`,
  ].join('\n');
}

export function createStyleRequirementSummary(
  plan: CreativeFlowPlan,
  selections: CreativeSelections,
): string {
  const style = findStyleOption(plan, selections.styleConstraints);

  return [
    `视觉风格：${style.visualStyle}`,
    `大致时长：${style.duration}`,
    `特殊要求或参考：${style.specialRequirements}`,
  ].join('\n');
}

export function createCreativeScriptDraft(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
): string {
  const core = findCoreOption(plan, selections.coreRequirements);
  const style = findStyleOption(plan, selections.styleConstraints);
  const title = inferProjectTitle(plan.topic);

  return [
    `片名：《${title}》`,
    `类型：${core.videoType}`,
    `时长：${style.duration}`,
    `输出语言：${plan.outputLanguage}`,
    `视觉风格：${style.visualStyle}`,
    `主要角色与背景：${core.characters}`,
    `特殊要求：${style.specialRequirements}`,
    '',
    '第一场：建立主题与目标',
    `场景：围绕“${plan.topic}”建立主场景和时代/环境信息。`,
    `动作：主角或核心主体第一次进入观众视野，明确目标与阻力。`,
    `对白/旁白：用一句简短台词或旁白点明“${core.background}”。`,
    '',
    '第二场：冲突升级',
    `场景：切入更具压力的空间或事件节点，让“${plan.topic}”的核心矛盾显性化。`,
    '动作：关键角色做出选择，对手、环境或现实限制推进冲突。',
    '对白/旁白：角色用具体、口语化的表达说出自己的立场，不在此阶段引入无关支线。',
    '',
    '第三场：转折与高潮',
    `场景：选择最能代表“${plan.topic}”的视觉记忆点作为高潮场面。`,
    '动作：主角采取不可逆行动，完成一次清晰转变或价值表达。',
    '对白/旁白：保留一句可被观众记住的核心句，服务主题而不是解释设定。',
    '',
    '第四场：余韵与收束',
    `场景：回到主视觉元素，以${style.visualStyle}收束情绪。`,
    '动作：展示行动后的结果，留下适合进入故事板与镜头拆分的终场画面。',
    `结尾旁白：关于“${plan.topic}”，真正重要的是角色在关键时刻作出的选择。`,
  ].join('\n');
}

export function createCreativeScriptTitle(plan: CreativeFlowPlan): string {
  return `《${inferProjectTitle(plan.topic)}》剧本草稿`;
}

export function createCreativePipelinePrompt(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
  confirmedScript: string,
): string {
  return [
    '请按 Autumn 完整视频创作流水线继续执行。',
    '',
    '【流程规划 skill.md】',
    plan.markdown,
    '',
    '【第一轮核心需求】',
    createCoreRequirementSummary(plan, selections),
    '',
    '【第二轮风格与约束】',
    createStyleRequirementSummary(plan, selections),
    '',
    '【用户已确认剧本】',
    confirmedScript,
    '',
    '下一步：进入 Final_Video_Spec.md、故事板、关键元素、音色锚点、镜头视频、音频层和最终剪辑导出流程。每个关键阶段必须暂停让用户确认。',
  ].join('\n');
}

function createCreativePipelineOutputContract(): string {
  return [
    '你必须输出 JSON，不要输出额外解释或 Markdown 代码块。',
    'JSON 字段：',
    JSON.stringify(
      {
        finalVideoSpecMarkdown: '# Final_Video_Spec\\n标题、类型、画幅、时长、视觉风格、语言、模型偏好、Agent 数据包、阶段依赖',
        storyboardMarkdown: '# Storyboard\\n关键元素列表、镜头列表、每镜头画面/动作/对白/音频层/模型输入',
        storyboardElements: [
          {
            id: 'shot-1',
            name: '镜头 1',
            type: 'shot',
            description: '画面、动作、对白/旁白、音频层、下游模型输入',
          },
        ],
        nextStageInstructions: '下一阶段要执行的 Agent/Skill 节点和暂停确认点',
      },
      null,
      2,
    ),
    'finalVideoSpecMarkdown 和 storyboardMarkdown 必须完整可读，能直接写入项目文档。',
  ].join('\n');
}

const storyboardElementTypes: StoryboardElementType[] = ['role', 'scene', 'prop', 'audio', 'shot'];

function normalizeStoryboardElementType(value: unknown): StoryboardElementType {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (storyboardElementTypes.includes(text as StoryboardElementType)) {
    return text as StoryboardElementType;
  }

  if (/角色|人物|character|role/.test(text)) {
    return 'role';
  }

  if (/场景|地点|scene|location/.test(text)) {
    return 'scene';
  }

  if (/道具|物件|prop|item/.test(text)) {
    return 'prop';
  }

  if (/音频|音色|旁白|audio|voice|sound/.test(text)) {
    return 'audio';
  }

  return 'shot';
}

function normalizeStoryboardElementStatus(value: unknown): GenerationStageStatus {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (text === 'running' || text === 'completed' || text === 'failed') {
    return text;
  }

  return 'pending';
}

function slugStoryboardElementId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return slug || fallback;
}

function compactStoryboardDescription(parts: unknown[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

function getStoryboardElementsArray(record: Record<string, unknown> | undefined): unknown[] | undefined {
  if (!record) {
    return undefined;
  }

  const directKeys = ['storyboardElements', 'storyboard_elements', 'elements', 'shots', 'shotList'];

  for (const key of directKeys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  const storyboard = getNestedRecord(record, ['storyboard', 'storyboardJson', 'storyboardData']);

  if (!storyboard) {
    return undefined;
  }

  for (const key of directKeys) {
    const value = storyboard[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeStoryboardElementRecord(
  value: unknown,
  index: number,
  timestamp: number,
): StoryboardElement | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  const type = normalizeStoryboardElementType(record.type ?? record.kind ?? record.category);
  const fallbackName = type === 'shot' ? `镜头 ${index + 1}` : `元素 ${index + 1}`;
  const name = getStringField(record, ['name', 'title', 'label', 'shotName']) ?? fallbackName;
  const description = compactStoryboardDescription([
    getStringField(record, ['description', 'desc', 'summary', 'content']),
    getStringField(record, ['visual', 'picture', 'frame', 'imagePrompt']),
    getStringField(record, ['action', 'movement']),
    getStringField(record, ['dialogue', 'dialog', 'line', 'voiceover']),
    getStringField(record, ['audio', 'sound']),
    getStringField(record, ['modelInput', 'prompt']),
  ]) || name;

  return {
    assets: [],
    description,
    id: getStringField(record, ['id', 'key'])
      ?? `agent-${type}-${timestamp}-${slugStoryboardElementId(name, String(index + 1))}`,
    name,
    status: normalizeStoryboardElementStatus(record.status),
    type,
  };
}

function normalizeStructuredStoryboardElements(
  record: Record<string, unknown> | undefined,
  timestamp: number,
): StoryboardElement[] {
  const source = getStoryboardElementsArray(record);

  if (!source) {
    return [];
  }

  return source
    .map((item, index) => normalizeStoryboardElementRecord(item, index, timestamp))
    .filter((element): element is StoryboardElement => Boolean(element));
}

function inferStoryboardSectionType(line: string): Exclude<StoryboardElementType, 'shot'> | null | undefined {
  if (/^(分镜|镜头|镜头列表|分镜列表|shots?|shot list)\s*$/i.test(line)) {
    return null;
  }

  if (/^(角色|人物|主角|配角|反派|boss|Boss)(?:\s*[:：]|\s*$)/.test(line)) {
    return 'role';
  }

  if (/^(场景|地点|环境|空间)(?:\s*[:：]|\s*$)/.test(line)) {
    return 'scene';
  }

  if (/^(道具|物件|装备|武器)(?:\s*[:：]|\s*$)/.test(line)) {
    return 'prop';
  }

  if (/^(音频|旁白|音乐|音色|配音|声音)(?:\s*[:：]|\s*$)/.test(line)) {
    return 'audio';
  }

  if (/^(关键元素|元素|资产|素材)(?:\s*[:：]|\s*$)/.test(line)) {
    return null;
  }

  return undefined;
}

function stripStoryboardSectionPrefix(line: string): string {
  return line.replace(/^(角色|人物|主角|配角|反派|boss|Boss|场景|地点|环境|空间|道具|物件|装备|武器|音频|旁白|音乐|音色|配音|声音)\s*[:：]\s*/, '').trim();
}

function createStoryboardAssetElement(
  type: Exclude<StoryboardElementType, 'shot'>,
  line: string,
  timestamp: number,
  index: number,
): StoryboardElement | null {
  const detail = stripStoryboardSectionPrefix(line)
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^【[^】]+】\s*/, '')
    .trim();

  if (
    !detail ||
    /^(角色|人物|主角|配角|反派|boss|Boss|场景|地点|环境|空间|道具|物件|装备|武器|音频|旁白|音乐|音色|配音|声音|无|暂无|待定|none|null)$/i.test(detail)
  ) {
    return null;
  }

  const [rawName, ...rest] = detail.split(/\s*[:：\-—]\s*/);
  const name = (rawName || detail).trim().slice(0, 40);
  const description = (rest.join(' - ').trim() || detail).slice(0, 360);

  if (!name || /^(镜头|分镜|shot)\b/i.test(name)) {
    return null;
  }

  return {
    assets: [],
    description,
    id: `agent-${type}-${timestamp}-${index + 1}-${slugStoryboardElementId(name, String(index + 1))}`,
    name,
    status: 'pending',
    type,
  };
}

function parseStoryboardMarkdownElements(markdown: string, timestamp: number): StoryboardElement[] {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const elements: StoryboardElement[] = [];
  let currentShot: StoryboardElement | null = null;
  let currentAssetSection: Exclude<StoryboardElementType, 'shot'> | null = null;

  lines.forEach((line) => {
    const cleanLine = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
    const shotSectionOnly = /^(分镜|镜头|镜头列表|分镜列表|shots?|shot list)\s*$/i.test(cleanLine);

    if (shotSectionOnly) {
      currentShot = null;
      currentAssetSection = null;
      return;
    }

    const shotMatch = cleanLine.match(/^(镜头|分镜|shot)\s*([0-9一二三四五六七八九十]*)\s*[:：.\-\s]*(.+)?$/i);
    const inferredSectionType = inferStoryboardSectionType(cleanLine);

    if (inferredSectionType !== undefined && !shotMatch) {
      currentShot = null;
      currentAssetSection = inferredSectionType;

      if (inferredSectionType) {
        const element = createStoryboardAssetElement(inferredSectionType, cleanLine, timestamp, elements.length);

        if (element) {
          elements.push(element);
        }
      }

      return;
    }

    if (shotMatch) {
      const shotIndex = elements.filter((element) => element.type === 'shot').length + 1;
      const title = shotMatch[2] ? `镜头 ${shotMatch[2]}` : `镜头 ${shotIndex}`;
      const detail = shotMatch[3]?.trim() || cleanLine;
      currentAssetSection = null;
      currentShot = {
        assets: [],
        description: detail,
        id: `agent-shot-${timestamp}-${shotIndex}`,
        name: title,
        status: 'pending',
        type: 'shot',
      };
      elements.push(currentShot);
      return;
    }

    if (currentAssetSection) {
      const element = createStoryboardAssetElement(currentAssetSection, cleanLine, timestamp, elements.length);

      if (element) {
        elements.push(element);
      }

      return;
    }

    if (currentShot && !/^#|关键元素|角色|场景|道具|音频/i.test(cleanLine)) {
      currentShot.description = `${currentShot.description}\n${cleanLine}`;
    }
  });

  return elements;
}

function getMarkdownField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  return getStringField(record, keys);
}

function createDocumentFromMarkdown(title: string, markdown: string): DocumentItem {
  return {
    id: `${title.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}-${Date.now()}`,
    title,
    active: true,
    body: markdownToDocumentBody(markdown),
  };
}

function createFallbackFinalVideoSpec(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
): string {
  const core = findCoreOption(plan, selections.coreRequirements);
  const style = findStyleOption(plan, selections.styleConstraints);

  return [
    '# Final_Video_Spec',
    '',
    `标题：${plan.title}`,
    `主题：${plan.topic}`,
    `类型：${plan.videoType}`,
    '画幅：16:9',
    `时长：${style.duration}`,
    `视觉风格：${style.visualStyle}`,
    `语言：${plan.outputLanguage}`,
    `核心方向：${core.title}`,
    `Agent 数据包：${plan.agentPackageName}`,
    '',
    '阶段依赖：剧本确认 -> Final_Video_Spec -> 故事板 -> 关键元素/音色锚点 -> 镜头视频 -> 音频层 -> 剪辑导出。',
    '暂停确认点：故事板、元素设定、关键帧、镜头视频、音频层、最终剪辑均需用户确认。',
  ].join('\n');
}

function createFallbackStoryboard(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
  confirmedScript: string,
  agentResultText: string,
): string {
  return [
    '# Storyboard',
    '',
    `主题：${plan.topic}`,
    `核心选择：${createCoreRequirementSummary(plan, selections)}`,
    `风格选择：${createStyleRequirementSummary(plan, selections)}`,
    '',
    '## 已确认剧本',
    confirmedScript,
    '',
    '## Agent 输出',
    agentResultText,
  ].join('\n');
}

export function createCreativePipelineDocumentsFromAgentResult(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
  confirmedScript: string,
  agentResultText: string,
): DocumentItem[] {
  const parsed = parsePlanningJson(agentResultText);
  const finalVideoSpecMarkdown =
    getMarkdownField(parsed, ['finalVideoSpecMarkdown', 'final_video_spec_markdown', 'finalVideoSpec', 'videoSpec'])
    ?? createFallbackFinalVideoSpec(plan, selections);
  const storyboardMarkdown =
    getMarkdownField(parsed, ['storyboardMarkdown', 'storyboard_markdown', 'storyboard'])
    ?? createFallbackStoryboard(plan, selections, confirmedScript, agentResultText);

  return [
    createDocumentFromMarkdown('Final_Video_Spec.md', finalVideoSpecMarkdown),
    createDocumentFromMarkdown('Storyboard.md', storyboardMarkdown),
  ];
}

export function createCreativePipelineStoryboardElementsFromAgentResult(
  agentResultText: string,
  timestamp = Date.now(),
): StoryboardElement[] {
  const parsed = parsePlanningJson(agentResultText);
  const structuredElements = normalizeStructuredStoryboardElements(parsed, timestamp);

  if (structuredElements.length > 0) {
    return structuredElements;
  }

  const storyboardMarkdown =
    getMarkdownField(parsed, ['storyboardMarkdown', 'storyboard_markdown', 'storyboard'])
    ?? agentResultText;

  return parseStoryboardMarkdownElements(storyboardMarkdown, timestamp);
}


function resolveModelForTab(
  modelOptions: ModelConfigOption[],
  tab: ComposerModelTab,
  selectedModelIdsByTab: Partial<Record<ComposerModelTab, string>> = {},
): ModelConfigOption | undefined {
  const selectedModelId = selectedModelIdsByTab[tab];
  const selectedModel =
    selectedModelId
      ? modelOptions.find((option) => option.id === selectedModelId && option.tab === tab)
      : undefined;

  return selectedModel ?? modelOptions.find((option) => option.tab === tab);
}

function resolvePipelineModel(
  modelOptions: ModelConfigOption[],
  selectedModelIdsByTab: Partial<Record<ComposerModelTab, string>> = {},
): ModelConfigOption {
  const selectedLlm = resolveModelForTab(modelOptions, '大语言模型', selectedModelIdsByTab);
  const model =
    selectedLlm ??
    modelOptions.find((option) => option.kind === 'llm') ??
    modelOptions.find((option) => option.tab === '大语言模型');

  if (!model || model.kind !== 'llm') {
    throw new Error('未找到可用的大语言模型，无法启动 Agent 流程规划任务。请先在“模型”里选择已启用的语言模型。');
  }

  return model;
}

function resolveCreativeModelBundle(
  modelOptions: ModelConfigOption[],
  selectedModelIdsByTab: Partial<Record<ComposerModelTab, string>> = {},
): SelectedCreativeModelBundle {
  return {
    audioModel:
      resolveModelForTab(modelOptions, '音频模型', selectedModelIdsByTab) ??
      resolveModelForTab(modelOptions, '配音模型', selectedModelIdsByTab),
    imageModel: resolveModelForTab(modelOptions, '图片模型', selectedModelIdsByTab),
    llmModel: resolvePipelineModel(modelOptions, selectedModelIdsByTab),
    videoModel: resolveModelForTab(modelOptions, '视频模型', selectedModelIdsByTab),
  };
}

function serializeSelectedModel(model?: ModelConfigOption): Record<string, string> | null {
  if (!model) {
    return null;
  }

  return {
    channelKey: model.providerKey || model.id,
    id: model.id,
    kind: model.kind,
    name: model.name,
    tab: model.tab,
  };
}

function createSelectedModelsParam(bundle: SelectedCreativeModelBundle): Record<string, unknown> {
  return {
    audio: serializeSelectedModel(bundle.audioModel),
    image: serializeSelectedModel(bundle.imageModel),
    language: serializeSelectedModel(bundle.llmModel),
    video: serializeSelectedModel(bundle.videoModel),
  };
}

function createAgentPackageSummary(agentPackage?: AgentPackage): string {
  if (!agentPackage) {
    return '未选择 Agent 数据包';
  }

  return [
    `${agentPackage.name} (${agentPackage.id})`,
    `Agents: ${agentPackage.agents.map((agent) => `${agent.name}/${agent.id}`).join(', ') || '无'}`,
    `Skills: ${agentPackage.skills.map((skill) => `${skill.name}/${skill.id}`).join(', ') || '无'}`,
    `Templates: ${agentPackage.templates.map((template) => `${template.name}/${template.id}`).join(', ') || '无'}`,
  ].join('\n');
}

function createEnabledSkillSummary(enabledSkills: SkillLibraryItem[]): string {
  return enabledSkills.length > 0
    ? enabledSkills.map((skill) => `${skill.name}/${skill.id}`).join(', ')
    : '无额外启用 Skill';
}

function createSelectedModelSummary(bundle: SelectedCreativeModelBundle): string {
  return [
    `语言模型：${bundle.llmModel.name} (${bundle.llmModel.providerKey || bundle.llmModel.id})`,
    `图片模型：${bundle.imageModel ? `${bundle.imageModel.name} (${bundle.imageModel.providerKey || bundle.imageModel.id})` : '未选择'}`,
    `视频模型：${bundle.videoModel ? `${bundle.videoModel.name} (${bundle.videoModel.providerKey || bundle.videoModel.id})` : '未选择'}`,
    `音频/配音模型：${bundle.audioModel ? `${bundle.audioModel.name} (${bundle.audioModel.providerKey || bundle.audioModel.id})` : '未选择'}`,
  ].join('\n');
}

function createCreativeSkillPlanningPrompt(
  userPrompt: string,
  agentPackage: AgentPackage | undefined,
  enabledSkills: SkillLibraryItem[],
  modelBundle: SelectedCreativeModelBundle,
): string {
  return [
    '你是 Autumn 的视频创作流程规划 Agent。用户只给了一句话创意时，你必须先动态推演项目专属流程规划 skill.md 和两轮引导卡片，不要直接输出完整剧本。',
    '两轮引导卡片都必须根据用户原始创意、当前 Agent 数据包和启用 Skill 生成，不允许随机泛化；coreQuestion.options 至少 10 项，styleQuestion.options 至少 10 项。',
    '',
    '请严格基于下面的流程模板生成“项目专属 skill.md”，并把用户选择的模型和 Agent 数据包写入规范，便于后续 Agent 按对应接口执行图片、视频、语言、音频任务。',
    '',
    '【用户原始创意】',
    userPrompt,
    '',
    '【当前选择的模型】',
    createSelectedModelSummary(modelBundle),
    '',
    '【当前 Agent 数据包】',
    createAgentPackageSummary(agentPackage),
    '',
    '【当前启用 Skill】',
    createEnabledSkillSummary(enabledSkills),
    '',
    '【基础 planner 模板】',
    creativeVideoFlowPlannerTemplate,
    '',
    '返回格式必须是 JSON，不要包裹额外说明：',
    JSON.stringify(
      {
        metadata: {
          durationHint: '1-2分钟',
          outputLanguage: '中文',
          title: '项目标题',
          topic: '从用户创意提炼的具体主题',
          videoType: '剧情短片/广告/宣传片/微剧/纪录短片等',
        },
        skillMarkdown: '# 流程规划\\n...',
        coreQuestion: {
          actionLabel: '下一步',
          question: '请选择故事核心方向',
          title: '第一轮 — 核心需求',
          options: [
            { id: 'core-1', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-2', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-3', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-4', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-5', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-6', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-7', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-8', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-9', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
            { id: 'core-10', title: '方向标题', description: '贴合该创意的角色、冲突和故事重点' },
          ],
        },
        styleQuestion: {
          actionLabel: '生成剧本',
          question: '请选择视觉风格、时长和约束',
          title: '第二轮 — 风格与约束',
          options: [
            { id: 'style-1', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-2', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-3', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-4', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-5', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-6', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-7', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-8', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-9', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
            { id: 'style-10', title: '风格标题', description: '视觉基调、时长、参考或特殊约束' },
          ],
        },
      },
      null,
      2,
    ),
    '',
    '约束：选项必须由创意动态推演，不能泛泛而谈；每个选项都要体现视频主题、角色/场景、冲突或制作约束；不要生成最终剧本；skillMarkdown 必须包含阶段依赖、暂停确认点、模型偏好和 Agent 数据包使用方式。',
  ].join('\n');
}

function createCreativeScriptDraftPrompt(
  plan: CreativeFlowPlan,
  selections: Required<CreativeSelections>,
): string {
  return [
    '你是 Autumn 的剧本 Agent。请根据流程规划 skill.md 和用户两轮选择，生成完整可审阅的剧本草稿；只输出剧本正文，不要进入故事板或视频制作。',
    '',
    '【流程规划 skill.md】',
    plan.markdown,
    '',
    '【第一轮核心需求】',
    createCoreRequirementSummary(plan, selections),
    '',
    '【第二轮风格与约束】',
    createStyleRequirementSummary(plan, selections),
    '',
    '剧本要求：包含片名、类型/时长/风格、角色表、场景划分、动作描述、对白或旁白；适合后续拆分 Final_Video_Spec 和故事板。',
  ].join('\n');
}

function createCreativeTaskParams(input: {
  agentPackage?: AgentPackage;
  enabledSkillIds: string[];
  enabledSkills: SkillLibraryItem[];
  generationParams?: GenerationParams;
  modelBundle: SelectedCreativeModelBundle;
  orchestration: string;
}): Record<string, unknown> {
  const normalizedParams = normalizeGenerationParams(input.generationParams ?? fallbackCreativeGenerationParams);
  const requestTimeoutMs =
    input.orchestration === 'creative-skill-planning'
      ? creativePlanningRequestTimeoutMs
      : input.orchestration === 'creative-script-draft'
        ? creativeScriptDraftRequestTimeoutMs
        : defaultCreativeRequestTimeoutMs;

  return {
    aspectRatio: normalizedParams.aspectRatio,
    contentWeight: normalizedParams.contentWeight,
    crefAssetIds: normalizedParams.crefAssetIds,
    durationSeconds: normalizedParams.durationSeconds,
    imageWeight: normalizedParams.imageWeight,
    seed: normalizedParams.seed,
    source: 'autumn',
    sourceElementId: `autumn-${input.orchestration}`,
    sourceElementName:
      input.orchestration === 'creative-skill-planning'
        ? '对话流程规划'
        : input.orchestration === 'creative-script-draft'
          ? '对话剧本草稿'
          : '对话视频流水线',
    srefAssetIds: normalizedParams.srefAssetIds,
    storyboardElementType: 'shot',
    styleWeight: normalizedParams.styleWeight,
    targetAssetSlot: 'shotVideo',
    agentIds: input.agentPackage?.agents.map((agent) => agent.id) ?? [],
    agentPackageId: input.agentPackage?.id ?? null,
    agentPackageName: input.agentPackage?.name ?? null,
    enabledSkillIds: input.enabledSkillIds,
    endpointPath: input.modelBundle.llmModel.endpointPath || '/chat/completions',
    orchestration: input.orchestration,
    requestTimeoutMs,
    selectedModels: createSelectedModelsParam(input.modelBundle),
    skillNames: input.enabledSkills.map((skill) => skill.name),
    timeoutMs: requestTimeoutMs,
    upstreamTimeoutMs: requestTimeoutMs,
  };
}

export function createCreativeSkillPlanningGenerationTaskInput({
  agentPackage,
  enabledSkillIds = [],
  enabledSkills = [],
  modelOptions,
  selectedModelIdsByTab = {},
  timestamp = Date.now(),
  userPrompt,
}: CreateCreativeSkillPlanningTaskOptions): CreateGenerationTaskRequestDto {
  const modelBundle = resolveCreativeModelBundle(modelOptions, selectedModelIdsByTab);
  const model = modelBundle.llmModel;
  const prompt = createCreativeSkillPlanningPrompt(userPrompt, agentPackage, enabledSkills, modelBundle);

  return {
    channelKey: model.providerKey || model.id,
    clientRequestId: `autumn-creative-skill-planning-${timestamp}`,
    inputFiles: [],
    mode: 'chat',
    modelId: model.id,
    params: {
      ...createCreativeTaskParams({
        agentPackage,
        enabledSkillIds,
        enabledSkills,
        modelBundle,
        orchestration: 'creative-skill-planning',
      }),
      maxOutputTokens: 4200,
      messages: [
        {
          content:
            '你是 Autumn 的视频创作流程规划助手。必须先根据用户一句话创意动态生成项目专属 skill.md 和两轮问询选项，每轮至少 10 项，不要直接输出完整剧本。',
          role: 'system',
        },
        {
          content: prompt,
          role: 'user',
        },
      ],
      plannerTemplate: creativeVideoFlowPlannerTemplate,
      responseContract: 'creative_skill_planning_v1',
      userPrompt,
    },
    prompt,
    type: 'LLM',
  };
}

export function createCreativeScriptDraftGenerationTaskInput({
  agentPackage,
  enabledSkillIds = [],
  enabledSkills = [],
  modelOptions,
  plan,
  selectedModelIdsByTab = {},
  selections,
  timestamp = Date.now(),
}: CreateCreativeScriptDraftTaskOptions): CreateGenerationTaskRequestDto {
  const modelBundle = resolveCreativeModelBundle(modelOptions, selectedModelIdsByTab);
  const model = modelBundle.llmModel;
  const prompt = createCreativeScriptDraftPrompt(plan, selections);

  return {
    channelKey: model.providerKey || model.id,
    clientRequestId: `autumn-creative-script-draft-${timestamp}`,
    inputFiles: [],
    mode: 'chat',
    modelId: model.id,
    params: {
      ...createCreativeTaskParams({
        agentPackage,
        enabledSkillIds,
        enabledSkills,
        modelBundle,
        orchestration: 'creative-script-draft',
      }),
      maxOutputTokens: 3200,
      messages: [
        {
          content:
            '你是 Autumn 的剧本生成助手。必须严格依据用户已确认的两轮选择和流程规划 skill.md 输出可进入后续视频流水线的完整剧本。',
          role: 'system',
        },
        {
          content: prompt,
          role: 'user',
        },
      ],
      selectedCoreOptionId: selections.coreRequirements,
      selectedStyleOptionId: selections.styleConstraints,
      skillMarkdown: plan.markdown,
      topic: plan.topic,
      videoType: plan.videoType,
    },
    prompt,
    type: 'LLM',
  };
}

export function createCreativePipelineGenerationTaskInput({
  agentPackage,
  confirmedScript,
  enabledSkillIds = [],
  enabledSkills = [],
  modelOptions,
  plan,
  selectedModelIdsByTab = {},
  selections,
  timestamp = Date.now(),
}: CreateCreativePipelineTaskOptions): CreateGenerationTaskRequestDto {
  const modelBundle = resolveCreativeModelBundle(modelOptions, selectedModelIdsByTab);
  const model = modelBundle.llmModel;
  const prompt = createCreativePipelinePrompt(plan, selections, confirmedScript);

  return {
    channelKey: model.providerKey || model.id,
    clientRequestId: `autumn-creative-pipeline-${timestamp}`,
    inputFiles: [],
    mode: 'autumn-creative-video-pipeline',
    modelId: model.id,
    params: {
      ...createCreativeTaskParams({
        agentPackage,
        enabledSkillIds,
        enabledSkills,
        modelBundle,
        orchestration: 'creative-video-pipeline',
      }),
      confirmedScript,
      outputLanguage: plan.outputLanguage,
      planStages: plan.stagePlan,
      requiresStageConfirmation: true,
      selectedCoreOptionId: selections.coreRequirements,
      selectedStyleOptionId: selections.styleConstraints,
      skillMarkdown: plan.markdown,
      topic: plan.topic,
      videoType: plan.videoType,
    },
    prompt,
    type: 'LLM',
  };
}

export function createCreativePipelineTextAgentRunInput({
  agentPackage,
  confirmedScript,
  enabledSkillIds = [],
  enabledSkills = [],
  modelOptions,
  plan,
  selectedModelIdsByTab = {},
  selections,
}: CreateCreativePipelineTextAgentTaskOptions): CreateTextAgentRunRequestDto {
  if (!agentPackage?.id) {
    throw new Error('请先在 Agent/Skill 中选择可用的 Agent 数据包，再继续生成视频规格和故事板。');
  }

  const modelBundle = resolveCreativeModelBundle(modelOptions, selectedModelIdsByTab);
  const prompt = createCreativePipelinePrompt(plan, selections, confirmedScript);

  return {
    agentPackId: agentPackage.id,
    extra: {
      agentPackageId: agentPackage.id,
      agentPackageName: agentPackage.name,
      enabledSkillIds,
      orchestration: 'creative-video-pipeline',
      selectedModels: createSelectedModelsParam(modelBundle),
      skillNames: enabledSkills.map((skill) => skill.name),
      source: 'autumn',
      topic: plan.topic,
      videoType: plan.videoType,
    },
    inputText: prompt,
    maxOutputTokens: 4200,
    mode: 'script',
    modelKey: modelBundle.llmModel.id,
    outputContract: createCreativePipelineOutputContract(),
    outputType: 'storyboard',
    taskInstruction: [
      '基于用户已确认剧本继续执行 Autumn 视频流水线。',
      '当前任务只生成 Final_Video_Spec 和故事板，不要开始生图、生视频或导出。',
      '必须写入所选模型、Agent 数据包、Skill、阶段依赖和暂停确认点。',
      '故事板必须包含关键元素、镜头列表、每镜头画面动作、对白/旁白、音频层、下游模型输入提示。',
    ].join('\n'),
    requestTimeoutMs: 125_000,
    timeoutMs: 120_000,
    upstreamTimeoutMs: 120_000,
  };
}
