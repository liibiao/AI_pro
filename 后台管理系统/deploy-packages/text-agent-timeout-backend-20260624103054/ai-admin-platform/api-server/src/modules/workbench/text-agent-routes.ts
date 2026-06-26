import { Buffer } from 'node:buffer';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { callUpstreamJson, extractChatText } from '../../upstream.js';
import { getGenerationRuntimeSettings } from '../system-settings/service.js';
import { resolveAgentPack } from './agent-pack-service.js';

const router = Router();
const positiveIntOption = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : value;
}, z.number().int().positive().optional());
const temperatureOption = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}, z.number().min(0).max(2).optional());

const textAgentSchema = z.object({
  mode: z.enum(['default', 'script', 'reverse', 'parse', 'optimize']).default('default'),
  modelKey: z.string().optional(),
  agentPackId: z.string().default('manju-creation-library'),
  outputType: z.enum(['text', 'script', 'prompt', 'storyboard']).default('text'),
  inputText: z.string().default(''),
  files: z.array(z.unknown()).default([]),
  images: z.array(z.unknown()).default([]),
  videos: z.array(z.unknown()).default([]),
  urls: z.array(z.unknown()).default([]),
  taskInstruction: z.string().default(''),
  outputContract: z.string().default(''),
  timeoutMs: positiveIntOption,
  upstreamTimeoutMs: positiveIntOption,
  requestTimeoutMs: positiveIntOption,
  queryTimeoutMs: positiveIntOption,
  maxTokens: positiveIntOption,
  maxOutputTokens: positiveIntOption,
  temperature: temperatureOption,
  preferStream: z.boolean().optional(),
  stream: z.boolean().optional(),
  extra: z.record(z.unknown()).default({}),
});
type TextAgentBody = z.infer<typeof textAgentSchema>;

router.post('/workbench/text-agent/run', requireAuth, asyncHandler(async (req, res) => {
  const body = normalizeTextAgentMediaUrls(textAgentSchema.parse(req.body), req);
  const inputText = body.inputText.trim();
  if (body.mode === 'default') {
    ok(res, { text: inputText, prompt: inputText, outputType: body.outputType, stageLabel: '默认模式：已原文透传' });
    return;
  }
  const agentPack = await resolveAgentPack(body.agentPackId);
  const prompt = buildTextAgentPrompt(body, agentPack);
  const text = await runLlm(body.modelKey, prompt, body, req);
  ok(res, { text, prompt: text, outputType: body.outputType, agentPack, stageLabel: '文本提示词节点执行完成' });
}));

function buildTextAgentPrompt(body: TextAgentBody, agentPack: Awaited<ReturnType<typeof resolveAgentPack>>) {
  const modeLabel: Record<string, string> = {
    script: '剧本生成',
    reverse: '提示词反推',
    parse: '文件解析',
    optimize: '提示词AI优化',
    default: '默认',
  };
  const taskInstruction = String(body.taskInstruction || '').trim();
  const outputContract = String(body.outputContract || '').trim();
  const fileList = formatTextAgentFiles(body.files);
  const imageList = formatTextAgentMedia(body.images, '图片');
  const videoList = formatTextAgentMedia(body.videos, '视频');
  const urlList = formatTextAgentUrls(body.urls);
  const creativeGuard = [
    '硬性约束：必须严格围绕“用户原始创意/输入内容”展开，不得改换题材、人物、世界观、场景、核心冲突或用户指定风格。',
    '硬性约束：如果需要补充细节，只能在原始创意范围内补全；不要生成与输入无关的通用示例、模板占位或另一个故事。',
    '硬性约束：输出必须是可直接交给下游节点使用的最终结果，不要解释你如何工作。',
  ].join('\n');
  return [
    `你是 ${agentPack.label}。`,
    `任务模式：${modeLabel[body.mode] || body.mode}`,
    `输出类型：${body.outputType}`,
    `Agent 说明：${agentPack.description}`,
    taskInstruction ? `前端任务说明：\n${taskInstruction}` : '',
    outputContract ? `输出/角色约束：\n${outputContract}` : '',
    creativeGuard,
    body.mode === 'script' ? '剧本要求：保留用户创意中的主角、目标、冲突、场景和情绪基调；按漫剧/短剧可执行方式组织，包含画面感、动作、对白或分镜化段落。' : '',
    body.mode === 'reverse' ? '反推要求：如果有图片输入，必须基于图片可见内容反推；输出先给可直接用于下游生图节点的【正向提示词】，再给【负面提示词】。' : '',
    `导入文件：\n${fileList}`,
    `导入图片：\n${imageList}`,
    `导入视频：\n${videoList}`,
    `URL/网页内容：\n${urlList}`,
    `用户原始创意/输入内容：\n${body.inputText || '无'}`,
  ].filter(Boolean).join('\n\n');
}

