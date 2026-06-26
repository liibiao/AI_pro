from pathlib import Path
p=Path('/Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/admin-combined-fixes-202605280946/workbench-web/image-studio-canvas-next.html')
s=p.read_text()
def rep(old,new):
    global s
    if old not in s:
        raise SystemExit('missing pattern: '+old[:120].replace('\n',' '))
    s=s.replace(old,new,1)
rep("""  txt2img:{cat:'generate',name:'文生图',icon:'T2I',desc:'提示词 + 模型 → Image',w:380,
    inputs:[p('style','prompt','风格预设')],outputs:[p('image','image','图片')],status:true,executable:true},
  storyboard:{cat:'generate',name:'创作故事板',icon:'SB',desc:'故事内容 + 参考图 → 专业分镜故事板',w:520,""","""  txt2img:{cat:'generate',name:'文生图',icon:'T2I',desc:'提示词 + 模型 → Image',w:380,
    inputs:[p('style','prompt','风格预设')],outputs:[p('image','image','图片')],status:true,executable:true},
  textPromptAgent:{cat:'generate',name:'文本提示词节点',icon:'TXT',desc:'LLM 文本 / 剧本 / 提示词优化节点',w:640,
    inputs:[p('prompt','prompt','提示词输入'),p('image','image','图片参考'),p('video','video','视频参考')],outputs:[p('prompt','prompt','提示词输出')],status:true,executable:true},
  assetDesign:{cat:'generate',name:'资产设计节点',icon:'AST',desc:'角色 / 道具 / 场景资产设计提示词',w:660,
    inputs:[p('prompt','prompt','设计要求'),p('image','image','参考图')],outputs:[p('prompt','prompt','设计提示词'),p('image','image','参考图输出')],status:true,executable:true},
  storyboard:{cat:'generate',name:'创作故事板',icon:'SB',desc:'故事内容 + 参考图 → 专业分镜故事板',w:520,""")
rep("""    txt2img:{_modelIdx:'',size:'16:9',resolution:'1k',quality:'',background:'',outputFormat:'png',n:'1',positive:''},
    storyboard:{images:[],chips:[],i2iDraft:'',_modelIdx:'',size:'16:9',resolution:'2k',quality:'high',background:'auto',outputFormat:'png',n:'1',story:'',title:'专业分镜故事板',duration:'15s',cutCount:'auto',layoutPreset:'standard',frameAspect:'16:9',style:'电影写实风格，真实摄影质感，高质量影视概念设计',character:'根据故事统一设计角色；同一角色的五官、发型、服装、体型、年龄和气质必须保持一致。',scene:'根据故事统一设计场景；建筑结构、空间方向、光源方向、材质和氛围必须保持一致。',layout:'',promptTemplate:''},""","""    txt2img:{_modelIdx:'',size:'16:9',resolution:'1k',quality:'',background:'',outputFormat:'png',n:'1',positive:''},
    textPromptAgent:{mode:'default',llmModelKey:'',agentPackId:'manga-writer',outputType:'text',promptExpanded:true,inputText:'',outputText:'',files:[]},
    assetDesign:{assetType:'character',templateId:'character_view_1',ratio:'3:4',promptExpanded:false,prompt:'',outputPrompt:'',referenceFiles:[],styleWordlist:'写实电影',scenePreset:'宫殿 / 大殿',sceneReferenceMode:'保持空间结构',propType:'武器',materialStyle:'金属',designGoal:'设定稿',replaceTarget:'subject'},
    storyboard:{images:[],chips:[],i2iDraft:'',_modelIdx:'',size:'16:9',resolution:'2k',quality:'high',background:'auto',outputFormat:'png',n:'1',story:'',title:'专业分镜故事板',duration:'15s',cutCount:'auto',layoutPreset:'standard',frameAspect:'16:9',style:'电影写实风格，真实摄影质感，高质量影视概念设计',character:'根据故事统一设计角色；同一角色的五官、发型、服装、体型、年龄和气质必须保持一致。',scene:'根据故事统一设计场景；建筑结构、空间方向、光源方向、材质和氛围必须保持一致。',layout:'',promptTemplate:''},""")
