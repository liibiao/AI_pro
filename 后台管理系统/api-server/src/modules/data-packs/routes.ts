import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';

const router = Router();

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registryFile = process.env.DATA_PACK_REGISTRY_FILE
  ? path.resolve(process.env.DATA_PACK_REGISTRY_FILE)
  : path.resolve(apiRoot, '..', 'data', 'data-pack-registry.json');

const rootSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  root: z.string().min(1),
  sourceKind: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(10000).optional(),
  parseLimit: z.number().int().nonnegative().max(10000).optional(),
  maxFileBytes: z.number().int().positive().optional(),
}).passthrough();

const dataPackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.string().default('creative_automation'),
  status: z.enum(['active', 'disabled', 'draft']).default('active'),
  source: z.string().default('admin_registry'),
  sourceVersion: z.string().optional(),
  description: z.string().optional(),
  rootBasePath: z.string().optional(),
  defaultTaskType: z.string().default('creative_orchestration'),
  roots: z.array(rootSchema).min(1),
  tags: z.array(z.string()).optional(),
  capabilities: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

const registerSchema = z.object({
  dataPack: dataPackSchema.optional(),
  activate: z.boolean().optional(),
}).passthrough();

type DataPack = z.infer<typeof dataPackSchema>;
type DataPackRoot = z.infer<typeof rootSchema>;

type DataPackRegistry = {
  version: string;
  activeDataPackId: string;
  packs: DataPack[];
  updatedAt: string;
};

router.get('/data-packs', requireAuth, asyncHandler(async (req, res) => {
  const registry = await readRegistry();
  const isAdmin = adminRoles.includes(req.user!.role);
  const packs = isAdmin ? registry.packs : registry.packs.filter(pack => pack.status !== 'disabled');
  ok(res, {
    activeDataPackId: registry.activeDataPackId,
    activeDataPack: packs.find(pack => pack.id === registry.activeDataPackId) || packs[0] || null,
    packs,
    items: packs,
    updatedAt: registry.updatedAt,
  });
}));

router.get('/data-packs/active', requireAuth, asyncHandler(async (_req, res) => {
  const registry = await readRegistry();
  const pack = registry.packs.find(item => item.id === registry.activeDataPackId && item.status !== 'disabled')
    || registry.packs.find(item => item.status !== 'disabled')
    || null;
  ok(res, { dataPack: pack, activeDataPack: pack, activeDataPackId: pack?.id || '' });
}));

router.get('/data-packs/:id', requireAuth, asyncHandler(async (req, res) => {
  const registry = await readRegistry();
  const id = routeParam(req.params.id);
  const pack = registry.packs.find(item => item.id === id);
  if (!pack || pack.status === 'disabled') fail(404, '创作库数据包不存在或已停用', 'DATA_PACK_NOT_FOUND');
  ok(res, { dataPack: pack });
}));

router.post('/admin/data-packs', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const incoming = normalizeDataPack(body.dataPack || dataPackSchema.parse(req.body));
  const registry = await readRegistry();
  const packs = registry.packs.filter(pack => pack.id !== incoming.id).concat(incoming);
  const nextActive = body.activate === true ? incoming.id : registry.activeDataPackId || incoming.id;
  const updated = await writeRegistry({ ...registry, packs, activeDataPackId: nextActive });
  ok(res, {
    dataPack: incoming,
    registeredDataPack: incoming,
    activeDataPackId: updated.activeDataPackId,
    activeDataPack: updated.packs.find(pack => pack.id === updated.activeDataPackId) || null,
    packs: updated.packs,
    updatedAt: updated.updatedAt,
  });
}));

router.patch('/admin/data-packs/:id', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const registry = await readRegistry();
  const existing = registry.packs.find(pack => pack.id === id);
  if (!existing) fail(404, '创作库数据包不存在', 'DATA_PACK_NOT_FOUND');
  const patch = dataPackSchema.partial().parse(req.body);
  const updatedPack = normalizeDataPack({ ...existing, ...patch, id: existing.id });
  const updated = await writeRegistry({
    ...registry,
    packs: registry.packs.map(pack => pack.id === id ? updatedPack : pack),
  });
  ok(res, { dataPack: updatedPack, activeDataPackId: updated.activeDataPackId, updatedAt: updated.updatedAt });
}));

router.post('/admin/data-packs/:id/select', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const id = routeParam(req.params.id);
  const registry = await readRegistry();
  const selected = registry.packs.find(pack => pack.id === id && pack.status !== 'disabled');
  if (!selected) fail(404, '创作库数据包不存在或已停用', 'DATA_PACK_NOT_FOUND');
  const updated = await writeRegistry({ ...registry, activeDataPackId: selected.id });
  ok(res, { activeDataPackId: selected.id, activeDataPack: selected, updatedAt: updated.updatedAt });
}));

