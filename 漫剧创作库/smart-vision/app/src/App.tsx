import { useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, CheckCircle2, Clock3, ExternalLink, FileJson, FileText, FolderKanban, Image, LayoutDashboard, Pencil, PlayCircle, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Upload, WandSparkles, XCircle } from 'lucide-react';
import { addWorkflowOutput, advancePipelineRun, archiveWorkflow, compactWorkflowRunnerLedger, compileWorkflowTask, createPipelineRun, createReleasePackage, createWorkflowTaskPlan, executeWorkflowChainAction, fetchArtifactPreview, fetchPipelineRuns, fetchProjectSnapshot, fetchReleaseRegistry, fetchTaskContextPack, fetchWorkflowDraft, fetchWorkflowRunnerStatus, fetchWorkflowRuntimeDiagnostics, persistWorkflowTaskPlan, registerCanvasWorkflowOutput, repairPipelineRun, repairReleasePackage, repairWorkflowRuntimeState, replayWorkflowChain, requeueReleasePublishFailures, requeueWorkflowTaskQueueItem, restoreWorkflow, restoreWorkflowRunnerArchiveItem, retryCanvasWorkflowOutput, retryWorkflowRunnerFailures, runPipelineRunSmoke, runReleasePublishQueue, runReleasePublishQueueSmoke, runSmartVisionRuntimeSmoke, runWorkflowQueue, runWorkflowSelfTest, runWorkflowTaskQueue, runWorkflowTaskQueueStress, saveWorkflowDraft, startCanvasRunSession, startCreativeProduction, updateCanvasRunSessionStatus, updateReleasePackageStatus, updateReviewStatus, updateTaskStatus, updateWorkflowStatus } from './data/api';
import { projectSnapshot } from './data/loadSnapshot';
import type { ArtifactPreview, CanvasOutputRecord, CanvasOutputRegisterInput, CanvasOutputRegisterResult, CanvasOutputRetryResult, CanvasRunLedger, CanvasRunSessionResult, CanvasStatus, CapabilityPack, CompiledWorkflowDraft, CreativeStartResult, PipelineRunRegistry, PipelineRunRepairResult, PipelineRunResult, PipelineRunSmokeResult, Project, ProjectSnapshot, ReleasePackage, ReleasePublishGateBlocker, ReleasePublishQueueRequeueResult, ReleasePublishQueueRunResult, ReleasePublishQueueSmokeResult, ReleaseRegistry, ReleaseRegistryResult, ReleaseRepairResult, ReleaseStatus, ReviewItem, SmartVisionRuntimeSmokeResult, SmartVisionTaskPlan, TaskColumn, TaskContextPack, TaskPlanPersistResult, TaskStatus, WorkflowDraft, WorkflowQueueRunResult, WorkflowRegistry, WorkflowRunnerArchiveBucket, WorkflowRunnerArchiveRestoreResult, WorkflowRunnerCompactionResult, WorkflowRunnerRetryResult, WorkflowRunnerStatus, WorkflowRuntimeDiagnostics, WorkflowRuntimeRepairResult, WorkflowSelfTestResult, WorkflowTaskQueueRequeueResult, WorkflowTaskQueueRunResult, WorkflowTaskQueueStressResult } from './types';

type TaskQueueExecutionReport = {
  version: string;
  runId: string;
  taskPlanId: string;
  subtaskId: string;
  taskQueueId: string;
  taskType: string;
  title: string;
  ownerRole: string;
  status: string;
  startedAt: string;
  completedAt: string;
  executionMode: string;
  progressItemId: string;
  phase: string;
  dependencyProgressIds: string[];
  inputChecks: Array<{ path: string; check: string; reason?: string; error?: string }>;
  outputChecks: Array<{ path: string; check: string; reason?: string; error?: string }>;
  acceptanceCriteria: string[];
  notes: string[];
  error?: string | null;
};

const statusLabel: Record<TaskStatus, string> = {
  done: '已完成',
  in_progress: '进行中',
  waiting_review: '待审核',
  blocked: '阻塞',
  todo: '待启动'
};

const statusIcon: Record<TaskStatus, ReactNode> = {
  done: <CheckCircle2 size={16} />,
  in_progress: <Activity size={16} />,
  waiting_review: <Clock3 size={16} />,
  blocked: <RotateCcw size={16} />,
  todo: <PlayCircle size={16} />
};

const artifactFilters = [
  { id: 'primary', label: '资产图与提示词', prefixes: ['01-资产图与提示词/'] },
  { id: 'workflow', label: '工作流', prefixes: ['02-工作流/'] },
  { id: 'video', label: '视频', prefixes: ['03-视频/'] },
  { id: 'input', label: '输入资料', prefixes: ['04-输入资料/'] },
  { id: 'optional', label: '可选输出', prefixes: ['05-可选输出/剧本/', '05-可选输出/分镜表/', '05-可选输出/审核剪辑发布/', '05-可选输出/历史归档/'] },
  { id: 'all', label: '全部', prefixes: [] }
] as const;

const assetArtifactGroups = [
  { id: 'characters', label: '角色', prefix: '01-资产图与提示词/角色/' },
  { id: 'props', label: '道具', prefix: '01-资产图与提示词/道具/' },
  { id: 'scenes', label: '场景', prefix: '01-资产图与提示词/场景/' },
  { id: 'storyboards', label: '故事板', prefix: '01-资产图与提示词/故事板/' },
  { id: 'prompts', label: '提示词', prefix: '01-资产图与提示词/提示词/' },
  { id: 'references', label: '参考图', prefix: '01-资产图与提示词/参考图/' }
] as const;

const releaseQaGateCodes = new Set(['release_qa_review_missing', 'release_qa_review_not_done']);
const releaseReviewGateCodes = new Set(['release_review_missing', 'release_review_not_done']);
const releaseFileGateCodes = new Set(['release_manifest_missing', 'release_manifest_file_missing', 'release_manifest_path_invalid', 'release_artifacts_empty', 'release_artifact_missing', 'release_artifact_path_invalid']);

type ArtifactFilterId = typeof artifactFilters[number]['id'];

function getArtifactFilterCount(artifacts: string[], filter: typeof artifactFilters[number]): number {
  if (filter.id === 'all') return artifacts.length;
  return artifacts.filter((artifact) => filter.prefixes.some((prefix) => artifact.startsWith(prefix))).length;
}

function filterArtifacts(artifacts: string[], filterId: ArtifactFilterId): string[] {
  const filter = artifactFilters.find((item) => item.id === filterId) ?? artifactFilters[0];
  if (filter.id === 'all') return artifacts;
  return artifacts.filter((artifact) => filter.prefixes.some((prefix) => artifact.startsWith(prefix)));
}

function groupVisibleArtifacts(artifacts: string[], filterId: ArtifactFilterId) {
  if (filterId !== 'primary') return [{ id: filterId, label: '当前筛选', artifacts }];
  const grouped = assetArtifactGroups.map((group) => ({
    ...group,
    artifacts: artifacts.filter((artifact) => artifact.startsWith(group.prefix))
  }));
  const matched = new Set(grouped.flatMap((group) => group.artifacts));
  const others = artifacts.filter((artifact) => !matched.has(artifact));
  return others.length > 0 ? [...grouped, { id: 'others', label: '资产索引', prefix: '01-资产图与提示词/', artifacts: others }] : grouped;
}

function getArtifactName(artifact: string): string {
  return artifact.split('/').pop() || artifact;
}

function getArtifactLocation(artifact: string): string {
  const parts = artifact.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : '根目录';
}

function normalizeReleasePath(value?: string | null) {
  return String(value ?? '').replace(/^\/+/, '').replaceAll('\\', '/');
}

function isReleasePathMatch(release: ReleasePackage, value?: string | null) {
  const normalized = normalizeReleasePath(value);
  if (!normalized) return false;
  if ((release.artifactPaths ?? []).some((artifact) => normalizeReleasePath(artifact) === normalized)) return true;
  if (release.manifestPath && normalizeReleasePath(release.manifestPath) === normalized) return true;
  return Boolean(release.episodeId && normalized.includes(release.episodeId) && normalized.includes('qa'));
}

function getReviewForReleasePanel(release: ReleasePackage, reviews: ReviewItem[], type: string) {
  if (type === 'release_package_review' && release.reviewId) {
    const byId = reviews.find((review) => review.id === release.reviewId);
    if (byId) return byId;
  }

  return reviews.find((review) => review.type === type && (isReleasePathMatch(release, review.artifactPath) || isReleasePathMatch(release, review.target)));
}

function formatGateBlocker(blocker: ReleasePublishGateBlocker) {
  return `${blocker.code} · ${blocker.target ?? blocker.reviewId ?? blocker.message}`;
}

function isCanvasOutputProblem(output: CanvasOutputRecord) {
  return output.status === 'failed' || output.exists === false || !output.artifactPath;
}

function sortByUpdatedAt<T extends { updatedAt?: string; createdAt?: string }>(items: T[]) {
  return [...items].sort((left, right) => String(left.updatedAt ?? left.createdAt ?? '').localeCompare(String(right.updatedAt ?? right.createdAt ?? '')));
}

function inferMediaTypeFromArtifactPath(value: string) {
  if (/\.(mp4|mov|m4v|webm)$/i.test(value)) return 'video';
  if (/\.(png|jpe?g|webp|gif)$/i.test(value)) return 'image';
  return 'artifact';
}

const closedCanvasRunStatuses = new Set(['done', 'failed', 'cancelled']);

function isClosedCanvasRunStatus(value?: string | null) {
  return closedCanvasRunStatuses.has(String(value ?? ''));
}

function hasArtifactWildcard(value: string) {
  return /[*{}[\]]/.test(value);
}

function isConcreteArtifactTarget(value?: string | null) {
  const normalized = String(value ?? '').trim();
  return Boolean(normalized && !hasArtifactWildcard(normalized) && /\.[^/.]+$/i.test(normalized));
}