marker="""function renderPanoramaGenerateControls(n){
  const {models:imageModels,placeholder:imageModelPlaceholder,activeModel}=syncNodeModelSelection(n);
  const activeModelKey=modelStableKey(activeModel)||String(activeModel?._idx??'');
  const adapter=getNodeImageAdapter(n);
  const modelOpts=imageModels.map(m=>{const key=modelStableKey(m)||String(m._idx);return `<option value="${esc(key)}" ${String(activeModelKey)===String(key)?'selected':''}>${esc(modelDisplayName(m)||m.name||'未命名')}</option>`;}).join('');
  const cfg=normalizePanoramaValues(n);
  const ratioOptions=cfg.allowedRatios.map(r=>`<option value="${r}" ${cfg.ratio===r?'selected':''}>${r}</option>`).join('');
  const resOptions=cfg.allowedResolutions.map(r=>`<option value="${r}" ${cfg.resolution===r?'selected':''}>${r.toUpperCase()}</option>`).join('');
  return `<select data-field="_modelIdx" class="aio-sel pano-model-select">${modelOpts||`<option value="">${imageModelPlaceholder}</option>`}</select><select data-field="size" class="aio-sel pano-ratio-sel" title="当前渠道 ${esc(adapter||'default')} 支持的比例">${ratioOptions}</select><select data-field="resolution" class="aio-sel pano-res-sel" title="参考图最低要求 ${esc(cfg.minResolution.toUpperCase())}；输出 ${esc(cfg.pixelSize)}">${resOptions}</select><input class="pano-input pano-strength-input" type="number" step="0.01" min="0" max="0.8" data-field="strength" value="${esc(n.values.strength||'0.38')}" title="扩展强度"/><input class="pano-input pano-lora-input" type="number" step="0.01" min="0" max="2" data-field="loraWeight" value="${esc(n.values.loraWeight||'1.0')}" title="全景权重"/>`;
}
"""
helpers=r'''
const TEXT_AGENT_MODES=[['default','默认'],['script','剧本生成'],['reverse','提示词反推'],['parse','文件解析'],['optimize','提示词AI优化']];
const TEXT_AGENT_OUTPUTS=[['text','文本'],['script','剧本'],['prompt','提示词'],['storyboard','故事板输入']];
const ASSET_TYPES=[['character','角色设计'],['prop','道具设计'],['scene','场景设计']];
const CHARACTER_TEMPLATES=[['character_view_1','模板1','三视图 + 全身照 + 脸部特写 + 5组表情'],['character_view_2','模板2','三视图 + 全身照 + 近景半身照'],['character_ref_layout','模板3','参考图式白底细线分栏设定稿']];
const SCENE_STYLE_WORDLISTS=['写实电影','古风仙侠','赛博朋克','废土末世','科幻工业','中式奇幻','日漫漫画','暗黑哥特','轻奢现代','HZW 大师风格','自定义'];
const SCENE_PRESETS=['宫殿 / 大殿','街道 / 市集','森林 / 山谷','地下城 / 遗迹','科技实验室','战场 / 废墟','房间 / 室内','宗门 / 学院','城市天际线','自定义场景'];
const SCENE_REFERENCE_MODES=['保持空间结构','保持光影氛围','保持建筑风格','保持色彩基调','只参考局部元素','重绘为新场景'];
function optionPairs(items,selected){return items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(selected)?'selected':''}>${esc(label)}</option>`).join('');}
function optionList(items,selected){return items.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join('');}
function llmModelOptions(selected=''){const llms=(S.models||[]).filter(m=>normalizeModelType(m)==='llm');const list=llms.length?llms:S.models||[];return '<option value="">选择 LLM 模型</option>'+list.map(m=>{const key=modelStableKey(m)||String(m._idx??'');return `<option value="${esc(key)}" ${String(key)===String(selected)?'selected':''}>${esc(modelDisplayName(m)||m.name||m.model||'未命名')}</option>`;}).join('');}
function agentOptions(selected='manga-writer'){return [['manga-writer','漫剧创作库 Writer Agent'],['shortdrama-agent-1-5','短剧 Agent 1.5'],['ad-agent','广告 Agent']].map(([id,label])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`).join('');}
function renderAgentFileChips(files=[],id,field){return files.length?`<div class="agent-files">${files.map((f,i)=>`<span class="agent-file">${esc(f.name||'文件'+(i+1))}<button data-action="removeAgentFile" data-node="${id}" data-field="${field}" data-index="${i}" type="button">×</button></span>`).join('')}</div>`:'';}
function renderTextPromptAgentControls(n){const v=n.values||{},out=n.data?.text||v.outputText||'';return `<div class="aio-layout aio-edge agent-node text-agent-node"><div class="agent-card"><div class="agent-head"><b>文本提示词节点</b><span>${esc((TEXT_AGENT_MODES.find(m=>m[0]===v.mode)||[])[1]||'默认')}</span></div>${v.promptExpanded!==false?`<textarea class="aio-textarea" data-field="inputText" placeholder="输入一句话创意、故事梗概、小说原文、剧本或提示词">${esc(v.inputText||'')}</textarea>`:`<button class="agent-collapsed" data-action="toggleAgentPrompt" type="button">提示词输入框已收起，点击展开</button>`}${renderAgentFileChips(v.files||[],n.id,'files')}${out?`<div class="agent-output"><div><b>输出</b><button data-action="copyNodeOutput" type="button">复制</button></div><pre>${esc(out)}</pre></div>`:''}${n.error?`<div class="tap-error">${esc(n.error)}</div>`:''}${renderGenerateProgress(n,'执行中')}</div><div class="aio-bar"><select data-field="llmModelKey" class="aio-sel">${llmModelOptions(v.llmModelKey)}</select><select data-field="mode" class="aio-sel">${optionPairs(TEXT_AGENT_MODES,v.mode)}</select><select data-field="agentPackId" class="aio-sel">${agentOptions(v.agentPackId)}</select><select data-field="outputType" class="aio-sel">${optionPairs(TEXT_AGENT_OUTPUTS,v.outputType)}</select><button class="tb-ghost" data-action="toggleAgentPrompt" type="button">${v.promptExpanded!==false?'收起':'展开'}</button><div class="aio-gap"></div><button class="tb-primary aio-go" data-action="runNode"${runButtonDisabledAttrs(n)}>▶</button></div></div>`;}
function renderAssetDesignControls(n){const v=n.values||{},out=n.data?.prompt||v.outputPrompt||'',isChar=v.assetType==='character',isProp=v.assetType==='prop',isScene=v.assetType==='scene';const tpl=CHARACTER_TEMPLATES.find(t=>t[0]===v.templateId)||CHARACTER_TEMPLATES[0];const ratios=isChar?['3:4','2:3','4:5','9:16','2:3 固定']:['3:4','4:5','1:1','16:9','9:16'];return `<div class="aio-layout aio-edge agent-node asset-design-node"><div class="agent-card"><div class="agent-head"><b>资产设计节点</b><span>${esc((ASSET_TYPES.find(t=>t[0]===v.assetType)||[])[1]||'角色设计')} · ${esc(v.ratio||'3:4')}</span></div><div class="asset-summary">${esc(isChar?tpl[2]:(isProp?'三视图 + 局部细节 + 特写全貌':'场景风格词库 + 预设 + 垫图编辑'))}</div>${renderAgentFileChips(v.referenceFiles||[],n.id,'referenceFiles')}${v.promptExpanded?`<textarea class="aio-textarea" data-field="prompt" placeholder="输入资产设计要求，可结合垫图进行修改编辑">${esc(v.prompt||'')}</textarea>`:`<button class="agent-collapsed" data-action="toggleAssetPrompt" type="button">提示词输入框已收起，点击展开</button>`}${out?`<div class="agent-output"><div><b>设计提示词</b><button data-action="copyNodeOutput" type="button">复制</button></div><pre>${esc(out)}</pre></div>`:''}${n.error?`<div class="tap-error">${esc(n.error)}</div>`:''}${renderGenerateProgress(n,'执行中')}</div><div class="aio-bar"><select data-field="assetType" class="aio-sel">${optionPairs(ASSET_TYPES,v.assetType)}</select>${isChar?`<select data-field="templateId" class="aio-sel">${optionPairs(CHARACTER_TEMPLATES.map(t=>[t[0],t[1]]),v.templateId)}</select>`:''}${isScene?`<select data-field="styleWordlist" class="aio-sel">${optionList(SCENE_STYLE_WORDLISTS,v.styleWordlist)}</select><select data-field="scenePreset" class="aio-sel">${optionList(SCENE_PRESETS,v.scenePreset)}</select><select data-field="sceneReferenceMode" class="aio-sel">${optionList(SCENE_REFERENCE_MODES,v.sceneReferenceMode)}</select>`:''}${isProp?`<input class="aio-sel" data-field="propType" value="${esc(v.propType||'道具')}" placeholder="道具类型"/>`:''}<select data-field="ratio" class="aio-sel">${optionList(ratios,v.ratio)}</select><button class="tb-ghost" data-action="toggleAssetPrompt" type="button">${v.promptExpanded?'收起':'展开'}</button><div class="aio-gap"></div><button class="tb-primary aio-go" data-action="runNode"${runButtonDisabledAttrs(n)}>▶</button></div></div>`;}
'''
rep(marker, marker+helpers)
rep("""    case'txt2img': {
      const resultList=Array.isArray(n.data?.images)&&n.data.images.length?n.data.images:(n.data?.url?[{url:n.data.url,mediaType:n.data?.mediaType||''}]:[]);""","""    case'textPromptAgent': return renderTextPromptAgentControls(n);
    case'assetDesign': return renderAssetDesignControls(n);
    case'txt2img': {
      const resultList=Array.isArray(n.data?.images)&&n.data.images.length?n.data.images:(n.data?.url?[{url:n.data.url,mediaType:n.data?.mediaType||''}]:[]);""")
