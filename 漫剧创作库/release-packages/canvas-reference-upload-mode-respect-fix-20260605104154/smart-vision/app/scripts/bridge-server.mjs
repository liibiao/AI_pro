import { createServer } from 'node:http';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.SMART_VISION_BRIDGE_PORT || 5188);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const smartVisionProjectRoot = path.resolve(scriptDir, '../..');
const workspaceRoot = path.dirname(smartVisionProjectRoot);
const smartVisionOutputsRoot = path.join(smartVisionProjectRoot, 'outputs');
const smartVisionRoot = path.join(smartVisionOutputsRoot, '.smart-vision');
const dataPackRegistryFile = path.join(smartVisionRoot, 'data-pack-registry.json');
const projectRoot = path.join(workspaceRoot, 'projects/无限强化_漫剧_001');
const canvasRoot = path.join(workspaceRoot, 'smart-vision/canvas/legacy-workbench/workbench-web');
const managedStateFileNames = new Set([
  'project-state.json',
  'progress-ledger.json',
  'workflow-registry.json',
  'artifact-registry.json',
  'review-ledger.json',
  'workflow-runner-ledger.json',
  'continuity-ledger.json',
  'release-registry.json',
  'pipeline-run-ledger.json',
  'canvas-run-ledger.json',
  'recovery-checkpoint.json',
  'methodology-pack.json',
  'agent-pack.json',
  'skill-pack.json',
  'template-pack.json',
  'data-pack-registry.json',
  'state-operation-journal.json'
]);
const jsonWriteLocks = new Map();
const dataPackTextExtensions = new Set(['.md', '.json', '.txt', '.yaml', '.yml', '.py', '.sh', '.csv']);
const coreDataPackExtensions = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);
const workspaceDataPackRoots = [
  { id: 'agents', title: 'Agent 协作体系', root: 'agents', sourceKind: 'agents', extensions: coreDataPackExtensions, limit: 500, parseLimit: 500 },
  { id: 'docs', title: '方法论 / 规范文档', root: 'docs', sourceKind: 'docs', extensions: coreDataPackExtensions, limit: 800, parseLimit: 800 },
  { id: 'skills', title: 'Skill 能力包', root: 'skills', sourceKind: 'skills', extensions: coreDataPackExtensions, limit: 500, parseLimit: 500 },
  { id: 'templates', title: '模板体系', root: 'templates', sourceKind: 'templates', extensions: coreDataPackExtensions, limit: 800, parseLimit: 800 },
  { id: 'wordlists', title: '词库 / 风格库', root: 'wordlists', sourceKind: 'wordlists', extensions: coreDataPackExtensions, limit: 800, parseLimit: 800 },
  { id: 'tools', title: '自动化流水线工具', root: 'tools', sourceKind: 'tools', extensions: dataPackTextExtensions, limit: 240, parseLimit: 80 },
  { id: 'data', title: '资料库 / 解析数据', root: 'data', sourceKind: 'data', extensions: coreDataPackExtensions, limit: 300, parseLimit: 80, maxFileBytes: 512 * 1024 },
  { id: 'projects', title: '项目样例与状态源', root: 'projects', sourceKind: 'projects', extensions: coreDataPackExtensions, limit: 800, parseLimit: 220, maxFileBytes: 768 * 1024 },
  { id: 'AAA', title: '创作输入材料', root: 'AAA', sourceKind: 'creative_materials', extensions: coreDataPackExtensions, limit: 240, parseLimit: 120, maxFileBytes: 768 * 1024 },
  { id: 'runninghub_outputs', title: 'RunningHub 输出索引', root: 'runninghub_outputs', sourceKind: 'runninghub_outputs', extensions: coreDataPackExtensions, limit: 240, parseLimit: 60, maxFileBytes: 512 * 1024 },
  { id: 'workbuddy_memory', title: 'WorkBuddy 项目记忆', root: '.workbuddy/memory', sourceKind: 'memory', extensions: coreDataPackExtensions, limit: 120, parseLimit: 80 },
  { id: 'codebuddy_plans', title: 'CodeBuddy 计划与交接', root: '.codebuddy/plans', sourceKind: 'memory', extensions: coreDataPackExtensions, limit: 160, parseLimit: 80 },
  { id: 'codebuddy_teams', title: 'CodeBuddy 团队配置', root: '.codebuddy/teams', sourceKind: 'memory', extensions: coreDataPackExtensions, limit: 80, parseLimit: 40 },
  { id: 'novel_assistant', title: '小说助手规则 / 风格 / 记忆', root: '.novel-assistant', sourceKind: 'novel_assistant', extensions: coreDataPackExtensions, limit: 360, parseLimit: 120, maxFileBytes: 512 * 1024 },
  { id: 'waqu_project', title: '挖取项目输出', root: '.waqu-project/outputs', sourceKind: 'waqu_outputs', extensions: coreDataPackExtensions, limit: 180, parseLimit: 60, maxFileBytes: 512 * 1024 }
];
const workspaceDataPackRootPrefixes = workspaceDataPackRoots.map((item) => `${item.root.replace(/\/+$/, '')}/`);
const dataPackReadOnlyPolicy = {
  mode: 'read_only_workspace_data_pack',
  platformRole: 'Smart Vision 是可挂载不同创作库数据包的 SaaS 可视化操作平台。',
  activePack: '当前默认 active data pack 是漫剧创作库；后续可由后台下发广告创意、电商商品图、电影、自媒体商业宣传片等定制创作库。',
  rule: 'Smart Vision 只读取和索引当前 active data pack，不修改 agents / docs / skills / templates / wordlists / tools / data / projects 等上游目录。',
  mutationBoundary: '允许写入 smart-vision/outputs 与 smart-vision 自身适配层；禁止把动态编排结果反写进上游数据包。'
};

function serializeDataPackRootSpec(spec) {
  return {
    id: spec.id,
    title: spec.title,
    root: spec.root,
    sourceKind: spec.sourceKind,
    extensions: Array.from(spec.extensions ?? dataPackTextExtensions),
    limit: spec.limit,
    parseLimit: spec.parseLimit,
    maxFileBytes: spec.maxFileBytes
  };
}

function normalizeDataPackRootPath(root) {
  const normalized = normalizeArtifactPathValue(root).replace(/\/+$/, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Invalid data pack root: ${root}`);
  }
  return normalized;
}

function hydrateDataPackRootSpec(spec = {}) {
  const extensions = Array.isArray(spec.extensions) && spec.extensions.length
    ? new Set(spec.extensions.map((item) => String(item).trim().toLowerCase()).filter(Boolean))
    : coreDataPackExtensions;
  return {
    id: String(spec.id || spec.root || '').trim(),
    title: String(spec.title || spec.id || spec.root || 'Data Pack Root').trim(),
    root: normalizeDataPackRootPath(spec.root || spec.id || ''),
    sourceKind: String(spec.sourceKind || spec.kind || spec.id || 'workspace_data_pack').trim(),
    extensions,
    limit: Number.isFinite(Number(spec.limit)) ? Math.max(1, Math.floor(Number(spec.limit))) : 300,
    parseLimit: Number.isFinite(Number(spec.parseLimit)) ? Math.max(1, Math.floor(Number(spec.parseLimit))) : 80,
    maxFileBytes: Number.isFinite(Number(spec.maxFileBytes)) ? Math.max(1024, Math.floor(Number(spec.maxFileBytes))) : undefined
  };
}

function defaultDataPackCapabilities(type = 'creative_automation') {
  const normalized = String(type || '').trim().toLowerCase();
  const common = {
    dynamicAgentPipeline: true,
    smartCanvas: true,
    customerDeliverables: true,
    internalWorkflowJson: true,
    referenceImages: true,
    workflowJsonVisibility: 'internal'
  };
  if (/ad|advert/i.test(normalized)) {
    return {
      ...common,
      outputKinds: ['creative_brief', 'audience_strategy', 'ad_script', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
      requiredOrder: ['creative_brief', 'strategy', 'script', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release']
    };
  }
  if (/commerce|product|ecommerce/i.test(normalized)) {
    return {
      ...common,
      outputKinds: ['product_brief', 'selling_points', 'asset_cards', 'product_images', 'prompt', 'qa_report', 'release_package'],
      requiredOrder: ['product_brief', 'selling_points', 'asset_cards', 'product_images', 'qa', 'release']
    };
  }
  if (/film|movie/i.test(normalized)) {
    return {
      ...common,
      outputKinds: ['screenplay', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
      requiredOrder: ['screenplay', 'director_brief', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release']
    };
  }
  return {
    ...common,
    outputKinds: ['creative_source_intake', 'adapted_script', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
    requiredOrder: ['creative_source_intake', 'style_bible', 'script', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release'],
    requiresAssetGraphBeforeStoryboard: true,
    requiresStoryboardBeforeVideo: true
  };
}

function defaultDataPackMetadata() {
  return {
    deliverableMode: 'customer_facing',
    workflowJsonVisibility: 'internal',
    packContractVersion: '0.2.0'
  };
}

function normalizePlainObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function builtinDataPack() {
  const type = 'creative_automation';
  return {
    id: 'manju-creation-library',
    title: '漫剧创作库',
    description: '当前工作区内置漫剧工业化创作数据包，包含 agents / docs / skills / templates / wordlists / tools / data / projects。',
    type,
    status: 'active',
    source: 'builtin_workspace',
    rootBase: 'workspace',
    roots: workspaceDataPackRoots.map(serializeDataPackRootSpec),
    defaultTaskType: 'creative_orchestration',
    capabilities: defaultDataPackCapabilities(type),
    metadata: {
      ...defaultDataPackMetadata(),
      dataPackFamily: 'manju_creation_library',
      workflowPolicy: 'agent_pipeline_visualization'
    },
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z'
  };
}

function defaultDataPackRegistry() {
  return {
    version: '0.1.0',
    activeDataPackId: 'manju-creation-library',
    packs: [builtinDataPack()],
    updatedAt: new Date().toISOString()
  };
}

function normalizeDataPackSpec(spec = {}) {
  const builtin = builtinDataPack();
  const id = String(spec.id || '').trim();
  if (!id) throw new Error('data pack id is required');
  const isBuiltin = id === builtin.id;
  const roots = Array.isArray(spec.roots) && spec.roots.length ? spec.roots : isBuiltin ? builtin.roots : [];
  if (!roots.length) throw new Error(`data pack ${id} roots are required`);
  return {
    ...spec,
    id,
    title: String(spec.title || id).trim(),
    description: String(spec.description || '').trim(),
    type: String(spec.type || 'creative_automation').trim(),
    status: spec.status === 'disabled' ? 'disabled' : 'active',
    source: String(spec.source || (isBuiltin ? 'builtin_workspace' : 'backend_registry')).trim(),
    rootBase: String(spec.rootBase || spec.rootBasePath || 'workspace').trim(),
    rootBasePath: spec.rootBasePath ? String(spec.rootBasePath).trim() : undefined,
    roots: roots.map((root) => serializeDataPackRootSpec(hydrateDataPackRootSpec(root))),
    defaultTaskType: String(spec.defaultTaskType || 'creative_orchestration').trim(),
    capabilities: {
      ...defaultDataPackCapabilities(spec.type || 'creative_automation'),
      ...normalizePlainObject(spec.capabilities, {})
    },
    metadata: {
      ...defaultDataPackMetadata(),
      ...normalizePlainObject(spec.metadata, {})
    },
    updatedAt: spec.updatedAt || new Date().toISOString(),
    createdAt: spec.createdAt || new Date().toISOString()
  };
}

function normalizeDataPackRegistry(raw = {}) {
  const byId = new Map();
  for (const pack of [builtinDataPack(), ...((Array.isArray(raw.packs) ? raw.packs : []))]) {
    const normalized = normalizeDataPackSpec(pack);
    byId.set(normalized.id, normalized);
  }
  const packs = Array.from(byId.values());
  const activeDataPackId = packs.some((pack) => pack.id === raw.activeDataPackId && pack.status !== 'disabled')
    ? raw.activeDataPackId
    : 'manju-creation-library';
  return {
    version: raw.version || '0.1.0',
    activeDataPackId,
    packs,
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

async function readDataPackRegistry() {
  const raw = existsSync(dataPackRegistryFile)
    ? await readJson(dataPackRegistryFile, defaultDataPackRegistry())
    : defaultDataPackRegistry();
  return normalizeDataPackRegistry(raw);
}

async function writeDataPackRegistry(registry) {
  const normalized = normalizeDataPackRegistry({ ...registry, updatedAt: new Date().toISOString() });
  await writeJson(dataPackRegistryFile, normalized);
  return normalized;
}

function getActiveDataPackFromRegistry(registry, requestedId = '') {
  const id = String(requestedId || registry.activeDataPackId || 'manju-creation-library').trim();
  return registry.packs.find((pack) => pack.id === id && pack.status !== 'disabled')
    || registry.packs.find((pack) => pack.id === registry.activeDataPackId && pack.status !== 'disabled')
    || builtinDataPack();
}

function getDataPackRootSpecs(dataPack) {
  const pack = dataPack?.id ? dataPack : builtinDataPack();
  return (Array.isArray(pack.roots) && pack.roots.length ? pack.roots : builtinDataPack().roots)
    .map((root) => hydrateDataPackRootSpec(root));
}

function normalizeAdminDataPackResponse(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const list = data.packs || data.items || data.dataPacks || data.records || [];
  return {
    packs: Array.isArray(list) ? list : [],
    activeDataPackId: String(data.activeDataPackId || data.activeDataPack?.id || '').trim(),
    updatedAt: data.updatedAt || payload.updatedAt || ''
  };
}

async function fetchAdminDataPacks({ adminBase, token, timeoutMs = 12000 }) {
  const base = String(adminBase || process.env.SMART_VISION_ADMIN_API_BASE || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  const bearer = String(token || process.env.SMART_VISION_ADMIN_TOKEN || '').trim();
  if (!bearer) throw new Error('Admin token is required for data pack sync.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/api/data-packs`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${bearer}`
      },
      signal: controller.signal
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { rawText: text.slice(0, 1200) };
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || payload.message || payload.rawText || `HTTP ${response.status}`);
    }
    return { adminBase: base, ...normalizeAdminDataPackResponse(payload) };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Admin data pack sync timed out: ${base}`);
    throw new Error(`Admin data pack sync failed: ${base} · ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function syncDataPacksFromAdmin(input = {}) {
  const syncResult = await fetchAdminDataPacks(input);
  const incomingPacks = syncResult.packs.map((pack) => normalizeDataPackSpec({
    ...pack,
    source: pack.source || 'admin_registry',
    updatedAt: pack.updatedAt || syncResult.updatedAt || new Date().toISOString()
  }));
  if (!incomingPacks.length) throw new Error('Admin data pack sync returned no packs.');

  const registry = await readDataPackRegistry();
  const byId = new Map(registry.packs.map((pack) => [pack.id, pack]));
  for (const pack of incomingPacks) byId.set(pack.id, pack);

  const requestedActive = String(input.activeDataPackId || input.dataPackId || '').trim();
  const adminActive = syncResult.activeDataPackId;
  const candidateActive = input.activate === false
    ? registry.activeDataPackId
    : requestedActive || adminActive || registry.activeDataPackId;
  const packs = Array.from(byId.values());
  const activeDataPackId = packs.some((pack) => pack.id === candidateActive && pack.status !== 'disabled')
    ? candidateActive
    : registry.activeDataPackId;
  const nextRegistry = normalizeDataPackRegistry({ ...registry, packs, activeDataPackId, updatedAt: new Date().toISOString() });
  const updated = input.dryRun === true ? nextRegistry : await writeDataPackRegistry(nextRegistry);
  return {
    ...updated,
    activeDataPack: getActiveDataPackFromRegistry(updated),
    syncedFrom: syncResult.adminBase,
    syncedCount: incomingPacks.length,
    syncedPackIds: incomingPacks.map((pack) => pack.id),
    dryRun: input.dryRun === true
  };
}

async function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function isManagedStateJson(filePath) {
  return path.resolve(filePath).startsWith(`${smartVisionRoot}${path.sep}`) && managedStateFileNames.has(path.basename(filePath));
}

async function withJsonWriteLock(filePath, task) {
  const key = path.resolve(filePath);
  const previous = jsonWriteLocks.get(key) ?? Promise.resolve();
  let releaseLock = null;
  const current = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  jsonWriteLocks.set(key, tail);
  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseLock?.();
    if (jsonWriteLocks.get(key) === tail) {
      jsonWriteLocks.delete(key);
    }
  }
}

async function writeJson(filePath, data) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  JSON.parse(serialized);

  await withJsonWriteLock(filePath, async () => {
    const directory = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const tmpPath = path.join(directory, `.${baseName}.${process.pid}.${Date.now()}.tmp`);

    await mkdir(directory, { recursive: true });
    await writeFile(tmpPath, serialized, 'utf8');
    JSON.parse(await readFile(tmpPath, 'utf8'));

    if (isManagedStateJson(filePath) && existsSync(filePath)) {
      await copyFile(filePath, `${filePath}.bak`);
    }

    try {
      await rename(tmpPath, filePath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  });
}

async function scanProjectArtifacts() {
  const outputRoots = ['01-资产图与提示词', '02-工作流', '03-视频', '04-输入资料', '04-storyboard', '05-可选输出'];
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
  return Array.from(new Set([...(Array.isArray(primaryArtifacts) ? primaryArtifacts : []), ...scannedArtifacts]));
}

const imageArtifactExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const videoArtifactExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const textArtifactExtensions = new Set(['.md', '.txt', '.json']);

function isImageArtifactPath(artifactPath) {
  return imageArtifactExtensions.has(path.extname(String(artifactPath || '')).toLowerCase());
}

function isVideoArtifactPath(artifactPath) {
  return videoArtifactExtensions.has(path.extname(String(artifactPath || '')).toLowerCase());
}

function isTextArtifactPath(artifactPath) {
  return textArtifactExtensions.has(path.extname(String(artifactPath || '')).toLowerCase());
}

function hasArtifactWildcard(artifactPath) {
  return /[*{}[\]]/.test(String(artifactPath || ''));
}

function isConcreteArtifactPath(artifactPath) {
  const normalized = normalizeArtifactPathValue(artifactPath);
  return Boolean(normalized && !hasArtifactWildcard(normalized) && path.extname(normalized));
}

function getBridgeBaseUrl() {
  return `http://127.0.0.1:${PORT}`;
}

function buildRawArtifactUrl(artifactPath) {
  return `${getBridgeBaseUrl()}/api/smart-vision/artifacts/read?path=${encodeURIComponent(artifactPath)}&raw=1`;
}

function resolveReadableArtifactPath(artifactPath) {
  const normalizedInput = normalizeArtifactPathValue(artifactPath);
  const primary = resolveArtifactPath(normalizedInput);
  if (existsSync(primary.absolutePath)) return primary;

  const workspacePrefixes = [...workspaceDataPackRootPrefixes, 'upstream/'];
  const canFallbackToProject = !workspacePrefixes.some((prefix) => normalizedInput.startsWith(prefix));
  if (canFallbackToProject) {
    const upstreamAbsolutePath = path.resolve(projectRoot, normalizedInput);
    if (isPathInsideRoot(upstreamAbsolutePath, projectRoot) && existsSync(upstreamAbsolutePath)) {
      return { normalized: `upstream/${normalizedInput}`, absolutePath: upstreamAbsolutePath };
    }
  }

  return primary;
}

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function isValidStatus(status) {
  return ['done', 'in_progress', 'waiting_review', 'blocked', 'todo'].includes(status);
}

function isPipelineStageStatus(status) {
  return ['queued', 'workflow_ready', 'waiting_output', 'waiting_review', 'done', 'blocked'].includes(status);
}

function isPathInsideRoot(absolutePath, root) {
  const rootWithSep = `${root}${path.sep}`;
  return absolutePath === root || absolutePath.startsWith(rootWithSep);
}

function resolveArtifactPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Artifact path is required');
  }

  const normalized = relativePath.replace(/^\/+/, '').split(path.sep).join('/');
  const safeWorkspaceRoots = [
    ...workspaceDataPackRootPrefixes.map((prefix) => ({ prefix, root: workspaceRoot }))
  ];
  const matchedWorkspaceRoot = safeWorkspaceRoots.find((item) => normalized === item.prefix.slice(0, -1) || normalized.startsWith(item.prefix));
  const baseRoot = normalized.startsWith('upstream/') ? projectRoot : matchedWorkspaceRoot?.root ?? smartVisionOutputsRoot;
  const pathWithinRoot = normalized.startsWith('upstream/') ? normalized.slice('upstream/'.length) : normalized;
  const absolutePath = path.resolve(baseRoot, pathWithinRoot);

  if (!isPathInsideRoot(absolutePath, baseRoot)) {
    throw new Error('Artifact path is outside allowed root');
  }

  return { normalized, absolutePath };
}

function getMimeType(extension) {
  const mimeTypes = {
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm'
  };

  return mimeTypes[extension] ?? 'application/octet-stream';
}

async function readArtifact(relativePath, options = {}) {
  const { normalized, absolutePath } = resolveArtifactPath(relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Artifact not found: ${normalized}`);
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const textExtensions = new Set(['.md', '.json', '.txt', '.csv']);
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);
  const mimeType = getMimeType(extension);

  if (options.raw) {
    return {
      normalized,
      absolutePath,
      mimeType,
      extension
    };
  }

  if (textExtensions.has(extension)) {
    const content = await readFile(absolutePath, 'utf8');
    return {
      path: normalized,
      name: path.basename(absolutePath),
      extension,
      kind: 'text',
      mimeType,
      size: Buffer.byteLength(content, 'utf8'),
      content
    };
  }

  if (imageExtensions.has(extension)) {
    const buffer = await readFile(absolutePath);
    return {
      path: normalized,
      name: path.basename(absolutePath),
      extension,
      kind: 'image',
      mimeType,
      size: buffer.byteLength,
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`
    };
  }

  if (videoExtensions.has(extension)) {
    const statBuffer = await readFile(absolutePath);
    return {
      path: normalized,
      name: path.basename(absolutePath),
      extension,
      kind: 'video',
      mimeType,
      size: statBuffer.byteLength,
      fileUrl: `/api/smart-vision/artifacts/read?raw=1&path=${encodeURIComponent(normalized)}`
    };
  }

  return {
    path: normalized,
    name: path.basename(absolutePath),
    extension,
    kind: 'unsupported',
    mimeType,
    size: 0
  };
}

async function getModelSummary() {
  const registry = await readJson(path.join(canvasRoot, 'model-registry.json'), { models: [] });
  const modelsDir = path.join(canvasRoot, 'models');
  const registryModels = Array.isArray(registry.models) ? registry.models : [];
  const hasVideoModels = registryModels.some((model) => model.adapter === 'notevideo' || String(model.configId || '').toLowerCase().includes('sora'));

  return {
    modelCount: registryModels.length,
    hasVideoModels,
    registryPath: 'smart-vision/canvas/legacy-workbench/workbench-web/model-registry.json',
    modelsDirExists: existsSync(modelsDir),
    models: registryModels.map((model) => ({
      configId: model.configId,
      adapter: model.adapter,
      identityKey: model.identityKey
    }))
  };
}

function normalizeBridgeModelType(model = {}) {
  const raw = String(model.modelType || model.type || model.category || model.modelCategory || '').trim().toLowerCase();
  if (['llm', 'chat', 'language', 'text', 'text_generation', 'completion', 'large_language_model', 'openai_chat', 'openai-chat', 'openai chat', '大语言模型', '语言模型', '文本模型'].includes(raw)) return 'LLM';
  if (['video', 'video_generation', 'text2video', 'txt2video', 't2v', 'image2video', 'img2video', 'i2v', '视频模型', '生视频模型'].includes(raw)) return 'VIDEO';
  if (['image', 'img', 'image_generation', 'text2image', 'txt2img', 'image_to_image', 'img2img', '生图模型', '图片模型', '图像模型'].includes(raw)) return 'IMAGE';
  const endpoint = String(model.endpointPath || model.protocol?.endpointPath || model.provider?.endpointPath || model.url || model.baseUrl || '').toLowerCase();
  const adapter = String(model.adapter || model.protocol?.adapter || model.provider?.adapter || model.channelType || model.providerType || '').toLowerCase();
  if (/chat\/completions|\/responses(?:\/|$)|completion/.test(endpoint) || /(^|[-_\s])chat($|[-_\s])|llm|completion|openai[-_\s]?chat/.test(adapter)) return 'LLM';
  const hay = [
    model.name,
    model.model,
    model.modelName,
    model.realModelName,
    model.upstreamModel,
    model.nick,
    model.modelNick,
    model.nickname,
    model.displayName,
    model.label,
    model.ui?.label,
    model.provider?.name,
    model.channelType
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  if (/seedance|sora|kling|runway|pika|hailuo|vidu|wan|t2v|i2v|video|veo/.test(hay)) return 'VIDEO';
  if (/gpt[-_ ]?image|imagen|flux|sdxl|midjourney|mj|niji|image|img|画图|生图|jimeng|即梦/.test(hay)) return 'IMAGE';
  if (/deepseek|qwen|glm|claude|grok[-_ ]?4|gpt[-_ ]?(?:3|4|4o|5)|gpt\d|chat|llm|语言|大模型/.test(hay)) return 'LLM';
  return 'IMAGE';
}

function isEnabledModelConfig(model = {}) {
  for (const flag of [model.enabled, model.isEnabled, model.enable, model.active, model.isActive, model.status, model.state]) {
    if (flag === false || flag === 0) return false;
    const text = String(flag ?? '').trim().toLowerCase();
    if (['false', '0', 'disabled', 'disable', 'inactive', 'off', 'deleted', 'archived'].includes(text)) return false;
  }
  return true;
}

async function readCanvasModelConfigs() {
  const modelsDir = path.join(canvasRoot, 'models');
  const files = existsSync(modelsDir) ? (await readdir(modelsDir)).filter((name) => name.endsWith('.json')) : [];
  const fileModels = [];
  for (const file of files) {
    const raw = await readJson(path.join(modelsDir, file), null);
    if (raw && typeof raw === 'object') fileModels.push(raw);
  }
  const envKey = process.env.SMART_VISION_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const envBaseUrl = (process.env.SMART_VISION_LLM_BASE_URL || process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
  const envModel = process.env.SMART_VISION_LLM_MODEL || process.env.OPENAI_MODEL || '';
  if (envModel || envKey || envBaseUrl) {
    fileModels.push({
      id: 'env-openai-chat',
      name: envModel || 'gpt-5.5',
      model: envModel || 'gpt-5.5',
      modelNick: envModel || 'GPT 5.5',
      displayName: envModel || 'GPT 5.5',
      type: 'llm',
      adapter: 'openai-chat',
      endpointPath: '/chat/completions',
      baseUrl: envBaseUrl || 'https://api.openai.com/v1',
      key: envKey,
      enabled: true,
      supports: { chat: true, vision: true }
    });
  }
  return fileModels.map((model) => normalizeBridgeModelConfig(model)).filter(isEnabledModelConfig);
}

function normalizeBridgeModelConfig(model = {}) {
  const type = normalizeBridgeModelType(model);
  const realModel = String(model.model || model.realModelName || model.upstreamModel || model.name || '').trim();
  const displayName = String(model.displayName || model.modelNick || model.nick || model.nickname || model.label || model.ui?.label || model.name || model.model || '').trim();
  const baseUrl = String(model.baseUrl || model.base_url || model.url || model.provider?.baseUrl || '').trim().replace(/\/+$/, '');
  const endpointPath = String(model.endpointPath || model.provider?.endpointPath || model.protocol?.endpointPath || (type === 'LLM' ? '/chat/completions' : '')).trim();
  const adapter = String(model.adapter || model.provider?.adapter || model.protocol?.adapter || (type === 'LLM' ? 'openai-chat' : '')).trim();
  return {
    ...model,
    id: String(model.id || model.configId || model.modelKey || realModel || displayName).trim(),
    configId: String(model.configId || model.id || model.modelKey || realModel || displayName).trim(),
    modelKey: String(model.modelKey || model.id || model.configId || realModel || displayName).trim(),
    name: realModel || displayName,
    model: realModel || displayName,
    displayName: displayName || realModel,
    modelNick: model.modelNick || displayName || realModel,
    nick: model.nick || model.modelNick || displayName || realModel,
    type,
    modelType: type,
    adapter,
    endpointPath,
    baseUrl,
    url: baseUrl,
    key: model.key || model.apiKey || model.api_key || model.provider?.apiKey || '',
    apiKey: model.apiKey || model.key || model.api_key || model.provider?.apiKey || '',
    providerKey: model.providerKey || model.channelKey || model.provider?.providerKey || 'bridge-local',
    channelKey: model.channelKey || model.providerKey || model.provider?.providerKey || 'bridge-local',
    provider: {
      ...(model.provider || {}),
      providerKey: model.provider?.providerKey || model.providerKey || model.channelKey || 'bridge-local',
      adapter: model.provider?.adapter || adapter,
      endpointPath: model.provider?.endpointPath || endpointPath,
      baseUrl: model.provider?.baseUrl || baseUrl
    },
    protocol: {
      ...(model.protocol || {}),
      adapter: model.protocol?.adapter || adapter,
      endpointPath: model.protocol?.endpointPath || endpointPath,
      method: model.protocol?.method || model.requestMethod || 'sync'
    },
    enabled: model.enabled !== false,
    supports: type === 'LLM' ? { chat: true, ...(model.supports || {}) } : (model.supports || {})
  };
}

function publicModelConfig(model) {
  const { key, apiKey, api_key, token, ...rest } = model;
  if (rest.provider) {
    const { apiKey: providerApiKey, api_key: providerApiKeySnake, key: providerKey, token: providerToken, ...provider } = rest.provider;
    rest.provider = provider;
  }
  return rest;
}

function joinEndpoint(baseUrl, endpointPath) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const endpoint = String(endpointPath || '').trim();
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (!base) return '';
  return `${base}/${endpoint.replace(/^\/+/, '')}`;
}

async function resolveBridgeModel(modelId, expectedType = '') {
  const models = await readCanvasModelConfigs();
  const wanted = String(modelId || '').trim();
  const expected = String(expectedType || '').trim().toUpperCase();
  return models.find((model) => {
    if (expected && model.type !== expected) return false;
    return [model.id, model.configId, model.modelKey, model.name, model.model, model.displayName, model.modelNick].some((value) => String(value || '').trim() === wanted);
  }) || null;
}

async function callBridgeLlmChat(input = {}) {
  const model = await resolveBridgeModel(input.modelId || input.modelKey || input.model || '', 'LLM');
  if (!model) throw new Error(`大语言模型不可用或未启用：${input.modelId || input.modelKey || input.model || ''}`);
  const apiKey = model.key || model.apiKey || model.provider?.apiKey || process.env.SMART_VISION_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error(`大语言模型 ${model.displayName || model.name} 缺少 API Key`);
  const baseUrl = model.baseUrl || model.url || model.provider?.baseUrl || process.env.SMART_VISION_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const endpointPath = input.endpointPath || model.endpointPath || model.protocol?.endpointPath || '/chat/completions';
  const endpoint = joinEndpoint(baseUrl, endpointPath);
  if (!endpoint) throw new Error(`大语言模型 ${model.displayName || model.name} 缺少 Base URL`);
  const messages = Array.isArray(input.messages) ? input.messages : [];
  if (!messages.length) throw new Error('messages are required');
  const body = {
    model: model.model || model.name,
    messages,
    temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.7,
    max_tokens: Number.isFinite(Number(input.maxTokens ?? input.maxOutputTokens)) ? Number(input.maxTokens ?? input.maxOutputTokens) : undefined
  };
  Object.keys(body).forEach((key) => body[key] === undefined && delete body[key]);
  const timeoutMs = Number(input.timeoutMs || input.upstreamTimeoutMs || input.requestTimeoutMs || input.queryTimeoutMs || 60000);
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  }, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI Chat HTTP ${response.status}`);
  return {
    ...payload,
    text: normalizeChatCompletionText(payload.choices?.[0]?.message?.content),
    model: payload.model || model.model || model.name,
    modelId: model.id
  };
}

function getUrlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 1600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getCanvasWorkbenchStatus(canvasUrl) {
  const origin = getUrlOrigin(canvasUrl);
  const status = {
    origin,
    health: 'unknown',
    healthOk: false,
    workspaceRoot: '',
    outputsRoot: '',
    smartVisionRoot: '',
    smartVisionOutputsRoot: '',
    readEndpointReady: false,
    readProbePath: '',
    readProbeStatus: 0,
    readProbeContentType: '',
    bridgeBaseRewrite: 'unknown',
    checkedAt: new Date().toISOString(),
    error: ''
  };

  if (!origin) {
    status.health = 'offline';
    status.error = 'canvasUrl is invalid';
    return status;
  }

  try {
    const response = await fetchWithTimeout(`${origin}/api/workbench/health`);
    status.health = response.ok ? 'online' : 'offline';
    status.healthOk = response.ok;

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      status.workspaceRoot = String(payload.workspaceRoot ?? '');
      status.outputsRoot = String(payload.outputsRoot ?? '');
      status.smartVisionRoot = String(payload.smartVisionRoot ?? '');
      status.smartVisionOutputsRoot = String(payload.smartVisionOutputsRoot ?? '');
    }
  } catch (error) {
    status.health = 'offline';
    status.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const page = await fetchWithTimeout(canvasUrl);
    const source = await page.text();
    status.bridgeBaseRewrite = source.includes('rebaseSmartVisionWorkflowUrls') ? 'enabled' : 'missing';
  } catch (error) {
    if (!status.error) status.error = error instanceof Error ? error.message : String(error);
    status.bridgeBaseRewrite = 'unknown';
  }

  const readProbeCandidates = [
    '01-资产图与提示词/故事板/storyboard/ep001-prod-validate/storyboard-run-output.png',
    '01-资产图与提示词/资产图/ep001-prod-validate/asset-run-output.png',
    '01-资产图与提示词/故事板/storyboard/ep001/pipeline-storyboard-output-smoke.png',
    '01-资产图与提示词/资产图/ep001/pipeline-asset-output-smoke.png'
  ];
  const readProbePath = readProbeCandidates.find((candidate) => {
    try {
      return existsSync(resolveArtifactPath(candidate).absolutePath);
    } catch {
      return false;
    }
  }) ?? readProbeCandidates[0];
  status.readProbePath = readProbePath;

  try {
    const readProbeUrl = `${origin}/read?path=${encodeURIComponent(readProbePath)}&raw=1`;
    const response = await fetchWithTimeout(readProbeUrl);
    status.readProbeStatus = response.status;
    status.readProbeContentType = response.headers.get('content-type') ?? '';
    status.readEndpointReady = response.ok && /^image\//i.test(status.readProbeContentType);
  } catch (error) {
    if (!status.error) status.error = error instanceof Error ? error.message : String(error);
    status.readEndpointReady = false;
  }

  return status;
}

async function buildSnapshot() {
  const projectConfig = await readJson(path.join(projectRoot, 'project.json'), {});
  const projectState = await readJson(path.join(smartVisionRoot, 'project-state.json'), {});
  const progressLedger = await readJson(path.join(smartVisionRoot, 'progress-ledger.json'), { items: [] });
  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [] });
  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), {});
  const pipelineRunLedger = await readJson(path.join(smartVisionRoot, 'pipeline-run-ledger.json'), getPipelineRunLedgerFallback(projectState.projectId ?? 'infinite-awakening-001'));
  const canvasRunLedger = await readCanvasRunLedger(projectState.projectId ?? 'infinite-awakening-001');
  const releaseRegistry = await readReleaseRegistry();
  const methodologyPack = await readJson(path.join(smartVisionRoot, 'methodology-pack.json'), {});
  const skillPack = await readJson(path.join(smartVisionRoot, 'skill-pack.json'), {});
  const templatePack = await readJson(path.join(smartVisionRoot, 'template-pack.json'), {});
  const scannedArtifacts = await scanProjectArtifacts();
  const modelSummary = await getModelSummary();

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

  const getTaskDescription = (item) => item.description ?? taskDescriptions[item.id] ?? '项目状态任务。';
  const getTaskItems = (item) => Array.isArray(item.items) && item.items.length > 0 ? item.items : taskItems[item.id] ?? [];

  const canvasUrl = workflowRegistry.canvasUrl ?? 'http://127.0.0.1:8877/image-studio-canvas.html';
  const workbenchStatus = await getCanvasWorkbenchStatus(canvasUrl);
  const bridgeBase = getBridgeBaseUrl();
  const workflowItems = Array.isArray(workflowRegistry.workflows) ? workflowRegistry.workflows : [];
  const workflows = await Promise.all(workflowItems.map(async (workflow) => {
    const importUrl = buildWorkflowImportUrl(canvasUrl, workflow.path);
    const editUrl = buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'edit' });
    const runUrl = buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'manual' });

    return {
      ...workflow,
      importUrl,
      editUrl,
      runUrl,
      importCheck: await validateWorkflowRegistryItem({ ...workflow, importUrl, editUrl, runUrl }, canvasUrl)
    };
  }));
  const reviews = Array.isArray(reviewLedger.reviews) ? reviewLedger.reviews : [];
  const enrichedReleaseRegistry = await enrichReleaseRegistry(releaseRegistry, reviews);
  const reviewHistory = Array.isArray(reviewLedger.history) ? reviewLedger.history : [];
  const progressItems = Array.isArray(progressLedger.items) ? progressLedger.items : [];
  const workflowChains = workflows.map((workflow) => {
    const downstream = workflows.filter((item) => item.sourceWorkflowId === workflow.id && !item.archived);
    const outputArtifacts = workflow.outputArtifacts ?? [];
    const outputCount = outputArtifacts.length;
    const outputReview = workflow.lastOutputReviewId ? reviews.find((review) => review.id === workflow.lastOutputReviewId) : null;
    const downstreamReady = downstream.length > 0;
    const closed = Boolean(outputCount > 0 && outputReview?.status === 'done' && downstreamReady);
    let nextAction = 'import_workflow';
    let nextActionLabel = '导入画布执行 Workflow';
    let actionTarget = workflow.path;

    if (closed) {
      nextAction = 'import_downstream_workflow';
      nextActionLabel = '导入下游 Workflow 到画布执行';
      actionTarget = downstream[0]?.path ?? workflow.path;
    } else if (outputCount === 0) {
      nextAction = workflow.status === 'todo' ? 'import_workflow' : 'add_output';
      nextActionLabel = workflow.status === 'todo' ? '导入画布执行 Workflow' : '登记输出产物';
      actionTarget = workflow.status === 'todo' ? workflow.path : workflow.id;
    } else if (!workflow.lastOutputReviewId) {
      nextAction = 'create_artifact_review';
      nextActionLabel = '创建产物审核';
      actionTarget = outputArtifacts[0] ?? workflow.id;
    } else if (outputReview?.status === 'waiting_review' || outputReview?.status === 'in_progress') {
      nextAction = 'approve_artifact_review';
      nextActionLabel = '去审核中心通过或打回产物';
      actionTarget = workflow.lastOutputReviewId;
    } else if (outputReview?.status === 'blocked') {
      nextAction = 'fix_artifact_output';
      nextActionLabel = '修复产物后重新登记输出';
      actionTarget = outputReview.artifactPath ?? workflow.id;
    } else if (outputReview?.status === 'done') {
      nextAction = downstreamReady ? 'import_downstream_workflow' : 'create_downstream_workflow';
      nextActionLabel = downstreamReady ? '导入下游 Workflow 到画布执行' : '创建下游 Workflow';
      actionTarget = downstreamReady ? downstream[0]?.path : workflow.lastOutputReviewId;
    }

    const timeline = [
      workflow.generatedAt ? {
        id: `${workflow.id}:created`,
        label: 'Workflow 创建',
        target: workflow.path,
        status: workflow.status,
        at: workflow.generatedAt
      } : null,
      workflow.updatedAt ? {
        id: `${workflow.id}:updated`,
        label: `Workflow 状态：${workflow.status}`,
        target: workflow.id,
        status: workflow.status,
        at: workflow.updatedAt
      } : null,
      ...((workflow.outputArtifacts ?? []).map((artifactPath) => ({
        id: `${workflow.id}:output:${artifactPath}`,
        label: '登记输出产物',
        target: artifactPath,
        status: 'done',
        at: workflow.updatedAt ?? workflow.generatedAt
      }))),
      ...reviewHistory.filter((history) => history.workflowId === workflow.id || history.reviewId === workflow.lastOutputReviewId).map((history) => ({
        id: `${workflow.id}:review:${history.reviewId}:${history.updatedAt}`,
        label: history.result ?? '审核状态更新',
        target: history.artifactPath ?? history.target ?? history.reviewId,
        status: history.status,
        at: history.updatedAt
      })),
      ...downstream.map((item) => ({
        id: `${workflow.id}:downstream:${item.id}`,
        label: '下游 Workflow 创建',
        target: item.path,
        status: item.status,
        at: item.generatedAt ?? item.updatedAt
      })),
      ...progressItems.filter((item) => item.sourceWorkflowId === workflow.id || item.workflowId === workflow.id).map((item) => ({
        id: `${workflow.id}:progress:${item.id}`,
        label: item.title,
        target: item.artifactPath ?? item.reviewId ?? item.workflowId ?? item.id,
        status: item.status,
        at: item.updatedAt
      }))
    ].filter(Boolean).sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? ''))).slice(-8);

    return {
      workflowId: workflow.id,
      workflowType: workflow.type,
      workflowStatus: workflow.status,
      sourceWorkflowId: workflow.sourceWorkflowId,
      outputCount,
      lastOutputReviewId: workflow.lastOutputReviewId,
      triggeredByReviewId: workflow.triggeredByReviewId,
      chainStage: workflow.chainStage,
      downstreamWorkflowIds: downstream.map((item) => item.id),
      reviewStatus: outputReview?.status,
      sourceArtifactPath: workflow.sourceArtifactPath,
      nextAction,
      nextActionLabel,
      actionTarget,
      timeline,
      closed
    };
  });

  return {
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
    taskColumns: progressLedger.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: getTaskDescription(item),
      status: item.status,
      items: getTaskItems(item)
    })),
    reviews: reviews.map((review) => ({
      id: review.id,
      title: review.id,
      target: review.target,
      status: review.status,
      type: review.type,
      workflowId: review.workflowId,
      artifactPath: review.artifactPath
    })),
    artifacts: mergeArtifacts(artifactRegistry.primaryArtifacts, scannedArtifacts),
    canvasOutputs: Array.isArray(artifactRegistry.canvasOutputs) ? artifactRegistry.canvasOutputs : [],
    canvasStatus: {
      url: canvasUrl,
      bridgeBase,
      health: workbenchStatus.healthOk ? 'online' : workbenchStatus.health === 'offline' ? 'offline' : 'unknown',
      modelCount: modelSummary.modelCount,
      hasVideoModels: modelSummary.hasVideoModels,
      note: '数据来自本地服务桥接层；画布在线状态可通过健康检查接口刷新。',
      workbench: workbenchStatus
    },
    workflowRegistry: {
      canvasUrl,
      bridgeBase,
      workflows,
      note: workflowRegistry.note ?? 'Workflow JSON Builder 后续接入。',
      updatedAt: workflowRegistry.updatedAt,
      chains: workflowChains
    },
    pipelineRunRegistry: pipelineRunLedger,
    canvasRunLedger,
    releaseRegistry: enrichedReleaseRegistry,
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
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())));
}

function getTaskTypeAliases(taskType) {
  const normalized = String(taskType || 'storyboard').trim().toLowerCase();
  const aliases = new Set([normalized]);

  if (normalized.includes('creative') || normalized.includes('orchestration') || normalized.includes('dynamic') || normalized.includes('smart_canvas') || normalized.includes('script') || normalized.includes('story')) {
    [
      'project_control',
      'phase_gate',
      'storyboard',
      'storyboard_image_generation',
      'director_storyboard',
      'shot_design',
      'asset_image_generation',
      'character_asset',
      'scene_asset',
      'prop_asset',
      'style_bible',
      'image_prompt',
      'seedance_prompt',
      'video_generation',
      'qa',
      'release'
    ].forEach((alias) => aliases.add(alias));
  }
  if (normalized.includes('asset_image') || normalized.includes('asset_graph')) {
    aliases.add('character_asset');
    aliases.add('scene_asset');
    aliases.add('prop_asset');
    aliases.add('style_bible');
    aliases.add('image_prompt');
  }
  if (normalized.includes('storyboard')) {
    aliases.add('storyboard');
    aliases.add('storyboard_image');
    aliases.add('image_prompt');
    aliases.add('director_storyboard');
    aliases.add('shot_design');
  }
  if (normalized.includes('video') || normalized.includes('seedance') || normalized.includes('jimeng')) {
    aliases.add('video_generation');
    aliases.add('seedance_prompt');
    aliases.add('jimeng_prompt');
    aliases.add('image_prompt');
    aliases.add('action_scene');
  }
  if (normalized.includes('asset') || normalized.includes('character') || normalized.includes('scene') || normalized.includes('prop')) {
    aliases.add('character_asset');
    aliases.add('scene_asset');
    aliases.add('prop_asset');
    aliases.add('style_bible');
  }
  if (normalized.includes('edit') || normalized.includes('episode')) {
    aliases.add('episode_editing');
    aliases.add('video_generation');
    aliases.add('qa');
  }
  if (normalized.includes('qa') || normalized.includes('review') || normalized.includes('release')) {
    aliases.add('qa');
    aliases.add('phase_gate');
    aliases.add('project_control');
    aliases.add('prompt_qa');
  }

  return Array.from(aliases);
}

function isFullDataPackTaskType(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  return ['creative_orchestration', 'dynamic_pipeline', 'smart_canvas', 'smart_canvas_orchestration', 'full_series_queue'].some((token) => normalized.includes(token));
}

function matchesTaskType(item, taskType) {
  const taskTypes = Array.isArray(item?.taskTypes) ? item.taskTypes : [];
  const aliases = getTaskTypeAliases(taskType);
  return taskTypes.some((itemTaskType) => aliases.includes(itemTaskType) || aliases.some((alias) => itemTaskType.includes(alias) || alias.includes(itemTaskType)));
}

function slugifyTaskType(taskType) {
  return String(taskType || 'storyboard').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'storyboard';
}

async function appendStateOperationJournal(entry) {
  const journalPath = path.join(smartVisionRoot, 'state-operation-journal.json');
  const journal = await readJson(journalPath, { version: '0.1.0', projectId: 'infinite-awakening-001', operations: [] });
  journal.operations = [...(journal.operations ?? []), entry].slice(-300);
  journal.updatedAt = entry.at;
  await writeJson(journalPath, journal);
}

async function withStateOperationJournal({ operation, target = null, dryRun = false, metadata = {} } = {}, task) {
  if (dryRun) return task();

  const operationId = `state-op-${slugifyTaskType(operation)}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  await appendStateOperationJournal({
    id: operationId,
    operation,
    target,
    status: 'running',
    at: startedAt,
    metadata
  });

  try {
    const result = await task();
    await appendStateOperationJournal({
      id: operationId,
      operation,
      target,
      status: 'done',
      at: new Date().toISOString(),
      startedAt,
      metadata
    });
    return result;
  } catch (error) {
    await appendStateOperationJournal({
      id: operationId,
      operation,
      target,
      status: 'failed',
      at: new Date().toISOString(),
      startedAt,
      error: error instanceof Error ? error.message : String(error),
      metadata
    }).catch(() => undefined);
    throw error;
  }
}

function extractMarkdownHeadings(content, limit = 8) {
  return String(content || '').split(/\r?\n/).map((line) => line.match(/^(#{1,4})\s+(.+)$/)?.[2]?.trim()).filter(Boolean).slice(0, limit);
}

function createExcerpt(content, limit = 420) {
  const text = String(content || '').replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

async function listWorkspaceReferenceFiles(relativeRoot, extensions = new Set(['.md', '.json', '.txt']), limit = 200) {
  const normalizedRoot = normalizeArtifactPathValue(relativeRoot).replace(/\/+$/, '');
  const root = path.join(workspaceRoot, normalizedRoot);
  const results = [];

  async function walk(relativeDir = '') {
    if (results.length >= limit) return;
    const absoluteDir = path.join(root, relativeDir);
    if (!existsSync(absoluteDir)) return;
    const entries = await readdir(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= limit || entry.name.startsWith('.')) continue;
      const nextRelative = path.join(relativeDir, entry.name);
      const normalized = nextRelative.split(path.sep).join('/');
      if (entry.isDirectory()) {
        await walk(nextRelative);
        continue;
      }
      if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(`${normalizedRoot}/${normalized}`);
      }
    }
  }

  await walk('');
  return results;
}

function shouldSkipDataPackPath(normalizedPath) {
  const value = String(normalizedPath || '');
  const baseName = path.basename(value);
  if (!value || baseName === '.DS_Store') return true;
  if (/(^|\/)(node_modules|\.git|\.idea|\.runtime|__pycache__|tmp-docx-extract)(\/|$)/.test(value)) return true;
  if (/(^|\/)(\.env|\.env\..*|secrets?|credentials?|token|api[-_]?key)(\.[^/]*)?$/i.test(value)) return true;
  if (value.startsWith('smart-vision/.runtime/') || value.startsWith('smart-vision/app/node_modules/')) return true;
  return false;
}

async function listWorkspaceDataPackRootFiles(spec) {
  const normalizedRoot = normalizeArtifactPathValue(spec.root).replace(/\/+$/, '');
  const root = path.join(workspaceRoot, normalizedRoot);
  const extensions = spec.extensions ?? dataPackTextExtensions;
  const limit = spec.limit ?? 300;
  const maxFileBytes = spec.maxFileBytes ?? 1024 * 1024;
  const files = [];
  let scanned = 0;
  let skippedLarge = 0;

  async function walk(relativeDir = '') {
    if (files.length >= limit) return;
    const absoluteDir = path.join(root, relativeDir);
    if (!existsSync(absoluteDir)) return;
    const entries = await readdir(absoluteDir, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= limit) break;
      const nextRelative = path.join(relativeDir, entry.name);
      const normalized = nextRelative.split(path.sep).join('/');
      const workspacePath = `${normalizedRoot}/${normalized}`;
      if (shouldSkipDataPackPath(workspacePath)) continue;
      if (entry.isDirectory()) {
        await walk(nextRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned += 1;
      const extension = path.extname(entry.name).toLowerCase();
      if (!extensions.has(extension)) continue;
      const absolutePath = path.join(root, nextRelative);
      const stats = await stat(absolutePath).catch(() => null);
      if (stats?.size && stats.size > maxFileBytes) {
        skippedLarge += 1;
        continue;
      }
      files.push({
        path: workspacePath,
        sourceKind: spec.sourceKind,
        rootId: spec.id,
        title: entry.name,
        extension,
        size: stats?.size ?? 0
      });
    }
  }

  await walk('');
  return {
    id: spec.id,
    title: spec.title,
    root: normalizedRoot,
    sourceKind: spec.sourceKind,
    fileCount: files.length,
    scannedFileCount: scanned,
    skippedLargeFileCount: skippedLarge,
    truncated: files.length >= limit,
    parseLimit: spec.parseLimit ?? Math.min(limit, 80),
    files
  };
}

async function buildWorkspaceDataPackIndex(activeDataPack = builtinDataPack()) {
  const rootSpecs = getDataPackRootSpecs(activeDataPack);
  const roots = await Promise.all(rootSpecs.map((spec) => listWorkspaceDataPackRootFiles(spec)));
  return {
    version: '0.2.0',
    title: `${activeDataPack.title || activeDataPack.id}完整只读数据包索引`,
    activeDataPackId: activeDataPack.id || 'manju-creation-library',
    activeDataPackTitle: activeDataPack.title || '漫剧创作库',
    activeDataPackType: activeDataPack.type || 'creative_automation',
    platformRole: 'Smart Vision SaaS data-pack visual workflow platform',
    policy: {
      ...dataPackReadOnlyPolicy,
      activeDataPackId: activeDataPack.id || 'manju-creation-library',
      activeDataPackTitle: activeDataPack.title || '漫剧创作库',
      activePack: `当前 active data pack 是 ${activeDataPack.title || activeDataPack.id}；后续可由后台下发并切换其他定制创作库。`
    },
    roots,
    rootCount: roots.length,
    fileCount: roots.reduce((sum, root) => sum + root.fileCount, 0),
    parsedCandidateCount: roots.reduce((sum, root) => sum + Math.min(root.fileCount, root.parseLimit), 0),
    generatedAt: new Date().toISOString()
  };
}

function workspaceDataPackParsePaths(workspaceDataPack) {
  return uniqueStrings((workspaceDataPack?.roots ?? []).flatMap((root) => (root.files ?? []).slice(0, root.parseLimit ?? 80).map((file) => file.path)));
}

function inferAgentTaskTypes(agentId, content = '') {
  const id = String(agentId || '').toLowerCase();
  const text = `${id}\n${String(content || '').toLowerCase()}`;
  const taskTypes = new Set(['creative_orchestration']);

  if (text.includes('producer') || text.includes('librarian')) ['project_control', 'phase_gate', 'qa', 'release'].forEach((item) => taskTypes.add(item));
  if (text.includes('writer') || text.includes('script')) ['storyboard', 'director_storyboard', 'shot_design'].forEach((item) => taskTypes.add(item));
  if (text.includes('director') || text.includes('camera')) ['director_storyboard', 'shot_design', 'storyboard_image_generation', 'video_generation'].forEach((item) => taskTypes.add(item));
  if (text.includes('storyboard')) ['storyboard', 'storyboard_image_generation', 'director_storyboard'].forEach((item) => taskTypes.add(item));
  if (text.includes('studio') || text.includes('asset') || text.includes('art')) ['asset_image_generation', 'character_asset', 'scene_asset', 'prop_asset', 'style_bible'].forEach((item) => taskTypes.add(item));
  if (text.includes('review') || text.includes('qa')) ['qa', 'phase_gate', 'release'].forEach((item) => taskTypes.add(item));

  return Array.from(taskTypes);
}

async function buildDiscoveredAgentPack() {
  const files = await listWorkspaceReferenceFiles('agents', new Set(['.md']), 120);
  const agents = [];

  for (const file of files.filter((item) => item.endsWith('/agent.md'))) {
    const resolved = resolveArtifactPath(file);
    const content = existsSync(resolved.absolutePath) ? await readFile(resolved.absolutePath, 'utf8') : '';
    const agentId = file.split('/').slice(1, -1).join('/') || path.basename(path.dirname(file));
    agents.push({
      id: agentId,
      title: extractMarkdownHeadings(content, 1)[0] || agentId,
      taskTypes: inferAgentTaskTypes(agentId, content),
      files: [file]
    });
  }

  return {
    version: '0.1.0',
    projectId: 'infinite-awakening-001',
    packId: 'smart-vision-agent-auto-discovered',
    title: '自动发现 Agent 协作包',
    updatedAt: new Date().toISOString(),
    agents,
    note: '未检测到 .smart-vision/agent-pack.json 时，由 Bridge 从 agents/*/agent.md 自动发现。'
  };
}

async function readAgentPack() {
  const explicitPath = path.join(smartVisionRoot, 'agent-pack.json');
  if (existsSync(explicitPath)) return readJson(explicitPath, { agents: [] });
  return buildDiscoveredAgentPack();
}

async function discoverWordlistReferences(taskType = 'creative_orchestration') {
  const normalized = String(taskType || '').toLowerCase();
  const files = await listWorkspaceReferenceFiles('wordlists', new Set(['.json', '.md']), 120);
  if (isFullDataPackTaskType(normalized) || normalized.includes('creative')) return files;
  if (normalized.includes('audio') || normalized.includes('voice') || normalized.includes('sound')) return files.filter((item) => item.includes('/audio/') || item.endsWith('/README.md'));
  if (normalized.includes('asset') || normalized.includes('image') || normalized.includes('style')) return files.filter((item) => item.includes('/style/') || item.includes('/mj-image/') || item.endsWith('/README.md'));
  if (normalized.includes('storyboard') || normalized.includes('video') || normalized.includes('shot')) return files.filter((item) => item.includes('/visual/') || item.includes('/style/') || item.includes('/mj-image/') || item.endsWith('/README.md'));
  return files.slice(0, 24);
}

function resolveReferencePath(referencePath) {
  try {
    return resolveArtifactPath(referencePath);
  } catch (error) {
    return { normalized: normalizeArtifactPathValue(referencePath), absolutePath: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function parseReferenceFile(referencePath, sourceKind) {
  const resolved = resolveReferencePath(referencePath);
  const parsedAt = new Date().toISOString();

  if (resolved.error || !resolved.absolutePath) {
    return {
      path: resolved.normalized,
      sourceKind,
      exists: false,
      parsedAt,
      error: resolved.error ?? 'reference path invalid',
      headings: [],
      excerpt: ''
    };
  }

  if (!existsSync(resolved.absolutePath)) {
    return {
      path: resolved.normalized,
      sourceKind,
      exists: false,
      parsedAt,
      error: 'reference file missing',
      headings: [],
      excerpt: ''
    };
  }

  const extension = path.extname(resolved.absolutePath).toLowerCase();
  const content = await readFile(resolved.absolutePath, 'utf8');
  const base = {
    path: resolved.normalized,
    sourceKind,
    exists: true,
    extension,
    size: Buffer.byteLength(content, 'utf8'),
    parsedAt
  };

  if (extension === '.json') {
    try {
      const json = JSON.parse(content);
      return {
        ...base,
        format: 'json',
        headings: Object.keys(json).slice(0, 12),
        excerpt: createExcerpt(JSON.stringify(json).slice(0, 1200)),
        jsonKeys: Object.keys(json)
      };
    } catch (error) {
      return {
        ...base,
        format: 'json',
        headings: [],
        excerpt: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    ...base,
    format: extension === '.md' ? 'markdown' : 'text',
    headings: extractMarkdownHeadings(content),
    excerpt: createExcerpt(content)
  };
}

function collectCapabilityReferences(matchedMethodologies, matchedAgents, matchedSkills, matchedTemplates, wordlists, workspaceDataPack = null) {
  const workspaceFilesByKind = new Map();
  for (const root of workspaceDataPack?.roots ?? []) {
    const paths = (root.files ?? []).map((file) => file.path);
    workspaceFilesByKind.set(root.sourceKind, uniqueStrings([...(workspaceFilesByKind.get(root.sourceKind) ?? []), ...paths]));
  }
  return {
    docs: uniqueStrings([...matchedMethodologies.flatMap((item) => item.documents ?? []), ...(workspaceFilesByKind.get('docs') ?? [])]),
    agents: uniqueStrings([...matchedAgents.flatMap((item) => item.files ?? []), ...(workspaceFilesByKind.get('agents') ?? [])]),
    skills: uniqueStrings([...matchedSkills.flatMap((item) => item.files ?? []), ...(workspaceFilesByKind.get('skills') ?? [])]),
    templates: uniqueStrings([...matchedTemplates.flatMap((item) => item.files ?? []), ...(workspaceFilesByKind.get('templates') ?? [])]),
    wordlists: uniqueStrings([...wordlists, ...(workspaceFilesByKind.get('wordlists') ?? [])]),
    workspaceDataPack: workspaceDataPackParsePaths(workspaceDataPack)
      .filter((reference) => !['docs/', 'agents/', 'skills/', 'templates/', 'wordlists/'].some((prefix) => reference.startsWith(prefix)))
  };
}

async function buildDataPackBundle(taskType = 'storyboard', activeDataPack = builtinDataPack()) {
  const normalizedTaskType = String(taskType || 'storyboard').trim() || 'storyboard';
  const methodologyPack = await readJson(path.join(smartVisionRoot, 'methodology-pack.json'), { categories: [] });
  const agentPack = await readAgentPack();
  const skillPack = await readJson(path.join(smartVisionRoot, 'skill-pack.json'), { skills: [] });
  const templatePack = await readJson(path.join(smartVisionRoot, 'template-pack.json'), { templates: [] });
  const fullPack = isFullDataPackTaskType(normalizedTaskType);
  const matchedMethodologies = (methodologyPack.categories ?? []).filter((item) => fullPack || matchesTaskType(item, normalizedTaskType));
  const matchedAgents = (agentPack.agents ?? []).filter((item) => fullPack || matchesTaskType(item, normalizedTaskType));
  const matchedSkills = (skillPack.skills ?? []).filter((item) => fullPack || matchesTaskType(item, normalizedTaskType));
  const matchedTemplates = (templatePack.templates ?? []).filter((item) => fullPack || matchesTaskType(item, normalizedTaskType));
  const wordlists = await discoverWordlistReferences(normalizedTaskType);
  const workspaceDataPack = await buildWorkspaceDataPackIndex(activeDataPack);
  const references = collectCapabilityReferences(matchedMethodologies, matchedAgents, matchedSkills, matchedTemplates, wordlists, workspaceDataPack);
  const parsedReferences = [
    ...(await Promise.all(references.docs.map((reference) => parseReferenceFile(reference, 'docs')))),
    ...(await Promise.all(references.agents.map((reference) => parseReferenceFile(reference, 'agents')))),
    ...(await Promise.all(references.skills.map((reference) => parseReferenceFile(reference, 'skills')))),
    ...(await Promise.all(references.templates.map((reference) => parseReferenceFile(reference, 'templates')))),
    ...(await Promise.all(references.wordlists.map((reference) => parseReferenceFile(reference, 'wordlists')))),
    ...(await Promise.all(references.workspaceDataPack.map((reference) => parseReferenceFile(reference, 'workspace_data_pack'))))
  ];
  const referenceIssues = parsedReferences.filter((item) => !item.exists || item.error).map((item) => ({
    path: item.path,
    sourceKind: item.sourceKind,
    error: item.error ?? 'reference unavailable'
  }));

  return {
    taskType: normalizedTaskType,
    aliases: getTaskTypeAliases(normalizedTaskType),
    packs: {
      methodology: { packId: methodologyPack.packId ?? 'methodology-pack-missing', title: methodologyPack.title ?? '方法论核心包未登记', matchedItems: matchedMethodologies },
      agent: { packId: agentPack.packId ?? 'agent-pack-missing', title: agentPack.title ?? 'Agent 协作包未登记', matchedItems: matchedAgents },
      skill: { packId: skillPack.packId ?? 'skill-pack-missing', title: skillPack.title ?? 'Skill 核心包未登记', matchedItems: matchedSkills },
      template: { packId: templatePack.packId ?? 'template-pack-missing', title: templatePack.title ?? 'Template 核心包未登记', matchedItems: matchedTemplates }
    },
    references,
    workspaceDataPack,
    parsedReferences,
    referenceIssues,
    summary: {
      activeDataPackId: activeDataPack.id || 'manju-creation-library',
      activeDataPackTitle: activeDataPack.title || '漫剧创作库',
      fullPack,
      methodologyCount: matchedMethodologies.length,
      agentCount: matchedAgents.length,
      skillCount: matchedSkills.length,
      templateCount: matchedTemplates.length,
      wordlistCount: wordlists.length,
      workspaceDataPackRootCount: workspaceDataPack.rootCount,
      workspaceDataPackFileCount: workspaceDataPack.fileCount,
      workspaceDataPackParsedCandidateCount: workspaceDataPack.parsedCandidateCount,
      referenceCount: parsedReferences.length,
      missingReferenceCount: referenceIssues.length,
      parsedAt: new Date().toISOString()
    }
  };
}

async function buildTaskContextPack(taskType = 'storyboard', activeDataPack = builtinDataPack()) {
  const normalizedTaskType = String(taskType || 'storyboard').trim() || 'storyboard';
  const dataPackBundle = await buildDataPackBundle(normalizedTaskType, activeDataPack);
  const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [] });
  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
  const scannedArtifacts = await scanProjectArtifacts();

  const docs = dataPackBundle.references.docs;
  const agents = dataPackBundle.references.agents;
  const skills = dataPackBundle.references.skills;
  const templates = dataPackBundle.references.templates;
  const wordlists = dataPackBundle.references.wordlists;
  const workspaceDataPackFiles = dataPackBundle.references.workspaceDataPack;
  const artifacts = mergeArtifacts(artifactRegistry.primaryArtifacts, scannedArtifacts);
  const workflowHints = uniqueStrings((workflowRegistry.workflows ?? []).filter((item) => item.type === normalizedTaskType || item.type?.includes(normalizedTaskType) || normalizedTaskType.includes(item.type)).map((item) => item.path));

  const upstreamWorkflow = (workflowRegistry.workflows ?? []).find((item) => item.type === normalizedTaskType && item.sourceArtifactPath && !item.archived);
  const pipelineInputHints = getPipelineStageInputHints(normalizedTaskType);
  const prioritizedArtifacts = uniqueStrings([
    upstreamWorkflow?.sourceArtifactPath,
    ...pipelineInputHints,
    ...((artifactRegistry.primaryArtifacts ?? []).filter((artifact) => /storyboard|故事板|asset|资产|seedance|prompts|提示词/i.test(artifact))),
    ...artifacts
  ]);

  return {
    taskType: normalizedTaskType,
    title: `${normalizedTaskType} 任务上下文包`,
    activeDataPack: {
      id: activeDataPack.id || 'manju-creation-library',
      title: activeDataPack.title || '漫剧创作库',
      type: activeDataPack.type || 'creative_automation',
      source: activeDataPack.source || 'builtin_workspace',
      capabilities: {
        ...defaultDataPackCapabilities(activeDataPack.type || 'creative_automation'),
        ...normalizePlainObject(activeDataPack.capabilities, {})
      },
      metadata: {
        ...defaultDataPackMetadata(),
        ...normalizePlainObject(activeDataPack.metadata, {})
      },
      outputKinds: outputKindsForDataPack(activeDataPack),
      requiredOrder: requiredOrderForDataPack(activeDataPack)
    },
    methodologyPackId: dataPackBundle.packs.methodology.packId,
    skillPackId: dataPackBundle.packs.skill.packId,
    templatePackId: dataPackBundle.packs.template.packId,
    aliases: dataPackBundle.aliases,
    docs,
    skills,
    agents,
    templates,
    wordlists,
    workspaceDataPackFiles,
    workspaceDataPack: dataPackBundle.workspaceDataPack,
    inputArtifacts: prioritizedArtifacts.slice(0, 24),
    workflowHints,
    selectedCapabilityItems: {
      methodologies: dataPackBundle.packs.methodology.matchedItems.map((item) => ({ id: item.id, title: item.title, taskTypes: item.taskTypes ?? [] })),
      agents: dataPackBundle.packs.agent.matchedItems.map((item) => ({ id: item.id, title: item.title, taskTypes: item.taskTypes ?? [] })),
      skills: dataPackBundle.packs.skill.matchedItems.map((item) => ({ id: item.id, title: item.title, taskTypes: item.taskTypes ?? [] })),
      templates: dataPackBundle.packs.template.matchedItems.map((item) => ({ id: item.id, title: item.title, taskTypes: item.taskTypes ?? [] }))
    },
    parsedReferences: dataPackBundle.parsedReferences,
    referenceIssues: dataPackBundle.referenceIssues,
    dataPackSummary: dataPackBundle.summary,
    phaseGateItems: [
      '读取 docs/workflow.md 与 docs/phase-gate-checklist.md 后再进入下一阶段。',
      '输出必须能追溯到项目状态源、能力包索引与真实产物路径。',
      '缺少方法论、Agent、Skill、模板或词库匹配时不得静默执行，应在上下文包中显式暴露。'
    ],
    redlines: [
      '不得绕过 .smart-vision 状态源直接假设项目进度。',
      '不得输出无法追溯到完整数据包 docs / agents / skills / templates / wordlists / tools / data / projects / AAA / memory / project artifacts 的任务指令。',
      '不得把能力包索引当作最终生成结果，必须继续进入具体任务执行或 Workflow Builder。'
    ],
    memoryPolicy: '优先读取项目文件化记忆与 .smart-vision 状态源；对影响方法论、模板、门禁、Agent/Skill 协作的结论必须回写项目文件。',
    generatedAt: new Date().toISOString()
  };
}

function compactParsedReference(reference) {
  return {
    path: reference.path,
    sourceKind: reference.sourceKind,
    exists: reference.exists,
    format: reference.format,
    headings: reference.headings ?? [],
    excerpt: reference.excerpt ?? '',
    error: reference.error ?? null
  };
}

function outputKindsForDataPack(activeDataPack = builtinDataPack()) {
  const capabilities = normalizePlainObject(activeDataPack.capabilities, {});
  const metadata = normalizePlainObject(activeDataPack.metadata, {});
  const values = Array.isArray(capabilities.outputKinds)
    ? capabilities.outputKinds
    : Array.isArray(metadata.outputKinds)
      ? metadata.outputKinds
      : defaultDataPackCapabilities(activeDataPack.type || 'creative_automation').outputKinds;
  return uniqueStrings(values.map((item) => String(item || '').trim()).filter(Boolean));
}

function requiredOrderForDataPack(activeDataPack = builtinDataPack()) {
  const capabilities = normalizePlainObject(activeDataPack.capabilities, {});
  const values = Array.isArray(capabilities.requiredOrder)
    ? capabilities.requiredOrder
    : defaultDataPackCapabilities(activeDataPack.type || 'creative_automation').requiredOrder;
  return uniqueStrings(values.map((item) => String(item || '').trim()).filter(Boolean));
}

function buildSmartCanvasPlannerContract(activeDataPack = builtinDataPack()) {
  const activeId = activeDataPack.id || 'manju-creation-library';
  const activeTitle = activeDataPack.title || '漫剧创作库';
  const outputKinds = outputKindsForDataPack(activeDataPack);
  const requiredOrder = requiredOrderForDataPack(activeDataPack);
  const capabilities = {
    ...defaultDataPackCapabilities(activeDataPack.type || 'creative_automation'),
    ...normalizePlainObject(activeDataPack.capabilities, {})
  };
  const metadata = {
    ...defaultDataPackMetadata(),
    ...normalizePlainObject(activeDataPack.metadata, {})
  };
  return {
    runtimeMode: 'llm_dynamic_orchestration',
    fixedPipelineAllowed: false,
    platformRole: 'Smart Vision 是可挂载不同创作库数据包的 SaaS 可视化操作平台，不是单一创作库专用系统。',
    activeDataPackId: activeId,
    activeDataPackTitle: activeTitle,
    activeDataPackType: activeDataPack.type || 'creative_automation',
    activeDataPackCapabilities: capabilities,
    activeDataPackMetadata: metadata,
    outputKinds,
    requiredOrder,
    dataPackScope: `当前 active data pack「${activeTitle}」完整只读索引：${getDataPackRootSpecs(activeDataPack).map((root) => root.root).join(' / ')}。后续可替换为后台下发的广告、电商、电影、自媒体宣传片等定制创作库。`,
    requiredPlanningRule: '必须由大模型读取当前 active data pack 后，按该数据包定义的 workflow / agent protocol / docs / skills / templates / wordlists / examples 推演既有 Agent 流水线执行步骤；Smart Vision 只是可视化操作平台，不能使用前端固定任务链替代，也不能随意改写上游数据包。',
    requiredStepOrderRule: activeId === 'manju-creation-library'
      ? '必须尊重当前 active data pack 定义的 Agent 流水线。当前漫剧创作库默认链路是：Phase 0 创作源输入/风格 -> Phase 1 Writer 故事/剧本 -> Phase 2 Director/Studio/Librarian 讲戏、视觉、资产设计与资产索引/资产图 -> Phase 3 Storyboard Artist 故事板生产包 -> Phase 4 Studio 生成/工作流 -> Phase 5 Edit -> Phase 6 Reviewer QA -> Phase 7 Producer 发布；如大模型认为需要插入额外步骤，必须在 steps 中说明 Agent、Skill 和数据包依据。'
      : `必须尊重当前 active data pack 自己定义的 workflow / agent protocol / docs / skills / templates / wordlists；后台登记的建议顺序是：${requiredOrder.join(' -> ') || '以数据包文档为准'}；如大模型认为需要插入额外步骤，必须在 steps 中说明 Agent、Skill 和数据包依据。`,
    allowedNodeTypes: [
      'svAgentTask',
      'svAudio',
      'svWriter',
      'svDirector',
      'svShotTable',
      'svAssetCard',
      'svAssetWorkflow',
      'svStoryboardWorkflow',
      'svVideoWorkflow',
      'svQa',
      'svRelease'
    ],
    requiredStepFields: ['id', 'nodeType', 'pipelinePhase', 'agentRole', 'skillIds', 'title', 'taskType', 'description', 'dependsOn', 'inputArtifacts', 'outputArtifacts', 'dataPackBasis', 'expectedOutput'],
    requiredNodeOutputFields: ['summary', 'rows', 'pipelinePhase', 'agentRole', 'skillIds', 'inputArtifacts', 'outputArtifacts', 'agentTrace', 'userDeliverable', 'output', 'dataPackBasis', 'nextAction'],
    userDeliverableRule: `用户可见结果必须是当前 active data pack 对应 Agent 的交付物；本数据包允许/期望的 userDeliverable.kind 包括：${outputKinds.join(' / ') || 'active_pack_deliverable'}。Workflow JSON 和后台参数只能作为内部执行载体。`,
    strictValidationRule: '智能画布会校验 dynamicPlan.mode、每个 step 的 pipelinePhase/agentRole/skillIds/outputArtifacts/dataPackBasis，以及每个节点返回的 userDeliverable；缺失时直接失败，不允许 mock、seed 或固定链路兜底。agentRole 只要求来自 active data pack，不硬编码为漫剧角色。',
    extensionPolicy: '后续新增或后台更新 agent/data-pack 时，只要进入 active data pack 索引并符合只读扫描规则，即进入 workspaceDataPack；登记到 pack 的能力项会进入 selectedCapabilityItems 与 parsedReferences。'
  };
}

async function buildSmartCanvasRuntime(input = {}) {
  const taskType = String(input.taskType || 'creative_orchestration').trim() || 'creative_orchestration';
  const registry = await readDataPackRegistry();
  const activeDataPack = getActiveDataPackFromRegistry(registry, input.activeDataPackId || input.dataPackId);
  const contextPack = await buildTaskContextPack(taskType, activeDataPack);
  const referencesByKind = {};
  for (const reference of contextPack.parsedReferences ?? []) {
    const key = reference.sourceKind || 'unknown';
    referencesByKind[key] = [...(referencesByKind[key] ?? []), compactParsedReference(reference)];
  }

  return {
    version: '0.2.0',
    projectId: input.projectId ?? 'infinite-awakening-001',
    taskType,
    activeDataPack: {
      id: activeDataPack.id,
      title: activeDataPack.title,
      type: activeDataPack.type,
      source: activeDataPack.source,
      capabilities: {
        ...defaultDataPackCapabilities(activeDataPack.type || 'creative_automation'),
        ...normalizePlainObject(activeDataPack.capabilities, {})
      },
      metadata: {
        ...defaultDataPackMetadata(),
        ...normalizePlainObject(activeDataPack.metadata, {})
      },
      outputKinds: outputKindsForDataPack(activeDataPack),
      requiredOrder: requiredOrderForDataPack(activeDataPack)
    },
    mode: 'llm_dynamic_orchestration',
    generatedAt: new Date().toISOString(),
    scriptLength: String(input.scriptText ?? input.script ?? '').length,
    globalStyle: input.globalStyle ?? null,
    contextPack,
    referencesByKind,
    plannerContract: buildSmartCanvasPlannerContract(activeDataPack),
    dataPackDigest: {
      activeDataPackId: activeDataPack.id,
      activeDataPackTitle: activeDataPack.title,
      activeDataPackType: activeDataPack.type,
      outputKinds: outputKindsForDataPack(activeDataPack),
      requiredOrder: requiredOrderForDataPack(activeDataPack),
      methodologyPackId: contextPack.methodologyPackId,
      skillPackId: contextPack.skillPackId,
      templatePackId: contextPack.templatePackId,
      docs: contextPack.docs.length,
      agents: contextPack.agents.length,
      skills: contextPack.skills.length,
      templates: contextPack.templates.length,
      wordlists: contextPack.wordlists.length,
      workspaceDataPackRoots: contextPack.workspaceDataPack?.rootCount ?? 0,
      workspaceDataPackFiles: contextPack.workspaceDataPack?.fileCount ?? 0,
      workspaceDataPackParsedCandidates: contextPack.workspaceDataPack?.parsedCandidateCount ?? 0,
      parsedReferences: (contextPack.parsedReferences ?? []).length,
      missingReferences: (contextPack.referenceIssues ?? []).length
    }
  };
}

function createDraftNode(id, type, title, x, y, payload) {
  return {
    id,
    type,
    title,
    x,
    y,
    w: 320,
    h: 180,
    data: payload
  };
}

function createCanvasNode(id, type, x, y, values = {}, options = {}) {
  return {
    id,
    type,
    x,
    y,
    w: options.w,
    values,
    data: options.data ?? null,
    status: options.status ?? 'waiting',
    progress: options.progress ?? 0,
    error: options.error ?? ''
  };
}

function scorePromptArtifactPath(artifactPath, taskType) {
  const normalized = String(artifactPath || '').toLowerCase();
  const mode = inferCanvasWorkflowMode(taskType);
  let score = 0;

  if (!isTextArtifactPath(normalized)) return -100;
  if (normalized.includes('prompt') || normalized.includes('提示词')) score += 30;
  if (normalized.includes('asset-index') || normalized.includes('资产')) score += mode === 'asset_image_generation' ? 36 : 12;
  if (normalized.includes('seedance')) score += mode === 'seedance_video_generation' ? 40 : 12;
  if (normalized.includes('storyboard') || normalized.includes('分镜')) score += mode === 'storyboard_image_generation' ? 35 : 18;
  if (normalized.includes('fullref') || normalized.includes('reference')) score += 10;
  if (normalized.includes('ep001')) score += 8;
  if (normalized.startsWith('upstream/')) score += 3;
  if (normalized.endsWith('.json')) score -= 6;

  return score;
}

function inferReferenceRole(artifactPath) {
  const normalized = String(artifactPath || '').toLowerCase();
  if (normalized.includes('comic-panels') || normalized.includes('storyboard') || normalized.includes('故事板')) return 'storyboard';
  if (normalized.includes('characters') || normalized.includes('角色')) return 'character';
  if (normalized.includes('scenes') || normalized.includes('场景')) return 'scene';
  if (normalized.includes('props') || normalized.includes('道具')) return 'prop';
  if (normalized.includes('资产图') || normalized.includes('asset')) return 'asset';
  return 'reference';
}

function scoreReferenceImagePath(artifactPath, taskType, episodeId = 'ep001') {
  const normalized = String(artifactPath || '').toLowerCase();
  const expectedEpisode = episodeId.toLowerCase();
  const matchedEpisode = normalized.match(/ep\d+/)?.[0] ?? '';
  const mode = inferCanvasWorkflowMode(taskType);
  let score = 0;

  if (!isImageArtifactPath(normalized)) return -100;
  if (normalized.includes(expectedEpisode)) score += 40;
  if (matchedEpisode && matchedEpisode !== expectedEpisode) score -= 45;
  if (normalized.includes('comic-panels') || normalized.includes('storyboard')) score += mode === 'seedance_video_generation' ? 45 : 28;
  if (normalized.includes('资产图') || normalized.includes('asset')) score += mode === 'storyboard_image_generation' ? 42 : mode === 'asset_image_generation' ? 18 : 16;
  if (normalized.includes('characters') || normalized.includes('角色')) score += mode === 'asset_image_generation' ? 36 : 26;
  if (normalized.includes('scenes') || normalized.includes('场景')) score += mode === 'asset_image_generation' ? 30 : 20;
  if (normalized.includes('props') || normalized.includes('道具')) score += mode === 'asset_image_generation' ? 24 : 14;
  if (normalized.startsWith('upstream/06-generated/images')) score += 12;
  if (normalized.includes('readme')) score -= 30;

  return score;
}

async function collectCanvasPromptSources(artifactPaths, taskType) {
  const sorted = uniqueStrings(artifactPaths)
    .map((artifactPath) => ({ artifactPath, score: scorePromptArtifactPath(artifactPath, taskType) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const sources = [];

  for (const item of sorted) {
    try {
      const resolved = resolveReadableArtifactPath(item.artifactPath);
      if (!existsSync(resolved.absolutePath) || !isTextArtifactPath(resolved.normalized)) continue;
      const content = await readFile(resolved.absolutePath, 'utf8');
      sources.push({
        path: resolved.normalized,
        sourceKind: 'artifact',
        score: item.score,
        exists: true,
        excerpt: createExcerpt(content, 520),
        headings: extractMarkdownHeadings(content, 8),
        content
      });
    } catch (error) {
      sources.push({
        path: normalizeArtifactPathValue(item.artifactPath),
        sourceKind: 'artifact',
        score: item.score,
        exists: false,
        excerpt: '',
        headings: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return sources;
}

function buildCanvasReferenceImage(resolved) {
  const localUrl = buildRawArtifactUrl(resolved.normalized);

  return {
    name: path.basename(resolved.normalized),
    artifactPath: resolved.normalized,
    role: inferReferenceRole(resolved.normalized),
    url: localUrl,
    dataUrl: localUrl,
    localUrl,
    localPath: resolved.absolutePath,
    remoteUrl: '',
    uploaded: false,
    uploadMode: 'object_storage',
    storageProvider: 'local_artifact',
    saved: {
      filename: path.basename(resolved.normalized),
      path: resolved.absolutePath,
      localPath: resolved.absolutePath,
      localUrl,
      artifactPath: resolved.normalized
    }
  };
}

function sanitizeCanvasPromptSource(source) {
  const { content, ...rest } = source;
  return rest;
}

function isAssetImageTaskType(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  if (normalized.includes('storyboard')) return false;
  return normalized.includes('asset_image')
    || normalized.includes('asset_graph')
    || normalized.includes('character_asset')
    || normalized.includes('scene_asset')
    || normalized.includes('prop_asset')
    || normalized === 'assets'
    || normalized === 'asset_generation';
}

function isStoryboardImageTaskType(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  return normalized.includes('storyboard');
}

function isVideoGenerationTaskType(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  return normalized.includes('video') || normalized.includes('seedance') || normalized.includes('jimeng');
}

function getIndustrialPipelineStages() {
  return [
    {
      id: 'asset_images',
      taskType: 'asset_image_generation',
      title: '资产图生成',
      workflowMode: 'asset_image_generation',
      phaseGate: 'assets_to_storyboard',
      consumes: ['context_pack', 'asset_index', 'style_bible'],
      produces: ['asset_images', 'asset_index_update'],
      requiredInputArtifacts: ['01-资产图与提示词/asset-index.md'],
      outputArtifacts: ['01-资产图与提示词/资产图/**/*.png', '01-资产图与提示词/asset-index.md']
    },
    {
      id: 'storyboard_images',
      taskType: 'storyboard_image_generation',
      title: '基于资产图生成故事板',
      workflowMode: 'storyboard_image_generation',
      phaseGate: 'storyboard_to_generation',
      consumes: ['asset_images', 'storyboard_package', 'shot_prompts'],
      produces: ['storyboard_images'],
      requiredInputArtifacts: ['01-资产图与提示词/资产图/**/*.png', '01-资产图与提示词/asset-index.md', '04-storyboard/ep001-storyboard.md'],
      outputArtifacts: ['01-资产图与提示词/故事板/storyboard/**/*.png', '04-storyboard/**/storyboard-package.md']
    },
    {
      id: 'videos',
      taskType: 'video_generation',
      title: '基于故事板生成视频',
      workflowMode: 'seedance_video_generation',
      phaseGate: 'generation_to_review',
      consumes: ['storyboard_images', 'seedance_prompt'],
      produces: ['shot_videos'],
      requiredInputArtifacts: ['01-资产图与提示词/故事板/storyboard/**/*.png', '05-prompts/seedance/ep001-shots.md'],
      outputArtifacts: ['03-视频/**/*.mp4', '03-视频/**/*.mov', '05-prompts/**/video-prompt.md']
    },
    {
      id: 'edit',
      taskType: 'edit',
      title: '剪辑合成',
      workflowMode: 'video_editing',
      phaseGate: 'generation_to_review',
      consumes: ['shot_videos'],
      produces: ['review_cut'],
      requiredInputArtifacts: ['03-视频/**/*.mp4'],
      outputArtifacts: ['05-可选输出/审核剪辑发布/edit/**/*.mp4', '05-可选输出/审核剪辑发布/review/**/episode-review.md']
    },
    {
      id: 'qa',
      taskType: 'qa',
      title: 'QA 审核',
      workflowMode: 'context_pack_workflow',
      phaseGate: 'review_to_archive',
      consumes: ['review_cut', 'artifact_reviews'],
      produces: ['qa_review'],
      requiredInputArtifacts: ['05-可选输出/审核剪辑发布/review/**/episode-review.md'],
      outputArtifacts: ['05-可选输出/审核剪辑发布/review/**/review-report.md']
    },
    {
      id: 'release',
      taskType: 'release',
      title: '发布包',
      workflowMode: 'context_pack_workflow',
      phaseGate: 'release_to_publish',
      consumes: ['qa_review', 'release_review'],
      produces: ['release_package'],
      requiredInputArtifacts: ['05-可选输出/审核剪辑发布/review/**/review-report.md'],
      outputArtifacts: ['05-可选输出/审核剪辑发布/release/**/release-manifest.json']
    }
  ];
}

function inferIndustrialPipelineStage(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  const stages = getIndustrialPipelineStages();
  if (isAssetImageTaskType(normalized)) return stages[0];
  if (isStoryboardImageTaskType(normalized)) return stages[1];
  if (isVideoGenerationTaskType(normalized)) return stages[2];
  if (normalized.includes('edit') || normalized.includes('episode')) return stages[3];
  if (normalized.includes('qa') || normalized.includes('review')) return stages[4];
  if (normalized.includes('release')) return stages[5];
  return null;
}

function getPipelineStageInputHints(taskType) {
  return inferIndustrialPipelineStage(taskType)?.requiredInputArtifacts ?? [];
}

function getPipelineStageOutputArtifacts(taskType) {
  return inferIndustrialPipelineStage(taskType)?.outputArtifacts ?? [];
}

async function collectCanvasWorkflowSources(contextPack, taskPlan = null) {
  const scannedArtifacts = await scanProjectArtifacts();
  const taskType = taskPlan?.taskType ?? contextPack.taskType;
  const episodeId = taskPlan?.episodeId ?? 'ep001';
  const explicitInputArtifacts = new Set((taskPlan?.inputArtifacts ?? []).map(normalizeArtifactPathValue).filter(Boolean));
  const artifactCandidates = uniqueStrings([
    ...(taskPlan?.inputArtifacts ?? []),
    ...(contextPack.inputArtifacts ?? []),
    ...(contextPack.workflowHints ?? []),
    ...scannedArtifacts
  ]);
  const promptSources = await collectCanvasPromptSources(artifactCandidates, taskType);
  const referenceImages = [];
  const seenImages = new Set();
  const imageCandidates = artifactCandidates
    .map((artifactPath) => {
      const normalized = normalizeArtifactPathValue(artifactPath);
      const explicitBonus = explicitInputArtifacts.has(normalized) ? 120 : 0;
      return { artifactPath, score: scoreReferenceImagePath(artifactPath, taskType, episodeId) + explicitBonus };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);

  for (const item of imageCandidates) {
    try {
      const resolved = resolveReadableArtifactPath(item.artifactPath);
      if (!existsSync(resolved.absolutePath) || !isImageArtifactPath(resolved.normalized) || seenImages.has(resolved.normalized)) continue;
      seenImages.add(resolved.normalized);
      referenceImages.push(buildCanvasReferenceImage(resolved));
    } catch {
      // Reference images are optional; missing entries stay visible through artifact diagnostics.
    }
    if (referenceImages.length >= 8) break;
  }

  return {
    promptSources,
    referenceImages,
    outputArtifacts: taskPlan?.outputArtifacts ?? inferOutputArtifacts(taskType),
    episodeId
  };
}

function extractFirstSeedanceShotPrompt(content) {
  const text = String(content || '').trim();
  const match = text.match(/## Shot 1[\s\S]*?(?=\n---\n\n## Shot 2|\n## Shot 2|$)/);
  const shot = (match?.[0] ?? text).trim();
  return shot.length > 6000 ? `${shot.slice(0, 6000)}\n\n【截断说明】仅预装 Shot 1 前 6000 字；完整提示词见 05-prompts/seedance/ep001-shots.md。` : shot;
}

function buildStoryboardImagePrompt(contextPack, sourceBundle) {
  const storyboardSource = sourceBundle.promptSources.find((item) => item.path.includes('storyboard')) ?? null;
  const seedanceSource = sourceBundle.promptSources.find((item) => item.path.includes('seedance')) ?? null;
  const assetSource = sourceBundle.promptSources.find((item) => item.path.includes('asset') || item.path.includes('资产')) ?? null;
  const seedanceShot = seedanceSource?.content ? extractFirstSeedanceShotPrompt(seedanceSource.content) : '';
  const sourceLines = [
    storyboardSource ? `分镜来源：${storyboardSource.path}` : '分镜来源：04-storyboard/ep001-storyboard.md',
    seedanceSource ? `视频提示词母稿：${seedanceSource.path}` : '视频提示词母稿：05-prompts/seedance/ep001-shots.md',
    assetSource ? `资产约束：${assetSource.path}` : '资产约束：01-资产图与提示词/asset-index.md'
  ];

  return [
    '智能视界故事板图生成 Brief：按分镜顺序生成可进入视频生产的静态故事板图。',
    ...sourceLines,
    '生成要求：保持角色资产锚点、场景空间关系、镜头任务、第一读点、画幅比例和 HZW 子风格一致；输出可作为 Seedance / 即梦图生视频参考图。',
    seedanceShot ? `首镜提示词参考：\n${seedanceShot}` : '首镜提示词参考：请从长版提示词母稿中选择当前镜头并保持字段完整。'
  ].join('\n\n');
}

function buildAssetImagePrompt(contextPack, sourceBundle) {
  const assetSource = sourceBundle.promptSources.find((item) => item.path.includes('asset-index') || item.path.includes('资产')) ?? null;
  const styleSource = sourceBundle.promptSources.find((item) => item.path.includes('style') || item.path.includes('风格') || item.path.includes('hzw')) ?? null;
  const templateSources = contextPack.templates.slice(0, 3);

  return [
    '智能视界资产图生成 Brief：先生成角色、场景、道具资产图，作为后续故事板图和视频工作流的视觉锚点。',
    assetSource ? `资产索引 / 资产任务来源：${assetSource.path}` : '资产索引 / 资产任务来源：01-资产图与提示词/asset-index.md',
    styleSource ? `风格约束来源：${styleSource.path}` : '风格约束来源：docs/hzw-master-style-system.md / 项目风格包',
    templateSources.length ? `模板约束：${templateSources.join('；')}` : '模板约束：角色、场景、道具资产模板。',
    '生成要求：分开生成角色设定图、场景设定图、关键道具图；保持 HZW 子风格、轮廓识别度、材质关键词、色彩锚点和命名规则一致。',
    '输出要求：产物落入 01-资产图与提示词/资产图，并在回写后进入 asset_image_review；故事板阶段必须优先引用这些资产图。'
  ].join('\n\n');
}

async function buildAssetImageCanvas(contextPack, taskPlan = null, sourceBundle = null) {
  const sources = sourceBundle ?? await collectCanvasWorkflowSources(contextPack, taskPlan);
  const prompt = buildAssetImagePrompt(contextPack, sources);
  const referenceImages = sources.referenceImages.slice(0, 6);
  const episodeId = sources.episodeId ?? taskPlan?.episodeId ?? 'ep001';
  const assetOutputHints = sources.outputArtifacts.filter((artifact) => {
    const normalized = String(artifact).toLowerCase();
    return normalized.includes('资产图') || normalized.includes('asset-image') || normalized.includes('/assets/') || normalized.includes('asset_index');
  });
  const outputDirectoryHint = pickCanvasOutputDirectory(assetOutputHints, `01-资产图与提示词/资产图/${episodeId}`);
  const generationNodeType = referenceImages.length ? 'img2imgAll' : 'txt2img';
  const generationValues = generationNodeType === 'img2imgAll'
    ? {
      images: referenceImages,
      chips: referenceImages.map((image, index) => ({ id: `${image.role}-${index + 1}`, type: 'image', imgIdx: String(index), label: image.role })),
      i2iDraft: prompt,
      _modelIdx: '0',
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      background: 'auto',
      outputFormat: 'png',
      strength: '0.55',
      n: '1',
      outputDirectoryHint
    }
    : {
      _modelIdx: '0',
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      background: 'auto',
      outputFormat: 'png',
      n: '1',
      positive: prompt,
      outputDirectoryHint
    };

  return {
    nodes: [
      createCanvasNode('n1', 'stylePreset', -460, 0, {
        activePreset: [
          '任务：EP001 资产图生成。',
          `提示词来源：${sources.promptSources.slice(0, 3).map((item) => item.path).join('；') || '资产上下文包'}`,
          `参考图：${referenceImages.length ? referenceImages.map((item) => `${item.role}:${item.artifactPath}`).join('；') : '未发现可预填参考图，按资产 Brief 文生图'}`,
          `输出目录：${outputDirectoryHint}`,
          '下游：资产图审核完成后进入故事板图 Workflow。'
        ].join('\n'),
        selectedTags: ['asset-image', 'character', 'scene', 'prop', 'style-lock']
      }, { w: 380 }),
      createCanvasNode('n2', generationNodeType, 0, 0, generationValues, { w: generationNodeType === 'img2imgAll' ? 700 : 520 }),
      createCanvasNode('n3', 'singleImage', 780, 0, {
        images: [],
        outputArtifactHint: `${outputDirectoryHint}/${episodeId}-asset-sheet-01.png`
      }, { w: 380 })
    ],
    conns: [
      { from: 'n1', fromPort: 'prompt', to: 'n2', toPort: 'style', kind: 'prompt' },
      { from: 'n2', fromPort: 'image', to: 'n3', toPort: 'image', kind: 'image' }
    ],
    view: { x: 0, y: 0, k: 0.82 },
    next: 4,
    muted: []
  };
}

async function buildVideoGenerationCanvas(contextPack, taskPlan = null, sourceBundle = null) {
  const sources = sourceBundle ?? await collectCanvasWorkflowSources(contextPack, taskPlan);
  const promptSource = sources.promptSources.find((item) => item.path.includes('05-prompts/seedance') && item.path.includes('shots')) ?? sources.promptSources.find((item) => item.path.includes('seedance')) ?? sources.promptSources[0];
  const promptPath = promptSource?.path ?? 'upstream/05-prompts/seedance/ep001-shots.md';
  const promptContent = promptSource?.content ?? '';
  const seedancePrompt = extractFirstSeedanceShotPrompt(promptContent) || '请先读取 05-prompts/seedance/ep001-shots.md，选择单个 Shot 的长版提示词后执行视频生成。';
  const referenceImages = sources.referenceImages.slice(0, 6);
  const episodeId = sources.episodeId ?? taskPlan?.episodeId ?? 'ep001';
  const outputArtifactHint = pickConcreteOutputArtifact(
    sources.outputArtifacts.filter((artifact) => String(artifact).includes('03-视频/')),
    `03-视频/${episodeId}-shot01.mp4`
  );
  const stylePreset = [
    '任务：EP001 单镜视频生成闭环验证。',
    `上游故事板：${contextPack.inputArtifacts.find((artifact) => artifact.includes('04-storyboard/ep001-storyboard.md')) ?? 'upstream/04-storyboard/ep001-storyboard.md'}`,
    `Seedance 长版提示词：${promptPath}`,
    `参考图：${referenceImages.length ? referenceImages.map((item) => `${item.role}:${item.artifactPath}`).join('；') : '未发现可预填参考图，画布中可继续上传'}`,
    `输出登记目标：${outputArtifactHint}（相对于 smart-vision/outputs）`,
    '门禁：生成后必须回填 outputArtifacts，并进入 video_review 审核。'
  ].join('\n');

  const nodes = [
    createCanvasNode('n1', 'stylePreset', -520, 0, { activePreset: stylePreset, selectedTags: [] }, { w: 360 }),
    createCanvasNode('n2', 'seedanceVideo', 0, 0, {
      images: referenceImages,
      refVideo: null,
      refAudio: null,
      refMode: referenceImages.length ? 'image2video' : 'text2video',
      resolution: '720p',
      _modelIdx: '0',
      duration: '5',
      quality: '720p',
      aspectRatio: '9:16',
      generateAudio: true,
      positive: seedancePrompt,
      vn2Chips: [],
      vn2Draft: seedancePrompt,
      smartFrameMotion: '',
      smartFrameMotions: {},
      smartFrameMotionSeconds: {},
      smartFrameMotionActive: null,
      smartFrameMotionOpen: false,
      lastOutputArtifactHint: outputArtifactHint
    }, { w: 640 }),
    createCanvasNode('n3', 'singleVideo', 780, 0, {
      videoUrl: '',
      videoDataUrl: '',
      duration: 0,
      name: path.basename(outputArtifactHint.replace(/\*\*/g, 'ep001-shot01').replace(/\*/g, 'shot01')) || 'ep001-shot01.mp4',
      width: 0,
      height: 0,
      ratio: '9:16',
      thumbnails: [],
      outputArtifactHint
    }, { w: 380 }),
    createCanvasNode('n4', 'videoEditor', 1240, 0, {
      clips: [],
      audioClips: [],
      subtitles: [],
      canvasRatio: '9:16',
      brightness: 0,
      contrast: 0,
      saturation: 0,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
      videoVolume: 1,
      musicVolume: 0.5,
      exportResolution: '1080x1920',
      exportFps: '30',
      selectedClipId: null,
      selectedAudioId: null,
      selectedSubtitleId: null,
      playheadTime: 0,
      zoomLevel: 1,
      history: [],
      historyIndex: -1,
      outputArtifactHint: '05-可选输出/审核剪辑发布/edit/ep001/ep001-review-cut.mp4'
    }, { w: 720 })
  ];

  return {
    nodes,
    conns: [
      { from: 'n1', fromPort: 'prompt', to: 'n2', toPort: 'style', kind: 'prompt' },
      { from: 'n2', fromPort: 'video', to: 'n3', toPort: 'video', kind: 'video' },
      { from: 'n3', fromPort: 'video', to: 'n4', toPort: 'video', kind: 'video' }
    ],
    view: { x: 0, y: 0, k: 0.72 },
    next: 5,
    muted: []
  };
}

async function buildStoryboardImageCanvas(contextPack, taskPlan = null, sourceBundle = null) {
  const sources = sourceBundle ?? await collectCanvasWorkflowSources(contextPack, taskPlan);
  const prompt = buildStoryboardImagePrompt(contextPack, sources);
  const referenceImages = sources.referenceImages.slice(0, 8);
  const episodeId = sources.episodeId ?? taskPlan?.episodeId ?? 'ep001';
  const outputDirectoryHint = pickCanvasOutputDirectory(
    sources.outputArtifacts.filter((artifact) => String(artifact).includes('01-资产图与提示词')),
    `01-资产图与提示词/故事板/storyboard/${episodeId}`
  );
  const generationNodeType = referenceImages.length ? 'img2imgAll' : 'txt2img';
  const generationValues = generationNodeType === 'img2imgAll'
    ? {
      images: referenceImages,
      chips: referenceImages.map((image, index) => ({ id: `${image.role}-${index + 1}`, type: 'image', imgIdx: String(index), label: image.role })),
      i2iDraft: prompt,
      _modelIdx: '0',
      size: '9:16',
      resolution: '1k',
      quality: 'high',
      background: 'auto',
      outputFormat: 'png',
      strength: '0.65',
      n: '1',
      outputDirectoryHint
    }
    : {
      _modelIdx: '0',
      size: '9:16',
      resolution: '1k',
      quality: 'high',
      background: 'auto',
      outputFormat: 'png',
      n: '1',
      positive: prompt,
      outputDirectoryHint
    };

  return {
    nodes: [
      createCanvasNode('n1', 'stylePreset', -460, 0, {
        activePreset: [
          '任务：EP001 故事板图生成。',
          `提示词来源：${sources.promptSources.slice(0, 3).map((item) => item.path).join('；') || '上下文包'}`,
          `参考图：${referenceImages.length ? referenceImages.map((item) => `${item.role}:${item.artifactPath}`).join('；') : '未发现可预填参考图'}`,
          `输出目录：${outputDirectoryHint}`
        ].join('\n'),
        selectedTags: ['storyboard', 'reference-lock']
      }, { w: 360 }),
      createCanvasNode('n2', generationNodeType, 0, 0, generationValues, { w: generationNodeType === 'img2imgAll' ? 700 : 520 }),
      createCanvasNode('n3', 'singleImage', 780, 0, {
        images: [],
        outputArtifactHint: `${outputDirectoryHint}/${episodeId}-storyboard-shot-01.png`
      }, { w: 380 })
    ],
    conns: [
      { from: 'n1', fromPort: 'prompt', to: 'n2', toPort: 'style', kind: 'prompt' },
      { from: 'n2', fromPort: 'image', to: 'n3', toPort: 'image', kind: 'image' }
    ],
    view: { x: 0, y: 0, k: 0.82 },
    next: 4,
    muted: []
  };
}

function resolvePhaseGateForTask(taskType = 'storyboard', phase) {
  const normalized = String(taskType || 'storyboard').trim().toLowerCase();
  const explicitPhase = String(phase || '').trim();
  const pipelineStage = inferIndustrialPipelineStage(normalized);

  if (explicitPhase) return explicitPhase;
  if (pipelineStage?.phaseGate) return pipelineStage.phaseGate;
  if (isAssetImageTaskType(normalized)) return 'assets_to_storyboard';
  if (isStoryboardImageTaskType(normalized)) return 'storyboard_to_generation';
  if (isVideoGenerationTaskType(normalized)) return 'generation_to_review';
  if (normalized.includes('review') || normalized.includes('qa')) return 'review_to_archive';
  return 'project_runtime_gate';
}

async function resolveRequiredMethodologyPack(taskType = 'storyboard') {
  const contextPack = await buildTaskContextPack(taskType);

  return {
    contextPack,
    requiredDocs: contextPack.docs,
    requiredSkills: contextPack.skills,
    requiredAgents: contextPack.agents,
    requiredTemplates: contextPack.templates,
    phaseGateItems: contextPack.phaseGateItems,
    redlines: contextPack.redlines
  };
}

function inferOutputArtifacts(taskType = 'storyboard') {
  const normalized = String(taskType || 'storyboard').trim().toLowerCase();
  const pipelineOutputs = getPipelineStageOutputArtifacts(normalized);

  if (pipelineOutputs.length > 0) return pipelineOutputs;
  if (isAssetImageTaskType(normalized)) return ['01-资产图与提示词/资产图/**/*.png', '01-资产图与提示词/asset-index.md'];
  if (isStoryboardImageTaskType(normalized)) return ['01-资产图与提示词/故事板/storyboard/**/*.png', '04-storyboard/**/storyboard-package.md'];
  if (isVideoGenerationTaskType(normalized)) return ['03-视频/**/*.mp4', '03-视频/**/*.mov', '05-prompts/**/video-prompt.md'];
  if (normalized.includes('edit') || normalized.includes('episode')) return ['05-可选输出/审核剪辑发布/edit/**/*.mp4', '05-可选输出/审核剪辑发布/review/**/episode-review.md'];
  if (normalized.includes('review') || normalized.includes('qa')) return ['05-可选输出/审核剪辑发布/review/**/review-report.md'];
  return ['02-工作流/**/runtime-output.json'];
}

function pickConcreteOutputArtifact(outputArtifacts = [], fallback) {
  const concrete = (outputArtifacts ?? []).find((artifact) => isConcreteArtifactPath(artifact));
  return normalizeArtifactPathValue(concrete || fallback);
}

function pickCanvasOutputDirectory(outputArtifacts = [], fallback) {
  const concrete = (outputArtifacts ?? []).find((artifact) => isConcreteArtifactPath(artifact));
  if (concrete) return path.posix.dirname(normalizeArtifactPathValue(concrete));
  return normalizeArtifactPathValue(fallback).replace(/\/+$/, '');
}

function inferAgentRole(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  if (normalized.includes('review') || normalized.includes('qa') || normalized.includes('release')) return 'Reviewer';
  if (normalized.includes('storyboard')) return 'Storyboard Artist';
  if (normalized.includes('asset') || normalized.includes('character') || normalized.includes('scene') || normalized.includes('prop')) return 'Studio';
  if (normalized.includes('video') || normalized.includes('seedance') || normalized.includes('jimeng')) return 'Generation Operator';
  if (normalized.includes('edit') || normalized.includes('episode')) return 'Editor';
  return 'Producer';
}

function inferCanvasWorkflowMode(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  if (isAssetImageTaskType(normalized)) return 'asset_image_generation';
  if (isVideoGenerationTaskType(normalized)) return 'seedance_video_generation';
  if (isStoryboardImageTaskType(normalized)) return 'storyboard_image_generation';
  if (normalized.includes('edit') || normalized.includes('episode')) return 'video_editing';
  return 'context_pack_workflow';
}

function taskUsesExecutableCanvasWorkflow(taskType) {
  return inferCanvasWorkflowMode(taskType) !== 'context_pack_workflow';
}

function buildCanvasExecutionStrategy(taskType, inputStrategy = {}) {
  const normalizedMode = String(inputStrategy.mode || 'operator_controlled').trim() || 'operator_controlled';
  const workflowMode = inferCanvasWorkflowMode(taskType);
  const stage = inferIndustrialPipelineStage(taskType);

  return {
    mode: normalizedMode,
    carrier: 'workflow_json',
    executor: 'infinite_canvas',
    workflowMode,
    pipelineStage: stage?.id ?? 'ad_hoc',
    pipelineTaskType: stage?.taskType ?? String(taskType || 'storyboard'),
    consumes: stage?.consumes ?? [],
    produces: stage?.produces ?? [],
    directModelExecution: false,
    modelInvocation: 'never_direct_from_smart_vision',
    defaultAction: 'open_canvas_for_review',
    allowedActions: [
      'generate_workflow_json',
      'open_canvas',
      'edit_workflow',
      'manual_run_in_canvas',
      'register_canvas_output'
    ],
    gates: [
      'workflow_json_generated',
      'prompts_filled',
      'reference_images_filled',
      'output_paths_filled',
      'operator_or_strategy_approval_before_run'
    ],
    note: 'Smart Vision 只生成并调度无限画布 Workflow JSON；模型执行只能由画布工作流按策略承载。'
  };
}

function describeCanvasWorkflowSubtask(taskType) {
  if (isAssetImageTaskType(taskType)) {
    return {
      compileTitle: '生成资产图 Workflow',
      produceTitle: '按策略运行资产图 Workflow 并回收资产图',
      outputHint: '02-工作流/{episodeId}/asset-image-generation.mjb-workflow.json',
      acceptance: [
        '资产图 Workflow 必须优先填充角色、场景、道具资产提示词和输出目录。',
        '资产图产物必须能登记为 asset_image_review，并作为故事板图的视觉锚点。'
      ]
    };
  }

  if (isStoryboardImageTaskType(taskType)) {
    return {
      compileTitle: '基于资产图生成故事板 Workflow',
      produceTitle: '按资产图约束运行故事板 Workflow 并回收故事板图',
      outputHint: '02-工作流/{episodeId}/storyboard-image-generation.mjb-workflow.json',
      acceptance: [
        '故事板 Workflow 必须引用资产图 / asset-index 作为角色、场景、道具一致性约束。',
        '故事板图产物必须能作为视频 Workflow 的主要视觉参考图。'
      ]
    };
  }

  if (isVideoGenerationTaskType(taskType)) {
    return {
      compileTitle: '基于故事板生成视频 Workflow',
      produceTitle: '按故事板参考运行视频 Workflow 并回收视频',
      outputHint: '02-工作流/{episodeId}/video-generation.mjb-workflow.json',
      acceptance: [
        '视频 Workflow 必须引用故事板图作为主要视觉参考，并填充对应镜头长版提示词。',
        '视频产物必须进入 video_review，并保留故事板图、提示词和输出路径追溯关系。'
      ]
    };
  }

  return {
    compileTitle: '生成无限画布 Workflow',
    produceTitle: '按策略运行无限画布 Workflow 并回收产物',
    outputHint: '02-工作流/{episodeId}/auto-generated.mjb-workflow.json',
    acceptance: []
  };
}

function isBlockingReferenceIssue(issue = {}) {
  const text = `${issue.path ?? ''} ${issue.error ?? ''}`.toLowerCase();
  return /(^|\/)__missing|missing|not found|unavailable|enoent|不存在|缺失/.test(text);
}

function createTaskPlanSubtasks(taskType, contextPack, outputArtifacts) {
  const normalized = String(taskType || '').toLowerCase();
  const usesCanvasWorkflow = taskUsesExecutableCanvasWorkflow(taskType);
  const canvasSubtask = describeCanvasWorkflowSubtask(taskType);
  const pipelineInputHints = getPipelineStageInputHints(taskType);
  const referenceInputs = [
    ...contextPack.docs.slice(0, 3),
    ...contextPack.skills.slice(0, 2),
    ...contextPack.templates.slice(0, 2)
  ];
  const artifactInputs = uniqueStrings([
    ...pipelineInputHints,
    ...contextPack.inputArtifacts
  ]).slice(0, 8);
  const base = [
    {
      id: 'load-data-pack',
      title: '加载并校验任务数据包',
      ownerRole: 'Orchestrator',
      dependsOn: [],
      inputArtifacts: referenceInputs,
      outputArtifacts: ['任务数据包解析摘要'],
      acceptanceCriteria: [
        '所有必需 docs / skills / templates 均已解析或显式列出缺失项。',
        '任务输入产物来自 .smart-vision 状态源或扫描产物索引。'
      ],
      status: (contextPack.referenceIssues ?? []).some(isBlockingReferenceIssue) ? 'blocked' : 'todo'
    },
    {
      id: 'assemble-task-brief',
      title: '组装任务执行 Brief',
      ownerRole: inferAgentRole(taskType),
      dependsOn: ['load-data-pack'],
      inputArtifacts: [...referenceInputs, ...artifactInputs],
      outputArtifacts: ['任务 Brief', '输入产物清单'],
      acceptanceCriteria: [
        'Brief 明确任务边界、输入、输出、红线和门禁。',
        'Brief 中每条要求可追溯到数据包引用或项目产物。'
      ],
      status: 'todo'
    }
  ];

  if (usesCanvasWorkflow) {
    base.push({
      id: 'compile-canvas-workflow',
      title: canvasSubtask.compileTitle,
      ownerRole: 'Workflow Builder',
      dependsOn: ['assemble-task-brief'],
      inputArtifacts: [...referenceInputs, ...artifactInputs],
      outputArtifacts: [canvasSubtask.outputHint],
      acceptanceCriteria: [
        'Workflow JSON 已填充任务提示词、参考图、本地素材路径和输出路径提示。',
        'Workflow JSON 提供 editUrl / runUrl，可在无限画布导入渲染后继续人工编辑或由用户手动执行。',
        ...canvasSubtask.acceptance
      ],
      status: 'todo'
    });
  }

  base.push(
    {
      id: 'produce-runtime-output',
      title: usesCanvasWorkflow ? canvasSubtask.produceTitle : '生成运行产物',
      ownerRole: inferAgentRole(taskType),
      dependsOn: [usesCanvasWorkflow ? 'compile-canvas-workflow' : 'assemble-task-brief'],
      inputArtifacts: artifactInputs,
      outputArtifacts,
      acceptanceCriteria: [
        '产物路径符合 smart-vision/outputs 目录约定。',
        '产物可被 Artifact Registry 或 Workflow Registry 登记。',
        ...(usesCanvasWorkflow ? ['运行入口来自无限画布 Workflow，由策略决定是否执行；平台侧不直接调用模型。', ...canvasSubtask.acceptance] : [])
      ],
      status: 'todo'
    },
    {
      id: 'register-and-review',
      title: '登记产物并进入审核',
      ownerRole: 'Runtime',
      dependsOn: ['produce-runtime-output'],
      inputArtifacts: outputArtifacts,
      outputArtifacts: ['review-ledger 记录', 'progress-ledger 更新'],
      acceptanceCriteria: [
        '产物已登记到对应 registry。',
        '需要人工审核的任务已创建 waiting_review 记录。'
      ],
      status: 'todo'
    }
  );

  if (normalized.includes('qa') || normalized.includes('release')) {
    base.push({
      id: 'release-gate-evaluation',
      title: '评估发布门禁',
      ownerRole: 'Release Manager',
      dependsOn: ['register-and-review'],
      inputArtifacts: outputArtifacts,
      outputArtifacts: ['release publishGate 诊断结果'],
      acceptanceCriteria: [
        'QA review done、Release review done、manifest 存在、artifact 文件存在。',
        '未通过门禁时输出明确阻塞原因。'
      ],
      status: 'todo'
    });
  }

  if (normalized.includes('video') || normalized.includes('edit')) {
    base.push({
      id: 'media-quality-pass',
      title: '媒体质量检查',
      ownerRole: 'Reviewer',
      dependsOn: ['produce-runtime-output'],
      inputArtifacts: outputArtifacts,
      outputArtifacts: ['媒体质量审核记录'],
      acceptanceCriteria: [
        '视频文件路径可读取。',
        '生成参数、镜头来源和审核结论可追溯。'
      ],
      status: 'todo'
    });
  }

  return base;
}

async function createWorkflowTaskPlan(input = {}) {
  const taskType = String(input.taskType || input.phase || 'storyboard').trim() || 'storyboard';
  const projectId = input.projectId ?? 'infinite-awakening-001';
  const phaseGate = resolvePhaseGateForTask(taskType, input.phaseGate);
  const pipelineStage = inferIndustrialPipelineStage(taskType);
  const pack = await resolveRequiredMethodologyPack(taskType);
  const slug = slugifyTaskType(`${projectId}-${taskType}`);
  const now = new Date().toISOString();
  const outputArtifacts = Array.isArray(input.outputArtifacts) ? input.outputArtifacts : inferOutputArtifacts(taskType);
  const inputArtifacts = uniqueStrings([
    ...(pipelineStage?.requiredInputArtifacts ?? []),
    ...(Array.isArray(input.inputArtifacts) ? input.inputArtifacts : []),
    ...(pack.contextPack.inputArtifacts ?? [])
  ]);
  const contextPackForSubtasks = { ...pack.contextPack, inputArtifacts };
  const subtasks = createTaskPlanSubtasks(taskType, contextPackForSubtasks, outputArtifacts);

  return {
    taskId: input.taskId ?? `sv-task-${slug}-${Date.now()}`,
    projectId,
    episodeId: input.episodeId ?? 'ep001',
    title: input.title ?? `${taskType} Smart Vision 任务计划`,
    taskType,
    phase: input.phase ?? phaseGate,
    agentRole: input.agentRole ?? inferAgentRole(taskType),
    requiredDocs: pack.requiredDocs,
    requiredSkills: pack.requiredSkills,
    requiredAgents: pack.requiredAgents,
    requiredTemplates: pack.requiredTemplates,
    inputArtifacts,
    outputArtifacts,
    canvasWorkflowRequired: input.canvasWorkflowRequired ?? true,
    canvasAdapter: {
      executor: 'infinite_canvas',
      workflowMode: inferCanvasWorkflowMode(taskType),
      source: 'smart-vision-canvas-workflow-adapter',
      executionCarrier: 'workflow_json',
      directModelExecution: false,
      strategy: buildCanvasExecutionStrategy(taskType, input.executionStrategy),
      required: input.canvasWorkflowRequired ?? true
    },
    humanReviewRequired: input.humanReviewRequired ?? true,
    phaseGate,
    productionPipeline: {
      canonicalSequence: getIndustrialPipelineStages().map((stage) => stage.taskType),
      currentStage: pipelineStage?.id ?? 'ad_hoc',
      currentTaskType: pipelineStage?.taskType ?? taskType,
      previousTaskType: getPreviousIndustrialPipelineTaskType(taskType),
      nextTaskType: getNextWorkflowTaskType(taskType),
      requiredInputs: pipelineStage?.requiredInputArtifacts ?? [],
      produces: pipelineStage?.produces ?? []
    },
    phaseGateItems: pack.phaseGateItems,
    redlines: pack.redlines,
    memoryPolicy: pack.contextPack.memoryPolicy,
    dataPackSummary: pack.contextPack.dataPackSummary,
    referenceIssues: pack.contextPack.referenceIssues,
    subtasks,
    orchestration: {
      executionOrder: subtasks.map((item) => item.id),
      dependencyCount: subtasks.reduce((count, item) => count + item.dependsOn.length, 0),
      blocked: subtasks.some((item) => item.status === 'blocked'),
      reviewRequired: input.humanReviewRequired ?? true,
      generatedFrom: {
        docs: pack.requiredDocs,
        skills: pack.requiredSkills,
        templates: pack.requiredTemplates
      }
    },
    generatedAt: now
  };
}

async function createIndustrialProductionPipelinePlan(input = {}) {
  const projectId = input.projectId ?? 'infinite-awakening-001';
  const episodeId = input.episodeId ?? 'ep001';
  const baseTaskId = input.taskId ?? `sv-industrial-pipeline-${episodeId}-${Date.now()}`;
  const stages = getIndustrialPipelineStages();
  const taskPlans = [];
  let upstreamOutputArtifacts = [];

  for (const stage of stages) {
    const taskPlan = await createWorkflowTaskPlan({
      ...input,
      projectId,
      episodeId,
      taskId: `${baseTaskId}-${stage.id}`,
      taskType: stage.taskType,
      phaseGate: stage.phaseGate,
      title: `${stage.title} Smart Vision 任务计划`,
      inputArtifacts: uniqueStrings([
        ...(Array.isArray(input.inputArtifacts) ? input.inputArtifacts : []),
        ...(stage.requiredInputArtifacts ?? []),
        ...upstreamOutputArtifacts
      ]),
      outputArtifacts: stage.outputArtifacts
    });

    taskPlans.push({
      ...taskPlan,
      productionPipeline: {
        ...(taskPlan.productionPipeline ?? {}),
        stageId: stage.id,
        stageTitle: stage.title,
        consumes: stage.consumes,
        produces: stage.produces
      }
    });
    upstreamOutputArtifacts = stage.outputArtifacts;
  }

  return {
    pipelineId: baseTaskId,
    projectId,
    episodeId,
    title: `${episodeId} 工业自动生产流水线`,
    canonicalSequence: stages.map((stage) => stage.taskType),
    stages: stages.map((stage, index) => ({
      id: stage.id,
      taskType: stage.taskType,
      title: stage.title,
      workflowMode: stage.workflowMode,
      phaseGate: stage.phaseGate,
      previousTaskType: index > 0 ? stages[index - 1].taskType : null,
      nextTaskType: index < stages.length - 1 ? stages[index + 1].taskType : null,
      consumes: stage.consumes,
      produces: stage.produces,
      requiredInputArtifacts: stage.requiredInputArtifacts,
      outputArtifacts: stage.outputArtifacts
    })),
    taskPlans,
    orchestration: {
      executionOrder: taskPlans.map((plan) => plan.taskId),
      dependencyEdges: taskPlans.slice(1).map((plan, index) => ({
        from: taskPlans[index].taskId,
        to: plan.taskId
      })),
      rule: '资产图生成完成并通过审核后才能进入故事板；故事板图完成并通过审核后才能进入视频；视频产物完成后再进入剪辑、QA 与 Release。'
    },
    generatedAt: new Date().toISOString()
  };
}

function getPipelineRunLedgerFallback(projectId = 'infinite-awakening-001') {
  return {
    version: '0.1.0',
    projectId,
    runs: [],
    events: [],
    updatedAt: null
  };
}

async function readPipelineRunLedger() {
  return readJson(path.join(smartVisionRoot, 'pipeline-run-ledger.json'), getPipelineRunLedgerFallback());
}

async function writePipelineRunLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await writeJson(path.join(smartVisionRoot, 'pipeline-run-ledger.json'), ledger);
}

function getCanvasRunLedgerFallback(projectId = 'infinite-awakening-001') {
  return {
    version: '0.1.0',
    projectId,
    sessions: [],
    events: [],
    updatedAt: null
  };
}

async function readCanvasRunLedger(projectId = 'infinite-awakening-001') {
  const ledger = await readJson(path.join(smartVisionRoot, 'canvas-run-ledger.json'), getCanvasRunLedgerFallback(projectId));
  return {
    ...getCanvasRunLedgerFallback(projectId),
    ...ledger,
    sessions: Array.isArray(ledger.sessions) ? ledger.sessions : [],
    events: Array.isArray(ledger.events) ? ledger.events : []
  };
}

async function writeCanvasRunLedger(ledger) {
  ledger.updatedAt = new Date().toISOString();
  await writeJson(path.join(smartVisionRoot, 'canvas-run-ledger.json'), ledger);
}

function appendPipelineRunEvent(ledger, run, event) {
  const entry = {
    id: event.id ?? `pipeline-event-${run.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    pipelineRunId: run.id,
    at: event.at ?? new Date().toISOString(),
    ...event
  };
  run.events = [...(run.events ?? []), entry].slice(-200);
  ledger.events = [...(ledger.events ?? []), entry].slice(-500);
  return entry;
}

function buildPipelineRunStage(stage, index, taskPlan = null, now = new Date().toISOString()) {
  return {
    id: stage.id,
    index,
    taskType: stage.taskType,
    title: stage.title,
    workflowMode: stage.workflowMode,
    phaseGate: stage.phaseGate,
    previousStageId: index > 0 ? null : null,
    nextStageId: null,
    taskPlanId: taskPlan?.taskId ?? null,
    status: index === 0 ? 'queued' : 'blocked',
    blockers: index === 0 ? [] : [{ code: 'previous_stage_not_done', message: '上游阶段尚未完成。' }],
    workflowId: null,
    workflowPath: null,
    artifactPaths: [],
    reviewIds: [],
    requiredInputArtifacts: stage.requiredInputArtifacts ?? [],
    outputArtifacts: stage.outputArtifacts ?? [],
    gate: {
      status: index === 0 ? 'pending' : 'blocked',
      blockers: index === 0 ? [] : [{ code: 'previous_stage_not_done', message: '上游阶段尚未完成。' }]
    },
    createdAt: now,
    updatedAt: now
  };
}

function buildPipelineRunFromPlan(pipelinePlan, now = new Date().toISOString()) {
  const stages = pipelinePlan.stages.map((stage, index) => buildPipelineRunStage(stage, index, pipelinePlan.taskPlans?.[index], now));

  for (let index = 0; index < stages.length; index += 1) {
    stages[index].previousStageId = index > 0 ? stages[index - 1].id : null;
    stages[index].nextStageId = index < stages.length - 1 ? stages[index + 1].id : null;
  }

  return {
    id: `pipeline-run-${pipelinePlan.episodeId}-${Date.now()}`,
    pipelinePlanId: pipelinePlan.pipelineId,
    projectId: pipelinePlan.projectId,
    episodeId: pipelinePlan.episodeId,
    title: pipelinePlan.title,
    status: 'queued',
    currentStageId: stages[0]?.id ?? null,
    canonicalSequence: pipelinePlan.canonicalSequence,
    stages,
    orchestration: pipelinePlan.orchestration,
    events: [],
    createdAt: now,
    updatedAt: now
  };
}

function getPipelineStageReviewTypes(taskType) {
  const normalized = String(taskType || '').toLowerCase();
  if (isAssetImageTaskType(normalized)) return ['asset_image_review'];
  if (isStoryboardImageTaskType(normalized)) return ['storyboard_image_review'];
  if (isVideoGenerationTaskType(normalized)) return ['video_review'];
  if (normalized.includes('edit') || normalized.includes('episode')) return ['episode_review', 'video_review'];
  if (normalized.includes('qa') || normalized.includes('review')) return ['qa_review'];
  if (normalized.includes('release')) return ['release_package_review'];
  return ['artifact_review', 'workflow_review'];
}

function reviewMatchesPipelineStage(review, stage) {
  if (!review || !stage) return false;
  if (stage.workflowId && review.workflowId === stage.workflowId) return true;
  if (review.id && (stage.reviewIds ?? []).includes(review.id)) return true;
  if (review.artifactPath && (stage.artifactPaths ?? []).includes(review.artifactPath)) return true;
  return false;
}

function isReviewTypeAcceptedForPipelineStage(reviewType, stage) {
  return getPipelineStageReviewTypes(stage.taskType).includes(String(reviewType || ''));
}

function evaluatePipelineStageGate(stage, reviews = []) {
  const acceptedReviewTypes = getPipelineStageReviewTypes(stage.taskType);
  const stageReviews = reviews.filter((review) => reviewMatchesPipelineStage(review, stage) || (stage.workflowId && review.workflowId === stage.workflowId));
  const acceptedReviews = stageReviews.filter((review) => acceptedReviewTypes.includes(review.type));
  const doneReview = acceptedReviews.find((review) => review.status === 'done');
  const blockedReview = acceptedReviews.find((review) => review.status === 'blocked');
  const blockers = [];

  if (!stage.workflowId) blockers.push({ code: 'stage_workflow_missing', message: '阶段 Workflow 尚未生成。' });
  if ((stage.artifactPaths ?? []).length === 0) blockers.push({ code: 'stage_artifact_missing', message: '阶段产物尚未回写。' });
  if (acceptedReviews.length === 0) blockers.push({ code: 'stage_review_missing', message: `缺少阶段审核：${acceptedReviewTypes.join(' / ')}。` });
  if (acceptedReviews.length > 0 && !doneReview) blockers.push({ code: 'stage_review_not_done', message: '阶段审核尚未完成。' });
  if (blockedReview) blockers.push({ code: 'stage_review_blocked', message: '阶段审核被阻塞。', reviewId: blockedReview.id });

  return {
    passed: blockers.length === 0,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    acceptedReviewTypes,
    reviewIds: acceptedReviews.map((review) => review.id),
    blockers
  };
}

async function preparePipelineStageWorkflow(run, stage, options = {}) {
  const now = new Date().toISOString();

  if (stage.workflowId && stage.workflowPath) {
    return { prepared: false, workflow: { id: stage.workflowId, path: stage.workflowPath }, workflowDraft: null };
  }

  const taskPlan = await createWorkflowTaskPlan({
    taskType: stage.taskType,
    taskId: stage.taskPlanId ?? `${run.id}-${stage.id}`,
    episodeId: run.episodeId,
    title: `${stage.title} Smart Vision 任务计划`,
    outputArtifacts: stage.outputArtifacts,
    inputArtifacts: stage.requiredInputArtifacts
  });

  if (options.dryRun) {
    const workflowDraft = await buildWorkflowDraft(stage.taskType, taskPlan);
    stage.workflowId = workflowDraft.id;
    stage.workflowPath = workflowDraft.path;
    stage.status = 'workflow_ready';
    stage.blockers = [];
    stage.gate = { status: 'pending', blockers: [] };
    stage.updatedAt = now;
    return { prepared: true, workflow: { id: workflowDraft.id, path: workflowDraft.path, type: workflowDraft.taskType }, workflowDraft };
  }

  const workflowDraft = await buildWorkflowDraft(stage.taskType, taskPlan);
  const result = await saveWorkflowDraft(stage.taskType, {
    source: 'pipeline-run',
    episodeId: run.episodeId,
    pipelineRunId: run.id,
    pipelineStageId: stage.id,
    inputArtifacts: stage.requiredInputArtifacts,
    outputArtifacts: stage.outputArtifacts,
    chainStage: `${stage.previousStageId ?? 'start'}->${stage.taskType}`,
    note: `由 Pipeline Run ${run.id} 阶段 ${stage.title} 自动创建。`
  }, workflowDraft);

  stage.workflowId = result.workflow.id;
  stage.workflowPath = result.workflow.path;
  stage.status = 'workflow_ready';
  stage.blockers = [];
  stage.gate = { status: 'pending', blockers: [] };
  stage.updatedAt = now;
  run.status = 'running';
  run.currentStageId = stage.id;
  run.updatedAt = now;
  return { prepared: true, workflow: result.workflow, workflowDraft: result.workflowDraft };
}

function markPipelineStageDone(run, stage, ledger, options = {}) {
  const now = options.updatedAt ?? new Date().toISOString();
  stage.status = 'done';
  stage.blockers = [];
  stage.gate = {
    status: 'passed',
    blockers: [],
    passedAt: now
  };
  stage.updatedAt = now;
  appendPipelineRunEvent(ledger, run, {
    type: 'pipeline_stage_done',
    status: 'done',
    stageId: stage.id,
    taskType: stage.taskType,
    workflowId: stage.workflowId,
    at: now
  });

  const nextStage = run.stages.find((item) => item.id === stage.nextStageId);
  if (!nextStage) {
    run.status = 'done';
    run.currentStageId = stage.id;
    run.completedAt = now;
    run.updatedAt = now;
    appendPipelineRunEvent(ledger, run, {
      type: 'pipeline_run_done',
      status: 'done',
      at: now
    });
    return null;
  }

  nextStage.status = 'queued';
  nextStage.blockers = [];
  nextStage.gate = { status: 'pending', blockers: [] };
  nextStage.updatedAt = now;
  run.status = 'running';
  run.currentStageId = nextStage.id;
  run.updatedAt = now;
  appendPipelineRunEvent(ledger, run, {
    type: 'pipeline_stage_unlocked',
    status: 'queued',
    stageId: nextStage.id,
    taskType: nextStage.taskType,
    at: now
  });
  return nextStage;
}

function attachWorkflowToPipelineStage(stage, workflow) {
  if (!workflow || !stage) return false;
  if (workflow.type !== stage.taskType) return false;
  stage.workflowId = workflow.id;
  stage.workflowPath = workflow.path;
  stage.status = 'workflow_ready';
  stage.blockers = [];
  stage.gate = { status: 'pending', blockers: [] };
  stage.updatedAt = new Date().toISOString();
  return true;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCreativeEpisodeId(value) {
  return String(value || 'ep001').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'ep001';
}

function trimForCard(value, maxLength = 80) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
}

function getCreativeVisionConfig() {
  const apiKey = process.env.SMART_VISION_LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = (process.env.SMART_VISION_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.SMART_VISION_VISION_MODEL || process.env.SMART_VISION_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
  return { apiKey, baseUrl, model };
}

function normalizeChatCompletionText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text ?? part?.content ?? '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function normalizeCreativeImportFiles(input = {}) {
  const source = Array.isArray(input.files) ? input.files : [input.file ?? input].filter(Boolean);
  return source
    .map((file) => ({
      fileName: String(file.fileName || file.name || 'imported-file').trim() || 'imported-file',
      mimeType: String(file.mimeType || file.type || '').trim(),
      text: typeof file.text === 'string' ? file.text : '',
      dataUrl: typeof file.dataUrl === 'string' ? file.dataUrl : ''
    }))
    .filter((file) => file.text || file.dataUrl || file.fileName);
}

function getCreativeImportExtension(file) {
  const fromName = path.extname(String(file.fileName || '')).toLowerCase();
  if (fromName && fromName.length <= 12) return fromName;
  if (/png/i.test(file.mimeType)) return '.png';
  if (/jpe?g/i.test(file.mimeType)) return '.jpg';
  if (/webp/i.test(file.mimeType)) return '.webp';
  if (/gif/i.test(file.mimeType)) return '.gif';
  if (/json/i.test(file.mimeType)) return '.json';
  if (/markdown/i.test(file.mimeType)) return '.md';
  if (/text/i.test(file.mimeType)) return '.txt';
  return '.bin';
}

function sanitizeCreativeImportFileName(file, index) {
  const ext = getCreativeImportExtension(file);
  const baseName = path.basename(String(file.fileName || `import-${index + 1}${ext}`), path.extname(String(file.fileName || '')))
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `import-${index + 1}`;
  return `${String(index + 1).padStart(2, '0')}-${baseName}${ext}`;
}

function decodeCreativeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) return null;
  const body = match[3] || '';
  return match[2]
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8');
}

async function materializeCreativeImportFile(file, batchId, index) {
  const fileName = sanitizeCreativeImportFileName(file, index);
  const artifactPath = normalizeArtifactPathValue(`04-输入资料/${batchId}/imports/${fileName}`);
  const { absolutePath } = resolveArtifactPath(artifactPath);
  let content = null;
  if (file.dataUrl) content = decodeCreativeDataUrl(file.dataUrl);
  if (!content && typeof file.text === 'string') content = Buffer.from(file.text, 'utf8');
  if (!content) return null;
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return {
    artifactPath,
    fileSize: content.length
  };
}

function isCreativeImageImport(file) {
  return /^image\//i.test(file.mimeType) || /\.(png|jpe?g|webp|gif)$/i.test(file.fileName);
}

function isCreativeTextImport(file) {
  return /^text\//i.test(file.mimeType) || /\.(txt|md|markdown|json|csv)$/i.test(file.fileName);
}

function normalizeCreativeTextImport(file) {
  let text = String(file.text || '');
  if (/\.json$/i.test(file.fileName)) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Keep the raw text if the user imported a non-standard JSON-like file.
    }
  }
  return text.trim();
}

function fallbackCreativeImageText(file, reason = '') {
  return [
    `【图片资料：${file.fileName}】`,
    reason ? `识别状态：${reason}` : '识别状态：未配置视觉模型，已作为参考图资料进入剧本输入。',
    '请基于这张图片提取可用于漫剧生产的画面文字、人物、场景、道具、情绪、动作和剧情线索。'
  ].join('\n');
}

async function recognizeCreativeImageImport(file) {
  const config = getCreativeVisionConfig();
  if (!config.apiKey) {
    return {
      status: 'fallback',
      provider: 'not_configured',
      model: config.model,
      text: fallbackCreativeImageText(file)
    };
  }

  if (!file.dataUrl || !/^data:image\//i.test(file.dataUrl)) {
    return {
      status: 'fallback',
      provider: 'invalid_image',
      model: config.model,
      text: fallbackCreativeImageText(file, '图片数据不可读取')
    };
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是智能视界漫剧工业化流水线的素材识别助手。只输出可直接填入剧本输入框的中文生产资料，不要解释系统能力。'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `文件名：${file.fileName}`,
                '请识别这张图片，并整理为后续“剧本解析 -> 分镜表 -> 资产卡 -> 资产图工作流 -> 故事板 -> 视频工作流”可使用的输入。',
                '请包含：画面文字、人物、场景、道具、动作、情绪、视觉风格、可推断剧情、需要保留的参考图说明。'
              ].join('\n')
            },
            { type: 'image_url', image_url: { url: file.dataUrl } }
          ]
        }
      ]
    })
  }, 30000);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `vision model HTTP ${response.status}`);
  }

  const text = normalizeChatCompletionText(payload.choices?.[0]?.message?.content);
  return {
    status: text ? 'recognized' : 'fallback',
    provider: 'openai_compatible_chat',
    model: config.model,
    text: text || fallbackCreativeImageText(file, '模型未返回有效文本')
  };
}

async function importCreativeSources(input = {}) {
  const files = normalizeCreativeImportFiles(input);
  if (files.length === 0) throw new Error('files are required');

  const batchId = normalizeCreativeEpisodeId(input.episodeId || input.importId || `import-${Date.now()}`);
  const items = [];
  for (const [index, file] of files.entries()) {
    let materialized = null;
    try {
      materialized = await materializeCreativeImportFile(file, batchId, index);
    } catch (error) {
      materialized = {
        artifactPath: '',
        fileSize: 0,
        warning: error instanceof Error ? error.message : String(error)
      };
    }

    if (isCreativeImageImport(file)) {
      try {
        const recognized = await recognizeCreativeImageImport(file);
        items.push({ fileName: file.fileName, mimeType: file.mimeType, kind: 'image', ...materialized, ...recognized });
      } catch (error) {
        items.push({
          fileName: file.fileName,
          mimeType: file.mimeType,
          kind: 'image',
          ...materialized,
          status: 'fallback',
          provider: 'recognition_failed',
          model: getCreativeVisionConfig().model,
          warning: error instanceof Error ? error.message : String(error),
          text: fallbackCreativeImageText(file, '视觉模型调用失败，已保留为参考图资料')
        });
      }
      continue;
    }

    if (isCreativeTextImport(file) || file.text) {
      items.push({
        fileName: file.fileName,
        mimeType: file.mimeType,
        kind: 'text',
        ...materialized,
        status: 'parsed',
        provider: 'local_text_parser',
        text: normalizeCreativeTextImport(file)
      });
      continue;
    }

    items.push({
      fileName: file.fileName,
      mimeType: file.mimeType,
      kind: 'unknown',
      ...materialized,
      status: 'fallback',
      provider: 'unsupported_file',
      text: `【导入资料：${file.fileName}】\n暂未识别该文件类型，请补充为剧本、故事梗概或参考说明。`
    });
  }

  return {
    importedAt: new Date().toISOString(),
    importId: batchId,
    itemCount: items.length,
    combinedText: items.map((item) => item.text).filter(Boolean).join('\n\n').trim(),
    items,
    artifactPaths: items.map((item) => item.artifactPath).filter(Boolean),
    vision: {
      configured: Boolean(getCreativeVisionConfig().apiKey),
      model: getCreativeVisionConfig().model
    }
  };
}

function splitScriptIntoBeats(scriptText) {
  const normalized = String(scriptText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphBeats = normalized
    .split(/\n{2,}|(?:第[一二三四五六七八九十百\d]+[章节幕场集].*)\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const sourceBeats = paragraphBeats.length > 1
    ? paragraphBeats
    : normalized.split(/(?<=[。！？!?；;])\s*/g).map((item) => item.trim()).filter(Boolean);

  const beats = [];
  for (const beat of sourceBeats) {
    if (beat.length <= 240) {
      beats.push(beat);
      continue;
    }
    for (let index = 0; index < beat.length; index += 180) {
      beats.push(beat.slice(index, index + 180).trim());
    }
  }

  return beats.filter(Boolean);
}

function pickChineseTerms(scriptText, suffixes, fallback, limit = 8) {
  const text = String(scriptText || '');
  const terms = new Set();
  for (const suffix of suffixes) {
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{1,8}${suffix})`, 'g');
    let match = pattern.exec(text);
    while (match) {
      terms.add(match[1]);
      match = pattern.exec(text);
    }
  }
  return Array.from(terms).filter((item) => item.length <= 12).slice(0, limit).concat(terms.size ? [] : [fallback]);
}

function extractCharacterNames(scriptText) {
  const text = String(scriptText || '');
  const stopWords = new Set(['于是', '然后', '突然', '忽然', '已经', '正在', '这里', '那里', '这个', '那个', '他们', '她们', '我们', '你们', '主角', '少年']);
  const names = new Set();
  const patterns = [
    /([\u4e00-\u9fa5]{2,4})(?:说|说道|低声|喊道|问道|看着|望着|握住|冲向|走进|来到|发现|决定|抬头|回头|站在)/g,
    /(?:主角|少年|少女|老人|男子|女子|师父|反派|队长|将军|掌柜|皇帝|公主|弟子)([\u4e00-\u9fa5]{2,4})/g,
    /《([^》]{2,8})》/g
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      const name = String(match[1] || '').trim();
      if (name && !stopWords.has(name) && !/[场城山街院殿门房塔湖海林]/.test(name)) names.add(name);
      match = pattern.exec(text);
    }
  }

  if (names.size === 0) names.add('主角');
  if (names.size === 1) names.add('重要配角');
  return Array.from(names).slice(0, 6);
}

function createAssetCard(type, name, index, sourceShots = []) {
  const typeLabel = type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具';
  return {
    id: `${type}-${String(index + 1).padStart(2, '0')}`,
    type,
    typeLabel,
    name,
    sourceShots,
    usage: `${typeLabel}资产，用于资产图、故事板和视频工作流一致性锚定。`,
    visualPrompt: `${name}，HZW 漫剧视觉风格，清晰轮廓，高识别度，适合 9:16 竖屏短剧生产，保持跨镜头一致。`,
    referencePolicy: '如用户导入参考图，则在无限画布 workflow 中作为参考图填入；否则由资产卡提示词生成首版资产图。'
  };
}

function buildCreativeStoryboard(scriptText, episodeId, importedFiles = []) {
  const beats = splitScriptIntoBeats(scriptText);
  const clipCount = clampNumber(Math.ceil(Math.max(scriptText.trim().length, beats.length * 180, importedFiles.length ? 180 : 0) / 280), 1, 16);
  const selectedBeats = Array.from({ length: clipCount }, (_, index) => beats[index] ?? beats.at(-1) ?? '用户导入了参考资料，等待补充更完整的剧本文案。');
  const characterNames = extractCharacterNames(scriptText);
  const sceneNames = pickChineseTerms(scriptText, ['场', '城', '山', '街', '院', '殿', '门', '房', '塔', '湖', '海', '林', '洞', '谷'], '核心场景', 6);
  const propNames = pickChineseTerms(scriptText, ['剑', '刀', '令', '符', '书', '戒', '瓶', '盒', '石', '碑', '灯', '镜', '钥匙'], '关键道具', 6);
  const assets = [
    ...characterNames.map((name, index) => createAssetCard('character', name, index)),
    ...sceneNames.map((name, index) => createAssetCard('scene', name, index)),
    ...propNames.map((name, index) => createAssetCard('prop', name, index))
  ];
  const characterAssets = assets.filter((asset) => asset.type === 'character');
  const sceneAssets = assets.filter((asset) => asset.type === 'scene');
  const propAssets = assets.filter((asset) => asset.type === 'prop');
  const shots = selectedBeats.map((beat, index) => {
    const shotId = `shot-${String(index + 1).padStart(2, '0')}`;
    const scene = sceneAssets[index % sceneAssets.length];
    const primaryCharacter = characterAssets[index % characterAssets.length];
    const secondaryCharacter = characterAssets[(index + 1) % characterAssets.length];
    const prop = propAssets[index % propAssets.length];
    const segmentStart = index * 15;
    const segmentEnd = segmentStart + 15;
    const action = trimForCard(beat, 120);
    const title = trimForCard(action.replace(/[，。！？；,.!?;].*$/, ''), 24) || `第 ${index + 1} 段`;
    const shotAssets = uniqueStrings([primaryCharacter?.id, secondaryCharacter?.id, scene?.id, prop?.id].filter(Boolean));

    for (const assetId of shotAssets) {
      const asset = assets.find((item) => item.id === assetId);
      if (asset) asset.sourceShots = uniqueStrings([...(asset.sourceShots ?? []), shotId]);
    }

    return {
      shotId,
      episodeId,
      title,
      segment: `${segmentStart}-${segmentEnd}秒`,
      durationSeconds: 15,
      sourceExcerpt: action,
      scene: scene?.name ?? '核心场景',
      characters: uniqueStrings([primaryCharacter?.name, secondaryCharacter?.name].filter(Boolean)),
      props: prop ? [prop.name] : [],
      action,
      camera: index % 3 === 0 ? '中近景推进，突出角色行动和第一读点。' : index % 3 === 1 ? '横移跟拍，交代角色与空间关系。' : '特写到反应镜头，强化情绪转折。',
      audio: '保留对白/旁白节奏，补足环境音和关键动作音效。',
      assetIds: shotAssets,
      imagePrompt: `${scene?.name ?? '核心场景'}，${[primaryCharacter?.name, secondaryCharacter?.name].filter(Boolean).join('、')}，${action}，HZW 漫剧风格，9:16，清晰分镜构图。`,
      videoPrompt: `${shotId} ${segmentStart}-${segmentEnd}秒：基于故事板参考图生成竖屏短剧镜头。画面任务：${action}。镜头：${index % 3 === 0 ? '稳定推进' : index % 3 === 1 ? '横移跟拍' : '情绪特写'}。保持角色、场景、道具资产一致。`
    };
  });

  return {
    episodeId,
    clipCount,
    totalDurationSeconds: clipCount * 15,
    importedFiles,
    assets,
    shots
  };
}

function renderStoryboardMarkdown(plan) {
  return [
    `# ${plan.episodeId} 分镜表`,
    '',
    `- 生成方式：Smart Vision 剧本输入自动拆解`,
    `- 视频段数：${plan.clipCount}`,
    `- 预计总时长：${plan.totalDurationSeconds} 秒`,
    '',
    '| 镜头 | 时段 | 场景 | 角色 | 画面任务 | 镜头 | 音频 | 资产引用 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...plan.shots.map((shot) => `| ${escapeMarkdownCell(shot.shotId)} | ${escapeMarkdownCell(shot.segment)} | ${escapeMarkdownCell(shot.scene)} | ${escapeMarkdownCell(shot.characters.join('、'))} | ${escapeMarkdownCell(shot.action)} | ${escapeMarkdownCell(shot.camera)} | ${escapeMarkdownCell(shot.audio)} | ${escapeMarkdownCell(shot.assetIds.join(', '))} |`)
  ].join('\n');
}

function renderAssetCardsMarkdown(plan) {
  const lines = [
    `# ${plan.episodeId} 资产卡`,
    '',
    `- 来源：剧本自动解析 + 用户导入资料`,
    `- 资产数量：${plan.assets.length}`,
    ''
  ];

  for (const asset of plan.assets) {
    lines.push(`## ${asset.typeLabel}：${asset.name}`);
    lines.push('');
    lines.push(`- ID：${asset.id}`);
    lines.push(`- 用途：${asset.usage}`);
    lines.push(`- 出现镜头：${asset.sourceShots.length ? asset.sourceShots.join('、') : '待镜头确认'}`);
    lines.push(`- 视觉提示词：${asset.visualPrompt}`);
    lines.push(`- 参考图策略：${asset.referencePolicy}`);
    lines.push('');
  }

  return lines.join('\n');
}

function renderAssetIndexMarkdown(plan) {
  return [
    `# ${plan.episodeId} 资产索引`,
    '',
    '| ID | 类型 | 名称 | 出现镜头 | 生成提示 |',
    '| --- | --- | --- | --- | --- |',
    ...plan.assets.map((asset) => `| ${escapeMarkdownCell(asset.id)} | ${escapeMarkdownCell(asset.typeLabel)} | ${escapeMarkdownCell(asset.name)} | ${escapeMarkdownCell(asset.sourceShots.join('、') || '待确认')} | ${escapeMarkdownCell(asset.visualPrompt)} |`)
  ].join('\n');
}

function renderSeedancePromptsMarkdown(plan) {
  return [
    `# ${plan.episodeId} 视频工作流提示词`,
    '',
    '这些提示词用于填入无限画布视频生成 workflow；Smart Vision 只生成 workflow JSON 与提示词，不直接调用模型。',
    '',
    ...plan.shots.map((shot) => [
      `## ${shot.shotId} · ${shot.segment}`,
      '',
      `- 故事板图输入：01-资产图与提示词/故事板/storyboard/${plan.episodeId}/${shot.shotId}.png`,
      `- 参考资产：${shot.assetIds.join(', ')}`,
      '',
      shot.videoPrompt
    ].join('\n'))
  ].join('\n\n---\n\n');
}

async function writeTextArtifact(artifactPath, content) {
  const { normalized, absolutePath } = resolveArtifactPath(artifactPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${String(content).replace(/\s+$/g, '')}\n`, 'utf8');
  return normalized;
}

async function registerCreativePrimaryArtifacts(artifactPaths, metadata = {}) {
  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  const normalizedPaths = uniqueStrings(artifactPaths.map((item) => normalizeArtifactPathValue(item)));
  const updatedAt = new Date().toISOString();

  artifactRegistry.primaryArtifacts = uniqueStrings([...(artifactRegistry.primaryArtifacts ?? []), ...normalizedPaths]);
  artifactRegistry.creativePlans = [
    ...((artifactRegistry.creativePlans ?? []).filter((item) => item.episodeId !== metadata.episodeId)),
    {
      episodeId: metadata.episodeId,
      planId: metadata.planId,
      scriptArtifactPath: metadata.scriptArtifactPath,
      storyboardArtifactPath: metadata.storyboardArtifactPath,
      assetCardsArtifactPath: metadata.assetCardsArtifactPath,
      assetIndexArtifactPath: metadata.assetIndexArtifactPath,
      seedancePromptArtifactPath: metadata.seedancePromptArtifactPath,
      shotCount: metadata.shotCount,
      assetCount: metadata.assetCount,
      generatedAt: updatedAt
    }
  ].slice(-20);
  artifactRegistry.lastCreativePlan = metadata;
  artifactRegistry.updatedAt = updatedAt;
  await writeJson(artifactRegistryPath, artifactRegistry);
  return artifactRegistry;
}

async function startCreativeProduction(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const projectId = input.projectId ?? 'infinite-awakening-001';
  const episodeId = normalizeCreativeEpisodeId(input.episodeId);
  const importedFiles = Array.isArray(input.importedFiles) ? input.importedFiles.map((item) => String(item).trim()).filter(Boolean) : [];
  const scriptText = String(input.scriptText ?? input.script ?? '').trim();

  if (!scriptText && importedFiles.length === 0) {
    throw new Error('scriptText or importedFiles is required');
  }

  const plan = buildCreativeStoryboard(scriptText, episodeId, importedFiles);
  const planId = `creative-plan-${episodeId}-${Date.now()}`;
  const paths = {
    scriptArtifactPath: `04-输入资料/${episodeId}/script-source.md`,
    scriptIngestArtifactPath: `04-输入资料/${episodeId}/script-ingest.json`,
    storyboardArtifactPath: `04-storyboard/${episodeId}-storyboard.md`,
    storyboardJsonArtifactPath: `04-storyboard/${episodeId}-storyboard.json`,
    assetCardsArtifactPath: `01-资产图与提示词/asset-cards/${episodeId}-asset-cards.md`,
    assetCardsJsonArtifactPath: `01-资产图与提示词/asset-cards/${episodeId}-asset-cards.json`,
    assetIndexArtifactPath: '01-资产图与提示词/asset-index.md',
    seedancePromptArtifactPath: `05-prompts/seedance/${episodeId}-shots.md`,
    creativePlanArtifactPath: `05-可选输出/剧本/${episodeId}-creative-plan.json`
  };
  const artifactPaths = Object.values(paths);
  const scriptMarkdown = [
    `# ${episodeId} 剧本源`,
    '',
    `- 来源：用户输入 / 导入`,
    `- 导入文件：${importedFiles.length ? importedFiles.join('、') : '无'}`,
    '',
    scriptText || '用户已导入参考资料，尚未输入完整剧本文案。'
  ].join('\n');
  const ingest = {
    version: '0.1.0',
    projectId,
    episodeId,
    planId,
    importedFiles,
    scriptLength: scriptText.length,
    shotCount: plan.shots.length,
    assetCount: plan.assets.length,
    generatedAt: new Date().toISOString()
  };

  if (!dryRun) {
    await writeTextArtifact(paths.scriptArtifactPath, scriptMarkdown);
    await writeTextArtifact(paths.scriptIngestArtifactPath, JSON.stringify(ingest, null, 2));
    await writeTextArtifact(paths.storyboardArtifactPath, renderStoryboardMarkdown(plan));
    await writeTextArtifact(paths.storyboardJsonArtifactPath, JSON.stringify({ ...plan, planId, artifactPaths: paths }, null, 2));
    await writeTextArtifact(paths.assetCardsArtifactPath, renderAssetCardsMarkdown(plan));
    await writeTextArtifact(paths.assetCardsJsonArtifactPath, JSON.stringify({ episodeId, planId, assets: plan.assets }, null, 2));
    await writeTextArtifact(paths.assetIndexArtifactPath, renderAssetIndexMarkdown(plan));
    await writeTextArtifact(paths.seedancePromptArtifactPath, renderSeedancePromptsMarkdown(plan));
    await writeTextArtifact(paths.creativePlanArtifactPath, JSON.stringify({ ...ingest, storyboard: plan, artifactPaths: paths }, null, 2));
    await registerCreativePrimaryArtifacts(artifactPaths, {
      episodeId,
      planId,
      ...paths,
      shotCount: plan.shots.length,
      assetCount: plan.assets.length
    });
    await appendProgressItem({
      id: `creative-plan-${episodeId}`,
      title: '剧本解析与任务编排',
      description: `已根据用户输入生成 ${plan.shots.length} 个视频段、${plan.assets.length} 张资产卡，并写入生产输入文件。`,
      status: 'done',
      items: [paths.storyboardArtifactPath, paths.assetCardsArtifactPath, paths.assetIndexArtifactPath, paths.seedancePromptArtifactPath],
      artifactPath: paths.creativePlanArtifactPath,
      updatedAt: new Date().toISOString()
    });
  }

  const shouldCreatePipelineRun = input.createPipelineRun !== false;
  const pipelineRunResult = shouldCreatePipelineRun
    ? await createPipelineRun({
      ...input,
      projectId,
      episodeId,
      inputArtifacts: [paths.assetIndexArtifactPath, paths.storyboardArtifactPath, paths.seedancePromptArtifactPath, paths.scriptArtifactPath],
      prepareFirstStage: input.prepareFirstStage !== false,
      dryRun
    })
    : null;

  return {
    dryRun,
    projectId,
    episodeId,
    planId,
    status: dryRun ? 'preview' : 'created',
    importedFiles,
    scriptLength: scriptText.length,
    shotCount: plan.shots.length,
    assetCount: plan.assets.length,
    artifactPaths: paths,
    storyboard: {
      clipCount: plan.clipCount,
      totalDurationSeconds: plan.totalDurationSeconds,
      shots: plan.shots
    },
    assets: plan.assets,
    pipelineRun: pipelineRunResult,
    snapshot: pipelineRunResult?.snapshot ?? await buildSnapshot()
  };
}

async function createPipelineRun(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const pipelinePlan = await createIndustrialProductionPipelinePlan(input);
  const now = new Date().toISOString();
  const run = buildPipelineRunFromPlan(pipelinePlan, now);
  const ledger = await readPipelineRunLedger();

  if (input.prepareFirstStage !== false) {
    await preparePipelineStageWorkflow(run, run.stages[0], { dryRun });
  }

  appendPipelineRunEvent(ledger, run, {
    type: 'pipeline_run_created',
    status: run.status,
    stageId: run.currentStageId,
    at: now,
    dryRun
  });

  if (!dryRun) {
    ledger.runs = [...(ledger.runs ?? []), run].slice(-100);
    await writePipelineRunLedger(ledger);
  }

  return {
    dryRun,
    run,
    pipelinePlan,
    registry: dryRun ? { ...ledger, runs: [...(ledger.runs ?? []), run] } : await readPipelineRunLedger(),
    snapshot: await buildSnapshot()
  };
}

async function listPipelineRuns() {
  const registry = await readPipelineRunLedger();
  return {
    registry,
    snapshot: await buildSnapshot()
  };
}

async function advancePipelineRun(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const ledger = await readPipelineRunLedger();
  const runs = dryRun ? JSON.parse(JSON.stringify(ledger.runs ?? [])) : (ledger.runs ?? []);
  const run = input.runId
    ? runs.find((item) => item.id === input.runId)
    : [...runs].reverse().find((item) => item.status !== 'done');

  if (!run) throw new Error(input.runId ? `Pipeline run not found: ${input.runId}` : 'No active pipeline run found.');

  const stage = input.stageId
    ? run.stages.find((item) => item.id === input.stageId)
    : run.stages.find((item) => item.id === run.currentStageId) ?? run.stages.find((item) => item.status !== 'done');

  if (!stage) throw new Error(`Pipeline stage not found: ${input.stageId ?? run.currentStageId ?? 'current'}`);

  const now = new Date().toISOString();
  const steps = [];

  if (stage.status === 'blocked' && stage.previousStageId) {
    const previous = run.stages.find((item) => item.id === stage.previousStageId);
    if (previous?.status !== 'done') {
      stage.blockers = [{ code: 'previous_stage_not_done', message: '上游阶段尚未完成。', stageId: previous?.id }];
      stage.gate = { status: 'blocked', blockers: stage.blockers };
      stage.updatedAt = now;
      steps.push({ id: 'previous_stage_gate', status: 'blocked', blockers: stage.blockers });
    } else {
      stage.status = 'queued';
      stage.blockers = [];
      steps.push({ id: 'previous_stage_gate', status: 'passed' });
    }
  }

  if (stage.status === 'queued') {
    const prepared = await preparePipelineStageWorkflow(run, stage, { dryRun });
    steps.push({ id: 'prepare_workflow', status: prepared.prepared ? 'workflow_ready' : 'skipped', workflowId: prepared.workflow?.id, workflowPath: prepared.workflow?.path });
  } else if (stage.status === 'workflow_ready' || stage.status === 'waiting_output' || stage.status === 'waiting_review') {
    const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
    const gate = evaluatePipelineStageGate(stage, reviewLedger.reviews ?? []);
    stage.gate = gate;
    stage.blockers = gate.blockers;
    stage.status = gate.passed ? 'done' : stage.artifactPaths.length > 0 ? 'waiting_review' : 'waiting_output';
    stage.updatedAt = now;
    steps.push({ id: 'stage_gate', status: gate.status, blockers: gate.blockers, reviewIds: gate.reviewIds });
    if (gate.passed) markPipelineStageDone(run, stage, ledger, { updatedAt: now });
  } else if (stage.status === 'done') {
    const nextStage = run.stages.find((item) => item.id === stage.nextStageId);
    if (nextStage && nextStage.status === 'queued') {
      run.currentStageId = nextStage.id;
      steps.push({ id: 'advance_to_next_stage', status: 'queued', stageId: nextStage.id });
    } else {
      steps.push({ id: 'stage_already_done', status: 'done' });
    }
  }

  run.updatedAt = now;
  appendPipelineRunEvent(ledger, run, {
    type: 'pipeline_run_advanced',
    status: run.status,
    stageId: stage.id,
    at: now,
    dryRun
  });

  if (!dryRun) await writePipelineRunLedger(ledger);

  return {
    dryRun,
    run,
    stage,
    steps,
    registry: dryRun ? { ...ledger, runs } : await readPipelineRunLedger(),
    snapshot: await buildSnapshot()
  };
}

function findPipelineStageWorkflow(stage, run, workflows = []) {
  const matchesStageOwnership = (workflow) => {
    if (!workflow) return false;
    if (workflow.pipelineRunId && workflow.pipelineRunId !== run.id) return false;
    if (workflow.pipelineStageId && workflow.pipelineStageId !== stage.id) return false;
    return true;
  };
  const directWorkflow = workflows.find((workflow) => workflow.id === stage.workflowId);
  if (directWorkflow && matchesStageOwnership(directWorkflow)) return directWorkflow;
  return workflows.find((workflow) => workflow.pipelineRunId === run.id && workflow.pipelineStageId === stage.id)
    ?? workflows.find((workflow) => workflow.type === stage.taskType && workflow.source === 'pipeline-run' && String(workflow.note ?? '').includes(run.id) && String(workflow.note ?? '').includes(stage.title));
}

function normalizePipelineRunPointers(run, repairs, updatedAt) {
  const stages = Array.isArray(run.stages) ? run.stages : [];
  let changed = false;

  stages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  stages.forEach((stage, index) => {
    const expectedPreviousStageId = index > 0 ? stages[index - 1].id : null;
    const expectedNextStageId = index < stages.length - 1 ? stages[index + 1].id : null;
    if (stage.index !== index) {
      stage.index = index;
      changed = true;
    }
    if (stage.previousStageId !== expectedPreviousStageId) {
      stage.previousStageId = expectedPreviousStageId;
      changed = true;
    }
    if (stage.nextStageId !== expectedNextStageId) {
      stage.nextStageId = expectedNextStageId;
      changed = true;
    }
  });

  const firstActiveStage = stages.find((stage) => stage.status !== 'done') ?? stages.at(-1) ?? null;
  if (firstActiveStage && run.currentStageId !== firstActiveStage.id) {
    run.currentStageId = firstActiveStage.id;
    changed = true;
  }

  const nextStatus = stages.length > 0 && stages.every((stage) => stage.status === 'done') ? 'done' : firstActiveStage ? 'running' : 'blocked';
  if (run.status !== nextStatus && (run.status !== 'queued' || nextStatus === 'done')) {
    run.status = nextStatus;
    changed = true;
  }

  if (changed) {
    run.updatedAt = updatedAt;
    repairs.push({ code: 'pipeline_run_pointers_normalized', runId: run.id, message: '已规整阶段 index、previous/next 指针和 currentStageId。' });
  }
}

async function repairPipelineRun(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const rebuildMissingWorkflow = input.rebuildMissingWorkflow !== false;
  const updatedAt = new Date().toISOString();
  const sourceLedger = await readPipelineRunLedger();
  const ledger = dryRun ? JSON.parse(JSON.stringify(sourceLedger)) : sourceLedger;
  const repairs = [];

  if (!Array.isArray(ledger.runs)) {
    ledger.runs = [];
    repairs.push({ code: 'pipeline_runs_array_repaired', message: '已将 runs 修复为空数组。' });
  }

  if (!Array.isArray(ledger.events)) {
    ledger.events = [];
    repairs.push({ code: 'pipeline_events_array_repaired', message: '已将 events 修复为空数组。' });
  }

  const seenRunIds = new Set();
  const dedupedRuns = [];
  for (const run of [...(ledger.runs ?? [])].reverse()) {
    if (!run?.id) continue;
    if (seenRunIds.has(run.id)) {
      repairs.push({ code: 'pipeline_duplicate_run_removed', runId: run.id, message: '已移除重复 Pipeline Run。' });
      continue;
    }
    seenRunIds.add(run.id);
    dedupedRuns.push(run);
  }
  ledger.runs = dedupedRuns.reverse();

  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const workflows = workflowRegistry.workflows ?? [];
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const reviews = reviewLedger.reviews ?? [];
  const targetRuns = (ledger.runs ?? []).filter((run) => input.runId ? run.id === input.runId : true);

  if (input.runId && targetRuns.length === 0) {
    throw new Error(`Pipeline run not found: ${input.runId}`);
  }

  for (const run of targetRuns) {
    if (!Array.isArray(run.stages)) {
      run.stages = [];
      run.status = 'blocked';
      run.updatedAt = updatedAt;
      repairs.push({ code: 'pipeline_run_stages_array_repaired', runId: run.id, message: '已将 stages 修复为空数组。' });
      continue;
    }

    normalizePipelineRunPointers(run, repairs, updatedAt);

    const targetStages = run.stages.filter((stage) => input.stageId ? stage.id === input.stageId : true);
    for (const stage of targetStages) {
      const previousStage = stage.previousStageId ? run.stages.find((item) => item.id === stage.previousStageId) : null;
      const attachedWorkflow = stage.workflowId ? workflowById.get(stage.workflowId) : null;
      const workflowRunMismatch = attachedWorkflow?.pipelineRunId && attachedWorkflow.pipelineRunId !== run.id;
      const workflowStageMismatch = attachedWorkflow?.pipelineStageId && attachedWorkflow.pipelineStageId !== stage.id;
      if (workflowRunMismatch || workflowStageMismatch) {
        repairs.push({
          code: workflowRunMismatch ? 'pipeline_stage_workflow_run_mismatch_detached' : 'pipeline_stage_workflow_stage_mismatch_detached',
          runId: run.id,
          stageId: stage.id,
          workflowId: stage.workflowId,
          message: '已移除指向其他 Pipeline Run / Stage 的错误 Workflow 绑定。'
        });
        stage.workflowId = null;
        stage.workflowPath = null;
        stage.artifactPaths = [];
        stage.reviewIds = [];
        stage.gate = { status: 'pending', blockers: [] };
        stage.blockers = [];
        if (stage.status !== 'done') stage.status = 'queued';
        stage.updatedAt = updatedAt;
      }

      if (previousStage && previousStage.status !== 'done') {
        const previousStageBlockers = [{ code: 'previous_stage_not_done', message: '上游阶段尚未完成。', stageId: previousStage.id }];
        const alreadyBlockedByPrevious = stage.status === 'blocked'
          && stage.gate?.status === 'blocked'
          && Array.isArray(stage.blockers)
          && stage.blockers.some((blocker) => blocker.code === 'previous_stage_not_done' && blocker.stageId === previousStage.id);
        if (!alreadyBlockedByPrevious) {
          stage.status = 'blocked';
          stage.blockers = previousStageBlockers;
          stage.gate = { status: 'blocked', blockers: stage.blockers };
          stage.updatedAt = updatedAt;
          repairs.push({ code: 'pipeline_stage_blocked_by_previous', runId: run.id, stageId: stage.id, message: '已恢复上游阶段门禁。' });
        }
        continue;
      }

      const existingWorkflow = findPipelineStageWorkflow(stage, run, workflows);
      if (existingWorkflow && (stage.workflowId !== existingWorkflow.id || stage.workflowPath !== existingWorkflow.path)) {
        stage.workflowId = existingWorkflow.id;
        stage.workflowPath = existingWorkflow.path;
        if (stage.status === 'queued') stage.status = 'workflow_ready';
        stage.updatedAt = updatedAt;
        repairs.push({ code: 'pipeline_stage_workflow_reattached', runId: run.id, stageId: stage.id, workflowId: existingWorkflow.id, message: '已重挂阶段 Workflow。' });
      }

      if (stage.workflowId && !workflows.some((workflow) => workflow.id === stage.workflowId) && rebuildMissingWorkflow && stage.status !== 'done') {
        repairs.push({ code: 'pipeline_stage_workflow_missing_detected', runId: run.id, stageId: stage.id, workflowId: stage.workflowId, message: '检测到阶段 Workflow 丢失，准备重建。' });
        stage.workflowId = null;
        stage.workflowPath = null;
      }

      if (!stage.workflowId && rebuildMissingWorkflow && stage.status !== 'done' && (!previousStage || previousStage.status === 'done')) {
        const prepared = await preparePipelineStageWorkflow(run, stage, { dryRun });
        if (prepared.prepared) {
          repairs.push({ code: 'pipeline_stage_workflow_rebuilt', runId: run.id, stageId: stage.id, workflowId: prepared.workflow?.id, workflowPath: prepared.workflow?.path, message: '已重建缺失阶段 Workflow。' });
        }
      }

      const stageReviews = reviews.filter((review) => reviewMatchesPipelineStage(review, stage) && isReviewTypeAcceptedForPipelineStage(review.type, stage));
      const reviewIds = uniqueStrings([...(stage.reviewIds ?? []), ...stageReviews.map((review) => review.id).filter(Boolean)]);
      const artifactPaths = uniqueStrings([...(stage.artifactPaths ?? []), ...stageReviews.map((review) => review.artifactPath).filter(Boolean)]);
      if (reviewIds.length !== (stage.reviewIds ?? []).length || artifactPaths.length !== (stage.artifactPaths ?? []).length) {
        stage.reviewIds = reviewIds;
        stage.artifactPaths = artifactPaths;
        stage.updatedAt = updatedAt;
        repairs.push({ code: 'pipeline_stage_review_reattached', runId: run.id, stageId: stage.id, reviewCount: reviewIds.length, artifactCount: artifactPaths.length, message: '已重挂阶段 review / artifact。' });
      }

      const gate = evaluatePipelineStageGate(stage, reviews);
      if (gate.passed && stage.status !== 'done') {
        stage.gate = gate;
        stage.blockers = [];
        markPipelineStageDone(run, stage, ledger, { updatedAt });
        repairs.push({ code: 'pipeline_stage_marked_done', runId: run.id, stageId: stage.id, message: '阶段门禁已通过，已标记完成并解锁下游。' });
      } else if (stage.status === 'done' && !gate.passed) {
        stage.status = stage.artifactPaths?.length > 0 ? 'waiting_review' : stage.workflowId ? 'waiting_output' : 'queued';
        stage.gate = gate;
        stage.blockers = gate.blockers;
        stage.updatedAt = updatedAt;
        repairs.push({ code: 'pipeline_stage_done_downgraded', runId: run.id, stageId: stage.id, message: '阶段 done 状态与门禁不一致，已回退到待处理状态。' });
      } else if (stage.status !== 'done') {
        stage.gate = gate;
        stage.blockers = gate.blockers;
        if (stage.workflowId && stage.artifactPaths?.length > 0 && stage.status !== 'waiting_review') stage.status = 'waiting_review';
        if (stage.workflowId && (stage.artifactPaths?.length ?? 0) === 0 && stage.status !== 'waiting_output') stage.status = 'waiting_output';
        stage.updatedAt = updatedAt;
      }
    }

    normalizePipelineRunPointers(run, repairs, updatedAt);
    appendPipelineRunEvent(ledger, run, {
      type: 'pipeline_run_repaired',
      status: run.status,
      at: updatedAt,
      dryRun,
      requested: repairs.filter((repair) => repair.runId === run.id).length
    });
  }

  if (!dryRun && repairs.length > 0) {
    await writePipelineRunLedger(ledger);
  }

  return {
    dryRun,
    repairedAt: updatedAt,
    requestedRunId: input.runId ?? null,
    requestedStageId: input.stageId ?? null,
    repairCount: repairs.length,
    repairs,
    registry: dryRun ? ledger : await readPipelineRunLedger(),
    diagnostics: await diagnoseWorkflowRuntime(),
    snapshot: await buildSnapshot()
  };
}

async function runPipelineRunRepairWriteSmoke() {
  const smokedAt = new Date().toISOString();
  const originalLedger = await readPipelineRunLedger();
  const originalSnapshot = JSON.parse(JSON.stringify(originalLedger));
  const pipelinePlan = await createIndustrialProductionPipelinePlan({ episodeId: 'ep001' });
  const fixtureRun = buildPipelineRunFromPlan(pipelinePlan, smokedAt);
  const fixtureRunId = `pipeline-repair-write-smoke-${Date.now()}`;

  fixtureRun.id = fixtureRunId;
  fixtureRun.status = 'done';
  fixtureRun.currentStageId = '__missing_stage__';
  fixtureRun.stages = fixtureRun.stages.map((stage, index) => ({
    ...stage,
    index: index + 10,
    previousStageId: '__broken_previous__',
    nextStageId: '__broken_next__',
    status: index === 0 ? 'done' : 'workflow_ready',
    workflowId: null,
    workflowPath: null,
    artifactPaths: [],
    reviewIds: [],
    blockers: [],
    gate: { status: 'passed', blockers: [] },
    updatedAt: smokedAt
  }));

  const staleDuplicateRun = {
    id: fixtureRunId,
    status: 'ghost',
    stages: [],
    currentStageId: '__stale_duplicate__',
    updatedAt: smokedAt
  };
  const fixtureLedger = {
    ...originalSnapshot,
    runs: [...(originalSnapshot.runs ?? []), staleDuplicateRun, fixtureRun],
    events: 'invalid-events',
    updatedAt: smokedAt
  };
  const expectedRepairCodes = [
    'pipeline_events_array_repaired',
    'pipeline_duplicate_run_removed',
    'pipeline_run_pointers_normalized',
    'pipeline_stage_done_downgraded',
    'pipeline_stage_blocked_by_previous'
  ];
  let preview = null;
  let realRepair = null;
  let repairedRun = null;
  let cleanupDiagnostics = null;
  let cleanupRestored = false;

  await writePipelineRunLedger(fixtureLedger);

  try {
    preview = await repairPipelineRun({ dryRun: true, runId: fixtureRunId, rebuildMissingWorkflow: false });
    realRepair = await repairPipelineRun({ dryRun: false, runId: fixtureRunId, rebuildMissingWorkflow: false });
    repairedRun = (realRepair.registry.runs ?? []).find((run) => run.id === fixtureRunId) ?? null;
  } finally {
    await writePipelineRunLedger(originalSnapshot);
    cleanupRestored = true;
    cleanupDiagnostics = await diagnoseWorkflowRuntime();
  }

  const previewCodes = Array.from(new Set((preview?.repairs ?? []).map((repair) => repair.code)));
  const repairCodes = Array.from(new Set((realRepair?.repairs ?? []).map((repair) => repair.code)));
  const missingExpected = expectedRepairCodes.filter((code) => !repairCodes.includes(code));
  const firstStage = repairedRun?.stages?.[0] ?? null;
  const secondStage = repairedRun?.stages?.[1] ?? null;
  const repairedStateValid = Boolean(
    repairedRun
    && repairedRun.status === 'running'
    && repairedRun.currentStageId === firstStage?.id
    && firstStage?.status === 'queued'
    && secondStage?.status === 'blocked'
    && (secondStage.blockers ?? []).some((blocker) => blocker.code === 'previous_stage_not_done' && blocker.stageId === firstStage.id)
  );

  return {
    id: fixtureRunId,
    status: missingExpected.length === 0 && repairedStateValid && realRepair?.diagnostics?.status === 'ready' && cleanupDiagnostics?.status === 'ready' ? 'passed' : 'failed',
    dryRunRepairCount: preview?.repairCount ?? 0,
    realRepairCount: realRepair?.repairCount ?? 0,
    expectedRepairCodes,
    previewCodes,
    repairCodes,
    missingExpected,
    repairedStateValid,
    realDiagnostics: {
      status: realRepair?.diagnostics?.status,
      issueCount: realRepair?.diagnostics?.counts?.issueCount
    },
    cleanupRestored,
    cleanupDiagnostics: {
      status: cleanupDiagnostics?.status,
      issueCount: cleanupDiagnostics?.counts?.issueCount
    }
  };
}

async function attachCanvasOutputToPipelineRuns(workflow, artifactPath, reviewId, updatedAt = new Date().toISOString()) {
  if (!workflow?.id || !artifactPath) return { updated: false, updatedRuns: [] };

  const ledger = await readPipelineRunLedger();
  const workflowPipelineRunId = String(workflow.pipelineRunId || '').trim();
  const workflowPipelineStageId = String(workflow.pipelineStageId || '').trim();
  let changed = false;
  const updatedRuns = [];

  for (const run of ledger.runs ?? []) {
    if (workflowPipelineRunId && run.id !== workflowPipelineRunId) continue;
    const stage = workflowPipelineStageId
      ? (run.stages ?? []).find((item) => item.id === workflowPipelineStageId)
      : (run.stages ?? []).find((item) => item.workflowId === workflow.id || (!workflowPipelineRunId && !item.workflowId && item.taskType === workflow.type));
    if (!stage || stage.status === 'done') continue;

    stage.workflowId = workflow.id;
    stage.workflowPath = workflow.path;
    stage.artifactPaths = uniqueStrings([...(stage.artifactPaths ?? []), artifactPath]);
    if (reviewId) stage.reviewIds = uniqueStrings([...(stage.reviewIds ?? []), reviewId]);
    stage.status = reviewId ? 'waiting_review' : 'waiting_output';
    stage.updatedAt = updatedAt;
    stage.gate = {
      ...(stage.gate ?? {}),
      status: 'pending',
      blockers: reviewId ? [] : [{ code: 'stage_review_missing', message: '产物已回写但审核记录尚未创建。' }]
    };
    run.currentStageId = stage.id;
    run.status = 'running';
    run.updatedAt = updatedAt;
    appendPipelineRunEvent(ledger, run, {
      type: 'pipeline_stage_output_registered',
      status: stage.status,
      stageId: stage.id,
      taskType: stage.taskType,
      workflowId: workflow.id,
      artifactPath,
      reviewId,
      at: updatedAt
    });
    changed = true;
    updatedRuns.push(run.id);
  }

  if (changed) await writePipelineRunLedger(ledger);
  return { updated: changed, updatedRuns };
}

async function advancePipelineRunsFromReview(review, status, updatedAt, nextWorkflow = null) {
  if (!review?.id || status !== 'done') return { updated: false, updatedRuns: [] };

  const ledger = await readPipelineRunLedger();
  let changed = false;
  const updatedRuns = [];

  for (const run of ledger.runs ?? []) {
    const stage = (run.stages ?? []).find((item) => reviewMatchesPipelineStage(review, item));
    if (!stage || stage.status === 'done') continue;

    stage.reviewIds = uniqueStrings([...(stage.reviewIds ?? []), review.id]);
    if (review.artifactPath) stage.artifactPaths = uniqueStrings([...(stage.artifactPaths ?? []), review.artifactPath]);
    if (!stage.workflowId && review.workflowId) stage.workflowId = review.workflowId;

    if (!isReviewTypeAcceptedForPipelineStage(review.type, stage)) {
      stage.gate = {
        status: 'blocked',
        blockers: [{ code: 'stage_review_type_mismatch', message: `审核类型 ${review.type} 与阶段 ${stage.taskType} 不匹配。`, reviewId: review.id }]
      };
      stage.blockers = stage.gate.blockers;
      stage.status = 'waiting_review';
      stage.updatedAt = updatedAt;
      changed = true;
      continue;
    }

    const nextStage = markPipelineStageDone(run, stage, ledger, { updatedAt });
    if (nextStage && nextWorkflow) {
      attachWorkflowToPipelineStage(nextStage, nextWorkflow);
      appendPipelineRunEvent(ledger, run, {
        type: 'pipeline_next_workflow_attached',
        status: nextStage.status,
        stageId: nextStage.id,
        workflowId: nextWorkflow.id,
        workflowPath: nextWorkflow.path,
        at: updatedAt
      });
    }
    changed = true;
    updatedRuns.push(run.id);
  }

  if (changed) await writePipelineRunLedger(ledger);
  return { updated: changed, updatedRuns };
}

function simulatePipelineStageDone(run, stage, steps, details = {}) {
  const now = new Date().toISOString();
  stage.status = 'done';
  stage.workflowId = details.workflowId ?? stage.workflowId;
  stage.workflowPath = details.workflowPath ?? stage.workflowPath;
  stage.artifactPaths = uniqueStrings([...(stage.artifactPaths ?? []), ...(details.artifactPaths ?? [])]);
  stage.reviewIds = uniqueStrings([...(stage.reviewIds ?? []), ...(details.reviewIds ?? [])]);
  stage.gate = { status: 'passed', blockers: [], passedAt: now };
  stage.blockers = [];
  stage.updatedAt = now;
  const nextStage = run.stages.find((item) => item.id === stage.nextStageId);
  if (nextStage) {
    nextStage.status = 'queued';
    nextStage.blockers = [];
    nextStage.gate = { status: 'pending', blockers: [] };
    run.currentStageId = nextStage.id;
  } else {
    run.status = 'done';
    run.currentStageId = stage.id;
  }
  steps.push({ id: `${stage.id}_gate`, status: 'passed', workflowId: stage.workflowId, artifacts: stage.artifactPaths.length, reviews: stage.reviewIds.length });
  return nextStage;
}

async function runPipelineRunSmoke(input = {}) {
  const smokedAt = new Date().toISOString();
  const pipelinePlan = await createIndustrialProductionPipelinePlan({ episodeId: input.episodeId ?? 'ep001' });
  const run = buildPipelineRunFromPlan(pipelinePlan, smokedAt);
  const steps = [
    {
      id: 'pipeline_sequence',
      status: pipelinePlan.canonicalSequence.slice(0, 3).join('>') === 'asset_image_generation>storyboard_image_generation>video_generation' ? 'passed' : 'blocked',
      summary: pipelinePlan.canonicalSequence.join(' → ')
    }
  ];

  const assetStage = run.stages.find((stage) => stage.id === 'asset_images');
  const assetTaskPlan = pipelinePlan.taskPlans.find((plan) => plan.taskType === 'asset_image_generation');
  const assetWorkflowDraft = await buildWorkflowDraft('asset_image_generation', assetTaskPlan);
  assetStage.workflowId = assetWorkflowDraft.id;
  assetStage.workflowPath = assetWorkflowDraft.path;
  assetStage.status = 'workflow_ready';
  const assetOutput = await registerCanvasWorkflowOutput({
    dryRun: true,
    workflowId: assetWorkflowDraft.id,
    workflowPath: assetWorkflowDraft.path,
    workflowDraft: assetWorkflowDraft,
    taskType: 'asset_image_generation',
    nodeId: 'n2',
    nodeType: 'txt2img',
    outputArtifactHint: '01-资产图与提示词/资产图/ep001/runtime-smoke-asset.png',
    mediaType: 'image',
    saved: { filename: 'runtime-smoke-asset.png' }
  });
  simulatePipelineStageDone(run, assetStage, steps, {
    artifactPaths: [assetOutput.artifactPath],
    reviewIds: ['dry-run-asset-image-review'],
    workflowId: assetWorkflowDraft.id,
    workflowPath: assetWorkflowDraft.path
  });

  const storyboardStage = run.stages.find((stage) => stage.id === 'storyboard_images');
  const storyboardTaskPlan = pipelinePlan.taskPlans.find((plan) => plan.taskType === 'storyboard_image_generation');
  const storyboardWorkflowDraft = await buildWorkflowDraft('storyboard_image_generation', storyboardTaskPlan);
  storyboardStage.workflowId = storyboardWorkflowDraft.id;
  storyboardStage.workflowPath = storyboardWorkflowDraft.path;
  storyboardStage.status = 'workflow_ready';
  const storyboardOutput = await registerCanvasWorkflowOutput({
    dryRun: true,
    workflowId: storyboardWorkflowDraft.id,
    workflowPath: storyboardWorkflowDraft.path,
    workflowDraft: storyboardWorkflowDraft,
    taskType: 'storyboard_image_generation',
    nodeId: 'n2',
    nodeType: 'img2imgAll',
    outputArtifactHint: '01-资产图与提示词/故事板/storyboard/ep001/runtime-smoke-storyboard.png',
    mediaType: 'image',
    saved: { filename: 'runtime-smoke-storyboard.png' }
  });
  simulatePipelineStageDone(run, storyboardStage, steps, {
    artifactPaths: [storyboardOutput.artifactPath],
    reviewIds: ['dry-run-storyboard-image-review'],
    workflowId: storyboardWorkflowDraft.id,
    workflowPath: storyboardWorkflowDraft.path
  });

  const videoStage = run.stages.find((stage) => stage.id === 'videos');
  const videoTaskPlan = pipelinePlan.taskPlans.find((plan) => plan.taskType === 'video_generation');
  const videoWorkflowDraft = await buildWorkflowDraft('video_generation', videoTaskPlan);
  videoStage.workflowId = videoWorkflowDraft.id;
  videoStage.workflowPath = videoWorkflowDraft.path;
  videoStage.status = 'workflow_ready';
  steps.push({
    id: 'video_workflow_ready',
    status: videoWorkflowDraft.canvasExecution?.workflowMode === 'seedance_video_generation' ? 'passed' : 'blocked',
    summary: `${videoWorkflowDraft.canvasExecution?.workflowMode ?? 'unknown'} · refs ${videoWorkflowDraft.canvasExecution?.referenceImageCount ?? 0}`
  });

  const releaseSmoke = await runReleasePublishQueueSmoke({ releaseId: input.releaseId ?? null });
  steps.push({
    id: 'release_dry_run',
    status: releaseSmoke.steps.at(-1)?.status === 'published' ? 'passed' : 'blocked',
    summary: releaseSmoke.steps.map((step) => `${step.id}:${step.status}`).join(' / ')
  });

  const diagnostics = await diagnoseWorkflowRuntime();
  steps.push({
    id: 'diagnostics',
    status: diagnostics.status,
    summary: `${diagnostics.counts.issueCount} runtime issues`
  });

  return {
    smokedAt,
    dryRun: true,
    status: steps.some((step) => step.status === 'blocked') ? 'blocked' : diagnostics.status === 'ready' ? 'passed' : 'degraded',
    run,
    pipelinePlan: {
      pipelineId: pipelinePlan.pipelineId,
      canonicalSequence: pipelinePlan.canonicalSequence,
      stages: pipelinePlan.stages.map((stage) => ({ id: stage.id, taskType: stage.taskType, title: stage.title, workflowMode: stage.workflowMode, nextTaskType: stage.nextTaskType }))
    },
    steps,
    canvasWorkflows: [
      { stageId: assetStage.id, workflowPath: assetWorkflowDraft.path, workflowMode: assetWorkflowDraft.canvasExecution?.workflowMode, outputArtifact: assetOutput.artifactPath },
      { stageId: storyboardStage.id, workflowPath: storyboardWorkflowDraft.path, workflowMode: storyboardWorkflowDraft.canvasExecution?.workflowMode, outputArtifact: storyboardOutput.artifactPath },
      { stageId: videoStage.id, workflowPath: videoWorkflowDraft.path, workflowMode: videoWorkflowDraft.canvasExecution?.workflowMode }
    ],
    releaseSmoke,
    diagnostics: {
      status: diagnostics.status,
      issueCount: diagnostics.counts.issueCount,
      nextActions: diagnostics.nextActions
    },
    snapshot: await buildSnapshot()
  };
}

function normalizeTaskPlanProgressStatus(status) {
  return isValidStatus(status) ? status : 'todo';
}

function buildPersistedSubtaskId(taskPlan, subtask) {
  return `orchestration-${taskPlan.taskId}-${subtask.id}`.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 160);
}

async function persistWorkflowTaskPlan(input = {}) {
  const taskPlan = input.taskPlan ?? await createWorkflowTaskPlan(input);
  const persistedAt = new Date().toISOString();
  const subtasks = Array.isArray(taskPlan.subtasks) ? taskPlan.subtasks : [];
  const progressPath = path.join(smartVisionRoot, 'progress-ledger.json');
  const progressLedger = await readJson(progressPath, { version: '0.1.0', projectId: taskPlan.projectId ?? 'infinite-awakening-001', episode: taskPlan.episodeId ?? 'ep001', items: [] });
  const progressItems = [];

  for (const subtask of subtasks) {
    const progressItem = {
      id: buildPersistedSubtaskId(taskPlan, subtask),
      title: `${taskPlan.taskType} / ${subtask.title}`,
      description: `任务编排器生成：${taskPlan.title}。负责人：${subtask.ownerRole}。依赖：${subtask.dependsOn.join(', ') || '无'}。`,
      status: normalizeTaskPlanProgressStatus(subtask.status),
      items: [
        ...subtask.inputArtifacts.slice(0, 4).map((item) => `输入：${item}`),
        ...subtask.outputArtifacts.slice(0, 4).map((item) => `输出：${item}`),
        ...subtask.acceptanceCriteria.slice(0, 3).map((item) => `验收：${item}`)
      ],
      taskPlanId: taskPlan.taskId,
      subtaskId: subtask.id,
      taskType: taskPlan.taskType,
      phase: taskPlan.phase,
      phaseGate: taskPlan.phaseGate,
      ownerRole: subtask.ownerRole,
      dependsOn: subtask.dependsOn,
      inputArtifacts: subtask.inputArtifacts,
      outputArtifacts: subtask.outputArtifacts,
      acceptanceCriteria: subtask.acceptanceCriteria,
      updatedAt: persistedAt
    };

    progressItems.push(progressItem);
    const existing = (progressLedger.items ?? []).find((item) => item.id === progressItem.id);
    if (existing) {
      Object.assign(existing, progressItem);
    } else {
      progressLedger.items = [...(progressLedger.items ?? []), progressItem];
    }
  }

  progressLedger.updatedAt = persistedAt;
  await writeJson(progressPath, progressLedger);

  const ledger = await readWorkflowRunnerLedger();
  const taskPlanRecord = {
    ...taskPlan,
    persistedAt,
    progressItemIds: progressItems.map((item) => item.id)
  };
  ledger.taskPlans = [
    ...(ledger.taskPlans ?? []).filter((item) => item.taskId !== taskPlan.taskId),
    taskPlanRecord
  ].slice(-100);
  const nextQueueItems = progressItems.map((item, index) => ({
    id: `task-queue-${item.id}`,
    taskPlanId: taskPlan.taskId,
    subtaskId: item.subtaskId,
    progressItemId: item.id,
    title: item.title,
    taskType: taskPlan.taskType,
    phase: taskPlan.phase,
    ownerRole: item.ownerRole,
    dependsOn: item.dependsOn.map((subtaskId) => buildPersistedSubtaskId(taskPlan, { id: subtaskId })),
    status: item.status === 'blocked' ? 'blocked' : 'queued',
    queueOrder: index,
    queuedAt: persistedAt,
    updatedAt: persistedAt
  }));
  ledger.taskQueue = [
    ...((ledger.taskQueue ?? []).filter((item) => item.taskPlanId !== taskPlan.taskId)),
    ...nextQueueItems
  ].slice(-300);
  ledger.events = [
    ...(ledger.events ?? []),
    {
      id: `task-plan-persisted-${taskPlan.taskId}-${Date.now()}`,
      type: 'task_plan_persisted',
      status: taskPlan.orchestration?.blocked ? 'blocked' : 'queued',
      taskPlanId: taskPlan.taskId,
      taskType: taskPlan.taskType,
      at: persistedAt,
      requested: nextQueueItems.length
    }
  ].slice(-500);
  ledger.updatedAt = persistedAt;
  await writeWorkflowRunnerLedger(ledger);

  return {
    taskPlan,
    persistedAt,
    progressItems,
    queuedTasks: nextQueueItems,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

function isConcreteTaskArtifactPath(value) {
  return typeof value === 'string' && value.includes('/') && !value.includes('*') && !value.includes('{') && !value.includes('}');
}

function inspectTaskArtifactPaths(paths = []) {
  return paths.map((artifactPath) => {
    if (!isConcreteTaskArtifactPath(artifactPath)) {
      return { path: artifactPath, check: 'skipped', reason: 'logical_or_glob_artifact' };
    }

    try {
      const { normalized, absolutePath } = resolveArtifactPath(artifactPath);
      return { path: normalized, check: existsSync(absolutePath) ? 'exists' : 'missing' };
    } catch (error) {
      return { path: artifactPath, check: 'invalid', error: error instanceof Error ? error.message : String(error) };
    }
  });
}

async function writeTaskQueueExecutionReport({ runId, taskPlan, queueItem, progressItem, status, startedAt, completedAt, inputChecks, outputChecks, error }) {
  const taskPlanId = slugifyTaskType(taskPlan?.taskId ?? queueItem.taskPlanId);
  const subtaskId = slugifyTaskType(queueItem.subtaskId);
  const reportDir = path.join(smartVisionRoot, 'task-runs', taskPlanId);
  const reportFileName = `${runId}-${subtaskId}.json`;
  const reportPath = `.smart-vision/task-runs/${taskPlanId}/${reportFileName}`;
  const report = {
    version: '0.1.0',
    runId,
    taskPlanId: queueItem.taskPlanId,
    subtaskId: queueItem.subtaskId,
    taskQueueId: queueItem.id,
    taskType: queueItem.taskType,
    title: queueItem.title,
    ownerRole: queueItem.ownerRole,
    status,
    startedAt,
    completedAt,
    executionMode: 'orchestration_report',
    progressItemId: queueItem.progressItemId,
    phase: queueItem.phase,
    dependencyProgressIds: queueItem.dependsOn ?? [],
    inputChecks,
    outputChecks,
    acceptanceCriteria: progressItem?.acceptanceCriteria ?? [],
    notes: [
      '此报告由 Smart Vision 任务队列执行器生成，用于闭环记录编排任务的执行状态。',
      '涉及外部模型、画布或人工生产的产物仍需由对应 Runtime / 人工环节实际生成并登记。'
    ],
    error: error ?? null
  };

  await mkdir(reportDir, { recursive: true });
  await writeJson(path.join(reportDir, reportFileName), report);
  return { reportPath, report };
}

async function runWorkflowTaskQueue({ limit = 5, taskPlanId = null, taskQueueId = null, strictInputs = false } = {}) {
  const runId = `task-queue-run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const requestedLimit = Math.max(1, Number(limit) || 5);
  const ledger = await readWorkflowRunnerLedger();
  const progressPath = path.join(smartVisionRoot, 'progress-ledger.json');
  const progressLedger = await readJson(progressPath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  const progressItems = progressLedger.items ?? [];
  const progressById = new Map(progressItems.map((item) => [item.id, item]));
  const taskPlans = ledger.taskPlans ?? [];
  const now = startedAt;

  for (const queueItem of ledger.taskQueue ?? []) {
    if (taskQueueId && queueItem.id !== taskQueueId) continue;
    if (taskPlanId && queueItem.taskPlanId !== taskPlanId) continue;
    if (!['queued', 'blocked'].includes(queueItem.status)) continue;

    const dependenciesDone = (queueItem.dependsOn ?? []).every((dependencyId) => progressById.get(dependencyId)?.status === 'done');
    if (!dependenciesDone) {
      queueItem.status = 'blocked';
      queueItem.error = 'Waiting for dependencies to complete.';
      queueItem.updatedAt = now;
      const progressItem = progressById.get(queueItem.progressItemId);
      if (progressItem && progressItem.status !== 'done') {
        progressItem.status = 'blocked';
        progressItem.updatedAt = now;
      }
    } else if (queueItem.status === 'blocked' && queueItem.error === 'Waiting for dependencies to complete.') {
      queueItem.status = 'queued';
      delete queueItem.error;
      queueItem.updatedAt = now;
      const progressItem = progressById.get(queueItem.progressItemId);
      if (progressItem && progressItem.status === 'blocked') {
        progressItem.status = 'todo';
        progressItem.updatedAt = now;
      }
    }
  }

  const refreshTaskQueueDependencyState = () => {
    for (const queueItem of ledger.taskQueue ?? []) {
      if (taskQueueId && queueItem.id !== taskQueueId) continue;
      if (taskPlanId && queueItem.taskPlanId !== taskPlanId) continue;
      if (!['queued', 'blocked'].includes(queueItem.status)) continue;

      const dependenciesDone = (queueItem.dependsOn ?? []).every((dependencyId) => progressById.get(dependencyId)?.status === 'done');
      if (!dependenciesDone) {
        queueItem.status = 'blocked';
        queueItem.error = 'Waiting for dependencies to complete.';
        queueItem.updatedAt = new Date().toISOString();
        const progressItem = progressById.get(queueItem.progressItemId);
        if (progressItem && progressItem.status !== 'done') {
          progressItem.status = 'blocked';
          progressItem.updatedAt = queueItem.updatedAt;
        }
      } else if (queueItem.status === 'blocked' && queueItem.error === 'Waiting for dependencies to complete.') {
        queueItem.status = 'queued';
        delete queueItem.error;
        queueItem.updatedAt = new Date().toISOString();
        const progressItem = progressById.get(queueItem.progressItemId);
        if (progressItem && progressItem.status === 'blocked') {
          progressItem.status = 'todo';
          progressItem.updatedAt = queueItem.updatedAt;
        }
      }
    }
  };

  const findNextRunnableTaskQueueItem = () => {
    refreshTaskQueueDependencyState();
    return (ledger.taskQueue ?? [])
      .filter((queueItem) => (!taskQueueId || queueItem.id === taskQueueId) && (!taskPlanId || queueItem.taskPlanId === taskPlanId) && queueItem.status === 'queued')
      .filter((queueItem) => (queueItem.dependsOn ?? []).every((dependencyId) => progressById.get(dependencyId)?.status === 'done'))
      .sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0))[0] ?? null;
  };

  const runRecord = {
    id: runId,
    status: 'running',
    startedAt,
    requestedLimit,
    taskPlanId,
    taskQueueId,
    requested: 0,
    results: []
  };

  ledger.taskQueueRuns = [...(ledger.taskQueueRuns ?? []), runRecord].slice(-100);
  ledger.events = [
    ...(ledger.events ?? []),
    { id: `${runId}:started`, runId, taskPlanId: taskPlanId ?? undefined, type: 'task_queue_started', status: 'running', at: startedAt, requested: 0 }
  ].slice(-500);

  const results = [];

  while (results.length < requestedLimit) {
    const queueItem = findNextRunnableTaskQueueItem();
    if (!queueItem) break;

    const itemStartedAt = new Date().toISOString();
    const taskPlan = taskPlans.find((item) => item.taskId === queueItem.taskPlanId);
    const progressItem = progressById.get(queueItem.progressItemId);
    queueItem.status = 'running';
    queueItem.startedAt = itemStartedAt;
    queueItem.updatedAt = itemStartedAt;

    if (progressItem) {
      progressItem.status = 'in_progress';
      progressItem.updatedAt = itemStartedAt;
    }

    try {
      if (!taskPlan) {
        throw new Error(`Task plan not found: ${queueItem.taskPlanId}`);
      }
      if (!progressItem) {
        throw new Error(`Progress item not found: ${queueItem.progressItemId}`);
      }

      const inputChecks = inspectTaskArtifactPaths(progressItem.inputArtifacts ?? []);
      const outputChecks = inspectTaskArtifactPaths(progressItem.outputArtifacts ?? []);
      const missingInputs = inputChecks.filter((item) => item.check === 'missing' || item.check === 'invalid');

      if (strictInputs && missingInputs.length > 0) {
        throw new Error(`Missing or invalid inputs: ${missingInputs.map((item) => item.path).join(', ')}`);
      }

      const completedAt = new Date().toISOString();
      const { reportPath } = await writeTaskQueueExecutionReport({ runId, taskPlan, queueItem, progressItem, status: 'done', startedAt: itemStartedAt, completedAt, inputChecks, outputChecks });

      queueItem.status = 'done';
      queueItem.completedAt = completedAt;
      queueItem.updatedAt = completedAt;
      queueItem.reportPath = reportPath;
      delete queueItem.error;
      progressItem.status = 'done';
      progressItem.updatedAt = completedAt;
      progressItem.executionReportPath = reportPath;
      progressItem.executionRunId = runId;

      const result = { taskQueueId: queueItem.id, taskPlanId: queueItem.taskPlanId, subtaskId: queueItem.subtaskId, progressItemId: queueItem.progressItemId, status: 'done', reportPath };
      results.push(result);
      ledger.events.push({ id: `${runId}:${queueItem.id}:done`, runId, taskPlanId: queueItem.taskPlanId, taskType: queueItem.taskType, type: 'task_queue_item_completed', status: 'done', at: completedAt, progressItemId: queueItem.progressItemId });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const inputChecks = inspectTaskArtifactPaths(progressItem?.inputArtifacts ?? []);
      const outputChecks = inspectTaskArtifactPaths(progressItem?.outputArtifacts ?? []);
      const { reportPath } = await writeTaskQueueExecutionReport({ runId, taskPlan, queueItem, progressItem, status: 'failed', startedAt: itemStartedAt, completedAt, inputChecks, outputChecks, error: message });

      queueItem.status = 'failed';
      queueItem.error = message;
      queueItem.completedAt = completedAt;
      queueItem.updatedAt = completedAt;
      queueItem.reportPath = reportPath;
      if (progressItem) {
        progressItem.status = 'blocked';
        progressItem.updatedAt = completedAt;
        progressItem.executionReportPath = reportPath;
        progressItem.executionRunId = runId;
      }

      const result = { taskQueueId: queueItem.id, taskPlanId: queueItem.taskPlanId, subtaskId: queueItem.subtaskId, progressItemId: queueItem.progressItemId, status: 'failed', error: message, reportPath };
      results.push(result);
      ledger.events.push({ id: `${runId}:${queueItem.id}:failed`, runId, taskPlanId: queueItem.taskPlanId, taskType: queueItem.taskType, type: 'task_queue_item_failed', status: 'failed', at: completedAt, error: message, progressItemId: queueItem.progressItemId });
    }
  }

  const completedAt = new Date().toISOString();
  runRecord.status = results.some((item) => item.status === 'failed') ? 'completed_with_errors' : 'completed';
  runRecord.completedAt = completedAt;
  runRecord.requested = results.length;
  runRecord.results = results;
  ledger.events = [
    ...ledger.events,
    { id: `${runId}:completed`, runId, taskPlanId: taskPlanId ?? undefined, type: 'task_queue_completed', status: runRecord.status, at: completedAt, requested: results.length }
  ].slice(-500);
  ledger.updatedAt = completedAt;
  progressLedger.items = progressItems;
  progressLedger.updatedAt = completedAt;
  await writeJson(progressPath, progressLedger);
  await writeWorkflowRunnerLedger(ledger);

  return {
    runId,
    queuedAt: startedAt,
    completedAt,
    requested: results.length,
    results,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function requeueWorkflowTaskQueueItem({ taskQueueId = null, progressItemId = null, taskPlanId = null, subtaskId = null, resetDependents = false, reason = 'manual_requeue' } = {}) {
  const requeuedAt = new Date().toISOString();
  const ledger = await readWorkflowRunnerLedger();
  const progressPath = path.join(smartVisionRoot, 'progress-ledger.json');
  const progressLedger = await readJson(progressPath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  const progressById = new Map((progressLedger.items ?? []).map((item) => [item.id, item]));
  const matches = (ledger.taskQueue ?? []).filter((item) => {
    if (taskQueueId) return item.id === taskQueueId;
    if (progressItemId) return item.progressItemId === progressItemId;
    if (taskPlanId && subtaskId) return item.taskPlanId === taskPlanId && item.subtaskId === subtaskId;
    if (taskPlanId) return item.taskPlanId === taskPlanId;
    return false;
  });

  if ((taskQueueId || progressItemId || subtaskId) && matches.length === 0) {
    throw new Error(`Task queue item not found: ${taskQueueId ?? progressItemId ?? `${taskPlanId}:${subtaskId}`}`);
  }

  const targetIds = new Set(matches.map((item) => item.progressItemId));
  const dependentItems = resetDependents
    ? (ledger.taskQueue ?? []).filter((item) => (item.dependsOn ?? []).some((dependencyId) => targetIds.has(dependencyId)))
    : [];
  const requeuedItems = Array.from(new Map([...matches, ...dependentItems].map((item) => [item.id, item])).values());

  for (const item of requeuedItems) {
    const previousReportPath = item.reportPath;
    item.status = 'queued';
    item.updatedAt = requeuedAt;
    item.requeuedAt = requeuedAt;
    item.requeueReason = reason;
    item.retryCount = (item.retryCount ?? 0) + 1;
    if (previousReportPath) item.previousReportPath = previousReportPath;
    delete item.error;
    delete item.startedAt;
    delete item.completedAt;
    delete item.reportPath;

    const progressItem = progressById.get(item.progressItemId);
    if (progressItem) {
      if (progressItem.executionReportPath) progressItem.previousExecutionReportPath = progressItem.executionReportPath;
      progressItem.status = 'todo';
      progressItem.updatedAt = requeuedAt;
      progressItem.requeuedAt = requeuedAt;
      progressItem.requeueReason = reason;
      delete progressItem.executionReportPath;
      delete progressItem.executionRunId;
    }
  }

  ledger.events = [
    ...(ledger.events ?? []),
    ...requeuedItems.map((item) => ({
      id: `task-queue-requeued-${item.id}-${Date.now()}`,
      type: 'task_queue_item_requeued',
      status: 'queued',
      taskPlanId: item.taskPlanId,
      taskType: item.taskType,
      progressItemId: item.progressItemId,
      at: requeuedAt,
      reason,
      requested: requeuedItems.length
    }))
  ].slice(-500);
  ledger.updatedAt = requeuedAt;
  progressLedger.updatedAt = requeuedAt;
  await writeJson(progressPath, progressLedger);
  await writeWorkflowRunnerLedger(ledger);

  return {
    requeuedAt,
    requested: requeuedItems.length,
    requeuedItems,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function buildWorkflowDraft(taskType = 'storyboard', taskPlan = null) {
  const contextPack = await buildTaskContextPack(taskType);
  const slug = slugifyTaskType(contextPack.taskType);
  const id = `draft-${slug}-${Date.now()}`;
  const episodeId = taskPlan?.episodeId ?? 'ep001';
  const pathName = `02-工作流/${episodeId}/${id}.mjb-workflow.json`;
  const registry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), {});
  const canvasUrl = registry.canvasUrl ?? 'http://127.0.0.1:8877/image-studio-canvas.html';
  const sourceBundle = await collectCanvasWorkflowSources(contextPack, taskPlan);
  const workflowMode = inferCanvasWorkflowMode(contextPack.taskType);
  const canvas = workflowMode === 'asset_image_generation' ? await buildAssetImageCanvas(contextPack, taskPlan, sourceBundle) : workflowMode === 'seedance_video_generation' ? await buildVideoGenerationCanvas(contextPack, taskPlan, sourceBundle) : workflowMode === 'storyboard_image_generation' ? await buildStoryboardImageCanvas(contextPack, taskPlan, sourceBundle) : {
    nodes: [
      createDraftNode('n1', 'contextPack', '任务上下文包', 80, 120, {
        taskType: contextPack.taskType,
        taskPlan,
        docs: contextPack.docs,
        skills: contextPack.skills,
        templates: contextPack.templates,
        redlines: contextPack.redlines
      }),
      createDraftNode('n2', 'artifactInput', '输入产物', 460, 120, {
        artifacts: contextPack.inputArtifacts.slice(0, 12)
      }),
      createDraftNode('n3', 'workflowBuilder', 'Workflow Builder 草案', 840, 120, {
        phaseGateItems: contextPack.phaseGateItems,
        memoryPolicy: contextPack.memoryPolicy
      }),
      createDraftNode('n4', 'phaseGate', 'Phase Gate 审核', 1220, 120, {
        redlines: contextPack.redlines,
        generatedAt: contextPack.generatedAt
      })
    ],
    conns: [
      { from: 'n1', fromPort: 'context', to: 'n3', toPort: 'context', kind: 'json' },
      { from: 'n2', fromPort: 'artifacts', to: 'n3', toPort: 'inputs', kind: 'json' },
      { from: 'n3', fromPort: 'workflow', to: 'n4', toPort: 'review', kind: 'json' }
    ],
    view: { x: 0, y: 0, k: 0.82 },
    next: 5,
    muted: []
  };
  const importUrl = buildWorkflowImportUrl(canvasUrl, pathName);
  const editUrl = buildWorkflowImportUrl(canvasUrl, pathName, { mode: 'edit' });
  const runUrl = buildWorkflowImportUrl(canvasUrl, pathName, { mode: 'manual' });
  const executionStrategy = taskPlan?.canvasAdapter?.strategy ?? buildCanvasExecutionStrategy(contextPack.taskType);
  const canvasExecution = {
    executor: 'infinite_canvas',
    adapter: 'smart-vision-canvas-workflow-adapter',
    executionCarrier: 'workflow_json',
    directModelExecution: false,
    modelInvocation: 'never_direct_from_smart_vision',
    strategy: executionStrategy,
    workflowMode,
    status: workflowMode === 'context_pack_workflow' ? 'draft_only' : 'ready_for_canvas',
    workflowPath: pathName,
    importUrl,
    editUrl,
    runUrl,
    bridgeBase: getBridgeBaseUrl(),
    promptCount: sourceBundle.promptSources.filter((item) => item.exists).length,
    referenceImageCount: sourceBundle.referenceImages.length,
    prompts: sourceBundle.promptSources.map(sanitizeCanvasPromptSource),
    referenceImages: sourceBundle.referenceImages.map((item) => ({
      name: item.name,
      role: item.role,
      artifactPath: item.artifactPath,
      localPath: item.localPath,
      localUrl: item.localUrl,
      uploadMode: item.uploadMode
    })),
    outputArtifacts: sourceBundle.outputArtifacts,
    actions: [
      { id: 'edit_in_canvas', label: '编辑工作流', url: editUrl },
      { id: 'open_in_canvas', label: '导入画布', url: runUrl }
    ],
    generatedAt: new Date().toISOString()
  };

  return {
    schema: 'mjb-workflow-v1',
    id,
    name: workflowMode === 'asset_image_generation' ? 'EP001 资产图生成 Workflow' : workflowMode === 'seedance_video_generation' ? 'EP001 Seedance 单镜视频生成 Workflow' : workflowMode === 'storyboard_image_generation' ? 'EP001 故事板图生成 Workflow' : `${contextPack.title} Workflow 草案`,
    taskType: contextPack.taskType,
    path: pathName,
    importUrl,
    editUrl,
    runUrl,
    canvasExecution,
    contextPack,
    canvas,
    generatedAt: new Date().toISOString()
  };
}

function createWorkflowPreflightIssue(level, code, target, message, details = {}) {
  return {
    level,
    code,
    target,
    message,
    ...details
  };
}

function getWorkflowPreflightUrlCheck(urlValue, expectedWorkflowPath, field) {
  if (!urlValue || typeof urlValue !== 'string') {
    return createWorkflowPreflightIssue('error', `workflow_${field}_missing`, field, `${field} is required`);
  }

  try {
    const parsed = new URL(urlValue);
    const workflowPath = parsed.searchParams.get('workflowPath');
    const bridgeBase = parsed.searchParams.get('bridgeBase');

    if (expectedWorkflowPath && workflowPath !== expectedWorkflowPath) {
      return createWorkflowPreflightIssue('error', `workflow_${field}_path_mismatch`, field, `${field} workflowPath does not match workflow.path`, { expected: expectedWorkflowPath, actual: workflowPath });
    }

    if (!bridgeBase) {
      return createWorkflowPreflightIssue('warn', `workflow_${field}_bridge_base_missing`, field, `${field} does not include bridgeBase`);
    }
  } catch (error) {
    return createWorkflowPreflightIssue('error', `workflow_${field}_invalid`, field, `${field} is not a valid URL`, { error: error instanceof Error ? error.message : String(error) });
  }

  return null;
}

function getWorkflowNodeText(node) {
  const values = node?.values ?? {};
  const data = node?.data ?? {};
  return [
    values.positive,
    values.i2iDraft,
    values.vn2Draft,
    values.activePreset,
    data.positive,
    data.i2iDraft,
    data.vn2Draft,
    data.activePreset
  ].flat().filter(Boolean).join('\n');
}

function getWorkflowNodeOutputHints(node) {
  const values = node?.values ?? {};
  const data = node?.data ?? {};
  return [
    values.outputArtifactHint,
    values.lastOutputArtifactHint,
    values.outputDirectoryHint,
    data.outputArtifactHint,
    data.lastOutputArtifactHint,
    data.outputDirectoryHint
  ].filter(Boolean).map(normalizeArtifactPathValue);
}

function getExpectedWorkflowNodeTypes(workflowMode) {
  if (workflowMode === 'asset_image_generation') return ['stylePreset', 'singleImage'];
  if (workflowMode === 'storyboard_image_generation') return ['stylePreset', 'singleImage'];
  if (workflowMode === 'seedance_video_generation') return ['stylePreset', 'seedanceVideo', 'singleVideo'];
  if (workflowMode === 'context_pack_workflow') return ['contextPack'];
  return [];
}

function getExpectedGenerationNodeTypes(workflowMode) {
  if (workflowMode === 'asset_image_generation' || workflowMode === 'storyboard_image_generation') return ['txt2img', 'img2imgAll'];
  if (workflowMode === 'seedance_video_generation') return ['seedanceVideo'];
  return [];
}

function createWorkflowPreflightSection(id, title, issues) {
  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warnCount = issues.filter((issue) => issue.level === 'warn').length;
  return {
    id,
    title,
    status: errorCount > 0 ? 'failed' : warnCount > 0 ? 'warn' : 'passed',
    errorCount,
    warnCount,
    issues
  };
}

function preflightWorkflowDraft(workflowDraft, options = {}) {
  const requireFile = options.requireFile !== false;
  const checkedAt = new Date().toISOString();
  const workflowPathValue = normalizeArtifactPathValue(workflowDraft?.path ?? options.workflowPath ?? '');
  const taskType = workflowDraft?.taskType ?? options.taskType ?? '';
  const workflowMode = workflowDraft?.canvasExecution?.workflowMode ?? inferCanvasWorkflowMode(taskType);
  const sections = [];
  const schemaIssues = [];
  const canvasIssues = [];
  const executionIssues = [];
  const promptIssues = [];
  const outputIssues = [];
  let fileExists = false;

  if (!workflowDraft || typeof workflowDraft !== 'object') {
    schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_draft_invalid', 'workflowDraft', 'workflowDraft must be an object'));
  }

  if (!workflowPathValue) {
    schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_path_missing', 'path', 'workflow path is required'));
  } else {
    try {
      const resolved = resolveArtifactPath(workflowPathValue);
      fileExists = existsSync(resolved.absolutePath);
      if (!workflowPathValue.startsWith('02-工作流/')) {
        schemaIssues.push(createWorkflowPreflightIssue('warn', 'workflow_path_unconventional_root', workflowPathValue, 'workflow path should be under 02-工作流/'));
      }
      if (path.extname(workflowPathValue) !== '.json' || !workflowPathValue.endsWith('.mjb-workflow.json')) {
        schemaIssues.push(createWorkflowPreflightIssue('warn', 'workflow_path_extension_unconventional', workflowPathValue, 'workflow path should end with .mjb-workflow.json'));
      }
      if (requireFile && !fileExists) {
        schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_file_missing', workflowPathValue, 'workflow JSON file does not exist'));
      }
    } catch (error) {
      schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_path_invalid', workflowPathValue, 'workflow path is outside allowed roots or invalid', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  if (workflowDraft?.schema !== 'mjb-workflow-v1') {
    schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_schema_invalid', 'schema', 'workflow schema must be mjb-workflow-v1', { actual: workflowDraft?.schema ?? null }));
  }
  if (!workflowDraft?.id) schemaIssues.push(createWorkflowPreflightIssue('error', 'workflow_id_missing', 'id', 'workflow id is required'));
  if (!workflowDraft?.name) schemaIssues.push(createWorkflowPreflightIssue('warn', 'workflow_name_missing', 'name', 'workflow name is missing'));
  if (!taskType) schemaIssues.push(createWorkflowPreflightIssue('warn', 'workflow_task_type_missing', 'taskType', 'workflow taskType is missing'));

  const nodes = Array.isArray(workflowDraft?.canvas?.nodes) ? workflowDraft.canvas.nodes : [];
  const conns = Array.isArray(workflowDraft?.canvas?.conns) ? workflowDraft.canvas.conns : null;
  const nodeIds = new Set();
  const nodeTypes = new Set();
  if (nodes.length === 0) {
    canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_nodes_missing', 'canvas.nodes', 'canvas must include at least one node'));
  }
  for (const node of nodes) {
    if (!node?.id) {
      canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_node_id_missing', 'canvas.nodes', 'node id is required'));
      continue;
    }
    if (nodeIds.has(node.id)) {
      canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_node_id_duplicate', node.id, 'node id must be unique'));
    }
    nodeIds.add(node.id);
    if (!node.type) {
      canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_node_type_missing', node.id, 'node type is required'));
    } else {
      nodeTypes.add(node.type);
    }
  }

  if (!conns) {
    canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_connections_invalid', 'canvas.conns', 'canvas conns must be an array'));
  } else {
    for (const conn of conns) {
      if (!conn?.from || !nodeIds.has(conn.from)) {
        canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_connection_source_missing', conn?.from ?? 'missing', 'connection source node is missing'));
      }
      if (!conn?.to || !nodeIds.has(conn.to)) {
        canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_connection_target_missing', conn?.to ?? 'missing', 'connection target node is missing'));
      }
    }
  }

  for (const expectedType of getExpectedWorkflowNodeTypes(workflowMode)) {
    if (!nodeTypes.has(expectedType)) {
      canvasIssues.push(createWorkflowPreflightIssue(workflowMode === 'context_pack_workflow' ? 'warn' : 'error', 'workflow_expected_node_missing', expectedType, `expected ${expectedType} node for ${workflowMode}`));
    }
  }
  const generationNodeTypes = getExpectedGenerationNodeTypes(workflowMode);
  if (generationNodeTypes.length > 0 && !generationNodeTypes.some((nodeType) => nodeTypes.has(nodeType))) {
    canvasIssues.push(createWorkflowPreflightIssue('error', 'workflow_generation_node_missing', workflowMode, `expected one of ${generationNodeTypes.join(', ')}`));
  }

  const canvasExecution = workflowDraft?.canvasExecution ?? null;
  if (!canvasExecution) {
    executionIssues.push(createWorkflowPreflightIssue('warn', 'workflow_canvas_execution_missing', 'canvasExecution', 'canvasExecution metadata is missing; legacy workflow can still import but lacks runtime contract'));
  } else {
    if (canvasExecution.executor !== 'infinite_canvas') {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_executor_invalid', 'canvasExecution.executor', 'executor must be infinite_canvas'));
    }
    if (canvasExecution.executionCarrier !== 'workflow_json') {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_execution_carrier_invalid', 'canvasExecution.executionCarrier', 'execution carrier must be workflow_json'));
    }
    if (canvasExecution.directModelExecution !== false) {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_direct_model_execution_enabled', 'canvasExecution.directModelExecution', 'Smart Vision must not directly execute models'));
    }
    if (canvasExecution.modelInvocation && canvasExecution.modelInvocation !== 'never_direct_from_smart_vision') {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_model_invocation_invalid', 'canvasExecution.modelInvocation', 'modelInvocation must be never_direct_from_smart_vision'));
    }
    if (canvasExecution.workflowMode !== workflowMode) {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_mode_mismatch', 'canvasExecution.workflowMode', 'workflowMode does not match taskType inference', { expected: workflowMode, actual: canvasExecution.workflowMode }));
    }
    if (workflowPathValue && canvasExecution.workflowPath !== workflowPathValue) {
      executionIssues.push(createWorkflowPreflightIssue('error', 'workflow_execution_path_mismatch', 'canvasExecution.workflowPath', 'canvasExecution.workflowPath must match workflow.path', { expected: workflowPathValue, actual: canvasExecution.workflowPath }));
    }
  }

  const importUrlIssue = getWorkflowPreflightUrlCheck(workflowDraft?.importUrl ?? canvasExecution?.importUrl, workflowPathValue, 'import_url');
  if (importUrlIssue) executionIssues.push(importUrlIssue);
  const editUrlIssue = getWorkflowPreflightUrlCheck(workflowDraft?.editUrl ?? canvasExecution?.editUrl, workflowPathValue, 'edit_url');
  if (editUrlIssue) executionIssues.push(editUrlIssue.level === 'error' && !canvasExecution ? { ...editUrlIssue, level: 'warn' } : editUrlIssue);
  const runUrlIssue = getWorkflowPreflightUrlCheck(workflowDraft?.runUrl ?? canvasExecution?.runUrl, workflowPathValue, 'run_url');
  if (runUrlIssue) executionIssues.push(runUrlIssue.level === 'error' && !canvasExecution ? { ...runUrlIssue, level: 'warn' } : runUrlIssue);

  const promptTexts = nodes.map(getWorkflowNodeText).filter((text) => text.trim().length > 0);
  const promptSources = Array.isArray(canvasExecution?.prompts) ? canvasExecution.prompts : [];
  if (workflowMode !== 'context_pack_workflow' && promptSources.filter((item) => item?.exists).length === 0 && promptTexts.length === 0) {
    promptIssues.push(createWorkflowPreflightIssue('error', 'workflow_prompt_missing', 'prompts', 'executable workflow must include prompt source or node prompt text'));
  }
  for (const prompt of promptSources) {
    if (!prompt?.path) promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_prompt_path_missing', 'canvasExecution.prompts', 'prompt source path is missing'));
    if (prompt?.exists === false) promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_prompt_source_missing', prompt.path, 'prompt source is marked missing'));
  }
  if (canvasExecution && canvasExecution.promptCount !== promptSources.filter((item) => item?.exists).length) {
    promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_prompt_count_mismatch', 'canvasExecution.promptCount', 'promptCount does not match existing prompt sources', { declared: canvasExecution.promptCount, actual: promptSources.filter((item) => item?.exists).length }));
  }

  const referenceImages = Array.isArray(canvasExecution?.referenceImages) ? canvasExecution.referenceImages : [];
  for (const image of referenceImages) {
    if (!image?.artifactPath) {
      promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_reference_artifact_missing', 'canvasExecution.referenceImages', 'reference image artifactPath is missing'));
      continue;
    }
    try {
      const resolved = resolveReadableArtifactPath(image.artifactPath);
      if (!existsSync(resolved.absolutePath)) {
        promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_reference_file_missing', image.artifactPath, 'reference image file does not exist'));
      }
    } catch (error) {
      promptIssues.push(createWorkflowPreflightIssue('error', 'workflow_reference_path_invalid', image.artifactPath, 'reference image path is invalid', { error: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (canvasExecution && canvasExecution.referenceImageCount !== referenceImages.length) {
    promptIssues.push(createWorkflowPreflightIssue('warn', 'workflow_reference_count_mismatch', 'canvasExecution.referenceImageCount', 'referenceImageCount does not match referenceImages length', { declared: canvasExecution.referenceImageCount, actual: referenceImages.length }));
  }

  const nodeOutputHints = uniqueStrings(nodes.flatMap(getWorkflowNodeOutputHints));
  const executionOutputArtifacts = Array.isArray(canvasExecution?.outputArtifacts) ? canvasExecution.outputArtifacts.map(normalizeArtifactPathValue).filter(Boolean) : [];
  if (workflowMode !== 'context_pack_workflow' && nodeOutputHints.length === 0 && executionOutputArtifacts.length === 0) {
    outputIssues.push(createWorkflowPreflightIssue('warn', 'workflow_output_hint_missing', 'outputArtifactHint', 'workflow should provide output artifact hints for canvas writeback'));
  }
  for (const outputPath of [...nodeOutputHints, ...executionOutputArtifacts]) {
    try {
      resolveArtifactPath(outputPath);
    } catch (error) {
      outputIssues.push(createWorkflowPreflightIssue('error', 'workflow_output_path_invalid', outputPath, 'output artifact path is invalid', { error: error instanceof Error ? error.message : String(error) }));
    }
  }

  sections.push(createWorkflowPreflightSection('schema', 'Schema / Path', schemaIssues));
  sections.push(createWorkflowPreflightSection('canvas', 'Canvas Nodes / Connections', canvasIssues));
  sections.push(createWorkflowPreflightSection('execution', 'Canvas Execution Contract', executionIssues));
  sections.push(createWorkflowPreflightSection('prompts', 'Prompts / References', promptIssues));
  sections.push(createWorkflowPreflightSection('outputs', 'Output Writeback Hints', outputIssues));

  const issues = sections.flatMap((section) => section.issues.map((issue) => ({ ...issue, section: section.id })));
  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warnCount = issues.filter((issue) => issue.level === 'warn').length;

  return {
    ok: errorCount === 0,
    status: errorCount > 0 ? 'failed' : warnCount > 0 ? 'warn' : 'passed',
    checkedAt,
    workflowId: workflowDraft?.id ?? null,
    taskType,
    workflowMode,
    path: workflowPathValue,
    fileExists,
    nodeCount: nodes.length,
    connCount: Array.isArray(conns) ? conns.length : 0,
    promptCount: promptSources.filter((item) => item?.exists).length,
    referenceImageCount: referenceImages.length,
    outputHintCount: nodeOutputHints.length,
    outputArtifactCount: executionOutputArtifacts.length,
    errorCount,
    warnCount,
    sections,
    issues
  };
}

async function validateWorkflowDraftImport(workflowDraft, options = {}) {
  const preflight = preflightWorkflowDraft(workflowDraft, { requireFile: options.requireFile !== false, workflowPath: options.workflowPath, taskType: options.taskType });
  const blockingIssues = preflight.issues.filter((issue) => issue.level === 'error');
  const warningIssues = preflight.issues.filter((issue) => issue.level === 'warn');

  return {
    ok: blockingIssues.length === 0,
    path: preflight.path,
    importUrl: workflowDraft?.importUrl ?? workflowDraft?.canvasExecution?.importUrl ?? '',
    editUrl: workflowDraft?.editUrl ?? workflowDraft?.canvasExecution?.editUrl ?? '',
    runUrl: workflowDraft?.runUrl ?? workflowDraft?.canvasExecution?.runUrl ?? '',
    canvasExecutionOk: workflowDraft?.canvasExecution ? !preflight.sections.find((section) => section.id === 'execution')?.issues.some((issue) => issue.level === 'error') : null,
    fileExists: preflight.fileExists,
    schema: workflowDraft?.schema ?? null,
    nodeCount: preflight.nodeCount,
    connCount: preflight.connCount,
    checkedAt: preflight.checkedAt,
    issues: blockingIssues.map((issue) => `${issue.code}: ${issue.target}`),
    warnings: warningIssues.map((issue) => `${issue.code}: ${issue.target}`),
    preflight
  };
}

async function validateWorkflowRegistryItem(workflow, canvasUrl) {
  const workflowPath = path.join(smartVisionOutputsRoot, workflow?.path ?? '');
  const fileExists = Boolean(workflow?.path) && existsSync(workflowPath);
  const workflowDraft = fileExists ? await readJson(workflowPath, null) : null;

  if (!workflowDraft) {
    const importUrl = workflow?.importUrl ?? buildWorkflowImportUrl(canvasUrl, workflow?.path ?? '');

    return {
      ok: false,
      path: workflow?.path ?? '',
      importUrl,
      fileExists,
      schema: null,
      nodeCount: workflow?.nodeCount ?? 0,
      connCount: workflow?.connCount ?? 0,
      checkedAt: new Date().toISOString(),
      issues: ['workflow json not found']
    };
  }

  const importUrl = workflow.importUrl ?? buildWorkflowImportUrl(canvasUrl, workflow.path);
  const editUrl = workflow.editUrl ?? buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'edit' });
  const runUrl = workflow.runUrl ?? buildWorkflowImportUrl(canvasUrl, workflow.path, { mode: 'manual' });

  return validateWorkflowDraftImport({
    ...workflowDraft,
    path: workflowDraft.path ?? workflow.path,
    taskType: workflowDraft.taskType ?? workflow.type,
    importUrl,
    editUrl,
    runUrl
  }, { workflowPath: workflow.path, taskType: workflow.type });
}

async function preflightWorkflowDraftRequest(input = {}) {
  let workflowDraft = input.workflowDraft ?? null;
  let workflow = null;
  let requireFile = input.requireFile !== false;
  const workflowPath = input.workflowPath ?? input.path ?? null;

  if (!workflowDraft && input.workflowId) {
    const registry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
    workflow = (registry.workflows ?? []).find((item) => item.id === input.workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${input.workflowId}`);
    const workflowAbsolutePath = path.join(smartVisionOutputsRoot, workflow.path ?? '');
    workflowDraft = existsSync(workflowAbsolutePath) ? await readJson(workflowAbsolutePath, null) : null;
    if (!workflowDraft) throw new Error(`Workflow JSON not found: ${workflow.path}`);
  }

  if (!workflowDraft && workflowPath) {
    const { normalized, absolutePath } = resolveArtifactPath(workflowPath);
    workflowDraft = existsSync(absolutePath) ? await readJson(absolutePath, null) : null;
    if (!workflowDraft) throw new Error(`Workflow JSON not found: ${normalized}`);
  }

  if (!workflowDraft) {
    requireFile = false;
    workflowDraft = await buildWorkflowDraft(input.taskType ?? input.taskPlan?.taskType ?? 'asset_image_generation', input.taskPlan ?? null);
  }

  const normalizedDraft = {
    ...workflowDraft,
    path: workflowDraft.path ?? workflow?.path ?? workflowPath ?? '',
    taskType: workflowDraft.taskType ?? workflow?.type ?? input.taskType ?? input.taskPlan?.taskType
  };

  return {
    workflowDraft: normalizedDraft,
    preflight: preflightWorkflowDraft(normalizedDraft, { requireFile, workflowPath: workflow?.path ?? workflowPath ?? normalizedDraft.path, taskType: normalizedDraft.taskType }),
    importCheck: await validateWorkflowDraftImport(normalizedDraft, { requireFile, workflowPath: workflow?.path ?? workflowPath ?? normalizedDraft.path, taskType: normalizedDraft.taskType })
  };
}

async function compileTaskToWorkflowDraft(input = {}) {
  const taskPlan = input.taskPlan ?? await createWorkflowTaskPlan(input);
  const workflowDraft = await buildWorkflowDraft(taskPlan.taskType, taskPlan);
  const workflowPath = path.join(smartVisionOutputsRoot, workflowDraft.path);
  const generatedAt = new Date().toISOString();

  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeJson(workflowPath, workflowDraft);

  return {
    taskPlan,
    workflowDraft,
    importUrl: workflowDraft.importUrl,
    path: workflowDraft.path,
    persisted: true,
    importCheck: await validateWorkflowDraftImport(workflowDraft),
    generatedAt
  };
}

async function saveWorkflowDraft(taskType = 'storyboard', metadata = {}, existingWorkflowDraft = null) {
  const metadataInputArtifacts = Array.isArray(metadata.inputArtifacts) ? metadata.inputArtifacts : [];
  const metadataReferenceImages = Array.isArray(metadata.referenceImages) ? metadata.referenceImages : [];
  const metadataOutputArtifacts = Array.isArray(metadata.outputArtifacts) ? metadata.outputArtifacts : [];
  const shouldBuildTaskPlan = !existingWorkflowDraft && (
    metadata.episodeId
    || metadataInputArtifacts.length
    || metadataReferenceImages.length
    || metadataOutputArtifacts.length
  );
  const metadataTaskPlan = shouldBuildTaskPlan ? await createWorkflowTaskPlan({
    taskType,
    episodeId: metadata.episodeId,
    inputArtifacts: uniqueStrings([...metadataInputArtifacts, ...metadataReferenceImages]),
    outputArtifacts: metadataOutputArtifacts.length ? metadataOutputArtifacts : undefined,
    canvasWorkflowRequired: true
  }) : null;
  const workflowDraft = existingWorkflowDraft ?? await buildWorkflowDraft(taskType, metadataTaskPlan);
  const workflowPath = path.join(smartVisionOutputsRoot, workflowDraft.path);
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeJson(workflowPath, workflowDraft);

  const registryPath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(registryPath, {
    version: '0.1.0',
    projectId: 'infinite-awakening-001',
    canvasUrl: 'http://127.0.0.1:8877/image-studio-canvas.html',
    workflows: []
  });
  const workflowItem = {
    id: workflowDraft.id,
    name: workflowDraft.name,
    path: workflowDraft.path,
    type: workflowDraft.taskType,
    status: 'todo',
    note: metadata.note ?? '由 Smart Vision Workflow Draft Builder 自动生成。',
    source: metadata.source ?? 'workflow-draft-builder',
    sourceWorkflowId: metadata.sourceWorkflowId,
    triggeredByReviewId: metadata.triggeredByReviewId,
    triggerKind: metadata.triggerKind,
    pipelineRunId: metadata.pipelineRunId,
    pipelineStageId: metadata.pipelineStageId,
    sourceArtifactPath: metadata.sourceArtifactPath,
    chainStage: metadata.chainStage,
    version: 1,
    nodeCount: workflowDraft.canvas.nodes.length,
    connCount: workflowDraft.canvas.conns.length,
    executor: workflowDraft.canvasExecution?.executor ?? 'infinite_canvas',
    workflowMode: workflowDraft.canvasExecution?.workflowMode ?? inferCanvasWorkflowMode(workflowDraft.taskType),
    executionCarrier: workflowDraft.canvasExecution?.executionCarrier ?? 'workflow_json',
    directModelExecution: workflowDraft.canvasExecution?.directModelExecution ?? false,
    executionStrategy: workflowDraft.canvasExecution?.strategy,
    editUrl: workflowDraft.editUrl ?? workflowDraft.canvasExecution?.editUrl,
    runUrl: workflowDraft.runUrl ?? workflowDraft.canvasExecution?.runUrl,
    promptCount: workflowDraft.canvasExecution?.promptCount ?? 0,
    referenceImageCount: workflowDraft.canvasExecution?.referenceImageCount ?? 0,
    outputArtifacts: [],
    generatedAt: workflowDraft.generatedAt
  };

  registry.workflows = [
    ...(registry.workflows ?? []).filter((item) => item.id !== workflowDraft.id),
    workflowItem
  ];
  registry.note = '已接入 Smart Vision Workflow Draft Builder，支持草案落盘、登记与一键导入画布。';
  registry.updatedAt = new Date().toISOString();
  await writeJson(registryPath, registry);

  return {
    workflowDraft,
    workflow: workflowItem,
    registry,
    importCheck: await validateWorkflowDraftImport(workflowDraft),
    snapshot: await buildSnapshot()
  };
}

async function updateReviewStatus(reviewId, status) {
  if (!reviewId || !isValidStatus(status)) {
    throw new Error('Invalid reviewId or status');
  }

  const filePath = path.join(smartVisionRoot, 'review-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', reviews: [], history: [] });
  const review = ledger.reviews.find((item) => item.id === reviewId);

  if (!review) {
    throw new Error(`Review not found: ${reviewId}`);
  }

  const updatedAt = new Date().toISOString();
  review.status = status;
  review.updatedAt = updatedAt;
  ledger.history = [
    ...(ledger.history ?? []),
    {
      reviewId,
      status,
      target: review.target,
      updatedAt,
      result: status === 'done' ? 'approved' : status === 'blocked' ? 'returned_for_revision' : 'status_updated'
    }
  ];
  await writeJson(filePath, ledger);

  if (reviewId.includes('storyboard')) {
    const taskStatus = status === 'done' ? 'done' : status === 'blocked' ? 'blocked' : status;
    await updateTaskStatus('storyboard', taskStatus);
  }

  if (reviewId.includes('asset')) {
    const taskStatus = status === 'done' ? 'done' : status === 'blocked' ? 'blocked' : status;
    await updateTaskStatus('assets', taskStatus);
  }

  await applyReviewSideEffects(review, status, updatedAt);
  await updateCanvasRunSessionsByReview(review, status);

  return review;
}

async function updateTaskStatus(taskId, status) {
  if (!taskId || !isValidStatus(status)) {
    throw new Error('Invalid taskId or status');
  }

  const filePath = path.join(smartVisionRoot, 'progress-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  const task = ledger.items.find((item) => item.id === taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeJson(filePath, ledger);
  return task;
}

function getArtifactReviewType(workflowType) {
  const normalized = String(workflowType ?? '').trim().toLowerCase();

  if (normalized.includes('asset') || ['character_asset', 'scene_asset', 'prop_asset'].includes(normalized)) return 'asset_image_review';
  if (normalized.includes('storyboard')) return 'storyboard_image_review';
  if (normalized.includes('video') || normalized.includes('seedance')) return 'video_review';
  if (normalized.includes('edit') || normalized.includes('episode')) return 'episode_review';
  if (normalized.includes('qa') || normalized.includes('quality_assurance') || normalized.includes('review')) return 'qa_review';
  if (normalized.includes('release') || normalized.includes('publish')) return 'release_package_review';
  return 'artifact_review';
}

async function ensureWorkflowReview(workflow) {
  const filePath = path.join(smartVisionRoot, 'review-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', reviews: [], history: [] });
  const reviewId = `workflow-${workflow.id}-review`;
  const updatedAt = new Date().toISOString();
  let review = (ledger.reviews ?? []).find((item) => item.id === reviewId);

  if (!review) {
    review = {
      id: reviewId,
      target: workflow.path,
      status: 'waiting_review',
      type: 'workflow_review',
      workflowId: workflow.id,
      updatedAt
    };
    ledger.reviews = [...(ledger.reviews ?? []), review];
  } else {
    const nextStatus = review.status === 'done' ? 'done' : 'waiting_review';
    review.status = nextStatus;
    review.target = workflow.path;
    review.workflowId = workflow.id;
    review.updatedAt = nextStatus === 'waiting_review' ? updatedAt : review.updatedAt;
  }

  if (!ledger.history?.some((item) => item.reviewId === reviewId && item.result === 'workflow_submitted_for_review')) {
    ledger.history = [
      ...(ledger.history ?? []),
      {
        reviewId,
        status: review.status,
        target: workflow.path,
        workflowId: workflow.id,
        updatedAt,
        result: 'workflow_submitted_for_review'
      }
    ];
  }
  await writeJson(filePath, ledger);
  return review;
}

function getNextWorkflowTaskType(currentType) {
  const normalized = String(currentType ?? '').trim().toLowerCase();
  const chain = {
    character_asset: 'asset_image_generation',
    character_asset_generation: 'asset_image_generation',
    scene_asset: 'asset_image_generation',
    scene_asset_generation: 'asset_image_generation',
    prop_asset: 'asset_image_generation',
    prop_asset_generation: 'asset_image_generation',
    asset_image: 'storyboard_image_generation',
    asset_image_generation: 'storyboard_image_generation',
    asset_graph: 'asset_image_generation',
    asset_graph_generation: 'asset_image_generation',
    storyboard: 'storyboard_image_generation',
    director_storyboard: 'storyboard_image_generation',
    storyboard_image: 'video_generation',
    storyboard_image_generation: 'video_generation',
    seedance_prompt: 'video_generation',
    video_generation: 'edit',
    seedance_video_generation: 'edit',
    edit: 'qa',
    episode_editing: 'qa',
    qa: 'release',
    quality_assurance: 'release',
    review: 'release'
  };

  return chain[normalized] ?? null;
}

function getPreviousIndustrialPipelineTaskType(currentType) {
  const stage = inferIndustrialPipelineStage(currentType);
  if (!stage) return null;
  const stages = getIndustrialPipelineStages();
  const index = stages.findIndex((item) => item.id === stage.id);
  return index > 0 ? stages[index - 1].taskType : null;
}

async function appendProgressItem(item) {
  const filePath = path.join(smartVisionRoot, 'progress-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  const existing = (ledger.items ?? []).find((task) => task.id === item.id);

  if (existing) {
    Object.assign(existing, item, { updatedAt: item.updatedAt ?? new Date().toISOString() });
  } else {
    ledger.items = [...(ledger.items ?? []), item];
  }

  await writeJson(filePath, ledger);
  return item;
}

async function syncProgressItemsForWorkflow(workflowId, status, updatedAt = new Date().toISOString()) {
  if (!workflowId || !status) return { updated: false, count: 0 };

  const filePath = path.join(smartVisionRoot, 'progress-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  let count = 0;

  for (const item of ledger.items ?? []) {
    if (item.workflowId !== workflowId || item.status === status || item.status === 'done') continue;
    item.status = status;
    item.updatedAt = updatedAt;
    count += 1;
  }

  if (count > 0) await writeJson(filePath, ledger);
  return { updated: count > 0, count };
}

async function createNextWorkflowFromReview(review, updatedAt) {
  if (!review.workflowId) return null;

  const registry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
  const sourceWorkflow = (registry.workflows ?? []).find((item) => item.id === review.workflowId);
  const nextTaskType = getNextWorkflowTaskType(sourceWorkflow?.type);
  const triggerKind = review.artifactPath ? 'artifact-review' : 'workflow-review';

  if (!sourceWorkflow || !nextTaskType) return null;

  const existing = (registry.workflows ?? []).find((item) => item.sourceWorkflowId === sourceWorkflow.id && item.type === nextTaskType && item.triggerKind === triggerKind && !item.archived);

  if (existing) return existing;

  const pipelineLedger = await readPipelineRunLedger();
  const pipelineRuns = pipelineLedger.runs ?? [];
  const sourceRun = sourceWorkflow.pipelineRunId
    ? pipelineRuns.find((run) => run.id === sourceWorkflow.pipelineRunId) ?? pipelineRuns.find((run) => (run.stages ?? []).some((stage) => stage.workflowId === sourceWorkflow.id))
    : pipelineRuns.find((run) => (run.stages ?? []).some((stage) => stage.workflowId === sourceWorkflow.id));
  const sourceStage = (sourceRun?.stages ?? []).find((stage) => stage.workflowId === sourceWorkflow.id);
  const nextStage = sourceStage?.nextStageId ? (sourceRun?.stages ?? []).find((stage) => stage.id === sourceStage.nextStageId) : null;
  const workflowPathEpisodeId = normalizeArtifactPathValue(sourceWorkflow.path).match(/^02-工作流\/([^/]+)/)?.[1];
  const episodeId = sourceRun?.episodeId
    ?? workflowPathEpisodeId
    ?? inferEpisodeIdFromValue(review.artifactPath || review.target || sourceWorkflow.path || sourceWorkflow.sourceArtifactPath);

  const result = await saveWorkflowDraft(nextTaskType, {
    source: review.artifactPath ? 'artifact-review-driven-chain' : 'review-driven-chain',
    sourceWorkflowId: sourceWorkflow.id,
    triggeredByReviewId: review.id,
    triggerKind,
    sourceArtifactPath: review.artifactPath,
    episodeId,
    pipelineRunId: sourceRun?.id ?? sourceWorkflow.pipelineRunId,
    pipelineStageId: nextStage?.id,
    inputArtifacts: [review.artifactPath, sourceWorkflow.sourceArtifactPath].filter(Boolean),
    outputArtifacts: nextStage?.outputArtifacts,
    chainStage: `${sourceWorkflow.type}->${nextTaskType}`,
    note: `由${review.artifactPath ? '产物审核' : 'Workflow 审核'}通过自动创建；上游 Workflow：${sourceWorkflow.id}`
  });

  await appendProgressItem({
    id: `workflow-chain-${result.workflow.id}`,
    title: `下一阶段 Workflow：${nextTaskType}`,
    description: `由 ${sourceWorkflow.id} 的${review.artifactPath ? '产物审核' : 'Workflow 审核'}通过后自动创建。`,
    status: 'todo',
    items: [result.workflow.path, '导入画布执行', '完成后登记输出并送审'],
    workflowId: result.workflow.id,
    sourceWorkflowId: sourceWorkflow.id,
    reviewId: review.id,
    artifactPath: review.artifactPath,
    updatedAt
  });

  return result.workflow;
}

async function updateArtifactReviewRegistry(review, status, updatedAt) {
  if (!review.artifactPath) return;

  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  artifactRegistry.pendingReviews = (artifactRegistry.pendingReviews ?? []).map((item) => item.reviewId === review.id ? { ...item, status, updatedAt } : item);
  artifactRegistry.reviewHistory = [
    ...(artifactRegistry.reviewHistory ?? []),
    { reviewId: review.id, workflowId: review.workflowId, artifactPath: review.artifactPath, status, updatedAt }
  ];
  await writeJson(artifactRegistryPath, artifactRegistry);
}

async function completeWorkflowWhenArtifactReviewsDone(review, updatedAt) {
  if (!review.workflowId || !review.artifactPath) return { updated: false };

  const ledger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const workflowArtifactReviews = (ledger.reviews ?? []).filter((item) => item.workflowId === review.workflowId && item.artifactPath && item.type !== 'workflow_review');

  if (workflowArtifactReviews.length === 0) return { updated: false };
  if (workflowArtifactReviews.some((item) => item.status === 'blocked')) {
    await updateWorkflowStatus(review.workflowId, 'blocked');
    return { updated: true, status: 'blocked' };
  }

  if (workflowArtifactReviews.every((item) => item.status === 'done')) {
    await updateWorkflowStatus(review.workflowId, 'done');
    return { updated: true, status: 'done' };
  }

  return { updated: false };
}

async function applyReviewSideEffects(review, status, updatedAt) {
  await updateArtifactReviewRegistry(review, status, updatedAt);
  let nextWorkflow = null;

  if (status === 'done' && review.workflowId) {
    if (review.artifactPath) {
      nextWorkflow = await createNextWorkflowFromReview(review, updatedAt);
      await completeWorkflowWhenArtifactReviewsDone(review, updatedAt);
    } else {
      await updateWorkflowStatus(review.workflowId, 'done');
    }
  }

  if (status === 'done' && review.type === 'qa_review') {
    await ensureReleaseDraftFromQaReview(review, updatedAt, { nextWorkflow });
  }

  if (status === 'done') {
    await advancePipelineRunsFromReview(review, status, updatedAt, nextWorkflow);
  }

  if (status === 'blocked') {
    if (review.workflowId) {
      await updateWorkflowStatus(review.workflowId, 'blocked');
    }

    await appendProgressItem({
      id: `rework-${review.id}`,
      title: `返工：${review.type}`,
      description: `审核打回目标：${review.target}`,
      status: 'todo',
      items: [`修复 ${review.target}`, '重新送审'],
      reviewId: review.id,
      workflowId: review.workflowId,
      updatedAt
    });
  }
}

async function updateWorkflowStatus(workflowId, status) {
  if (!workflowId || !isValidStatus(status)) {
    throw new Error('Invalid workflowId or status');
  }

  const filePath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', workflows: [] });
  const workflow = (registry.workflows ?? []).find((item) => item.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  workflow.status = status;
  workflow.updatedAt = new Date().toISOString();

  if (status === 'waiting_review') {
    const review = await ensureWorkflowReview(workflow);
    workflow.reviewId = review.id;
  }

  registry.updatedAt = workflow.updatedAt;
  await writeJson(filePath, registry);
  await syncProgressItemsForWorkflow(workflow.id, workflow.status, workflow.updatedAt);
  return workflow;
}

async function ensureArtifactReview(workflow, artifactPath, updatedAt, options = {}) {
  const filePath = path.join(smartVisionRoot, 'review-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', reviews: [], history: [] });
  const safeArtifactId = artifactPath.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'artifact';
  const reviewId = `artifact-${workflow.id}-${safeArtifactId}-review`;
  let review = (ledger.reviews ?? []).find((item) => item.id === reviewId);
  let changed = false;

  if (!review) {
    review = {
      id: reviewId,
      target: artifactPath,
      status: 'waiting_review',
      type: getArtifactReviewType(workflow.type),
      workflowId: workflow.id,
      artifactPath,
      updatedAt
    };
    ledger.reviews = [...(ledger.reviews ?? []), review];
    changed = true;
  } else if (options.resetBlocked || review.status !== 'blocked') {
    const nextStatus = review.status === 'done' ? 'done' : 'waiting_review';
    changed = review.status !== nextStatus || review.target !== artifactPath || review.workflowId !== workflow.id || review.artifactPath !== artifactPath;
    review.status = nextStatus;
    review.target = artifactPath;
    review.workflowId = workflow.id;
    review.artifactPath = artifactPath;
    review.updatedAt = changed ? updatedAt : review.updatedAt;
  }

  if (changed) {
    ledger.history = [
      ...(ledger.history ?? []),
      {
        reviewId,
        status: review.status,
        target: artifactPath,
        workflowId: workflow.id,
        artifactPath,
        updatedAt,
        result: 'workflow_output_submitted_for_artifact_review'
      }
    ];
    await writeJson(filePath, ledger);
  }

  return review;
}

async function addWorkflowOutput(workflowId, artifactPath, options = {}) {
  if (!workflowId || !artifactPath || typeof artifactPath !== 'string') {
    throw new Error('Invalid workflowId or artifactPath');
  }

  const normalizedArtifact = artifactPath.replace(/^\/+/, '').split(path.sep).join('/');
  const { normalized } = resolveArtifactPath(normalizedArtifact);
  const filePath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', workflows: [] });
  const workflow = (registry.workflows ?? []).find((item) => item.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const updatedAt = new Date().toISOString();
  const existingOutputs = workflow.outputArtifacts ?? [];
  const outputChanged = !existingOutputs.includes(normalized);
  workflow.outputArtifacts = Array.from(new Set([...existingOutputs, normalized]));
  workflow.status = workflow.status === 'todo' || workflow.status === 'in_progress' ? 'waiting_review' : workflow.status;
  workflow.updatedAt = outputChanged || workflow.status === 'waiting_review' ? updatedAt : workflow.updatedAt;
  registry.updatedAt = workflow.updatedAt ?? updatedAt;
  await writeJson(filePath, registry);

  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  const review = await ensureArtifactReview(workflow, normalized, updatedAt, options);

  artifactRegistry.primaryArtifacts = Array.from(new Set([...(artifactRegistry.primaryArtifacts ?? []), normalized]));
  artifactRegistry.updatedAt = updatedAt;
  artifactRegistry.lastWorkflowOutput = { workflowId, artifactPath: normalized, reviewId: review.id, updatedAt, idempotent: !outputChanged };
  artifactRegistry.pendingReviews = [
    ...((artifactRegistry.pendingReviews ?? []).filter((item) => item.reviewId !== review.id)),
    { reviewId: review.id, workflowId, artifactPath: normalized, type: review.type, status: review.status, updatedAt }
  ];
  await writeJson(artifactRegistryPath, artifactRegistry);

  workflow.lastOutputReviewId = review.id;
  await writeJson(filePath, registry);
  await syncProgressItemsForWorkflow(workflow.id, workflow.status, updatedAt);

  return workflow;
}

function extractLocalPathFromCanvasValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/workbench/image-studio/file')) {
    try {
      const parsed = new URL(raw, 'http://127.0.0.1');
      return parsed.searchParams.get('path') || '';
    } catch {
      return '';
    }
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname === '/api/workbench/image-studio/file') return parsed.searchParams.get('path') || '';
    } catch {
      return '';
    }
  }
  return raw;
}

function pickCanvasOutputLocalPath(input = {}) {
  return [
    input.localPath,
    input.saved?.localPath,
    input.saved?.path,
    input.saved?.filePath,
    extractLocalPathFromCanvasValue(input.localUrl),
    extractLocalPathFromCanvasValue(input.url)
  ].map((item) => String(item || '').trim()).find(Boolean) || '';
}

function inferCanvasOutputExtension(input = {}) {
  const explicit = path.extname(String(input.artifactPath || input.outputArtifactHint || input.localPath || input.saved?.filename || input.saved?.path || '').split('?')[0]).toLowerCase();
  if (explicit) return explicit;
  const mediaType = String(input.mediaType || input.nodeType || '').toLowerCase();
  if (mediaType.includes('video') || String(input.url || '').match(/\.(mp4|mov|m4v|webm)(?:$|\?)/i)) return '.mp4';
  if (String(input.url || '').match(/\.(jpe?g|png|webp)(?:$|\?)/i)) return path.extname(String(input.url).split('?')[0]).toLowerCase();
  return '.png';
}

function inferCanvasOutputBasename(input = {}) {
  const localPath = pickCanvasOutputLocalPath(input);
  const ext = inferCanvasOutputExtension(input);
  const candidates = [
    localPath ? path.basename(localPath) : '',
    input.saved?.filename,
    input.name
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const candidate = candidates.find((item) => path.extname(item));
  if (candidate) return candidate.replace(/[^\w\u4e00-\u9fff.-]+/g, '-');
  return `${slugifyTaskType(input.workflowId || 'canvas-output')}-${slugifyTaskType(input.nodeId || input.nodeType || 'node')}${ext}`;
}

function stripWildcardToDirectory(artifactPath) {
  const normalized = normalizeArtifactPathValue(artifactPath);
  const wildcardIndex = normalized.search(/[*{}[\]]/);
  if (wildcardIndex < 0) return path.extname(normalized) ? path.posix.dirname(normalized) : normalized;
  const prefix = normalized.slice(0, wildcardIndex);
  return prefix.replace(/\/+[^/]*$/, '').replace(/\/+$/, '') || '02-工作流/canvas-outputs';
}

function inferCanvasOutputArtifactPath(input = {}) {
  const explicit = normalizeArtifactPathValue(input.artifactPath);
  if (isConcreteArtifactPath(explicit)) return explicit;

  const hint = normalizeArtifactPathValue(input.outputArtifactHint || input.lastOutputArtifactHint);
  if (isConcreteArtifactPath(hint)) return hint;

  const basename = inferCanvasOutputBasename(input);
  if (hint && !path.extname(hint) && !hasArtifactWildcard(hint)) return `${hint.replace(/\/+$/, '')}/${basename}`;
  if (hint && hasArtifactWildcard(hint)) return `${stripWildcardToDirectory(hint)}/${basename}`;

  const mediaType = String(input.mediaType || input.nodeType || '').toLowerCase();
  const fallbackDir = mediaType.includes('video') ? '03-视频' : mediaType.includes('image') || ['txt2img', 'img2imgAll', 'imageToPanorama', 'singleImage'].includes(input.nodeType) ? '01-资产图与提示词/画布回写' : '02-工作流/canvas-outputs';
  return `${fallbackDir}/${basename}`;
}

function buildCanvasOutputIdempotencyKey(input = {}, artifactPath = '') {
  return [
    input.workflowId || input.workflowDraft?.id || input.workflowPath || 'workflow',
    input.nodeId || input.nodeType || 'node',
    normalizeArtifactPathValue(artifactPath || input.artifactPath || input.outputArtifactHint || input.lastOutputArtifactHint || 'artifact')
  ].map((item) => slugifyTaskType(item)).join(':');
}

function buildVersionedArtifactPath(artifactPath) {
  const normalized = normalizeArtifactPathValue(artifactPath);
  const extension = path.posix.extname(normalized);
  const directory = path.posix.dirname(normalized);
  const basename = path.posix.basename(normalized, extension);
  return `${directory}/${basename}-${Date.now()}${extension}`;
}

function canvasOutputRecordHasFile(record = {}, fallbackArtifactPath = '') {
  const artifactPath = normalizeArtifactPathValue(record.artifactPath || fallbackArtifactPath);
  if (!artifactPath) return false;
  try {
    return existsSync(resolveArtifactPath(artifactPath).absolutePath);
  } catch {
    return false;
  }
}

async function materializeCanvasOutputArtifact(input = {}, artifactPath) {
  const localPath = pickCanvasOutputLocalPath(input);
  const sourceAbsolutePath = localPath ? path.resolve(localPath) : '';
  let finalArtifactPath = artifactPath;
  let { absolutePath: targetAbsolutePath } = resolveArtifactPath(finalArtifactPath);
  let targetExistsBefore = existsSync(targetAbsolutePath);

  if (targetExistsBefore && sourceAbsolutePath && existsSync(sourceAbsolutePath) && path.resolve(sourceAbsolutePath) !== path.resolve(targetAbsolutePath) && input.overwrite !== true && input.overwrite !== 'true') {
    finalArtifactPath = buildVersionedArtifactPath(artifactPath);
    targetAbsolutePath = resolveArtifactPath(finalArtifactPath).absolutePath;
    targetExistsBefore = existsSync(targetAbsolutePath);
  }

  if (sourceAbsolutePath && existsSync(sourceAbsolutePath) && path.resolve(sourceAbsolutePath) !== path.resolve(targetAbsolutePath)) {
    await mkdir(path.dirname(targetAbsolutePath), { recursive: true });
    await copyFile(sourceAbsolutePath, targetAbsolutePath);
  }

  return {
    artifactPath: finalArtifactPath,
    sourcePath: sourceAbsolutePath,
    targetPath: targetAbsolutePath,
    copied: Boolean(sourceAbsolutePath && existsSync(sourceAbsolutePath) && path.resolve(sourceAbsolutePath) !== path.resolve(targetAbsolutePath)),
    existedBefore: targetExistsBefore,
    exists: existsSync(targetAbsolutePath),
    sourceExists: Boolean(sourceAbsolutePath && existsSync(sourceAbsolutePath))
  };
}

async function ensureCanvasWorkflowRegistered(input = {}, options = {}) {
  const dryRun = options.dryRun === true;
  const registryPath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(registryPath, {
    version: '0.1.0',
    projectId: 'infinite-awakening-001',
    canvasUrl: 'http://127.0.0.1:8877/image-studio-canvas.html',
    workflows: []
  });
  const workflowId = input.workflowId || input.workflowDraft?.id;
  let workflow = (registry.workflows ?? []).find((item) => item.id === workflowId);
  if (workflow) return { workflow, registry, registered: false, dryRun };

  let workflowDraft = input.workflowDraft ?? null;
  const workflowPath = input.workflowPath || workflowDraft?.path;
  if (!workflowDraft && workflowPath) {
    const { absolutePath } = resolveArtifactPath(workflowPath);
    if (existsSync(absolutePath)) workflowDraft = await readJson(absolutePath, null);
  }
  if (!workflowDraft?.id) {
    throw new Error(`Canvas workflow is not registered and draft is unavailable: ${workflowId || workflowPath || 'unknown'}`);
  }

  workflow = {
    id: workflowDraft.id,
    name: workflowDraft.name ?? input.workflowName ?? workflowDraft.id,
    path: workflowDraft.path ?? workflowPath,
    type: workflowDraft.taskType ?? input.taskType ?? 'canvas_workflow',
    status: 'in_progress',
    note: '由无限画布执行结果回写自动登记。',
    source: 'canvas-output-callback',
    version: 1,
    nodeCount: workflowDraft.canvas?.nodes?.length ?? 0,
    connCount: workflowDraft.canvas?.conns?.length ?? 0,
    executor: workflowDraft.canvasExecution?.executor ?? 'infinite_canvas',
    workflowMode: workflowDraft.canvasExecution?.workflowMode ?? inferCanvasWorkflowMode(workflowDraft.taskType ?? input.taskType),
    executionCarrier: workflowDraft.canvasExecution?.executionCarrier ?? 'workflow_json',
    directModelExecution: workflowDraft.canvasExecution?.directModelExecution ?? false,
    executionStrategy: workflowDraft.canvasExecution?.strategy,
    editUrl: workflowDraft.editUrl ?? workflowDraft.canvasExecution?.editUrl,
    runUrl: workflowDraft.runUrl ?? workflowDraft.canvasExecution?.runUrl,
    promptCount: workflowDraft.canvasExecution?.promptCount ?? 0,
    referenceImageCount: workflowDraft.canvasExecution?.referenceImageCount ?? 0,
    outputArtifacts: [],
    generatedAt: workflowDraft.generatedAt,
    updatedAt: new Date().toISOString()
  };

  if (!dryRun) {
    registry.workflows = [...(registry.workflows ?? []), workflow];
    registry.note = '已接入无限画布 Workflow Adapter，支持画布执行结果自动回写。';
    registry.updatedAt = workflow.updatedAt;
    await writeJson(registryPath, registry);
  }

  return { workflow, registry, registered: true, dryRun };
}

function getCanvasRunSessionStatus(status) {
  const normalized = String(status || '').trim();
  return ['opened', 'running', 'output_registered', 'done', 'failed', 'cancelled'].includes(normalized) ? normalized : 'opened';
}

function isCanvasRunSessionClosed(session = {}) {
  return ['done', 'failed', 'cancelled'].includes(String(session.status || ''));
}

async function resolveCanvasRunSessionContext(input = {}) {
  const projectState = await readJson(path.join(smartVisionRoot, 'project-state.json'), {});
  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [], canvasUrl: 'http://127.0.0.1:8877/image-studio-canvas.html' });
  const pipelineRunLedger = await readPipelineRunLedger();
  const workflowItems = Array.isArray(workflowRegistry.workflows) ? workflowRegistry.workflows : [];
  const workflow = workflowItems.find((item) => input.workflowId && item.id === input.workflowId)
    ?? workflowItems.find((item) => input.workflowPath && item.path === input.workflowPath)
    ?? null;
  const runs = Array.isArray(pipelineRunLedger.runs) ? pipelineRunLedger.runs : [];
  const run = runs.find((item) => input.pipelineRunId && item.id === input.pipelineRunId)
    ?? runs.find((item) => workflow?.id && item.stages?.some((stage) => stage.workflowId === workflow.id || stage.workflowPath === workflow.path))
    ?? null;
  const stage = run?.stages?.find((item) => input.stageId && item.id === input.stageId)
    ?? run?.stages?.find((item) => workflow?.id && (item.workflowId === workflow.id || item.workflowPath === workflow.path))
    ?? null;
  const canvasUrl = workflowRegistry.canvasUrl ?? 'http://127.0.0.1:8877/image-studio-canvas.html';
  const workflowPath = input.workflowPath ?? workflow?.path ?? stage?.workflowPath ?? '';
  const outputArtifactHints = [
    input.outputArtifactHint,
    input.artifactPath,
    ...(Array.isArray(input.outputArtifactHints) ? input.outputArtifactHints : []),
    ...(Array.isArray(stage?.outputArtifacts) ? stage.outputArtifacts : []),
    ...(Array.isArray(workflow?.outputArtifacts) ? workflow.outputArtifacts : [])
  ].map(normalizeArtifactPathValue).filter(Boolean);

  if (!workflow?.id && !workflowPath) {
    throw new Error('Canvas run session requires workflowId or workflowPath');
  }

  return {
    projectId: projectState.projectId ?? pipelineRunLedger.projectId ?? 'infinite-awakening-001',
    episodeId: input.episodeId ?? run?.episodeId ?? projectState.currentEpisode ?? 'ep001',
    workflow,
    run,
    stage,
    workflowPath,
    outputArtifactHints: [...new Set(outputArtifactHints)],
    importUrl: input.importUrl ?? workflow?.importUrl ?? (workflowPath ? buildWorkflowImportUrl(canvasUrl, workflowPath) : ''),
    editUrl: input.editUrl ?? workflow?.editUrl ?? (workflowPath ? buildWorkflowImportUrl(canvasUrl, workflowPath, { mode: 'edit' }) : ''),
    runUrl: input.runUrl ?? workflow?.runUrl ?? (workflowPath ? buildWorkflowImportUrl(canvasUrl, workflowPath, { mode: 'manual' }) : '')
  };
}

async function createCanvasRunSession(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const now = new Date().toISOString();
  const context = await resolveCanvasRunSessionContext(input);
  const workflowId = input.workflowId ?? context.workflow?.id ?? slugifyTaskType(context.workflowPath);
  const sessionId = input.sessionId || `canvas-run-${slugifyTaskType(workflowId)}-${Date.now()}`;
  const session = {
    id: sessionId,
    projectId: context.projectId,
    episodeId: context.episodeId,
    pipelineRunId: input.pipelineRunId ?? context.run?.id ?? null,
    stageId: input.stageId ?? context.stage?.id ?? null,
    stageTitle: context.stage?.title ?? null,
    workflowId,
    workflowPath: context.workflowPath,
    workflowName: context.workflow?.name ?? input.workflowName ?? workflowId,
    workflowType: context.workflow?.type ?? input.taskType ?? null,
    status: getCanvasRunSessionStatus(input.status),
    outputArtifactHints: context.outputArtifactHints,
    importUrl: context.importUrl,
    editUrl: context.editUrl,
    runUrl: context.runUrl,
    note: input.note ?? null,
    source: input.source ?? 'production-readiness-panel',
    openedAt: now,
    createdAt: now,
    updatedAt: now,
    events: [
      {
        id: `canvas-run-event-${sessionId}-created`,
        type: 'session_created',
        status: getCanvasRunSessionStatus(input.status),
        at: now
      }
    ]
  };

  if (dryRun) {
    return {
      dryRun: true,
      status: 'preview',
      session,
      ledger: await readCanvasRunLedger(context.projectId),
      snapshot: await buildSnapshot()
    };
  }

  const ledger = await readCanvasRunLedger(context.projectId);
  ledger.sessions = [
    ...(ledger.sessions ?? []).filter((item) => item.id !== session.id),
    session
  ].slice(-100);
  ledger.events = [
    ...(ledger.events ?? []),
    {
      id: `canvas-run-ledger-event-${session.id}-${Date.now()}`,
      sessionId: session.id,
      workflowId: session.workflowId,
      pipelineRunId: session.pipelineRunId,
      stageId: session.stageId,
      type: 'session_created',
      status: session.status,
      at: now
    }
  ].slice(-300);
  await writeCanvasRunLedger(ledger);

  return {
    dryRun: false,
    status: 'created',
    session,
    ledger,
    snapshot: await buildSnapshot()
  };
}

async function updateCanvasRunSession(input = {}) {
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) throw new Error('Canvas run sessionId is required');

  const now = new Date().toISOString();
  const ledger = await readCanvasRunLedger();
  const session = (ledger.sessions ?? []).find((item) => item.id === sessionId);
  if (!session) throw new Error(`Canvas run session not found: ${sessionId}`);

  const nextStatus = getCanvasRunSessionStatus(input.status ?? session.status);
  session.status = nextStatus;
  session.updatedAt = now;
  if (nextStatus === 'running' && !session.startedAt) session.startedAt = now;
  if (isCanvasRunSessionClosed(session) && !session.closedAt) session.closedAt = now;
  if (input.note !== undefined) session.note = input.note;
  session.events = [
    ...(session.events ?? []),
    {
      id: `canvas-run-event-${session.id}-${Date.now()}`,
      type: input.eventType ?? 'status_updated',
      status: nextStatus,
      at: now
    }
  ].slice(-50);
  ledger.events = [
    ...(ledger.events ?? []),
    {
      id: `canvas-run-ledger-event-${session.id}-${Date.now()}`,
      sessionId: session.id,
      workflowId: session.workflowId,
      pipelineRunId: session.pipelineRunId,
      stageId: session.stageId,
      type: input.eventType ?? 'status_updated',
      status: nextStatus,
      at: now
    }
  ].slice(-300);
  await writeCanvasRunLedger(ledger);

  return {
    dryRun: false,
    status: 'updated',
    session,
    ledger,
    snapshot: await buildSnapshot()
  };
}

async function attachCanvasRunSessionOutput(input = {}, result = {}) {
  const sessionId = String(input.runSessionId || input.canvasRunSessionId || '').trim();
  if (!sessionId) return { updated: false, reason: 'session_not_provided' };

  const ledger = await readCanvasRunLedger();
  const session = (ledger.sessions ?? []).find((item) => item.id === sessionId);
  if (!session) return { updated: false, reason: 'session_not_found', sessionId };

  const now = new Date().toISOString();
  const outputStatus = result.status === 'failed' ? 'failed' : 'output_registered';
  session.status = outputStatus;
  session.artifactPath = result.artifactPath ?? result.materialized?.artifactPath ?? session.artifactPath ?? null;
  session.reviewId = result.reviewId ?? result.canvasOutputRecord?.reviewId ?? session.reviewId ?? null;
  session.idempotencyKey = result.idempotencyKey ?? session.idempotencyKey ?? null;
  session.materialized = result.materialized ?? session.materialized ?? null;
  session.updatedAt = now;
  if (outputStatus === 'failed') session.closedAt = session.closedAt ?? now;
  session.events = [
    ...(session.events ?? []),
    {
      id: `canvas-run-event-${session.id}-${Date.now()}`,
      type: outputStatus,
      status: outputStatus,
      artifactPath: session.artifactPath,
      reviewId: session.reviewId,
      at: now
    }
  ].slice(-50);
  ledger.events = [
    ...(ledger.events ?? []),
    {
      id: `canvas-run-ledger-event-${session.id}-${Date.now()}`,
      sessionId: session.id,
      workflowId: session.workflowId,
      pipelineRunId: session.pipelineRunId,
      stageId: session.stageId,
      type: outputStatus,
      status: outputStatus,
      artifactPath: session.artifactPath,
      reviewId: session.reviewId,
      at: now
    }
  ].slice(-300);
  await writeCanvasRunLedger(ledger);

  return { updated: true, session };
}

async function updateCanvasRunSessionsByReview(review = {}, status = '') {
  if (!review?.id) return { updated: false };
  const ledger = await readCanvasRunLedger();
  const sessions = Array.isArray(ledger.sessions) ? ledger.sessions : [];
  const matching = sessions.filter((session) => session.reviewId === review.id && !isCanvasRunSessionClosed(session));
  if (matching.length === 0) return { updated: false };

  const now = new Date().toISOString();
  const nextStatus = status === 'done' ? 'done' : status === 'blocked' ? 'failed' : 'output_registered';
  for (const session of matching) {
    session.status = nextStatus;
    session.updatedAt = now;
    if (nextStatus === 'done' || nextStatus === 'failed') session.closedAt = now;
    session.events = [
      ...(session.events ?? []),
      {
        id: `canvas-run-event-${session.id}-${Date.now()}`,
        type: 'review_status_updated',
        status: nextStatus,
        reviewStatus: status,
        reviewId: review.id,
        at: now
      }
    ].slice(-50);
    ledger.events = [
      ...(ledger.events ?? []),
      {
        id: `canvas-run-ledger-event-${session.id}-${Date.now()}`,
        sessionId: session.id,
        workflowId: session.workflowId,
        pipelineRunId: session.pipelineRunId,
        stageId: session.stageId,
        type: 'review_status_updated',
        status: nextStatus,
        reviewStatus: status,
        reviewId: review.id,
        at: now
      }
    ].slice(-300);
  }
  await writeCanvasRunLedger(ledger);
  return { updated: true, sessions: matching };
}

async function registerCanvasWorkflowOutput(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const artifactPath = inferCanvasOutputArtifactPath(input);
  const idempotencyKey = input.idempotencyKey || buildCanvasOutputIdempotencyKey(input, artifactPath);
  const workflowResult = await ensureCanvasWorkflowRegistered(input, { dryRun });
  const existingArtifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [], canvasOutputs: [] });
  const existingCanvasOutput = (existingArtifactRegistry.canvasOutputs ?? []).find((record) => record.idempotencyKey === idempotencyKey && record.status !== 'failed' && canvasOutputRecordHasFile(record, artifactPath));

  if (dryRun) {
    return {
      dryRun: true,
      status: 'preview',
      idempotencyKey,
      idempotent: Boolean(existingCanvasOutput),
      workflow: workflowResult.workflow,
      wouldRegisterWorkflow: workflowResult.registered,
      artifactPath,
      materialized: {
        artifactPath,
        sourcePath: pickCanvasOutputLocalPath(input),
        targetPath: resolveArtifactPath(artifactPath).absolutePath,
        copied: false,
        exists: existsSync(resolveArtifactPath(artifactPath).absolutePath),
        sourceExists: Boolean(pickCanvasOutputLocalPath(input) && existsSync(path.resolve(pickCanvasOutputLocalPath(input))))
      },
      reviewId: null,
      snapshot: await buildSnapshot()
    };
  }

  if (existingCanvasOutput) {
    const releaseAttach = await attachReleaseWorkflowOutputToRelease(
      workflowResult.workflow,
      existingCanvasOutput.artifactPath ?? artifactPath,
      existingCanvasOutput.reviewId ?? null,
      new Date().toISOString()
    );
    const result = {
      dryRun: false,
      status: 'idempotent',
      idempotencyKey,
      idempotent: true,
      workflow: workflowResult.workflow,
      registeredWorkflow: workflowResult.registered,
      artifactPath: existingCanvasOutput.artifactPath ?? artifactPath,
      materialized: {
        artifactPath: existingCanvasOutput.artifactPath ?? artifactPath,
        sourcePath: existingCanvasOutput.sourcePath ?? pickCanvasOutputLocalPath(input),
        targetPath: existingCanvasOutput.targetPath ?? resolveArtifactPath(existingCanvasOutput.artifactPath ?? artifactPath).absolutePath,
        copied: false,
        existedBefore: true,
        exists: canvasOutputRecordHasFile(existingCanvasOutput, artifactPath)
      },
      reviewId: existingCanvasOutput.reviewId ?? null,
      canvasOutputRecord: existingCanvasOutput,
      releaseAttach
    };
    result.canvasRunSessionAttach = await attachCanvasRunSessionOutput(input, result);
    result.snapshot = await buildSnapshot();
    return result;
  }

  const materialized = await materializeCanvasOutputArtifact(input, artifactPath);
  const updatedAt = new Date().toISOString();
  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  if (!materialized.exists) {
    const failedRecord = {
      idempotencyKey,
      status: 'failed',
      error: 'canvas_output_file_missing',
      workflowId: workflowResult.workflow.id,
      workflowPath: workflowResult.workflow.path,
      artifactPath: materialized.artifactPath,
      reviewId: null,
      nodeId: input.nodeId ?? null,
      nodeType: input.nodeType ?? null,
      mediaType: input.mediaType ?? null,
      outputArtifactHint: input.outputArtifactHint ?? null,
      sourcePath: materialized.sourcePath,
      targetPath: materialized.targetPath,
      copied: materialized.copied,
      exists: false,
      taskId: input.taskId ?? input.saved?.taskId ?? null,
      updatedAt
    };
    artifactRegistry.canvasOutputs = [
      ...((artifactRegistry.canvasOutputs ?? []).filter((record) => record.idempotencyKey !== idempotencyKey)),
      failedRecord
    ].slice(-200);
    artifactRegistry.lastCanvasOutput = failedRecord;
    artifactRegistry.updatedAt = updatedAt;
    await writeJson(artifactRegistryPath, artifactRegistry);

    const runnerLedger = await readWorkflowRunnerLedger();
    runnerLedger.events = [
      ...(runnerLedger.events ?? []),
      {
        id: `canvas-output-failed-${workflowResult.workflow.id}-${Date.now()}`,
        type: 'canvas_output_failed',
        status: 'failed',
        workflowId: workflowResult.workflow.id,
        artifactPath: materialized.artifactPath,
        error: 'canvas_output_file_missing',
        at: updatedAt
      }
    ].slice(-500);
    runnerLedger.updatedAt = updatedAt;
    await writeWorkflowRunnerLedger(runnerLedger);

    const failedResult = {
      dryRun: false,
      status: 'failed',
      idempotencyKey,
      idempotent: false,
      workflow: workflowResult.workflow,
      registeredWorkflow: workflowResult.registered,
      artifactPath: materialized.artifactPath,
      materialized,
      reviewId: null,
      canvasOutputRecord: failedRecord,
      pipelineAttach: { updated: false, updatedRuns: [] }
    };
    failedResult.canvasRunSessionAttach = await attachCanvasRunSessionOutput(input, failedResult);
    failedResult.snapshot = await buildSnapshot();
    return failedResult;
  }

  const workflow = await addWorkflowOutput(workflowResult.workflow.id, materialized.artifactPath, { resetBlocked: input.resetBlocked === true || input.resetBlocked === 'true' });
  const canvasOutputRecord = {
    idempotencyKey,
    status: 'registered',
    workflowId: workflow.id,
    workflowPath: workflow.path,
    artifactPath: materialized.artifactPath,
    reviewId: workflow.lastOutputReviewId ?? null,
    nodeId: input.nodeId ?? null,
    nodeType: input.nodeType ?? null,
    mediaType: input.mediaType ?? null,
    outputArtifactHint: input.outputArtifactHint ?? null,
    sourcePath: materialized.sourcePath,
    targetPath: materialized.targetPath,
    copied: materialized.copied,
    exists: materialized.exists,
    taskId: input.taskId ?? input.saved?.taskId ?? null,
    updatedAt
  };
  artifactRegistry.canvasOutputs = [
    ...((artifactRegistry.canvasOutputs ?? []).filter((record) => record.idempotencyKey !== idempotencyKey)),
    canvasOutputRecord
  ].slice(-200);
  artifactRegistry.lastCanvasOutput = canvasOutputRecord;
  artifactRegistry.updatedAt = updatedAt;
  await writeJson(artifactRegistryPath, artifactRegistry);

  const runnerLedger = await readWorkflowRunnerLedger();
  runnerLedger.events = [
    ...(runnerLedger.events ?? []),
    {
      id: `canvas-output-registered-${workflow.id}-${Date.now()}`,
      type: 'canvas_output_registered',
      status: materialized.exists ? 'done' : 'warn',
      workflowId: workflow.id,
      artifactPath: materialized.artifactPath,
      reviewId: workflow.lastOutputReviewId,
      at: updatedAt
    }
  ].slice(-500);
  runnerLedger.updatedAt = updatedAt;
  await writeWorkflowRunnerLedger(runnerLedger);
  const pipelineAttach = await attachCanvasOutputToPipelineRuns(workflow, materialized.artifactPath, workflow.lastOutputReviewId ?? null, updatedAt);
  const releaseAttach = await attachReleaseWorkflowOutputToRelease(workflow, materialized.artifactPath, workflow.lastOutputReviewId ?? null, updatedAt);

  const result = {
    dryRun: false,
    status: 'registered',
    idempotencyKey,
    idempotent: false,
    workflow,
    registeredWorkflow: workflowResult.registered,
    artifactPath: materialized.artifactPath,
    materialized,
    reviewId: workflow.lastOutputReviewId ?? null,
    canvasOutputRecord,
    pipelineAttach,
    releaseAttach
  };
  result.canvasRunSessionAttach = await attachCanvasRunSessionOutput(input, result);
  result.snapshot = await buildSnapshot();
  return result;
}

function findCanvasOutputRetryRecord(records = [], input = {}) {
  const requestedKey = String(input.idempotencyKey || '').trim();
  const requestedArtifact = normalizeArtifactPathValue(input.artifactPath || input.outputArtifactHint || input.lastOutputArtifactHint || '');
  const requestedWorkflowId = String(input.workflowId || '').trim();
  const requestedNodeId = String(input.nodeId || '').trim();
  const candidates = records.filter((record) => record && typeof record === 'object' && (record.status === 'failed' || input.force === true || input.force === 'true'));

  return candidates.find((record) => requestedKey && record.idempotencyKey === requestedKey)
    ?? candidates.find((record) => requestedArtifact && normalizeArtifactPathValue(record.artifactPath || record.outputArtifactHint || '') === requestedArtifact)
    ?? candidates.find((record) => requestedWorkflowId && requestedNodeId && record.workflowId === requestedWorkflowId && record.nodeId === requestedNodeId)
    ?? null;
}

function buildCanvasOutputRetryInput(record = {}, input = {}) {
  const localPath = pickCanvasOutputLocalPath(input) || record.sourcePath || '';
  return {
    ...record,
    ...input,
    dryRun: input.dryRun === true || input.dryRun === 'true',
    idempotencyKey: record.idempotencyKey || input.idempotencyKey,
    workflowId: input.workflowId || record.workflowId,
    workflowPath: input.workflowPath || record.workflowPath,
    nodeId: input.nodeId || record.nodeId,
    nodeType: input.nodeType || record.nodeType,
    mediaType: input.mediaType || record.mediaType,
    artifactPath: input.artifactPath || record.artifactPath,
    outputArtifactHint: input.outputArtifactHint || input.artifactPath || record.outputArtifactHint || record.artifactPath,
    localPath,
    resetBlocked: input.resetBlocked === true || input.resetBlocked === 'true'
  };
}

async function retryCanvasWorkflowOutput(input = {}) {
  const dryRun = input.dryRun === true || input.dryRun === 'true';
  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [], canvasOutputs: [] });
  const records = Array.isArray(artifactRegistry.canvasOutputs) ? artifactRegistry.canvasOutputs : [];
  const failedRecord = findCanvasOutputRetryRecord(records, input);

  if (!failedRecord) {
    const existingRecord = findCanvasOutputRetryRecord(records, { ...input, force: true });
    if (existingRecord && existingRecord.status !== 'failed') {
      const retryInput = buildCanvasOutputRetryInput(existingRecord, { ...input, dryRun });
      const result = await registerCanvasWorkflowOutput(retryInput);
      return {
        ...result,
        retryable: false,
        retried: false,
        failedRecord: null
      };
    }
    throw new Error(`Failed canvas output not found: ${input.idempotencyKey || input.artifactPath || input.workflowId || 'unknown'}`);
  }

  const retryInput = buildCanvasOutputRetryInput(failedRecord, { ...input, dryRun });
  const preview = await registerCanvasWorkflowOutput({ ...retryInput, dryRun: true });

  if (dryRun) {
    return {
      dryRun: true,
      status: 'preview',
      retryable: !preview.idempotent,
      idempotencyKey: retryInput.idempotencyKey,
      failedRecord,
      retryPreview: preview,
      snapshot: preview.snapshot
    };
  }

  const result = await registerCanvasWorkflowOutput(retryInput);
  const updatedAt = new Date().toISOString();
  const runnerLedger = await readWorkflowRunnerLedger();
  runnerLedger.events = [
    ...(runnerLedger.events ?? []),
    {
      id: `canvas-output-retry-${retryInput.workflowId || 'workflow'}-${Date.now()}`,
      type: 'canvas_output_retry',
      status: result.status,
      workflowId: retryInput.workflowId,
      artifactPath: result.artifactPath ?? retryInput.artifactPath,
      idempotencyKey: retryInput.idempotencyKey,
      at: updatedAt
    }
  ].slice(-500);
  runnerLedger.updatedAt = updatedAt;
  await writeWorkflowRunnerLedger(runnerLedger);

  return {
    ...result,
    retried: result.status === 'registered' || result.status === 'idempotent',
    failedRecord
  };
}

async function runWorkflowChainSelfTest(taskType = 'storyboard') {
  const normalizedTaskType = String(taskType || 'storyboard').trim() || 'storyboard';
  const saved = await saveWorkflowDraft(normalizedTaskType, {
    source: 'workflow-chain-self-test',
    triggerKind: 'self-test',
    chainStage: `self-test:${normalizedTaskType}`,
    note: '由 Smart Vision 最小闭环自测创建。'
  });
  const safeSlug = slugifyTaskType(normalizedTaskType);
  const artifactPath = `01-资产图与提示词/self-test/${safeSlug}-${saved.workflow.id}.md`;
  const artifactAbsolutePath = path.join(smartVisionOutputsRoot, artifactPath);
  await mkdir(path.dirname(artifactAbsolutePath), { recursive: true });
  await writeFile(artifactAbsolutePath, `# Smart Vision 最小闭环自测\n\n- Workflow: ${saved.workflow.id}\n- Task Type: ${normalizedTaskType}\n- Generated At: ${new Date().toISOString()}\n`, 'utf8');

  const workflowWithOutput = await addWorkflowOutput(saved.workflow.id, artifactPath);
  const reviewId = workflowWithOutput.lastOutputReviewId;

  if (!reviewId) {
    throw new Error('Self test failed: artifact review was not created');
  }

  const approvedReview = await updateReviewStatus(reviewId, 'done');
  const snapshot = await buildSnapshot();
  const nextWorkflow = (snapshot.workflowRegistry.workflows ?? []).find((item) => item.sourceWorkflowId === saved.workflow.id && item.triggeredByReviewId === reviewId && !item.archived) ?? null;
  const result = {
    status: nextWorkflow ? 'passed' : 'failed',
    sourceWorkflowId: saved.workflow.id,
    artifactPath,
    artifactReviewId: reviewId,
    approvedReviewId: approvedReview.id,
    nextWorkflowId: nextWorkflow?.id ?? null,
    nextWorkflowPath: nextWorkflow?.path ?? null,
    chainStage: nextWorkflow?.chainStage ?? null,
    checkedAt: new Date().toISOString()
  };

  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  artifactRegistry.lastWorkflowChainSelfTest = result;
  await writeJson(artifactRegistryPath, artifactRegistry);

  return {
    ...result,
    sourceWorkflow: saved.workflow,
    approvedReview,
    nextWorkflow,
    snapshot: await buildSnapshot()
  };
}

async function readReleaseRegistry() {
  const filePath = path.join(smartVisionRoot, 'release-registry.json');
  return readJson(filePath, {
    version: '0.1.0',
    projectId: 'infinite-awakening-001',
    releases: [],
    archiveHistory: [],
    note: 'Smart Vision 发布包与最终归档注册表。'
  });
}

async function writeReleaseRegistry(registry) {
  await writeJson(path.join(smartVisionRoot, 'release-registry.json'), registry);
}

function isValidReleaseStatus(status) {
  return ['draft', 'ready_for_review', 'approved', 'published', 'archived', 'restored'].includes(status);
}

function normalizeArtifactPathValue(value) {
  return String(value || '').replace(/^\/+/, '').split(path.sep).join('/');
}

function inferEpisodeIdFromValue(value, fallback = 'ep001') {
  const normalized = normalizeArtifactPathValue(value).toLowerCase();
  const segment = normalized
    .split('/')
    .find((item) => /^ep(?:\d+|-[a-z0-9]+)+$/.test(item));
  if (segment) return segment;
  const matched = normalized.match(/\bep\d+\b/);
  return matched?.[0] ?? fallback;
}

function releaseHasHistoryStatus(release, status) {
  return (release.history ?? []).some((item) => item.status === status);
}

function hasArchiveHistory(registry, releaseId) {
  return (registry.archiveHistory ?? []).some((item) => item.releaseId === releaseId);
}

function hasPublishHistory(registry, releaseId) {
  return (registry.publishHistory ?? []).some((item) => item.releaseId === releaseId);
}

function hasRestoreHistory(registry, releaseId, restoredAt) {
  return (registry.restoreHistory ?? []).some((item) => item.releaseId === releaseId && (!restoredAt || item.restoredAt === restoredAt));
}

function buildPublishHistoryItem(release, publishedAt, source = 'manual') {
  return {
    releaseId: release.id,
    episodeId: release.episodeId,
    title: release.title,
    publishedAt,
    source,
    manifestPath: release.manifestPath ?? null,
    artifactPaths: release.artifactPaths ?? []
  };
}

function buildArchiveHistoryItem(release, archivedAt) {
  return {
    releaseId: release.id,
    episodeId: release.episodeId,
    archivedAt,
    manifestPath: release.manifestPath ?? null,
    artifactPaths: release.artifactPaths ?? []
  };
}

function buildRestoreHistoryItem(release, restoredAt) {
  return {
    releaseId: release.id,
    episodeId: release.episodeId,
    restoredAt,
    manifestPath: release.manifestPath ?? null,
    artifactPaths: release.artifactPaths ?? []
  };
}

function isReleasePathMatch(release, value) {
  const normalized = normalizeArtifactPathValue(value);
  if (!normalized) return false;
  if ((release.artifactPaths ?? []).some((artifact) => normalizeArtifactPathValue(artifact) === normalized)) return true;
  if (release.manifestPath && normalizeArtifactPathValue(release.manifestPath) === normalized) return true;
  return Boolean(release.episodeId && normalized.includes(release.episodeId) && normalized.includes('qa'));
}

function getReviewForRelease(release, reviews, type) {
  if (type === 'release_package_review' && release.reviewId) {
    const byId = (reviews ?? []).find((review) => review.id === release.reviewId);
    if (byId) return byId;
  }

  return (reviews ?? []).find((review) => review.type === type && (isReleasePathMatch(release, review.artifactPath) || isReleasePathMatch(release, review.target)));
}

function getReleaseArtifactCandidates(artifactRegistry, episodeId, extraArtifacts = []) {
  const normalizedEpisode = String(episodeId || 'ep001').toLowerCase();
  const candidates = [
    ...(artifactRegistry.primaryArtifacts ?? []),
    ...extraArtifacts
  ].map((item) => normalizeArtifactPathValue(item)).filter(Boolean);

  return Array.from(new Set(candidates.filter((artifact) => {
    const lower = artifact.toLowerCase();
    if (!lower.includes(normalizedEpisode)) return false;
    return lower.includes('审核剪辑发布') || lower.startsWith(`03-视频/${normalizedEpisode}`) || lower.includes('/release/') || lower.includes('/publish/');
  })));
}

function isReleaseWorkflow(workflow) {
  const normalized = String(workflow?.type ?? '').trim().toLowerCase();
  return normalized.includes('release') || normalized.includes('publish');
}

function isReleaseManifestArtifact(artifactPath) {
  const normalized = normalizeArtifactPathValue(artifactPath).toLowerCase();
  return normalized.includes('manifest') || normalized.endsWith('.json');
}

function findReleaseForQaReview(registry, review, episodeId) {
  const reviewArtifact = normalizeArtifactPathValue(review.artifactPath ?? review.target);
  return (registry.releases ?? []).find((release) => {
    if (release.episodeId !== episodeId) return false;
    if (review.workflowId && (release.sourceWorkflowIds ?? []).includes(review.workflowId)) return true;
    if (reviewArtifact && (release.artifactPaths ?? []).some((artifact) => normalizeArtifactPathValue(artifact) === reviewArtifact)) return true;
    return Boolean(reviewArtifact && release.manifestPath && normalizeArtifactPathValue(release.manifestPath) === reviewArtifact);
  });
}

function buildAutoReleaseIdFromQaReview(episodeId, review) {
  const sourceSlug = slugifyTaskType(review.workflowId || review.id || 'qa').slice(0, 48);
  return `release-${episodeId}-auto-${sourceSlug}`;
}

function findReleaseForReleaseWorkflowOutput(registry, workflow, artifactPath) {
  const episodeId = inferEpisodeIdFromValue(artifactPath || workflow?.path || workflow?.sourceArtifactPath);
  const releases = (registry.releases ?? []).filter((release) => release.episodeId === episodeId);
  const sourceIds = [workflow?.id, workflow?.sourceWorkflowId].filter(Boolean);

  return releases.find((release) => sourceIds.some((id) => (release.sourceWorkflowIds ?? []).includes(id)))
    ?? releases.find((release) => release.status === 'draft' && release.id.includes('-auto-'))
    ?? releases.find((release) => release.status === 'ready_for_review' && release.id.includes('-auto-'))
    ?? null;
}

async function attachReleaseWorkflowOutputToRelease(workflow, artifactPath, reviewId, updatedAt = new Date().toISOString()) {
  if (!isReleaseWorkflow(workflow) || !artifactPath) return { updated: false, reason: 'not_release_workflow' };

  const registry = await readReleaseRegistry();
  const release = findReleaseForReleaseWorkflowOutput(registry, workflow, artifactPath);
  if (!release) return { updated: false, reason: 'release_not_found' };

  let changed = false;
  const nextArtifactPaths = uniqueStrings([...(release.artifactPaths ?? []), artifactPath]);
  if (nextArtifactPaths.length !== (release.artifactPaths ?? []).length) {
    release.artifactPaths = nextArtifactPaths;
    changed = true;
  }

  const nextSourceWorkflowIds = uniqueStrings([...(release.sourceWorkflowIds ?? []), workflow.id, workflow.sourceWorkflowId].filter(Boolean));
  if (nextSourceWorkflowIds.length !== (release.sourceWorkflowIds ?? []).length) {
    release.sourceWorkflowIds = nextSourceWorkflowIds;
    changed = true;
  }

  if (reviewId && release.reviewId !== reviewId) {
    release.reviewId = reviewId;
    changed = true;
  }

  if (isReleaseManifestArtifact(artifactPath) && normalizeArtifactPathValue(release.manifestPath) !== normalizeArtifactPathValue(artifactPath)) {
    release.manifestPath = artifactPath;
    changed = true;
  }

  if (release.status === 'draft') {
    release.status = 'ready_for_review';
    changed = true;
  }

  if (!changed) return { updated: false, reason: 'already_attached', releaseId: release.id, status: release.status };

  release.updatedAt = updatedAt;
  release.history = [
    ...(release.history ?? []),
    {
      status: release.status,
      at: updatedAt,
      note: `Release workflow output attached: ${artifactPath}`
    }
  ];
  registry.updatedAt = updatedAt;
  await writeReleaseRegistry(registry);
  await appendWorkflowRunnerEvent({
    type: 'release_workflow_output_attached',
    status: 'done',
    releaseId: release.id,
    workflowId: workflow.id,
    reviewId,
    artifactPath,
    at: updatedAt
  });

  return { updated: true, releaseId: release.id, status: release.status, reviewId: release.reviewId, manifestPath: release.manifestPath };
}


async function getReleasePublishGate(release, reviews) {
  const blockers = [];
  const checkedAt = new Date().toISOString();
  const releaseReview = getReviewForRelease(release, reviews, 'release_package_review');
  const qaReview = getReviewForRelease(release, reviews, 'qa_review');

  if (!['approved', 'published'].includes(release.status)) {
    blockers.push({ code: 'release_status_not_approved', message: '发布包必须先处于 approved 状态才可发布。', target: release.id });
  }

  if (!qaReview) {
    blockers.push({ code: 'release_qa_review_missing', message: '未找到匹配当前发布包的 QA review。', target: release.id });
  } else if (qaReview.status !== 'done') {
    blockers.push({ code: 'release_qa_review_not_done', message: `QA review 尚未完成：${qaReview.status}`, target: qaReview.target, reviewId: qaReview.id });
  }

  if (!releaseReview) {
    blockers.push({ code: 'release_review_missing', message: '未找到发布包 release review。', target: release.id, reviewId: release.reviewId });
  } else if (releaseReview.status !== 'done') {
    blockers.push({ code: 'release_review_not_done', message: `Release review 尚未完成：${releaseReview.status}`, target: releaseReview.target, reviewId: releaseReview.id });
  }

  if (!release.manifestPath) {
    blockers.push({ code: 'release_manifest_missing', message: '发布包缺少 manifestPath。', target: release.id });
  } else {
    try {
      const { absolutePath } = resolveArtifactPath(release.manifestPath);
      if (!existsSync(absolutePath)) blockers.push({ code: 'release_manifest_file_missing', message: '发布包 manifest 文件不存在。', target: release.manifestPath });
    } catch (error) {
      blockers.push({ code: 'release_manifest_path_invalid', message: error instanceof Error ? error.message : String(error), target: release.manifestPath });
    }
  }

  if ((release.artifactPaths ?? []).length === 0) {
    blockers.push({ code: 'release_artifacts_empty', message: '发布包未绑定任何 artifact。', target: release.id });
  }

  for (const artifactPath of release.artifactPaths ?? []) {
    const normalizedArtifact = normalizeArtifactPathValue(artifactPath);
    try {
      const { absolutePath } = resolveArtifactPath(normalizedArtifact);
      if (!existsSync(absolutePath)) blockers.push({ code: 'release_artifact_missing', message: '发布包 artifact 文件不存在。', target: normalizedArtifact });
    } catch (error) {
      blockers.push({ code: 'release_artifact_path_invalid', message: error instanceof Error ? error.message : String(error), target: normalizedArtifact });
    }
  }

  return {
    canPublish: blockers.length === 0,
    checkedAt,
    blockers
  };
}

async function enrichReleaseRegistry(registry, reviews) {
  return {
    ...registry,
    releases: await Promise.all((Array.isArray(registry.releases) ? registry.releases : []).map(async (release) => ({
      ...release,
      publishGate: await getReleasePublishGate(release, reviews)
    })))
  };
}

async function assertReleasePublishGate(release) {
  const ledger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const gate = await getReleasePublishGate(release, ledger.reviews ?? []);

  if (!gate.canPublish) {
    const summary = gate.blockers.map((item) => `${item.code}${item.target ? `:${item.target}` : ''}`).join(', ');
    throw new Error(`Release publish gate blocked: ${summary}`);
  }

  return gate;
}

function getAllowedNextReleaseStatuses(status) {
  const transitions = {
    draft: ['ready_for_review'],
    ready_for_review: ['approved', 'draft'],
    approved: ['published', 'archived'],
    published: ['archived'],
    archived: ['restored'],
    restored: ['ready_for_review']
  };

  return transitions[status] ?? [];
}

async function ensureReleaseReview(release, updatedAt) {
  const filePath = path.join(smartVisionRoot, 'review-ledger.json');
  const ledger = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', reviews: [], history: [] });
  const reviewId = release.reviewId || `release-${release.id}-review`;
  let review = (ledger.reviews ?? []).find((item) => item.id === reviewId);
  let changed = false;

  if (!review) {
    review = {
      id: reviewId,
      target: release.manifestPath ?? release.id,
      status: 'waiting_review',
      type: 'release_package_review',
      artifactPath: release.manifestPath ?? release.artifactPaths?.[0],
      updatedAt
    };
    ledger.reviews = [...(ledger.reviews ?? []), review];
    changed = true;
  } else {
    const nextStatus = review.status === 'done' ? 'done' : 'waiting_review';
    changed = review.status !== nextStatus || review.target !== (release.manifestPath ?? release.id) || review.artifactPath !== (release.manifestPath ?? release.artifactPaths?.[0]);
    review.status = nextStatus;
    review.target = release.manifestPath ?? release.id;
    review.type = 'release_package_review';
    review.artifactPath = release.manifestPath ?? release.artifactPaths?.[0];
    review.updatedAt = changed ? updatedAt : review.updatedAt;
  }

  if (changed) {
    ledger.history = [
      ...(ledger.history ?? []),
      {
        reviewId,
        status: review.status,
        target: review.target,
        artifactPath: review.artifactPath,
        updatedAt,
        result: 'release_package_submitted_for_review'
      }
    ];
    await writeJson(filePath, ledger);
  }

  return review;
}

async function createReleasePackage(input = {}) {
  const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [] });
  const registry = await readReleaseRegistry();
  const now = new Date().toISOString();
  const episodeId = String(input.episodeId || 'ep001');
  const releaseId = String(input.releaseId || `release-${episodeId}-${Date.now()}`);
  const artifactPaths = Array.isArray(input.artifactPaths) && input.artifactPaths.length > 0 ? input.artifactPaths.map((item) => normalizeArtifactPathValue(item)) : (artifactRegistry.primaryArtifacts ?? []).filter((artifact) => artifact.includes('审核剪辑发布') || artifact.includes('03-视频/'));
  const release = {
    id: releaseId,
    title: input.title || `${episodeId.toUpperCase()} 发布包`,
    episodeId,
    status: input.status && isValidReleaseStatus(input.status) ? input.status : 'draft',
    artifactPaths: Array.from(new Set(artifactPaths)),
    sourceWorkflowIds: Array.isArray(input.sourceWorkflowIds) ? input.sourceWorkflowIds : [],
    reviewId: input.reviewId || `release-${releaseId}-review`,
    manifestPath: input.manifestPath ? normalizeArtifactPathValue(input.manifestPath) : artifactPaths.find((artifact) => artifact.includes('release-manifest')) || null,
    createdAt: now,
    updatedAt: now,
    history: [{ status: input.status && isValidReleaseStatus(input.status) ? input.status : 'draft', at: now, note: '创建发布包注册记录' }]
  };

  const review = await ensureReleaseReview(release, now);
  release.reviewId = review.id;
  registry.releases = [...(registry.releases ?? []).filter((item) => item.id !== releaseId), release];
  registry.updatedAt = now;
  await writeReleaseRegistry(registry);
  const reviews = (await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] })).reviews ?? [];
  return { release: { ...release, publishGate: await getReleasePublishGate(release, reviews) }, registry: await enrichReleaseRegistry(registry, reviews), review, snapshot: await buildSnapshot() };
}

async function ensureReleaseDraftFromQaReview(review, updatedAt, options = {}) {
  if (review.type !== 'qa_review' || review.status !== 'done') return null;

  const episodeId = inferEpisodeIdFromValue(review.artifactPath ?? review.target);
  const registry = await readReleaseRegistry();
  const existingRelease = findReleaseForQaReview(registry, review, episodeId);

  if (existingRelease) {
    await appendWorkflowRunnerEvent({
      type: 'release_draft_exists_for_qa',
      status: 'skipped',
      releaseId: existingRelease.id,
      workflowId: review.workflowId,
      reviewId: review.id,
      at: updatedAt
    });
    return { created: false, release: existingRelease };
  }

  const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [] });
  const artifactPaths = getReleaseArtifactCandidates(artifactRegistry, episodeId, [review.artifactPath, review.target]);
  const releaseId = buildAutoReleaseIdFromQaReview(episodeId, review);
  const result = await createReleasePackage({
    releaseId,
    episodeId,
    title: `${episodeId.toUpperCase()} 自动发布草稿`,
    artifactPaths,
    sourceWorkflowIds: uniqueStrings([review.workflowId, options.nextWorkflow?.id].filter(Boolean)),
    manifestPath: artifactPaths.find((artifact) => artifact.includes('release-manifest')) ?? artifactPaths.find((artifact) => artifact.includes('manifest')) ?? undefined,
    status: 'draft'
  });

  await appendProgressItem({
    id: `release-draft-${releaseId}`,
    title: `发布草稿：${episodeId.toUpperCase()}`,
    description: `QA review ${review.id} 完成后自动创建 release draft。`,
    status: 'todo',
    items: [result.release.manifestPath ?? 'manifest 待补齐', '送审 release review', '批准后进入发布队列'],
    workflowId: options.nextWorkflow?.id ?? review.workflowId,
    sourceWorkflowId: review.workflowId,
    reviewId: review.id,
    artifactPath: review.artifactPath,
    releaseId,
    updatedAt
  });

  await appendWorkflowRunnerEvent({
    type: 'release_draft_created_from_qa',
    status: 'done',
    releaseId,
    workflowId: review.workflowId,
    reviewId: review.id,
    at: updatedAt
  });

  return { created: true, release: result.release, review: result.review };
}

async function updateReleasePackageStatus(releaseId, status, note = '') {
  if (!releaseId || !isValidReleaseStatus(status)) {
    throw new Error('Invalid releaseId or status');
  }

  const registry = await readReleaseRegistry();
  const release = (registry.releases ?? []).find((item) => item.id === releaseId);

  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const allowedStatuses = getAllowedNextReleaseStatuses(release.status);

  if (release.status !== status && !allowedStatuses.includes(status)) {
    throw new Error(`Invalid release status transition: ${release.status} -> ${status}`);
  }

  const now = new Date().toISOString();

  if (status === 'approved') {
    const review = release.reviewId ? (await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] })).reviews?.find((item) => item.id === release.reviewId) : null;

    if (!review) {
      throw new Error(`Release review is required before approval: ${release.reviewId ?? release.id}`);
    }

    if (review.status !== 'done') {
      throw new Error(`Release review must be done before approval: ${release.reviewId} is ${review.status}`);
    }
  }

  if (status === 'published') {
    await assertReleasePublishGate(release);
  }

  release.status = status;
  release.updatedAt = now;
  if (status === 'ready_for_review') {
    const review = await ensureReleaseReview(release, now);
    release.reviewId = review.id;
  }
  if (status === 'approved') {
    const review = await ensureReleaseReview({ ...release, status: 'approved' }, now);
    release.reviewId = review.id;
    release.approvedAt = now;
  }
  if (status === 'published') {
    if (!release.approvedAt) release.approvedAt = now;
    if (!releaseHasHistoryStatus(release, 'approved')) release.history = [...(release.history ?? []), { status: 'approved', at: now, note: '发布前自动补齐批准状态' }];
    release.publishedAt = now;
  }
  if (status === 'archived') release.archivedAt = now;
  if (status === 'restored') {
    release.restoredAt = now;
    delete release.archivedAt;
  }
  release.history = [...(release.history ?? []), { status, at: now, note: note || `发布包状态更新为 ${status}` }];

  if (status === 'archived') {
    registry.archiveHistory = [...(registry.archiveHistory ?? []), buildArchiveHistoryItem(release, now)];
  }

  if (status === 'published' && !hasPublishHistory(registry, releaseId)) {
    registry.publishHistory = [...(registry.publishHistory ?? []), buildPublishHistoryItem(release, now, note?.includes('发布队列') ? 'publish_queue' : 'manual')];
  }

  if (status === 'restored' && !hasRestoreHistory(registry, releaseId, now)) {
    registry.restoreHistory = [...(registry.restoreHistory ?? []), buildRestoreHistoryItem(release, now)];
  }

  registry.updatedAt = now;
  await writeReleaseRegistry(registry);
  if (status === 'approved') {
    await enqueueReleasePublish(release, now, 'release_approved');
  }
  const reviews = (await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] })).reviews ?? [];
  return { release: { ...release, publishGate: await getReleasePublishGate(release, reviews) }, registry: await enrichReleaseRegistry(registry, reviews), snapshot: await buildSnapshot() };
}

async function repairReleasePackage(releaseId) {
  if (!releaseId) {
    throw new Error('releaseId is required');
  }

  const updatedAt = new Date().toISOString();
  const registry = await readReleaseRegistry();
  const release = (registry.releases ?? []).find((item) => item.id === releaseId);

  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const beforeGate = await getReleasePublishGate(release, reviewLedger.reviews ?? []);
  const repairs = [];

  const normalizedArtifacts = Array.from(new Set((release.artifactPaths ?? []).map((item) => normalizeArtifactPathValue(item)).filter(Boolean)));
  if (normalizedArtifacts.length !== (release.artifactPaths ?? []).length || normalizedArtifacts.some((item, index) => item !== release.artifactPaths?.[index])) {
    release.artifactPaths = normalizedArtifacts;
    repairs.push({ code: 'release_artifacts_normalized', message: '已归一并去重 artifactPaths。' });
  }

  if (!release.manifestPath) {
    const inferredManifest = normalizedArtifacts.find((artifact) => artifact.includes('release-manifest')) ?? normalizedArtifacts.find((artifact) => artifact.includes('manifest')) ?? null;
    if (inferredManifest) {
      release.manifestPath = inferredManifest;
      repairs.push({ code: 'release_manifest_inferred', message: `已从 artifacts 推断 manifest：${inferredManifest}` });
    }
  } else {
    const normalizedManifest = normalizeArtifactPathValue(release.manifestPath);
    if (normalizedManifest !== release.manifestPath) {
      release.manifestPath = normalizedManifest;
      repairs.push({ code: 'release_manifest_normalized', message: '已归一 manifestPath。' });
    }
  }

  const releaseReview = getReviewForRelease(release, reviewLedger.reviews ?? [], 'release_package_review');
  if (releaseReview && release.reviewId !== releaseReview.id) {
    release.reviewId = releaseReview.id;
    repairs.push({ code: 'release_review_attached', message: `已关联已有 Release review：${releaseReview.id}` });
  }

  if (!release.reviewId || !(reviewLedger.reviews ?? []).some((review) => review.id === release.reviewId)) {
    const review = await ensureReleaseReview(release, updatedAt);
    release.reviewId = review.id;
    repairs.push({ code: 'release_review_created', message: `已创建 Release review：${review.id}` });
  }

  release.history = release.history ?? [];

  if (release.status === 'approved' && !release.approvedAt) {
    release.approvedAt = updatedAt;
    repairs.push({ code: 'release_approved_at_added', message: '已补齐 approvedAt。' });
  }

  if (release.status === 'published') {
    if (!release.approvedAt) {
      release.approvedAt = updatedAt;
      repairs.push({ code: 'release_approved_at_added', message: '已补齐 published 前 approvedAt。' });
    }
    if (!releaseHasHistoryStatus(release, 'approved')) {
      release.history = [{ status: 'approved', at: release.approvedAt, note: '单项修复补齐发布前批准记录' }, ...release.history];
      repairs.push({ code: 'release_approved_history_added', message: '已补齐发布前 approved 历史。' });
    }
    if (!release.publishedAt) {
      release.publishedAt = updatedAt;
      repairs.push({ code: 'release_published_at_added', message: '已补齐 publishedAt。' });
    }
    if (!hasPublishHistory(registry, release.id)) {
      registry.publishHistory = [...(registry.publishHistory ?? []), buildPublishHistoryItem(release, release.publishedAt ?? updatedAt, 'repair')];
      repairs.push({ code: 'release_publish_history_added', message: '已补齐发布历史。' });
    }
  }

  if (release.status === 'archived') {
    if (!release.archivedAt) {
      release.archivedAt = updatedAt;
      repairs.push({ code: 'release_archived_at_added', message: '已补齐 archivedAt。' });
    }
    if (!hasArchiveHistory(registry, release.id)) {
      registry.archiveHistory = [...(registry.archiveHistory ?? []), buildArchiveHistoryItem(release, release.archivedAt ?? updatedAt)];
      repairs.push({ code: 'release_archive_history_added', message: '已补齐归档历史。' });
    }
  }

  if (release.status === 'restored' && release.archivedAt) {
    delete release.archivedAt;
    repairs.push({ code: 'release_restored_archived_at_removed', message: '已清理 restored 状态下的 archivedAt。' });
  }
  if (release.status === 'restored' && !hasRestoreHistory(registry, release.id, release.restoredAt)) {
    registry.restoreHistory = [...(registry.restoreHistory ?? []), buildRestoreHistoryItem(release, release.restoredAt ?? updatedAt)];
    repairs.push({ code: 'release_restore_history_added', message: '已补齐恢复历史。' });
  }

  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [] });
  const primaryArtifactSet = new Set(artifactRegistry.primaryArtifacts ?? []);
  let indexedArtifactCount = 0;
  for (const artifactPath of [release.manifestPath, ...(release.artifactPaths ?? [])].filter(Boolean)) {
    if (!primaryArtifactSet.has(artifactPath)) {
      primaryArtifactSet.add(artifactPath);
      indexedArtifactCount += 1;
    }
  }

  if (indexedArtifactCount > 0) {
    artifactRegistry.primaryArtifacts = Array.from(primaryArtifactSet);
    artifactRegistry.updatedAt = updatedAt;
    await writeJson(artifactRegistryPath, artifactRegistry);
    repairs.push({ code: 'release_artifacts_indexed', message: `已补充 ${indexedArtifactCount} 个发布产物到 Artifact Registry。` });
  }

  if (repairs.length > 0) {
    release.updatedAt = updatedAt;
    release.history = [
      ...release.history,
      { status: release.status, at: updatedAt, note: `单项修复：${repairs.map((item) => item.code).join(', ')}` }
    ];
    registry.updatedAt = updatedAt;
    await writeReleaseRegistry(registry);
  }

  const nextReviews = (await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] })).reviews ?? [];
  const afterGate = await getReleasePublishGate(release, nextReviews);
  const diagnostics = await diagnoseWorkflowRuntime();
  const enrichedRegistry = await enrichReleaseRegistry(registry, nextReviews);
  const enrichedRelease = (enrichedRegistry.releases ?? []).find((item) => item.id === release.id) ?? { ...release, publishGate: afterGate };

  return {
    release: enrichedRelease,
    registry: enrichedRegistry,
    repairs,
    beforeGate,
    afterGate,
    repairedAt: updatedAt,
    diagnostics,
    snapshot: await buildSnapshot()
  };
}

async function archiveWorkflow(workflowId) {
  if (!workflowId) {
    throw new Error('Invalid workflowId');
  }

  const filePath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', workflows: [] });
  const workflow = (registry.workflows ?? []).find((item) => item.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const updatedAt = new Date().toISOString();
  workflow.archived = true;
  workflow.archivedAt = updatedAt;
  workflow.statusBeforeArchive = workflow.status;
  workflow.status = 'blocked';
  workflow.updatedAt = updatedAt;
  registry.updatedAt = updatedAt;
  await writeJson(filePath, registry);
  return workflow;
}

async function restoreWorkflow(workflowId) {
  if (!workflowId) {
    throw new Error('Invalid workflowId');
  }

  const filePath = path.join(smartVisionRoot, 'workflow-registry.json');
  const registry = await readJson(filePath, { version: '0.1.0', projectId: 'infinite-awakening-001', workflows: [] });
  const workflow = (registry.workflows ?? []).find((item) => item.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const restoredStatus = isValidStatus(workflow.statusBeforeArchive) ? workflow.statusBeforeArchive : 'todo';
  const updatedAt = new Date().toISOString();
  workflow.archived = false;
  workflow.restoredAt = updatedAt;
  workflow.status = restoredStatus;
  workflow.updatedAt = updatedAt;
  delete workflow.archivedAt;
  delete workflow.statusBeforeArchive;
  registry.updatedAt = updatedAt;
  await writeJson(filePath, registry);
  return workflow;
}

function buildWorkflowImportUrl(canvasUrl, workflowPath, params = {}) {
  const searchParams = new URLSearchParams({
    workflowPath,
    bridgeBase: getBridgeBaseUrl(),
    ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== false).map(([key, value]) => [key, String(value)]))
  });
  return `${canvasUrl}${String(canvasUrl).includes('?') ? '&' : '?'}${searchParams.toString()}`;
}

async function getWorkflowChainRuntime(workflowId) {
  const snapshot = await buildSnapshot();
  const registry = snapshot.workflowRegistry;
  const chains = registry.chains ?? [];

  if (!workflowId) {
    return {
      chains,
      runtime: {
        status: 'ready',
        chainCount: chains.length,
        openActionCount: chains.filter((item) => !item.closed).length,
        closedChainCount: chains.filter((item) => item.closed).length,
        updatedAt: registry.updatedAt ?? new Date().toISOString()
      },
      snapshot
    };
  }

  const chain = chains.find((item) => item.workflowId === workflowId);
  const workflow = registry.workflows.find((item) => item.id === workflowId);

  if (!chain || !workflow) {
    throw new Error(`Workflow chain not found: ${workflowId}`);
  }

  const downstreamWorkflows = registry.workflows.filter((item) => item.sourceWorkflowId === workflowId && !item.archived);
  const reviews = snapshot.reviews.filter((item) => item.workflowId === workflowId || item.id === workflow.reviewId || item.id === workflow.lastOutputReviewId);

  return {
    chain,
    workflow,
    downstreamWorkflows,
    reviews,
    importUrl: buildWorkflowImportUrl(registry.canvasUrl, workflow.path),
    snapshot
  };
}

async function executeWorkflowChainAction({ workflowId, action, artifactPath, status }) {
  if (!workflowId) {
    throw new Error('workflowId is required');
  }

  const runtime = await getWorkflowChainRuntime(workflowId);
  const chain = runtime.chain;
  const workflow = runtime.workflow;
  const selectedAction = action ?? chain.nextAction;
  let result = null;

  if (selectedAction === 'import_workflow') {
    result = { importUrl: runtime.importUrl, workflowPath: workflow.path };
  } else if (selectedAction === 'import_downstream_workflow') {
    const downstream = runtime.downstreamWorkflows[0];

    if (!downstream) {
      throw new Error(`Downstream workflow not found: ${workflowId}`);
    }

    result = { importUrl: buildWorkflowImportUrl(runtime.snapshot.workflowRegistry.canvasUrl, downstream.path), workflowPath: downstream.path, workflowId: downstream.id };
  } else if (selectedAction === 'add_output') {
    result = artifactPath ? await addWorkflowOutput(workflowId, artifactPath) : await updateWorkflowStatus(workflowId, 'in_progress');
  } else if (selectedAction === 'create_artifact_review') {
    result = await updateWorkflowStatus(workflowId, 'waiting_review');
  } else if (selectedAction === 'approve_artifact_review' || selectedAction === 'create_downstream_workflow') {
    if (!chain.lastOutputReviewId) {
      throw new Error(`Artifact review not found for workflow: ${workflowId}`);
    }

    result = await updateReviewStatus(chain.lastOutputReviewId, 'done');
  } else if (selectedAction === 'fix_artifact_output') {
    if (status === 'blocked' && chain.lastOutputReviewId) {
      result = await updateReviewStatus(chain.lastOutputReviewId, 'blocked');
    } else {
      result = { artifactPath: chain.actionTarget, reviewId: chain.lastOutputReviewId };
    }
  } else if (selectedAction === 'archive_workflow') {
    result = await archiveWorkflow(workflowId);
  } else if (selectedAction === 'restore_workflow') {
    result = await restoreWorkflow(workflowId);
  } else {
    throw new Error(`Unsupported workflow chain action: ${selectedAction}`);
  }

  const nextRuntime = await getWorkflowChainRuntime(workflowId).catch(async () => getWorkflowChainRuntime(null));

  return {
    action: selectedAction,
    result,
    runtime: nextRuntime,
    snapshot: nextRuntime.snapshot
  };
}

function collectRunnerArchiveIssues(runnerLedger = {}) {
  const issues = [];
  const runnerArchives = runnerLedger.archives ?? {};
  const archiveKeys = ['taskQueue', 'releasePublishQueue', 'taskQueueRuns', 'releasePublishRuns', 'events'];

  if (runnerLedger.archives && (typeof runnerLedger.archives !== 'object' || Array.isArray(runnerLedger.archives))) {
    issues.push({ level: 'error', code: 'runner_archives_invalid', target: 'workflow-runner-ledger.archives', message: 'archives must be an object' });
    return issues;
  }

  for (const archiveKey of archiveKeys) {
    if (runnerArchives[archiveKey] !== undefined && !Array.isArray(runnerArchives[archiveKey])) {
      issues.push({ level: 'error', code: 'runner_archive_bucket_invalid', target: `archives.${archiveKey}`, message: 'archive bucket must be an array' });
    }
  }

  if (runnerArchives.lastCompactedAt && Number.isNaN(Date.parse(runnerArchives.lastCompactedAt))) {
    issues.push({ level: 'warn', code: 'runner_archive_last_compacted_at_invalid', target: 'archives.lastCompactedAt', message: String(runnerArchives.lastCompactedAt) });
  }

  const activeTaskIds = new Set((runnerLedger.taskQueue ?? []).map((item) => item.id).filter(Boolean));
  for (const item of Array.isArray(runnerArchives.taskQueue) ? runnerArchives.taskQueue : []) {
    if (item.id && activeTaskIds.has(item.id)) {
      issues.push({ level: 'warn', code: 'runner_archive_duplicate_active_task', target: item.id });
    }
  }

  const activeReleaseQueueIds = new Set((runnerLedger.releasePublishQueue ?? []).map((item) => item.id).filter(Boolean));
  for (const item of Array.isArray(runnerArchives.releasePublishQueue) ? runnerArchives.releasePublishQueue : []) {
    if (item.id && activeReleaseQueueIds.has(item.id)) {
      issues.push({ level: 'warn', code: 'runner_archive_duplicate_active_release', target: item.id });
    }
  }

  return issues;
}

function collectWorkflowRegistryIssues(workflowRegistry = {}) {
  const issues = [];
  const workflows = workflowRegistry.workflows;
  const chains = workflowRegistry.chains;

  if (!Array.isArray(workflows)) {
    issues.push({ level: 'error', code: 'workflow_registry_workflows_invalid', target: 'workflow-registry.workflows', message: 'workflows must be an array' });
    return issues;
  }

  if (chains !== undefined && !Array.isArray(chains)) {
    issues.push({ level: 'warn', code: 'workflow_registry_chains_invalid', target: 'workflow-registry.chains', message: 'chains must be an array' });
  }

  const seenWorkflowIds = new Set();
  for (const workflow of workflows) {
    const workflowId = workflow?.id ?? 'unknown-workflow';

    if (!workflow || typeof workflow !== 'object') {
      issues.push({ level: 'error', code: 'workflow_registry_item_invalid', target: 'workflow-registry.workflows', message: 'workflow item must be an object' });
      continue;
    }

    if (!workflow.id) {
      issues.push({ level: 'error', code: 'workflow_id_missing', target: workflowId });
    } else if (seenWorkflowIds.has(workflow.id)) {
      issues.push({ level: 'warn', code: 'workflow_registry_duplicate_workflow', target: workflow.id });
    } else {
      seenWorkflowIds.add(workflow.id);
    }

    if (!workflow.path) {
      issues.push({ level: 'error', code: 'workflow_path_missing', workflowId, target: workflowId });
    } else {
      try {
        resolveArtifactPath(workflow.path);
      } catch (error) {
        issues.push({ level: 'error', code: 'workflow_path_invalid', workflowId, target: workflow.path, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (!isValidStatus(workflow.status)) {
      issues.push({ level: 'warn', code: 'workflow_status_invalid', workflowId, target: workflowId, message: String(workflow.status ?? 'missing') });
    }

    if (workflow.outputArtifacts !== undefined && !Array.isArray(workflow.outputArtifacts)) {
      issues.push({ level: 'error', code: 'workflow_output_artifacts_invalid', workflowId, target: workflowId, message: 'outputArtifacts must be an array' });
    }
  }

  return issues;
}

function collectReviewLedgerIssues(reviewLedger = {}, workflowRegistry = {}, artifactRegistry = {}) {
  const issues = [];
  const reviews = reviewLedger.reviews;
  const history = reviewLedger.history;
  const workflows = Array.isArray(workflowRegistry.workflows) ? workflowRegistry.workflows : [];
  const artifactListAvailable = Array.isArray(artifactRegistry.primaryArtifacts);
  const artifacts = new Set(artifactListAvailable ? artifactRegistry.primaryArtifacts : []);
  const validReviewStatuses = new Set(['waiting_review', 'in_progress', 'done', 'blocked', 'pending', 'approved', 'rejected']);

  if (!Array.isArray(reviews)) {
    issues.push({ level: 'error', code: 'review_ledger_reviews_invalid', target: 'review-ledger.reviews', message: 'reviews must be an array' });
    return issues;
  }

  if (history !== undefined && !Array.isArray(history)) {
    issues.push({ level: 'warn', code: 'review_ledger_history_invalid', target: 'review-ledger.history', message: 'history must be an array' });
  }

  const seenReviewIds = new Set();
  for (const review of reviews) {
    const reviewId = review?.id ?? 'unknown-review';

    if (!review || typeof review !== 'object') {
      issues.push({ level: 'error', code: 'review_ledger_item_invalid', target: 'review-ledger.reviews', message: 'review item must be an object' });
      continue;
    }

    if (!review.id) {
      issues.push({ level: 'error', code: 'review_id_missing', target: reviewId });
    } else if (seenReviewIds.has(review.id)) {
      issues.push({ level: 'warn', code: 'review_ledger_duplicate_review', reviewId: review.id, target: review.target ?? review.artifactPath ?? review.id });
    } else {
      seenReviewIds.add(review.id);
    }

    if (!validReviewStatuses.has(review.status)) {
      issues.push({ level: 'warn', code: 'review_status_invalid', reviewId, target: review.target ?? review.artifactPath ?? reviewId, message: String(review.status ?? 'missing') });
    }

    if (review.workflowId && workflows.length > 0 && !workflows.some((workflow) => workflow.id === review.workflowId)) {
      issues.push({ level: 'warn', code: 'review_ledger_workflow_missing', reviewId, target: review.workflowId });
    }

    if (review.artifactPath && artifactListAvailable && !artifacts.has(review.artifactPath)) {
      issues.push({ level: 'warn', code: 'review_ledger_artifact_not_indexed', reviewId, target: review.artifactPath });
    }
  }

  if (Array.isArray(history)) {
    for (const item of history) {
      if (item?.reviewId && !seenReviewIds.has(item.reviewId)) {
        issues.push({ level: 'warn', code: 'review_ledger_history_orphan', reviewId: item.reviewId, target: item.artifactPath ?? item.target ?? item.reviewId });
      }
    }
  }

  return issues;
}

function collectPipelineRunIssues(pipelineLedger = {}, reviewLedger = {}, workflowRegistry = {}) {
  const issues = [];
  const runs = pipelineLedger.runs;
  const events = pipelineLedger.events;
  const reviews = reviewLedger.reviews ?? [];
  const workflows = workflowRegistry.workflows ?? [];
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const validRunStatuses = new Set(['queued', 'running', 'done', 'blocked', 'failed']);
  const validStageStatuses = new Set(['queued', 'workflow_ready', 'waiting_output', 'waiting_review', 'done', 'blocked']);

  if (!Array.isArray(runs)) {
    issues.push({ level: 'error', code: 'pipeline_run_ledger_runs_invalid', target: 'pipeline-run-ledger.runs', message: 'runs must be an array' });
    return issues;
  }

  if (events !== undefined && !Array.isArray(events)) {
    issues.push({ level: 'error', code: 'pipeline_run_ledger_events_invalid', target: 'pipeline-run-ledger.events', message: 'events must be an array' });
  }

  const seenRunIds = new Set();
  for (const run of runs) {
    const runId = run?.id ?? 'unknown-pipeline-run';

    if (!run?.id) {
      issues.push({ level: 'error', code: 'pipeline_run_id_missing', target: runId });
    } else if (seenRunIds.has(run.id)) {
      issues.push({ level: 'warn', code: 'pipeline_run_duplicate', target: run.id });
    } else {
      seenRunIds.add(run.id);
    }

    if (!validRunStatuses.has(run?.status)) {
      issues.push({ level: 'warn', code: 'pipeline_run_status_invalid', target: runId, message: String(run?.status ?? 'missing') });
    }

    if (!Array.isArray(run?.stages) || run.stages.length === 0) {
      issues.push({ level: 'error', code: 'pipeline_run_stages_invalid', target: runId, message: 'stages must be a non-empty array' });
      continue;
    }

    const stageIds = new Set();
    for (const stage of run.stages) {
      if (!stage?.id) continue;
      if (stageIds.has(stage.id)) {
        issues.push({ level: 'warn', code: 'pipeline_stage_duplicate', target: `${runId}/${stage.id}` });
      }
      stageIds.add(stage.id);
    }

    if (run.status !== 'done' && run.currentStageId && !stageIds.has(run.currentStageId)) {
      issues.push({ level: 'error', code: 'pipeline_current_stage_missing', target: runId, message: run.currentStageId });
    }

    for (const stage of run.stages) {
      const stageId = stage?.id ?? 'unknown-stage';
      const target = `${runId}/${stageId}`;

      if (!validStageStatuses.has(stage?.status)) {
        issues.push({ level: 'warn', code: 'pipeline_stage_status_invalid', target, message: String(stage?.status ?? 'missing') });
      }

      if (stage.previousStageId && !stageIds.has(stage.previousStageId)) {
        issues.push({ level: 'error', code: 'pipeline_stage_previous_missing', target, message: stage.previousStageId });
      }

      if (stage.nextStageId && !stageIds.has(stage.nextStageId)) {
        issues.push({ level: 'error', code: 'pipeline_stage_next_missing', target, message: stage.nextStageId });
      }

      if (stage.workflowId && !workflows.some((workflow) => workflow.id === stage.workflowId)) {
        issues.push({ level: 'error', code: 'pipeline_stage_workflow_missing', target, workflowId: stage.workflowId });
      } else if (stage.workflowId) {
        const workflow = workflowById.get(stage.workflowId);
        if (workflow?.pipelineRunId && workflow.pipelineRunId !== run.id) {
          issues.push({ level: 'error', code: 'pipeline_stage_workflow_run_mismatch', target, workflowId: stage.workflowId, message: workflow.pipelineRunId });
        }
        if (workflow?.pipelineStageId && workflow.pipelineStageId !== stage.id) {
          issues.push({ level: 'error', code: 'pipeline_stage_workflow_stage_mismatch', target, workflowId: stage.workflowId, message: workflow.pipelineStageId });
        }
      }

      const stageReviews = reviews.filter((review) => reviewMatchesPipelineStage(review, stage));
      const acceptedReviews = stageReviews.filter((review) => isReviewTypeAcceptedForPipelineStage(review.type, stage));
      const acceptedDoneReviews = acceptedReviews.filter((review) => review.status === 'done');
      const acceptedBlockedReviews = acceptedReviews.filter((review) => review.status === 'blocked');
      const referencedReviewIds = stage.reviewIds ?? [];
      const missingReviewIds = referencedReviewIds.filter((reviewId) => !reviews.some((review) => review.id === reviewId));

      for (const reviewId of missingReviewIds) {
        issues.push({ level: 'warn', code: 'pipeline_stage_review_missing', target, reviewId });
      }

      if (stageReviews.length > 0 && acceptedReviews.length === 0) {
        issues.push({ level: 'warn', code: 'pipeline_stage_review_type_mismatch', target, reviewId: stageReviews[0].id, message: stageReviews[0].type });
      }

      if (acceptedBlockedReviews.length > 0) {
        issues.push({ level: 'warn', code: 'pipeline_stage_review_blocked', target, reviewId: acceptedBlockedReviews[0].id });
      }

      if (stage.status === 'done' && (stage.artifactPaths ?? []).length === 0) {
        issues.push({ level: 'warn', code: 'pipeline_stage_done_artifact_missing', target });
      }

      if (stage.status === 'done' && acceptedDoneReviews.length === 0) {
        issues.push({ level: 'warn', code: 'pipeline_stage_done_review_missing', target });
      }

      if (stage.status === 'waiting_review' && (stage.reviewIds ?? []).length === 0 && acceptedReviews.length === 0) {
        issues.push({ level: 'warn', code: 'pipeline_stage_review_missing', target });
      }
    }
  }

  return issues;
}

function collectReleaseRegistryIssues(releaseRegistry = {}) {
  const issues = [];
  const arrayFields = ['releases', 'publishHistory', 'archiveHistory', 'restoreHistory'];
  const fieldCode = (field) => field.replace(/[A-Z]/g, (matched) => `_${matched.toLowerCase()}`);

  for (const field of arrayFields) {
    if (releaseRegistry[field] !== undefined && !Array.isArray(releaseRegistry[field])) {
      issues.push({ level: 'error', code: `release_registry_${fieldCode(field)}_invalid`, target: `release-registry.${field}`, message: `${field} must be an array` });
    }
  }

  if (!Array.isArray(releaseRegistry.releases)) return issues;

  const seenReleaseIds = new Set();
  for (const release of releaseRegistry.releases) {
    const releaseId = release?.id ?? 'unknown-release';

    if (!release?.id) {
      issues.push({ level: 'error', code: 'release_id_missing', target: releaseId });
    } else if (seenReleaseIds.has(release.id)) {
      issues.push({ level: 'warn', code: 'release_registry_duplicate_release', target: release.id });
    } else {
      seenReleaseIds.add(release.id);
    }

    if (!isValidReleaseStatus(release?.status)) {
      issues.push({ level: 'error', code: 'release_status_invalid', target: releaseId, message: String(release?.status ?? 'missing') });
    }

    if (release?.artifactPaths !== undefined && !Array.isArray(release.artifactPaths)) {
      issues.push({ level: 'error', code: 'release_artifact_paths_invalid', target: releaseId, message: 'artifactPaths must be an array' });
    }

    if (release?.history !== undefined && !Array.isArray(release.history)) {
      issues.push({ level: 'warn', code: 'release_history_invalid', target: releaseId, message: 'history must be an array' });
    }
  }

  const releaseIds = new Set(releaseRegistry.releases.map((release) => release?.id).filter(Boolean));
  for (const field of ['publishHistory', 'archiveHistory', 'restoreHistory']) {
    if (!Array.isArray(releaseRegistry[field])) continue;
    for (const item of releaseRegistry[field]) {
      if (item?.releaseId && !releaseIds.has(item.releaseId)) {
        issues.push({ level: 'warn', code: `release_registry_${fieldCode(field)}_orphan`, target: item.releaseId });
      }
    }
  }

  return issues;
}

function collectArtifactReviewRegistryIssues(artifactRegistry = {}, reviewLedger = {}) {
  const issues = [];
  const reviews = reviewLedger.reviews ?? [];

  if (artifactRegistry.pendingReviews !== undefined && !Array.isArray(artifactRegistry.pendingReviews)) {
    issues.push({ level: 'error', code: 'artifact_pending_reviews_invalid', target: 'artifact-registry.pendingReviews', message: 'pendingReviews must be an array' });
  }

  if (artifactRegistry.completedReviews !== undefined && !Array.isArray(artifactRegistry.completedReviews)) {
    issues.push({ level: 'error', code: 'artifact_completed_reviews_invalid', target: 'artifact-registry.completedReviews', message: 'completedReviews must be an array' });
  }

  if (artifactRegistry.reviewHistory !== undefined && !Array.isArray(artifactRegistry.reviewHistory)) {
    issues.push({ level: 'warn', code: 'artifact_review_history_invalid', target: 'artifact-registry.reviewHistory', message: 'reviewHistory must be an array' });
  }

  const pendingReviews = Array.isArray(artifactRegistry.pendingReviews) ? artifactRegistry.pendingReviews : [];
  const completedReviews = Array.isArray(artifactRegistry.completedReviews) ? artifactRegistry.completedReviews : [];
  const reviewIds = new Set(reviews.map((review) => review.id).filter(Boolean));
  const pendingIds = new Set();
  const completedIds = new Set();

  for (const pendingReview of pendingReviews) {
    if (!pendingReview?.reviewId) {
      issues.push({ level: 'warn', code: 'artifact_pending_review_id_missing', target: pendingReview?.artifactPath ?? 'pendingReviews' });
      continue;
    }

    if (pendingIds.has(pendingReview.reviewId)) {
      issues.push({ level: 'warn', code: 'artifact_pending_review_duplicate', reviewId: pendingReview.reviewId, target: pendingReview.artifactPath });
    }
    pendingIds.add(pendingReview.reviewId);

    if (pendingReview.status === 'done') {
      issues.push({ level: 'warn', code: 'completed_review_in_pending_registry', reviewId: pendingReview.reviewId, target: pendingReview.artifactPath });
    }

    if (!reviewIds.has(pendingReview.reviewId)) {
      issues.push({ level: 'warn', code: 'artifact_pending_review_missing', reviewId: pendingReview.reviewId, target: pendingReview.artifactPath });
    }
  }

  for (const completedReview of completedReviews) {
    if (!completedReview?.reviewId) {
      issues.push({ level: 'warn', code: 'artifact_completed_review_id_missing', target: completedReview?.artifactPath ?? 'completedReviews' });
      continue;
    }

    if (completedIds.has(completedReview.reviewId)) {
      issues.push({ level: 'warn', code: 'artifact_completed_review_duplicate', reviewId: completedReview.reviewId, target: completedReview.artifactPath });
    }
    completedIds.add(completedReview.reviewId);

    if (completedReview.status !== 'done') {
      issues.push({ level: 'warn', code: 'artifact_completed_review_not_done', reviewId: completedReview.reviewId, target: completedReview.artifactPath, message: completedReview.status });
    }

    if (!reviewIds.has(completedReview.reviewId)) {
      issues.push({ level: 'warn', code: 'artifact_completed_review_missing', reviewId: completedReview.reviewId, target: completedReview.artifactPath });
    }
  }

  for (const reviewId of pendingIds) {
    if (completedIds.has(reviewId)) {
      issues.push({ level: 'warn', code: 'artifact_review_pending_completed_conflict', reviewId, target: 'artifact-registry.pendingReviews/completedReviews' });
    }
  }

  return issues;
}

function collectTaskRunReportIssues(runnerLedger = {}) {
  const issues = [];
  const checkReport = (reportPath, context) => {
    if (!reportPath) {
      issues.push({ level: 'warn', code: 'task_run_report_missing', target: context.target, message: context.message });
      return;
    }

    try {
      const { normalized, absolutePath } = resolveArtifactPath(reportPath);
      if (!existsSync(absolutePath)) {
        issues.push({ level: 'warn', code: 'task_run_report_file_missing', target: normalized, message: context.message });
      }
    } catch (error) {
      issues.push({ level: 'error', code: 'task_run_report_path_invalid', target: reportPath, message: error instanceof Error ? error.message : String(error) });
    }
  };

  for (const queueItem of Array.isArray(runnerLedger.taskQueue) ? runnerLedger.taskQueue : []) {
    if (['done', 'failed'].includes(queueItem.status)) {
      checkReport(queueItem.reportPath, { target: queueItem.id, message: `taskQueue:${queueItem.status}` });
    }
  }

  for (const run of Array.isArray(runnerLedger.taskQueueRuns) ? runnerLedger.taskQueueRuns : []) {
    if (run.results !== undefined && !Array.isArray(run.results)) {
      issues.push({ level: 'error', code: 'task_queue_run_results_invalid', target: run.id, message: 'results must be an array' });
      continue;
    }

    for (const result of run.results ?? []) {
      if (['done', 'failed'].includes(result.status)) {
        checkReport(result.reportPath, { target: result.taskQueueId ?? run.id, message: `taskQueueRun:${run.id}:${result.status}` });
      }
    }
  }

  return issues;
}

function collectCanvasOutputIssues(artifactRegistry = {}, workflowRegistry = {}, reviewLedger = {}) {
  const issues = [];
  const canvasOutputs = Array.isArray(artifactRegistry.canvasOutputs) ? artifactRegistry.canvasOutputs : [];
  const workflows = Array.isArray(workflowRegistry.workflows) ? workflowRegistry.workflows : [];
  const reviews = Array.isArray(reviewLedger.reviews) ? reviewLedger.reviews : [];
  const seenRegisteredKeys = new Set();

  if (artifactRegistry.canvasOutputs !== undefined && !Array.isArray(artifactRegistry.canvasOutputs)) {
    issues.push({ level: 'error', code: 'canvas_outputs_invalid', target: 'artifact-registry.canvasOutputs', message: 'canvasOutputs must be an array' });
    return issues;
  }

  for (const record of canvasOutputs) {
    const target = record?.artifactPath ?? record?.idempotencyKey ?? 'canvas-output';

    if (!record || typeof record !== 'object') {
      issues.push({ level: 'error', code: 'canvas_output_record_invalid', target: 'canvasOutputs', message: 'canvas output record must be an object' });
      continue;
    }

    if (record.status === 'failed') {
      issues.push({ level: 'warn', code: 'canvas_output_failed', target, workflowId: record.workflowId, message: record.error ?? 'canvas output failed' });
    }

    if (!record.artifactPath) {
      issues.push({ level: 'warn', code: 'canvas_output_artifact_missing', target: record.idempotencyKey ?? 'canvas-output', workflowId: record.workflowId });
    } else {
      try {
        const { absolutePath } = resolveArtifactPath(record.artifactPath);
        if (record.exists === false || (record.status === 'registered' && !existsSync(absolutePath))) {
          issues.push({ level: 'warn', code: 'canvas_output_file_missing', target: record.artifactPath, workflowId: record.workflowId });
        }
      } catch (error) {
        issues.push({ level: 'error', code: 'canvas_output_path_invalid', target: record.artifactPath, workflowId: record.workflowId, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (record.workflowId && !workflows.some((workflow) => workflow.id === record.workflowId)) {
      issues.push({ level: 'warn', code: 'canvas_output_workflow_missing', target: record.workflowId, message: record.artifactPath });
    }

    if (record.reviewId && !reviews.some((review) => review.id === record.reviewId)) {
      issues.push({ level: 'warn', code: 'canvas_output_review_missing', target: record.reviewId, workflowId: record.workflowId });
    }

    if (record.status !== 'failed' && record.idempotencyKey) {
      if (seenRegisteredKeys.has(record.idempotencyKey)) {
        issues.push({ level: 'warn', code: 'canvas_output_duplicate_idempotency_key', target: record.idempotencyKey, workflowId: record.workflowId });
      }
      seenRegisteredKeys.add(record.idempotencyKey);
    }
  }

  return issues;
}

function collectCanvasRunLedgerIssues(canvasRunLedger = {}, workflowRegistry = {}, reviewLedger = {}, artifactRegistry = {}) {
  const issues = [];
  const sessions = canvasRunLedger.sessions;
  const events = canvasRunLedger.events;
  const workflows = Array.isArray(workflowRegistry.workflows) ? workflowRegistry.workflows : [];
  const reviews = Array.isArray(reviewLedger.reviews) ? reviewLedger.reviews : [];
  const canvasOutputs = Array.isArray(artifactRegistry.canvasOutputs) ? artifactRegistry.canvasOutputs : [];
  const validStatuses = new Set(['opened', 'running', 'output_registered', 'done', 'failed', 'cancelled']);

  if (!Array.isArray(sessions)) {
    issues.push({ level: 'error', code: 'canvas_run_sessions_invalid', target: 'canvas-run-ledger.sessions', message: 'sessions must be an array' });
    return issues;
  }

  if (events !== undefined && !Array.isArray(events)) {
    issues.push({ level: 'error', code: 'canvas_run_events_invalid', target: 'canvas-run-ledger.events', message: 'events must be an array' });
  }

  const seenSessionIds = new Set();
  for (const session of sessions) {
    const target = session?.id ?? session?.workflowId ?? 'canvas-run-session';

    if (!session || typeof session !== 'object') {
      issues.push({ level: 'error', code: 'canvas_run_session_invalid', target: 'canvas-run-ledger.sessions', message: 'session must be an object' });
      continue;
    }

    if (!session.id) {
      issues.push({ level: 'error', code: 'canvas_run_session_id_missing', target });
    } else if (seenSessionIds.has(session.id)) {
      issues.push({ level: 'warn', code: 'canvas_run_duplicate_session', target: session.id });
    } else {
      seenSessionIds.add(session.id);
    }

    if (!validStatuses.has(session.status)) {
      issues.push({ level: 'warn', code: 'canvas_run_status_invalid', target, message: String(session.status ?? 'missing') });
    }

    if (session.workflowId && workflows.length > 0 && !workflows.some((workflow) => workflow.id === session.workflowId)) {
      issues.push({ level: 'warn', code: 'canvas_run_workflow_missing', target: session.workflowId, message: session.id });
    }

    if (['output_registered', 'done'].includes(session.status)) {
      if (!session.artifactPath) {
        issues.push({ level: 'warn', code: 'canvas_run_artifact_missing', target, workflowId: session.workflowId });
      } else {
        try {
          const { absolutePath } = resolveArtifactPath(session.artifactPath);
          if (!existsSync(absolutePath)) {
            issues.push({ level: 'warn', code: 'canvas_run_artifact_file_missing', target: session.artifactPath, workflowId: session.workflowId });
          }
        } catch (error) {
          issues.push({ level: 'error', code: 'canvas_run_artifact_path_invalid', target: session.artifactPath, message: error instanceof Error ? error.message : String(error) });
        }
      }

      if (!session.reviewId || !reviews.some((review) => review.id === session.reviewId)) {
        issues.push({ level: 'warn', code: 'canvas_run_review_missing', target: session.reviewId ?? target, workflowId: session.workflowId });
      }

      if (session.idempotencyKey && !canvasOutputs.some((record) => record.idempotencyKey === session.idempotencyKey)) {
        issues.push({ level: 'warn', code: 'canvas_run_canvas_output_missing', target: session.idempotencyKey, workflowId: session.workflowId });
      }
    }
  }

  return issues;
}

function findInterruptedStateOperations(operations = [], now = Date.now()) {
  const latestById = new Map();

  for (const operation of operations) {
    if (!operation?.id) continue;
    latestById.set(operation.id, operation);
  }

  return Array.from(latestById.values()).filter((operation) => {
    if (operation.status !== 'running') return false;
    const startedAt = Date.parse(operation.at ?? operation.startedAt ?? 0);
    return !startedAt || now - startedAt > 120000;
  });
}

function collectStateOperationJournalIssues(stateOperationJournal = {}, now = Date.now()) {
  const issues = [];
  const operations = stateOperationJournal.operations;
  const validStatuses = new Set(['running', 'done', 'failed']);

  if (operations !== undefined && !Array.isArray(operations)) {
    issues.push({ level: 'error', code: 'state_operation_journal_operations_invalid', target: 'state-operation-journal.operations', message: 'operations must be an array' });
    return issues;
  }

  const latestById = new Map();
  for (const operation of operations ?? []) {
    const target = operation?.target ?? operation?.operation ?? 'state-operation';

    if (!operation || typeof operation !== 'object') {
      issues.push({ level: 'error', code: 'state_operation_item_invalid', target: 'state-operation-journal.operations', message: 'operation item must be an object' });
      continue;
    }

    if (!operation.id) {
      issues.push({ level: 'warn', code: 'state_operation_id_missing', target });
    }

    if (!validStatuses.has(operation.status)) {
      issues.push({ level: 'warn', code: 'state_operation_status_invalid', target, message: String(operation.status ?? 'missing') });
    }

    if (operation.id) latestById.set(operation.id, operation);
  }

  const runningKeys = new Set();
  for (const operation of latestById.values()) {
    if (operation.status !== 'running') continue;
    const target = operation.target ?? operation.operation ?? 'state-operation';
    const runningKey = `${operation.operation ?? 'operation'}:${target}`;
    if (runningKeys.has(runningKey)) {
      issues.push({ level: 'warn', code: 'state_operation_duplicate_running', target: runningKey });
    }
    runningKeys.add(runningKey);
  }

  for (const operation of findInterruptedStateOperations(operations ?? [], now)) {
    issues.push({ level: 'warn', code: 'state_operation_interrupted', target: operation.target ?? operation.operation, message: operation.id });
  }

  return issues;
}

async function diagnoseWorkflowRuntime() {
  const snapshot = await buildSnapshot();
  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
  const workflows = snapshot.workflowRegistry.workflows ?? [];
  const chains = snapshot.workflowRegistry.chains ?? [];
  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [], history: [] });
  const reviews = Array.isArray(reviewLedger.reviews) ? reviewLedger.reviews : snapshot.reviews ?? [];
  const artifacts = snapshot.artifacts ?? [];
  const artifactRegistry = await readJson(path.join(smartVisionRoot, 'artifact-registry.json'), { primaryArtifacts: [], pendingReviews: [] });
  const progressLedger = await readJson(path.join(smartVisionRoot, 'progress-ledger.json'), { items: [] });
  const runnerLedger = await readWorkflowRunnerLedger();
  const pipelineRunLedger = await readPipelineRunLedger();
  const canvasRunLedger = await readCanvasRunLedger();
  const releaseRegistry = await readReleaseRegistry();
  const stateOperationJournal = await readJson(path.join(smartVisionRoot, 'state-operation-journal.json'), { operations: [] });
  const releases = Array.isArray(releaseRegistry.releases) ? releaseRegistry.releases : [];
  const issues = [];

  issues.push(...collectWorkflowRegistryIssues(workflowRegistry));
  issues.push(...collectReviewLedgerIssues(reviewLedger, workflowRegistry, { ...artifactRegistry, primaryArtifacts: artifacts }));
  issues.push(...collectArtifactReviewRegistryIssues(artifactRegistry, { reviews }));
  issues.push(...collectCanvasOutputIssues(artifactRegistry, snapshot.workflowRegistry ?? {}, { reviews }));
  issues.push(...collectCanvasRunLedgerIssues(canvasRunLedger, snapshot.workflowRegistry ?? {}, { reviews }, artifactRegistry));

  for (const progressItem of progressLedger.items ?? []) {
    if (!progressItem.workflowId) continue;
    const workflow = workflows.find((item) => item.id === progressItem.workflowId);

    if (workflow && progressItem.status !== workflow.status && progressItem.status !== 'done') {
      issues.push({ level: 'warn', code: 'progress_workflow_status_mismatch', workflowId: workflow.id, target: progressItem.id, message: `${progressItem.status} != ${workflow.status}` });
    }
  }

  for (const workflow of workflows) {
    const workflowPath = path.join(smartVisionOutputsRoot, workflow.path ?? '');

    if (workflow.path && !existsSync(workflowPath)) {
      issues.push({ level: 'error', code: 'workflow_file_missing', workflowId: workflow.id, target: workflow.path });
    }

    for (const artifactPath of workflow.outputArtifacts ?? []) {
      try {
        const { absolutePath } = resolveArtifactPath(artifactPath);

        if (!existsSync(absolutePath)) {
          issues.push({ level: 'warn', code: 'artifact_file_missing', workflowId: workflow.id, target: artifactPath });
        }
      } catch (error) {
        issues.push({ level: 'error', code: 'artifact_path_invalid', workflowId: workflow.id, target: artifactPath, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if ((workflow.outputArtifacts?.length ?? 0) > 0 && !workflow.lastOutputReviewId) {
      issues.push({ level: 'warn', code: 'output_without_review', workflowId: workflow.id, target: workflow.outputArtifacts?.[0] });
    }

    if (workflow.lastOutputReviewId && !reviews.some((review) => review.id === workflow.lastOutputReviewId)) {
      issues.push({ level: 'error', code: 'review_missing', workflowId: workflow.id, target: workflow.lastOutputReviewId });
    }
  }

  for (const review of reviews) {
    if (review.workflowId && !workflows.some((workflow) => workflow.id === review.workflowId)) {
      issues.push({ level: 'error', code: 'review_workflow_missing', reviewId: review.id, target: review.workflowId });
    }

    if (review.artifactPath && !artifacts.includes(review.artifactPath)) {
      issues.push({ level: 'warn', code: 'review_artifact_not_indexed', reviewId: review.id, target: review.artifactPath });
    }
  }

  issues.push(...collectRunnerArchiveIssues(runnerLedger));
  issues.push(...collectTaskRunReportIssues(runnerLedger));
  issues.push(...collectPipelineRunIssues(pipelineRunLedger, { reviews }, snapshot.workflowRegistry ?? {}));
  issues.push(...collectReleaseRegistryIssues(releaseRegistry));
  issues.push(...collectStateOperationJournalIssues(stateOperationJournal));

  for (const release of releases) {
    if (!isValidReleaseStatus(release.status)) {
      issues.push({ level: 'error', code: 'release_status_invalid', target: release.id, message: String(release.status ?? 'missing') });
    }

    if (!release.manifestPath) {
      issues.push({ level: 'warn', code: 'release_manifest_missing', target: release.id });
    } else {
      try {
        const { absolutePath } = resolveArtifactPath(release.manifestPath);

        if (!existsSync(absolutePath)) {
          issues.push({ level: 'warn', code: 'release_manifest_file_missing', target: release.manifestPath, message: release.id });
        }
      } catch (error) {
        issues.push({ level: 'error', code: 'release_manifest_path_invalid', target: release.manifestPath, message: error instanceof Error ? error.message : String(error) });
      }
    }

    for (const artifactPath of release.artifactPaths ?? []) {
      try {
        const normalizedArtifact = normalizeArtifactPathValue(artifactPath);
        const { absolutePath } = resolveArtifactPath(normalizedArtifact);

        if (!existsSync(absolutePath)) {
          issues.push({ level: 'warn', code: 'release_artifact_missing', target: normalizedArtifact, message: release.id });
        }
      } catch (error) {
        issues.push({ level: 'error', code: 'release_artifact_path_invalid', target: artifactPath, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (release.status === 'approved' && !release.approvedAt) {
      issues.push({ level: 'warn', code: 'release_approved_at_missing', target: release.id });
    }

    if (release.status === 'published' && (!release.approvedAt || !releaseHasHistoryStatus(release, 'approved'))) {
      issues.push({ level: 'warn', code: 'release_published_without_approval', target: release.id });
    }

    if (release.status === 'published' && !release.publishedAt) {
      issues.push({ level: 'warn', code: 'release_published_at_missing', target: release.id });
    }

    if (release.status === 'published' && !hasPublishHistory(releaseRegistry, release.id)) {
      issues.push({ level: 'warn', code: 'release_published_without_history', target: release.id });
    }

    if (release.status === 'archived' && !release.archivedAt) {
      issues.push({ level: 'warn', code: 'release_archived_at_missing', target: release.id });
    }

    if (release.status === 'archived' && !hasArchiveHistory(releaseRegistry, release.id)) {
      issues.push({ level: 'warn', code: 'release_archived_without_history', target: release.id });
    }

    if (release.status === 'restored' && release.archivedAt) {
      issues.push({ level: 'warn', code: 'release_restored_with_archived_at', target: release.id });
    }

    if (release.status === 'restored' && !hasRestoreHistory(releaseRegistry, release.id, release.restoredAt)) {
      issues.push({ level: 'warn', code: 'release_restored_without_history', target: release.id });
    }

    if (release.reviewId) {
      const review = reviews.find((item) => item.id === release.reviewId);

      if (!review) {
        issues.push({ level: 'warn', code: 'release_review_missing', reviewId: release.reviewId, target: release.id });
      } else if ((release.status === 'approved' || release.status === 'published') && review.status !== 'done') {
        issues.push({ level: 'warn', code: 'release_review_not_done', reviewId: release.reviewId, target: release.id, message: review.status });
      }
    }

    const hasQueuedPublishIntent = (runnerLedger.releasePublishQueue ?? []).some((item) => item.releaseId === release.id && ['queued', 'running', 'blocked'].includes(item.status));
    if (['approved', 'published'].includes(release.status) || hasQueuedPublishIntent) {
      const publishGate = await getReleasePublishGate(release, reviews);
      for (const blocker of publishGate.blockers) {
        const target = blocker.target ?? release.id;
        if (!issues.some((issue) => issue.code === blocker.code && issue.target === target && issue.reviewId === blocker.reviewId)) {
          issues.push({ level: 'warn', code: blocker.code, target, reviewId: blocker.reviewId, message: blocker.message });
        }
      }
    }
  }

  return {
    status: issues.length > 0 ? 'degraded' : 'ready',
    checkedAt: new Date().toISOString(),
    counts: {
      workflowCount: workflows.length,
      chainCount: chains.length,
      openChainCount: chains.filter((item) => !item.closed).length,
      reviewCount: reviews.length,
      artifactCount: artifacts.length,
      releaseCount: releases.length,
      publishedReleaseCount: releases.filter((item) => item.status === 'published').length,
      archivedReleaseCount: releases.filter((item) => item.status === 'archived').length,
      issueCount: issues.length
    },
    issues,
    nextActions: issues.slice(0, 8).map((item) => `${item.code}: ${item.target ?? item.workflowId ?? item.reviewId}`),
    snapshot
  };
}

async function repairWorkflowRuntimeState({ dryRun = false } = {}) {
  const updatedAt = new Date().toISOString();
  const artifactRegistryPath = path.join(smartVisionRoot, 'artifact-registry.json');
  const artifactRegistry = await readJson(artifactRegistryPath, { version: '0.1.0', projectId: 'infinite-awakening-001', primaryArtifacts: [], pendingReviews: [], reviewHistory: [] });
  const completedReviews = [];
  const pendingReviews = [];

  for (const item of artifactRegistry.pendingReviews ?? []) {
    if (item.status === 'done') {
      completedReviews.push({ ...item, completedAt: item.updatedAt ?? updatedAt });
    } else {
      pendingReviews.push(item);
    }
  }

  artifactRegistry.pendingReviews = pendingReviews;
  artifactRegistry.completedReviews = Array.from(new Map([...(artifactRegistry.completedReviews ?? []), ...completedReviews].map((item) => [item.reviewId, item])).values());
  artifactRegistry.updatedAt = updatedAt;
  if (!dryRun) await writeJson(artifactRegistryPath, artifactRegistry);

  const progressPath = path.join(smartVisionRoot, 'progress-ledger.json');
  const progressLedger = await readJson(progressPath, { version: '0.1.0', projectId: 'infinite-awakening-001', episode: 'ep001', items: [] });
  const workflowRegistry = await readJson(path.join(smartVisionRoot, 'workflow-registry.json'), { workflows: [] });
  let repairedProgressCount = 0;

  for (const progressItem of progressLedger.items ?? []) {
    if (!progressItem.workflowId) continue;
    const workflow = (workflowRegistry.workflows ?? []).find((item) => item.id === progressItem.workflowId);

    if (workflow && progressItem.status !== workflow.status && progressItem.status !== 'done') {
      progressItem.status = workflow.status;
      progressItem.updatedAt = updatedAt;
      repairedProgressCount += 1;
    }
  }

  if (!dryRun) await writeJson(progressPath, progressLedger);

  const releaseRegistry = await readReleaseRegistry();
  const releaseMap = new Map();
  let repairedReleaseCount = 0;

  for (const release of releaseRegistry.releases ?? []) {
    const normalizedRelease = {
      ...release,
      artifactPaths: Array.from(new Set((release.artifactPaths ?? []).map((item) => normalizeArtifactPathValue(item)).filter(Boolean))),
      history: release.history ?? []
    };

    if (normalizedRelease.artifactPaths.length !== (release.artifactPaths ?? []).length) repairedReleaseCount += 1;
    if (!normalizedRelease.manifestPath) {
      normalizedRelease.manifestPath = normalizedRelease.artifactPaths.find((artifact) => artifact.includes('release-manifest')) ?? null;
      if (normalizedRelease.manifestPath) repairedReleaseCount += 1;
    } else {
      const normalizedManifestPath = normalizeArtifactPathValue(normalizedRelease.manifestPath);
      if (normalizedManifestPath !== normalizedRelease.manifestPath) repairedReleaseCount += 1;
      normalizedRelease.manifestPath = normalizedManifestPath;
    }

    if (normalizedRelease.status === 'approved' && !normalizedRelease.approvedAt) {
      normalizedRelease.approvedAt = updatedAt;
      repairedReleaseCount += 1;
    }

    if (normalizedRelease.status === 'published') {
      if (!normalizedRelease.approvedAt) {
        normalizedRelease.approvedAt = updatedAt;
        repairedReleaseCount += 1;
      }
      if (!normalizedRelease.publishedAt) {
        normalizedRelease.publishedAt = updatedAt;
        repairedReleaseCount += 1;
      }
      if (!releaseHasHistoryStatus(normalizedRelease, 'approved')) {
        normalizedRelease.history = [{ status: 'approved', at: normalizedRelease.approvedAt, note: '状态修复补齐发布前批准记录' }, ...normalizedRelease.history];
        repairedReleaseCount += 1;
      }
    }

    if (normalizedRelease.status === 'archived' && !normalizedRelease.archivedAt) {
      normalizedRelease.archivedAt = updatedAt;
      repairedReleaseCount += 1;
    }

    if (normalizedRelease.status === 'restored' && normalizedRelease.archivedAt) {
      delete normalizedRelease.archivedAt;
      repairedReleaseCount += 1;
    }

    releaseMap.set(normalizedRelease.id, normalizedRelease);
  }

  releaseRegistry.releases = Array.from(releaseMap.values());
  releaseRegistry.archiveHistory = releaseRegistry.archiveHistory ?? [];
  releaseRegistry.publishHistory = releaseRegistry.publishHistory ?? [];
  releaseRegistry.restoreHistory = releaseRegistry.restoreHistory ?? [];

  for (const release of releaseRegistry.releases) {
    if (release.status === 'published' && !hasPublishHistory(releaseRegistry, release.id)) {
      releaseRegistry.publishHistory.push(buildPublishHistoryItem(release, release.publishedAt ?? updatedAt, 'repair'));
      repairedReleaseCount += 1;
    }
    if (release.status === 'archived' && !hasArchiveHistory(releaseRegistry, release.id)) {
      releaseRegistry.archiveHistory.push(buildArchiveHistoryItem(release, release.archivedAt ?? updatedAt));
      repairedReleaseCount += 1;
    }
    if (release.status === 'restored' && !hasRestoreHistory(releaseRegistry, release.id, release.restoredAt)) {
      releaseRegistry.restoreHistory.push(buildRestoreHistoryItem(release, release.restoredAt ?? updatedAt));
      repairedReleaseCount += 1;
    }
  }

  if (!dryRun && repairedReleaseCount > 0) {
    releaseRegistry.updatedAt = updatedAt;
    await writeReleaseRegistry(releaseRegistry);
  }

  const runnerLedger = await readWorkflowRunnerLedger();
  const { archives: normalizedRunnerArchives, repairedCount: repairedRunnerArchiveCount } = normalizeWorkflowRunnerArchives(runnerLedger.archives ?? {});
  if (repairedRunnerArchiveCount > 0 || !runnerLedger.archives) {
    runnerLedger.archives = normalizedRunnerArchives;
    runnerLedger.updatedAt = updatedAt;
    if (!dryRun) await writeWorkflowRunnerLedger(runnerLedger);
  }

  const diagnostics = await diagnoseWorkflowRuntime();

  return {
    repairedAt: updatedAt,
    dryRun,
    movedCompletedReviews: completedReviews.length,
    pendingReviews: pendingReviews.length,
    repairedProgressCount,
    repairedReleaseCount,
    repairedRunnerArchiveCount,
    diagnostics,
    snapshot: await buildSnapshot()
  };
}

async function replayWorkflowChain(workflowId, options = {}) {
  const runtime = await getWorkflowChainRuntime(workflowId);
  const chain = runtime.chain;
  const actions = [];
  let executed = null;

  if (chain.nextAction === 'add_output' && !options.artifactPath) {
    actions.push({ action: 'add_output', status: 'blocked', reason: 'artifactPath required to register workflow output' });
  } else {
    executed = await executeWorkflowChainAction({ workflowId, action: options.action ?? chain.nextAction, artifactPath: options.artifactPath, status: options.status });
    actions.push({ action: executed.action, status: 'done' });
  }

  return {
    workflowId,
    replayedAt: new Date().toISOString(),
    dryRun: false,
    actions,
    result: executed,
    snapshot: executed?.snapshot ?? runtime.snapshot
  };
}

async function readWorkflowRunnerLedger() {
  return readJson(path.join(smartVisionRoot, 'workflow-runner-ledger.json'), {
    version: '0.1.0',
    projectId: 'infinite-awakening-001',
    runs: [],
    taskPlans: [],
    taskQueue: [],
    taskQueueRuns: [],
    releasePublishQueue: [],
    releasePublishRuns: [],
    events: []
  });
}

async function writeWorkflowRunnerLedger(ledger) {
  await writeJson(path.join(smartVisionRoot, 'workflow-runner-ledger.json'), ledger);
}

function summarizeWorkflowRunnerArchives(archives = {}) {
  const taskQueue = Array.isArray(archives.taskQueue) ? archives.taskQueue : [];
  const releasePublishQueue = Array.isArray(archives.releasePublishQueue) ? archives.releasePublishQueue : [];
  const taskQueueRuns = Array.isArray(archives.taskQueueRuns) ? archives.taskQueueRuns : [];
  const releasePublishRuns = Array.isArray(archives.releasePublishRuns) ? archives.releasePublishRuns : [];
  const events = Array.isArray(archives.events) ? archives.events : [];

  return {
    lastCompactedAt: archives.lastCompactedAt ?? null,
    counts: {
      taskQueueCount: taskQueue.length,
      releasePublishQueueCount: releasePublishQueue.length,
      taskQueueRunCount: taskQueueRuns.length,
      releasePublishRunCount: releasePublishRuns.length,
      eventCount: events.length
    },
    recentTaskQueue: taskQueue.slice(-6).reverse(),
    recentReleasePublishQueue: releasePublishQueue.slice(-6).reverse(),
    recentTaskQueueRuns: taskQueueRuns.slice(-6).reverse(),
    recentReleasePublishRuns: releasePublishRuns.slice(-6).reverse(),
    recentEvents: events.slice(-8).reverse()
  };
}

function normalizeWorkflowRunnerArchives(archives = {}) {
  const archiveKeys = ['taskQueue', 'releasePublishQueue', 'taskQueueRuns', 'releasePublishRuns', 'events'];
  const normalized = {};
  let repairedCount = 0;

  for (const key of archiveKeys) {
    const value = archives?.[key];
    const items = Array.isArray(value) ? value : [];
    if (!Array.isArray(value) && value !== undefined) repairedCount += 1;
    const deduped = Array.from(new Map(items.filter(Boolean).map((item, index) => [item.id ?? `${key}-${index}`, item])).values());
    if (deduped.length !== items.length) repairedCount += items.length - deduped.length;
    normalized[key] = deduped.slice(-1000);
  }

  if (archives?.lastCompactedAt && Number.isNaN(Date.parse(archives.lastCompactedAt))) {
    repairedCount += 1;
  } else if (archives?.lastCompactedAt) {
    normalized.lastCompactedAt = archives.lastCompactedAt;
  }

  return { archives: normalized, repairedCount };
}

function sortByRuntimeUpdatedAtDesc(a, b) {
  const getTime = (item) => Date.parse(item.updatedAt ?? item.completedAt ?? item.publishedAt ?? item.queuedAt ?? item.startedAt ?? item.at ?? 0) || 0;
  return getTime(b) - getTime(a);
}

function trimWithArchive(currentItems = [], archiveItems = [], keepCount = 100) {
  const kept = currentItems.slice(-keepCount);
  const archived = currentItems.slice(0, Math.max(0, currentItems.length - keepCount));
  return {
    kept,
    archived: [...archiveItems, ...archived].slice(-1000),
    movedCount: archived.length
  };
}

async function compactWorkflowRunnerLedger({ keepCompletedTaskItems = 20, keepPublishedReleaseItems = 20, keepRuns = 50, keepEvents = 300, dryRun = false } = {}) {
  const compactedAt = new Date().toISOString();
  const normalizeLimit = (value, fallback, minimum = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
  };
  keepCompletedTaskItems = normalizeLimit(keepCompletedTaskItems, 20);
  keepPublishedReleaseItems = normalizeLimit(keepPublishedReleaseItems, 20);
  keepRuns = normalizeLimit(keepRuns, 50, 1);
  keepEvents = normalizeLimit(keepEvents, 300, 1);
  const ledger = await readWorkflowRunnerLedger();
  const archives = ledger.archives ?? {};
  const terminalTaskItems = (ledger.taskQueue ?? []).filter((item) => item.status === 'done').sort(sortByRuntimeUpdatedAtDesc);
  const activeTaskItems = (ledger.taskQueue ?? []).filter((item) => item.status !== 'done');
  const keptTerminalTaskIds = new Set(terminalTaskItems.slice(0, keepCompletedTaskItems).map((item) => item.id));
  const archivedTaskItems = terminalTaskItems.filter((item) => !keptTerminalTaskIds.has(item.id));
  const keptTaskItems = [...activeTaskItems, ...terminalTaskItems.filter((item) => keptTerminalTaskIds.has(item.id))].sort((a, b) => (a.queueOrder ?? 0) - (b.queueOrder ?? 0));

  const terminalReleaseItems = (ledger.releasePublishQueue ?? []).filter((item) => item.status === 'published').sort(sortByRuntimeUpdatedAtDesc);
  const activeReleaseItems = (ledger.releasePublishQueue ?? []).filter((item) => item.status !== 'published');
  const keptTerminalReleaseIds = new Set(terminalReleaseItems.slice(0, keepPublishedReleaseItems).map((item) => item.id));
  const archivedReleaseItems = terminalReleaseItems.filter((item) => !keptTerminalReleaseIds.has(item.id));
  const keptReleaseItems = [...activeReleaseItems, ...terminalReleaseItems.filter((item) => keptTerminalReleaseIds.has(item.id))].sort(sortByRuntimeUpdatedAtDesc);

  const taskRunTrim = trimWithArchive(ledger.taskQueueRuns ?? [], archives.taskQueueRuns ?? [], keepRuns);
  const releaseRunTrim = trimWithArchive(ledger.releasePublishRuns ?? [], archives.releasePublishRuns ?? [], keepRuns);
  const eventTrim = trimWithArchive(ledger.events ?? [], archives.events ?? [], keepEvents);
  const summary = {
    compactedAt,
    dryRun,
    before: {
      taskQueueCount: (ledger.taskQueue ?? []).length,
      releasePublishQueueCount: (ledger.releasePublishQueue ?? []).length,
      taskQueueRunCount: (ledger.taskQueueRuns ?? []).length,
      releasePublishRunCount: (ledger.releasePublishRuns ?? []).length,
      eventCount: (ledger.events ?? []).length
    },
    archived: {
      taskQueueCount: archivedTaskItems.length,
      releasePublishQueueCount: archivedReleaseItems.length,
      taskQueueRunCount: taskRunTrim.movedCount,
      releasePublishRunCount: releaseRunTrim.movedCount,
      eventCount: eventTrim.movedCount
    },
    after: {
      taskQueueCount: keptTaskItems.length,
      releasePublishQueueCount: keptReleaseItems.length,
      taskQueueRunCount: taskRunTrim.kept.length,
      releasePublishRunCount: releaseRunTrim.kept.length,
      eventCount: Math.min(keepEvents, eventTrim.kept.length + 1)
    },
    limits: {
      keepCompletedTaskItems,
      keepPublishedReleaseItems,
      keepRuns,
      keepEvents
    }
  };

  if (!dryRun) {
    ledger.taskQueue = keptTaskItems;
    ledger.releasePublishQueue = keptReleaseItems;
    ledger.taskQueueRuns = taskRunTrim.kept;
    ledger.releasePublishRuns = releaseRunTrim.kept;
    ledger.events = [
      ...eventTrim.kept,
      { id: `runner-ledger-compacted-${Date.now()}`, type: 'runner_ledger_compacted', status: 'done', at: compactedAt, requested: summary.archived.taskQueueCount + summary.archived.releasePublishQueueCount + summary.archived.taskQueueRunCount + summary.archived.releasePublishRunCount + summary.archived.eventCount }
    ].slice(-keepEvents);
    ledger.archives = {
      ...archives,
      taskQueue: [...(archives.taskQueue ?? []), ...archivedTaskItems].slice(-1000),
      releasePublishQueue: [...(archives.releasePublishQueue ?? []), ...archivedReleaseItems].slice(-1000),
      taskQueueRuns: taskRunTrim.archived,
      releasePublishRuns: releaseRunTrim.archived,
      events: eventTrim.archived,
      lastCompactedAt: compactedAt
    };
    ledger.updatedAt = compactedAt;
    await writeWorkflowRunnerLedger(ledger);
  }

  return {
    ...summary,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function restoreWorkflowRunnerArchiveItem({ bucket, itemId = null, itemIds = null, restoreAll = false } = {}) {
  const restoredAt = new Date().toISOString();
  const allowedBuckets = new Set(['taskQueue', 'releasePublishQueue', 'taskQueueRuns', 'releasePublishRuns', 'events']);

  if (!allowedBuckets.has(bucket)) {
    throw new Error(`Invalid archive bucket: ${bucket ?? 'missing'}`);
  }

  const ledger = await readWorkflowRunnerLedger();
  const archives = ledger.archives ?? {};
  const archiveItems = Array.isArray(archives[bucket]) ? archives[bucket] : [];
  const requestedIds = restoreAll
    ? archiveItems.map((item) => item.id).filter(Boolean)
    : Array.from(new Set([...(Array.isArray(itemIds) ? itemIds : []), itemId].filter(Boolean)));

  if (requestedIds.length === 0) {
    throw new Error('itemId, itemIds, or restoreAll is required');
  }

  const activeItems = Array.isArray(ledger[bucket]) ? ledger[bucket] : [];
  const activeIds = new Set(activeItems.map((item) => item.id).filter(Boolean));
  const requestIdSet = new Set(requestedIds);
  const matchedArchiveItems = archiveItems.filter((item) => item.id && requestIdSet.has(item.id));

  if (matchedArchiveItems.length === 0) {
    throw new Error(`Archive item not found: ${bucket}/${requestedIds.join(',')}`);
  }

  const restoredItems = [];
  const results = [];

  for (const archivedItem of matchedArchiveItems) {
    const duplicateActive = activeIds.has(archivedItem.id);
    results.push({ itemId: archivedItem.id, status: duplicateActive ? 'skipped_duplicate' : 'restored' });

    if (!duplicateActive) {
      restoredItems.push(archivedItem);
      activeIds.add(archivedItem.id);
    }
  }

  const matchedIds = new Set(matchedArchiveItems.map((item) => item.id));
  const nextArchiveItems = archiveItems.filter((item) => !matchedIds.has(item.id));
  const restoredCount = results.filter((item) => item.status === 'restored').length;
  const duplicateCount = results.filter((item) => item.status === 'skipped_duplicate').length;
  const nextEvents = [
    ...(ledger.events ?? []),
    {
      id: `runner-archive-restored-${bucket}-${Date.now()}`,
      type: 'runner_archive_item_restored',
      status: restoredCount > 0 ? 'restored' : 'skipped',
      at: restoredAt,
      action: 'restore_archive_item',
      targetBucket: bucket,
      targetItemId: requestedIds[0],
      requested: results.length
    }
  ].slice(-500);

  ledger.archives = {
    ...archives,
    [bucket]: nextArchiveItems
  };
  ledger.events = nextEvents;

  if (restoredItems.length > 0) {
    ledger[bucket] = [...activeItems, ...restoredItems];
  }

  ledger.updatedAt = restoredAt;
  await writeWorkflowRunnerLedger(ledger);

  return {
    restoredAt,
    bucket,
    itemId: requestedIds[0],
    status: restoredCount > 0 ? 'restored' : 'skipped_duplicate',
    requested: results.length,
    restoredCount,
    duplicateCount,
    results,
    restoredItem: restoredItems[0] ?? matchedArchiveItems[0],
    restoredItems,
    archiveSummary: summarizeWorkflowRunnerArchives(ledger.archives),
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function enqueueReleasePublish(release, queuedAt, reason = 'release_approved') {
  const ledger = await readWorkflowRunnerLedger();
  const queue = ledger.releasePublishQueue ?? [];
  const existing = queue.find((item) => item.releaseId === release.id && ['queued', 'blocked'].includes(item.status));
  const queueItem = {
    id: existing?.id ?? `release-publish-${release.id}`,
    releaseId: release.id,
    episodeId: release.episodeId,
    status: 'queued',
    queuedAt: existing?.queuedAt ?? queuedAt,
    updatedAt: queuedAt,
    reason,
    manifestPath: release.manifestPath ?? null,
    artifactPaths: release.artifactPaths ?? []
  };

  ledger.releasePublishQueue = existing
    ? queue.map((item) => item.id === existing.id ? { ...item, ...queueItem } : item)
    : [...queue, queueItem];
  ledger.events = [
    ...(ledger.events ?? []),
    {
      id: `release-publish-queued-${release.id}-${Date.now()}`,
      type: 'release_publish_queued',
      status: 'queued',
      releaseId: release.id,
      at: queuedAt,
      reason
    }
  ].slice(-500);
  ledger.updatedAt = queuedAt;
  await writeWorkflowRunnerLedger(ledger);
  return queueItem;
}

async function appendWorkflowRunnerEvent(event) {
  const ledger = await readWorkflowRunnerLedger();
  const enrichedEvent = {
    id: event.id ?? `runner-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.at ?? new Date().toISOString(),
    ...event
  };
  ledger.events = [...(ledger.events ?? []), enrichedEvent].slice(-500);
  ledger.updatedAt = enrichedEvent.at;
  await writeWorkflowRunnerLedger(ledger);
  return enrichedEvent;
}

async function getWorkflowRunnerStatus() {
  const ledger = await readWorkflowRunnerLedger();
  const diagnostics = await diagnoseWorkflowRuntime();
  const runs = ledger.runs ?? [];
  const lastRun = runs[runs.length - 1] ?? null;
  const activeRun = [...runs].reverse().find((item) => item.status === 'running') ?? null;

  return {
    status: activeRun ? 'running' : diagnostics.status,
    activeRun,
    lastRun,
    runCount: runs.length,
    taskPlanCount: (ledger.taskPlans ?? []).length,
    taskQueueCount: (ledger.taskQueue ?? []).length,
    queuedTaskCount: (ledger.taskQueue ?? []).filter((item) => item.status === 'queued').length,
    blockedTaskCount: (ledger.taskQueue ?? []).filter((item) => item.status === 'blocked').length,
    doneTaskCount: (ledger.taskQueue ?? []).filter((item) => item.status === 'done').length,
    taskQueue: ledger.taskQueue ?? [],
    lastTaskQueueRun: (ledger.taskQueueRuns ?? []).slice(-1)[0] ?? null,
    releasePublishQueue: ledger.releasePublishQueue ?? [],
    blockedReleasePublishCount: (ledger.releasePublishQueue ?? []).filter((item) => item.status === 'blocked').length,
    lastReleasePublishRun: (ledger.releasePublishRuns ?? []).slice(-1)[0] ?? null,
    archiveSummary: summarizeWorkflowRunnerArchives(ledger.archives ?? {}),
    recentEvents: (ledger.events ?? []).slice(-20),
    diagnostics,
    updatedAt: ledger.updatedAt ?? diagnostics.checkedAt,
    snapshot: diagnostics.snapshot
  };
}

async function getWorkflowRunnerRun(runId) {
  if (!runId) {
    throw new Error('runId is required');
  }

  const ledger = await readWorkflowRunnerLedger();
  const run = (ledger.runs ?? []).find((item) => item.id === runId);

  if (!run) {
    throw new Error(`Workflow runner run not found: ${runId}`);
  }

  return {
    run,
    events: (ledger.events ?? []).filter((event) => event.runId === runId),
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function retryWorkflowRunnerFailures(runId, options = {}) {
  const detail = await getWorkflowRunnerRun(runId);
  const retryRunId = `workflow-retry-run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const artifactPathByWorkflowId = options.artifactPathByWorkflowId ?? {};
  const failedWorkflowIds = Array.from(new Set((detail.run.results ?? []).filter((item) => item.status === 'failed').map((item) => item.workflowId).filter(Boolean)));
  const ledger = await readWorkflowRunnerLedger();
  const runRecord = {
    id: retryRunId,
    status: 'running',
    startedAt,
    retryOfRunId: runId,
    requested: failedWorkflowIds.length,
    results: []
  };

  ledger.runs = [...(ledger.runs ?? []), runRecord].slice(-100);
  ledger.events = [
    ...(ledger.events ?? []),
    { id: `${retryRunId}:started`, runId: retryRunId, sourceRunId: runId, type: 'retry_started', status: 'running', at: startedAt, requested: failedWorkflowIds.length }
  ].slice(-500);
  ledger.updatedAt = startedAt;
  await writeWorkflowRunnerLedger(ledger);

  const results = [];

  for (const workflowId of failedWorkflowIds) {
    try {
      const result = await replayWorkflowChain(workflowId, { artifactPath: artifactPathByWorkflowId[workflowId] });
      const item = { workflowId, status: 'done', action: result.actions[0]?.action, result };
      results.push(item);
      await appendWorkflowRunnerEvent({ runId: retryRunId, sourceRunId: runId, type: 'retry_chain_replayed', workflowId, status: 'done', action: item.action });
    } catch (error) {
      const item = { workflowId, status: 'failed', error: error instanceof Error ? error.message : String(error) };
      results.push(item);
      await appendWorkflowRunnerEvent({ runId: retryRunId, sourceRunId: runId, type: 'retry_chain_failed', workflowId, status: 'failed', error: item.error });
    }
  }

  const completedAt = new Date().toISOString();
  const finalLedger = await readWorkflowRunnerLedger();
  const targetRun = (finalLedger.runs ?? []).find((item) => item.id === retryRunId);

  if (targetRun) {
    targetRun.status = results.some((item) => item.status === 'failed') ? 'completed_with_errors' : 'completed';
    targetRun.completedAt = completedAt;
    targetRun.results = results.map((item) => ({ workflowId: item.workflowId, status: item.status, action: item.action, error: item.error }));
  }

  finalLedger.events = [
    ...(finalLedger.events ?? []),
    { id: `${retryRunId}:completed`, runId: retryRunId, sourceRunId: runId, type: 'retry_completed', status: targetRun?.status ?? 'completed', at: completedAt, requested: failedWorkflowIds.length }
  ].slice(-500);
  finalLedger.updatedAt = completedAt;
  await writeWorkflowRunnerLedger(finalLedger);

  return {
    runId: retryRunId,
    retryOfRunId: runId,
    queuedAt: startedAt,
    completedAt,
    requested: failedWorkflowIds.length,
    results,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function runWorkflowQueue({ limit = 5, artifactPathByWorkflowId = {} } = {}) {
  const runId = `workflow-queue-run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const ledger = await readWorkflowRunnerLedger();
  const runRecord = {
    id: runId,
    status: 'running',
    startedAt,
    requestedLimit: Number(limit) || 5,
    results: []
  };
  ledger.runs = [...(ledger.runs ?? []), runRecord].slice(-100);
  ledger.events = [
    ...(ledger.events ?? []),
    { id: `${runId}:started`, runId, type: 'queue_started', status: 'running', at: startedAt }
  ].slice(-500);
  ledger.updatedAt = startedAt;
  await writeWorkflowRunnerLedger(ledger);

  const runtime = await getWorkflowChainRuntime(null);
  const chains = (runtime.chains ?? []).filter((item) => !item.closed).slice(0, Number(limit) || 5);
  const results = [];

  for (const chain of chains) {
    try {
      const artifactPath = artifactPathByWorkflowId[chain.workflowId];
      const result = await replayWorkflowChain(chain.workflowId, { artifactPath });
      const item = { workflowId: chain.workflowId, status: 'done', action: result.actions[0]?.action, result };
      results.push(item);
      await appendWorkflowRunnerEvent({ runId, type: 'chain_replayed', workflowId: chain.workflowId, status: 'done', action: item.action });
    } catch (error) {
      const item = { workflowId: chain.workflowId, status: 'failed', error: error instanceof Error ? error.message : String(error) };
      results.push(item);
      await appendWorkflowRunnerEvent({ runId, type: 'chain_failed', workflowId: chain.workflowId, status: 'failed', error: item.error });
    }
  }

  const completedAt = new Date().toISOString();
  const nextRuntime = await getWorkflowChainRuntime(null);
  const finalLedger = await readWorkflowRunnerLedger();
  const targetRun = (finalLedger.runs ?? []).find((item) => item.id === runId);

  if (targetRun) {
    targetRun.status = results.some((item) => item.status === 'failed') ? 'completed_with_errors' : 'completed';
    targetRun.completedAt = completedAt;
    targetRun.requested = chains.length;
    targetRun.results = results.map((item) => ({ workflowId: item.workflowId, status: item.status, action: item.action, error: item.error }));
  }

  finalLedger.events = [
    ...(finalLedger.events ?? []),
    { id: `${runId}:completed`, runId, type: 'queue_completed', status: targetRun?.status ?? 'completed', at: completedAt, requested: chains.length }
  ].slice(-500);
  finalLedger.updatedAt = completedAt;
  await writeWorkflowRunnerLedger(finalLedger);

  return {
    runId,
    queuedAt: startedAt,
    completedAt,
    requested: chains.length,
    results,
    runner: await getWorkflowRunnerStatus(),
    snapshot: nextRuntime.snapshot
  };
}

async function runReleasePublishQueue({ limit = 5, releaseId = null, dryRun = false } = {}) {
  const runId = `release-publish-run-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const ledger = await readWorkflowRunnerLedger();
  const queuedItems = (ledger.releasePublishQueue ?? [])
    .filter((item) => item.status === 'queued' && (!releaseId || item.releaseId === releaseId))
    .slice(0, Number(limit) || 5);
  const runRecord = {
    id: runId,
    status: 'running',
    startedAt,
    releaseId,
    requested: queuedItems.length,
    results: []
  };

  if (dryRun) {
    const releaseRegistry = await readReleaseRegistry();
    const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
    const releasesById = new Map((releaseRegistry.releases ?? []).map((release) => [release.id, release]));
    const results = [];

    for (const queueItem of queuedItems) {
      const release = releasesById.get(queueItem.releaseId);

      if (!release) {
        results.push({ releaseId: queueItem.releaseId, status: 'blocked', error: `Release not found: ${queueItem.releaseId}` });
        continue;
      }

      const gate = await getReleasePublishGate(release, reviewLedger.reviews ?? []);
      if (!gate.canPublish) {
        results.push({
          releaseId: queueItem.releaseId,
          status: 'blocked',
          error: gate.blockers.map((item) => `${item.code}${item.target ? `:${item.target}` : ''}`).join(', '),
          publishGate: gate
        });
        continue;
      }

      results.push({
        releaseId: queueItem.releaseId,
        status: 'published',
        dryRun: true,
        publishGate: gate
      });
    }

    const completedAt = new Date().toISOString();
    return {
      runId,
      dryRun: true,
      queuedAt: startedAt,
      completedAt,
      requested: queuedItems.length,
      results,
      runner: await getWorkflowRunnerStatus(),
      snapshot: await buildSnapshot()
    };
  }

  ledger.releasePublishRuns = [...(ledger.releasePublishRuns ?? []), runRecord].slice(-100);
  ledger.events = [
    ...(ledger.events ?? []),
    { id: `${runId}:started`, runId, releaseId: releaseId ?? undefined, type: 'release_publish_queue_started', status: 'running', at: startedAt, requested: queuedItems.length }
  ].slice(-500);
  ledger.updatedAt = startedAt;
  await writeWorkflowRunnerLedger(ledger);

  const results = [];

  for (const queueItem of queuedItems) {
    try {
      const result = await updateReleasePackageStatus(queueItem.releaseId, 'published', '发布队列自动发布');
      const publishedAt = new Date().toISOString();
      results.push({ releaseId: queueItem.releaseId, status: 'published', publishedAt, result });
      await appendWorkflowRunnerEvent({ runId, type: 'release_published_from_queue', status: 'published', releaseId: queueItem.releaseId, at: publishedAt });
    } catch (error) {
      const blockedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      results.push({ releaseId: queueItem.releaseId, status: 'blocked', error: message });
      await appendWorkflowRunnerEvent({ runId, type: 'release_publish_blocked', status: 'blocked', releaseId: queueItem.releaseId, error: message, at: blockedAt });
    }
  }

  const completedAt = new Date().toISOString();
  const finalLedger = await readWorkflowRunnerLedger();
  const targetRun = (finalLedger.releasePublishRuns ?? []).find((item) => item.id === runId);
  const resultByReleaseId = new Map(results.map((item) => [item.releaseId, item]));

  finalLedger.releasePublishQueue = (finalLedger.releasePublishQueue ?? []).map((item) => {
    const result = resultByReleaseId.get(item.releaseId);
    if (!result) return item;
    return {
      ...item,
      status: result.status,
      updatedAt: completedAt,
      publishedAt: result.publishedAt,
      error: result.error
    };
  });

  if (targetRun) {
    targetRun.status = results.some((item) => item.status === 'blocked') ? 'completed_with_errors' : 'completed';
    targetRun.completedAt = completedAt;
    targetRun.results = results.map((item) => ({ releaseId: item.releaseId, status: item.status, error: item.error }));
  }

  finalLedger.events = [
    ...(finalLedger.events ?? []),
    { id: `${runId}:completed`, runId, releaseId: releaseId ?? undefined, type: 'release_publish_queue_completed', status: targetRun?.status ?? 'completed', at: completedAt, requested: queuedItems.length }
  ].slice(-500);
  finalLedger.updatedAt = completedAt;
  await writeWorkflowRunnerLedger(finalLedger);

  return {
    runId,
    dryRun: false,
    queuedAt: startedAt,
    completedAt,
    requested: queuedItems.length,
    results,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function requeueReleasePublishFailures({ releaseId = null, reason = 'manual_requeue' } = {}) {
  const requeuedAt = new Date().toISOString();
  const ledger = await readWorkflowRunnerLedger();
  const releaseRegistry = await readReleaseRegistry();
  const releasesById = new Map((releaseRegistry.releases ?? []).map((release) => [release.id, release]));
  const blockedItems = (ledger.releasePublishQueue ?? []).filter((item) => item.status === 'blocked' && (!releaseId || item.releaseId === releaseId));
  const requeuedItems = [];

  for (const item of blockedItems) {
    const release = releasesById.get(item.releaseId);
    if (!release) continue;

    const nextItem = {
      ...item,
      status: 'queued',
      updatedAt: requeuedAt,
      reason,
      manifestPath: release.manifestPath ?? item.manifestPath ?? null,
      artifactPaths: release.artifactPaths ?? item.artifactPaths ?? [],
      retryCount: (item.retryCount ?? 0) + 1
    };
    delete nextItem.error;
    requeuedItems.push(nextItem);
  }

  const requeuedById = new Map(requeuedItems.map((item) => [item.id, item]));
  ledger.releasePublishQueue = (ledger.releasePublishQueue ?? []).map((item) => requeuedById.get(item.id) ?? item);
  ledger.events = [
    ...(ledger.events ?? []),
    ...requeuedItems.map((item) => ({
      id: `release-publish-requeued-${item.releaseId}-${Date.now()}`,
      type: 'release_publish_requeued',
      status: 'queued',
      releaseId: item.releaseId,
      at: requeuedAt,
      reason,
      requested: requeuedItems.length
    }))
  ].slice(-500);
  ledger.updatedAt = requeuedAt;
  await writeWorkflowRunnerLedger(ledger);

  return {
    requeuedAt,
    requested: requeuedItems.length,
    requeuedItems,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function runReleasePublishQueueSmoke({ releaseId = null } = {}) {
  const smokedAt = new Date().toISOString();
  const registry = await readReleaseRegistry();
  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const release = (registry.releases ?? []).find((item) => releaseId ? item.id === releaseId : ['approved', 'published'].includes(item.status)) ?? (registry.releases ?? [])[0];

  if (!release) {
    throw new Error('No release package available for publish queue smoke.');
  }

  const gate = await getReleasePublishGate(release, reviewLedger.reviews ?? []);
  const blockedItem = {
    id: `release-publish-smoke-${release.id}`,
    releaseId: release.id,
    episodeId: release.episodeId,
    status: 'blocked',
    queuedAt: smokedAt,
    updatedAt: smokedAt,
    reason: 'smoke_forced_blocked',
    manifestPath: release.manifestPath ?? null,
    artifactPaths: release.artifactPaths ?? [],
    error: 'Smoke forced blocked state.'
  };
  const requeuedItem = {
    ...blockedItem,
    status: 'queued',
    reason: 'smoke_requeue',
    retryCount: 1
  };
  delete requeuedItem.error;

  const publishableStatus = release.status === 'approved' || release.status === 'published';
  const publishResult = publishableStatus && gate.canPublish
    ? { releaseId: release.id, status: 'published', dryRun: true }
    : { releaseId: release.id, status: 'blocked', dryRun: true, error: publishableStatus ? gate.blockers.map((item) => item.code).join(', ') || 'publish gate blocked' : `release status ${release.status} is not publishable` };

  return {
    smokedAt,
    dryRun: true,
    release: {
      id: release.id,
      title: release.title,
      status: release.status,
      episodeId: release.episodeId
    },
    publishGate: gate,
    steps: [
      { id: 'force_blocked', status: 'blocked', queueItem: blockedItem },
      { id: 'requeue_blocked', status: 'queued', queueItem: requeuedItem },
      { id: 'publish_attempt', status: publishResult.status, result: publishResult }
    ],
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

function runVirtualTaskQueueSmoke(taskPlan) {
  const progressDone = new Set();
  const queued = (taskPlan.subtasks ?? []).map((subtask, index) => ({
    id: `virtual-${taskPlan.taskId}-${subtask.id}`.replace(/[^a-zA-Z0-9_-]+/g, '-'),
    subtaskId: subtask.id,
    title: subtask.title,
    ownerRole: subtask.ownerRole,
    dependsOn: subtask.dependsOn ?? [],
    status: subtask.status === 'blocked' ? 'blocked' : 'queued',
    queueOrder: index,
    inputChecks: inspectTaskArtifactPaths(subtask.inputArtifacts ?? []),
    outputChecks: inspectTaskArtifactPaths(subtask.outputArtifacts ?? [])
  }));
  const results = [];

  while (results.length < queued.length) {
    const next = queued.find((item) => item.status === 'queued' && item.dependsOn.every((dependencyId) => progressDone.has(dependencyId)));
    if (!next) break;

    next.status = 'done';
    progressDone.add(next.subtaskId);
    results.push({
      subtaskId: next.subtaskId,
      status: 'done',
      dependencyCount: next.dependsOn.length,
      inputMissingCount: next.inputChecks.filter((item) => item.check === 'missing' || item.check === 'invalid').length,
      outputConcreteCount: next.outputChecks.filter((item) => item.check === 'exists' || item.check === 'missing').length
    });
  }

  const unresolved = queued.filter((item) => item.status !== 'done').map((item) => ({
    subtaskId: item.subtaskId,
    status: item.status,
    waitingFor: item.dependsOn.filter((dependencyId) => !progressDone.has(dependencyId))
  }));

  return {
    status: unresolved.length === 0 ? 'passed' : 'blocked',
    requested: queued.length,
    completed: results.length,
    results,
    unresolved
  };
}

async function runSmartVisionAnomalySmoke({ releaseId = null } = {}) {
  const smokedAt = new Date().toISOString();
  const registry = await readReleaseRegistry();
  const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
  const baseRelease = (registry.releases ?? []).find((item) => releaseId ? item.id === releaseId : ['approved', 'published'].includes(item.status)) ?? (registry.releases ?? [])[0];

  if (!baseRelease) {
    throw new Error('No release package available for anomaly smoke.');
  }

  const baseReviews = reviewLedger.reviews ?? [];
  const scenarios = [];
  const runScenario = async ({ id, title, releasePatch = {}, reviewPatch = null, expectedBlockers = [] }) => {
    const release = { ...baseRelease, ...releasePatch };
    const reviews = reviewPatch ? baseReviews.map((review) => reviewPatch(review, release)) : baseReviews;
    const gate = await getReleasePublishGate(release, reviews);
    const blockerCodes = gate.blockers.map((item) => item.code);
    const missingExpected = expectedBlockers.filter((code) => !blockerCodes.includes(code));

    scenarios.push({
      id,
      title,
      status: missingExpected.length === 0 ? 'passed' : 'failed',
      canPublish: gate.canPublish,
      expectedBlockers,
      blockerCodes,
      missingExpected,
      blockers: gate.blockers
    });
  };

  await runScenario({
    id: 'release_status_not_approved',
    title: 'Release 未批准时必须阻塞发布',
    releasePatch: { status: 'draft' },
    expectedBlockers: ['release_status_not_approved']
  });
  await runScenario({
    id: 'manifest_missing',
    title: 'manifestPath 缺失时必须阻塞发布',
    releasePatch: { manifestPath: null },
    expectedBlockers: ['release_manifest_missing']
  });
  await runScenario({
    id: 'artifact_file_missing',
    title: 'artifact 文件缺失时必须阻塞发布',
    releasePatch: {
      artifactPaths: [
        ...(baseRelease.artifactPaths ?? []),
        '05-可选输出/审核剪辑发布/release/ep001/__missing-smoke-artifact.mp4'
      ]
    },
    expectedBlockers: ['release_artifact_missing']
  });
  await runScenario({
    id: 'release_review_not_done',
    title: 'Release review 未完成时必须阻塞发布',
    reviewPatch: (review, release) => review.id === release.reviewId ? { ...review, status: 'waiting_review' } : review,
    expectedBlockers: ['release_review_not_done']
  });
  await runScenario({
    id: 'qa_review_not_done',
    title: 'QA review 未完成时必须阻塞发布',
    reviewPatch: (review) => review.type === 'qa_review' ? { ...review, status: 'waiting_review' } : review,
    expectedBlockers: ['release_qa_review_not_done']
  });

  const runnerLedger = await readWorkflowRunnerLedger();
  const activeTaskItem = (runnerLedger.taskQueue ?? [])[0] ?? { id: 'task-queue-anomaly-smoke-active-task', status: 'done' };
  const activeReleaseItem = (runnerLedger.releasePublishQueue ?? [])[0] ?? { id: 'release-publish-anomaly-smoke-active-release', status: 'published' };
  const corruptRunnerLedger = {
    ...runnerLedger,
    taskQueue: runnerLedger.taskQueue?.length ? runnerLedger.taskQueue : [activeTaskItem],
    releasePublishQueue: runnerLedger.releasePublishQueue?.length ? runnerLedger.releasePublishQueue : [activeReleaseItem],
    archives: {
      ...(runnerLedger.archives ?? {}),
      taskQueue: [activeTaskItem, activeTaskItem],
      releasePublishQueue: [activeReleaseItem],
      taskQueueRuns: { invalid: true },
      events: 'invalid-events-bucket',
      lastCompactedAt: 'not-a-valid-date'
    }
  };
  const archiveIssues = collectRunnerArchiveIssues(corruptRunnerLedger);
  const archiveIssueCodes = archiveIssues.map((item) => item.code);
  const archiveRepairPreview = normalizeWorkflowRunnerArchives(corruptRunnerLedger.archives);
  const expectedArchiveIssues = [
    'runner_archive_bucket_invalid',
    'runner_archive_last_compacted_at_invalid',
    'runner_archive_duplicate_active_task',
    'runner_archive_duplicate_active_release'
  ];
  const missingArchiveIssues = expectedArchiveIssues.filter((code) => !archiveIssueCodes.includes(code));
  scenarios.push({
    id: 'runner_archive_corruption',
    title: 'Runner archive 损坏时必须被诊断并可预览修复',
    status: missingArchiveIssues.length === 0 && archiveRepairPreview.repairedCount > 0 ? 'passed' : 'failed',
    expectedSignals: expectedArchiveIssues,
    observedSignals: archiveIssueCodes,
    missingExpected: missingArchiveIssues,
    repairedCount: archiveRepairPreview.repairedCount,
    issues: archiveIssues
  });

  const dependencyTaskPlan = await createWorkflowTaskPlan({ taskType: 'video_generation', taskId: `sv-anomaly-missing-dependency-${Date.now()}` });
  const missingDependencyId = '__missing_dependency_smoke__';
  const dependencyBrokenPlan = {
    ...dependencyTaskPlan,
    subtasks: (dependencyTaskPlan.subtasks ?? []).map((subtask) => subtask.id === 'load-data-pack' ? { ...subtask, dependsOn: [missingDependencyId] } : subtask),
    orchestration: {
      ...(dependencyTaskPlan.orchestration ?? {}),
      dependencyCount: (dependencyTaskPlan.orchestration?.dependencyCount ?? 0) + 1,
      blocked: true
    }
  };
  const dependencySmoke = runVirtualTaskQueueSmoke(dependencyBrokenPlan);
  const missingDependencyObserved = dependencySmoke.unresolved.some((item) => item.waitingFor.includes(missingDependencyId));
  scenarios.push({
    id: 'task_queue_dependency_missing',
    title: 'taskQueue 依赖缺失时虚拟执行必须阻塞',
    status: dependencySmoke.status === 'blocked' && missingDependencyObserved ? 'passed' : 'failed',
    expectedSignals: ['task_queue_blocked', missingDependencyId],
    observedSignals: dependencySmoke.unresolved.flatMap((item) => item.waitingFor),
    missingExpected: dependencySmoke.status === 'blocked' && missingDependencyObserved ? [] : ['task_queue_blocked'],
    requested: dependencySmoke.requested,
    completed: dependencySmoke.completed,
    unresolvedCount: dependencySmoke.unresolved.length,
    unresolved: dependencySmoke.unresolved
  });

  const contextPack = await buildTaskContextPack('video_generation');
  const missingReferencePath = 'docs/__missing-anomaly-smoke-reference.md';
  const missingReference = await parseReferenceFile(missingReferencePath, 'docs');
  const missingReferenceIssue = {
    path: missingReference.path,
    sourceKind: missingReference.sourceKind,
    error: missingReference.error ?? 'reference unavailable'
  };
  const injectedContextPack = {
    ...contextPack,
    docs: [missingReferencePath, ...contextPack.docs],
    parsedReferences: [missingReference, ...(contextPack.parsedReferences ?? [])],
    referenceIssues: [missingReferenceIssue, ...(contextPack.referenceIssues ?? [])],
    dataPackSummary: {
      ...(contextPack.dataPackSummary ?? {}),
      referenceCount: (contextPack.dataPackSummary?.referenceCount ?? 0) + 1,
      missingReferenceCount: (contextPack.dataPackSummary?.missingReferenceCount ?? 0) + 1
    }
  };
  const injectedSubtasks = createTaskPlanSubtasks('video_generation', injectedContextPack, inferOutputArtifacts('video_generation'));
  const blockedSubtasks = injectedSubtasks.filter((item) => item.status === 'blocked');
  const contextReferenceObserved = injectedContextPack.referenceIssues.some((item) => item.path === missingReference.path);
  scenarios.push({
    id: 'context_pack_reference_missing',
    title: 'context pack 引用缺失时任务计划必须显式阻塞',
    status: contextReferenceObserved && blockedSubtasks.some((item) => item.id === 'load-data-pack') ? 'passed' : 'failed',
    expectedSignals: ['reference_issue', 'load-data-pack_blocked'],
    observedSignals: [
      ...injectedContextPack.referenceIssues.map((item) => item.path),
      ...blockedSubtasks.map((item) => `${item.id}_blocked`)
    ],
    missingExpected: contextReferenceObserved && blockedSubtasks.some((item) => item.id === 'load-data-pack') ? [] : ['reference_issue_or_blocked_subtask'],
    referenceIssueCount: injectedContextPack.referenceIssues.length,
    blockedSubtaskCount: blockedSubtasks.length,
    referenceIssues: injectedContextPack.referenceIssues.slice(0, 6)
  });

  const pipelinePlan = await createIndustrialProductionPipelinePlan({ episodeId: 'ep001' });
  const pipelineWorkflowRegistry = { workflows: [] };
  const makePipelineRunFixture = () => buildPipelineRunFromPlan(pipelinePlan, smokedAt);
  const corruptPipelineIssues = collectPipelineRunIssues({
    version: '0.1.0',
    projectId: pipelinePlan.projectId,
    runs: [
      { id: 'pipeline-anomaly-duplicate', status: 'running', stages: [] },
      { id: 'pipeline-anomaly-duplicate', status: 'ghost', stages: [] }
    ],
    events: 'invalid-events'
  }, { reviews: [] }, pipelineWorkflowRegistry);
  const corruptPipelineIssueCodes = corruptPipelineIssues.map((item) => item.code);
  const expectedCorruptPipelineIssues = [
    'pipeline_run_ledger_events_invalid',
    'pipeline_run_duplicate',
    'pipeline_run_status_invalid',
    'pipeline_run_stages_invalid'
  ];
  const missingCorruptPipelineIssues = expectedCorruptPipelineIssues.filter((code) => !corruptPipelineIssueCodes.includes(code));
  scenarios.push({
    id: 'pipeline_run_ledger_corruption',
    title: 'Pipeline Run ledger 损坏时必须被诊断',
    status: missingCorruptPipelineIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedCorruptPipelineIssues,
    observedSignals: corruptPipelineIssueCodes,
    missingExpected: missingCorruptPipelineIssues,
    issues: corruptPipelineIssues
  });

  const artifactMissingRun = makePipelineRunFixture();
  const artifactMissingStage = artifactMissingRun.stages.find((stage) => stage.id === 'asset_images');
  artifactMissingStage.status = 'done';
  artifactMissingStage.workflowId = 'pipeline-anomaly-asset-workflow';
  artifactMissingStage.workflowPath = '02-工作流/ep001/pipeline-anomaly-asset-workflow.mjb-workflow.json';
  artifactMissingStage.artifactPaths = [];
  artifactMissingStage.reviewIds = ['pipeline-anomaly-asset-review'];
  const artifactMissingReviews = [{
    id: 'pipeline-anomaly-asset-review',
    type: 'asset_image_review',
    status: 'done',
    workflowId: artifactMissingStage.workflowId,
    artifactPath: null
  }];
  const artifactMissingGate = evaluatePipelineStageGate(artifactMissingStage, artifactMissingReviews);
  const artifactMissingIssues = collectPipelineRunIssues({ runs: [artifactMissingRun], events: [] }, { reviews: artifactMissingReviews }, { workflows: [{ id: artifactMissingStage.workflowId }] });
  const artifactMissingObserved = [...artifactMissingGate.blockers.map((item) => item.code), ...artifactMissingIssues.map((item) => item.code)];
  scenarios.push({
    id: 'pipeline_stage_artifact_missing',
    title: 'Pipeline 阶段 done 但产物缺失时必须阻塞',
    status: artifactMissingObserved.includes('stage_artifact_missing') && artifactMissingObserved.includes('pipeline_stage_done_artifact_missing') ? 'passed' : 'failed',
    expectedSignals: ['stage_artifact_missing', 'pipeline_stage_done_artifact_missing'],
    observedSignals: artifactMissingObserved,
    missingExpected: ['stage_artifact_missing', 'pipeline_stage_done_artifact_missing'].filter((code) => !artifactMissingObserved.includes(code)),
    gate: artifactMissingGate,
    issues: artifactMissingIssues
  });

  const reviewConflictRun = makePipelineRunFixture();
  const reviewConflictStage = reviewConflictRun.stages.find((stage) => stage.id === 'asset_images');
  reviewConflictStage.status = 'waiting_review';
  reviewConflictStage.workflowId = 'pipeline-anomaly-review-conflict-workflow';
  reviewConflictStage.workflowPath = '02-工作流/ep001/pipeline-anomaly-review-conflict-workflow.mjb-workflow.json';
  reviewConflictStage.artifactPaths = ['01-资产图与提示词/资产图/ep001/pipeline-anomaly-asset.png'];
  reviewConflictStage.reviewIds = ['pipeline-anomaly-asset-blocked-review'];
  const reviewConflictReviews = [{
    id: 'pipeline-anomaly-asset-blocked-review',
    type: 'asset_image_review',
    status: 'blocked',
    workflowId: reviewConflictStage.workflowId,
    artifactPath: reviewConflictStage.artifactPaths[0]
  }];
  const reviewConflictGate = evaluatePipelineStageGate(reviewConflictStage, reviewConflictReviews);
  const reviewConflictIssues = collectPipelineRunIssues({ runs: [reviewConflictRun], events: [] }, { reviews: reviewConflictReviews }, { workflows: [{ id: reviewConflictStage.workflowId }] });
  const reviewConflictObserved = [...reviewConflictGate.blockers.map((item) => item.code), ...reviewConflictIssues.map((item) => item.code)];
  scenarios.push({
    id: 'pipeline_stage_review_conflict',
    title: 'Pipeline 阶段 review blocked 时必须阻塞推进',
    status: reviewConflictObserved.includes('stage_review_blocked') && reviewConflictObserved.includes('pipeline_stage_review_blocked') ? 'passed' : 'failed',
    expectedSignals: ['stage_review_blocked', 'pipeline_stage_review_blocked'],
    observedSignals: reviewConflictObserved,
    missingExpected: ['stage_review_blocked', 'pipeline_stage_review_blocked'].filter((code) => !reviewConflictObserved.includes(code)),
    gate: reviewConflictGate,
    issues: reviewConflictIssues
  });

  const missingWorkflowRun = makePipelineRunFixture();
  const storyboardStage = missingWorkflowRun.stages.find((stage) => stage.id === 'storyboard_images');
  missingWorkflowRun.status = 'running';
  missingWorkflowRun.currentStageId = storyboardStage.id;
  storyboardStage.status = 'workflow_ready';
  storyboardStage.workflowId = '__missing_storyboard_workflow__';
  storyboardStage.workflowPath = '02-工作流/ep001/__missing_storyboard_workflow__.mjb-workflow.json';
  const missingWorkflowIssues = collectPipelineRunIssues({ runs: [missingWorkflowRun], events: [] }, { reviews: [] }, pipelineWorkflowRegistry);
  const missingWorkflowIssueCodes = missingWorkflowIssues.map((item) => item.code);
  scenarios.push({
    id: 'pipeline_downstream_workflow_missing',
    title: 'Pipeline 下游 Workflow 丢失时必须被诊断',
    status: missingWorkflowIssueCodes.includes('pipeline_stage_workflow_missing') ? 'passed' : 'failed',
    expectedSignals: ['pipeline_stage_workflow_missing'],
    observedSignals: missingWorkflowIssueCodes,
    missingExpected: missingWorkflowIssueCodes.includes('pipeline_stage_workflow_missing') ? [] : ['pipeline_stage_workflow_missing'],
    issues: missingWorkflowIssues
  });

  const workflowRunMismatchRun = makePipelineRunFixture();
  const workflowRunMismatchStage = workflowRunMismatchRun.stages.find((stage) => stage.id === 'videos');
  workflowRunMismatchStage.status = 'workflow_ready';
  workflowRunMismatchStage.workflowId = 'pipeline-anomaly-cross-run-video-workflow';
  workflowRunMismatchStage.workflowPath = '02-工作流/ep999/pipeline-anomaly-cross-run-video-workflow.mjb-workflow.json';
  const workflowRunMismatchIssues = collectPipelineRunIssues({ runs: [workflowRunMismatchRun], events: [] }, { reviews: [] }, {
    workflows: [{
      id: workflowRunMismatchStage.workflowId,
      type: workflowRunMismatchStage.taskType,
      path: workflowRunMismatchStage.workflowPath,
      pipelineRunId: 'pipeline-anomaly-other-run',
      pipelineStageId: workflowRunMismatchStage.id
    }]
  });
  const workflowRunMismatchIssueCodes = workflowRunMismatchIssues.map((item) => item.code);
  scenarios.push({
    id: 'pipeline_stage_workflow_run_mismatch',
    title: 'Pipeline 阶段误绑定其他 Run 的 Workflow 时必须被诊断',
    status: workflowRunMismatchIssueCodes.includes('pipeline_stage_workflow_run_mismatch') ? 'passed' : 'failed',
    expectedSignals: ['pipeline_stage_workflow_run_mismatch'],
    observedSignals: workflowRunMismatchIssueCodes,
    missingExpected: workflowRunMismatchIssueCodes.includes('pipeline_stage_workflow_run_mismatch') ? [] : ['pipeline_stage_workflow_run_mismatch'],
    issues: workflowRunMismatchIssues
  });

  const pipelineRepairWriteSmoke = await runPipelineRunRepairWriteSmoke();
  scenarios.push({
    id: 'pipeline_run_repair_write_fixture',
    title: 'Pipeline Run 损坏样本必须能从 preview 到真实 repair 写入闭环',
    status: pipelineRepairWriteSmoke.status,
    expectedBlockers: [],
    blockerCodes: [],
    expectedSignals: pipelineRepairWriteSmoke.expectedRepairCodes,
    observedSignals: pipelineRepairWriteSmoke.repairCodes,
    previewSignals: pipelineRepairWriteSmoke.previewCodes,
    missingExpected: pipelineRepairWriteSmoke.missingExpected,
    dryRunRepairCount: pipelineRepairWriteSmoke.dryRunRepairCount,
    realRepairCount: pipelineRepairWriteSmoke.realRepairCount,
    repairedStateValid: pipelineRepairWriteSmoke.repairedStateValid,
    realDiagnostics: pipelineRepairWriteSmoke.realDiagnostics,
    cleanupRestored: pipelineRepairWriteSmoke.cleanupRestored,
    cleanupDiagnostics: pipelineRepairWriteSmoke.cleanupDiagnostics
  });

  const releaseRegistryCorruptionIssues = collectReleaseRegistryIssues({
    ...registry,
    releases: [
      baseRelease,
      { ...baseRelease },
      {
        id: 'release-anomaly-malformed',
        status: 'ghost',
        artifactPaths: 'not-an-array',
        history: { invalid: true }
      }
    ],
    publishHistory: { invalid: true },
    archiveHistory: 'invalid-archive-history',
    restoreHistory: [{ releaseId: '__missing_release_history_ref__' }]
  });
  const releaseRegistryCorruptionCodes = releaseRegistryCorruptionIssues.map((item) => item.code);
  const expectedReleaseRegistryIssues = [
    'release_registry_publish_history_invalid',
    'release_registry_archive_history_invalid',
    'release_registry_duplicate_release',
    'release_status_invalid',
    'release_artifact_paths_invalid',
    'release_history_invalid',
    'release_registry_restore_history_orphan'
  ];
  const missingReleaseRegistryIssues = expectedReleaseRegistryIssues.filter((code) => !releaseRegistryCorruptionCodes.includes(code));
  scenarios.push({
    id: 'release_registry_json_structure_corruption',
    title: 'Release Registry JSON 结构损坏时必须被诊断',
    status: missingReleaseRegistryIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedReleaseRegistryIssues,
    observedSignals: releaseRegistryCorruptionCodes,
    missingExpected: missingReleaseRegistryIssues,
    issues: releaseRegistryCorruptionIssues
  });

  const workflowRegistryCorruptionIssues = collectWorkflowRegistryIssues({
    workflows: [
      {
        id: 'workflow-anomaly-duplicate',
        path: '02-工作流/ep001/workflow-anomaly-duplicate.mjb-workflow.json',
        type: 'video_generation',
        status: 'todo',
        outputArtifacts: []
      },
      {
        id: 'workflow-anomaly-duplicate',
        path: '../outside-workflow.json',
        type: 'video_generation',
        status: 'ghost',
        outputArtifacts: 'not-an-array'
      }
    ],
    chains: { invalid: true }
  });
  const workflowRegistryCorruptionCodes = workflowRegistryCorruptionIssues.map((item) => item.code);
  const expectedWorkflowRegistryIssues = [
    'workflow_registry_chains_invalid',
    'workflow_registry_duplicate_workflow',
    'workflow_path_invalid',
    'workflow_status_invalid',
    'workflow_output_artifacts_invalid'
  ];
  const missingWorkflowRegistryIssues = expectedWorkflowRegistryIssues.filter((code) => !workflowRegistryCorruptionCodes.includes(code));
  scenarios.push({
    id: 'workflow_registry_json_structure_corruption',
    title: 'Workflow Registry JSON 结构损坏时必须被诊断',
    status: missingWorkflowRegistryIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedWorkflowRegistryIssues,
    observedSignals: workflowRegistryCorruptionCodes,
    missingExpected: missingWorkflowRegistryIssues,
    issues: workflowRegistryCorruptionIssues
  });

  const reviewLedgerCorruptionIssues = collectReviewLedgerIssues({
    reviews: [
      {
        id: 'review-anomaly-duplicate',
        status: 'waiting_review',
        workflowId: 'workflow-anomaly-review',
        artifactPath: '01-资产图与提示词/资产图/review-anomaly.png'
      },
      {
        id: 'review-anomaly-duplicate',
        status: 'ghost',
        workflowId: '__missing_review_workflow__',
        artifactPath: '01-资产图与提示词/资产图/review-anomaly.png'
      }
    ],
    history: [
      { reviewId: '__missing_history_review__', artifactPath: '01-资产图与提示词/资产图/missing-history.png' }
    ]
  }, {
    workflows: [{ id: 'workflow-anomaly-review' }]
  }, {
    primaryArtifacts: []
  });
  const reviewLedgerCorruptionCodes = reviewLedgerCorruptionIssues.map((item) => item.code);
  const expectedReviewLedgerIssues = [
    'review_ledger_duplicate_review',
    'review_status_invalid',
    'review_ledger_workflow_missing',
    'review_ledger_artifact_not_indexed',
    'review_ledger_history_orphan'
  ];
  const missingReviewLedgerIssues = expectedReviewLedgerIssues.filter((code) => !reviewLedgerCorruptionCodes.includes(code));
  scenarios.push({
    id: 'review_ledger_history_corruption',
    title: 'Review Ledger history / review 结构异常时必须被诊断',
    status: missingReviewLedgerIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedReviewLedgerIssues,
    observedSignals: reviewLedgerCorruptionCodes,
    missingExpected: missingReviewLedgerIssues,
    issues: reviewLedgerCorruptionIssues
  });

  const artifactReviewConflictId = 'artifact-anomaly-pending-completed-conflict-review';
  const artifactReviewConflictIssues = collectArtifactReviewRegistryIssues({
    pendingReviews: [
      {
        reviewId: artifactReviewConflictId,
        workflowId: 'workflow-anomaly-artifact-conflict',
        artifactPath: '03-视频/anomaly-conflict.mp4',
        status: 'done'
      },
      {
        reviewId: artifactReviewConflictId,
        workflowId: 'workflow-anomaly-artifact-conflict',
        artifactPath: '03-视频/anomaly-conflict.mp4',
        status: 'waiting_review'
      }
    ],
    completedReviews: [
      {
        reviewId: artifactReviewConflictId,
        workflowId: 'workflow-anomaly-artifact-conflict',
        artifactPath: '03-视频/anomaly-conflict.mp4',
        status: 'waiting_review'
      }
    ],
    reviewHistory: { invalid: true }
  }, {
    reviews: [
      {
        id: artifactReviewConflictId,
        type: 'video_review',
        status: 'waiting_review',
        workflowId: 'workflow-anomaly-artifact-conflict',
        artifactPath: '03-视频/anomaly-conflict.mp4'
      }
    ]
  });
  const artifactReviewConflictCodes = artifactReviewConflictIssues.map((item) => item.code);
  const expectedArtifactReviewIssues = [
    'artifact_review_history_invalid',
    'completed_review_in_pending_registry',
    'artifact_pending_review_duplicate',
    'artifact_completed_review_not_done',
    'artifact_review_pending_completed_conflict'
  ];
  const missingArtifactReviewIssues = expectedArtifactReviewIssues.filter((code) => !artifactReviewConflictCodes.includes(code));
  scenarios.push({
    id: 'artifact_registry_review_conflict',
    title: 'Artifact Registry pending/completed review 冲突时必须被诊断',
    status: missingArtifactReviewIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedArtifactReviewIssues,
    observedSignals: artifactReviewConflictCodes,
    missingExpected: missingArtifactReviewIssues,
    issues: artifactReviewConflictIssues
  });

  const taskRunReportIssues = collectTaskRunReportIssues({
    taskQueue: [
      {
        id: 'task-queue-anomaly-report-missing',
        status: 'done',
        reportPath: null
      },
      {
        id: 'task-queue-anomaly-report-file-missing',
        status: 'failed',
        reportPath: '.smart-vision/task-runs/__missing-anomaly-smoke__/missing-report.json'
      }
    ],
    taskQueueRuns: [
      {
        id: 'task-queue-run-anomaly-report',
        results: [
          {
            taskQueueId: 'task-queue-anomaly-run-report-file-missing',
            status: 'done',
            reportPath: '.smart-vision/task-runs/__missing-anomaly-smoke__/missing-run-result-report.json'
          }
        ]
      },
      {
        id: 'task-queue-run-anomaly-invalid-results',
        results: { invalid: true }
      }
    ]
  });
  const taskRunReportCodes = taskRunReportIssues.map((item) => item.code);
  const expectedTaskRunReportIssues = [
    'task_run_report_missing',
    'task_run_report_file_missing',
    'task_queue_run_results_invalid'
  ];
  const missingTaskRunReportIssues = expectedTaskRunReportIssues.filter((code) => !taskRunReportCodes.includes(code));
  scenarios.push({
    id: 'task_run_report_missing',
    title: 'task-run 报告缺失时必须被诊断',
    status: missingTaskRunReportIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedTaskRunReportIssues,
    observedSignals: taskRunReportCodes,
    missingExpected: missingTaskRunReportIssues,
    issues: taskRunReportIssues
  });

  const stateOperationJournalIssues = collectStateOperationJournalIssues({
    operations: [
      {
        id: 'state-op-anomaly-running',
        operation: 'release_publish_queue_run',
        target: 'release-anomaly',
        status: 'running',
        at: '2026-05-09T00:00:00.000Z'
      },
      {
        id: 'state-op-anomaly-running-duplicate',
        operation: 'release_publish_queue_run',
        target: 'release-anomaly',
        status: 'running',
        at: '2026-05-09T00:00:00.000Z'
      },
      {
        operation: 'runtime_repair',
        target: 'workflow_runtime',
        status: 'ghost',
        at: smokedAt
      }
    ]
  }, Date.parse('2026-05-09T01:00:00.000Z'));
  const stateOperationJournalCodes = stateOperationJournalIssues.map((item) => item.code);
  const expectedStateOperationJournalIssues = [
    'state_operation_interrupted',
    'state_operation_duplicate_running',
    'state_operation_id_missing',
    'state_operation_status_invalid'
  ];
  const missingStateOperationJournalIssues = expectedStateOperationJournalIssues.filter((code) => !stateOperationJournalCodes.includes(code));
  scenarios.push({
    id: 'state_operation_journal_interrupted',
    title: 'state-operation-journal 卡死或结构异常时必须被诊断',
    status: missingStateOperationJournalIssues.length === 0 ? 'passed' : 'failed',
    expectedSignals: expectedStateOperationJournalIssues,
    observedSignals: stateOperationJournalCodes,
    missingExpected: missingStateOperationJournalIssues,
    issues: stateOperationJournalIssues
  });

  const canvasOutputIssues = collectCanvasOutputIssues({
    canvasOutputs: [
      {
        idempotencyKey: 'canvas-output-anomaly:node:missing',
        status: 'failed',
        error: 'canvas_output_file_missing',
        workflowId: 'missing-workflow',
        artifactPath: '01-资产图与提示词/画布回写/__missing-canvas-output.png',
        reviewId: 'missing-review',
        exists: false
      },
      {
        idempotencyKey: 'canvas-output-anomaly:node:duplicate',
        status: 'registered',
        workflowId: 'workflow-ok',
        artifactPath: '01-资产图与提示词/资产图/runtime-smoke-canvas-output.png',
        reviewId: 'review-ok',
        exists: true
      },
      {
        idempotencyKey: 'canvas-output-anomaly:node:duplicate',
        status: 'registered',
        workflowId: 'workflow-ok',
        artifactPath: '01-资产图与提示词/资产图/runtime-smoke-canvas-output.png',
        reviewId: 'review-ok',
        exists: true
      }
    ]
  }, { workflows: [{ id: 'workflow-ok' }] }, { reviews: [{ id: 'review-ok' }] });
  const canvasOutputCodes = canvasOutputIssues.map((item) => item.code);
  const expectedCanvasOutputIssues = [
    'canvas_output_failed',
    'canvas_output_file_missing',
    'canvas_output_workflow_missing',
    'canvas_output_review_missing',
    'canvas_output_duplicate_idempotency_key'
  ];
  const missingCanvasOutputIssues = expectedCanvasOutputIssues.filter((code) => !canvasOutputCodes.includes(code));
  scenarios.push({
    id: 'canvas_output_failure_and_duplicate',
    title: 'Canvas 输出失败与重复回写必须被诊断',
    status: missingCanvasOutputIssues.length === 0 ? 'passed' : 'failed',
    expectedBlockers: [],
    blockerCodes: [],
    expectedSignals: expectedCanvasOutputIssues,
    observedSignals: canvasOutputCodes,
    missingExpected: missingCanvasOutputIssues,
    issues: canvasOutputIssues
  });

  const canvasRunLedgerIssues = collectCanvasRunLedgerIssues({
    sessions: [
      {
        id: 'canvas-run-anomaly-duplicate',
        status: 'output_registered',
        workflowId: '__missing_canvas_run_workflow__',
        artifactPath: '01-资产图与提示词/画布回写/__missing-canvas-run-output.png',
        reviewId: '__missing_canvas_run_review__',
        idempotencyKey: '__missing_canvas_run_output_key__'
      },
      {
        id: 'canvas-run-anomaly-duplicate',
        status: 'ghost',
        workflowId: 'workflow-ok',
        artifactPath: null,
        reviewId: null
      }
    ],
    events: 'invalid-events'
  }, { workflows: [{ id: 'workflow-ok' }] }, { reviews: [] }, { canvasOutputs: [] });
  const canvasRunLedgerCodes = canvasRunLedgerIssues.map((item) => item.code);
  const expectedCanvasRunLedgerIssues = [
    'canvas_run_events_invalid',
    'canvas_run_duplicate_session',
    'canvas_run_status_invalid',
    'canvas_run_workflow_missing',
    'canvas_run_artifact_file_missing',
    'canvas_run_review_missing',
    'canvas_run_canvas_output_missing'
  ];
  const missingCanvasRunLedgerIssues = expectedCanvasRunLedgerIssues.filter((code) => !canvasRunLedgerCodes.includes(code));
  scenarios.push({
    id: 'canvas_run_ledger_corruption',
    title: 'Canvas RUN 会话 ledger 损坏时必须被诊断',
    status: missingCanvasRunLedgerIssues.length === 0 ? 'passed' : 'failed',
    expectedBlockers: [],
    blockerCodes: [],
    expectedSignals: expectedCanvasRunLedgerIssues,
    observedSignals: canvasRunLedgerCodes,
    missingExpected: missingCanvasRunLedgerIssues,
    issues: canvasRunLedgerIssues
  });

  const malformedWorkflowPreflight = preflightWorkflowDraft({
    schema: 'broken-schema',
    id: '',
    name: '',
    taskType: 'video_generation',
    path: '../outside-workflow.json',
    importUrl: 'not-a-url',
    canvasExecution: {
      executor: 'direct_model',
      executionCarrier: 'model_api',
      directModelExecution: true,
      modelInvocation: 'direct',
      workflowMode: 'seedance_video_generation',
      workflowPath: '../outside-workflow.json',
      importUrl: 'not-a-url',
      editUrl: '',
      runUrl: ''
    },
    canvas: {
      nodes: [
        { id: 'n1', type: 'seedanceVideo', values: {} }
      ],
      conns: [
        { from: 'n1', to: '__missing_node__' }
      ]
    }
  }, { requireFile: false });
  const workflowPreflightCodes = malformedWorkflowPreflight.issues.map((item) => item.code);
  const expectedWorkflowPreflightIssues = [
    'workflow_path_invalid',
    'workflow_schema_invalid',
    'workflow_direct_model_execution_enabled',
    'workflow_connection_target_missing',
    'workflow_prompt_missing'
  ];
  const missingWorkflowPreflightIssues = expectedWorkflowPreflightIssues.filter((code) => !workflowPreflightCodes.includes(code));
  scenarios.push({
    id: 'workflow_preflight_contract_violation',
    title: 'Workflow JSON 契约异常必须被 preflight 阻塞',
    status: malformedWorkflowPreflight.status === 'failed' && missingWorkflowPreflightIssues.length === 0 ? 'passed' : 'failed',
    expectedBlockers: [],
    blockerCodes: [],
    expectedSignals: expectedWorkflowPreflightIssues,
    observedSignals: workflowPreflightCodes,
    missingExpected: missingWorkflowPreflightIssues,
    preflight: {
      status: malformedWorkflowPreflight.status,
      errorCount: malformedWorkflowPreflight.errorCount,
      warnCount: malformedWorkflowPreflight.warnCount
    }
  });

  const repairPreview = await repairWorkflowRuntimeState({ dryRun: true });
  scenarios.push({
    id: 'runtime_repair_dry_run',
    title: 'Runtime repair dry-run 不应落盘',
    status: repairPreview.dryRun ? 'passed' : 'failed',
    expectedBlockers: [],
    blockerCodes: [],
    missingExpected: repairPreview.dryRun ? [] : ['dryRun'],
    dryRun: repairPreview.dryRun,
    repairedProgressCount: repairPreview.repairedProgressCount,
    repairedReleaseCount: repairPreview.repairedReleaseCount ?? 0,
    repairedRunnerArchiveCount: repairPreview.repairedRunnerArchiveCount ?? 0
  });

  const publishPreview = await runReleasePublishQueue({ limit: 1, releaseId: baseRelease.id, dryRun: true });
  scenarios.push({
    id: 'release_publish_queue_dry_run',
    title: '发布队列 dry-run 不应写入发布状态',
    status: publishPreview.dryRun ? 'passed' : 'failed',
    expectedBlockers: [],
    blockerCodes: [],
    missingExpected: publishPreview.dryRun ? [] : ['dryRun'],
    dryRun: publishPreview.dryRun,
    requested: publishPreview.requested,
    results: publishPreview.results
  });

  const failed = scenarios.filter((item) => item.status !== 'passed');

  return {
    smokedAt,
    dryRun: true,
    status: failed.length === 0 ? 'passed' : 'failed',
    release: {
      id: baseRelease.id,
      title: baseRelease.title,
      status: baseRelease.status,
      episodeId: baseRelease.episodeId
    },
    scenarios,
    failed,
    diagnostics: await diagnoseWorkflowRuntime(),
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function runSmartVisionEndToEndSmoke({ taskType = 'asset_image_generation', releaseId = null } = {}) {
  const smokedAt = new Date().toISOString();
  const contextPack = await buildTaskContextPack(taskType);
  const pipelinePlan = await createIndustrialProductionPipelinePlan({ episodeId: 'ep001' });
  const pipelineRunSmoke = await runPipelineRunSmoke({ episodeId: 'ep001', releaseId });
  const taskPlan = await createWorkflowTaskPlan({ taskType, taskId: `sv-smoke-${slugifyTaskType(taskType)}-${Date.now()}` });
  const workflowDraft = await buildWorkflowDraft(taskPlan.taskType, taskPlan);
  const workflowPreflight = preflightWorkflowDraft(workflowDraft, { requireFile: false });
  const canvasExecution = workflowDraft.canvasExecution ?? {};
  const workflowMode = inferCanvasWorkflowMode(workflowDraft.taskType);
  const canvasNodeOutputHint = workflowDraft.canvas?.nodes?.flatMap((node) => [node.values?.lastOutputArtifactHint, node.values?.outputArtifactHint, node.data?.outputArtifactHint]).find(Boolean);
  const concreteMediaArtifact = (canvasExecution.outputArtifacts ?? []).find((artifact) => workflowMode.includes('video') ? isVideoArtifactPath(artifact) : isImageArtifactPath(artifact));
  const canvasOutputSmoke = await registerCanvasWorkflowOutput({
    dryRun: true,
    workflowId: workflowDraft.id,
    workflowPath: workflowDraft.path,
    workflowDraft,
    taskType: workflowDraft.taskType,
    nodeId: workflowDraft.canvas?.nodes?.find((node) => node.type === 'seedanceVideo' || node.type === 'img2imgAll' || node.type === 'txt2img')?.id ?? 'n2',
    nodeType: workflowDraft.canvas?.nodes?.find((node) => node.type === 'seedanceVideo' || node.type === 'img2imgAll' || node.type === 'txt2img')?.type ?? 'canvasNode',
    outputArtifactHint: concreteMediaArtifact ?? canvasNodeOutputHint ?? (workflowMode.includes('video') ? '03-视频/runtime-smoke-canvas-output.mp4' : '01-资产图与提示词/画布回写/runtime-smoke-canvas-output.png'),
    mediaType: workflowMode.includes('video') ? 'video' : 'image',
    saved: { filename: workflowMode.includes('video') ? 'runtime-smoke-canvas-output.mp4' : 'runtime-smoke-canvas-output.png' }
  });
  const taskQueueSmoke = runVirtualTaskQueueSmoke(taskPlan);
  const releaseSmoke = await runReleasePublishQueueSmoke({ releaseId });
  const diagnostics = await diagnoseWorkflowRuntime();
  const steps = [
    {
      id: 'production_pipeline',
      status: pipelinePlan.canonicalSequence.slice(0, 3).join('>') === 'asset_image_generation>storyboard_image_generation>video_generation' ? 'passed' : 'blocked',
      summary: pipelinePlan.canonicalSequence.join(' → ')
    },
    {
      id: 'pipeline_run',
      status: pipelineRunSmoke.status,
      summary: pipelineRunSmoke.steps.map((step) => `${step.id}:${step.status}`).join(' / ')
    },
    {
      id: 'context_pack',
      status: contextPack.referenceIssues.length === 0 ? 'passed' : 'warn',
      summary: `${contextPack.dataPackSummary.referenceCount} references, ${contextPack.referenceIssues.length} missing`
    },
    {
      id: 'task_plan',
      status: (taskPlan.subtasks ?? []).length > 0 ? 'passed' : 'blocked',
      summary: `${taskPlan.subtasks?.length ?? 0} subtasks, ${taskPlan.orchestration.dependencyCount} dependencies`
    },
    {
      id: 'canvas_workflow_adapter',
      status: canvasExecution.executor === 'infinite_canvas' && canvasExecution.editUrl && canvasExecution.runUrl && (canvasExecution.workflowMode === 'context_pack_workflow' || canvasExecution.promptCount > 0) ? 'passed' : 'blocked',
      summary: `${canvasExecution.workflowMode ?? 'unknown'} · prompts ${canvasExecution.promptCount ?? 0} · refs ${canvasExecution.referenceImageCount ?? 0}`
    },
    {
      id: 'workflow_preflight',
      status: workflowPreflight.ok ? 'passed' : 'blocked',
      summary: `${workflowPreflight.status} · errors ${workflowPreflight.errorCount} · warnings ${workflowPreflight.warnCount}`
    },
    {
      id: 'canvas_output_writeback',
      status: canvasOutputSmoke.artifactPath && canvasOutputSmoke.workflow?.id === workflowDraft.id ? 'passed' : 'blocked',
      summary: `${canvasOutputSmoke.artifactPath ?? 'missing artifact'} · workflow ${canvasOutputSmoke.wouldRegisterWorkflow ? 'auto-register' : 'registered'}`
    },
    {
      id: 'task_queue',
      status: taskQueueSmoke.status,
      summary: `${taskQueueSmoke.completed}/${taskQueueSmoke.requested} virtual tasks completed`
    },
    {
      id: 'release_publish',
      status: releaseSmoke.steps.at(-1)?.status === 'published' ? 'passed' : 'blocked',
      summary: releaseSmoke.steps.map((item) => `${item.id}:${item.status}`).join(' / ')
    },
    {
      id: 'diagnostics',
      status: diagnostics.status,
      summary: `${diagnostics.counts.issueCount} runtime issues`
    }
  ];

  return {
    smokedAt,
    dryRun: true,
    taskType,
    status: steps.some((item) => item.status === 'blocked') ? 'blocked' : steps.some((item) => item.status === 'warn' || item.status === 'degraded') ? 'degraded' : 'passed',
    steps,
    pipelinePlan: {
      pipelineId: pipelinePlan.pipelineId,
      canonicalSequence: pipelinePlan.canonicalSequence,
      stages: pipelinePlan.stages.map((stage) => ({ id: stage.id, taskType: stage.taskType, title: stage.title, workflowMode: stage.workflowMode, nextTaskType: stage.nextTaskType }))
    },
    pipelineRunSmoke: {
      status: pipelineRunSmoke.status,
      runId: pipelineRunSmoke.run.id,
      steps: pipelineRunSmoke.steps,
      canvasWorkflows: pipelineRunSmoke.canvasWorkflows
    },
    contextPackSummary: contextPack.dataPackSummary,
    taskPlan: {
      taskId: taskPlan.taskId,
      subtaskCount: taskPlan.subtasks?.length ?? 0,
      dependencyCount: taskPlan.orchestration.dependencyCount,
      blocked: taskPlan.orchestration.blocked
    },
    canvasWorkflow: {
      workflowPath: workflowDraft.path,
      workflowMode: canvasExecution.workflowMode ?? '',
      editUrl: canvasExecution.editUrl ?? '',
      runUrl: canvasExecution.runUrl ?? '',
      promptCount: canvasExecution.promptCount ?? 0,
      referenceImageCount: canvasExecution.referenceImageCount ?? 0,
      preflight: workflowPreflight,
      outputWriteback: {
        dryRun: canvasOutputSmoke.dryRun,
        artifactPath: canvasOutputSmoke.artifactPath,
        wouldRegisterWorkflow: canvasOutputSmoke.wouldRegisterWorkflow
      }
    },
    taskQueueSmoke,
    releaseSmoke: {
      release: releaseSmoke.release,
      steps: releaseSmoke.steps,
      canPublish: releaseSmoke.publishGate.canPublish,
      blockerCount: releaseSmoke.publishGate.blockers.length
    },
    diagnostics: {
      status: diagnostics.status,
      issueCount: diagnostics.counts.issueCount,
      nextActions: diagnostics.nextActions
    },
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

async function runWorkflowTaskQueueStressSmoke({ taskTypes = ['video_generation', 'edit', 'qa', 'release'], copies = 2 } = {}) {
  const smokedAt = new Date().toISOString();
  const normalizedTaskTypes = (Array.isArray(taskTypes) ? taskTypes : [taskTypes]).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
  const copyCount = Math.min(Math.max(Number(copies) || 1, 1), 10);
  const plans = [];

  for (const taskType of normalizedTaskTypes.length > 0 ? normalizedTaskTypes : ['video_generation']) {
    for (let index = 0; index < copyCount; index += 1) {
      const taskPlan = await createWorkflowTaskPlan({ taskType, taskId: `sv-stress-${slugifyTaskType(taskType)}-${index + 1}-${Date.now()}` });
      const taskQueueSmoke = runVirtualTaskQueueSmoke(taskPlan);
      plans.push({
        taskType,
        taskId: taskPlan.taskId,
        subtaskCount: taskPlan.subtasks?.length ?? 0,
        dependencyCount: taskPlan.orchestration.dependencyCount,
        blocked: taskPlan.orchestration.blocked,
        taskQueueSmoke
      });
    }
  }

  const blockedPlans = plans.filter((plan) => plan.blocked || plan.taskQueueSmoke.status === 'blocked');
  const totalSubtasks = plans.reduce((sum, plan) => sum + plan.subtaskCount, 0);
  const completedSubtasks = plans.reduce((sum, plan) => sum + (plan.taskQueueSmoke.completed ?? 0), 0);

  return {
    smokedAt,
    dryRun: true,
    status: blockedPlans.length > 0 ? 'blocked' : 'passed',
    requestedPlanCount: plans.length,
    requestedTaskTypes: normalizedTaskTypes,
    copies: copyCount,
    totalSubtasks,
    completedSubtasks,
    blockedPlanCount: blockedPlans.length,
    plans,
    runner: await getWorkflowRunnerStatus(),
    snapshot: await buildSnapshot()
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'cache-control': 'no-store'
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/api/smart-vision/health') {
      sendJson(res, 200, { ok: true, service: 'smart-vision-bridge', port: PORT });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/models') {
      const expectedType = String(url.searchParams.get('type') || '').trim().toUpperCase();
      const models = (await readCanvasModelConfigs())
        .filter((model) => !expectedType || model.type === expectedType)
        .map(publicModelConfig);
      sendJson(res, 200, { ok: true, items: models, models });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/llm/chat') {
      const body = await readRequestBody(req);
      const result = await callBridgeLlmChat(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (url.pathname === '/api/smart-vision/snapshot') {
      sendJson(res, 200, { ok: true, data: await buildSnapshot() });
      return;
    }

    if (url.pathname === '/api/smart-vision/canvas/status') {
      const modelSummary = await getModelSummary();
      sendJson(res, 200, { ok: true, data: { health: 'unknown', ...modelSummary } });
      return;
    }

    if (url.pathname === '/api/smart-vision/artifacts/read') {
      if (url.searchParams.get('raw') === '1') {
        const artifact = await readArtifact(url.searchParams.get('path'), { raw: true });
        const buffer = await readFile(artifact.absolutePath);
        res.writeHead(200, {
          'content-type': artifact.mimeType,
          'content-length': buffer.byteLength,
          'access-control-allow-origin': '*',
          'cache-control': 'no-store'
        });
        res.end(buffer);
        return;
      }

      const artifact = await readArtifact(url.searchParams.get('path'));
      sendJson(res, 200, { ok: true, data: artifact });
      return;
    }

    if (url.pathname === '/api/smart-vision/context-pack') {
      const registry = await readDataPackRegistry();
      const activeDataPack = getActiveDataPackFromRegistry(registry, url.searchParams.get('activeDataPackId') ?? url.searchParams.get('dataPackId') ?? '');
      const contextPack = await buildTaskContextPack(url.searchParams.get('taskType') ?? activeDataPack.defaultTaskType ?? 'storyboard', activeDataPack);
      sendJson(res, 200, { ok: true, data: contextPack });
      return;
    }

    if (url.pathname === '/api/smart-vision/data-packs') {
      const registry = await readDataPackRegistry();
      const activeDataPack = getActiveDataPackFromRegistry(registry);
      sendJson(res, 200, {
        ok: true,
        data: {
          ...registry,
          activeDataPack,
          packs: registry.packs.map((pack) => ({
            ...pack,
            roots: pack.roots.map((root) => ({ ...root, extensions: Array.isArray(root.extensions) ? root.extensions : Array.from(root.extensions ?? []) }))
          }))
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/data-packs/select') {
      const body = await readRequestBody(req);
      const registry = await readDataPackRegistry();
      const dataPackId = String(body.dataPackId || body.activeDataPackId || '').trim();
      const selected = registry.packs.find((pack) => pack.id === dataPackId && pack.status !== 'disabled');
      if (!selected) throw new Error(`Data pack not available: ${dataPackId}`);
      const updated = await writeDataPackRegistry({ ...registry, activeDataPackId: selected.id });
      sendJson(res, 200, { ok: true, data: { ...updated, activeDataPack: selected } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/data-packs/register') {
      const body = await readRequestBody(req);
      const incoming = normalizeDataPackSpec(body.dataPack || body);
      const registry = await readDataPackRegistry();
      const packs = registry.packs.filter((pack) => pack.id !== incoming.id).concat(incoming);
      const activeDataPackId = body.activate === true ? incoming.id : registry.activeDataPackId;
      const updated = await writeDataPackRegistry({ ...registry, activeDataPackId, packs });
      sendJson(res, 200, { ok: true, data: { ...updated, registeredDataPack: incoming, activeDataPack: getActiveDataPackFromRegistry(updated) } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/data-packs/sync') {
      const body = await readRequestBody(req);
      const authorization = String(req.headers.authorization || '');
      const token = body.token || (authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '');
      const updated = await syncDataPacksFromAdmin({
        adminBase: body.adminBase,
        token,
        activate: body.activate,
        dryRun: body.dryRun === true,
        activeDataPackId: body.activeDataPackId || body.dataPackId,
        timeoutMs: Number(body.timeoutMs || 12000)
      });
      sendJson(res, 200, { ok: true, data: updated });
      return;
    }

    if (url.pathname === '/api/smart-vision/data-pack/runtime') {
      const input = req.method === 'POST'
        ? await readRequestBody(req)
        : {
          taskType: url.searchParams.get('taskType') ?? 'creative_orchestration',
          activeDataPackId: url.searchParams.get('activeDataPackId') ?? url.searchParams.get('dataPackId') ?? ''
        };
      const runtime = await buildSmartCanvasRuntime(input);
      sendJson(res, 200, { ok: true, data: runtime });
      return;
    }

    if (url.pathname === '/api/smart-vision/workflow-draft') {
      const workflowDraft = await buildWorkflowDraft(url.searchParams.get('taskType') ?? 'storyboard');
      sendJson(res, 200, { ok: true, data: workflowDraft });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflow-draft/preflight') {
      const body = await readRequestBody(req);
      const result = await preflightWorkflowDraftRequest(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/plan') {
      const body = await readRequestBody(req);
      const taskPlan = await createWorkflowTaskPlan(body);
      sendJson(res, 200, { ok: true, data: taskPlan });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/pipeline/plan') {
      const body = await readRequestBody(req);
      const pipelinePlan = await createIndustrialProductionPipelinePlan(body);
      sendJson(res, 200, { ok: true, data: pipelinePlan });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/creative/start') {
      const body = await readRequestBody(req);
      const result = body.dryRun
        ? await startCreativeProduction(body)
        : await withStateOperationJournal({
          operation: 'creative_production_start',
          target: body.episodeId ?? 'ep001',
          metadata: {
            scriptLength: String(body.scriptText ?? body.script ?? '').length,
            importedFileCount: Array.isArray(body.importedFiles) ? body.importedFiles.length : 0,
            createPipelineRun: body.createPipelineRun !== false
          }
        }, () => startCreativeProduction(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/creative/import') {
      const body = await readRequestBody(req);
      const result = await importCreativeSources(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/pipeline/runs') {
      const result = await listPipelineRuns();
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/pipeline/runs/create') {
      const body = await readRequestBody(req);
      const result = body.dryRun
        ? await createPipelineRun(body)
        : await withStateOperationJournal({ operation: 'pipeline_run_create', target: body.episodeId ?? 'ep001', metadata: { prepareFirstStage: body.prepareFirstStage !== false } }, () => createPipelineRun(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/pipeline/runs/advance') {
      const body = await readRequestBody(req);
      const result = body.dryRun
        ? await advancePipelineRun(body)
        : await withStateOperationJournal({ operation: 'pipeline_run_advance', target: body.runId ?? body.stageId ?? 'active-pipeline-run', metadata: { stageId: body.stageId } }, () => advancePipelineRun(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/pipeline/runs/repair') {
      const body = await readRequestBody(req);
      const result = body.dryRun
        ? await repairPipelineRun(body)
        : await withStateOperationJournal({ operation: 'pipeline_run_repair', target: body.runId ?? body.stageId ?? 'pipeline-runs', metadata: { stageId: body.stageId, rebuildMissingWorkflow: body.rebuildMissingWorkflow !== false } }, () => repairPipelineRun(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/pipeline/runs/smoke') {
      const body = await readRequestBody(req);
      const result = await runPipelineRunSmoke(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/persist') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'task_plan_persist', target: body.taskPlan?.taskId ?? body.taskId ?? body.taskType ?? 'task_plan', metadata: { taskType: body.taskType ?? body.taskPlan?.taskType } }, () => persistWorkflowTaskPlan(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/compile') {
      const body = await readRequestBody(req);
      const result = await compileTaskToWorkflowDraft(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflow-draft/save') {
      const body = await readRequestBody(req);
      const result = await saveWorkflowDraft(body.taskType ?? body.workflowDraft?.taskType ?? 'storyboard', body.metadata ?? {}, body.workflowDraft ?? null);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/reviews/status') {
      const body = await readRequestBody(req);
      const review = await updateReviewStatus(body.reviewId, body.status);
      sendJson(res, 200, { ok: true, data: { review, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/tasks/status') {
      const body = await readRequestBody(req);
      const task = await updateTaskStatus(body.taskId, body.status);
      sendJson(res, 200, { ok: true, data: { task, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/status') {
      const body = await readRequestBody(req);
      const workflow = await updateWorkflowStatus(body.workflowId, body.status);
      sendJson(res, 200, { ok: true, data: { workflow, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/outputs') {
      const body = await readRequestBody(req);
      const workflow = await addWorkflowOutput(body.workflowId, body.artifactPath, { resetBlocked: body.resetBlocked === true || body.resetBlocked === 'true' });
      sendJson(res, 200, { ok: true, data: { workflow, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/workflows/canvas-run-sessions') {
      const ledger = await readCanvasRunLedger();
      sendJson(res, 200, { ok: true, data: { ledger, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/canvas-run-sessions/start') {
      const body = await readRequestBody(req);
      const result = body.dryRun === true || body.dryRun === 'true'
        ? await createCanvasRunSession(body)
        : await withStateOperationJournal({ operation: 'canvas_run_session_start', target: body.workflowId ?? body.workflowPath ?? 'canvas-run-session', metadata: { pipelineRunId: body.pipelineRunId, stageId: body.stageId } }, () => createCanvasRunSession(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/canvas-run-sessions/status') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'canvas_run_session_status', target: body.sessionId ?? 'canvas-run-session', metadata: { status: body.status } }, () => updateCanvasRunSession(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/canvas-output') {
      const body = await readRequestBody(req);
      const result = body.dryRun === true || body.dryRun === 'true'
        ? await registerCanvasWorkflowOutput(body)
        : await withStateOperationJournal({ operation: 'canvas_output_register', target: body.workflowId ?? body.workflowPath ?? body.outputArtifactHint ?? 'canvas-output', metadata: { nodeId: body.nodeId, nodeType: body.nodeType } }, () => registerCanvasWorkflowOutput(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/canvas-output/retry') {
      const body = await readRequestBody(req);
      const result = body.dryRun === true || body.dryRun === 'true'
        ? await retryCanvasWorkflowOutput(body)
        : await withStateOperationJournal({ operation: 'canvas_output_retry', target: body.idempotencyKey ?? body.artifactPath ?? body.workflowId ?? 'canvas-output', metadata: { nodeId: body.nodeId, nodeType: body.nodeType } }, () => retryCanvasWorkflowOutput(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/self-test') {
      const body = await readRequestBody(req);
      const result = await runWorkflowChainSelfTest(body.taskType ?? 'storyboard');
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/workflows/chains') {
      const result = await getWorkflowChainRuntime(url.searchParams.get('workflowId'));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/workflows/runtime/diagnostics') {
      const result = await diagnoseWorkflowRuntime();
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/runtime/repair') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'runtime_repair', target: 'workflow_runtime', dryRun: body.dryRun === true, metadata: { dryRun: body.dryRun === true } }, () => repairWorkflowRuntimeState(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/workflows/runner/status') {
      const result = await getWorkflowRunnerStatus();
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/workflows/runner/runs') {
      const result = await getWorkflowRunnerRun(url.searchParams.get('runId'));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/runner/retry') {
      const body = await readRequestBody(req);
      const result = await retryWorkflowRunnerFailures(body.runId, body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/runner/compact') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'runner_compact', target: 'workflow-runner-ledger', dryRun: body.dryRun === true, metadata: { dryRun: body.dryRun === true } }, () => compactWorkflowRunnerLedger(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/runner/archive/restore') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'runner_archive_restore', target: body.bucket ?? 'archive', metadata: { restoreAll: body.restoreAll === true, itemId: body.itemId ?? null } }, () => restoreWorkflowRunnerArchiveItem(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/chains/action') {
      const body = await readRequestBody(req);
      const result = await executeWorkflowChainAction(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/chains/replay') {
      const body = await readRequestBody(req);
      const result = await replayWorkflowChain(body.workflowId, body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/queue/run') {
      const body = await readRequestBody(req);
      const result = await runWorkflowQueue(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/queue/run') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'task_queue_run', target: body.taskQueueId ?? body.taskPlanId ?? 'task_queue', metadata: { limit: body.limit, strictInputs: body.strictInputs === true } }, () => runWorkflowTaskQueue(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/queue/requeue') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'task_queue_requeue', target: body.taskQueueId ?? body.progressItemId ?? body.taskPlanId ?? 'task_queue', metadata: { resetDependents: body.resetDependents === true } }, () => requeueWorkflowTaskQueueItem(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/tasks/queue/stress') {
      const body = await readRequestBody(req);
      const result = await runWorkflowTaskQueueStressSmoke(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/publish-queue/run') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'release_publish_queue_run', target: body.releaseId ?? 'release_publish_queue', dryRun: body.dryRun === true, metadata: { limit: body.limit, dryRun: body.dryRun === true } }, () => runReleasePublishQueue(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/publish-queue/requeue') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'release_publish_queue_requeue', target: body.releaseId ?? 'release_publish_queue', metadata: { reason: body.reason ?? null } }, () => requeueReleasePublishFailures(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/publish-queue/smoke') {
      const body = await readRequestBody(req);
      const result = await runReleasePublishQueueSmoke(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/runtime/smoke') {
      const body = await readRequestBody(req);
      const result = await runSmartVisionEndToEndSmoke(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/runtime/anomaly-smoke') {
      const body = await readRequestBody(req);
      const result = await runSmartVisionAnomalySmoke(body);
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/smart-vision/releases') {
      const registry = await readReleaseRegistry();
      const reviewLedger = await readJson(path.join(smartVisionRoot, 'review-ledger.json'), { reviews: [] });
      sendJson(res, 200, { ok: true, data: { registry: await enrichReleaseRegistry(registry, reviewLedger.reviews ?? []), snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/create') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'release_create', target: body.releaseId ?? body.episodeId ?? 'release', metadata: { episodeId: body.episodeId ?? null } }, () => createReleasePackage(body));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/status') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'release_status_update', target: body.releaseId ?? 'release', metadata: { status: body.status } }, () => updateReleasePackageStatus(body.releaseId, body.status, body.note));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/releases/repair') {
      const body = await readRequestBody(req);
      const result = await withStateOperationJournal({ operation: 'release_repair', target: body.releaseId ?? 'release' }, () => repairReleasePackage(body.releaseId));
      sendJson(res, 200, { ok: true, data: result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/archive') {
      const body = await readRequestBody(req);
      const workflow = await archiveWorkflow(body.workflowId);
      sendJson(res, 200, { ok: true, data: { workflow, snapshot: await buildSnapshot() } });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/smart-vision/workflows/restore') {
      const body = await readRequestBody(req);
      const workflow = await restoreWorkflow(body.workflowId);
      sendJson(res, 200, { ok: true, data: { workflow, snapshot: await buildSnapshot() } });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Smart Vision bridge listening on http://127.0.0.1:${PORT}`);
});