function slugForKey(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

type CreatorView = 'entry' | 'asset-confirm' | 'seedance-node' | 'canvas';
type ProductionMode = 'assisted' | 'auto';
type FlowCardStatus = 'waiting' | 'ready' | 'running' | 'done' | 'blocked';
type SmartFlowStageKey = 'planning' | 'shot-list' | 'asset-card' | 'asset_images' | 'storyboard_images' | 'videos';
type AssetConfirmStatus = 'draft' | 'generating' | 'generatedSingle' | 'generatedMjGrid' | 'backfilled' | 'confirmed' | 'blocked';

type AssetImageCandidate = {
  id: string;
  url: string;
  label: string;
};

type AssetConfirmCard = {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  prompt: string;
  negativePrompt: string;
  referenceLabel: string;
  sourceShots: string[];
  templateId: string;
  templateLabel: string;
  status: AssetConfirmStatus;
  finalImageUrl?: string;
  mjGrid?: {
    gridUrl: string;
    candidates: AssetImageCandidate[];
    selectedIndex?: number;
  };
};

type ResourceClipModel = {
  assetId: string;
  label: string;
  typeLabel: string;
  role: string;
  thumbnailUrl: string;
  imageUrl: string;
};

type SeedanceSegmentModel = {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sourceShotIds: string[];
  resourceClips: ResourceClipModel[];
  prompt: string;
};

type SmartFlowNodeModel = {
  key: string;
  rowIndex: number;
  stageIndex: number;
  shotId: string;
  segment: string;
  kind: SmartFlowStageKey;
  title: string;
  detail: string;
  artifactPath?: string | null;
  workflowStageId?: string | null;
};

const stageTitleMap: Record<string, string> = {
  asset_images: '资产生成',
  storyboard_images: '故事板生成',
  videos: '视频生成',
  edit: '剪辑合成',
  qa: '审核',
  release: '发布'
};

function estimateClipCount(scriptText: string) {
  const length = scriptText.trim().length;
  if (!length) return 0;
  return Math.max(1, Math.min(16, Math.ceil(length / 280)));
}

function escapeSvgText(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function createSvgDataUrl(label: string, tone = '#2563eb', subLabel = '资产图') {
  const safeLabel = escapeSvgText(label);
  const safeSub = escapeSvgText(subLabel);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${tone}" stop-opacity=".88"/><stop offset="1" stop-color="#111827"/></linearGradient><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H32M31.5 0V32" stroke="rgba(255,255,255,.08)" stroke-width="1"/></pattern></defs><rect width="960" height="540" rx="28" fill="url(#g)"/><rect width="960" height="540" fill="url(#p)" opacity=".38"/><circle cx="760" cy="138" r="104" fill="rgba(255,255,255,.13)"/><circle cx="175" cy="410" r="156" fill="rgba(255,255,255,.10)"/><text x="64" y="82" fill="rgba(255,255,255,.72)" font-size="30" font-family="PingFang SC, Arial" font-weight="700">${safeSub}</text><text x="64" y="292" fill="white" font-size="68" font-family="PingFang SC, Arial" font-weight="800">${safeLabel}</text><text x="68" y="346" fill="rgba(255,255,255,.70)" font-size="26" font-family="PingFang SC, Arial">HZW 电影专业质感 · 资产确认预览</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createMjGridDataUrl(card: Pick<AssetConfirmCard, 'name' | 'typeLabel'>) {
  const labels = ['图1', '图2', '图3', '图4'];
  const colors = ['#2563eb', '#0f766e', '#7c3aed', '#b45309'];
  const tiles = labels.map((label, index) => {
    const x = (index % 2) * 480;
    const y = Math.floor(index / 2) * 270;
    return `<g transform="translate(${x} ${y})"><rect width="480" height="270" fill="${colors[index]}"/><rect width="480" height="270" fill="rgba(0,0,0,.28)"/><text x="28" y="52" fill="white" font-size="30" font-family="PingFang SC, Arial" font-weight="800">${label}</text><text x="28" y="146" fill="white" font-size="44" font-family="PingFang SC, Arial" font-weight="800">${escapeSvgText(card.name)}</text><text x="28" y="190" fill="rgba(255,255,255,.72)" font-size="22" font-family="PingFang SC, Arial">${escapeSvgText(card.typeLabel)} · MJ 四宫格候选</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${tiles}<path d="M480 0V540M0 270H960" stroke="rgba(255,255,255,.72)" stroke-width="4"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function assetReferenceLabel(asset: Pick<AssetConfirmCard, 'typeLabel' | 'name'>) {
  return `@${asset.typeLabel}资产-${asset.name}`;
}

function defaultAssetConfirmTemplateForType(type: string) {
  if (type === 'scene') return { id: 'scene-preset', label: '场景资产模板' };
  if (type === 'prop') return { id: 'prop_basic_three_view_sheet', label: '道具普通三视图模板' };
  return { id: 'simple_three_view_sheet', label: '三视图资产模板' };
}

function createAssetConfirmCards(plan: CreativeStartResult): AssetConfirmCard[] {
  return plan.assets.map((asset) => {
    const template = defaultAssetConfirmTemplateForType(asset.type);
    return {
      id: asset.id,
      type: asset.type,
      typeLabel: asset.typeLabel,
      name: asset.name,
      prompt: asset.visualPrompt,
      negativePrompt: '模糊，低清，畸形手指，穿模，过曝，色彩脏乱，文字水印，logo，卡通，二次元，涂鸦，重复人物',
      referenceLabel: assetReferenceLabel(asset),
      sourceShots: asset.sourceShots ?? [],
      templateId: template.id,
      templateLabel: template.label,
      status: 'draft' as AssetConfirmStatus
    };
  });
}

function buildResourceClips(cards: AssetConfirmCard[]): ResourceClipModel[] {
  return cards.filter((card) => card.finalImageUrl && card.status === 'confirmed').map((card) => ({
    assetId: card.id,
    label: card.referenceLabel,
    typeLabel: card.typeLabel,
    role: card.type === 'scene' ? '场景空间' : card.type === 'prop' ? '关键道具' : '角色一致',
    thumbnailUrl: card.finalImageUrl ?? '',
    imageUrl: card.finalImageUrl ?? ''
  }));
}

function shotStartSeconds(shot: CreativeStartResult['storyboard']['shots'][number], index: number) {
  const matched = String(shot.segment ?? '').match(/(\d+(?:\.\d+)?)\s*[-–—]/);
  return matched ? Number(matched[1]) : index * 15;
}

function createSeedanceSegments(plan: CreativeStartResult, cards: AssetConfirmCard[]): SeedanceSegmentModel[] {
  const clips = buildResourceClips(cards);
  const clipByAsset = new Map(clips.map((clip) => [clip.assetId, clip]));
  const shots = plan.storyboard.shots;
  const total = Math.max(1, plan.storyboard.totalDurationSeconds || shots.reduce((sum, shot) => sum + (shot.durationSeconds || 0), 0));
  const segmentCount = Math.max(1, Math.ceil(total / 15));

  return Array.from({ length: segmentCount }, (_, index) => {
    const start = index * 15;
    const end = Math.min(total, start + 15);
    const duration = Math.max(1, end - start);
    const segmentShots = shots.filter((shot, shotIndex) => {
      const shotStart = shotStartSeconds(shot, shotIndex);
      const shotEnd = shotStart + (shot.durationSeconds || 15);
      return shotStart < end && shotEnd > start;
    });
    const resourceClips = Array.from(new Map(segmentShots.flatMap((shot) => shot.assetIds.map((assetId) => clipByAsset.get(assetId)).filter(Boolean) as ResourceClipModel[]).map((clip) => [clip.assetId, clip])).values());
    const prompt = [
      `画面主体：${segmentShots.map((shot) => shot.action).join('；') || `第 ${index + 1} 段剧情推进`}`,
      `@Image ${resourceClips.map((clip) => clip.label).join(' ') || '@资源待确认'}`,
      `0s-${Math.min(4, duration)}s：建立空间和人物关系，保持角色、场景、道具一致。`,
      duration > 4 ? `${Math.min(4, duration)}s-${Math.min(8, duration)}s：推进核心动作，镜头随主体移动，保留情绪反应。` : '',
      duration > 8 ? `${Math.min(8, duration)}s-${duration}s：完成结果镜头和段落钩子，不补空到 15s。` : '',
      '环境联动：风、光线、尘土、衣摆和道具反馈服务动作。',
      '光线：电影感自然光，主光方向稳定，细节清晰。',
      '对白配音：只保留本段必要对白和内心声。',
      '音效设计：脚步、衣料、环境声和关键道具音效。',
      '画质：9:16 竖屏短剧质感，真实摄影，细节丰富。',
      '负面提示词：模糊，低清，穿模，色彩脏乱，文字水印，重复人物。'
    ].filter(Boolean).join('\n');

    return {
      id: `segment-${String(index + 1).padStart(2, '0')}`,
      title: `段落 ${String(index + 1).padStart(2, '0')}`,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: duration,
      sourceShotIds: segmentShots.map((shot) => shot.shotId),
      resourceClips,
      prompt
    };
  });
}

function getLatestPipelineRun(registry?: PipelineRunRegistry | null) {
  const runs = registry?.runs ?? [];
  return sortByUpdatedAt(runs).reverse().find((run) => run.status !== 'done') ?? sortByUpdatedAt(runs).at(-1) ?? null;
}

function getCurrentPipelineStage(run: ReturnType<typeof getLatestPipelineRun>) {
  return run?.stages.find((stage) => stage.id === run.currentStageId) ?? run?.stages.find((stage) => stage.status !== 'done') ?? run?.stages.at(-1) ?? null;
}

function getWorkflowForStage(workflowRegistry: WorkflowRegistry, stage?: ReturnType<typeof getCurrentPipelineStage>) {
  if (!stage) return null;
  return workflowRegistry.workflows.find((workflow) => workflow.id === stage.workflowId || workflow.path === stage.workflowPath) ?? null;
}

function mapStageStatus(status?: string): FlowCardStatus {
  if (status === 'done') return 'done';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  if (status === 'in_progress' || status === 'waiting_review') return 'running';
  if (status === 'workflow_ready' || status === 'todo') return 'ready';
  return 'waiting';
}

function buildArtifactRawUrl(artifactPath: string) {
  return `/api/smart-vision/artifacts/read?raw=1&path=${encodeURIComponent(artifactPath)}`;
}

function isPreviewImageArtifact(artifactPath?: string | null) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(artifactPath ?? ''));
}

function isPreviewVideoArtifact(artifactPath?: string | null) {
  return /\.(mp4|mov|m4v|webm)$/i.test(String(artifactPath ?? ''));
}

function getFlowStageWorkflowId(kind: SmartFlowStageKey) {
  if (kind === 'asset_images') return 'asset_images';
  if (kind === 'storyboard_images') return 'storyboard_images';
  if (kind === 'videos') return 'videos';
  return null;
}

function getFlowEditorTitle(kind: SmartFlowStageKey) {
  if (kind === 'planning') return '剧本编辑';
  if (kind === 'shot-list') return '分镜表预览与编辑';
  if (kind === 'asset-card') return '资产卡预览与编辑';
  if (kind === 'asset_images') return '资产图 Workflow';
  if (kind === 'storyboard_images') return '故事板 Workflow';
  return '视频 Workflow';
}

function ScriptEntryPage({ scriptText, importedFiles, error, loading, onScriptChange, onFilesImport, onCreate }: { scriptText: string; importedFiles: string[]; error: string | null; loading: boolean; onScriptChange: (value: string) => void; onFilesImport: (files: FileList | null) => void; onCreate: () => void }) {
  return (
    <main className="story-entry-page">
      <section className="story-entry-card">
        <div className="story-entry-mark">
          <WandSparkles size={18} />
          <span>智能视界</span>
        </div>
        <div className="story-entry-copy">
          <h1>导入故事，生成漫剧生产流水线</h1>
          <p>输入一句话创意、故事梗概或完整剧本。系统会在后台完成初始化，并进入分镜表、资产卡、资产图、故事板和视频的链式生产画布。</p>
        </div>
        <label className="story-dropzone">
          <Upload size={20} />
          <span>导入剧本、故事原文、参考图片</span>
          <em>支持 .txt / .md / .json / 图片文件</em>
          <input type="file" multiple accept=".txt,.md,.json,image/*" onChange={(event) => onFilesImport(event.target.files)} />
        </label>
        {importedFiles.length > 0 ? (
          <div className="story-file-strip">
            {importedFiles.slice(0, 8).map((file) => <span key={file}>{/\.(png|jpe?g|webp|gif)$/i.test(file) ? <Image size={13} /> : <FileText size={13} />}{file}</span>)}
          </div>
        ) : null}
        <textarea className="story-script-editor" value={scriptText} onChange={(event) => onScriptChange(event.target.value)} placeholder="在这里输入一句话创意、故事梗概、剧本原文或分场文本..." />
        {error ? <div className="story-entry-error">{error}</div> : null}
        <div className="story-entry-actions">
          <button type="button" className="story-create-btn" onClick={onCreate} disabled={loading}>
            <PlayCircle size={18} />
            {loading ? '创建中...' : '开始创作'}
          </button>
          <span>创作后进入链式智能画布，默认半自动确认执行。</span>
        </div>
      </section>
    </main>
  );
}

function ResourceClip({ clip }: { clip: ResourceClipModel }) {
  return (
    <span className="resource-clip">
      <img src={clip.thumbnailUrl} alt={clip.label} />
      <span>{clip.label}</span>
      <span className="resource-popover">
        <img src={clip.imageUrl} alt={clip.label} />
        <strong>{clip.label}</strong>
        <em>{clip.typeLabel} · {clip.role} · 已绑定</em>
      </span>
    </span>
  );
}

function AssetPromptEditorModal({ card, onClose, onSave }: { card: AssetConfirmCard; onClose: () => void; onSave: (card: AssetConfirmCard) => void }) {
  const [draft, setDraft] = useState(card);
  const [templateOpen, setTemplateOpen] = useState(false);
  const templates = [
    { id: 'simple_three_view_sheet', label: '三视图资产模板', note: '角色默认，正面 / 侧面 / 背面' },
    { id: 'prop_basic_three_view_sheet', label: '道具普通三视图模板', note: '道具默认，正面 / 侧面 / 背面' },
    { id: 'prop_turnaround', label: '道具结构拆解模板', note: '结构、材质、比例拆解' },
    { id: 'half_body_character_sheet', label: '角色半身设定模板', note: '头像、服装、表情优先' },
    { id: 'expression_grid_sheet', label: '表情九宫格模板', note: '表演和口型参考' },
    { id: 'costume_detail_sheet', label: '服装细节模板', note: '服饰、材质、配件拆解' },
    { id: 'free_asset_sheet', label: '自由资产模板', note: '不固定版式' }
  ];

  return (
    <section className="asset-editor-overlay" role="dialog" aria-modal="true">
      <div className="asset-editor-modal">
        <header className="asset-editor-head">
          <div>
            <span className="modal-icon">AST</span>
            <strong>编辑资产提示词 · {draft.typeLabel} · {draft.name}</strong>
          </div>
          <button type="button" onClick={onClose}><XCircle size={22} /></button>
        </header>
        <div className="asset-editor-toolbar">
          <label>模型<select defaultValue="Midjourney"><option>Midjourney</option><option>GPT Image</option></select></label>
          <label>版本<select defaultValue="V8.1"><option>V8.1</option><option>V7</option></select></label>
          <label>比例<select defaultValue="16:9"><option>16:9</option><option>9:16</option><option>1:1</option></select></label>
          <label>分辨率<select defaultValue="1K"><option>1K</option><option>2K</option></select></label>
          <label>风格预设<select defaultValue="HZW电影专业质感"><option>HZW电影专业质感</option><option>无</option></select></label>
          <div className="asset-template-selector">
            <button type="button" onClick={() => setTemplateOpen((value) => !value)}>
              <span className="template-thumb">▦</span>
              <span><b>资产模板图片</b>{draft.templateLabel}<em>{draft.templateId}</em></span>
            </button>
            {templateOpen ? (
              <div className="asset-template-menu">
                {templates.map((template) => (
                  <button key={template.id} type="button" className={draft.templateId === template.id ? 'selected' : ''} onClick={() => {
                    setDraft((current) => ({ ...current, templateId: template.id, templateLabel: template.label }));
                    setTemplateOpen(false);
                  }}>
                    <span className="template-thumb">▦</span>
                    <span><b>{template.label}</b><em>{template.id} · {template.note}</em></span>
                    {draft.templateId === template.id ? <CheckCircle2 size={16} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <label className="strength-field">参考强度<input type="range" defaultValue={45} /><span>45%</span></label>
          <button type="button">参数模板</button>
        </div>
        <div className="asset-editor-body">
          <aside className="asset-ref-panel">
            <strong>参考图（可选）</strong>
            <button type="button" className="asset-upload-box"><Upload size={26} />上传{draft.typeLabel}参考图<span>支持 JPG / PNG，最多 5 张</span></button>
          </aside>
          <section className="asset-prompt-panel">
            <div className="asset-panel-title">
              <strong>提示词（可编辑）</strong>
              <div><button type="button">AI 优化</button><button type="button">翻译</button><button type="button" onClick={() => setDraft((current) => ({ ...current, prompt: '' }))}>清空</button></div>
            </div>
            <textarea value={draft.prompt} onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))} />
            <strong>负面提示词（可选）</strong>
            <textarea className="negative" value={draft.negativePrompt} onChange={(event) => setDraft((current) => ({ ...current, negativePrompt: event.target.value }))} />
          </section>
          <aside className="asset-info-panel">
            <strong>资产卡信息</strong>
            <label>资产名称<input value={`${draft.typeLabel} · ${draft.name}`} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value.replace(`${draft.typeLabel} · `, '') }))} /></label>
            <label>分类<select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option value="character">角色</option><option value="scene">场景</option><option value="prop">道具</option></select></label>
            <label>引用标签<input value={draft.referenceLabel} onChange={(event) => setDraft((current) => ({ ...current, referenceLabel: event.target.value }))} /></label>
            <label>来源<input value="文本节点 / 剧本推演" readOnly /></label>
            <label>出现段落<input value={draft.sourceShots.join('、') || '待分镜确认'} readOnly /></label>
          </aside>
        </div>
        <footer className="asset-editor-actions">
          <button type="button" className="primary" onClick={() => onSave(draft)}>保存并生成资产图</button>
          <button type="button" onClick={() => onSave(draft)}>仅保存提示词</button>
          <button type="button" onClick={onClose}>取消</button>
        </footer>
      </div>
    </section>
  );
}

function AssetConfirmPage({ plan, cards, onCardsChange, onConfirm, onBack }: { plan: CreativeStartResult; cards: AssetConfirmCard[]; onCardsChange: (cards: AssetConfirmCard[]) => void; onConfirm: () => void; onBack: () => void }) {
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? '');
  const [editingCard, setEditingCard] = useState<AssetConfirmCard | null>(null);
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];
  const filteredCards = filter === 'all' ? cards : cards.filter((card) => card.type === filter);
  const confirmedCount = cards.filter((card) => card.status === 'confirmed').length;
  const generatedCount = cards.filter((card) => card.finalImageUrl).length;
  const pendingCount = cards.length - generatedCount;
  const canConfirm = cards.length > 0 && confirmedCount === cards.length;

  const updateCard = (next: AssetConfirmCard) => onCardsChange(cards.map((card) => card.id === next.id ? next : card));
  const generateCard = (card: AssetConfirmCard, mode: 'single' | 'mj' = 'single') => {
    if (mode === 'mj') {
      const candidates = [0, 1, 2, 3].map((index) => ({
        id: `${card.id}-mj-${index + 1}`,
        label: `图${index + 1}`,
        url: createSvgDataUrl(`${card.name} ${index + 1}`, ['#2563eb', '#0f766e', '#7c3aed', '#b45309'][index], 'MJ 候选')
      }));
      updateCard({ ...card, status: 'generatedMjGrid', mjGrid: { gridUrl: createMjGridDataUrl(card), candidates } });
      return;
    }
    updateCard({ ...card, status: 'generatedSingle', finalImageUrl: createSvgDataUrl(card.name, card.type === 'scene' ? '#0f766e' : card.type === 'prop' ? '#b45309' : '#2563eb', card.typeLabel) });
  };
  const selectMjCandidate = (card: AssetConfirmCard, index: number) => {
    const candidate = card.mjGrid?.candidates[index];
    if (!candidate) return;
    updateCard({ ...card, status: 'backfilled', finalImageUrl: candidate.url, mjGrid: card.mjGrid ? { ...card.mjGrid, selectedIndex: index } : undefined });
  };
  const confirmCard = (card: AssetConfirmCard) => {
    if (!card.finalImageUrl) return;
    updateCard({ ...card, status: 'confirmed' });
  };

  return (
    <main className="asset-confirm-page">
      <header className="asset-confirm-header">
        <div>
          <h1>资产卡推演确认</h1>
          <p>由文本节点生成剧本后推演 · 先生成资产图，再确认创建分镜 + Seedance 提示词节点</p>
        </div>
        <div>
          <button type="button" onClick={onBack}>返回剧本</button>
          <button type="button" onClick={() => onCardsChange(cards.map((card, index) => card.finalImageUrl ? card : { ...card, status: 'generatedSingle', finalImageUrl: createSvgDataUrl(card.name, index % 3 === 0 ? '#2563eb' : index % 3 === 1 ? '#0f766e' : '#b45309', card.typeLabel) }))}>批量生成资产图</button>
          <button type="button" className="primary" disabled={!canConfirm} onClick={onConfirm}>确认并创建分镜提示词节点</button>
        </div>
      </header>
      <section className="asset-status-strip">
        <span><CheckCircle2 size={16} />已确认 {confirmedCount} / {cards.length}</span>
        <span><Activity size={16} />已生成 {generatedCount}</span>
        <span><Clock3 size={16} />待生成 {pendingCount}</span>
        <span><ShieldCheck size={16} />缺图 {cards.length - generatedCount}</span>
      </section>
      <div className="asset-confirm-layout">
        <aside className="asset-sidebar">
          {[
            ['all', '全部', cards.length],
            ['character', '角色', cards.filter((card) => card.type === 'character').length],
            ['scene', '场景', cards.filter((card) => card.type === 'scene').length],
            ['prop', '道具', cards.filter((card) => card.type === 'prop').length]
          ].map(([id, label, count]) => <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(String(id))}>{label}<span>{count}</span></button>)}
          <div className="asset-style-box"><strong>统一影片风格</strong><span>HZW电影专业质感</span><span>角色：simple_three_view_sheet</span><span>道具：prop_basic_three_view_sheet</span></div>
        </aside>
        <section className="asset-card-grid">
          {filteredCards.map((card) => (
            <button key={card.id} type="button" className={`asset-card-item ${selected?.id === card.id ? 'selected' : ''}`} onClick={() => setSelectedId(card.id)} onDoubleClick={() => setEditingCard(card)}>
              <div className={`asset-card-thumb ${card.finalImageUrl ? 'has-image' : ''}`}>
                {card.status === 'generatedMjGrid' && card.mjGrid ? <img src={card.mjGrid.gridUrl} alt={card.name} /> : card.finalImageUrl ? <img src={card.finalImageUrl} alt={card.name} /> : <><Upload size={28} /><span>上传参考图 / 待生成</span></>}
                <em>{card.typeLabel}</em>
              </div>
              <strong>{card.typeLabel} · {card.name}</strong>
              <p>{card.prompt}</p>
              <span className={`asset-state ${card.status}`}>{card.status === 'draft' ? '待生成' : card.status === 'generatedMjGrid' ? 'MJ四宫格' : card.status === 'confirmed' ? '已确认' : '待确认'}</span>
            </button>
          ))}
        </section>
        {selected ? (
          <aside className="asset-detail-panel">
            <div className="asset-detail-preview">
              {selected.status === 'generatedMjGrid' && selected.mjGrid ? <img src={selected.mjGrid.gridUrl} alt={selected.name} /> : selected.finalImageUrl ? <img src={selected.finalImageUrl} alt={selected.name} /> : <button type="button" onClick={() => generateCard(selected)}><Upload size={30} />上传{selected.typeLabel}参考图</button>}
            </div>
            <strong>{selected.typeLabel} · {selected.name}</strong>
            {selected.finalImageUrl ? <ResourceClip clip={{ assetId: selected.id, label: selected.referenceLabel, typeLabel: selected.typeLabel, role: selected.type === 'scene' ? '场景空间' : selected.type === 'prop' ? '关键道具' : '角色一致', thumbnailUrl: selected.finalImageUrl, imageUrl: selected.finalImageUrl }} /> : <span className="empty-reference-label">{selected.referenceLabel}</span>}
            <p>{selected.prompt}</p>
            {selected.status === 'generatedMjGrid' && selected.mjGrid ? (
              <div className="mj-candidates">
                {selected.mjGrid.candidates.map((candidate, index) => <button key={candidate.id} type="button" className={selected.mjGrid?.selectedIndex === index ? 'selected' : ''} onClick={() => selectMjCandidate(selected, index)}><img src={candidate.url} alt={candidate.label} /><span>{candidate.label}</span></button>)}
              </div>
            ) : null}
            <div className="asset-detail-actions">
              {!selected.finalImageUrl ? <button type="button" className="primary" onClick={() => generateCard(selected)}>生成此资产图</button> : null}
              {!selected.finalImageUrl ? <button type="button" onClick={() => generateCard(selected, 'mj')}>MJ 四宫格</button> : null}
              {selected.finalImageUrl && selected.status !== 'confirmed' ? <button type="button" className="primary" onClick={() => confirmCard(selected)}>通过</button> : null}
              <button type="button" onClick={() => setEditingCard(selected)}>编辑提示词</button>
            </div>
          </aside>
        ) : null}
      </div>
      {editingCard ? <AssetPromptEditorModal card={editingCard} onClose={() => setEditingCard(null)} onSave={(next) => {
        updateCard(next);
        setEditingCard(null);
      }} /> : null}
    </main>
  );
}

function StoryboardSeedanceWorkspace({ plan, cards, onBack }: { plan: CreativeStartResult; cards: AssetConfirmCard[]; onBack: () => void }) {
  const segments = createSeedanceSegments(plan, cards);
  const [activeId, setActiveId] = useState(segments[0]?.id ?? '');
  const active = segments.find((segment) => segment.id === activeId) ?? segments[0];

  return (
    <main className="seedance-workspace">
      <header className="seedance-topbar">
        <div>
          <h1>分镜 + Seedance 提示词节点</h1>
          <p>读取已确认资产卡和分镜表 · 每 15s 输出一段视频提示词 · 尾段按剩余秒数</p>
        </div>
        <div>
          <button type="button" onClick={onBack}>返回资产确认</button>
          <button type="button" className="primary">创建生视频节点</button>
        </div>
      </header>
      <section className="seedance-node-shell">
        <div className="seedance-node-head">
          <strong>分镜 + Seedance 提示词节点</strong>
          <span>来自资产确认</span>
          <span>{buildResourceClips(cards).length} 个 @资源</span>
          <span>{segments.length} 段提示词</span>
        </div>
        <div className="seedance-node-grid">
          <section className="segment-list">
            <strong>分段列表</strong>
            {segments.map((segment) => (
              <button key={segment.id} type="button" className={active?.id === segment.id ? 'active' : ''} onClick={() => setActiveId(segment.id)}>
                <b>{segment.title}</b>
                <span>{segment.startSeconds}-{segment.endSeconds}s · 输出 {segment.durationSeconds}s</span>
                <em>{segment.durationSeconds < 15 ? `剩余 ${segment.durationSeconds}s` : '15s'}</em>
              </button>
            ))}
          </section>
          <section className="segment-resources">
            <strong>自动绑定 @资源</strong>
            <div>
              {active?.resourceClips.length ? active.resourceClips.map((clip) => <ResourceClip key={clip.assetId} clip={clip} />) : <span>本段暂无已确认资源</span>}
            </div>
          </section>
          <section className="segment-prompt">
            <div className="asset-panel-title">
              <strong>{active?.title} · Seedance 视频提示词</strong>
              <button type="button">复制提示词</button>
            </div>
            <textarea value={active?.prompt ?? ''} readOnly />
          </section>
        </div>
      </section>
    </main>
  );
}

function SmartFlowCard({ node, status, mode, coverArtifact, hasNext, onEdit, onNext, onCancel, disabled }: { node: SmartFlowNodeModel; status: FlowCardStatus; mode: ProductionMode; coverArtifact?: string | null; hasNext: boolean; onEdit: () => void; onNext: () => void; onCancel: () => void; disabled?: boolean }) {
  const showVideo = isPreviewVideoArtifact(coverArtifact);
  const showImage = isPreviewImageArtifact(coverArtifact);
  const done = status === 'done';
  const running = status === 'running';
  return (
    <article className={`smart-flow-card smart-node-card node-entering ${status} ${running ? 'running chain-active' : ''}`}>
      <div className="smart-node-label node-label">
        <span className="node-label-ic">{String(node.stageIndex + 1).padStart(2, '0')}</span>
        <span className="node-label-text">{node.title}</span>
        <span className={`node-label-status status-${running ? 'running' : status === 'blocked' ? 'failed' : 'done'}`}>{done ? '完成' : running ? '生成中' : status === 'blocked' ? '取消' : '等待'}</span>
      </div>
      {mode === 'assisted' && (running || done) ? (
        <div className="smart-flow-card-actions node-tools">
          {running ? <button type="button" className="node-tool-btn node-cancel-btn" data-tip="取消" onClick={onCancel} disabled={disabled}><XCircle size={14} /></button> : null}
          {done ? <button type="button" className="node-tool-btn" data-tip="编辑" onClick={onEdit} disabled={disabled}><Pencil size={14} /></button> : null}
          {done && hasNext ? <button type="button" className="node-tool-btn smart-next-node-btn" data-tip="下一步" onClick={onNext} disabled={disabled}><ArrowRight size={15} /></button> : null}
        </div>
      ) : null}
      <div className="smart-node-preview preview-card">
        {showImage && coverArtifact ? <img src={buildArtifactRawUrl(coverArtifact)} alt={node.title} /> : null}
        {showVideo && coverArtifact ? <video src={buildArtifactRawUrl(coverArtifact)} muted playsInline /> : null}
        {!showImage && !showVideo ? (
          <div className="preview-empty-box">
            <span className="preview-empty-icon">{node.kind === 'videos' ? '▶' : node.kind === 'asset_images' || node.kind === 'storyboard_images' ? '◼' : '◆'}</span>
            <span className="preview-empty-text">{running ? '生成中' : done ? '等待结果封面' : '等待上一步'}</span>
          </div>
        ) : null}
        <div className="smart-node-content">
          <strong>{node.title}</strong>
          <p>{node.detail}</p>
          {node.artifactPath ? <em>{node.artifactPath}</em> : null}
        </div>
      </div>
    </article>
  );
}

function SmartProductionCanvas({ scriptText, creativePlan, mode, source, snapshot, pipelineRunRegistry, runtimeLoading, onModeChange, onBack, onCreateRun, onOpenCanvas, onOpenArtifact, onShowMaintenance, onScriptChange }: { scriptText: string; creativePlan: CreativeStartResult | null; mode: ProductionMode; source: 'bridge' | 'bundled'; snapshot: ProjectSnapshot; pipelineRunRegistry: PipelineRunRegistry | null; runtimeLoading: boolean; onModeChange: (mode: ProductionMode) => void; onBack: () => void; onCreateRun: () => void; onOpenCanvas: (workflowId?: string | null) => void; onOpenArtifact: (artifact: string) => void | Promise<void>; onShowMaintenance: () => void; onScriptChange: (value: string) => void }) {
  const run = getLatestPipelineRun(pipelineRunRegistry);
  const currentStage = getCurrentPipelineStage(run);
  const activeWorkflow = getWorkflowForStage(snapshot.workflowRegistry, currentStage);
  const clipCount = creativePlan?.storyboard.clipCount ?? estimateClipCount(scriptText) ?? 1;
  const artifacts = snapshot.artifacts ?? [];
  const stageById = new Map((run?.stages ?? []).map((stage) => [stage.id, stage]));
  const planArtifacts = creativePlan?.artifactPaths;
  const fallbackShots = Array.from({ length: clipCount }, (_, index) => ({
    shotId: `shot-${String(index + 1).padStart(2, '0')}`,
    segment: `${index * 15}-${(index + 1) * 15}秒`,
    title: `第 ${index + 1} 段`,
    action: scriptText ? `根据剧本文本规划第 ${index + 1} 个 15 秒视频。` : '等待剧本分析结果。',
    characters: [],
    scene: '待分析场景'
  }));
  const shots = creativePlan?.storyboard.shots.length ? creativePlan.storyboard.shots : fallbackShots;
  const stageKeys: SmartFlowStageKey[] = ['planning', 'shot-list', 'asset-card', 'asset_images', 'storyboard_images', 'videos'];
  const flowNodes: SmartFlowNodeModel[] = shots.flatMap((shot, rowIndex) => stageKeys.map((kind, stageIndex) => {
    const stageId = getFlowStageWorkflowId(kind);
    const stage = stageId ? stageById.get(stageId) : null;
    const titleMap: Record<SmartFlowStageKey, string> = {
      planning: '剧集规划',
      'shot-list': '分镜表',
      'asset-card': '资产卡',
      asset_images: '资产图',
      storyboard_images: '故事板',
      videos: '视频'
    };
    const detailMap: Record<SmartFlowStageKey, string> = {
      planning: rowIndex === 0 ? `已规划 ${shots.length} 个 15 秒视频。` : `承接全片规划，生成第 ${rowIndex + 1} 段。`,
      'shot-list': shot.action ?? '拆解镜头、动作、场景和音频任务。',
      'asset-card': creativePlan ? `引用 ${creativePlan.assets.length} 项角色 / 场景 / 道具资产卡。` : '等待角色、场景、道具资产卡。',
      asset_images: stage?.artifactPaths?.[0] ?? '进入无限画布生成资产图并回写封面。',
      storyboard_images: stage?.artifactPaths?.[0] ?? '基于资产图生成故事板图。',
      videos: stage?.artifactPaths?.[0] ?? '基于故事板图生成视频片段。'
    };
    const artifactMap: Partial<Record<SmartFlowStageKey, string | undefined>> = {
      planning: planArtifacts?.scriptArtifactPath,
      'shot-list': planArtifacts?.storyboardArtifactPath,
      'asset-card': planArtifacts?.assetCardsArtifactPath,
      asset_images: stageById.get('asset_images')?.artifactPaths?.[0],
      storyboard_images: stageById.get('storyboard_images')?.artifactPaths?.[0],
      videos: stageById.get('videos')?.artifactPaths?.[0]
    };

    return {
      key: `${shot.shotId}-${kind}`,
      rowIndex,
      stageIndex,
      shotId: shot.shotId,
      segment: shot.segment ?? `${rowIndex * 15}-${(rowIndex + 1) * 15}秒`,
      kind,
      title: titleMap[kind],
      detail: detailMap[kind],
      artifactPath: artifactMap[kind],
      workflowStageId: stageId
    };
  }));
  const [revealedCount, setRevealedCount] = useState(0);
  const [completedKeys, setCompletedKeys] = useState<string[]>([]);
  const [cancelledKeys, setCancelledKeys] = useState<string[]>([]);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<SmartFlowNodeModel | null>(null);
  const [editorText, setEditorText] = useState('');
  const [editedCards, setEditedCards] = useState<Record<string, string>>({});
  const flowVersion = creativePlan?.planId ?? (scriptText ? 'draft-script' : 'empty');

  useEffect(() => {
    if (flowNodes.length === 0) {
      setRevealedCount(0);
      setCompletedKeys([]);
      setCancelledKeys([]);
      setRunningKey(null);
      return;
    }
    setRevealedCount(1);
    setCompletedKeys([]);
    setCancelledKeys([]);
    setRunningKey(flowNodes[0].key);
  }, [flowVersion]);

  useEffect(() => {
    if (!runningKey) return;
    const timer = window.setTimeout(() => {
      setCompletedKeys((current) => Array.from(new Set([...current, runningKey])));
      setRunningKey(null);
    }, 720);
    return () => window.clearTimeout(timer);
  }, [runningKey]);

  useEffect(() => {
    if (mode !== 'auto' || runningKey || revealedCount <= 0 || revealedCount >= flowNodes.length) return;
    const currentNode = flowNodes[revealedCount - 1];
    if (!currentNode || !completedKeys.includes(currentNode.key)) return;
    const timer = window.setTimeout(() => {
      const nextNode = flowNodes[revealedCount];
      setRevealedCount((current) => Math.min(current + 1, flowNodes.length));
      if (nextNode) setRunningKey(nextNode.key);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [mode, runningKey, revealedCount, completedKeys, flowNodes.length, flowVersion]);

  const getNodeStatus = (node: SmartFlowNodeModel): FlowCardStatus => {
    if (cancelledKeys.includes(node.key)) return 'blocked';
    if (runningKey === node.key) return 'running';
    if (completedKeys.includes(node.key)) return 'done';
    return 'waiting';
  };

  const revealNextNode = () => {
    if (revealedCount >= flowNodes.length) return;
    const nextNode = flowNodes[revealedCount];
    setRevealedCount((current) => Math.min(current + 1, flowNodes.length));
    if (nextNode) setRunningKey(nextNode.key);
  };

  const cancelNode = (node: SmartFlowNodeModel) => {
    setCancelledKeys((current) => Array.from(new Set([...current, node.key])));
    if (runningKey === node.key) setRunningKey(null);
  };

  const getEditorInitialText = (node: SmartFlowNodeModel) => {
    if (editedCards[node.key]) return editedCards[node.key];
    if (node.kind === 'planning') return scriptText;
    if (node.kind === 'shot-list') {
      const shot = creativePlan?.storyboard.shots.find((item) => item.shotId === node.shotId);
      return shot ? JSON.stringify(shot, null, 2) : node.detail;
    }
    if (node.kind === 'asset-card') return JSON.stringify(creativePlan?.assets ?? [], null, 2);
    const workflow = node.workflowStageId ? getWorkflowForStage(snapshot.workflowRegistry, stageById.get(node.workflowStageId)) : null;
    return workflow ? JSON.stringify(workflow, null, 2) : node.detail;
  };

  const openEditor = (node: SmartFlowNodeModel) => {
    setEditingNode(node);
    setEditorText(getEditorInitialText(node));
  };

  const saveEditor = () => {
    if (!editingNode) return;
    if (editingNode.kind === 'planning') onScriptChange(editorText);
    setEditedCards((current) => ({ ...current, [editingNode.key]: editorText }));
    setEditingNode(null);
  };

  const getWorkflowForNode = (node: SmartFlowNodeModel | null) => {
    if (!node?.workflowStageId) return null;
    return getWorkflowForStage(snapshot.workflowRegistry, stageById.get(node.workflowStageId));
  };

  const getCoverArtifact = (node: SmartFlowNodeModel) => {
    const stageArtifacts = node.workflowStageId ? stageById.get(node.workflowStageId)?.artifactPaths ?? [] : [];
    const candidates = [...stageArtifacts, ...artifacts];
    if (node.kind === 'asset_images') return candidates.find((artifact) => artifact.includes('资产图') && isPreviewImageArtifact(artifact));
    if (node.kind === 'storyboard_images') return candidates.find((artifact) => artifact.includes('故事板') && isPreviewImageArtifact(artifact));
    if (node.kind === 'videos') return candidates.find((artifact) => artifact.includes('03-视频') && isPreviewVideoArtifact(artifact));
    return null;
  };

  const visibleNodes = flowNodes.slice(0, revealedCount);
  const visibleNodeKeys = new Set(visibleNodes.map((node) => node.key));
  const rows = shots.map((shot, rowIndex) => ({
    rowIndex,
    label: `${shot.segment ?? `${rowIndex * 15}-${(rowIndex + 1) * 15}秒`} 视频流程`,
    nodes: flowNodes.filter((node) => node.rowIndex === rowIndex && visibleNodeKeys.has(node.key))
  })).filter((row) => row.nodes.length > 0);
  const currentVisibleNode = visibleNodes.at(-1) ?? null;
  const currentVisibleStatus = currentVisibleNode ? getNodeStatus(currentVisibleNode) : 'waiting';
  const currentWorkflow = getWorkflowForNode(currentVisibleNode);
  const completedCount = completedKeys.length;
  const totalCount = flowNodes.length;

  return (
    <main className="smart-canvas-page">
      <header className="smart-canvas-topbar">
        <div>
          <span>智能画布</span>
          <strong>{run ? `${run.episodeId ?? 'ep001'} · ${completedCount}/${totalCount}` : '等待创建生产流程'}</strong>
        </div>
        <div className="smart-canvas-actions">
          <button type="button" className={mode === 'assisted' ? 'active' : ''} onClick={() => onModeChange('assisted')}>半自动</button>
          <button type="button" className={mode === 'auto' ? 'active' : ''} onClick={() => onModeChange('auto')}>全自动</button>
          <button type="button" onClick={onBack}>编辑剧本</button>
          <button type="button" onClick={onShowMaintenance}>维护</button>
        </div>
      </header>
      <section className="smart-canvas-summary">
        <div>
          <span>当前结果</span>
          <strong>{currentVisibleNode ? `${currentVisibleNode.segment} · ${currentVisibleNode.title} · ${currentVisibleStatus}` : currentStage ? `${stageTitleMap[currentStage.id] ?? currentStage.title} · ${currentStage.status}` : '已完成剧本输入'}</strong>
          <p>{currentVisibleNode?.detail ?? activeWorkflow?.name ?? activeWorkflow?.path ?? '点击开始创作后生成第一阶段工作流。'}</p>
        </div>
        <div className="smart-canvas-summary-actions">
          {!run ? <button type="button" onClick={onCreateRun} disabled={runtimeLoading}>生成生产流程</button> : null}
          {currentWorkflow?.runUrl ? <button type="button" onClick={() => onOpenCanvas(currentWorkflow.id)} disabled={runtimeLoading}>打开画布执行</button> : null}
          {mode === 'assisted' && currentVisibleNode && currentVisibleStatus === 'done' && revealedCount < flowNodes.length ? <button type="button" onClick={revealNextNode} disabled={runtimeLoading}>下一步</button> : null}
        </div>
      </section>
      <section className="smart-flow-board">
        {rows.map((row) => (
          <div className="smart-flow-row" key={row.label}>
            <h3>{row.label}</h3>
            <div className="smart-flow-track">
              {row.nodes.map((node, index) => {
                const status = getNodeStatus(node);
                return (
                <div className="smart-flow-step" key={node.key}>
                  <SmartFlowCard node={node} status={status} mode={mode} coverArtifact={getCoverArtifact(node)} hasNext={revealedCount < flowNodes.length} onEdit={() => openEditor(node)} onNext={revealNextNode} onCancel={() => cancelNode(node)} disabled={runtimeLoading} />
                  {index < row.nodes.length - 1 ? <div className={`smart-flow-connector ${status === 'done' ? 'flow-active' : ''}`}><span /></div> : null}
                </div>
              );
              })}
            </div>
          </div>
        ))}
      </section>
      <footer className="smart-canvas-foot">
        <span>数据源：{source === 'bridge' ? '实时 Bridge' : '构建快照'}</span>
        <span>已规划：{shots.length} 个 15 秒视频</span>
        <span>{mode === 'auto' ? '全自动模式：节点完成后自动展开下一个节点。' : '半自动模式：节点完成后点击下一步展开下一个节点。'}</span>
      </footer>
      {editingNode ? (
        <section className="smart-node-editor-page" role="dialog" aria-modal="true">
          <div className="smart-node-editor-shell">
            <header>
              <div>
                <span>{editingNode.segment}</span>
                <strong>{getFlowEditorTitle(editingNode.kind)}</strong>
              </div>
              <button type="button" onClick={() => setEditingNode(null)}>返回智能画布</button>
            </header>
            {editingNode.workflowStageId ? (
              <div className="smart-workflow-editor">
                <div className="smart-workflow-editor-main">
                  <textarea value={editorText} onChange={(event) => setEditorText(event.target.value)} />
                </div>
                <aside>
                  <strong>{getWorkflowForNode(editingNode)?.name ?? 'Workflow 尚未就绪'}</strong>
                  <p>{getWorkflowForNode(editingNode)?.path ?? '当前节点会在上游完成后自动生成无限画布工作流。'}</p>
                  {getWorkflowForNode(editingNode)?.runUrl ? <button type="button" onClick={() => onOpenCanvas(getWorkflowForNode(editingNode)?.id)}>进入无限画布编辑 / 执行</button> : null}
                  {getWorkflowForNode(editingNode)?.path ? <button type="button" onClick={() => void onOpenArtifact(getWorkflowForNode(editingNode)?.path ?? '')}>查看 Workflow JSON</button> : null}
                  {editingNode.artifactPath ? <button type="button" onClick={() => void onOpenArtifact(editingNode.artifactPath ?? '')}>查看回写产物</button> : null}
                </aside>
              </div>
            ) : (
              <div className="smart-text-editor">
                <textarea value={editorText} onChange={(event) => setEditorText(event.target.value)} />
                <div className="smart-text-editor-actions">
                  {editingNode.artifactPath ? <button type="button" onClick={() => void onOpenArtifact(editingNode.artifactPath ?? '')}>打开已生成文件</button> : null}
                  <button type="button" onClick={saveEditor}>保存</button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProductionReadinessPanel({ source, diagnostics, pipelineRunRegistry, releaseRegistry, canvasStatus, workflowRegistry, canvasOutputs, canvasRunLedger, runtimeSmokeResult, pipelineRunSmokeResult, releasePublishSmokeResult, canvasOutputRegisterResult, canvasRunSessionResult, runtimeLoading, onRuntimeSmoke, onPipelineRunSmoke, onReleasePublishSmoke, onPipelineRunsRefresh, onPipelineRunCreate, onPipelineRunAdvance, onPipelineRunRepairPreview, onCanvasRunSessionStart, onCanvasRunSessionStatusChange, onArtifactOpen, onCanvasOutputRegister }: { source: 'bridge' | 'bundled'; diagnostics: WorkflowRuntimeDiagnostics | null; pipelineRunRegistry: PipelineRunRegistry | null; releaseRegistry?: ReleaseRegistry; canvasStatus: CanvasStatus; workflowRegistry: WorkflowRegistry; canvasOutputs: CanvasOutputRecord[]; canvasRunLedger?: CanvasRunLedger; runtimeSmokeResult: SmartVisionRuntimeSmokeResult | null; pipelineRunSmokeResult: PipelineRunSmokeResult | null; releasePublishSmokeResult: ReleasePublishQueueSmokeResult | null; canvasOutputRegisterResult: CanvasOutputRegisterResult | null; canvasRunSessionResult: CanvasRunSessionResult | null; runtimeLoading: boolean; onRuntimeSmoke: () => void; onPipelineRunSmoke: () => void; onReleasePublishSmoke: () => void; onPipelineRunsRefresh: () => void; onPipelineRunCreate: () => void; onPipelineRunAdvance: () => void; onPipelineRunRepairPreview: () => void; onCanvasRunSessionStart: (input: { workflowId?: string; workflowPath?: string; pipelineRunId?: string | null; stageId?: string | null; outputArtifactHint?: string; outputArtifactHints?: string[]; importUrl?: string; editUrl?: string; runUrl?: string }) => void; onCanvasRunSessionStatusChange: (sessionId: string, status: string) => void; onArtifactOpen: (artifact: string) => void | Promise<void>; onCanvasOutputRegister: (input: CanvasOutputRegisterInput, dryRun: boolean) => void }) {
  const [canvasOutputLocalPath, setCanvasOutputLocalPath] = useState('');
  const [canvasOutputArtifactPath, setCanvasOutputArtifactPath] = useState('');
  const [canvasOutputKey, setCanvasOutputKey] = useState('');
  const [canvasOutputCopyStatus, setCanvasOutputCopyStatus] = useState('');
  const issueCount = diagnostics?.counts.issueCount ?? diagnostics?.issues.length ?? 0;
  const releases = releaseRegistry?.releases ?? [];
  const gateBlockerCount = releases.reduce((sum, release) => sum + (release.publishGate?.blockers.length ?? 0), 0);
  const publishedCount = releases.filter((release) => release.status === 'published').length;
  const approvedCount = releases.filter((release) => release.status === 'approved').length;
  const runs = pipelineRunRegistry?.runs ?? [];
  const latestRun = sortByUpdatedAt(runs).at(-1) ?? null;
  const activeRun = sortByUpdatedAt(runs).reverse().find((run) => run.status !== 'done') ?? latestRun;
  const activeStage = activeRun?.stages.find((stage) => stage.id === activeRun.currentStageId) ?? activeRun?.stages.find((stage) => stage.status !== 'done') ?? activeRun?.stages.at(-1) ?? null;
  const canAdvanceRun = Boolean(activeRun && activeRun.status !== 'done');
  const activeWorkflow = workflowRegistry.workflows.find((workflow) => workflow.id === activeStage?.workflowId || workflow.path === activeStage?.workflowPath) ?? null;
  const stageBlockers = [...(activeStage?.blockers ?? []), ...(activeStage?.gate?.blockers ?? [])];
  const outputHints = activeStage?.outputArtifacts?.length ? activeStage.outputArtifacts : activeWorkflow?.outputArtifacts ?? [];
  const concreteOutputHints = Array.from(new Set(outputHints.filter(isConcreteArtifactTarget)));
  const expectedOutput = concreteOutputHints[0] ?? outputHints[0] ?? '等待 Workflow 输出路径';
  const effectiveCanvasOutputArtifact = canvasOutputArtifactPath.trim() || (expectedOutput === '等待 Workflow 输出路径' ? '' : expectedOutput);
  const canvasRunSessions = canvasRunLedger?.sessions ?? [];
  const activeCanvasRunSession = [...canvasRunSessions].reverse().find((session) => session.workflowId === activeWorkflow?.id && !isClosedCanvasRunStatus(session.status)) ?? null;
  const latestWorkflowCanvasRunSession = [...canvasRunSessions].filter((session) => session.workflowId === activeWorkflow?.id).sort((left, right) => String(left.updatedAt ?? left.createdAt ?? '').localeCompare(String(right.updatedAt ?? right.createdAt ?? ''))).at(-1) ?? null;
  const selectedCanvasRunSession = activeCanvasRunSession ?? latestWorkflowCanvasRunSession;
  const latestCanvasRunSession = [...canvasRunSessions].sort((left, right) => String(left.updatedAt ?? left.createdAt ?? '').localeCompare(String(right.updatedAt ?? right.createdAt ?? ''))).at(-1) ?? null;
  const recentCanvasRunSessions = [...canvasRunSessions].sort((left, right) => String(right.updatedAt ?? right.createdAt ?? '').localeCompare(String(left.updatedAt ?? left.createdAt ?? ''))).slice(0, 5);
  const canvasRunOpenCount = canvasRunSessions.filter((session) => !isClosedCanvasRunStatus(session.status)).length;
  const artifactTargetReady = isConcreteArtifactTarget(effectiveCanvasOutputArtifact);
  const localPathReady = Boolean(canvasOutputLocalPath.trim());
  const writebackSessionReady = Boolean(selectedCanvasRunSession?.id);
  const defaultIdempotencyKey = ['ui-writeback', activeRun?.id, activeStage?.id, activeWorkflow?.id, slugForKey(effectiveCanvasOutputArtifact) || inferMediaTypeFromArtifactPath(effectiveCanvasOutputArtifact)]
    .map((item) => slugForKey(item))
    .filter(Boolean)
    .join(':');
  const effectiveIdempotencyKey = canvasOutputKey.trim() || defaultIdempotencyKey || undefined;
  const writebackPreviewReady = Boolean(activeWorkflow && artifactTargetReady);
  const writebackReady = writebackPreviewReady && localPathReady;
  const writebackChecks = [
    { id: 'local-path', label: '本地文件', ok: localPathReady, detail: canvasOutputLocalPath.trim() || '未填写，确认回写前必须提供' },
    { id: 'artifact-target', label: '目标路径', ok: artifactTargetReady, detail: artifactTargetReady ? effectiveCanvasOutputArtifact : (effectiveCanvasOutputArtifact ? '当前是模板或目录，需填写具体文件名' : '未定位输出文件') },
    { id: 'run-session', label: 'RUN 会话', ok: writebackSessionReady, detail: selectedCanvasRunSession ? `${selectedCanvasRunSession.status} · ${selectedCanvasRunSession.id}` : '未绑定，可先创建 RUN 会话', optional: true },
    { id: 'idempotency', label: '幂等键', ok: Boolean(effectiveIdempotencyKey), detail: canvasOutputKey.trim() ? '手动设置' : (defaultIdempotencyKey ? '自动生成' : '等待 workflow') },
    { id: 'media-type', label: '媒体类型', ok: artifactTargetReady, detail: inferMediaTypeFromArtifactPath(effectiveCanvasOutputArtifact), optional: true }
  ];
  const workflowImportReady = activeWorkflow?.importCheck?.ok ?? Boolean(activeWorkflow?.runUrl);
  const workflowNodeSummary = activeWorkflow?.importCheck ? `${activeWorkflow.importCheck.nodeCount} nodes / ${activeWorkflow.importCheck.connCount} conns` : `${activeWorkflow?.nodeCount ?? 0} nodes`;
  const canvasFailureCount = canvasOutputs.filter(isCanvasOutputProblem).length;
  const importCheckedCount = workflowRegistry.workflows.filter((workflow) => workflow.importCheck?.ok).length;
  const importTotal = workflowRegistry.workflows.length;
  const importIssueCount = workflowRegistry.workflows.filter((workflow) => workflow.importCheck && !workflow.importCheck.ok).length;
  const workbench = canvasStatus.workbench;
  const workbenchOnline = canvasStatus.health === 'online' || workbench?.healthOk === true || workbench?.health === 'online';
  const readEndpointReady = workbench?.readEndpointReady === true;
  const bridgeRewriteReady = workbench?.bridgeBaseRewrite === 'enabled';
  const workbenchOutputsMounted = Boolean(workbench?.smartVisionOutputsRoot);
  const canvasInputReady = workbenchOnline && readEndpointReady && bridgeRewriteReady && workbenchOutputsMounted;
  const canvasIntegrationIssues = [
    !workbenchOnline ? 'workbench offline' : null,
    !workbenchOutputsMounted ? 'outputs root missing' : null,
    !readEndpointReady ? '/read not ready' : null,
    !bridgeRewriteReady ? 'bridgeBase rewrite missing' : null
  ].filter(Boolean);
  const lastSmokeStatus = runtimeSmokeResult?.status ?? '未运行';
  const lastPipelineSmokeStatus = pipelineRunSmokeResult?.status ?? '未运行';
  const lastReleaseSmokeStatus = releasePublishSmokeResult?.steps.at(-1)?.status ?? '未运行';

  let readinessScore = 100;
  if (source !== 'bridge') readinessScore -= 12;
  readinessScore -= Math.min(issueCount * 8, 32);
  readinessScore -= Math.min(gateBlockerCount * 6, 24);
  readinessScore -= Math.min(canvasFailureCount * 8, 24);
  if (!canvasInputReady) readinessScore -= 12;
  if (!activeRun) readinessScore -= 10;
  if (importTotal === 0 || importCheckedCount < importTotal) readinessScore -= 10;
  if (publishedCount === 0) readinessScore -= 6;
  readinessScore = Math.max(0, readinessScore);

  const readinessTone = readinessScore >= 90 && issueCount === 0 && gateBlockerCount === 0 && canvasFailureCount === 0 ? 'ready' : readinessScore >= 72 ? 'attention' : 'blocked';
  const readinessLabel = readinessTone === 'ready' ? '生产可用' : readinessTone === 'attention' ? '需要关注' : '存在阻塞';
  const nextAction = canvasInputReady ? diagnostics?.nextActions?.[0] ?? (gateBlockerCount > 0 ? '先处理发布门禁阻塞，再运行发布队列。' : canvasFailureCount > 0 ? '先处理画布回写失败记录。' : '建议定期运行端到端自测和流水线 dry-run。') : `先处理画布集成：${canvasIntegrationIssues.join(' / ')}`;

  const cards = [
    { label: '状态源', value: source === 'bridge' ? '实时 Bridge' : '构建快照', detail: canvasStatus.bridgeBase ?? workflowRegistry.bridgeBase ?? 'bridgeBase 未配置', tone: source === 'bridge' ? 'ok' : 'warn' },
    { label: '流水线', value: activeRun ? activeRun.status : '未创建', detail: activeStage ? `${activeStage.title} / ${activeStage.status}` : `${runs.length} 个实例`, tone: activeRun && !['blocked', 'failed'].includes(activeRun.status) ? 'ok' : 'warn' },
    { label: '发布门禁', value: `${publishedCount} 已发布`, detail: `${approvedCount} approved / ${gateBlockerCount} blockers`, tone: gateBlockerCount === 0 ? 'ok' : 'warn' },
    { label: '画布回写', value: `${canvasOutputs.length} 记录`, detail: `${canvasFailureCount} 异常 / health ${canvasStatus.health}`, tone: canvasFailureCount === 0 ? 'ok' : 'warn' },
    { label: '画布输入', value: canvasInputReady ? 'ready' : 'attention', detail: `${readEndpointReady ? '/read ok' : '/read 待修'} / ${bridgeRewriteReady ? 'URL rewrite ok' : 'rewrite 待修'}`, tone: canvasInputReady ? 'ok' : 'warn' },
    { label: '画布 RUN', value: latestCanvasRunSession ? latestCanvasRunSession.status : '未记录', detail: `${canvasRunSessions.length} 会话 / ${canvasRunOpenCount} 未闭合`, tone: canvasRunOpenCount === 0 ? 'ok' : 'neutral' },
    { label: 'Workflow 导入', value: `${importCheckedCount}/${importTotal}`, detail: importIssueCount > 0 ? `${importIssueCount} 个 importCheck 异常` : 'JSON 可导入画布', tone: importTotal > 0 && importCheckedCount === importTotal ? 'ok' : 'warn' },
    { label: '自测结果', value: lastSmokeStatus, detail: `pipeline ${lastPipelineSmokeStatus} / release ${lastReleaseSmokeStatus}`, tone: ['passed', 'done', 'published', 'blocked'].includes(String(lastSmokeStatus)) ? 'ok' : 'neutral' }
  ];
  const buildCanvasOutputInput = (): CanvasOutputRegisterInput => ({
    workflowId: activeWorkflow?.id,
    workflowPath: activeWorkflow?.path ?? activeStage?.workflowPath ?? undefined,
    runSessionId: selectedCanvasRunSession?.id,
    artifactPath: effectiveCanvasOutputArtifact || undefined,
    outputArtifactHint: effectiveCanvasOutputArtifact || undefined,
    localPath: canvasOutputLocalPath.trim() || undefined,
    idempotencyKey: effectiveIdempotencyKey,
    mediaType: inferMediaTypeFromArtifactPath(effectiveCanvasOutputArtifact),
    resetBlocked: true
  });
  const copyCanvasOutputPayload = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ ...buildCanvasOutputInput(), dryRun: false }, null, 2));
      setCanvasOutputCopyStatus('回写 JSON 已复制');
    } catch {
      setCanvasOutputCopyStatus('复制失败，请手动检查浏览器剪贴板权限');
    }
  };
  const registeredCanvasArtifact = canvasOutputRegisterResult?.artifactPath ?? canvasOutputRegisterResult?.materialized?.artifactPath ?? '';
  const startCanvasRunSession = () => onCanvasRunSessionStart({
    workflowId: activeWorkflow?.id,
    workflowPath: activeWorkflow?.path ?? activeStage?.workflowPath ?? undefined,
    pipelineRunId: activeRun?.id ?? null,
    stageId: activeStage?.id ?? null,
    outputArtifactHint: artifactTargetReady ? effectiveCanvasOutputArtifact : concreteOutputHints[0] ?? outputHints[0] ?? undefined,
    outputArtifactHints: concreteOutputHints.length > 0 ? concreteOutputHints : outputHints,
    importUrl: activeWorkflow?.importUrl,
    editUrl: activeWorkflow?.editUrl,
    runUrl: activeWorkflow?.runUrl
  });
  const activeSessionId = selectedCanvasRunSession?.id ?? latestCanvasRunSession?.id ?? '';

  return (
    <section className={`readiness-panel ${readinessTone}`}>
      <div className="readiness-head">
        <div>
          <p className="eyebrow">Production Readiness</p>
          <h2>生产就绪总控</h2>
          <p>{nextAction}</p>
        </div>
        <div className="readiness-score">
          <strong>{readinessScore}</strong>
          <span>{readinessLabel}</span>
        </div>
      </div>
      <div className="readiness-grid">
        {cards.map((card) => (
          <article key={card.label} className={`readiness-card ${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
      <div className="readiness-live-run">
        <div className="readiness-live-copy">
          <span>当前画布执行位</span>
          <strong>{activeStage ? `${activeStage.title} · ${activeStage.status}` : '暂无 Pipeline Run'}</strong>
          <p>{activeWorkflow ? activeWorkflow.name : activeStage?.workflowPath ?? '先创建或刷新 Pipeline Run。'}</p>
        </div>
        <div className="readiness-live-meta">
          <span className={workflowImportReady ? 'ok' : 'warn'}>导入：{workflowImportReady ? '可用' : '待修复'} · {workflowNodeSummary}</span>
          <span>Workflow：{activeWorkflow?.path ?? activeStage?.workflowPath ?? '未挂载'}</span>
          <span>回写目标：{expectedOutput}</span>
          <span>阻塞：{stageBlockers.length > 0 ? stageBlockers.map((blocker) => blocker.code).join(' / ') : '无'}</span>
          <span>RUN 会话：{selectedCanvasRunSession ? `${selectedCanvasRunSession.status} · ${selectedCanvasRunSession.id}` : '未创建'}</span>
        </div>
        <div className="readiness-run-actions">
          {activeWorkflow?.runUrl ? <a href={activeWorkflow.runUrl} target="_blank" rel="noreferrer">导入执行</a> : <button type="button" disabled>导入执行</button>}
          {activeWorkflow?.editUrl ? <a href={activeWorkflow.editUrl} target="_blank" rel="noreferrer">编辑画布</a> : null}
          {activeWorkflow?.path ? <button type="button" onClick={() => void onArtifactOpen(activeWorkflow.path)}>查看 JSON</button> : null}
          <button type="button" onClick={startCanvasRunSession} disabled={runtimeLoading || !activeWorkflow}>创建 RUN 会话</button>
        </div>
        {activeSessionId ? (
          <div className="readiness-session-controls">
            <span>生命周期：{selectedCanvasRunSession?.status ?? latestCanvasRunSession?.status}</span>
            <button type="button" onClick={() => onCanvasRunSessionStatusChange(activeSessionId, 'running')} disabled={runtimeLoading}>标记运行中</button>
            <button type="button" onClick={() => onCanvasRunSessionStatusChange(activeSessionId, 'done')} disabled={runtimeLoading}>标记完成</button>
            <button type="button" onClick={() => onCanvasRunSessionStatusChange(activeSessionId, 'failed')} disabled={runtimeLoading}>标记失败</button>
            <button type="button" onClick={() => onCanvasRunSessionStatusChange(activeSessionId, 'cancelled')} disabled={runtimeLoading}>取消</button>
          </div>
        ) : null}
        {recentCanvasRunSessions.length > 0 ? (
          <div className="readiness-session-list">
            {recentCanvasRunSessions.map((session) => (
              <article className={`readiness-session-card ${session.status}`} key={session.id}>
                <div>
                  <strong>{session.status} · {session.workflowType ?? session.workflowId}</strong>
                  <span>{session.stageTitle ?? session.stageId ?? 'ad-hoc'} · {session.updatedAt ?? session.createdAt}</span>
                  <span>{session.artifactPath ?? session.outputArtifactHints?.[0] ?? session.workflowPath}</span>
                </div>
                <div className="readiness-session-card-actions">
                  {!isClosedCanvasRunStatus(session.status) ? (
                    <>
                      <button type="button" onClick={() => onCanvasRunSessionStatusChange(session.id, 'running')} disabled={runtimeLoading || session.status === 'running'}>运行中</button>
                      <button type="button" onClick={() => onCanvasRunSessionStatusChange(session.id, 'done')} disabled={runtimeLoading}>完成</button>
                      <button type="button" onClick={() => onCanvasRunSessionStatusChange(session.id, 'failed')} disabled={runtimeLoading}>失败</button>
                    </>
                  ) : <span>closed</span>}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
      <div className="readiness-integration">
        <article className={workbenchOnline ? 'passed' : 'blocked'}>
          <span>Workbench</span>
          <strong>{workbenchOnline ? 'online' : 'offline'}</strong>
          <p>{workbench?.origin ?? canvasStatus.url}</p>
        </article>
        <article className={workbenchOutputsMounted ? 'passed' : 'blocked'}>
          <span>Outputs 挂载</span>
          <strong>{workbenchOutputsMounted ? '已注入' : '缺失'}</strong>
          <p>{workbench?.smartVisionOutputsRoot ?? 'SMART_VISION_OUTPUTS_DIR 未返回'}</p>
        </article>
        <article className={readEndpointReady ? 'passed' : 'blocked'}>
          <span>参考图读取</span>
          <strong>{readEndpointReady ? '可读取' : '不可读取'}</strong>
          <p>{workbench?.readProbeStatus ?? 0} · {workbench?.readProbeContentType ?? 'unknown'} · {workbench?.readProbePath ?? '未探测'}</p>
        </article>
        <article className={bridgeRewriteReady ? 'passed' : 'blocked'}>
          <span>Bridge URL</span>
          <strong>{bridgeRewriteReady ? '自动重写' : '未确认'}</strong>
          <p>导入旧 workflow 时使用当前 {canvasStatus.bridgeBase ?? workflowRegistry.bridgeBase ?? 'bridgeBase'}</p>
        </article>
      </div>
      <div className="readiness-writeback">
        <div className="readiness-live-copy">
          <span>画布产物回写</span>
          <strong>真实 RUN 后登记输出</strong>
          <p>填入画布生成后的本地文件路径，平台会物化到 outputs、登记 artifact/review，并推进 Pipeline。</p>
        </div>
        <div className="readiness-writeback-form">
          <input value={canvasOutputLocalPath} onChange={(event) => setCanvasOutputLocalPath(event.target.value)} placeholder="/private/tmp/canvas-output.png 或画布保存路径" disabled={runtimeLoading} aria-label="画布输出本地文件路径" />
          {outputHints.length > 0 ? (
            <select value={outputHints.includes(canvasOutputArtifactPath) ? canvasOutputArtifactPath : ''} onChange={(event) => event.target.value ? setCanvasOutputArtifactPath(event.target.value) : undefined} disabled={runtimeLoading} aria-label="选择当前阶段输出目标">
              <option value="">选择当前阶段输出目标</option>
              {outputHints.map((hint) => <option key={hint} value={hint} disabled={!isConcreteArtifactTarget(hint)}>{hint}{isConcreteArtifactTarget(hint) ? '' : '（模板）'}</option>)}
            </select>
          ) : null}
          <input value={canvasOutputArtifactPath} onChange={(event) => setCanvasOutputArtifactPath(event.target.value)} placeholder={expectedOutput} disabled={runtimeLoading} aria-label="画布输出目标 artifact 路径" />
          <input value={canvasOutputKey} onChange={(event) => setCanvasOutputKey(event.target.value)} placeholder="可选 idempotencyKey" disabled={runtimeLoading} aria-label="画布输出幂等键" />
          <button type="button" onClick={() => setCanvasOutputArtifactPath(concreteOutputHints[0] ?? '')} disabled={runtimeLoading || concreteOutputHints.length === 0}>使用 RUN 目标</button>
          <button type="button" onClick={() => setCanvasOutputKey(defaultIdempotencyKey)} disabled={runtimeLoading || !activeWorkflow || !defaultIdempotencyKey}>生成幂等键</button>
          {canvasOutputCopyStatus ? <span className="readiness-copy-status">{canvasOutputCopyStatus}</span> : null}
        </div>
        <div className="readiness-writeback-checks">
          {writebackChecks.map((check) => (
            <span className={check.ok ? 'ok' : check.optional ? 'neutral' : 'warn'} key={check.id}>
              <strong>{check.label}</strong>
              {check.detail}
            </span>
          ))}
        </div>
        <div className="readiness-run-actions">
          <button type="button" onClick={() => onCanvasOutputRegister(buildCanvasOutputInput(), true)} disabled={runtimeLoading || !writebackPreviewReady}>回写预览</button>
          <button type="button" onClick={() => onCanvasOutputRegister(buildCanvasOutputInput(), false)} disabled={runtimeLoading || !writebackReady}>确认回写</button>
          <button type="button" onClick={() => void copyCanvasOutputPayload()} disabled={runtimeLoading || !writebackPreviewReady}>复制 JSON</button>
        </div>
        {canvasOutputRegisterResult ? (
          <div className={canvasOutputRegisterResult.status === 'failed' ? 'readiness-writeback-result failed' : 'readiness-writeback-result'}>
            <span>{canvasOutputRegisterResult.dryRun ? '预览' : '写入'} · {canvasOutputRegisterResult.status} · {canvasOutputRegisterResult.idempotent ? 'idempotent' : 'new'}</span>
            <span>artifact：{canvasOutputRegisterResult.artifactPath ?? canvasOutputRegisterResult.materialized?.artifactPath ?? '未生成'}</span>
            <span>review：{canvasOutputRegisterResult.reviewId ?? canvasOutputRegisterResult.canvasOutputRecord?.reviewId ?? '待创建'}</span>
            <span>target：{canvasOutputRegisterResult.materialized?.targetPath ?? '未解析'}</span>
            <span>source：{canvasOutputRegisterResult.materialized?.sourcePath ? (canvasOutputRegisterResult.materialized.sourceExists === false ? 'missing' : 'exists') : '未填写'}</span>
            {registeredCanvasArtifact ? <button type="button" onClick={() => void onArtifactOpen(registeredCanvasArtifact)}>打开产物</button> : null}
          </div>
        ) : null}
        {canvasRunSessionResult ? (
          <div className="readiness-session-result">
            <span>RUN 会话：{canvasRunSessionResult.status} · {canvasRunSessionResult.session.status}</span>
            <span>{canvasRunSessionResult.session.id}</span>
          </div>
        ) : null}
      </div>
      <div className="readiness-actions">
        <button type="button" onClick={onRuntimeSmoke} disabled={runtimeLoading}>{runtimeLoading ? '处理中...' : '端到端自测'}</button>
        <button type="button" onClick={onPipelineRunSmoke} disabled={runtimeLoading}>流水线 dry-run</button>
        <button type="button" onClick={onReleasePublishSmoke} disabled={runtimeLoading}>发布异常自测</button>
        <button type="button" onClick={onPipelineRunsRefresh} disabled={runtimeLoading}>刷新流水线</button>
        <button type="button" onClick={onPipelineRunCreate} disabled={runtimeLoading}>创建实例</button>
        <button type="button" onClick={onPipelineRunAdvance} disabled={runtimeLoading || !canAdvanceRun}>推进阶段</button>
        <button type="button" onClick={onPipelineRunRepairPreview} disabled={runtimeLoading}>修复预览</button>
        <a href={canvasStatus.url} target="_blank" rel="noreferrer">
          打开画布
          <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
}

function AppHeader({ canvasStatus }: { canvasStatus: CanvasStatus }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Smart Vision MVP v0.1</p>
        <h1>智能视界</h1>
        <p className="subtitle">面向 AI 短剧 / 漫剧工业化生产的本地平台壳层。</p>
      </div>
      <a className="primary-action" href={canvasStatus.url} target="_blank" rel="noreferrer">
        打开无限画布
        <ExternalLink size={16} />
      </a>
    </header>
  );
}

function Sidebar() {
  const navItems = [
    { icon: <LayoutDashboard size={18} />, label: '项目总览', active: true },
    { icon: <FolderKanban size={18} />, label: '单集看板' },
    { icon: <ShieldCheck size={18} />, label: '审核中心' },
    { icon: <FileJson size={18} />, label: 'Workflow JSON' },
    { icon: <Sparkles size={18} />, label: '能力包 Runtime' }
  ];

  return (
    <aside className="sidebar">
      <div className="brand-mark">SV</div>
      <nav>
        {navItems.map((item) => (
          <button key={item.label} className={item.active ? 'nav-item active' : 'nav-item'}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function ProjectOverview({ activeProject }: { activeProject: Project }) {
  return (
    <section className="panel project-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">当前项目</p>
          <h2>{activeProject.name}</h2>
        </div>
        <span className={activeProject.hasSmartVisionState ? 'state-pill ok' : 'state-pill warn'}>
          {activeProject.hasSmartVisionState ? '.smart-vision 已就绪' : '.smart-vision 待生成'}
        </span>
      </div>
      <p className="project-summary">{activeProject.summary}</p>
      <div className="meta-grid">
        <div>
          <span>项目路径</span>
          <strong>{activeProject.path}</strong>
        </div>
        <div>
          <span>当前阶段</span>
          <strong>{activeProject.phase}</strong>
        </div>
        <div>
          <span>当前集数</span>
          <strong>{activeProject.currentEpisode}</strong>
        </div>
        <div>
          <span>最近更新</span>
          <strong>{activeProject.updatedAt}</strong>
        </div>
      </div>
    </section>
  );
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <section className="panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Projects</p>
          <h2>项目列表</h2>
        </div>
        <span className="count-pill">{projects.length}</span>
      </div>
      <div className="project-list">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <h3>{project.name}</h3>
            <p>{project.path}</p>
            <span>{project.phase}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function EpisodeCard({ activeProject }: { activeProject: Project }) {
  const activeEpisode = activeProject.episodes[0];

  return (
    <section className="panel episode-card">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Episode</p>
          <h2>{activeEpisode.title}</h2>
        </div>
        <span className="state-pill ok">{activeEpisode.status}</span>
      </div>
      <div className="episode-stats">
        <div>
          <strong>{activeEpisode.storyboardCount}</strong>
          <span>分镜包</span>
        </div>
        <div>
          <strong>{activeEpisode.assetCount}</strong>
          <span>资产任务</span>
        </div>
        <div>
          <strong>{activeEpisode.promptCount}</strong>
          <span>长版提示词</span>
        </div>
      </div>
    </section>
  );
}

function CanvasCard({ canvasStatus }: { canvasStatus: CanvasStatus }) {
  return (
    <section className="panel canvas-card">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Legacy Canvas</p>
          <h2>无限画布入口</h2>
        </div>
        <span className="state-pill neutral">{canvasStatus.health}</span>
      </div>
      <p>{canvasStatus.note}</p>
      <div className="canvas-meta">
        <span>地址</span>
        <strong>{canvasStatus.url}</strong>
      </div>
      <div className="canvas-flags">
        <span>模型数量：{canvasStatus.modelCount}</span>
        <span>视频模型：{canvasStatus.hasVideoModels ? '已预留' : '未检测'}</span>
        {canvasStatus.bridgeBase ? <span>Bridge：{canvasStatus.bridgeBase}</span> : null}
      </div>
      <a className="secondary-action" href={canvasStatus.url} target="_blank" rel="noreferrer">
        在新窗口打开
        <ExternalLink size={15} />
      </a>
    </section>
  );
}

function WorkflowPanel({ registry, highlightedWorkflowId, workflowActionNotice, onArtifactOpen, onReviewStatusChange, onWorkflowStatusChange, onWorkflowOutputAdd, onWorkflowChainAction, onWorkflowArchive, onWorkflowRestore }: { registry?: WorkflowRegistry; highlightedWorkflowId: string | null; workflowActionNotice: string | null; onArtifactOpen: (artifact: string) => void; onReviewStatusChange: (reviewId: string, status: TaskStatus) => void; onWorkflowStatusChange: (workflowId: string, status: TaskStatus) => void; onWorkflowOutputAdd: (workflowId: string, artifactPath: string, resetBlocked?: boolean) => void; onWorkflowChainAction: (workflowId: string) => void; onWorkflowArchive: (workflowId: string) => void; onWorkflowRestore: (workflowId: string) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const safeRegistry = registry ?? {
    canvasUrl: 'http://127.0.0.1:8877/image-studio-canvas.html',
    bridgeBase: 'http://127.0.0.1:5188',
    workflows: [],
    note: '当前快照未包含 Workflow 注册表，已使用页面兜底配置。'
  };
  const visibleWorkflows = showArchived ? safeRegistry.workflows : safeRegistry.workflows.filter((workflow) => !workflow.archived);
  const archivedCount = safeRegistry.workflows.filter((workflow) => workflow.archived).length;
  const chainItems = safeRegistry.chains ?? [];
  const closedChainCount = chainItems.filter((item) => item.closed).length;
  const pendingChainItems = chainItems.filter((item) => !item.closed);
  const firstWorkflow = visibleWorkflows[0];
  const getWorkflowImportUrl = (workflowPath: string, params: Record<string, string> = {}) => {
    const searchParams = new URLSearchParams({
      workflowPath,
      bridgeBase: safeRegistry.bridgeBase ?? 'http://127.0.0.1:5188',
      ...params
    });

    return `${safeRegistry.canvasUrl}${safeRegistry.canvasUrl.includes('?') ? '&' : '?'}${searchParams.toString()}`;
  };
  const getWorkflowById = (workflowId?: string) => safeRegistry.workflows.find((workflow) => workflow.id === workflowId);
  const renderChainAction = (item: NonNullable<WorkflowRegistry['chains']>[number]) => {
    if (item.nextAction === 'approve_artifact_review') {
      const reviewId = item.lastOutputReviewId;
      return reviewId ? <button type="button" onClick={() => onReviewStatusChange(reviewId, 'done')}>通过产物审核</button> : null;
    }

    if (item.nextAction === 'fix_artifact_output') {
      const artifactPath = item.actionTarget;
      return artifactPath ? <button type="button" onClick={() => onArtifactOpen(artifactPath)}>预览返工产物</button> : null;
    }

    if (item.nextAction === 'import_downstream_workflow') {
      const downstreamWorkflow = getWorkflowById(item.downstreamWorkflowIds[0]);
      return downstreamWorkflow ? <a className="workflow-import-action" href={downstreamWorkflow.importUrl ?? getWorkflowImportUrl(downstreamWorkflow.path)} target="_blank" rel="noreferrer">导入下游 Workflow</a> : null;
    }

    if (item.nextAction === 'import_workflow') {
      const workflow = getWorkflowById(item.workflowId);
      return workflow ? <a className="workflow-import-action" href={workflow.importUrl ?? getWorkflowImportUrl(workflow.path)} target="_blank" rel="noreferrer">导入当前 Workflow</a> : null;
    }

    if (item.nextAction === 'add_output') {
      return <button type="button" onClick={() => onWorkflowStatusChange(item.workflowId, 'in_progress')}>标记执行中</button>;
    }

    if (item.nextAction === 'create_downstream_workflow') {
      return <button type="button" onClick={() => onWorkflowChainAction(item.workflowId)}>创建下游 Workflow</button>;
    }

    return <button type="button" onClick={() => onWorkflowChainAction(item.workflowId)}>{item.nextActionLabel}</button>;
  };

  return (
    <section className="panel workflow-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Workflow JSON</p>
          <h2>Workflow 注册表</h2>
        </div>
        <span className="count-pill">{visibleWorkflows.length}/{safeRegistry.workflows.length}</span>
      </div>
      <p>{safeRegistry.note}</p>
      {workflowActionNotice ? <div className="workflow-action-notice">{workflowActionNotice}</div> : null}
      {safeRegistry.updatedAt ? <em className="registry-updated">注册表更新：{safeRegistry.updatedAt}</em> : null}
      <div className="workflow-filter-bar">
        <span>已归档：{archivedCount}</span>
        <span>闭环链路：{closedChainCount}/{chainItems.length}</span>
        <span>待处理：{pendingChainItems.length}</span>
        <button type="button" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? '隐藏归档 Workflow' : '显示归档 Workflow'}
        </button>
      </div>
      {chainItems.length > 0 ? (
        <div className="workflow-chain-summary">
          {chainItems.slice(0, 6).map((item) => (
            <article className={item.closed ? 'workflow-chain-card closed' : 'workflow-chain-card'} key={item.workflowId}>
              <strong>{item.closed ? '已闭环' : '待推进'} · {item.workflowType}</strong>
              <span>Workflow：{item.workflowId}</span>
              <span>下一步：{item.nextActionLabel}</span>
              <span>目标：{item.actionTarget ?? '待确认'}</span>
              {item.reviewStatus ? <span>审核：{statusLabel[item.reviewStatus]}</span> : null}
              {item.downstreamWorkflowIds.length > 0 ? <span>下游：{item.downstreamWorkflowIds.join(' / ')}</span> : null}
              <div className="inline-actions">{renderChainAction(item)}</div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="workflow-actions">
        <a className="secondary-action" href={safeRegistry.canvasUrl} target="_blank" rel="noreferrer">
          打开无限画布
          <ExternalLink size={15} />
        </a>
        {firstWorkflow ? (
          <>
            <button type="button" onClick={() => onArtifactOpen(firstWorkflow.path)}>预览首个可导入 Workflow</button>
            <a className="workflow-import-action" href={getWorkflowImportUrl(firstWorkflow.path)} target="_blank" rel="noreferrer">一键导入首个 Workflow</a>
          </>
        ) : (
          <button type="button" disabled>暂无可导入 Workflow</button>
        )}
      </div>
      {visibleWorkflows.length > 0 ? (
        <div className="workflow-list">
          {visibleWorkflows.map((workflow) => (
            <article className={`${workflow.archived ? 'workflow-item archived' : 'workflow-item'}${highlightedWorkflowId === workflow.id ? ' highlighted' : ''}`} key={workflow.id}>
              <div className="workflow-main">
                <strong>{workflow.name}</strong>
                <span>{workflow.type} · {statusLabel[workflow.status]}</span>
                {workflow.archived ? <span className="workflow-archive-badge">已归档</span> : null}
                {workflow.note ? <p>{workflow.note}</p> : null}
                <div className="workflow-detail-grid">
                  <span>节点：{workflow.importCheck?.nodeCount ?? workflow.nodeCount ?? '未统计'}</span>
                  <span>连线：{workflow.importCheck?.connCount ?? workflow.connCount ?? '未统计'}</span>
                  <span>版本：v{workflow.version ?? 1}</span>
                  <span>来源：{workflow.source ?? 'manual'}</span>
                  <span>导入：{workflow.importCheck?.ok ? '可用' : '待修复'}</span>
                  <span>执行器：{workflow.executor ?? 'infinite_canvas'}</span>
                  <span>模式：{workflow.workflowMode ?? '未标记'}</span>
                  <span>策略：{workflow.executionStrategy?.mode ?? 'operator_controlled'}</span>
                  <span>直调模型：{workflow.directModelExecution ? '允许' : '禁止'}</span>
                  <span>提示词：{workflow.promptCount ?? 0}</span>
                  <span>参考图：{workflow.referenceImageCount ?? 0}</span>
                  <span>审核：{workflow.reviewId ?? '未送审'}</span>
                  <span>输出：{workflow.outputArtifacts?.length ?? 0}</span>
                  {workflow.sourceWorkflowId ? <span>上游：{workflow.sourceWorkflowId}</span> : null}
                  {workflow.chainStage ? <span>链路：{workflow.chainStage}</span> : null}
                  {workflow.triggerKind ? <span>触发：{workflow.triggerKind}</span> : null}
                  {workflow.lastOutputReviewId ? <span>产物审核：{workflow.lastOutputReviewId}</span> : null}
                </div>
                {chainItems.filter((item) => item.workflowId === workflow.id).map((item) => (
                  <div key={`${workflow.id}-chain-action`}>
                    <div className="workflow-detail-grid">
                      <span>闭环：{item.closed ? '已完成' : '待推进'}</span>
                      <span>下一步：{item.nextActionLabel}</span>
                      <span>动作目标：{item.actionTarget ?? '待确认'}</span>
                      {item.reviewStatus ? <span>产物审核：{statusLabel[item.reviewStatus]}</span> : null}
                      {item.sourceArtifactPath ? <span>源产物：{item.sourceArtifactPath}</span> : null}
                      {item.downstreamWorkflowIds.length > 0 ? <span>下游：{item.downstreamWorkflowIds.join(' / ')}</span> : null}
                    </div>
                    <div className="inline-actions">{renderChainAction(item)}</div>
                    {item.timeline && item.timeline.length > 0 ? (
                      <div className="workflow-timeline">
                        {item.timeline.map((event) => (
                          <div className="workflow-timeline-item" key={event.id}>
                            <strong>{event.label}</strong>
                            <span>{event.target ?? '无目标'}</span>
                            <em>{event.status ?? 'unknown'} · {event.at ?? '时间待确认'}</em>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {workflow.outputArtifacts && workflow.outputArtifacts.length > 0 ? (
                  <div className="workflow-outputs">
                    {workflow.outputArtifacts.map((artifact) => (
                      <button type="button" key={artifact} onClick={() => onArtifactOpen(artifact)}>{artifact}</button>
                    ))}
                  </div>
                ) : null}
                {workflow.importCheck ? <span className={workflow.importCheck.ok ? 'workflow-health ok' : 'workflow-health broken'}>{workflow.importCheck.ok ? '导入校验通过' : `导入校验失败：${workflow.importCheck.issues.join('；')}`}</span> : null}
                {workflow.importUrl ? <em>导入 URL：{workflow.importUrl}</em> : null}
                {workflow.generatedAt ? <em>生成：{workflow.generatedAt}</em> : null}
                {workflow.updatedAt ? <em>更新：{workflow.updatedAt}</em> : null}
                {workflow.archivedAt ? <em>归档：{workflow.archivedAt}</em> : null}
                {workflow.restoredAt ? <em>恢复：{workflow.restoredAt}</em> : null}
                <form className="workflow-output-form" onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  const artifactPath = String(data.get('artifactPath') ?? '').trim();

                  if (!artifactPath) return;
                  onWorkflowOutputAdd(workflow.id, artifactPath);
                  form.reset();
                }}>
                  <input name="artifactPath" placeholder="登记输出产物路径，如 01-资产图与提示词/..." />
                  <button type="submit">登记输出并送审</button>
                  {workflow.lastOutputReviewId && workflow.outputArtifacts?.[0] ? <button type="button" onClick={() => onWorkflowOutputAdd(workflow.id, workflow.outputArtifacts?.[0] ?? '', true)}>返工后重新送审</button> : null}
                </form>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={() => onArtifactOpen(workflow.path)}>预览 JSON</button>
                <a className="workflow-import-action" href={workflow.importUrl ?? getWorkflowImportUrl(workflow.path)} target="_blank" rel="noreferrer">一键导入画布</a>
                {workflow.runUrl ? <a className="workflow-import-action" href={workflow.runUrl} target="_blank" rel="noreferrer">导入画布</a> : null}
                <button type="button" onClick={() => onWorkflowStatusChange(workflow.id, 'in_progress')}>进行中</button>
                <button type="button" onClick={() => onWorkflowStatusChange(workflow.id, 'waiting_review')}>送审</button>
                <button type="button" onClick={() => onWorkflowStatusChange(workflow.id, 'done')}>完成</button>
                <button type="button" onClick={() => onWorkflowStatusChange(workflow.id, 'blocked')}>阻塞</button>
                {workflow.archived ? (
                  <button type="button" onClick={() => onWorkflowRestore(workflow.id)}>恢复</button>
                ) : (
                  <button type="button" onClick={() => onWorkflowArchive(workflow.id)}>归档</button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="workflow-empty">
          <strong>尚未登记 Workflow JSON</strong>
          <span>当前 Phase 1 先保留入口；后续接入 Workflow JSON Builder 后会在这里展示可导入画布的工作流文件。</span>
        </div>
      )}
    </section>
  );
}

function ReleaseRegistryPanel({ registry, reviews, diagnostics, repairResult, notice, loading, error, onRefresh, onCreate, onStatusChange, onRepair, onArtifactOpen }: { registry?: ReleaseRegistry; reviews: ReviewItem[]; diagnostics: WorkflowRuntimeDiagnostics | null; repairResult: ReleaseRepairResult | null; notice: string | null; loading: boolean; error: string | null; onRefresh: () => void; onCreate: () => void; onStatusChange: (releaseId: string, status: ReleaseStatus) => void; onRepair: (releaseId: string) => void; onArtifactOpen: (artifact: string) => void }) {
  const safeRegistry = registry ?? { version: '0.1.0', projectId: 'infinite-awakening-001', releases: [], archiveHistory: [] };
  const releases = safeRegistry.releases ?? [];
  const releaseHistoryItems = [
    ...(safeRegistry.publishHistory ?? []).map((item) => ({ id: `publish-${item.releaseId}-${item.publishedAt}`, releaseId: item.releaseId, at: item.publishedAt, type: 'published', source: item.source ?? 'manual', manifestPath: item.manifestPath, artifactCount: item.artifactPaths.length })),
    ...(safeRegistry.archiveHistory ?? []).map((item) => ({ id: `archive-${item.releaseId}-${item.archivedAt}`, releaseId: item.releaseId, at: item.archivedAt, type: 'archived', source: 'manual', manifestPath: item.manifestPath, artifactCount: item.artifactPaths.length })),
    ...(safeRegistry.restoreHistory ?? []).map((item) => ({ id: `restore-${item.releaseId}-${item.restoredAt}`, releaseId: item.releaseId, at: item.restoredAt, type: 'restored', source: 'manual', manifestPath: item.manifestPath, artifactCount: item.artifactPaths.length }))
  ].sort((a, b) => b.at.localeCompare(a.at));
  const publishedCount = releases.filter((item) => item.status === 'published').length;
  const archivedCount = releases.filter((item) => item.status === 'archived').length;
  const releaseIssueCodes = new Set(['release_status_invalid', 'release_status_not_approved', 'release_qa_review_missing', 'release_qa_review_not_done', 'release_manifest_missing', 'release_manifest_file_missing', 'release_manifest_path_invalid', 'release_artifacts_empty', 'release_artifact_missing', 'release_artifact_path_invalid', 'release_approved_at_missing', 'release_published_without_approval', 'release_published_at_missing', 'release_archived_at_missing', 'release_archived_without_history', 'release_restored_with_archived_at', 'release_review_missing', 'release_review_not_done']);
  const releaseIssues = diagnostics?.issues.filter((issue) => releaseIssueCodes.has(issue.code)) ?? [];
  const getReleaseIssues = (releaseId: string, reviewId?: string) => releaseIssues.filter((issue) => issue.target === releaseId || issue.message === releaseId || issue.reviewId === reviewId);
  const canMoveToReview = (status: ReleaseStatus) => status === 'draft' || status === 'restored';
  const canApprove = (release: ReleasePackage) => release.status === 'ready_for_review' && !(release.publishGate?.blockers ?? []).some((item) => item.code === 'release_review_missing' || item.code === 'release_review_not_done');
  const canPublish = (release: ReleasePackage) => release.status === 'approved' && Boolean(release.publishGate?.canPublish);
  const canArchive = (status: ReleaseStatus) => status === 'published' || status === 'approved';
  const canRestore = (status: ReleaseStatus) => status === 'archived';

  return (
    <section className="panel release-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Release Registry</p>
          <h2>发布包 / 最终归档</h2>
        </div>
        <span className="count-pill">{releases.length}</span>
      </div>
      <p>{safeRegistry.note ?? '发布包状态注册、发布确认与最终归档。'}</p>
      <div className="release-actions">
        <button type="button" onClick={onRefresh} disabled={loading}>{loading ? '处理中...' : '刷新发布包'}</button>
        <button type="button" onClick={onCreate} disabled={loading}>创建 EP001 发布包</button>
      </div>
      {notice ? <div className="context-ok">{notice}</div> : null}
      {error ? <div className="context-error">{error}</div> : null}
      {repairResult ? (
        <div className="release-repair-result">
          <strong>单项修复：{repairResult.release.id}</strong>
          <span>{repairResult.repairs.length > 0 ? `已修复 ${repairResult.repairs.length} 项` : '未发现可自动修复项'}</span>
          {repairResult.repairs.slice(0, 4).map((repair) => <span key={`${repairResult.release.id}-${repair.code}`}>{repair.code} · {repair.message}</span>)}
          {repairResult.afterGate.blockers.length > 0 ? <span>剩余阻塞：{repairResult.afterGate.blockers.map((item) => item.code).join(' / ')}</span> : <span>发布门禁：已通过</span>}
        </div>
      ) : null}
      <div className="release-stat-grid">
        <span>发布包：{releases.length}</span>
        <span>已发布：{publishedCount}</span>
        <span>已归档：{archivedCount}</span>
        <span>发布记录：{safeRegistry.publishHistory?.length ?? 0}</span>
        <span>归档记录：{safeRegistry.archiveHistory?.length ?? 0}</span>
        <span>恢复记录：{safeRegistry.restoreHistory?.length ?? 0}</span>
        <span>诊断问题：{releaseIssues.length}</span>
      </div>
      {releaseHistoryItems.length > 0 ? (
        <div className="release-history-grid">
          <strong>发布 / 归档 / 恢复历史</strong>
          {releaseHistoryItems.slice(0, 12).map((item) => (
            <span key={item.id}>
              {item.type} · {item.releaseId} · {item.at} · {item.source} · {item.artifactCount} artifacts
              {item.manifestPath ? <button type="button" onClick={() => onArtifactOpen(item.manifestPath as string)}>manifest</button> : null}
            </span>
          ))}
        </div>
      ) : null}
      {releases.length > 0 ? (
        <div className="release-list">
          {releases.map((release) => {
            const itemIssues = getReleaseIssues(release.id, release.reviewId);
            const gateBlockers = release.publishGate?.blockers ?? [];
            const qaReview = getReviewForReleasePanel(release, reviews, 'qa_review');
            const releaseReview = getReviewForReleasePanel(release, reviews, 'release_package_review');
            const gateGroups = [
              {
                id: 'qa',
                title: 'QA 审核',
                summary: qaReview ? `${qaReview.id} · ${statusLabel[qaReview.status]}` : '未找到 QA review',
                blockers: gateBlockers.filter((blocker) => releaseQaGateCodes.has(blocker.code))
              },
              {
                id: 'release',
                title: 'Release 审核',
                summary: releaseReview ? `${releaseReview.id} · ${statusLabel[releaseReview.status]}` : '未找到 release review',
                blockers: gateBlockers.filter((blocker) => releaseReviewGateCodes.has(blocker.code))
              },
              {
                id: 'files',
                title: 'Manifest / Artifacts',
                summary: `${release.manifestPath ? 'manifest 已绑定' : 'manifest 未绑定'} · ${release.artifactPaths.length} 个 artifact`,
                blockers: gateBlockers.filter((blocker) => releaseFileGateCodes.has(blocker.code))
              }
            ];

            return (
              <article className={`release-item ${release.status}${itemIssues.length > 0 || gateBlockers.length > 0 ? ' has-issues' : ''}`} key={release.id}>
                <div>
                  <strong>{release.title}</strong>
                <span>{release.id} · {release.episodeId} · {release.status}</span>
                <span>审核：{release.reviewId ?? '未创建'}</span>
                <span className={release.publishGate?.canPublish ? 'release-health-ok' : 'release-gate-blocked'}>{release.publishGate?.canPublish ? '可发布：全部发布门禁已通过' : `不可发布：${gateBlockers.length} 个阻塞项`}</span>
                <span>创建：{release.createdAt}</span>
                <span>更新：{release.updatedAt}</span>
                {release.manifestPath ? <button type="button" onClick={() => onArtifactOpen(release.manifestPath as string)}>预览 manifest</button> : null}
                <div className="release-gate-grid">
                  {gateGroups.map((group) => (
                    <div className={`release-gate-group ${group.blockers.length > 0 ? 'blocked' : 'passed'}`} key={`${release.id}-${group.id}`}>
                      <div>
                        <strong>{group.title}</strong>
                        <span>{group.blockers.length > 0 ? `${group.blockers.length} 个阻塞项` : '通过'}</span>
                      </div>
                      <span>{group.summary}</span>
                      {group.blockers.length > 0 ? (
                        <div className="release-gate-list">
                          {group.blockers.slice(0, 4).map((blocker, index) => <span key={`${release.id}-${group.id}-${blocker.code}-${index}`}>{formatGateBlocker(blocker)}</span>)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {gateBlockers.some((blocker) => !releaseQaGateCodes.has(blocker.code) && !releaseReviewGateCodes.has(blocker.code) && !releaseFileGateCodes.has(blocker.code)) ? (
                    <div className="release-gate-group blocked">
                      <div>
                        <strong>状态门禁</strong>
                        <span>需处理</span>
                      </div>
                      <span>{release.status}</span>
                      <div className="release-gate-list">
                        {gateBlockers.filter((blocker) => !releaseQaGateCodes.has(blocker.code) && !releaseReviewGateCodes.has(blocker.code) && !releaseFileGateCodes.has(blocker.code)).map((blocker, index) => <span key={`${release.id}-status-${blocker.code}-${index}`}>{formatGateBlocker(blocker)}</span>)}
                      </div>
                    </div>
                  ) : null}
                </div>
                {itemIssues.length > 0 ? (
                  <div className="release-issue-list">
                    {itemIssues.slice(0, 4).map((issue, index) => <span key={`${release.id}-${issue.code}-${index}`}>{issue.level.toUpperCase()} · {issue.code} · {issue.target ?? issue.reviewId ?? issue.message}</span>)}
                  </div>
                ) : <span className="release-health-ok">诊断暂无问题</span>}
                <div className="workflow-outputs">
                  {release.artifactPaths.slice(0, 8).map((artifact) => <button type="button" key={artifact} onClick={() => onArtifactOpen(artifact)}>{artifact}</button>)}
                </div>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={() => onStatusChange(release.id, 'ready_for_review')} disabled={!canMoveToReview(release.status)}>送审</button>
                <button type="button" onClick={() => onStatusChange(release.id, 'approved')} disabled={!canApprove(release)}>批准</button>
                <button type="button" onClick={() => onStatusChange(release.id, 'published')} disabled={!canPublish(release)}>发布</button>
                <button type="button" onClick={() => onStatusChange(release.id, 'archived')} disabled={!canArchive(release.status)}>归档</button>
                <button type="button" onClick={() => onStatusChange(release.id, 'restored')} disabled={!canRestore(release.status)}>恢复</button>
                <button type="button" onClick={() => onRepair(release.id)} disabled={loading}>修复</button>
              </div>
            </article>
            );
          })}
        </div>
      ) : <div className="workflow-empty"><strong>尚未登记发布包</strong><span>点击创建后会基于当前审核剪辑发布相关产物生成 release-registry 记录。</span></div>}
    </section>
  );
}

function WorkflowRuntimePanel({ diagnostics, runnerStatus, queueResult, taskQueueResult, taskQueueRequeueResult, taskQueueStressResult, repairPreviewResult, compactionPreviewResult, releasePublishQueuePreviewResult, stressTaskTypes, stressCopies, releasePublishQueueResult, releasePublishRequeueResult, releasePublishSmokeResult, runtimeSmokeResult, pipelineRunRegistry, pipelineRunCreateResult, pipelineRunAdvanceResult, pipelineRunSmokeResult, pipelineRunRepairPreviewResult, pipelineRunRepairResult, canvasOutputs, retryResult, canvasOutputRetryResult, repairResult, compactionResult, archiveRestoreResult, runtimeError, runtimeLoading, onDiagnosticsRefresh, onRunnerRefresh, onPipelineRunsRefresh, onPipelineRunCreate, onPipelineRunAdvance, onPipelineRunSmoke, onPipelineRunRepairPreview, onPipelineRunRepair, onQueueRun, onTaskQueueRun, onTaskQueueStress, onStressTaskTypesChange, onStressCopiesChange, onTaskQueueItemRun, onTaskQueueItemRequeue, onTaskQueueReportOpen, onCanvasOutputRetryPreview, onCanvasOutputRetry, onReleasePublishQueuePreview, onReleasePublishQueueRun, onReleasePublishQueueItemRun, onReleasePublishRequeue, onReleasePublishQueueItemRequeue, onReleasePublishSmoke, onRuntimeSmoke, onRetryFailures, onReplayWorkflow, onRuntimeRepairPreview, onRuntimeRepair, onRunnerCompactPreview, onRunnerCompact, onArchiveRestore, onArchiveRestoreAll }: { diagnostics: WorkflowRuntimeDiagnostics | null; runnerStatus: WorkflowRunnerStatus | null; queueResult: WorkflowQueueRunResult | null; taskQueueResult: WorkflowTaskQueueRunResult | null; taskQueueRequeueResult: WorkflowTaskQueueRequeueResult | null; taskQueueStressResult: WorkflowTaskQueueStressResult | null; repairPreviewResult: WorkflowRuntimeRepairResult | null; compactionPreviewResult: WorkflowRunnerCompactionResult | null; releasePublishQueuePreviewResult: ReleasePublishQueueRunResult | null; stressTaskTypes: string; stressCopies: number; releasePublishQueueResult: ReleasePublishQueueRunResult | null; releasePublishRequeueResult: ReleasePublishQueueRequeueResult | null; releasePublishSmokeResult: ReleasePublishQueueSmokeResult | null; runtimeSmokeResult: SmartVisionRuntimeSmokeResult | null; pipelineRunRegistry: PipelineRunRegistry | null; pipelineRunCreateResult: PipelineRunResult | null; pipelineRunAdvanceResult: PipelineRunResult | null; pipelineRunSmokeResult: PipelineRunSmokeResult | null; pipelineRunRepairPreviewResult: PipelineRunRepairResult | null; pipelineRunRepairResult: PipelineRunRepairResult | null; canvasOutputs: CanvasOutputRecord[]; retryResult: WorkflowRunnerRetryResult | null; canvasOutputRetryResult: CanvasOutputRetryResult | null; repairResult: WorkflowRuntimeRepairResult | null; compactionResult: WorkflowRunnerCompactionResult | null; archiveRestoreResult: WorkflowRunnerArchiveRestoreResult | null; runtimeError: string | null; runtimeLoading: boolean; onDiagnosticsRefresh: () => void; onRunnerRefresh: () => void; onPipelineRunsRefresh: () => void; onPipelineRunCreate: () => void; onPipelineRunAdvance: () => void; onPipelineRunSmoke: () => void; onPipelineRunRepairPreview: () => void; onPipelineRunRepair: () => void; onQueueRun: () => void; onTaskQueueRun: () => void; onTaskQueueStress: () => void; onStressTaskTypesChange: (value: string) => void; onStressCopiesChange: (value: number) => void; onTaskQueueItemRun: (taskQueueId: string) => void; onTaskQueueItemRequeue: (taskQueueId: string) => void; onTaskQueueReportOpen: (reportPath: string) => void; onCanvasOutputRetryPreview: (output: CanvasOutputRecord) => void; onCanvasOutputRetry: (output: CanvasOutputRecord) => void; onReleasePublishQueuePreview: () => void; onReleasePublishQueueRun: () => void; onReleasePublishQueueItemRun: (releaseId: string) => void; onReleasePublishRequeue: () => void; onReleasePublishQueueItemRequeue: (releaseId: string) => void; onReleasePublishSmoke: () => void; onRuntimeSmoke: () => void; onRetryFailures: (runId: string) => void; onReplayWorkflow: (workflowId: string) => void; onRuntimeRepairPreview: () => void; onRuntimeRepair: () => void; onRunnerCompactPreview: () => void; onRunnerCompact: () => void; onArchiveRestore: (bucket: WorkflowRunnerArchiveBucket, itemId: string) => void; onArchiveRestoreAll: (bucket: WorkflowRunnerArchiveBucket) => void }) {
  const issueList = diagnostics?.issues ?? runnerStatus?.diagnostics.issues ?? [];
  const recentEvents = runnerStatus?.recentEvents ?? [];
  const lastRun = runnerStatus?.lastRun ?? null;
  const taskQueue = runnerStatus?.taskQueue ?? [];
  const queuedTaskCount = runnerStatus?.queuedTaskCount ?? taskQueue.filter((item) => item.status === 'queued').length;
  const releasePublishQueue = runnerStatus?.releasePublishQueue ?? [];
  const queuedReleaseCount = releasePublishQueue.filter((item) => item.status === 'queued').length;
  const blockedReleaseCount = runnerStatus?.blockedReleasePublishCount ?? releasePublishQueue.filter((item) => item.status === 'blocked').length;
  const archiveSummary = runnerStatus?.archiveSummary ?? null;
  const archivedRunCount = (archiveSummary?.counts.taskQueueRunCount ?? 0) + (archiveSummary?.counts.releasePublishRunCount ?? 0);
  const pipelineRuns = pipelineRunRegistry?.runs ?? [];
  const activePipelineRun = pipelineRunCreateResult?.run ?? pipelineRunAdvanceResult?.run ?? [...pipelineRuns].reverse().find((run) => run.status !== 'done') ?? pipelineRuns.at(-1) ?? null;
  const currentPipelineStage = activePipelineRun?.stages.find((stage) => stage.id === activePipelineRun.currentStageId) ?? activePipelineRun?.stages.find((stage) => stage.status !== 'done') ?? null;
  const recentCanvasOutputs = [...canvasOutputs].slice(-6).reverse();
  const isCanvasOutputRetryable = isCanvasOutputProblem;
  const failedCanvasOutputs = canvasOutputs.filter(isCanvasOutputRetryable);
  const runtimeResultSummaries = [
    runtimeSmokeResult ? { label: '端到端', value: runtimeSmokeResult.status, detail: runtimeSmokeResult.steps.map((step) => `${step.id}:${step.status}`).join(' / ') } : null,
    pipelineRunSmokeResult ? { label: '流水线', value: pipelineRunSmokeResult.status, detail: pipelineRunSmokeResult.steps.map((step) => `${step.id}:${step.status}`).join(' / ') } : null,
    pipelineRunRepairResult ? { label: '流水线修复', value: `${pipelineRunRepairResult.repairCount}`, detail: pipelineRunRepairResult.dryRun ? 'dry-run' : 'write' } : null,
    taskQueueResult ? { label: '任务队列', value: `${taskQueueResult.results.filter((item) => item.status === 'done').length}/${taskQueueResult.requested}`, detail: taskQueueResult.runId } : null,
    taskQueueStressResult ? { label: '压力自测', value: taskQueueStressResult.status, detail: `${taskQueueStressResult.completedSubtasks}/${taskQueueStressResult.totalSubtasks}` } : null,
    releasePublishQueueResult ? { label: '发布队列', value: `${releasePublishQueueResult.results.filter((item) => item.status === 'published').length}/${releasePublishQueueResult.requested}`, detail: releasePublishQueueResult.dryRun ? 'dry-run' : 'write' } : null,
    releasePublishSmokeResult ? { label: '发布自测', value: releasePublishSmokeResult.steps.at(-1)?.status ?? 'unknown', detail: releasePublishSmokeResult.release.id } : null,
    canvasOutputRetryResult ? { label: '画布重试', value: canvasOutputRetryResult.status, detail: canvasOutputRetryResult.dryRun ? 'dry-run' : (canvasOutputRetryResult.artifactPath ?? canvasOutputRetryResult.idempotencyKey ?? 'write') } : null,
    repairResult ? { label: '修复', value: repairResult.dryRun ? 'dry-run' : 'write', detail: `progress ${repairResult.repairedProgressCount} / release ${repairResult.repairedReleaseCount ?? 0}` } : null,
    compactionResult ? { label: '归档', value: compactionResult.dryRun ? 'dry-run' : 'write', detail: `moved ${Object.values(compactionResult.archived).reduce((sum, count) => sum + count, 0)}` } : null
  ].filter(Boolean) as Array<{ label: string; value: string; detail: string }>;

  return (
    <section className="panel runtime-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Workflow Runtime</p>
          <h2>运行器 / 诊断中心</h2>
        </div>
        <span className={diagnostics?.status === 'ready' || runnerStatus?.status === 'ready' ? 'state-pill ok' : 'state-pill warn'}>{runnerStatus?.status ?? diagnostics?.status ?? '未检测'}</span>
      </div>
      <div className="runtime-action-groups">
        <article>
          <strong>诊断与自测</strong>
          <div className="runtime-actions">
            <button type="button" onClick={onDiagnosticsRefresh} disabled={runtimeLoading}>{runtimeLoading ? '处理中...' : '刷新诊断'}</button>
            <button type="button" onClick={onRunnerRefresh} disabled={runtimeLoading}>刷新运行器</button>
            <button type="button" onClick={onRuntimeSmoke} disabled={runtimeLoading}>端到端自测</button>
            <button type="button" onClick={onReleasePublishSmoke} disabled={runtimeLoading}>发布失败路径自测</button>
          </div>
        </article>
        <article>
          <strong>Pipeline Run</strong>
          <div className="runtime-actions">
            <button type="button" onClick={onPipelineRunsRefresh} disabled={runtimeLoading}>刷新流水线</button>
            <button type="button" onClick={onPipelineRunCreate} disabled={runtimeLoading}>创建流水线实例</button>
            <button type="button" onClick={onPipelineRunAdvance} disabled={runtimeLoading || !activePipelineRun}>推进当前阶段</button>
            <button type="button" onClick={onPipelineRunRepairPreview} disabled={runtimeLoading}>修复预览</button>
            <button type="button" onClick={onPipelineRunRepair} disabled={runtimeLoading}>修复流水线</button>
            <button type="button" onClick={onPipelineRunSmoke} disabled={runtimeLoading}>流水线 dry-run</button>
          </div>
        </article>
        <article>
          <strong>任务执行</strong>
          <div className="runtime-inputs">
            <input value={stressTaskTypes} onChange={(event) => onStressTaskTypesChange(event.target.value)} disabled={runtimeLoading} aria-label="压力测试任务类型" />
            <input type="number" min={1} max={10} value={stressCopies} onChange={(event) => onStressCopiesChange(Number(event.target.value))} disabled={runtimeLoading} aria-label="压力测试份数" />
          </div>
          <div className="runtime-actions">
            <button type="button" onClick={onQueueRun} disabled={runtimeLoading}>运行待处理队列</button>
            <button type="button" onClick={onTaskQueueRun} disabled={runtimeLoading || queuedTaskCount === 0}>运行任务队列</button>
            <button type="button" onClick={onTaskQueueStress} disabled={runtimeLoading}>任务压力自测</button>
            {lastRun ? <button type="button" onClick={() => onRetryFailures(lastRun.id)} disabled={runtimeLoading}>重试上次失败</button> : null}
          </div>
        </article>
        <article>
          <strong>发布队列</strong>
          <div className="runtime-actions">
            <button type="button" onClick={onReleasePublishQueuePreview} disabled={runtimeLoading || queuedReleaseCount === 0}>发布预览</button>
            <button type="button" onClick={onReleasePublishQueueRun} disabled={runtimeLoading || queuedReleaseCount === 0}>运行发布队列</button>
            <button type="button" onClick={onReleasePublishRequeue} disabled={runtimeLoading || blockedReleaseCount === 0}>重入发布失败项</button>
          </div>
        </article>
        <article>
          <strong>维护</strong>
          <div className="runtime-actions">
            <button type="button" onClick={onRuntimeRepairPreview} disabled={runtimeLoading}>修复预览</button>
            <button type="button" onClick={onRuntimeRepair} disabled={runtimeLoading}>修复状态一致性</button>
            <button type="button" onClick={onRunnerCompactPreview} disabled={runtimeLoading}>归档预览</button>
            <button type="button" onClick={onRunnerCompact} disabled={runtimeLoading}>归档队列历史</button>
          </div>
        </article>
      </div>
      {runtimeError ? <div className="context-error">{runtimeError}</div> : null}
      {runtimeResultSummaries.length > 0 ? (
        <div className="runtime-summary-strip">
          {runtimeResultSummaries.map((summary) => (
            <span key={`${summary.label}-${summary.value}`}>
              <strong>{summary.label}</strong>
              <em>{summary.value}</em>
              <small>{summary.detail}</small>
            </span>
          ))}
        </div>
      ) : null}
      <div className="runtime-stat-grid">
        <span>Workflow：{diagnostics?.counts.workflowCount ?? 0}</span>
        <span>链路：{diagnostics?.counts.chainCount ?? 0}</span>
        <span>开放链路：{diagnostics?.counts.openChainCount ?? 0}</span>
        <span>审核：{diagnostics?.counts.reviewCount ?? 0}</span>
        <span>产物：{diagnostics?.counts.artifactCount ?? 0}</span>
        <span>发布包：{diagnostics?.counts.releaseCount ?? 0}</span>
        <span>已发布：{diagnostics?.counts.publishedReleaseCount ?? 0}</span>
        <span>已归档：{diagnostics?.counts.archivedReleaseCount ?? 0}</span>
        <span>问题：{diagnostics?.counts.issueCount ?? issueList.length}</span>
        <span>运行次数：{runnerStatus?.runCount ?? 0}</span>
        <span>任务队列：{queuedTaskCount}/{runnerStatus?.taskQueueCount ?? taskQueue.length}</span>
        <span>任务完成：{runnerStatus?.doneTaskCount ?? taskQueue.filter((item) => item.status === 'done').length}</span>
        <span>发布队列：{queuedReleaseCount}</span>
        <span>发布阻塞：{blockedReleaseCount}</span>
        <span>归档任务：{archiveSummary?.counts.taskQueueCount ?? 0}</span>
        <span>归档 Run：{archivedRunCount}</span>
        <span>归档事件：{archiveSummary?.counts.eventCount ?? 0}</span>
        <span>流水线：{pipelineRuns.length}</span>
        <span>当前阶段：{currentPipelineStage?.taskType ?? '暂无'}</span>
        <span>画布回写：{canvasOutputs.length}</span>
        <span>回写异常：{failedCanvasOutputs.length}</span>
        <span>最近 Run：{lastRun?.id ?? '暂无'}</span>
      </div>
      {activePipelineRun ? (
        <div className="runtime-section">
          <strong>Pipeline Run：{activePipelineRun.status}</strong>
          <span>{activePipelineRun.id} · 当前：{currentPipelineStage?.title ?? activePipelineRun.currentStageId ?? '未定位'}</span>
          {activePipelineRun.stages.map((stage) => (
            <span key={stage.id}>{stage.index + 1}. {stage.taskType} · {stage.status} · workflow {stage.workflowId ?? 'pending'} · artifacts {stage.artifactPaths.length} · reviews {stage.reviewIds.length}</span>
          ))}
        </div>
      ) : null}
      <div className="runtime-section">
        <strong>最近画布回写</strong>
        {failedCanvasOutputs.length > 0 ? (
          <span>异常：{failedCanvasOutputs.slice(-3).reverse().map((output) => `${output.workflowId}:${output.artifactPath || output.outputArtifactHint || 'missing-artifact'}`).join(' / ')}</span>
        ) : null}
        {recentCanvasOutputs.length > 0 ? (
          <div className="runtime-canvas-output-list">
            {recentCanvasOutputs.map((output) => (
              <span key={`${output.workflowId}-${output.artifactPath}-${output.idempotencyKey ?? ''}-${output.updatedAt ?? ''}`}>
                {isCanvasOutputRetryable(output) ? '异常' : '正常'} · {output.status ?? 'registered'} · {output.mediaType ?? output.nodeType ?? 'canvas'} · {output.artifactPath || output.outputArtifactHint || 'missing-artifact'} · {output.reviewId ?? output.error ?? 'review pending'}
                <em className="runtime-inline-actions">
                  {output.artifactPath ? <button type="button" onClick={() => onTaskQueueReportOpen(output.artifactPath)}>打开</button> : null}
                  {isCanvasOutputRetryable(output) ? <button type="button" onClick={() => onCanvasOutputRetryPreview(output)} disabled={runtimeLoading}>重试预览</button> : null}
                  {isCanvasOutputRetryable(output) ? <button type="button" onClick={() => onCanvasOutputRetry(output)} disabled={runtimeLoading}>重试回写</button> : null}
                </em>
              </span>
            ))}
          </div>
        ) : <span>暂无画布回写记录</span>}
      </div>
      {pipelineRunSmokeResult ? (
        <div className="runtime-section">
          <strong>流水线 dry-run：{pipelineRunSmokeResult.status}</strong>
          {pipelineRunSmokeResult.steps.map((step) => <span key={step.id}>{step.id} · {step.status} · {step.summary ?? ''}</span>)}
        </div>
      ) : null}
      {(pipelineRunRepairPreviewResult || pipelineRunRepairResult) ? (
        <div className="runtime-section">
          <strong>流水线修复：{(pipelineRunRepairResult ?? pipelineRunRepairPreviewResult)?.dryRun ? 'dry-run' : 'write'}</strong>
          <span>修复项：{(pipelineRunRepairResult ?? pipelineRunRepairPreviewResult)?.repairCount ?? 0} · Diagnostics {(pipelineRunRepairResult ?? pipelineRunRepairPreviewResult)?.diagnostics.status ?? 'unknown'}</span>
          {(pipelineRunRepairResult ?? pipelineRunRepairPreviewResult)?.repairs.slice(0, 8).map((repair, index) => (
            <span key={`${repair.code}-${repair.runId ?? 'all'}-${repair.stageId ?? index}`}>{repair.code} · {repair.runId ?? 'all'} · {repair.stageId ?? 'run'} · {repair.message ?? ''}</span>
          ))}
        </div>
      ) : null}
      {diagnostics?.nextActions?.length ? (
        <div className="runtime-section">
          <strong>建议动作</strong>
          {diagnostics.nextActions.map((action) => <span key={action}>{action}</span>)}
        </div>
      ) : null}
      {issueList.length > 0 ? (
        <div className="runtime-issue-list">
          {issueList.slice(0, 8).map((issue, index) => (
            <article className={`runtime-issue ${issue.level}`} key={`${issue.code}-${issue.workflowId ?? issue.reviewId ?? index}`}>
              <strong>{issue.level.toUpperCase()} · {issue.code}</strong>
              <span>{issue.message ?? issue.target ?? '未提供详情'}</span>
              {issue.workflowId ? <button type="button" onClick={() => onReplayWorkflow(issue.workflowId as string)}>重放链路</button> : null}
            </article>
          ))}
        </div>
      ) : <div className="context-ok">暂无运行时问题。</div>}
      <div className="runtime-run-grid">
        {lastRun ? (
          <article>
            <strong>上次运行：{lastRun.status}</strong>
            <span>{lastRun.id}</span>
            <span>结果：{lastRun.results.length}</span>
          </article>
        ) : null}
        {queueResult ? (
          <article>
            <strong>队列运行：{queueResult.runId}</strong>
            <span>请求：{queueResult.requested}</span>
            <span>结果：{queueResult.results.map((item) => `${item.workflowId}:${item.status}`).join(' / ')}</span>
          </article>
        ) : null}
        {taskQueueResult ? (
          <article>
            <strong>任务队列：{taskQueueResult.runId}</strong>
            <span>请求：{taskQueueResult.requested}</span>
            <span>结果：{taskQueueResult.results.map((item) => `${item.subtaskId}:${item.status}`).join(' / ') || '无可运行任务'}</span>
          </article>
        ) : null}
        {taskQueueRequeueResult ? (
          <article>
            <strong>任务重入：{taskQueueRequeueResult.requeuedAt}</strong>
            <span>请求：{taskQueueRequeueResult.requested}</span>
            <span>结果：{taskQueueRequeueResult.requeuedItems.map((item) => `${item.subtaskId}:${item.status}`).join(' / ') || '无重入任务'}</span>
          </article>
        ) : null}
        {taskQueueStressResult ? (
          <article>
            <strong>任务压力自测：{taskQueueStressResult.status}</strong>
            <span>{taskQueueStressResult.requestedPlanCount} plans · {taskQueueStressResult.totalSubtasks} subtasks</span>
            <span>完成：{taskQueueStressResult.completedSubtasks} · 阻塞计划：{taskQueueStressResult.blockedPlanCount}</span>
            <span>类型：{taskQueueStressResult.requestedTaskTypes.join(' / ')}</span>
          </article>
        ) : null}
        {releasePublishQueuePreviewResult ? (
          <article>
            <strong>发布预览：{releasePublishQueuePreviewResult.runId}</strong>
            <span>{releasePublishQueuePreviewResult.dryRun ? 'dry-run' : 'write'} · 请求 {releasePublishQueuePreviewResult.requested}</span>
            <span>结果：{releasePublishQueuePreviewResult.results.map((item) => `${item.releaseId}:${item.status}`).join(' / ') || '无待发布项'}</span>
            <span>阻塞：{releasePublishQueuePreviewResult.results.filter((item) => item.status === 'blocked').length}</span>
          </article>
        ) : null}
        {releasePublishQueueResult ? (
          <article>
            <strong>发布队列：{releasePublishQueueResult.runId}</strong>
            <span>{releasePublishQueueResult.dryRun ? 'dry-run' : 'write'} · 请求：{releasePublishQueueResult.requested}</span>
            <span>结果：{releasePublishQueueResult.results.map((item) => `${item.releaseId}:${item.status}`).join(' / ') || '无待发布项'}</span>
          </article>
        ) : null}
        {releasePublishRequeueResult ? (
          <article>
            <strong>发布重入：{releasePublishRequeueResult.requeuedAt}</strong>
            <span>请求：{releasePublishRequeueResult.requested}</span>
            <span>结果：{releasePublishRequeueResult.requeuedItems.map((item) => `${item.releaseId}:${item.status}`).join(' / ') || '无失败项'}</span>
          </article>
        ) : null}
        {releasePublishSmokeResult ? (
          <article>
            <strong>发布自测：{releasePublishSmokeResult.release.id}</strong>
            <span>{releasePublishSmokeResult.dryRun ? 'dry-run' : 'write'} · {releasePublishSmokeResult.smokedAt}</span>
            <span>步骤：{releasePublishSmokeResult.steps.map((item) => `${item.id}:${item.status}`).join(' / ')}</span>
          </article>
        ) : null}
        {runtimeSmokeResult ? (
          <article>
            <strong>端到端自测：{runtimeSmokeResult.status}</strong>
            <span>{runtimeSmokeResult.taskType} · {runtimeSmokeResult.smokedAt}</span>
            <span>步骤：{runtimeSmokeResult.steps.map((item) => `${item.id}:${item.status}`).join(' / ')}</span>
          </article>
        ) : null}
        {retryResult ? (
          <article>
            <strong>重试运行：{retryResult.runId}</strong>
            <span>来源：{retryResult.retryOfRunId}</span>
            <span>结果：{retryResult.results.map((item) => `${item.workflowId}:${item.status}`).join(' / ')}</span>
          </article>
        ) : null}
        {canvasOutputRetryResult ? (
          <article>
            <strong>画布回写重试：{canvasOutputRetryResult.status}</strong>
            <span>{canvasOutputRetryResult.dryRun ? 'dry-run' : 'write'} · {canvasOutputRetryResult.idempotencyKey ?? 'no-key'}</span>
            <span>目标：{canvasOutputRetryResult.artifactPath ?? canvasOutputRetryResult.canvasOutputRecord?.artifactPath ?? canvasOutputRetryResult.failedRecord?.artifactPath ?? '未定位'}</span>
            <span>可重试：{canvasOutputRetryResult.retryable === false ? '否' : '是'} · 已恢复：{canvasOutputRetryResult.retried ? '是' : '否'}</span>
          </article>
        ) : null}
        {repairResult ? (
          <article>
            <strong>状态修复：{repairResult.repairedAt}</strong>
            <span>{repairResult.dryRun ? 'dry-run' : 'write'} · 已归档完成审核：{repairResult.movedCompletedReviews}</span>
            <span>修复进度项：{repairResult.repairedProgressCount}</span>
            <span>修复发布包：{repairResult.repairedReleaseCount ?? 0}</span>
            <span>修复归档结构：{repairResult.repairedRunnerArchiveCount ?? 0}</span>
          </article>
        ) : null}
        {repairPreviewResult ? (
          <article>
            <strong>修复预览：{repairPreviewResult.repairedAt}</strong>
            <span>{repairPreviewResult.dryRun ? 'dry-run' : 'write'} · 完成审核 {repairPreviewResult.movedCompletedReviews}</span>
            <span>进度项：{repairPreviewResult.repairedProgressCount} · 发布包：{repairPreviewResult.repairedReleaseCount ?? 0}</span>
            <span>归档结构：{repairPreviewResult.repairedRunnerArchiveCount ?? 0}</span>
          </article>
        ) : null}
        {compactionPreviewResult ? (
          <article>
            <strong>归档预览：{compactionPreviewResult.compactedAt}</strong>
            <span>{compactionPreviewResult.dryRun ? 'dry-run' : 'write'} · 任务归档 {compactionPreviewResult.archived.taskQueueCount}</span>
            <span>发布归档：{compactionPreviewResult.archived.releasePublishQueueCount} · 事件归档：{compactionPreviewResult.archived.eventCount}</span>
            <span>Run 归档：{compactionPreviewResult.archived.taskQueueRunCount + compactionPreviewResult.archived.releasePublishRunCount}</span>
          </article>
        ) : null}
        {compactionResult ? (
          <article>
            <strong>历史归档：{compactionResult.compactedAt}</strong>
            <span>{compactionResult.dryRun ? 'dry-run' : 'write'} · 任务队列：{compactionResult.before.taskQueueCount} → {compactionResult.after.taskQueueCount}，归档 {compactionResult.archived.taskQueueCount}</span>
            <span>发布队列：{compactionResult.before.releasePublishQueueCount} → {compactionResult.after.releasePublishQueueCount}，归档 {compactionResult.archived.releasePublishQueueCount}</span>
            <span>运行 / 事件：{compactionResult.archived.taskQueueRunCount + compactionResult.archived.releasePublishRunCount} runs，{compactionResult.archived.eventCount} events</span>
          </article>
        ) : null}
        {archiveRestoreResult ? (
          <article>
            <strong>归档恢复：{archiveRestoreResult.status}</strong>
            <span>{archiveRestoreResult.bucket} · {archiveRestoreResult.itemId}</span>
            <span>恢复：{archiveRestoreResult.restoredCount}/{archiveRestoreResult.requested} · 重复 {archiveRestoreResult.duplicateCount}</span>
            <span>剩余归档：任务 {archiveRestoreResult.archiveSummary.counts.taskQueueCount} · 发布 {archiveRestoreResult.archiveSummary.counts.releasePublishQueueCount} · 事件 {archiveRestoreResult.archiveSummary.counts.eventCount}</span>
          </article>
        ) : null}
      </div>
      {archiveSummary ? (
        <div className="runtime-section">
          <strong>归档历史</strong>
          <span>最近归档：{archiveSummary.lastCompactedAt ?? '暂无'} · 任务 {archiveSummary.counts.taskQueueCount} · 发布 {archiveSummary.counts.releasePublishQueueCount} · Run {archivedRunCount} · 事件 {archiveSummary.counts.eventCount}</span>
          {archiveSummary.counts.taskQueueCount > 0 ? <span>任务归档池 · {archiveSummary.counts.taskQueueCount}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestoreAll('taskQueue')} disabled={runtimeLoading}>全部恢复</button></em></span> : null}
          {archiveSummary.recentTaskQueue.slice(0, 4).map((item) => <span key={`archive-task-${item.id}`}>任务：{item.subtaskId} · {item.status} · {item.completedAt ?? item.updatedAt ?? item.queuedAt}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestore('taskQueue', item.id)} disabled={runtimeLoading}>恢复</button></em></span>)}
          {archiveSummary.counts.releasePublishQueueCount > 0 ? <span>发布归档池 · {archiveSummary.counts.releasePublishQueueCount}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestoreAll('releasePublishQueue')} disabled={runtimeLoading}>全部恢复</button></em></span> : null}
          {archiveSummary.recentReleasePublishQueue.slice(0, 4).map((item) => <span key={`archive-release-${item.id}`}>发布：{item.releaseId} · {item.status} · {item.publishedAt ?? item.updatedAt ?? item.queuedAt}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestore('releasePublishQueue', item.id)} disabled={runtimeLoading}>恢复</button></em></span>)}
          {archiveSummary.counts.taskQueueRunCount > 0 ? <span>任务 Run 归档池 · {archiveSummary.counts.taskQueueRunCount}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestoreAll('taskQueueRuns')} disabled={runtimeLoading}>全部恢复</button></em></span> : null}
          {archiveSummary.recentTaskQueueRuns.slice(0, 3).map((item) => <span key={`archive-task-run-${item.id}`}>任务 Run：{item.id} · {item.status} · {item.completedAt ?? item.startedAt}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestore('taskQueueRuns', item.id)} disabled={runtimeLoading}>恢复</button></em></span>)}
          {archiveSummary.counts.releasePublishRunCount > 0 ? <span>发布 Run 归档池 · {archiveSummary.counts.releasePublishRunCount}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestoreAll('releasePublishRuns')} disabled={runtimeLoading}>全部恢复</button></em></span> : null}
          {archiveSummary.recentReleasePublishRuns.slice(0, 3).map((item) => <span key={`archive-release-run-${item.id}`}>发布 Run：{item.id} · {item.status} · {item.completedAt ?? item.startedAt}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestore('releasePublishRuns', item.id)} disabled={runtimeLoading}>恢复</button></em></span>)}
          {archiveSummary.counts.eventCount > 0 ? <span>事件归档池 · {archiveSummary.counts.eventCount}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestoreAll('events')} disabled={runtimeLoading}>全部恢复</button></em></span> : null}
          {archiveSummary.recentEvents.slice(0, 4).map((event) => <span key={`archive-event-${event.id}`}>事件：{event.at} · {event.type} · {event.status}<em className="runtime-inline-actions"><button type="button" onClick={() => onArchiveRestore('events', event.id)} disabled={runtimeLoading}>恢复</button></em></span>)}
        </div>
      ) : null}
      {recentEvents.length > 0 ? (
        <div className="runtime-section">
          <strong>最近事件</strong>
          {recentEvents.slice(0, 8).map((event) => <span key={event.id}>{event.at} · {event.type} · {event.workflowId ?? event.releaseId ?? event.taskPlanId ?? event.runId ?? 'runtime'} · {event.status}</span>)}
        </div>
      ) : null}
      {taskQueue.length > 0 ? (
        <div className="runtime-section">
          <strong>任务队列</strong>
          {taskQueue.slice(0, 8).map((item) => (
            <span key={item.id}>
              {item.subtaskId} · {item.status} · {item.reportPath ?? item.error ?? item.title}
              <em className="runtime-inline-actions">
                {item.reportPath ? <button type="button" onClick={() => onTaskQueueReportOpen(item.reportPath as string)}>报告</button> : null}
                <button type="button" onClick={() => onTaskQueueItemRequeue(item.id)} disabled={runtimeLoading || item.status === 'running'}>重入</button>
                <button type="button" onClick={() => onTaskQueueItemRun(item.id)} disabled={runtimeLoading || item.status !== 'queued'}>运行</button>
              </em>
            </span>
          ))}
        </div>
      ) : null}
      {releasePublishQueue.length > 0 ? (
        <div className="runtime-section">
          <strong>发布队列</strong>
          {releasePublishQueue.slice(0, 8).map((item) => (
            <span key={item.id}>
              {item.releaseId} · {item.status} · {item.reason ?? 'release_publish'} · retry {item.retryCount ?? 0}
              {item.error ? ` · ${item.error}` : ''}
              <em className="runtime-inline-actions">
                <button type="button" onClick={() => onReleasePublishQueueItemRequeue(item.releaseId)} disabled={runtimeLoading || item.status !== 'blocked'}>重入</button>
                <button type="button" onClick={() => onReleasePublishQueueItemRun(item.releaseId)} disabled={runtimeLoading || item.status !== 'queued'}>运行</button>
              </em>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CapabilityRuntimePanel({ packs, onArtifactOpen, contextPack, taskPlan, taskPlanPersistResult, compiledWorkflowDraft, workflowDraft, workflowSelfTestResult, contextPackError, contextPackLoading, taskPlanLoading, taskPlanPersistLoading, workflowDraftLoading, workflowCompileLoading, workflowSaveLoading, workflowSelfTestLoading, selectedTaskType, onTaskTypeChange, onContextPackCompile, onTaskPlanCreate, onTaskPlanPersist, onWorkflowDraftBuild, onWorkflowTaskCompile, onWorkflowDraftSave, onWorkflowSelfTest }: { packs: CapabilityPack[]; onArtifactOpen: (artifact: string) => void; contextPack: TaskContextPack | null; taskPlan: SmartVisionTaskPlan | null; taskPlanPersistResult: TaskPlanPersistResult | null; compiledWorkflowDraft: CompiledWorkflowDraft | null; workflowDraft: WorkflowDraft | null; workflowSelfTestResult: WorkflowSelfTestResult | null; contextPackError: string | null; contextPackLoading: boolean; taskPlanLoading: boolean; taskPlanPersistLoading: boolean; workflowDraftLoading: boolean; workflowCompileLoading: boolean; workflowSaveLoading: boolean; workflowSelfTestLoading: boolean; selectedTaskType: string; onTaskTypeChange: (taskType: string) => void; onContextPackCompile: () => void; onTaskPlanCreate: () => void; onTaskPlanPersist: () => void; onWorkflowDraftBuild: () => void; onWorkflowTaskCompile: () => void; onWorkflowDraftSave: () => void; onWorkflowSelfTest: () => void }) {
  const taskTypes = Array.from(new Set([
    'asset_image_generation',
    'storyboard_image_generation',
    'video_generation',
    ...packs.flatMap((pack) => pack.items.flatMap((item) => item.taskTypes))
  ]));

  return (
    <section className="panel capability-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Capability Runtime</p>
          <h2>Phase 2 能力包索引 / 任务上下文包</h2>
        </div>
        <span className="count-pill">{packs.length}</span>
      </div>
      <div className="context-compiler">
        <div>
          <strong>按任务类型编译上下文包</strong>
          <span>从方法论包、Skill 包、模板包与项目产物索引中组装可交给 Agent / Workflow Builder 的任务上下文。</span>
        </div>
        <div className="context-controls">
          <select value={selectedTaskType} onChange={(event) => onTaskTypeChange(event.target.value)}>
            {taskTypes.length > 0 ? taskTypes.map((taskType) => <option value={taskType} key={taskType}>{taskType}</option>) : <option value="storyboard">storyboard</option>}
          </select>
          <button type="button" onClick={onContextPackCompile} disabled={contextPackLoading}>{contextPackLoading ? '编译中...' : '编译上下文包'}</button>
          <button type="button" onClick={onTaskPlanCreate} disabled={taskPlanLoading}>{taskPlanLoading ? '生成中...' : '生成任务计划'}</button>
          <button type="button" onClick={onTaskPlanPersist} disabled={taskPlanPersistLoading}>{taskPlanPersistLoading ? '落盘中...' : '落盘任务编排'}</button>
          <button type="button" onClick={onWorkflowTaskCompile} disabled={workflowCompileLoading}>{workflowCompileLoading ? '编译中...' : '编译 Workflow Draft'}</button>
          <button type="button" onClick={onWorkflowDraftBuild} disabled={workflowDraftLoading}>{workflowDraftLoading ? '生成中...' : '生成 Workflow 草案'}</button>
          <button type="button" onClick={onWorkflowDraftSave} disabled={workflowSaveLoading}>{workflowSaveLoading ? '保存中...' : '保存为项目 Workflow'}</button>
          <button type="button" onClick={onWorkflowSelfTest} disabled={workflowSelfTestLoading}>{workflowSelfTestLoading ? '自测中...' : '运行最小闭环自测'}</button>
        </div>
        {workflowSelfTestResult ? (
          <div className="context-pack-preview">
            <div className="context-pack-grid">
              <span>自测：{workflowSelfTestResult.status === 'passed' ? '通过' : '失败'}</span>
              <span>源 Workflow：{workflowSelfTestResult.sourceWorkflowId}</span>
              <span>产物审核：{workflowSelfTestResult.artifactReviewId}</span>
              <span>下游 Workflow：{workflowSelfTestResult.nextWorkflowId ?? '未创建'}</span>
            </div>
            <span>{workflowSelfTestResult.chainStage ?? '链路阶段待确认'} · {workflowSelfTestResult.checkedAt}</span>
          </div>
        ) : null}
        {contextPackError ? <div className="context-error">{contextPackError}</div> : null}
        {taskPlanPersistResult ? (
          <div className="context-pack-preview">
            <div className="context-pack-grid">
              <span>任务落盘：{taskPlanPersistResult.taskPlan.taskId}</span>
              <span>Progress：{taskPlanPersistResult.progressItems.length}</span>
              <span>队列：{taskPlanPersistResult.queuedTasks.length}</span>
              <span>时间：{taskPlanPersistResult.persistedAt}</span>
            </div>
          </div>
        ) : null}
        {taskPlan ? (
          <div className="task-plan-preview">
            <div className="workflow-draft-heading">
              <div>
                <strong>{taskPlan.title}</strong>
                <span>{taskPlan.taskId}</span>
              </div>
              <div className="workflow-draft-actions">
                <button type="button" onClick={onWorkflowTaskCompile} disabled={workflowCompileLoading}>{workflowCompileLoading ? '编译中...' : '编译 Workflow Draft'}</button>
              </div>
            </div>
            <div className="context-pack-grid">
              <span>Agent：{taskPlan.agentRole}</span>
              <span>Phase：{taskPlan.phase}</span>
              <span>Gate：{taskPlan.phaseGate}</span>
              <span>Stage：{taskPlan.productionPipeline?.currentStage ?? 'ad_hoc'}</span>
              <span>Next：{taskPlan.productionPipeline?.nextTaskType ?? 'none'}</span>
              <span>Docs：{taskPlan.requiredDocs.length}</span>
              <span>Skills：{taskPlan.requiredSkills.length}</span>
              <span>Inputs：{taskPlan.inputArtifacts.length}</span>
              <span>子任务：{taskPlan.subtasks?.length ?? 0}</span>
              <span>缺失引用：{taskPlan.referenceIssues?.length ?? 0}</span>
            </div>
            {taskPlan.subtasks?.length ? (
              <div className="runtime-section">
                <strong>任务编排</strong>
                {taskPlan.subtasks.map((subtask) => <span key={subtask.id}>{subtask.id} · {subtask.ownerRole} · {subtask.status} · {subtask.title}</span>)}
              </div>
            ) : null}
            <pre>{JSON.stringify(taskPlan, null, 2)}</pre>
          </div>
        ) : null}
        {compiledWorkflowDraft ? (
          <div className="compiled-workflow-preview">
            <div className="workflow-draft-heading">
              <div>
                <strong>已编译 Workflow Draft</strong>
                <span>{compiledWorkflowDraft.workflowDraft.path}</span>
              </div>
              <div className="workflow-draft-actions">
                <button type="button" onClick={() => onArtifactOpen(compiledWorkflowDraft.workflowDraft.path)}>预览 JSON</button>
                <a className="workflow-import-action" href={compiledWorkflowDraft.importUrl} target="_blank" rel="noreferrer">打开导入 URL</a>
              </div>
            </div>
            <div className="context-pack-grid">
              <span>Task：{compiledWorkflowDraft.taskPlan.taskType}</span>
              <span>执行器：{compiledWorkflowDraft.workflowDraft.canvasExecution?.executor ?? 'infinite_canvas'}</span>
              <span>模式：{compiledWorkflowDraft.workflowDraft.canvasExecution?.workflowMode ?? '未标记'}</span>
              <span>策略：{compiledWorkflowDraft.workflowDraft.canvasExecution?.strategy?.mode ?? 'operator_controlled'}</span>
              <span>直调模型：{compiledWorkflowDraft.workflowDraft.canvasExecution?.directModelExecution ? '允许' : '禁止'}</span>
              <span>提示词：{compiledWorkflowDraft.workflowDraft.canvasExecution?.promptCount ?? 0}</span>
              <span>参考图：{compiledWorkflowDraft.workflowDraft.canvasExecution?.referenceImageCount ?? 0}</span>
              <span>Nodes：{compiledWorkflowDraft.workflowDraft.canvas.nodes.length}</span>
              <span>Conns：{compiledWorkflowDraft.workflowDraft.canvas.conns.length}</span>
              <span>落盘：{compiledWorkflowDraft.persisted ? '已写入项目文件' : '仅内存草案'}</span>
              <span>生成：{compiledWorkflowDraft.generatedAt}</span>
            </div>
            {compiledWorkflowDraft.workflowDraft.canvasExecution ? (
              <div className="workflow-draft-actions secondary">
                <a className="workflow-import-action" href={compiledWorkflowDraft.workflowDraft.canvasExecution.editUrl} target="_blank" rel="noreferrer">编辑画布工作流</a>
                <a className="workflow-import-action" href={compiledWorkflowDraft.workflowDraft.canvasExecution.runUrl} target="_blank" rel="noreferrer">导入画布</a>
              </div>
            ) : null}
            <pre>{JSON.stringify(compiledWorkflowDraft, null, 2)}</pre>
          </div>
        ) : null}
        {contextPack ? (
          <div className="context-pack-preview">
            <div className="context-pack-grid">
              <span>Docs：{contextPack.docs.length}</span>
              <span>Skills：{contextPack.skills.length}</span>
              <span>Templates：{contextPack.templates.length}</span>
              <span>Artifacts：{contextPack.inputArtifacts.length}</span>
              <span>已解析：{contextPack.parsedReferences?.filter((item) => item.exists && !item.error).length ?? 0}</span>
              <span>缺失：{contextPack.referenceIssues.length}</span>
            </div>
            {contextPack.parsedReferences?.length ? (
              <div className="runtime-section">
                <strong>数据包解析</strong>
                {contextPack.parsedReferences.slice(0, 8).map((item) => <span key={`${item.sourceKind}-${item.path}`}>{item.sourceKind} · {item.exists ? 'ok' : 'missing'} · {item.path}</span>)}
              </div>
            ) : null}
            <pre>{JSON.stringify(contextPack, null, 2)}</pre>
          </div>
        ) : null}
        {workflowDraft ? (
          <div className="workflow-draft-preview">
            <div className="workflow-draft-heading">
              <div>
                <strong>{workflowDraft.name}</strong>
                <span>{workflowDraft.path}</span>
              </div>
              <div className="workflow-draft-actions">
                <button type="button" onClick={onWorkflowDraftSave} disabled={workflowSaveLoading}>{workflowSaveLoading ? '保存中...' : '保存为项目 Workflow'}</button>
                <a className="workflow-import-action" href={workflowDraft.importUrl} target="_blank" rel="noreferrer">导入草案到画布</a>
              </div>
            </div>
            <div className="context-pack-grid">
              <span>执行器：{workflowDraft.canvasExecution?.executor ?? 'infinite_canvas'}</span>
              <span>模式：{workflowDraft.canvasExecution?.workflowMode ?? '未标记'}</span>
              <span>策略：{workflowDraft.canvasExecution?.strategy?.mode ?? 'operator_controlled'}</span>
              <span>直调模型：{workflowDraft.canvasExecution?.directModelExecution ? '允许' : '禁止'}</span>
              <span>提示词：{workflowDraft.canvasExecution?.promptCount ?? 0}</span>
              <span>参考图：{workflowDraft.canvasExecution?.referenceImageCount ?? 0}</span>
              <span>Nodes：{workflowDraft.canvas.nodes.length}</span>
              <span>Conns：{workflowDraft.canvas.conns.length}</span>
              <span>Task：{workflowDraft.taskType}</span>
            </div>
            {workflowDraft.canvasExecution ? (
              <div className="workflow-draft-actions secondary">
                <a className="workflow-import-action" href={workflowDraft.canvasExecution.editUrl} target="_blank" rel="noreferrer">编辑画布工作流</a>
                <a className="workflow-import-action" href={workflowDraft.canvasExecution.runUrl} target="_blank" rel="noreferrer">导入画布</a>
              </div>
            ) : null}
            <pre>{JSON.stringify(workflowDraft, null, 2)}</pre>
          </div>
        ) : null}
      </div>
      <div className="capability-pack-list">
        {packs.map((pack) => (
          <article className="capability-pack" key={pack.packId}>
            <div>
              <strong>{pack.title}</strong>
              <span>{pack.note}</span>
            </div>
            <div className="capability-items">
              {pack.items.map((item) => (
                <div className="capability-item" key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.taskTypes.join(' / ')}</span>
                  <div className="capability-links">
                    {(item.documents ?? item.files ?? []).slice(0, 4).map((file) => (
                      <button type="button" key={file} onClick={() => onArtifactOpen(file)}>{file}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskBoard({ taskColumns, onTaskStatusChange }: { taskColumns: TaskColumn[]; onTaskStatusChange: (taskId: string, status: TaskStatus) => void }) {
  return (
    <section className="panel board-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Phase 1 MVP</p>
          <h2>单集任务看板</h2>
        </div>
        <span className="count-pill">{taskColumns.length} 列</span>
      </div>
      <div className="task-board">
        {taskColumns.map((column) => (
          <article className={`task-column ${column.status}`} key={column.id}>
            <div className="task-status">
              {statusIcon[column.status]}
              <span>{statusLabel[column.status]}</span>
            </div>
            <h3>{column.title}</h3>
            <p>{column.description}</p>
            <ul>
              {column.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="inline-actions">
              <button type="button" onClick={() => onTaskStatusChange(column.id, 'in_progress')}>进行中</button>
              <button type="button" onClick={() => onTaskStatusChange(column.id, 'waiting_review')}>待审核</button>
              <button type="button" onClick={() => onTaskStatusChange(column.id, 'done')}>完成</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewCenter({ reviews, activeArtifact, onReviewStatusChange, onArtifactOpen }: { reviews: ReviewItem[]; activeArtifact: string | null; onReviewStatusChange: (reviewId: string, status: TaskStatus) => void; onArtifactOpen: (artifact: string) => void }) {
  return (
    <section className="panel review-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Review</p>
          <h2>审核中心</h2>
        </div>
        <span className="count-pill">{reviews.length}</span>
      </div>
      <div className="review-list">
        {reviews.map((item) => (
          <div className={activeArtifact === item.target ? 'review-item active' : 'review-item'} key={item.id}>
            <span>{statusIcon[item.status]}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{statusLabel[item.status]} · {item.target}</p>
              {item.workflowId ? <em className="review-link">关联 Workflow：{item.workflowId}</em> : null}
              {item.artifactPath ? <em className="review-link">产物：{item.artifactPath}</em> : null}
              <div className="inline-actions">
                <button type="button" onClick={() => onArtifactOpen(item.target)}>预览产物</button>
                <button type="button" onClick={() => onReviewStatusChange(item.id, 'done')}>通过</button>
                <button type="button" onClick={() => onReviewStatusChange(item.id, 'blocked')}>打回</button>
                <button type="button" onClick={() => onReviewStatusChange(item.id, 'in_progress')}>处理中</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function parseTaskQueueExecutionReport(preview: ArtifactPreview): TaskQueueExecutionReport | null {
  if (!preview.path.includes('.smart-vision/task-runs/') || preview.extension !== '.json' || !preview.content) return null;

  try {
    const parsed = JSON.parse(preview.content) as Partial<TaskQueueExecutionReport>;
    if (parsed.executionMode !== 'orchestration_report' || !parsed.runId || !parsed.taskQueueId) return null;
    return {
      version: parsed.version ?? '0.1.0',
      runId: parsed.runId,
      taskPlanId: parsed.taskPlanId ?? '',
      subtaskId: parsed.subtaskId ?? '',
      taskQueueId: parsed.taskQueueId,
      taskType: parsed.taskType ?? '',
      title: parsed.title ?? '',
      ownerRole: parsed.ownerRole ?? '',
      status: parsed.status ?? 'unknown',
      startedAt: parsed.startedAt ?? '',
      completedAt: parsed.completedAt ?? '',
      executionMode: parsed.executionMode,
      progressItemId: parsed.progressItemId ?? '',
      phase: parsed.phase ?? '',
      dependencyProgressIds: parsed.dependencyProgressIds ?? [],
      inputChecks: parsed.inputChecks ?? [],
      outputChecks: parsed.outputChecks ?? [],
      acceptanceCriteria: parsed.acceptanceCriteria ?? [],
      notes: parsed.notes ?? [],
      error: parsed.error ?? null
    };
  } catch {
    return null;
  }
}

function TaskQueueReportPreview({ report, rawContent }: { report: TaskQueueExecutionReport; rawContent?: string }) {
  const renderChecks = (checks: TaskQueueExecutionReport['inputChecks']) => checks.length > 0 ? checks.map((item) => (
    <span className={`task-report-check ${item.check}`} key={`${item.path}-${item.check}`}>
      {item.check} · {item.path}{item.reason ? ` · ${item.reason}` : ''}{item.error ? ` · ${item.error}` : ''}
    </span>
  )) : <span className="task-report-check skipped">无检查项</span>;

  return (
    <div className="task-report-preview">
      <div className="task-report-hero">
        <div>
          <strong>{report.title || report.subtaskId}</strong>
          <span>{report.taskType} · {report.ownerRole} · {report.phase}</span>
        </div>
        <em className={report.status === 'done' ? 'ok' : 'warn'}>{report.status}</em>
      </div>
      <div className="task-report-grid">
        <span>Run：{report.runId}</span>
        <span>TaskPlan：{report.taskPlanId}</span>
        <span>Subtask：{report.subtaskId}</span>
        <span>Progress：{report.progressItemId}</span>
        <span>开始：{report.startedAt}</span>
        <span>结束：{report.completedAt}</span>
      </div>
      {report.error ? <div className="context-error">{report.error}</div> : null}
      <div className="task-report-section">
        <strong>输入检查</strong>
        <div>{renderChecks(report.inputChecks)}</div>
      </div>
      <div className="task-report-section">
        <strong>输出检查</strong>
        <div>{renderChecks(report.outputChecks)}</div>
      </div>
      <div className="task-report-section">
        <strong>验收标准</strong>
        <div>{report.acceptanceCriteria.map((item) => <span key={item}>{item}</span>)}</div>
      </div>
      <div className="task-report-section">
        <strong>记录说明</strong>
        <div>{report.notes.map((item) => <span key={item}>{item}</span>)}</div>
      </div>
      {rawContent ? (
        <details className="task-report-raw">
          <summary>原始 JSON</summary>
          <pre>{rawContent}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ArtifactPreviewPanel({ preview, error }: { preview: ArtifactPreview | null; error: string | null }) {
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    setImageOpen(false);
  }, [preview?.path]);

  if (error) {
    return <div className="artifact-preview error">{error}</div>;
  }

  if (!preview) {
    return <div className="artifact-preview empty">选择一个关键产物后在这里预览内容。</div>;
  }

  const taskQueueReport = parseTaskQueueExecutionReport(preview);

  return (
    <div className="artifact-preview">
      <div className="artifact-preview-heading">
        <div>
          <strong>{preview.name}</strong>
          <span>{preview.path}</span>
        </div>
        <em>{preview.kind} · {Math.max(1, Math.ceil(preview.size / 1024))} KB</em>
      </div>
      {preview.kind === 'image' && preview.dataUrl ? (
        <>
          <button type="button" className="artifact-image-trigger" onClick={() => setImageOpen(true)} aria-label="查看大图">
            <img src={preview.dataUrl} alt={preview.name} />
          </button>
          {imageOpen ? (
            <div className="artifact-lightbox" role="dialog" aria-modal="true" aria-label="资产大图预览" onClick={() => setImageOpen(false)}>
              <button type="button" className="artifact-lightbox-close" onClick={() => setImageOpen(false)} aria-label="关闭大图">
                <XCircle size={18} />
                关闭
              </button>
              <img src={preview.dataUrl} alt={preview.name} onClick={(event) => event.stopPropagation()} />
            </div>
          ) : null}
        </>
      ) : null}
      {taskQueueReport ? (
        <TaskQueueReportPreview report={taskQueueReport} rawContent={preview.content} />
      ) : null}
      {preview.kind === 'text' && !taskQueueReport ? (
        <pre>{preview.content}</pre>
      ) : null}
      {preview.kind === 'video' && preview.fileUrl ? (
        <video controls src={preview.fileUrl} />
      ) : null}
      {preview.kind === 'unsupported' ? (
        <p>暂不支持预览该类型文件：{preview.extension || 'unknown'}</p>
      ) : null}
    </div>
  );
}

function ArtifactRegistry({ artifacts, activeArtifact, preview, error, loading, filterId, onFilterChange, onArtifactOpen, onArtifactRefresh }: { artifacts: string[]; activeArtifact: string | null; preview: ArtifactPreview | null; error: string | null; loading: boolean; filterId: ArtifactFilterId; onFilterChange: (filterId: ArtifactFilterId) => void; onArtifactOpen: (artifact: string) => void; onArtifactRefresh: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const visibleArtifacts = filterArtifacts(artifacts, filterId);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const searchedArtifacts = normalizedSearchTerm ? visibleArtifacts.filter((artifact) => artifact.toLowerCase().includes(normalizedSearchTerm)) : visibleArtifacts;
  const artifactGroups = groupVisibleArtifacts(searchedArtifacts, filterId);

  return (
    <section className="panel artifact-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Artifacts</p>
          <h2>关键产物索引</h2>
        </div>
        <div className="artifact-header-actions">
          {activeArtifact ? (
            <button type="button" onClick={onArtifactRefresh} disabled={loading}>
              <RefreshCcw size={14} />
              刷新预览
            </button>
          ) : null}
          <span className="count-pill">{visibleArtifacts.length} / {artifacts.length}</span>
        </div>
      </div>
      <div className="artifact-filter-tabs">
        {artifactFilters.map((filter) => (
          <button type="button" className={filterId === filter.id ? 'active' : ''} key={filter.id} onClick={() => onFilterChange(filter.id)}>
            {filter.label}
            <span className="artifact-filter-count">{getArtifactFilterCount(artifacts, filter)}</span>
          </button>
        ))}
      </div>
      <div className="artifact-workspace">
        <div className="artifact-list">
          {artifactGroups.map((group) => (
            <div className="artifact-group" key={group.id}>
              <div className="artifact-group-heading">
                <span>{group.label}</span>
                <span>{group.artifacts.length}</span>
              </div>
              {group.artifacts.length > 0 ? group.artifacts.map((artifact) => (
                <button type="button" className={activeArtifact === artifact ? 'artifact-item active' : 'artifact-item'} key={artifact} onClick={() => onArtifactOpen(artifact)}>
                  <span className="artifact-item-body">
                    <strong className="artifact-item-name">{getArtifactName(artifact)}</strong>
                    <span className="artifact-item-path">{getArtifactLocation(artifact)}</span>
                  </span>
                </button>
              )) : filterId === 'primary' ? <div className="artifact-group-empty">待补充{group.label}产物</div> : null}
            </div>
          ))}
          {searchedArtifacts.length === 0 ? <div className="artifact-empty">{searchTerm ? `未找到“${searchTerm}”相关产物。` : '当前筛选下暂无产物。请先生成或导入对应目录产物。'}</div> : null}
        </div>
        {loading ? <div className="artifact-preview empty">正在读取产物内容...</div> : <ArtifactPreviewPanel preview={preview} error={error} />}
      </div>
    </section>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>(projectSnapshot);
  const [source, setSource] = useState<'bridge' | 'bundled'>('bundled');
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null);
  const [artifactFilterId, setArtifactFilterId] = useState<ArtifactFilterId>('primary');
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState('asset_image_generation');
  const [contextPack, setContextPack] = useState<TaskContextPack | null>(null);
  const [taskPlan, setTaskPlan] = useState<SmartVisionTaskPlan | null>(null);
  const [taskPlanPersistResult, setTaskPlanPersistResult] = useState<TaskPlanPersistResult | null>(null);
  const [compiledWorkflowDraft, setCompiledWorkflowDraft] = useState<CompiledWorkflowDraft | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDraft | null>(null);
  const [workflowSelfTestResult, setWorkflowSelfTestResult] = useState<WorkflowSelfTestResult | null>(null);
  const [contextPackError, setContextPackError] = useState<string | null>(null);
  const [contextPackLoading, setContextPackLoading] = useState(false);
  const [taskPlanLoading, setTaskPlanLoading] = useState(false);
  const [taskPlanPersistLoading, setTaskPlanPersistLoading] = useState(false);
  const [workflowDraftLoading, setWorkflowDraftLoading] = useState(false);
  const [workflowCompileLoading, setWorkflowCompileLoading] = useState(false);
  const [workflowSaveLoading, setWorkflowSaveLoading] = useState(false);
  const [workflowSelfTestLoading, setWorkflowSelfTestLoading] = useState(false);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<WorkflowRuntimeDiagnostics | null>(null);
  const [runnerStatus, setRunnerStatus] = useState<WorkflowRunnerStatus | null>(null);
  const [queueResult, setQueueResult] = useState<WorkflowQueueRunResult | null>(null);
  const [taskQueueResult, setTaskQueueResult] = useState<WorkflowTaskQueueRunResult | null>(null);
  const [taskQueueRequeueResult, setTaskQueueRequeueResult] = useState<WorkflowTaskQueueRequeueResult | null>(null);
  const [taskQueueStressResult, setTaskQueueStressResult] = useState<WorkflowTaskQueueStressResult | null>(null);
  const [repairPreviewResult, setRepairPreviewResult] = useState<WorkflowRuntimeRepairResult | null>(null);
  const [compactionPreviewResult, setCompactionPreviewResult] = useState<WorkflowRunnerCompactionResult | null>(null);
  const [releasePublishQueuePreviewResult, setReleasePublishQueuePreviewResult] = useState<ReleasePublishQueueRunResult | null>(null);
  const [releasePublishQueueResult, setReleasePublishQueueResult] = useState<ReleasePublishQueueRunResult | null>(null);
  const [releasePublishRequeueResult, setReleasePublishRequeueResult] = useState<ReleasePublishQueueRequeueResult | null>(null);
  const [releasePublishSmokeResult, setReleasePublishSmokeResult] = useState<ReleasePublishQueueSmokeResult | null>(null);
  const [runtimeSmokeResult, setRuntimeSmokeResult] = useState<SmartVisionRuntimeSmokeResult | null>(null);
  const [pipelineRunRegistry, setPipelineRunRegistry] = useState<PipelineRunRegistry | null>(snapshot.pipelineRunRegistry ?? null);
  const [pipelineRunCreateResult, setPipelineRunCreateResult] = useState<PipelineRunResult | null>(null);
  const [pipelineRunAdvanceResult, setPipelineRunAdvanceResult] = useState<PipelineRunResult | null>(null);
  const [pipelineRunSmokeResult, setPipelineRunSmokeResult] = useState<PipelineRunSmokeResult | null>(null);
  const [pipelineRunRepairPreviewResult, setPipelineRunRepairPreviewResult] = useState<PipelineRunRepairResult | null>(null);
  const [pipelineRunRepairResult, setPipelineRunRepairResult] = useState<PipelineRunRepairResult | null>(null);
  const [retryResult, setRetryResult] = useState<WorkflowRunnerRetryResult | null>(null);
  const [canvasOutputRegisterResult, setCanvasOutputRegisterResult] = useState<CanvasOutputRegisterResult | null>(null);
  const [canvasRunSessionResult, setCanvasRunSessionResult] = useState<CanvasRunSessionResult | null>(null);
  const [canvasOutputRetryResult, setCanvasOutputRetryResult] = useState<CanvasOutputRetryResult | null>(null);
  const [repairResult, setRepairResult] = useState<WorkflowRuntimeRepairResult | null>(null);
  const [compactionResult, setCompactionResult] = useState<WorkflowRunnerCompactionResult | null>(null);
  const [archiveRestoreResult, setArchiveRestoreResult] = useState<WorkflowRunnerArchiveRestoreResult | null>(null);
  const [stressTaskTypes, setStressTaskTypes] = useState('asset_image_generation, storyboard_image_generation, video_generation, edit, qa, release');
  const [stressCopies, setStressCopies] = useState(2);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null);
  const [releaseRepairResult, setReleaseRepairResult] = useState<ReleaseRepairResult | null>(null);
  const [highlightedWorkflowId, setHighlightedWorkflowId] = useState<string | null>(null);
  const [workflowActionNotice, setWorkflowActionNotice] = useState<string | null>(null);
  const [creatorView, setCreatorView] = useState<CreatorView>('entry');
  const [productionMode, setProductionMode] = useState<ProductionMode>('assisted');
  const [storyScript, setStoryScript] = useState(() => localStorage.getItem('smart-vision-story-script') ?? '');
  const [storyFiles, setStoryFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('smart-vision-story-files') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [creativePlanResult, setCreativePlanResult] = useState<CreativeStartResult | null>(null);
  const [assetConfirmCards, setAssetConfirmCards] = useState<AssetConfirmCard[]>([]);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchProjectSnapshot().then((nextSnapshot) => {
      if (!mounted) return;
      setSnapshot(nextSnapshot);
      setPipelineRunRegistry(nextSnapshot.pipelineRunRegistry ?? null);
      setSource(nextSnapshot === projectSnapshot ? 'bundled' : 'bridge');
    });

    return () => {
      mounted = false;
    };
  }, []);

  const activeProject = snapshot.projects[0];

  useEffect(() => {
    localStorage.setItem('smart-vision-story-script', storyScript);
  }, [storyScript]);

  useEffect(() => {
    localStorage.setItem('smart-vision-story-files', JSON.stringify(storyFiles));
  }, [storyFiles]);

  const applySnapshot = (nextSnapshot: ProjectSnapshot) => {
    setSnapshot(nextSnapshot);
    setPipelineRunRegistry(nextSnapshot.pipelineRunRegistry ?? null);
    setSource(nextSnapshot === projectSnapshot ? 'bundled' : 'bridge');
  };

  const markWorkflowAction = (notice: string, workflowId?: string | null) => {
    setWorkflowActionNotice(notice);
    setHighlightedWorkflowId(workflowId ?? null);
  };

  const handleStoryFilesImport = async (files: FileList | null) => {
    if (!files?.length) return;
    const names = Array.from(files).map((file) => file.name);
    setStoryFiles((current) => Array.from(new Set([...current, ...names])));
    const textFiles = Array.from(files).filter((file) => /\.(txt|md|json)$/i.test(file.name));
    if (textFiles.length > 0) {
      const contents = await Promise.all(textFiles.map(async (file) => `\n\n# ${file.name}\n${await file.text()}`));
      setStoryScript((current) => `${current}${contents.join('')}`.trim());
    }
    setStoryError(null);
  };

  const handleCreatorStart = async () => {
    if (!storyScript.trim() && storyFiles.length === 0) {
      setStoryError('请先输入创意、故事梗概、剧本原文，或导入文本 / 图片资料。');
      return;
    }
    setStoryError(null);
    setCreatorView('asset-confirm');
    const existingRun = getLatestPipelineRun(pipelineRunRegistry);
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const result = await startCreativeProduction({
        episodeId: activeProject?.currentEpisode ?? 'ep001',
        scriptText: storyScript,
        importedFiles: storyFiles,
        createPipelineRun: true,
        prepareFirstStage: true
      });
      setCreativePlanResult(result);
      setAssetConfirmCards(createAssetConfirmCards(result));
      if (result.pipelineRun) {
        setPipelineRunCreateResult(result.pipelineRun);
        setPipelineRunRegistry(result.pipelineRun.registry);
        markWorkflowAction(`生产流程已创建：${result.pipelineRun.run.id}。`, result.pipelineRun.run.stages[0]?.workflowId ?? null);
      } else {
        setPipelineRunRegistry(result.snapshot.pipelineRunRegistry ?? null);
        markWorkflowAction(`剧本已重新解析：${result.shotCount} 个视频段 / ${result.assetCount} 项资产。`, existingRun?.currentStageId ?? null);
      }
      applySnapshot(result.snapshot);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleSmartCanvasOpen = (workflowId?: string | null) => {
    const run = getLatestPipelineRun(pipelineRunRegistry);
    const stage = workflowId ? run?.stages.find((item) => item.workflowId === workflowId) : getCurrentPipelineStage(run);
    const workflow = snapshot.workflowRegistry.workflows.find((item) => item.id === (workflowId ?? stage?.workflowId) || item.path === stage?.workflowPath);
    if (!workflow?.runUrl) return;
    handleCanvasRunSessionStart({
      workflowId: workflow.id,
      workflowPath: workflow.path,
      pipelineRunId: run?.id ?? null,
      stageId: stage?.id ?? null,
      outputArtifactHint: workflow.outputArtifacts?.find(isConcreteArtifactTarget) ?? workflow.outputArtifacts?.[0],
      outputArtifactHints: workflow.outputArtifacts ?? [],
      importUrl: workflow.importUrl,
      editUrl: workflow.editUrl,
      runUrl: workflow.runUrl
    });
    window.open(workflow.runUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAssetConfirmDone = () => {
    const allConfirmed = assetConfirmCards.length > 0 && assetConfirmCards.every((card) => card.status === 'confirmed' && card.finalImageUrl);
    if (!allConfirmed) {
      setStoryError('请先确认全部资产图，再创建分镜提示词节点。');
      return;
    }
    setStoryError(null);
    setCreatorView('seedance-node');
  };

  const handleReviewStatusChange = async (reviewId: string, status: TaskStatus) => {
    const nextSnapshot = await updateReviewStatus(reviewId, status);
    applySnapshot(nextSnapshot);
    const triggeredWorkflow = nextSnapshot.workflowRegistry.workflows.find((workflow) => workflow.triggeredByReviewId === reviewId && !workflow.archived);
    markWorkflowAction(status === 'done' ? '审核已通过，下游 Workflow 已同步。' : '审核状态已更新。', triggeredWorkflow?.id ?? null);
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    const nextSnapshot = await updateTaskStatus(taskId, status);
    applySnapshot(nextSnapshot);
  };

  const handleWorkflowStatusChange = async (workflowId: string, status: TaskStatus) => {
    const nextSnapshot = await updateWorkflowStatus(workflowId, status);
    applySnapshot(nextSnapshot);
    markWorkflowAction(`Workflow 已更新为${statusLabel[status]}。`, workflowId);
  };

  const handleWorkflowOutputAdd = async (workflowId: string, artifactPath: string, resetBlocked = false) => {
    const nextSnapshot = await addWorkflowOutput(workflowId, artifactPath, resetBlocked);
    applySnapshot(nextSnapshot);
    markWorkflowAction(resetBlocked ? '返工产物已重新送审。' : '输出产物已登记，并已进入产物审核链路。', workflowId);
  };

  const handleWorkflowChainAction = async (workflowId: string) => {
    const result = await executeWorkflowChainAction({ workflowId });
    applySnapshot(result.snapshot);
    markWorkflowAction(`链路动作已执行：${result.action}。`, workflowId);
  };

  const handleWorkflowArchive = async (workflowId: string) => {
    const nextSnapshot = await archiveWorkflow(workflowId);
    applySnapshot(nextSnapshot);
  };

  const handleWorkflowRestore = async (workflowId: string) => {
    const nextSnapshot = await restoreWorkflow(workflowId);
    applySnapshot(nextSnapshot);
  };

  const handleArtifactOpen = async (artifact: string) => {
    setActiveArtifact(artifact);
    setArtifactLoading(true);
    setArtifactError(null);

    try {
      const preview = await fetchArtifactPreview(artifact);
      setArtifactPreview(preview);
    } catch (error) {
      setArtifactPreview(null);
      setArtifactError(error instanceof Error ? error.message : String(error));
    } finally {
      setArtifactLoading(false);
    }
  };

  const handleArtifactRefresh = () => {
    if (!activeArtifact) return;
    void handleArtifactOpen(activeArtifact);
  };

  const handleContextPackCompile = async () => {
    setContextPackLoading(true);
    setContextPackError(null);

    try {
      const nextContextPack = await fetchTaskContextPack(selectedTaskType);
      setContextPack(nextContextPack);
      setWorkflowDraft(null);
    } catch (error) {
      setContextPack(null);
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setContextPackLoading(false);
    }
  };

  const handleTaskPlanCreate = async () => {
    setTaskPlanLoading(true);
    setContextPackError(null);

    try {
      const nextTaskPlan = await createWorkflowTaskPlan({ taskType: selectedTaskType });
      setTaskPlan(nextTaskPlan);
      setTaskPlanPersistResult(null);
      setCompiledWorkflowDraft(null);
    } catch (error) {
      setTaskPlan(null);
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setTaskPlanLoading(false);
    }
  };

  const handleTaskPlanPersist = async () => {
    setTaskPlanPersistLoading(true);
    setContextPackError(null);

    try {
      const result = await persistWorkflowTaskPlan(taskPlan ? { taskPlan } : { taskType: selectedTaskType });
      setTaskPlan(result.taskPlan);
      setTaskPlanPersistResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`任务编排已落盘：${result.progressItems.length} 个 progress 项，${result.queuedTasks.length} 个队列项。`, null);
    } catch (error) {
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setTaskPlanPersistLoading(false);
    }
  };

  const handleWorkflowTaskCompile = async () => {
    setWorkflowCompileLoading(true);
    setContextPackError(null);

    try {
      const result = await compileWorkflowTask(taskPlan ? { taskPlan } : { taskType: selectedTaskType });
      setTaskPlan(result.taskPlan);
      setCompiledWorkflowDraft(result);
      setWorkflowDraft(result.workflowDraft);
      setContextPack(result.workflowDraft.contextPack);
    } catch (error) {
      setCompiledWorkflowDraft(null);
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowCompileLoading(false);
    }
  };

  const handleWorkflowDraftBuild = async () => {
    setWorkflowDraftLoading(true);
    setContextPackError(null);

    try {
      const nextWorkflowDraft = await fetchWorkflowDraft(selectedTaskType);
      setWorkflowDraft(nextWorkflowDraft);
      setCompiledWorkflowDraft(null);
      setContextPack(nextWorkflowDraft.contextPack);
    } catch (error) {
      setWorkflowDraft(null);
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowDraftLoading(false);
    }
  };

  const handleWorkflowDraftSave = async () => {
    setWorkflowSaveLoading(true);
    setContextPackError(null);

    try {
      const sourceWorkflowDraft = compiledWorkflowDraft?.workflowDraft ?? workflowDraft ?? undefined;
      const result = await saveWorkflowDraft(sourceWorkflowDraft?.taskType ?? selectedTaskType, sourceWorkflowDraft);
      setWorkflowDraft(result.workflowDraft);
      setCompiledWorkflowDraft((current) => current?.workflowDraft.id === result.workflowDraft.id ? { ...current, workflowDraft: result.workflowDraft, path: result.workflowDraft.path, importUrl: result.workflowDraft.importUrl, persisted: true, importCheck: result.importCheck } : current);
      setContextPack(result.workflowDraft.contextPack);
      applySnapshot(result.snapshot);
      setActiveArtifact(result.workflowDraft.path);
      setArtifactPreview(null);
      setArtifactError(null);
      markWorkflowAction('项目 Workflow 已保存，可导入画布执行。', result.workflow.id);
    } catch (error) {
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowSaveLoading(false);
    }
  };

  const handleWorkflowSelfTest = async () => {
    setWorkflowSelfTestLoading(true);
    setContextPackError(null);

    try {
      const result = await runWorkflowSelfTest(selectedTaskType);
      setWorkflowSelfTestResult(result);
      applySnapshot(result.snapshot);
      markWorkflowAction(result.status === 'passed' ? '最小闭环已通过，下游 Workflow 已创建。' : '最小闭环未完全通过。', result.nextWorkflowId ?? result.sourceWorkflowId);
    } catch (error) {
      setContextPackError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowSelfTestLoading(false);
    }
  };

  const handleRuntimeDiagnosticsRefresh = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const diagnostics = await fetchWorkflowRuntimeDiagnostics();
      setRuntimeDiagnostics(diagnostics);
      applySnapshot(diagnostics.snapshot);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRunnerStatusRefresh = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const status = await fetchWorkflowRunnerStatus();
      setRunnerStatus(status);
      setRuntimeDiagnostics(status.diagnostics);
      applySnapshot(status.snapshot);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunsRefresh = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await fetchPipelineRuns();
      setPipelineRunRegistry(result.registry);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线状态已刷新：${result.registry.runs.length} 个实例。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunCreate = async () => {
    if (!window.confirm('将创建 Pipeline Run 实例，并生成第一阶段资产图 Workflow 写入状态源。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await createPipelineRun({ episodeId: activeProject?.currentEpisode ?? 'ep001' });
      setPipelineRunCreateResult(result);
      setPipelineRunRegistry(result.registry);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线实例已创建：${result.run.id}，当前阶段 ${result.run.currentStageId ?? 'unknown'}。`, result.run.stages[0]?.workflowId ?? null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunAdvance = async () => {
    const activeRun = pipelineRunCreateResult?.run ?? pipelineRunAdvanceResult?.run ?? [...(pipelineRunRegistry?.runs ?? [])].reverse().find((run) => run.status !== 'done');
    if (!activeRun) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await advancePipelineRun({ runId: activeRun.id });
      setPipelineRunAdvanceResult(result);
      setPipelineRunRegistry(result.registry);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线已推进：${result.run.id} / ${result.stage?.id ?? result.run.currentStageId ?? 'stage'}。`, result.stage?.workflowId ?? null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunSmoke = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runPipelineRunSmoke({ episodeId: activeProject?.currentEpisode ?? 'ep001' });
      setPipelineRunSmokeResult(result);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线 dry-run 完成：${result.status}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunRepairPreview = async () => {
    const activeRun = pipelineRunCreateResult?.run ?? pipelineRunAdvanceResult?.run ?? [...(pipelineRunRegistry?.runs ?? [])].reverse().find((run) => run.status !== 'done');
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await repairPipelineRun({ runId: activeRun?.id, dryRun: true });
      setPipelineRunRepairPreviewResult(result);
      setPipelineRunRegistry(result.registry);
      setRuntimeDiagnostics(result.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线修复预览完成：${result.repairCount} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handlePipelineRunRepair = async () => {
    const activeRun = pipelineRunCreateResult?.run ?? pipelineRunAdvanceResult?.run ?? [...(pipelineRunRegistry?.runs ?? [])].reverse().find((run) => run.status !== 'done');
    if (!window.confirm(`将修复 ${activeRun?.id ?? '全部 Pipeline Run'}，可能重建缺失阶段 Workflow 并写入状态源。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await repairPipelineRun({ runId: activeRun?.id });
      setPipelineRunRepairResult(result);
      setPipelineRunRegistry(result.registry);
      setRuntimeDiagnostics(result.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`流水线修复完成：${result.repairCount} 项。`, activeRun?.currentStageId ?? null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRuntimeRepairPreview = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await repairWorkflowRuntimeState({ dryRun: true });
      setRepairPreviewResult(result);
      setRuntimeDiagnostics(result.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`修复预览完成：完成审核 ${result.movedCompletedReviews}，进度项 ${result.repairedProgressCount}，发布包 ${result.repairedReleaseCount ?? 0}，归档结构 ${result.repairedRunnerArchiveCount ?? 0}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRuntimeRepair = async () => {
    if (!window.confirm('将执行 Runtime 状态一致性修复，并写入 artifact / progress / release / runner 状态文件。建议先运行“修复预览”。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await repairWorkflowRuntimeState();
      setRepairResult(result);
      setRuntimeDiagnostics(result.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`状态一致性已修复：完成审核归档 ${result.movedCompletedReviews}，进度项 ${result.repairedProgressCount}，发布包 ${result.repairedReleaseCount ?? 0}，归档结构 ${result.repairedRunnerArchiveCount ?? 0}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRunnerCompactPreview = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await compactWorkflowRunnerLedger({ dryRun: true });
      setCompactionPreviewResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`归档预览完成：任务 ${result.archived.taskQueueCount}，发布 ${result.archived.releasePublishQueueCount}，事件 ${result.archived.eventCount}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRunnerCompact = async () => {
    if (!window.confirm('将把运行器历史写入 archive，并裁剪当前队列 / run / event 列表。建议先运行“归档预览”。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await compactWorkflowRunnerLedger();
      setCompactionResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`队列历史已归档：任务 ${result.archived.taskQueueCount}，发布 ${result.archived.releasePublishQueueCount}，事件 ${result.archived.eventCount}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleArchiveRestore = async (bucket: WorkflowRunnerArchiveBucket, itemId: string) => {
    if (!window.confirm(`将从归档池恢复单项 ${bucket}/${itemId}，并写回 runner ledger。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await restoreWorkflowRunnerArchiveItem({ bucket, itemId });
      setArchiveRestoreResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`归档项已恢复：${bucket}/${itemId}（${result.status}）。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleArchiveRestoreAll = async (bucket: WorkflowRunnerArchiveBucket) => {
    if (!window.confirm(`将批量恢复归档池 ${bucket} 的所有项目，并写回 runner ledger。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await restoreWorkflowRunnerArchiveItem({ bucket, restoreAll: true });
      setArchiveRestoreResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`归档池已批量恢复：${bucket}，恢复 ${result.restoredCount}/${result.requested}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleQueueRun = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runWorkflowQueue({ limit: 5 });
      setQueueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`队列运行完成：${result.runId}。`, result.results[0]?.workflowId ?? null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleTaskQueueRun = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runWorkflowTaskQueue({ limit: 5 });
      setTaskQueueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`任务队列运行完成：${result.runId}，处理 ${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleTaskQueueItemRun = async (taskQueueId: string) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runWorkflowTaskQueue({ limit: 1, taskQueueId });
      setTaskQueueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`任务队列单项运行完成：${result.runId}，处理 ${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleTaskQueueStress = async () => {
    if (!window.confirm('任务压力自测以 dry-run 方式执行，会批量编译上下文包并模拟任务编排，不写入队列状态。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const taskTypes = stressTaskTypes.split(',').map((item) => item.trim()).filter(Boolean);
      const copies = Math.min(Math.max(Number(stressCopies) || 1, 1), 10);
      const result = await runWorkflowTaskQueueStress({ taskTypes, copies });
      setTaskQueueStressResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`任务压力自测完成：${result.requestedPlanCount} 个计划，${result.completedSubtasks}/${result.totalSubtasks} 个虚拟任务完成。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleTaskQueueItemRequeue = async (taskQueueId: string) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await requeueWorkflowTaskQueueItem({ taskQueueId, reason: 'manual_runtime_panel_requeue' });
      setTaskQueueRequeueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`任务队列单项已重新入队：${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishQueuePreview = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runReleasePublishQueue({ limit: 5, dryRun: true });
      setReleasePublishQueuePreviewResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布队列预览完成：请求 ${result.requested} 项，阻塞 ${result.results.filter((item) => item.status === 'blocked').length} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishQueueRun = async () => {
    if (!window.confirm('将运行发布队列，并可能把 approved release 写入 published 状态。建议先运行“发布预览”。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runReleasePublishQueue({ limit: 5 });
      setReleasePublishQueueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布队列运行完成：${result.runId}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishQueueItemRun = async (releaseId: string) => {
    if (!window.confirm(`将运行发布队列单项 ${releaseId}，并可能写入 published 状态。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runReleasePublishQueue({ limit: 1, releaseId });
      setReleasePublishQueueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布队列单项运行完成：${releaseId}，处理 ${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishRequeue = async () => {
    if (!window.confirm('将把所有 blocked 发布队列项重新入队。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await requeueReleasePublishFailures();
      setReleasePublishRequeueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布失败项已重新入队：${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishQueueItemRequeue = async (releaseId: string) => {
    if (!window.confirm(`将把发布失败项 ${releaseId} 重新入队。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await requeueReleasePublishFailures({ releaseId, reason: 'manual_runtime_panel_requeue' });
      setReleasePublishRequeueResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布失败项单项已重新入队：${releaseId}，${result.requested} 项。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleReleasePublishSmoke = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runReleasePublishQueueSmoke();
      setReleasePublishSmokeResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`发布失败路径自测完成：${result.steps.map((item) => `${item.id}:${item.status}`).join(' / ')}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRuntimeSmoke = async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await runSmartVisionRuntimeSmoke({ taskType: selectedTaskType || 'asset_image_generation' });
      setRuntimeSmokeResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`端到端自测完成：${result.status}。`, null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleRetryFailures = async (runId: string) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await retryWorkflowRunnerFailures({ runId });
      setRetryResult(result);
      setRunnerStatus(result.runner);
      setRuntimeDiagnostics(result.runner.diagnostics);
      applySnapshot(result.snapshot);
      markWorkflowAction(`失败项重试完成：${result.runId}。`, result.results[0]?.workflowId ?? null);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const buildCanvasOutputRetryRequest = (output: CanvasOutputRecord, dryRun: boolean) => ({
    idempotencyKey: output.idempotencyKey,
    artifactPath: output.artifactPath || output.outputArtifactHint || undefined,
    workflowId: output.workflowId,
    nodeId: output.nodeId ?? undefined,
    dryRun,
    resetBlocked: true
  });

  const handleCanvasOutputRetryPreview = async (output: CanvasOutputRecord) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await retryCanvasWorkflowOutput(buildCanvasOutputRetryRequest(output, true));
      setCanvasOutputRetryResult(result);
      if (result.snapshot) applySnapshot(result.snapshot);
      const status = await fetchWorkflowRunnerStatus();
      setRunnerStatus(status);
      setRuntimeDiagnostics(status.diagnostics);
      markWorkflowAction(`画布回写重试预览：${result.status}。`, output.workflowId);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleCanvasOutputRetry = async (output: CanvasOutputRecord) => {
    if (!window.confirm('将按该 canvasOutput 记录重新物化本地输出、登记 artifact/review，并写入状态文件。建议先运行“重试预览”。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await retryCanvasWorkflowOutput(buildCanvasOutputRetryRequest(output, false));
      setCanvasOutputRetryResult(result);
      if (result.snapshot) applySnapshot(result.snapshot);
      const status = await fetchWorkflowRunnerStatus();
      setRunnerStatus(status);
      setRuntimeDiagnostics(status.diagnostics);
      markWorkflowAction(`画布回写重试完成：${result.status}。`, result.canvasOutputRecord?.workflowId ?? output.workflowId);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleCanvasRunSessionStart = async (input: { workflowId?: string; workflowPath?: string; pipelineRunId?: string | null; stageId?: string | null; outputArtifactHint?: string; outputArtifactHints?: string[]; importUrl?: string; editUrl?: string; runUrl?: string }) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await startCanvasRunSession(input);
      setCanvasRunSessionResult(result);
      applySnapshot(result.snapshot);
      markWorkflowAction(`画布 RUN 会话已创建：${result.session.status}。`, input.workflowId);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleCanvasRunSessionStatusChange = async (sessionId: string, status: string) => {
    if (['failed', 'cancelled'].includes(status) && !window.confirm(`将把 Canvas RUN 会话标记为 ${status}，用于记录真实画布执行异常或取消。是否继续？`)) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await updateCanvasRunSessionStatus({ sessionId, status, note: `manual_ui_status_${status}` });
      setCanvasRunSessionResult(result);
      applySnapshot(result.snapshot);
      const diagnostics = await fetchWorkflowRuntimeDiagnostics();
      setRuntimeDiagnostics(diagnostics);
      markWorkflowAction(`画布 RUN 会话已更新：${result.session.status}。`, result.session.workflowId);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const handleCanvasOutputRegister = async (input: CanvasOutputRegisterInput, dryRun: boolean) => {
    if (!dryRun && !window.confirm('将把该画布产物物化到 outputs，登记 artifact/review，并可能推进 Pipeline Run。建议先运行“回写预览”。是否继续？')) return;
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await registerCanvasWorkflowOutput({ ...input, dryRun, resetBlocked: true });
      setCanvasOutputRegisterResult(result);
      if (result.snapshot) applySnapshot(result.snapshot);
      const status = await fetchWorkflowRunnerStatus();
      setRunnerStatus(status);
      setRuntimeDiagnostics(status.diagnostics);
      markWorkflowAction(`画布产物回写${dryRun ? '预览' : '完成'}：${result.status}。`, input.workflowId);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeLoading(false);
    }
  };

  const applyReleaseResult = (result: ReleaseRegistryResult, notice: string) => {
    applySnapshot(result.snapshot);
    setReleaseNotice(notice);
  };

  const handleReleaseRefresh = async () => {
    setReleaseLoading(true);
    setReleaseError(null);

    try {
      const result = await fetchReleaseRegistry();
      setReleaseRepairResult(null);
      applyReleaseResult(result, '发布包注册表已刷新。');
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleReleaseCreate = async () => {
    setReleaseLoading(true);
    setReleaseError(null);

    try {
      const result = await createReleasePackage({ episodeId: activeProject.currentEpisode || 'ep001', title: `${activeProject.currentEpisode || 'EP001'} 发布包`, status: 'draft' });
      setReleaseRepairResult(null);
      applyReleaseResult(result, `发布包已创建：${result.release?.id ?? 'unknown'}。`);
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleReleaseStatusChange = async (releaseId: string, status: ReleaseStatus) => {
    setReleaseLoading(true);
    setReleaseError(null);

    try {
      const result = await updateReleasePackageStatus({ releaseId, status });
      setReleaseRepairResult(null);
      applyReleaseResult(result, `发布包已更新为 ${status}。`);
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleReleaseRepair = async (releaseId: string) => {
    setReleaseLoading(true);
    setReleaseError(null);

    try {
      const result = await repairReleasePackage({ releaseId });
      setReleaseRepairResult(result);
      setRuntimeDiagnostics(result.diagnostics);
      applyReleaseResult(result, result.repairs.length > 0 ? `发布包已修复 ${result.repairs.length} 项。` : '发布包已检查，未发现可自动修复项。');
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : String(error));
    } finally {
      setReleaseLoading(false);
    }
  };

  const handleReplayWorkflow = async (workflowId: string) => {
    setRuntimeLoading(true);
    setRuntimeError(null);

    try {
      const result = await replayWorkflowChain({ workflowId });
      applySnapshot(result.snapshot);
      markWorkflowAction(`链路已重放：${result.actions.map((item) => item.action).join(' / ') || '无动作'}。`, workflowId);
      await handleRunnerStatusRefresh();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setRuntimeLoading(false);
    }
  };

  return (
    <div className="creator-shell">
      {creatorView === 'entry' ? (
        <ScriptEntryPage scriptText={storyScript} importedFiles={storyFiles} error={storyError} loading={runtimeLoading} onScriptChange={setStoryScript} onFilesImport={(files) => void handleStoryFilesImport(files)} onCreate={() => void handleCreatorStart()} />
      ) : creatorView === 'asset-confirm' && creativePlanResult ? (
        <AssetConfirmPage
          plan={creativePlanResult}
          cards={assetConfirmCards}
          onCardsChange={setAssetConfirmCards}
          onConfirm={handleAssetConfirmDone}
          onBack={() => setCreatorView('entry')}
        />
      ) : creatorView === 'seedance-node' && creativePlanResult ? (
        <StoryboardSeedanceWorkspace
          plan={creativePlanResult}
          cards={assetConfirmCards}
          onBack={() => setCreatorView('asset-confirm')}
        />
      ) : (
        <SmartProductionCanvas
          scriptText={storyScript}
          creativePlan={creativePlanResult}
          mode={productionMode}
          source={source}
          snapshot={snapshot}
          pipelineRunRegistry={pipelineRunRegistry}
          runtimeLoading={runtimeLoading}
          onModeChange={setProductionMode}
          onBack={() => setCreatorView('entry')}
          onCreateRun={() => void handleCreatorStart()}
          onOpenCanvas={handleSmartCanvasOpen}
          onOpenArtifact={handleArtifactOpen}
          onShowMaintenance={() => setMaintenanceOpen((value) => !value)}
          onScriptChange={setStoryScript}
        />
      )}
      <details className="maintenance-drawer" open={maintenanceOpen} onToggle={(event) => setMaintenanceOpen(event.currentTarget.open)}>
        <summary>高级维护 / 调试工具</summary>
        <div className="maintenance-content">
          <div className="runtime-source">数据源：{source === 'bridge' ? '本地桥接服务实时读取' : '构建快照回退'}</div>
        <ProductionReadinessPanel source={source} diagnostics={runtimeDiagnostics} pipelineRunRegistry={pipelineRunRegistry} releaseRegistry={snapshot.releaseRegistry} canvasStatus={snapshot.canvasStatus} workflowRegistry={snapshot.workflowRegistry} canvasOutputs={snapshot.canvasOutputs ?? []} canvasRunLedger={snapshot.canvasRunLedger} runtimeSmokeResult={runtimeSmokeResult} pipelineRunSmokeResult={pipelineRunSmokeResult} releasePublishSmokeResult={releasePublishSmokeResult} canvasOutputRegisterResult={canvasOutputRegisterResult} canvasRunSessionResult={canvasRunSessionResult} runtimeLoading={runtimeLoading} onRuntimeSmoke={handleRuntimeSmoke} onPipelineRunSmoke={handlePipelineRunSmoke} onReleasePublishSmoke={handleReleasePublishSmoke} onPipelineRunsRefresh={handlePipelineRunsRefresh} onPipelineRunCreate={handlePipelineRunCreate} onPipelineRunAdvance={handlePipelineRunAdvance} onPipelineRunRepairPreview={handlePipelineRunRepairPreview} onCanvasRunSessionStart={handleCanvasRunSessionStart} onCanvasRunSessionStatusChange={handleCanvasRunSessionStatusChange} onArtifactOpen={handleArtifactOpen} onCanvasOutputRegister={handleCanvasOutputRegister} />
        <div className="top-grid">
          <ProjectOverview activeProject={activeProject} />
          <div className="side-stack">
            <ProjectList projects={snapshot.projects} />
            <EpisodeCard activeProject={activeProject} />
          </div>
        </div>
        <TaskBoard taskColumns={snapshot.taskColumns} onTaskStatusChange={handleTaskStatusChange} />
        <div className="bottom-grid">
          <ReviewCenter reviews={snapshot.reviews} activeArtifact={activeArtifact} onReviewStatusChange={handleReviewStatusChange} onArtifactOpen={handleArtifactOpen} />
          <CanvasCard canvasStatus={snapshot.canvasStatus} />
        </div>
        <WorkflowPanel registry={snapshot.workflowRegistry} highlightedWorkflowId={highlightedWorkflowId} workflowActionNotice={workflowActionNotice} onArtifactOpen={handleArtifactOpen} onReviewStatusChange={handleReviewStatusChange} onWorkflowStatusChange={handleWorkflowStatusChange} onWorkflowOutputAdd={handleWorkflowOutputAdd} onWorkflowChainAction={handleWorkflowChainAction} onWorkflowArchive={handleWorkflowArchive} onWorkflowRestore={handleWorkflowRestore} />
        <ReleaseRegistryPanel registry={snapshot.releaseRegistry} reviews={snapshot.reviews} diagnostics={runtimeDiagnostics} repairResult={releaseRepairResult} notice={releaseNotice} loading={releaseLoading} error={releaseError} onRefresh={handleReleaseRefresh} onCreate={handleReleaseCreate} onStatusChange={handleReleaseStatusChange} onRepair={handleReleaseRepair} onArtifactOpen={handleArtifactOpen} />
        <WorkflowRuntimePanel diagnostics={runtimeDiagnostics} runnerStatus={runnerStatus} queueResult={queueResult} taskQueueResult={taskQueueResult} taskQueueRequeueResult={taskQueueRequeueResult} taskQueueStressResult={taskQueueStressResult} repairPreviewResult={repairPreviewResult} compactionPreviewResult={compactionPreviewResult} releasePublishQueuePreviewResult={releasePublishQueuePreviewResult} stressTaskTypes={stressTaskTypes} stressCopies={stressCopies} releasePublishQueueResult={releasePublishQueueResult} releasePublishRequeueResult={releasePublishRequeueResult} releasePublishSmokeResult={releasePublishSmokeResult} runtimeSmokeResult={runtimeSmokeResult} pipelineRunRegistry={pipelineRunRegistry} pipelineRunCreateResult={pipelineRunCreateResult} pipelineRunAdvanceResult={pipelineRunAdvanceResult} pipelineRunSmokeResult={pipelineRunSmokeResult} pipelineRunRepairPreviewResult={pipelineRunRepairPreviewResult} pipelineRunRepairResult={pipelineRunRepairResult} canvasOutputs={snapshot.canvasOutputs ?? []} retryResult={retryResult} canvasOutputRetryResult={canvasOutputRetryResult} repairResult={repairResult} compactionResult={compactionResult} archiveRestoreResult={archiveRestoreResult} runtimeError={runtimeError} runtimeLoading={runtimeLoading} onDiagnosticsRefresh={handleRuntimeDiagnosticsRefresh} onRunnerRefresh={handleRunnerStatusRefresh} onPipelineRunsRefresh={handlePipelineRunsRefresh} onPipelineRunCreate={handlePipelineRunCreate} onPipelineRunAdvance={handlePipelineRunAdvance} onPipelineRunSmoke={handlePipelineRunSmoke} onPipelineRunRepairPreview={handlePipelineRunRepairPreview} onPipelineRunRepair={handlePipelineRunRepair} onQueueRun={handleQueueRun} onTaskQueueRun={handleTaskQueueRun} onTaskQueueStress={handleTaskQueueStress} onStressTaskTypesChange={setStressTaskTypes} onStressCopiesChange={setStressCopies} onTaskQueueItemRun={handleTaskQueueItemRun} onTaskQueueItemRequeue={handleTaskQueueItemRequeue} onTaskQueueReportOpen={handleArtifactOpen} onCanvasOutputRetryPreview={handleCanvasOutputRetryPreview} onCanvasOutputRetry={handleCanvasOutputRetry} onReleasePublishQueuePreview={handleReleasePublishQueuePreview} onReleasePublishQueueRun={handleReleasePublishQueueRun} onReleasePublishQueueItemRun={handleReleasePublishQueueItemRun} onReleasePublishRequeue={handleReleasePublishRequeue} onReleasePublishQueueItemRequeue={handleReleasePublishQueueItemRequeue} onReleasePublishSmoke={handleReleasePublishSmoke} onRuntimeSmoke={handleRuntimeSmoke} onRetryFailures={handleRetryFailures} onReplayWorkflow={handleReplayWorkflow} onRuntimeRepairPreview={handleRuntimeRepairPreview} onRuntimeRepair={handleRuntimeRepair} onRunnerCompactPreview={handleRunnerCompactPreview} onRunnerCompact={handleRunnerCompact} onArchiveRestore={handleArchiveRestore} onArchiveRestoreAll={handleArchiveRestoreAll} />
        <CapabilityRuntimePanel packs={snapshot.capabilityPacks} onArtifactOpen={handleArtifactOpen} contextPack={contextPack} taskPlan={taskPlan} taskPlanPersistResult={taskPlanPersistResult} compiledWorkflowDraft={compiledWorkflowDraft} workflowDraft={workflowDraft} workflowSelfTestResult={workflowSelfTestResult} contextPackError={contextPackError} contextPackLoading={contextPackLoading} taskPlanLoading={taskPlanLoading} taskPlanPersistLoading={taskPlanPersistLoading} workflowDraftLoading={workflowDraftLoading} workflowCompileLoading={workflowCompileLoading} workflowSaveLoading={workflowSaveLoading} workflowSelfTestLoading={workflowSelfTestLoading} selectedTaskType={selectedTaskType} onTaskTypeChange={setSelectedTaskType} onContextPackCompile={handleContextPackCompile} onTaskPlanCreate={handleTaskPlanCreate} onTaskPlanPersist={handleTaskPlanPersist} onWorkflowDraftBuild={handleWorkflowDraftBuild} onWorkflowTaskCompile={handleWorkflowTaskCompile} onWorkflowDraftSave={handleWorkflowDraftSave} onWorkflowSelfTest={handleWorkflowSelfTest} />
        <ArtifactRegistry artifacts={snapshot.artifacts} activeArtifact={activeArtifact} preview={artifactPreview} error={artifactError} loading={artifactLoading} filterId={artifactFilterId} onFilterChange={setArtifactFilterId} onArtifactOpen={handleArtifactOpen} onArtifactRefresh={handleArtifactRefresh} />
        </div>
      </details>
    </div>
  );
}
