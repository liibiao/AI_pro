import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import type { UserRole } from '@prisma/client';
import { z } from 'zod';
import { fail, ok, routeParam } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';

const router = Router();

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registryFile = process.env.CANVAS_NODE_CONFIG_FILE
  ? path.resolve(process.env.CANVAS_NODE_CONFIG_FILE)
  : path.resolve(apiRoot, '..', 'data', 'canvas-node-config.json');

const superAdminRoles: UserRole[] = ['SUPER_ADMIN'];

const nodePatchSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
});

type CanvasNodeItem = {
  type: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  enabled: boolean;
  hidden?: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

type CanvasNodeRegistry = {
  version: string;
  nodes: CanvasNodeItem[];
  updatedAt: string;
};

const defaultNodes: CanvasNodeItem[] = [
  { type: 'stylePreset', name: '风格预设', icon: 'STY', category: 'input', description: '词库速查 + 一键预设配方', enabled: true },
  { type: 'textPrompt', name: '文本提示词', icon: 'TXT', category: 'input', description: '文本 / 图片 / 视频 / 文件 → 标准提示词', enabled: true },
  { type: 'assetDesign', name: '资产设计', icon: 'AST', category: 'generate', description: '文本 / 图片 / 资料 → 结构化资产设计稿', enabled: true },
  { type: 'shotStoryboard', name: '生成分镜节点', icon: 'SHT', category: 'generate', description: '剧本 / 提示词 / 参考素材 → 生成分镜表与分镜图预览', enabled: true },
  { type: 'directorStage', name: '3D导演台', icon: '3D', category: 'edit', description: '3D 场景调度：角色 / 道具 / 机位 → 生图与生视频提示词', enabled: true },
  { type: 'storyboardImage', name: '编辑分镜图节点', icon: 'SGR', category: 'edit', description: '分镜任务 / 整图 → 切割、重排、局部重绘与合成', enabled: true },
  { type: 'singleImage', name: '图片节点', icon: 'IMG', category: 'input', description: '上传 / 预览 / 输出图片，兼容生成结果查看', enabled: true },
  { type: 'singleVideo', name: '视频节点', icon: 'VID', category: 'input', description: '上传 / 预览 / 输出视频', enabled: true },
  { type: 'singleAudio', name: '音频节点', icon: 'AUD', category: 'input', description: '上传 / 预览 / 输出音频声纹', enabled: true },
  { type: 'videoEditor', name: '视频剪辑器', icon: 'CUT', category: 'edit', description: '剪映风格视频剪辑：分割 / 裁剪 / 拼接 / 音频 / 字幕 / 导出', enabled: true },
  { type: 'txt2img', name: '文生图', icon: 'T2I', category: 'generate', description: '提示词 + 模型 → Image', enabled: true },
  { type: 'storyboard', name: '创作故事板', icon: 'SB', category: 'generate', description: '故事内容 + 参考图 → 专业分镜故事板', enabled: true },
  { type: 'imageToPanorama', name: '720全景图', icon: '720', category: 'generate', description: '普通图片 AI 扩展生成 720° 全景图，并在同一节点交互查看', enabled: true },
  { type: 'panoramaViewer', name: '交互式 720° 全景查看', icon: 'PANO', category: 'output', description: '双击节点沉浸查看 720° 全景图，支持 720° 连续拖拽', enabled: true, hidden: true },
  { type: 'img2imgAll', name: '图生图', icon: 'I2I', category: 'generate', description: '参考图 + 提示词 + 模型 → Image', enabled: true },
  { type: 'seedanceVideo', name: 'Seedance 视频生成', icon: 'VID', category: 'generate', description: 'Seedance 2.0 图 / 文 → Video', enabled: true },
];

router.get('/canvas/nodes', requireAuth, asyncHandler(async (_req, res) => {
  const registry = await readRegistry();
  const nodes = registry.nodes.map(publicNode);
  ok(res, {
    nodes,
    items: nodes,
    disabledNodeTypes: nodes.filter(node => !node.enabled).map(node => node.type),
    updatedAt: registry.updatedAt,
  });
}));

router.get('/admin/canvas-nodes', requireAuth, requireRole(superAdminRoles), asyncHandler(async (_req, res) => {
  const registry = await readRegistry();
  ok(res, {
    nodes: registry.nodes,
    items: registry.nodes,
    disabledNodeTypes: registry.nodes.filter(node => !node.enabled).map(node => node.type),
    updatedAt: registry.updatedAt,
  });
}));

router.patch('/admin/canvas-nodes/:type', requireAuth, requireRole(superAdminRoles), asyncHandler(async (req, res) => {
  const type = normalizeType(routeParam(req.params.type));
  const body = nodePatchSchema.parse(req.body);
  const registry = await readRegistry();
  if (!registry.nodes.some(node => node.type === type)) fail(404, '画布节点不存在', 'CANVAS_NODE_NOT_FOUND');
  const now = new Date().toISOString();
  const nodes = registry.nodes.map(node => node.type === type
    ? { ...node, enabled: body.enabled, updatedAt: now, updatedBy: req.user!.id }
    : node);
  const updated = await writeRegistry({ ...registry, nodes, updatedAt: now });
  const node = updated.nodes.find(item => item.type === type);
  ok(res, {
    node,
    nodes: updated.nodes,
    disabledNodeTypes: updated.nodes.filter(item => !item.enabled).map(item => item.type),
    updatedAt: updated.updatedAt,
  });
}));

async function readRegistry(): Promise<CanvasNodeRegistry> {
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

async function writeRegistry(registry: CanvasNodeRegistry): Promise<CanvasNodeRegistry> {
  const normalized = normalizeRegistry({ ...registry, updatedAt: registry.updatedAt || new Date().toISOString() });
  await fs.mkdir(path.dirname(registryFile), { recursive: true });
  const tmp = `${registryFile}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, registryFile);
  return normalized;
}

function normalizeRegistry(input: Partial<CanvasNodeRegistry>): CanvasNodeRegistry {
  const incoming = new Map((Array.isArray(input.nodes) ? input.nodes : [])
    .map(node => normalizeNode(node))
    .filter((node): node is CanvasNodeItem => Boolean(node?.type))
    .map(node => [node.type, node]));
  const nodes: CanvasNodeItem[] = defaultNodes.map((defaultNode): CanvasNodeItem => {
    const incomingNode = incoming.get(defaultNode.type);
    return {
      ...defaultNode,
      ...(incomingNode || {}),
      type: defaultNode.type,
      name: incomingNode?.name || defaultNode.name,
      icon: incomingNode?.icon || defaultNode.icon,
      category: incomingNode?.category || defaultNode.category,
      description: incomingNode?.description || defaultNode.description,
      hidden: defaultNode.hidden === true || incomingNode?.hidden === true || undefined,
    };
  });
  incoming.forEach((node, type) => {
    if (!nodes.some(item => item.type === type)) nodes.push(node);
  });
  return {
    version: String(input.version || '0.1.0'),
    nodes,
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}

function normalizeNode(input: unknown): CanvasNodeItem | null {
  if (!input || typeof input !== 'object') return null;
  const node = input as Record<string, unknown>;
  const type = normalizeType(node.type);
  if (!type) return null;
  return {
    type,
    name: String(node.name || type),
    icon: String(node.icon || ''),
    category: String(node.category || 'custom'),
    description: String(node.description || ''),
    enabled: node.enabled !== false,
    hidden: node.hidden === true || undefined,
    updatedAt: typeof node.updatedAt === 'string' ? node.updatedAt : undefined,
    updatedBy: typeof node.updatedBy === 'string' ? node.updatedBy : undefined,
  };
}

function normalizeType(value: unknown): string {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
}

function publicNode(node: CanvasNodeItem) {
  return {
    type: node.type,
    name: node.name,
    category: node.category,
    enabled: node.enabled,
    hidden: node.hidden === true,
  };
}

export default router;