async function runLlm(modelKey = '', prompt: string, body: TextAgentBody, req: Request) {
  if (!modelKey) fail(400, '请选择 LLM 模型', 'LLM_MODEL_REQUIRED');
  const model = await prisma.aiModel.findFirst({
    where: {
      type: 'LLM',
      status: 'ACTIVE',
      OR: [
        { id: modelKey },
        { modelKey },
        { name: modelKey },
        { displayName: modelKey },
      ],
    },
    include: { provider: true },
  });
  if (!model) fail(400, 'LLM 模型不可用或渠道未启用', 'LLM_MODEL_UNAVAILABLE');
  const protocol = isRecord(model.protocol) ? model.protocol : {};
  const endpointPath = model.endpointPath || String(protocol.endpointPath || '') || model.provider.endpointPath || '/chat/completions';
  const runtime = await getGenerationRuntimeSettings();
  const timeoutMs = resolveTextAgentTimeoutMs(body, req, model.provider.timeoutMs, runtime.upstreamTimeoutMs);
  const payload = buildTextAgentLlmPayload(model.name, endpointPath, prompt, body);
  const upstream = await callUpstreamJson(model.provider, endpointPath, payload, timeoutMs, { maxAttempts: 1 }) as any;
  const text = extractTextAgentLlmText(upstream);
  return String(text || '').trim();
}

function buildTextAgentLlmPayload(modelName: string, endpointPath: string, prompt: string, body: TextAgentBody) {
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7;
  const maxOutputTokens = resolveTextAgentMaxOutputTokens(body);
  const system = String(body.outputContract || '').trim() || '你是专业的文本、剧本、提示词生产 Agent。';
  if (isResponsesEndpoint(endpointPath)) {
    return compactRequestJson({
      model: modelName,
      instructions: system,
      input: buildResponsesInput(prompt, body),
      temperature,
      max_output_tokens: maxOutputTokens,
    });
  }
  return compactRequestJson({
    model: modelName,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: buildUserMessageContent(prompt, body) },
    ],
    temperature,
    max_tokens: maxOutputTokens,
  });
}

