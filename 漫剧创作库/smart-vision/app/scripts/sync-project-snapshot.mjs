import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(process.cwd(), '../..');
const smartVisionProjectRoot = path.join(workspaceRoot, 'smart-vision');
const smartVisionOutputsRoot = path.join(smartVisionProjectRoot, 'outputs');
const smartVisionRoot = path.join(smartVisionOutputsRoot, '.smart-vision');
const projectRoot = path.join(workspaceRoot, 'projects/无限强化_漫剧_001');
const outputPath = path.join(process.cwd(), 'src/data/project-snapshot.json');
const fallbackCanvasUrl = 'http://127.0.0.1:8877/image-studio-canvas.html';
const fallbackBridgeBase = 'http://127.0.0.1:5188';

function buildWorkflowImportUrl(canvasUrl, workflowPath, params = {}) {
  const searchParams = new URLSearchParams({
    workflowPath,
    bridgeBase: fallbackBridgeBase,
    ...params
  });

  return `${canvasUrl}${String(canvasUrl).includes('?') ? '&' : '?'}${searchParams.toString()}`;
}

async function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function scanProjectArtifacts() {
  const outputRoots = ['01-资产图与提示词', '02-工作流', '03-视频', '04-输入资料', '05-可选输出'];
  const upstreamRoots = ['01-story', '02-director', '03-assets', '04-storyboard', '05-prompts', '06-generated', '07-workflows', '08-qa'];
  const allowedExtensions = new Set(['.md', '.json', '.txt', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.m4v', '.webm']);
  const results = [];

  async function walk(baseRoot, relativeDir, prefix = '') {
    const absoluteDir = path.join(baseRoot, relativeDir);
    if (!existsSync(absoluteDir)) return;

    const entries = await readdir(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const nextRelative = path.join(relativeDir, entry.name);

      if (entry.isDirectory()) {
        await walk(baseRoot, nextRelative, prefix);
        continue;
      }

      if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
        const normalized = nextRelative.split(path.sep).join('/');
        results.push(prefix ? `${prefix}${normalized}` : normalized);
      }
    }
  }

  for (const root of outputRoots) {
    await walk(smartVisionOutputsRoot, root);
  }

  for (const root of upstreamRoots) {
    await walk(projectRoot, root, 'upstream/');
  }

  return results.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function mergeArtifacts(primaryArtifacts, scannedArtifacts) {
  return Array.from(new Set([...(primaryArtifacts ?? []), ...scannedArtifacts]));
}

const projectConfig = await readJson(path.join(projectRoot, 'project.json'), {});
const projectState = await readJson(path.join(smartVisionRoot, 'project-state.json'), {});
const progressLedger = await readJson(path.join(smartVisionRoot, 'progress-ledger.json'), { items: [] });
const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [] });
const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), {});
const methodologyPack = await readJson(path.join(smartVisionRoot, 'methodology-pack.json'), {});
const skillPack = await readJson(path.join(smartVisionRoot, 'skill-pack.json'), {});
const templatePack = await readJson(path.join(smartVisionRoot, 'template-pack.json'), {});
const scannedArtifacts = await scanProjectArtifacts();

const taskDescriptions = {
  'creative-source': '确认创作源、影片风格、子风格工具集与视觉圣经。',
  script: '剧本、分集结构、角色关系与戏核确认。',
  director: '拆解镜头任务、情绪节拍、空间调度和第一读点。',
  assets: '角色、场景、道具资产任务卡与生成产物追踪。',
  storyboard: '分镜表、故事板图、面板和阅读顺序。',
  prompts: '长版母稿、平台派生稿、方法论包和负面约束。',
  generation: '通过无限画布或外部平台执行图片、视频生成。',
  edit: '视频拼接、声音、后期和单集成片。',
  qa: 'Phase Gate、审核记录、打回与发布检查。'
};