async function readRegistry(): Promise<DataPackRegistry> {
  try {
    const raw = JSON.parse(await fs.readFile(registryFile, 'utf8'));
    return normalizeRegistry(raw);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
    const registry = normalizeRegistry({});
    await writeRegistry(registry);
    return registry;
  }
}

async function writeRegistry(registry: DataPackRegistry): Promise<DataPackRegistry> {
  const normalized = normalizeRegistry({ ...registry, updatedAt: new Date().toISOString() });
  await fs.mkdir(path.dirname(registryFile), { recursive: true });
  const tmp = `${registryFile}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, registryFile);
  return normalized;
}

function normalizeRegistry(input: Partial<DataPackRegistry>): DataPackRegistry {
  const packs = (Array.isArray(input.packs) ? input.packs : [])
    .map(pack => normalizeDataPack(pack))
    .filter(pack => pack.id && pack.roots.length);
  const activeDataPackId = packs.some(pack => pack.id === input.activeDataPackId && pack.status !== 'disabled')
    ? String(input.activeDataPackId)
    : packs.find(pack => pack.status !== 'disabled')?.id || '';
  return {
    version: String(input.version || '0.1.0'),
    activeDataPackId,
    packs,
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

function normalizeDataPack(input: unknown): DataPack {
  const parsed = dataPackSchema.parse(input);
  const roots = parsed.roots.map(root => normalizeRoot(root)).filter(root => root.root);
  return {
    ...parsed,
    id: slug(parsed.id),
    title: parsed.title.trim(),
    type: parsed.type || 'creative_automation',
    status: parsed.status || 'active',
    source: parsed.source || 'admin_registry',
    defaultTaskType: parsed.defaultTaskType || 'creative_orchestration',
    roots,
    tags: uniqueStrings(parsed.tags || []),
    capabilities: { ...defaultCapabilities(parsed.type), ...(parsed.capabilities || {}) },
    metadata: { ...defaultMetadata(), ...(parsed.metadata || {}) },
  };
}

function normalizeRoot(input: DataPackRoot): DataPackRoot {
  const root = input.root.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return {
    ...input,
    id: slug(input.id || root.split('/').filter(Boolean).join('-') || 'root'),
    title: input.title || root,
    root,
    sourceKind: input.sourceKind || input.id || root,
    extensions: uniqueStrings(input.extensions || ['.md', '.json', '.txt', '.yaml', '.yml']),
    limit: input.limit ?? 500,
    parseLimit: input.parseLimit ?? input.limit ?? 120,
  };
}

function slug(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'data-pack';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function defaultMetadata() {
  return {
    deliverableMode: 'customer_facing',
    workflowJsonVisibility: 'internal',
    packContractVersion: '0.2.0',
  };
}

function defaultCapabilities(type = 'creative_automation') {
  const normalized = String(type || '').toLowerCase();
  const common = {
    dynamicAgentPipeline: true,
    smartCanvas: true,
    customerDeliverables: true,
    internalWorkflowJson: true,
    referenceImages: true,
    workflowJsonVisibility: 'internal',
  };
  if (/ad|advert/.test(normalized)) {
    return {
      ...common,
      outputKinds: ['creative_brief', 'audience_strategy', 'ad_script', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
      requiredOrder: ['creative_brief', 'strategy', 'script', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release'],
    };
  }
  if (/commerce|product|ecommerce/.test(normalized)) {
    return {
      ...common,
      outputKinds: ['product_brief', 'selling_points', 'asset_cards', 'product_images', 'prompt', 'qa_report', 'release_package'],
      requiredOrder: ['product_brief', 'selling_points', 'asset_cards', 'product_images', 'qa', 'release'],
    };
  }
  if (/film|movie/.test(normalized)) {
    return {
      ...common,
      outputKinds: ['screenplay', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
      requiredOrder: ['screenplay', 'director_brief', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release'],
    };
  }
  return {
    ...common,
    outputKinds: ['creative_source_intake', 'adapted_script', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'prompt', 'video', 'qa_report', 'release_package'],
    requiredOrder: ['creative_source_intake', 'style_bible', 'script', 'director_brief', 'shot_table', 'asset_cards', 'asset_images', 'storyboard', 'video', 'qa', 'release'],
    requiresAssetGraphBeforeStoryboard: true,
    requiresStoryboardBeforeVideo: true,
  };
}

export default router;
