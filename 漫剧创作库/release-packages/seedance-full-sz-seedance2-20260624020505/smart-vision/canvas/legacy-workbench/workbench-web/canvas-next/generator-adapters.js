import {getMode} from './node-defs.js';

export function esc(text){
  return String(text??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function activeModeValues(node){
  const mode=node.values.activeMode||'txt2img';
  return node.values.modeValues?.[mode]||{};
}

export function modelLabel(model){
  return model?.ui?.label||model?.label||model?.nick||model?.name||model?.model||'未命名模型';
}

function isAiyunzhiFireflyGptImageAdapter(adapter){
  return ['aiyunzhi-firefly-gpt-image','aiyunzhi-gpt-image-2'].includes(String(adapter||'').trim().toLowerCase());
}

function looksLikeAiyunzhiFireflyGptImageModel(model={},adapter=''){
  const provider=model?.provider&&typeof model.provider==='object'?model.provider:{};
  const protocol=model?.protocol&&typeof model.protocol==='object'?model.protocol:{};
  const text=[
    adapter,
    model?.id,model?.configId,model?.modelKey,model?.identityKey,model?._identityKey,
    model?.name,model?.model,model?.modelName,model?.realModelName,model?.upstreamModel,model?.defaultModel,
    model?.nick,model?.nickname,model?.modelNick,model?.displayName,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,model?.baseUrl,model?.url,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.defaultModel,provider.baseUrl
  ].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return isAiyunzhiFireflyGptImageAdapter(adapter)||
    isAiyunzhiFireflyGptImageAdapter(model?.adapter)||
    isAiyunzhiFireflyGptImageAdapter(model?.protocol?.adapter)||
    text.includes('firefly-gpt-image')||
    (text.includes('aiyunzhi')&&text.includes('gpt-image'));
}

function hasStrongVideoModelSignal(model={},adapter='',endpoint=''){
  const provider=model?.provider&&typeof model.provider==='object'?model.provider:{};
  const protocol=model?.protocol&&typeof model.protocol==='object'?model.protocol:{};
  const supports=model?.supports&&typeof model.supports==='object'?model.supports:{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.identityKey,model?._identityKey,
    model?.name,model?.model,model?.modelName,model?.realModelName,model?.upstreamModel,
    model?.nick,model?.nickname,model?.modelNick,model?.displayName,model?.label,model?.ui?.label,
    model?.providerKey,model?.channelKey,provider.providerKey,provider.name,provider.type,
    adapter,protocol.adapter,provider.adapter,endpoint,protocol.endpointPath,provider.endpointPath
  ].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return ['fullblood-video','seedance-full','sd2-internal','lingdong-sd-2-vip','sd-2-vip','zaomeng-seedance2','zaomeng-seedance2-svip','zaomeng-seedance2-fast','sora-video-pro','seedance2','seedance2.0','aiyunzhi-grok-video','aiyunzhi-veo-video'].includes(adapter)||
    /\/(?:v1\/)?video\/generations(?:[/?#]|$)/i.test(endpoint)||
    /\/videos(?:[/?#]|$)/i.test(endpoint)||
    text.includes('canvas_fullblood-video')||
    text.includes('fullblood-video')||
    text.includes('seedance-full')||
    text.includes('fullblood-seedance-2')||
    text.includes('fullblood-omni-video-2')||
    text.includes('type video')||
    supports.txt2video===true||
    supports.img2video===true||
    supports.textToVideo===true||
    supports.imageToVideo===true;
}

export function normalizeModelType(model){
  const raw=String(model?.modelType||model?.type||model?.category||model?.modelCategory||model?.modelClass||model?.classification||'').trim().toLowerCase();
  const endpoint=String(model?.endpointPath||model?.protocol?.endpointPath||model?.provider?.endpointPath||model?.url||model?.baseUrl||'').toLowerCase();
  const adapter=String(model?.adapter||model?.protocol?.adapter||model?.provider?.adapter||model?.channelType||model?.providerType||'').toLowerCase();
  if(looksLikeAiyunzhiFireflyGptImageModel(model,adapter))return 'image';
  if(hasStrongVideoModelSignal(model,adapter,endpoint))return 'video';
  if(['llm','chat','language','text','text_generation','completion','large_language_model','large-language-model','openai_chat','openai-chat','openai chat','大语言模型','语言模型','文本模型'].includes(raw))return 'llm';
  if(['image','img','image_generation','text2image','txt2img','image_to_image','img2img','生图模型','图片模型','图像模型'].includes(raw))return 'image';
  if(['video','video_generation','text2video','txt2video','image2video','img2video','生视频模型','视频模型'].includes(raw))return 'video';
  if(['sd2-internal','lingdong-sd-2-vip','sd-2-vip','zaomeng-seedance2','zaomeng-seedance2-svip','zaomeng-seedance2-fast'].includes(adapter)||/\/(?:v1\/)?video\/generations(?:[/?#]|$)/i.test(endpoint)||/\/videos(?:[/?#]|$)/i.test(endpoint))return 'video';
  if(/chat\/completions|\/responses(?:\/|$)|completion/.test(endpoint)||/(^|[-_\s])chat($|[-_\s])|llm|completion|openai[-_\s]?chat/.test(adapter))return 'llm';
  const hay=[model?.name,model?.model,model?.modelName,model?.realModelName,model?.upstreamModel,model?.nick,model?.modelNick,model?.nickname,model?.displayName,model?.label,model?.ui?.label,model?.provider?.name,model?.channelType].map(v=>String(v||'')).join(' ').toLowerCase();
  if(/seedance|sora|kling|runway|pika|hailuo|vidu|wan|t2v|i2v|video|veo/.test(hay))return 'video';
  if(/gpt[-_ ]?image|imagen|flux|sdxl|midjourney|niji|image|img|画图|生图|grok.*imagine/.test(hay))return 'image';
  if(/deepseek|qwen|glm|claude|grok[-_ ]?4|gpt[-_ ]?(?:3|4|4o|5)|gpt\d|chat|llm|语言|大模型/.test(hay))return 'llm';
  return 'image';
}

export function modelKey(model,index){
  return model?.modelKey||model?.id||model?.configId||model?.identityKey||model?._identityKey||`${normalizeModelType(model)}-${index}`;
}

export function selectModel(models,mode,values){
  const wanted=mode==='video'?'video':'image';
  const filtered=models.filter(m=>normalizeModelType(m)===wanted);
  const key=String(values.modelKey||'');
  return filtered.find((m,i)=>[
    modelKey(m,i),
    String(m._idx??i),
    m.id,
    m.configId,
    m.modelKey,
    m.identityKey,
    m._identityKey,
    m.name,
    m.model
  ].map(v=>String(v||'')).includes(key))||filtered[0]||null;
}

export function modelOptions(models,mode,selectedKey=''){
  const wanted=mode==='video'?'video':'image';
  const filtered=models.filter(m=>normalizeModelType(m)===wanted);
  if(!filtered.length)return '<option value="">暂无模型</option>';
  return filtered.map((m,i)=>{
    const key=modelKey(m,i);
    const selected=String(selectedKey||'')===String(key)||(!selectedKey&&i===0);
    return `<option value="${esc(key)}" ${selected?'selected':''}>${esc(modelLabel(m))}</option>`;
  }).join('');
}

export function buildPromptForMode(mode,values,styleText=''){
  if(mode==='storyboard')return buildStoryboardPrompt(values,styleText);
  const raw=mode==='video'?values.prompt:values.prompt;
  return [styleText,raw].filter(Boolean).join('，').trim();
}

export function buildStoryboardPrompt(values,styleText=''){
  const story=String(values.story||values.prompt||'').trim();
  if(!story)return '';
  const cut=String(values.cutCount||'auto');
  const cutText=cut==='auto'
    ? '由 gpt-image-2 根据故事节奏、动作密度和情绪转折自动推演最合适的 Cut 数量。'
    : `严格拆分为 ${cut} 个连续 Cut。`;
  const layout=storyboardLayoutText(values.layoutPreset||'standard');
  return `生成一张用于影片、短剧、广告、动画或 MV 制作的专业分镜故事板图片。
整体视觉：${[styleText,values.style||'电影写实风格，真实摄影质感，高质量影视概念设计'].filter(Boolean).join('，')}

主体故事内容：
${story}

Cut 拆分：
${cutText}

排版方案：
${layout}

导演语法：
镜头之间必须保持同一角色、同一场景、同一道具、同一光影方向和同一色调体系的连续性。动作从前一镜自然延续到后一镜，镜头方向清楚，不要跳轴。遵守 180 度轴线规则、视线匹配、运动方向连续和动作匹配剪辑。

每个 Cut 必须表达：镜号、时序、景别、动作关键词、调度关键词、必要台词或情绪说明。文字信息必须清晰可读，不得遮挡关键人物、动作、道具和镜头动线。

画质要求：
clean image, low noise, minimal grain, clean shadows, simplified background texture, sharp subject, readable layout, no dirty noise, no compression artifacts. 暗部保留层次但不要脏黑；背景减少高频纹理；人物脸部、手部、关键道具、分镜边框和文字区域必须优先清晰。

避免：
不要生成单张电影海报；不要生成纯文字表格；不要出现多余角色；不要让同一角色变成不同人；不要让分镜格互相重叠；不要让文字遮挡关键画面；不要强胶片颗粒、脏噪点、低清压缩伪影、过量烟雾、过度锐化、过度运动模糊。`;
}

function storyboardLayoutText(id){
  const map={
    standard:'现有标准生产型故事板：顶部标题，中部主分镜板，下方空间参考图，底部灯光、色彩、氛围模块。',
    image1:'暗色电影设定板：左侧角色三视图与细节，右侧 6 Cut 网格，底部时间轴、运镜、VFX、配色。',
    image2:'白底技术动作板：角色三视图、大场景跳跃轨迹图、5 个动作 Cut 卡片、图例与导演备注。',
    image3:'竖向黑底连续分镜条：5 条横向 Cut 行，底部场景俯视、动作分解、光影色彩和情绪关键词。',
    image4:'红黑导演板：左侧竖向时间轴，2x3 大 Cut 网格，每格包含焦段、运镜、动作、光效、情绪。',
    image5:'漫画 16 格联系表：4x4 动作格，每格带手写备注、箭头和底部节奏曲线。',
    image6:'短剧宽幅制作板：顶部关键视觉和人物参考，中部脚本与 6 镜头卡片，底部相机轨迹与站位图。',
    image7:'设定集综合板：角色设定、环境关键图、storyboard 小格、镜头调度、灯光氛围、色彩和镜头参数表。',
    auto:'Auto 排版：完全由 gpt-image-2 根据故事内容、参考图、输出画幅和动作密度自行推演最适合的排版。'
  };
  return map[id]||map.standard;
}

export function modeSummary(node){
  const mode=getMode(node.values.activeMode||'txt2img');
  const values=activeModeValues(node);
  if(node.values.activeMode==='video')return `${mode.label} · ${values.aspectRatio||'16:9'} · ${values.resolution||'720p'} · ${values.duration||'5'}s`;
  if(node.values.activeMode==='mjSmart')return `${mode.label} · ${values.aspectRatio||'auto'} · MJ`;
  return `${mode.label} · ${values.size||'1024x1024'} · ${values.n||1}x`;
}
