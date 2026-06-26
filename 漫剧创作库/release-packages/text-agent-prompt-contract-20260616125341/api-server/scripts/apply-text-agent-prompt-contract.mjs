import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, '..');
const routeFile = path.join(apiRoot, 'dist/modules/workbench/text-agent-routes.js');

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`patch marker not found: ${label}`);
  return source.replace(search, replacement);
}

function replaceFunctionBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`patch marker not found: ${label} start`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`patch marker not found: ${label} end`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const promptBuilder = String.raw`function buildTextAgentPrompt(body, agentPack) {
    const modeLabel = {
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
    const inputText = String(body.inputText || '').trim();
    const creativeGuard = [
        '硬性约束：必须严格围绕“用户原始创意/输入内容”展开，不得改换题材、人物、世界观、场景、核心冲突或用户指定风格。',
        '硬性约束：如果需要补充细节，只能在原始创意范围内补全；不要生成与输入无关的通用示例、模板占位或另一个故事。',
        '硬性约束：输出必须是可直接交给下游节点使用的最终结果，不要解释你如何工作。',
    ].join('\n');
    return [
        '你是 ' + agentPack.label + '。',
        '任务模式：' + (modeLabel[body.mode] || body.mode),
        '输出类型：' + body.outputType,
        'Agent 说明：' + agentPack.description,
        taskInstruction ? '前端任务说明：\n' + taskInstruction : '',
        outputContract ? '输出/角色约束：\n' + outputContract : '',
        creativeGuard,
        body.mode === 'script' ? '剧本要求：保留用户创意中的主角、目标、冲突、场景和情绪基调；按漫剧/短剧可执行方式组织，包含画面感、动作、对白或分镜化段落。' : '',
        body.mode === 'reverse' ? '反推要求：如果有图片输入，必须基于图片可见内容反推；输出先给可直接用于下游生图节点的【正向提示词】，再给【负面提示词】。' : '',
        '导入文件：\n' + fileList,
        '导入图片：\n' + imageList,
        '导入视频：\n' + videoList,
        'URL/网页内容：\n' + urlList,
        '用户原始创意/输入内容：\n' + (inputText || '无'),
    ].filter(Boolean).join('\n\n');
}
function formatTextAgentFiles(files) {
    const items = Array.isArray(files) ? files : [];
    return items.map((item, index) => {
        const content = extractInlineFileText(item);
        return [(index + 1) + '. ' + (item?.name || '未命名文件') + ' ' + (item?.type || ''), content ? '内容摘录：\n' + content : '内容摘录：暂不支持该文件类型直接解析'].join('\n');
    }).join('\n\n') || '无';
}
function textAgentReferenceUrl(item) {
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
        ''
    ).trim();
}
function formatTextAgentMedia(items, label) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item, index) => {
        const url = textAgentReferenceUrl(item);
        const title = item?.label || item?.name || item?.summary || (label + '参考');
        const summary = item?.summary || item?.content || item?.description || '';
        return [(index + 1) + '. ' + title, url ? label + '地址：' + url : label + '地址：未提供', summary ? '说明：' + summary : ''].filter(Boolean).join('\n');
    }).join('\n\n') || '无';
}
function formatTextAgentUrls(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item, index) => {
        if (typeof item === 'string') return (index + 1) + '. ' + item;
        const title = item?.title || item?.finalUrl || item?.url || ('URL ' + (index + 1));
        return [
            (index + 1) + '. ' + title,
            item?.finalUrl || item?.url ? '来源：' + (item.finalUrl || item.url) : '',
            item?.description ? '页面摘要：' + item.description : '',
            item?.summary ? '核心内容：' + item.summary : '',
            item?.excerpt || item?.text ? '正文摘录：\n' + String(item.excerpt || item.text || '').slice(0, 5000) : '',
        ].filter(Boolean).join('\n');
    }).join('\n\n') || '无';
}

`;

function patchTextAgentRoute(source) {
  if (!source.includes('taskInstruction: z.string().default')) {
    source = replaceRequired(
      source,
      `    videos: z.array(z.unknown()).default([]),`,
      `    videos: z.array(z.unknown()).default([]),
    urls: z.array(z.unknown()).default([]),
    taskInstruction: z.string().default(''),
    outputContract: z.string().default(''),`,
      'text-agent prompt contract schema',
    );
  }
  source = replaceFunctionBlock(
    source,
    'function buildTextAgentPrompt(body, agentPack) {',
    'async function runLlm',
    promptBuilder,
    'buildTextAgentPrompt',
  );
  source = source.replace(
    `instructions: '你是专业的文本、剧本、提示词生产 Agent。'`,
    `instructions: String(body?.outputContract || '').trim() || '你是专业的文本、剧本、提示词生产 Agent。'`,
  );
  return source;
}

async function main() {
  let source = await readFile(routeFile, 'utf8');
  source = patchTextAgentRoute(source);
  const required = [
    'taskInstruction: z.string().default',
    'outputContract: z.string().default',
    '硬性约束：必须严格围绕',
    '用户原始创意/输入内容',
    'function formatTextAgentUrls',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) throw new Error(`patched marker missing: ${marker}`);
  }
  await writeFile(routeFile, source, 'utf8');
  console.log(`[text-agent-prompt-contract] patched ${routeFile}`);
}

main().catch(err => {
  console.error('[text-agent-prompt-contract] failed:', err);
  process.exitCode = 1;
});