function buildUserMessageContent(prompt: string, body: TextAgentBody) {
  const images = (body?.images || []).map((item: any) => extractMediaUrl(item)).filter(Boolean).slice(0, 5);
  if (!images.length) return prompt;
  return [
    { type: 'text', text: prompt },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

function buildResponsesInput(prompt: string, body: TextAgentBody) {
  const images = (body?.images || []).map((item: any) => extractMediaUrl(item)).filter(Boolean).slice(0, 5);
  if (!images.length) return prompt;
  return [{
    role: 'user',
    content: [
      { type: 'input_text', text: prompt },
      ...images.map((url) => ({ type: 'input_image', image_url: url })),
    ],
  }];
}

function formatTextAgentFiles(files: unknown[]) {
  return files.map((item: any, index) => {
    const content = extractInlineFileText(item);
    return [`${index + 1}. ${item?.name || '未命名文件'} ${item?.type || ''}`, content ? `内容摘录：\n${content}` : '内容摘录：暂不支持该文件类型直接解析'].join('\n');
  }).join('\n\n') || '无';
}

function formatTextAgentMedia(items: unknown[], label: string) {
  return items.map((item: any, index) => {
    const url = extractMediaUrl(item);
    const title = item?.label || item?.name || item?.summary || `${label}参考`;
    const summary = item?.summary || item?.content || item?.description || '';
    return [`${index + 1}. ${title}`, url ? `${label}地址：${url}` : `${label}地址：未提供`, summary ? `说明：${summary}` : ''].filter(Boolean).join('\n');
  }).join('\n\n') || '无';
}

function formatTextAgentUrls(items: unknown[]) {
  return items.map((item: any, index) => {
    if (typeof item === 'string') return `${index + 1}. ${item}`;
    const title = item?.title || item?.finalUrl || item?.url || `URL ${index + 1}`;
    return [
      `${index + 1}. ${title}`,
      item?.finalUrl || item?.url ? `来源：${item.finalUrl || item.url}` : '',
      item?.description ? `页面摘要：${item.description}` : '',
      item?.summary ? `核心内容：${item.summary}` : '',
      item?.excerpt || item?.text ? `正文摘录：\n${String(item.excerpt || item.text || '').slice(0, 5000)}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n') || '无';
}

function extractMediaUrl(item: any) {
  return String(
    item?.imageUrl ||
    item?.remoteUrl ||
    item?.objectStorageUrl ||
    item?.saved?.remoteUrl ||
    item?.saved?.url ||
    item?.saved?.objectStorageUrl ||
    item?.url ||
    item?.videoUrl ||
    item?.poster ||
    item?.dataUrl ||
    item?.previewUrl ||
    '',
  ).trim();
}

function normalizeTextAgentMediaUrls(body: TextAgentBody, req: any) {
  const origin = requestOrigin(req);
  return {
    ...body,
    images: body.images.map((item: any) => normalizeMediaItemUrl(item, origin)),
    videos: body.videos.map((item: any) => normalizeMediaItemUrl(item, origin)),
  };
}

function requestOrigin(req: any) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  return host ? `${proto || 'http'}://${host}` : '';
}

function normalizeMediaItemUrl(item: any, origin: string) {
  if (!isRecord(item)) return item;
  const next = { ...item };
  ['url', 'imageUrl', 'dataUrl', 'remoteUrl', 'localUrl', 'videoUrl', 'poster'].forEach((key) => {
    if (typeof next[key] === 'string') next[key] = absolutizeMediaUrl(next[key], origin);
  });
  return next;
}

function absolutizeMediaUrl(value: string, origin: string) {
  const url = String(value || '').trim();
  if (!url || /^(?:https?:|data:|file:|blob:)/i.test(url) || !origin) return url;
  try {
    return new URL(url, origin).toString();
  } catch {
    return url;
  }
}

function extractInlineFileText(file: any) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (!/\.(txt|md|json|csv)$/i.test(name) && !/(text|json|csv|markdown)/i.test(type)) return '';
  const dataUrl = String(file?.dataUrl || '');
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  if (index < 0) return '';
  try {
    return Buffer.from(dataUrl.slice(index + marker.length), 'base64').toString('utf8').slice(0, 12000);
  } catch {
    return '';
  }
}

function resolveTextAgentTimeoutMs(body: TextAgentBody, req: Request, providerTimeoutMs: number | null | undefined, runtimeTimeoutMs: number) {
  const requested = [
    body.timeoutMs,
    body.upstreamTimeoutMs,
    body.requestTimeoutMs,
    body.queryTimeoutMs,
    body.extra?.timeoutMs,
    body.extra?.upstreamTimeoutMs,
    req.get('X-Upstream-Timeout-Ms'),
    req.get('X-Request-Timeout-Ms'),
    req.get('X-Generation-Timeout-Ms'),
    req.get('X-Timeout-Ms'),
  ].map(asFiniteNumber).filter((value): value is number => Number.isFinite(value) && value > 0);

  if (requested.length > 0) {
    return clampNumber(Math.max(...requested), 1000, 600000);
  }

  const baseline = Math.max(Number(providerTimeoutMs || 0), Number(runtimeTimeoutMs || 0), 120000);
  return clampNumber(baseline, 1000, 600000);
}

function resolveTextAgentMaxOutputTokens(body: TextAgentBody) {
  const requested = [
    body.maxOutputTokens,
    body.maxTokens,
    body.extra?.maxOutputTokens,
    body.extra?.maxTokens,
  ].map(asFiniteNumber).find(value => Number.isFinite(value) && value > 0);
  const fallback = body.mode === 'script' || body.outputType === 'script' ? 8192 : 4096;
  return clampNumber(Math.floor(requested || fallback), 1, 200000);
}

function extractTextAgentLlmText(payload: any): string {
  return String(
    extractChatText(payload) ||
    payload?.output_text ||
    payload?.outputText ||
    payload?.content ||
    extractResponsesOutputText(payload) ||
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.text ||
    '',
  ).trim();
}

function extractResponsesOutputText(payload: any): string {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  const visit = (value: any) => {
    if (value == null) return;
    if (typeof value === 'string') {
      if (value.trim()) parts.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.text === 'string') parts.push(value.text);
    if (typeof value.content === 'string') parts.push(value.content);
    if (value.type === 'output_text' && typeof value.output_text === 'string') parts.push(value.output_text);
    visit(value.content);
  };
  output.forEach(visit);
  return parts.filter(Boolean).join('\n').trim();
}

function isResponsesEndpoint(endpointPath: string) {
  return /\/responses(?:\?|#|$)/i.test(String(endpointPath || ''));
}

function compactRequestJson<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')) as T;
}

function asFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(Math.floor(value), max));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export default router;