const taskItems = {
  'creative-source': ['project.json 已存在', projectConfig.main_style ?? '主风格待确认', projectConfig.visual_style ?? '视觉风格待确认'],
  script: ['01-story/scripts/第1话-废物.md', 'character-bible.md', '分话规划.md'],
  director: ['02-director/README.md', '镜头任务', '节拍设计'],
  assets: ['01-资产图与提示词/asset-index.md', '01-资产图与提示词/asset-index.md', 'V8 一致性待修复'],
  storyboard: ['04-storyboard/ep001-storyboard.md', '8 个 Seedance 镜头', '故事板图 / 面板待推进'],
  prompts: ['05-prompts/seedance/ep001-shots.md', '05-prompts/seedance/ep001-fullref-15s.md', '长版母稿已落盘'],
  generation: ['打开无限画布', '导入 Workflow JSON', '回填产物路径'],
  edit: ['片段拼接', '声音空间', '后期转场'],
  qa: ['08-qa/v8-asset-consistency-qa-report.md', 'Phase Gate', '发布包']
};

const taskColumns = progressLedger.items.map((item) => ({
  id: item.id,
  title: item.title,
  description: taskDescriptions[item.id] ?? '项目状态任务。',
  status: item.status,
  items: taskItems[item.id] ?? []
}));

const canvasUrl = workflowRegistry.canvasUrl ?? fallbackCanvasUrl;
const workflows = (workflowRegistry.workflows ?? []).map((workflow) => ({
  ...workflow,
  importUrl: buildWorkflowImportUrl(canvasUrl, workflow.path),
  editUrl: buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'edit' }),
  runUrl: buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'manual' })
}));

const snapshot = {
  projects: [
    {
      id: projectState.projectId ?? 'infinite-awakening-001',
      name: projectConfig.name ?? projectState.projectName ?? '未命名项目',
      path: projectState.projectPath ?? 'smart-vision/outputs',
      phase: projectState.currentPhase ?? '未知阶段',
      currentEpisode: projectState.currentEpisode ?? 'ep001',
      updatedAt: projectState.updatedAt ?? new Date().toISOString().slice(0, 10),
      hasSmartVisionState: existsSync(smartVisionRoot),
      summary: `类型：${projectConfig.genre ?? '未填写'}。主模型：${projectConfig.main_model ?? '未填写'}。下一步：${(projectState.nextActions ?? []).join('；')}`,
      episodes: [
        {
          id: projectState.currentEpisode ?? 'ep001',
          title: '第1话：废物',
          status: '进行中',
          storyboardCount: 1,
          promptCount: 2,
          assetCount: 17
        }
      ]
    }
  ],
  taskColumns,
  reviews: reviewLedger.reviews.map((review) => ({
    id: review.id,
    title: review.id,
    target: review.target,
    status: review.status,
    type: review.type
  })),
  artifacts: mergeArtifacts(artifactRegistry.primaryArtifacts, scannedArtifacts),
  canvasStatus: {
    url: canvasUrl,
    bridgeBase: fallbackBridgeBase,
    health: 'unknown',
    modelCount: 0,
    hasVideoModels: true,
    note: '快照已由 .smart-vision 状态文件同步生成；健康检查与模型数量将在服务桥接层接入后实时读取。'
  },
  workflowRegistry: {
    canvasUrl,
    bridgeBase: fallbackBridgeBase,
    workflows,
    note: workflowRegistry.note ?? 'Workflow JSON Builder 后续接入。'
  },
  capabilityPacks: [
    {
      packId: methodologyPack.packId ?? 'methodology-pack-missing',
      title: methodologyPack.title ?? '方法论核心包未登记',
      note: methodologyPack.note ?? '请检查 .smart-vision/methodology-pack.json。',
      items: methodologyPack.categories ?? []
    },
    {
      packId: skillPack.packId ?? 'skill-pack-missing',
      title: skillPack.title ?? 'Skill 核心包未登记',
      note: skillPack.note ?? '请检查 .smart-vision/skill-pack.json。',
      items: skillPack.skills ?? []
    },
    {
      packId: templatePack.packId ?? 'template-pack-missing',
      title: templatePack.title ?? 'Template 核心包未登记',
      note: templatePack.note ?? '请检查 .smart-vision/template-pack.json。',
      items: templatePack.templates ?? []
    }
  ]
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`synced ${path.relative(process.cwd(), outputPath)}`);