rep("""      case'singleImage':{
        const upstream=getInputs(id,visited).image;""","""      case'textPromptAgent':{const inp=getInputs(id,visited);const text=n.data?.text||n.values.outputText||n.values.inputText||inp.prompt?.text||inp.prompt?.positive||'';n.data={text,prompt:text,positive:text,outputType:n.values.outputType||'text'};break;}
      case'assetDesign':{const inp=getInputs(id,visited);const text=n.data?.prompt||n.values.outputPrompt||n.values.prompt||inp.prompt?.text||inp.prompt?.positive||'';const imgs=n.values.referenceFiles||inp.image?.images||[];n.data={text,prompt:text,positive:text,images:imgs};break;}
      case'singleImage':{
        const upstream=getInputs(id,visited).image;""")
run_helpers=r'''
async function runTextPromptAgent(id){const n=S.nodes[id];if(!n)return;const inp=getInputs(id);const prompt=[inp.prompt?.text||inp.prompt?.positive||'',n.values.inputText||''].filter(Boolean).join('\n\n').trim();if(!prompt)return setStatusNode(id,'failed',0,'缺少文本输入');setStatusNode(id,'running',10,'文本生成中');rerenderNode(id);try{const data=await window.CanvasAccountGate.request('/api/workbench/text-agent/run',{method:'POST',body:JSON.stringify({mode:n.values.mode,agentPackId:n.values.agentPackId,outputType:n.values.outputType,llmModelKey:n.values.llmModelKey,prompt,inputText:n.values.inputText||'',inputs:inp,files:n.values.files||[]})});const text=String(data?.text||data?.outputText||data?.output||data?.result?.text||data?.result||'').trim();n.values.outputText=text;n.data={text,prompt:text,positive:text,outputType:n.values.outputType||'text'};setStatusNode(id,'success',100);rerenderNode(id);propagate(id);toast('文本提示词节点执行完成','ok');}catch(err){setStatusNode(id,'failed',100,err?.message||String(err));rerenderNode(id);toast('文本提示词节点执行失败','err');}}
async function runAssetDesign(id){const n=S.nodes[id];if(!n)return;const inp=getInputs(id);const prompt=[inp.prompt?.text||inp.prompt?.positive||'',n.values.prompt||''].filter(Boolean).join('\n\n').trim();setStatusNode(id,'running',10,'资产设计中');rerenderNode(id);try{const data=await window.CanvasAccountGate.request('/api/workbench/asset-design/run',{method:'POST',body:JSON.stringify({assetType:n.values.assetType,templateId:n.values.templateId,ratio:n.values.ratio,prompt,styleWordlist:n.values.styleWordlist,scenePreset:n.values.scenePreset,sceneReferenceMode:n.values.sceneReferenceMode,propType:n.values.propType,materialStyle:n.values.materialStyle,designGoal:n.values.designGoal,replaceTarget:n.values.replaceTarget,inputs:inp,referenceFiles:n.values.referenceFiles||[]})});const text=String(data?.prompt||data?.outputPrompt||data?.text||data?.output||data?.result?.prompt||data?.result||'').trim();n.values.outputPrompt=text;n.data={text,prompt:text,positive:text,images:n.values.referenceFiles||inp.image?.images||[]};setStatusNode(id,'success',100);rerenderNode(id);propagate(id);toast('资产设计节点执行完成','ok');}catch(err){setStatusNode(id,'failed',100,err?.message||String(err));rerenderNode(id);toast('资产设计节点执行失败','err');}}
'''
rep("""async function runNode(id){
  const n=S.nodes[id]; if(!n)return;""", run_helpers+"""async function runNode(id){
  const n=S.nodes[id]; if(!n)return;""")
rep("""    if(n.type==='videoEditor'){computeNode(id);setStatusNode(id,'success',100);return;}
    if(n.type==='imageToPanorama') return await runGenerate(id);""","""    if(n.type==='videoEditor'){computeNode(id);setStatusNode(id,'success',100);return;}
    if(n.type==='textPromptAgent') return await runTextPromptAgent(id);
    if(n.type==='assetDesign') return await runAssetDesign(id);
    if(n.type==='imageToPanorama') return await runGenerate(id);""")
rep("""  else if(n.type==='stylePreset')target='txt2img';
  else if(first.kind==='image')target='singleImage';""","""  else if(n.type==='stylePreset')target='textPromptAgent';
  else if(n.type==='textPromptAgent')target='assetDesign';
  else if(n.type==='assetDesign')target='txt2img';
  else if(first.kind==='image')target='singleImage';""")
rep("""  const choices=['imageToPanorama','img2imgAll','storyboard','seedanceVideo','singleImage'];""","""  const choices=['assetDesign','imageToPanorama','img2imgAll','storyboard','seedanceVideo','singleImage'];""")
p.write_text(s)
print('patched', p)
