import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../http.js';
import { asyncHandler, requireAuth } from '../../middleware.js';

const router = Router();

const assetDesignSchema = z.object({
  assetType: z.enum(['character', 'prop', 'scene']).default('character'),
  templateId: z.string().default('character_view_1'),
  ratio: z.string().default('3:4'),
  prompt: z.string().default(''),
  inputText: z.string().default(''),
  referenceFiles: z.array(z.unknown()).default([]),
  images: z.array(z.unknown()).default([]),
  styleWordlist: z.string().default('写实电影'),
  scenePreset: z.string().default('宫殿 / 大殿'),
  sceneReferenceMode: z.string().default('保持空间结构'),
  propType: z.string().default('武器'),
  materialStyle: z.string().default('金属'),
  designGoal: z.string().default('设定稿'),
  agentPackId: z.string().default('manju-creation-library'),
}).passthrough();

router.post('/workbench/asset-design/run', requireAuth, asyncHandler(async (req, res) => {
  const body = assetDesignSchema.parse(req.body);
  const prompt = buildAssetPrompt(body);
  ok(res, { prompt, text: prompt, images: [], stageLabel: '资产设计提示词已生成' });
}));

function buildAssetPrompt(body: z.infer<typeof assetDesignSchema>) {
  const base = [body.inputText, body.prompt].filter(Boolean).join('\n\n').trim() || '根据上游输入生成资产设计稿。';
    const agentLine = `Agent 数据包：${body.agentPackId || 'manju-creation-library'}`;
  if (body.assetType === 'scene') {
    return [
      '任务：生成场景设计设定稿提示词。',
            agentLine,
      `画幅比例：${body.ratio}`,
      `风格词库：${body.styleWordlist}`,
      `场景预设：${body.scenePreset}`,
      `垫图策略：${body.sceneReferenceMode}`,
      '输出要求：完整空间结构、建筑/设施/道具/光影/氛围，可作为后续分镜与视频生成依据。',
      `设计输入：${base}`,
    ].join('\n');
  }
  if (body.assetType === 'prop') {
    return [
      '任务：生成道具设计设定稿提示词。',
            agentLine,
      `道具类型：${body.propType}`,
      `材质风格：${body.materialStyle}`,
      `画幅比例：${body.ratio}`,
      '版式：纯白背景，多宫格排版，三视图 + 局部细节 + 特写全貌，标注材质、纹样、比例和使用方式。',
      `设计输入：${base}`,
    ].join('\n');
  }
  const templateText: Record<string, string> = {
    character_view_1: '模板1：三视图、全身照、脸部特写、5组表情。',
    character_view_2: '模板2：三视图、全身照、近景半身照。',
    character_ref_layout: '模板3：参考图式白底细黑线分栏设定稿，比例固定。',
  };
  return [
    '任务：生成角色设计设定稿提示词。',
        agentLine,
    `画幅比例：${body.ratio}`,
    templateText[body.templateId] || templateText.character_view_1,
    '版式：纯白/干净浅色背景，细黑线分栏，多宫格排版；右侧大幅全身立绘，左侧多视角、服装配饰道具平铺、表情库。',
    '输出要求：外观锚点清晰、服装材质明确、表情与道具可复用，适合作为后续角色资产统一参考。',
    `设计输入：${base}`,
  ].join('\n');
}

export default router;
