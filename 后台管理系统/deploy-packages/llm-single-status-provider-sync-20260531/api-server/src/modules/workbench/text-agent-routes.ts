import { Buffer } from 'node:buffer';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';
import { callUpstreamJson, extractChatText } from '../../upstream.js';
import { resolveAgentPack } from './agent-pack-service.js';

const router = Router();

const textAgentSchema = z.object({
  mode: z.enum(['default', 'script', 'reverse', 'parse', 'optimize']).default('default'),
  modelKey: z.string().optional(),
  agentPackId: z.string().default('manju-creation-library'),
  outputType: z.enum(['text', 'script', 'prompt', 'storyboard']).default('text'),
  inputText: z.string().default(''),
  files: z.array(z.unknown()).default([]),
  images: z.array(z.unknown()).default([]),
  videos: z.array(z.unknown()).default([]),
});

router.post('/workbench/text-agent/run', requireAuth, asyncHandler(async (req, res) => {
  const body = textAgentSchema.parse(req.body);
  const inputText = body.inputText.trim();
  if (body.mode === 'default') {
    ok(res, { text: inputText, prompt: inputText, outputType: body.outputType, stageLabel: '默认模式：已原文透传' });
    return;
  }
  const agentPack = await resolveAgentPack(body.agentPackId);
  const prompt = buildTextAgentPrompt(body, agentPack);
  const text = await runLlm(body.modelKey, prompt);
  ok(res, { text, prompt: text, outputType: body.outputType, agentPack, stageLabel: '文本提示词节点执行完成' });
}));

function buildTextAgentPrompt(body: z.infer<typeof textAgentSchema>, agentPack: Awaited<ReturnType<typeof resolveAgentPack>>) {
  const modeLabel: Record<string, string> = {
    script: '剧本生成',
    reverse: '提示词反推',
    parse: '文件解析',
    optimize: '提示词AI优化',
    default: '默认',
  };
  const fileList = body.files.map((item: any, index) => {
    const content = extractInlineFileText(item);
    return [`${index + 1}. ${item?.name || '未命名文件'} ${item?.type || ''}`, content ? `内容摘录：\n${content}` : '内容摘录：暂不支持该文件类型直接解析'].join('\n');
  }).join('\n\n') || '无';
  return [
    `你是 ${agentPack.label}。`,
    `任务模式：${modeLabel[body.mode] || body.mode}`,
    `输出类型：${body.outputType}`,
    `Agent 说明：${agentPack.description}`,
    '要求：结合对应 Writer Agent、Skill、Doc、Template 的流水线思路输出；不要泛泛闲聊；直接给可用于下游节点的结果。',
    `导入文件：\n${fileList}`,
    `用户输入：\n${body.inputText || '无'}`,
  ].join('\n\n');
}

async function runLlm(modelKey = '', prompt: string) {
  if (!modelKey) fail(400, '请选择 LLM 模型', 'LLM_MODEL_REQUIRED');
  const model = await prisma.aiModel.findFirst({
    where: {
      type: 'LLM',
      status: 'ACTIVE',
      provider: { status: 'ACTIVE' },
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
  const payload = {
    model: model.name,
    messages: [
      { role: 'system', content: '你是专业的文本、剧本、提示词生产 Agent。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  };
  const upstream = await callUpstreamJson(model.provider, endpointPath, payload, model.provider.timeoutMs || undefined) as any;
  const text = extractChatText(upstream) || upstream?.choices?.[0]?.message?.content || upstream?.choices?.[0]?.text || upstream?.text || upstream?.content;
  return String(text || '').trim();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export default router;
