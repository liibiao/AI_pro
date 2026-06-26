import {NODE_DEFS,GENERATOR_MODES,getMode,TEXT_AGENT_MODES,TEXT_AGENT_OUTPUTS,ASSET_TYPES,CHARACTER_TEMPLATES,PROP_TEMPLATES,SCENE_STYLE_WORDLISTS,SCENE_PRESETS,SCENE_REFERENCE_MODES} from './node-defs.js';
import {activeModeValues,esc,modelOptions,modeSummary,normalizeModelType,modelKey,modelLabel,selectModel} from './generator-adapters.js';

export function renderPalette(el){
  const shown=['singleImage','singleVideo','generatorHub','textPromptAgent','assetDesign','stylePreset','imageToPanorama','panoramaViewer'];
  el.innerHTML=`<div class="palette-title">Create</div>`+shown.map(type=>{
    const def=NODE_DEFS[type];
    return `<button class="palette-item" data-action="create-node" data-type="${type}">
      <span class="palette-ic">${esc(def.icon)}</span>
      <span><span class="palette-name">${esc(def.name)}</span><span class="palette-desc">${description(type)}</span></span>
    </button>`;
  }).join('');
}

function description(type){
  return {
    singleImage:'image source',
    singleVideo:'video source',
    generatorHub:'generator hub',
    textPromptAgent:'LLM text / prompt agent',
    assetDesign:'character / prop / scene sheet',
    stylePreset:'style prompt',
    imageToPanorama:'360 generator',
    panoramaViewer:'panorama view'
  }[type]||'node';
}

export function renderWorld(world,state){
  world.style.transform=`translate(${state.view.tx}px,${state.view.ty}px) scale(${state.view.scale})`;
  world.innerHTML=Object.values(state.nodes).map(n=>renderNode(n,state)).join('');
  world.closest('.stage')?.classList.toggle('has-nodes',Object.keys(state.nodes).length>0);
}

function renderNode(node,state){
  const def=NODE_DEFS[node.type];
  const selected=state.selected===node.id?' selected':'';
  const connected=state.conns.some(c=>c.from===node.id||c.to===node.id)?' connected':'';
  const hubList=node.type==='generatorHub'&&!node.values.activeMode;
  const hubActive=node.type==='generatorHub'&&!!node.values.activeMode;
  const mediaNode=node.type==='singleImage'||node.type==='singleVideo';
  const visualWidth=hubList?330:(hubActive?Math.max(node.w,760):node.w);
  const status=node.status&&node.status!=='waiting'?`<span class="node-status">${statusText(node.status,node.progress)}</span>`:'';
  const titleHidden=(mediaNode||hubList||hubActive)?' hidden':'';
  return `<section class="node node-type-${node.type}${selected}${connected}${hubList?' hub-list-node':''}${hubActive?' hub-active-node':''}${mediaNode?' media-node':''} ${node.status||'waiting'}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px;width:${visualWidth}px">
    <div class="node-titlebar${titleHidden}" data-drag-handle="1"><span class="node-title-ic">${esc(def.icon)}</span><span class="node-title-text">${esc(def.name)}</span>${status}</div>
    <div class="node-actions">
      <button class="icon-btn create" data-action="quick-add" data-node="${node.id}" title="创建连接">＋</button>
      <button class="icon-btn remove" data-action="delete-node" data-node="${node.id}" title="删除">×</button>
    </div>
    <div class="ports">${renderPorts(node)}</div>
    <div class="node-body">${renderBody(node,state)}</div>
  </section>`;
}

function statusText(status,progress){
  if(status==='running')return `${Math.round(progress||0)}%`;
  if(status==='failed')return 'failed';
  if(status==='success')return 'done';
  return '';
}

function renderPorts(node){
  const def=NODE_DEFS[node.type];
  const ins=(def.inputs||[]).map((p,i,arr)=>`<div class="port-row in" style="top:${portTop(i,arr.length)}"><span class="port" data-port-dir="in" data-port="${p.id}" data-kind="${p.kind}" title="${esc(p.label)}"></span></div>`).join('');
  const outs=(def.outputs||[]).map((p,i,arr)=>`<div class="port-row out" style="top:${portTop(i,arr.length)}"><span class="port" data-port-dir="out" data-port="${p.id}" data-kind="${p.kind}" title="${esc(p.label)}"></span></div>`).join('');
  return ins+outs;
}

function portTop(i,total){return total<=1?'50%':`${(i+1)/(total+1)*100}%`;}

function renderBody(node,state){
  if(node.type==='singleImage')return renderSingleImage(node);
  if(node.type==='singleVideo')return renderSingleVideo(node);
  if(node.type==='generatorHub')return renderGeneratorHub(node,state);
  if(node.type==='textPromptAgent')return renderTextPromptAgent(node,state);
  if(node.type==='assetDesign')return renderAssetDesign(node,state);
  if(node.type==='stylePreset')return renderStylePreset(node);
  if(node.type==='imageToPanorama')return renderPanoramaGenerator(node,state);
  if(node.type==='panoramaViewer')return renderPanoramaViewer(node);
  return '';
}

function firstImage(node){
  return node.data?.images?.[0]?.url||node.data?.url||node.values.images?.[0]?.dataUrl||node.values.images?.[0]?.url||'';
}

function renderSingleImage(node){
  const url=firstImage(node);
  return `<div class="tap-media-card" data-drag-handle="1" style="aspect-ratio:16/9">
    ${url?`<img src="${esc(url)}" alt="">`:`<div class="tap-empty tap-empty-image"></div>`}
    <div class="media-toolbar">
      <label>Upload<input type="file" accept="image/png,image/jpeg,image/webp" data-file="image" data-node="${node.id}"></label>
      <button data-action="quick-add" data-node="${node.id}">Generate</button>
    </div>
  </div>`;
}

function renderSingleVideo(node){
  const url=node.data?.videoUrl||node.data?.url||node.values.videoUrl||node.values.videoDataUrl||'';
  return `<div class="tap-media-card video-card" data-drag-handle="1" style="aspect-ratio:16/9">
    ${url?`<video src="${esc(url)}" controls muted playsinline></video>`:`<div class="tap-empty tap-empty-video"></div>`}
    <div class="media-toolbar">
      <label>Upload<input type="file" accept="video/mp4,video/webm,video/quicktime" data-file="video" data-node="${node.id}"></label>
      <button data-action="quick-add" data-node="${node.id}">Generate</button>
    </div>
  </div>`;
}

function renderGeneratorHub(node,state){
  if(!node.values.activeMode)return renderGeneratorList(node);
  const mode=node.values.activeMode;
  const values=activeModeValues(node);
  const media=mode==='video'
    ? (node.data?.videoUrl||node.data?.url||'')
    : (node.data?.images?.[0]?.url||node.data?.url||'');
  return `<div class="tap-hub">
    <div class="hub-preview" data-drag-handle="1">
      ${media?(mode==='video'?`<video src="${esc(media)}" controls muted playsinline></video>`:`<img src="${esc(media)}" alt="">`):`<div class="tap-empty tap-empty-output"><span>${esc(getMode(mode).label)}</span></div>`}
    </div>
    ${node.values.panelCollapsed?renderCollapsedPanel(node):renderModePanel(node,state,mode,values)}
    ${node.error?`<div class="tap-error">${esc(node.error)}</div>`:''}
  </div>`;
}

function renderGeneratorList(node){
  return `<div class="generator-list" data-drag-handle="1">
    <h3>Generate from this node</h3>
    ${GENERATOR_MODES.map(m=>`<button class="gen-choice" data-action="choose-mode" data-node="${node.id}" data-mode="${m.id}">
      <span class="gen-choice-ic">${esc(m.short)}</span>
      <span><strong>${esc(m.label)}</strong><em>${esc(m.desc)}</em></span>
    </button>`).join('')}
  </div>`;
}

function renderCollapsedPanel(node){
  return `<div class="collapsed-panel">
    <b>${esc(modeSummary(node))}</b>
    <span>${esc(activeModeValues(node).prompt||activeModeValues(node).story||'No prompt')}</span>
    <button data-action="toggle-panel" data-node="${node.id}">展开</button>
  </div>`;
}

function renderModePanel(node,state,mode,values){
  const promptField=mode==='storyboard'?'story':'prompt';
  const prompt=values[promptField]||'';
  const running=node.status==='running';
  const failed=node.status==='failed';
  const stageLabel=node.data?.stageLabel||'';
  const runTitle=running?'生成中':(failed?'重新生成':'生成');
  const runText=running?'…':(failed?'↻':'↑');
  return `<div class="hub-panel">
    <textarea class="tap-prompt" data-node="${node.id}" data-mode="${mode}" data-mode-field="${promptField}" placeholder="${mode==='storyboard'?'输入主体故事内容，系统会自动拆分分镜':'Prompt'}">${esc(prompt)}</textarea>
    ${(running||failed||stageLabel)?`<div class="generation-state ${running?'running':failed?'failed':''}">
      ${running?`<span>生成中 ${Math.round(Number(node.progress||0))}%</span>`:''}
      ${stageLabel?`<em>${esc(stageLabel)}</em>`:''}
      ${failed?`<b>生成失败，可修改提示词后点击重新生成</b>`:''}
    </div>`:''}
    <div class="tap-toolbar">
      ${renderModeSelect(node,mode)}
      <label class="tool-pill model-pill"><span>⌘</span><select data-node="${node.id}" data-mode="${mode}" data-mode-field="modelKey">${modelOptions(state.models,mode,values.modelKey)}</select></label>
      ${renderModeControls(node,state,mode,values)}
      <button class="tool-pill ghost" data-action="toggle-panel" data-node="${node.id}">Hide</button>
      ${running?`<button class="tool-pill danger" data-action="stop-node" data-node="${node.id}">停止</button>`:''}
      <button class="run-btn${failed?' retry':''}" title="${esc(runTitle)}" data-action="run-node" data-node="${node.id}" ${running?'disabled aria-disabled="true"':''}>${runText}</button>
    </div>
  </div>`;
}

function renderModeSelect(node,mode){
  return `<label class="tool-pill mode-pill"><span>${esc(getMode(mode).short)}</span><select data-node="${node.id}" data-mode-switch="1">${GENERATOR_MODES.map(m=>`<option value="${esc(m.id)}" ${m.id===mode?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>`;
}

function renderModeControls(node,state,mode,values){
  if(mode==='video'){
    const model=selectModel(state.models||[],mode,values||{});
    const caps=model?.capabilities||{};
    const aspectRatios=Array.isArray(caps.aspectRatios)&&caps.aspectRatios.length?caps.aspectRatios:['16:9','9:16','1:1','4:3','3:4'];
    const resolutions=Array.isArray(caps.resolutions)&&caps.resolutions.length?caps.resolutions:['720p','1080p'];
    const durations=videoDurationOptions(caps,values.duration);
    return `${selectPill('▭','aspectRatio',aspectRatios,values.aspectRatio,node,mode)}
      ${selectPill('HD','resolution',resolutions,values.resolution,node,mode)}
      ${selectPill('↻','duration',durations,String(values.duration||durations[0]||'5'),node,mode,'s')}`;
  }
  if(mode==='storyboard'){
    return `${selectPill('▭','size',['1536x864','1024x1024','864x1536'],values.size,node,mode)}
      ${selectPill('Cut','cutCount',['auto','3','4','5','6','8'],String(values.cutCount||'auto'),node,mode)}
      ${selectPill('Layout','layoutPreset',['standard','image1','image2','image3','image4','image5','image6','image7','auto'],values.layoutPreset,node,mode)}`;
  }
  return `${selectPill('▭','size',['1024x1024','1536x864','864x1536','1536x1536'],values.size,node,mode)}
    ${selectPill('×','n',['1','2','3','4'],String(values.n||'1'),node,mode)}`;
}

function videoDurationOptions(capabilities={},selected=''){
  let values=Array.isArray(capabilities.durations)?capabilities.durations.map(v=>Number(v)).filter(v=>Number.isFinite(v)&&v>0):[];
  const max=Number(capabilities.maxVideoDurationSeconds||capabilities.max_video_duration_seconds||0);
  if(max>0){
    values=values.length?values.filter(v=>v<=max):[4,5,8,10,12,15,20,30,60,90,120].filter(v=>v<=max);
    if(!values.includes(max))values.push(max);
  }
  const current=Number(selected||0);
  if(current>0&&(!max||current<=max))values.push(current);
  values=[...new Set(values.length?values:[4,5,8,10,12,15])].sort((a,b)=>a-b);
  return values.map(v=>String(Math.floor(v)));
}

function selectPill(icon,field,values,selected,node,mode,suffix=''){
  return `<label class="tool-pill"><span>${esc(icon)}</span><select data-node="${node.id}" data-mode="${mode}" data-mode-field="${field}">${opts(values,selected,suffix)}</select></label>`;
}

function opts(values,selected,suffix=''){
  return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}${esc(suffix)}</option>`).join('');
}

function renderStylePreset(node){
  return `<div class="tap-tool-node"><textarea data-node="${node.id}" data-field="prompt" placeholder="输入风格预设提示词">${esc(node.values.prompt||'')}</textarea></div>`;
}

function renderTextPromptAgent(node,state){
  const v=node.values||{};
  const running=node.status==='running';
  const output=node.data?.text||v.outputText||'';
  const files=v.files||[];
  return `<div class="agent-node text-agent-node">
    <div class="agent-card" data-drag-handle="1">
      <div class="agent-head"><b>文本提示词节点</b><span>${esc(TEXT_AGENT_MODES.find(m=>m.id===v.mode)?.label||'默认')}</span></div>
      <textarea class="agent-textarea" data-node="${node.id}" data-field="inputText" placeholder="输入一句话创意、故事梗概、小说原文、剧本或提示词；也可先导入图片 / 视频 / 文件后反推或解析">${esc(v.inputText||'')}</textarea>
      <div class="agent-import-zone">
        <div class="agent-import-head"><b>导入素材</b><span>图片 / 视频可反推提示词，文件可解析文本内容</span></div>
        <label class="agent-import-btn"><span>＋ 图片 / 视频 / 文件</span><input type="file" multiple accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,image/*,video/*" data-file="text-agent-files" data-node="${node.id}"></label>
        ${renderAgentImportList(files,node.id)}
      </div>
      ${output?`<div class="agent-output"><div><b>输出</b><button data-action="copy-node-output" data-node="${node.id}">复制</button></div><pre>${esc(output)}</pre></div>`:''}
      ${(running||node.error||node.data?.stageLabel)?`<div class="generation-state ${running?'running':node.error?'failed':''}">${running?`<span>执行中 ${Math.round(Number(node.progress||0))}%</span>`:''}${node.data?.stageLabel?`<em>${esc(node.data.stageLabel)}</em>`:''}${node.error?`<b>${esc(node.error)}</b>`:''}</div>`:''}
    </div>
    <div class="tap-toolbar agent-toolbar text-agent-toolbar">
      <label class="tool-pill model-pill"><span>LLM</span><select data-node="${node.id}" data-field="llmModelKey">${llmModelOptions(state.models,v.llmModelKey)}</select></label>
      <label class="tool-pill mode-pill"><span>TXT</span><select data-node="${node.id}" data-field="mode">${TEXT_AGENT_MODES.map(m=>`<option value="${esc(m.id)}" ${m.id===v.mode?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>
      <label class="tool-pill"><span>Agent</span><select data-node="${node.id}" data-field="agentPackId">${agentOptions(v.agentPackId)}</select></label>
      <label class="tool-pill"><span>Out</span><select data-node="${node.id}" data-field="outputType">${TEXT_AGENT_OUTPUTS.map(o=>`<option value="${esc(o.id)}" ${o.id===v.outputType?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
      ${running?`<button class="tool-pill danger" data-action="stop-node" data-node="${node.id}">停止</button>`:''}
      <button class="run-btn" title="执行" data-action="run-node" data-node="${node.id}" ${running?'disabled aria-disabled="true"':''}>↑</button>
    </div>
  </div>`;
}

function renderAgentImportList(files,nodeId){
  if(!files?.length)return '<div class="agent-import-empty">暂无导入素材</div>';
  return `<div class="agent-import-list">${files.map((f,i)=>{
    const type=String(f.type||'');
    const isImage=type.startsWith('image/');
    const isVideo=type.startsWith('video/');
    const preview=isImage?`<img src="${esc(f.dataUrl||'')}" alt="">`:(isVideo?`<video src="${esc(f.dataUrl||'')}" muted playsinline></video>`:'<span class="agent-file-icon">FILE</span>');
    const primary=isImage||isVideo?'反推提示词':'解析文件';
    const primaryAction=isImage||isVideo?'reverse':'parse';
    return `<div class="agent-import-item">
      <div class="agent-import-thumb">${preview}</div>
      <div class="agent-import-meta"><b>${esc(f.name||`文件${i+1}`)}</b><span>${esc(fileSizeText(f.size))}</span></div>
      <div class="agent-import-actions">
        <button data-action="agent-file-action" data-node="${nodeId}" data-index="${i}" data-mode="${primaryAction}">${primary}</button>
        <button data-action="remove-agent-file" data-node="${nodeId}" data-kind="text-agent-files" data-index="${i}">移除</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function fileSizeText(size){
  const n=Number(size||0);
  if(!n)return '';
  if(n<1024)return n+' B';
  if(n<1024*1024)return (n/1024).toFixed(1)+' KB';
  return (n/1024/1024).toFixed(1)+' MB';
}

function renderAssetDesign(node,state){
  const v=node.values||{};
  const running=node.status==='running';
  const isChar=v.assetType==='character',isProp=v.assetType==='prop',isScene=v.assetType==='scene';
  const template=isChar?(CHARACTER_TEMPLATES.find(t=>t.id===v.templateId)||CHARACTER_TEMPLATES[0]):PROP_TEMPLATES[0];
  const ratios=isChar?(template.ratios||['3:4']):['3:4','4:5','1:1','16:9','9:16'];
  const output=node.data?.prompt||v.outputPrompt||'';
  return `<div class="agent-node asset-design-node">
    <div class="agent-card" data-drag-handle="1">
      <div class="agent-head"><b>资产设计节点</b><span>${esc(ASSET_TYPES.find(t=>t.id===v.assetType)?.label||'角色设计')} · ${esc(v.ratio||'3:4')}</span></div>
      <div class="asset-summary">${esc(template?.desc||'场景风格词库 + 预设 + 垫图编辑')}</div>
      ${renderFileChips(v.referenceFiles||[],node.id,'asset-reference-files')}
      ${v.promptExpanded?`<textarea class="agent-textarea" data-node="${node.id}" data-field="prompt" placeholder="输入资产设计要求，可结合垫图进行修改编辑">${esc(v.prompt||'')}</textarea>`:`<button class="agent-collapsed" data-action="toggle-asset-prompt" data-node="${node.id}">提示词输入框已收起，点击展开</button>`}
      ${output?`<div class="agent-output"><div><b>设计提示词</b><button data-action="copy-node-output" data-node="${node.id}">复制</button></div><pre>${esc(output)}</pre></div>`:''}
      ${(running||node.error||node.data?.stageLabel)?`<div class="generation-state ${running?'running':node.error?'failed':''}">${running?`<span>执行中 ${Math.round(Number(node.progress||0))}%</span>`:''}${node.data?.stageLabel?`<em>${esc(node.data.stageLabel)}</em>`:''}${node.error?`<b>${esc(node.error)}</b>`:''}</div>`:''}
    </div>
    <div class="tap-toolbar agent-toolbar asset-toolbar">
      <label class="tool-pill"><span>类型</span><select data-node="${node.id}" data-field="assetType">${ASSET_TYPES.map(t=>`<option value="${esc(t.id)}" ${t.id===v.assetType?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label>
      ${isChar?`<label class="tool-pill"><span>模板</span><select data-node="${node.id}" data-field="templateId">${CHARACTER_TEMPLATES.map(t=>`<option value="${esc(t.id)}" ${t.id===v.templateId?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label>`:''}
      ${isScene?`<label class="tool-pill"><span>词库</span><select data-node="${node.id}" data-field="styleWordlist">${opts(SCENE_STYLE_WORDLISTS,v.styleWordlist)}</select></label><label class="tool-pill"><span>预设</span><select data-node="${node.id}" data-field="scenePreset">${opts(SCENE_PRESETS,v.scenePreset)}</select></label><label class="tool-pill"><span>垫图</span><select data-node="${node.id}" data-field="sceneReferenceMode">${opts(SCENE_REFERENCE_MODES,v.sceneReferenceMode)}</select></label>`:''}
      ${isProp?`<label class="tool-pill"><span>道具</span><input data-node="${node.id}" data-field="propType" value="${esc(v.propType||'道具')}" placeholder="道具类型"></label>`:''}
      <label class="tool-pill"><span>▭</span><select data-node="${node.id}" data-field="ratio">${opts(ratios,v.ratio)}</select></label>
      <label class="tool-pill"><span>图</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" data-file="asset-reference-files" data-node="${node.id}"></label>
      <button class="tool-pill ghost" data-action="toggle-asset-prompt" data-node="${node.id}">${v.promptExpanded?'收起':'展开'}</button>
      ${running?`<button class="tool-pill danger" data-action="stop-node" data-node="${node.id}">停止</button>`:''}
      <button class="run-btn" title="执行" data-action="run-node" data-node="${node.id}" ${running?'disabled aria-disabled="true"':''}>↑</button>
    </div>
  </div>`;
}

function llmModelOptions(models,selectedKey=''){
  const enabled=(models||[]).filter(m=>m.enabled!==false&&m.disabled!==true&&String(m.status||'ENABLED').toUpperCase()!=='DISABLED'&&String(m.status||'ENABLED').toUpperCase()!=='INACTIVE');
  const llms=enabled.filter(m=>normalizeModelType(m)==='llm');
  if(!llms.length)return '<option value="">暂无已启用 LLM 模型</option>';
  return `<option value="">选择 LLM 模型</option>`+llms.map((m,i)=>{
    const key=modelKey(m,i);
    return `<option value="${esc(key)}" ${String(key)===String(selectedKey)?'selected':''}>${esc(modelLabel(m))}</option>`;
  }).join('');
}

function agentOptions(selected='manga-writer'){
  const items=[['manga-writer','漫剧创作库 Writer Agent'],['shortdrama-agent-1-5','短剧 Agent 1.5'],['ad-agent','广告 Agent']];
  return items.map(([id,label])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`).join('');
}

function renderFileChips(files,nodeId,kind){
  if(!files?.length)return '';
  return `<div class="agent-files">${files.map((f,i)=>`<span class="agent-file">${esc(f.name||`文件${i+1}`)}<button data-action="remove-agent-file" data-node="${nodeId}" data-kind="${kind}" data-index="${i}">×</button></span>`).join('')}</div>`;
}

function renderPanoramaGenerator(node){
  const url=node.data?.url||'';
  const running=node.status==='running';
  return `<div class="tap-tool-node">
    <div class="hub-preview small-preview" data-drag-handle="1">${url?`<img src="${esc(url)}" alt="">`:'<div class="tap-empty tap-empty-output"><span>360</span></div>'}</div>
    <div class="tap-toolbar compact">
      <label class="tool-pill"><span>▭</span><select data-node="${node.id}" data-field="size">${opts(['2048x1024','4096x2048'],node.values.size||'2048x1024')}</select></label>
      <button class="run-btn" data-action="run-node" data-node="${node.id}" ${running?'disabled aria-disabled="true"':''}>↑</button>
    </div>
    ${node.error?`<div class="tap-error">${esc(node.error)}</div>`:''}
  </div>`;
}

function renderPanoramaViewer(node){
  const url=node.data?.url||node.data?.images?.[0]?.url||'';
  return `<div class="tap-media-card pano-card" data-drag-handle="1" style="aspect-ratio:2/1">${url?`<img src="${esc(url)}" alt="">`:'<div class="tap-empty tap-empty-output"><span>Panorama</span></div>'}</div>`;
}

export function drawConnections(svg,state){
  const stage=svg.closest('.stage');
  const sr=stage.getBoundingClientRect();
  const paths=state.conns.map(c=>{
    const a=document.querySelector(`[data-node-id="${CSS.escape(c.from)}"] .port[data-port-dir="out"][data-port="${CSS.escape(c.fromPort)}"]`);
    const b=document.querySelector(`[data-node-id="${CSS.escape(c.to)}"] .port[data-port-dir="in"][data-port="${CSS.escape(c.toPort)}"]`);
    if(!a||!b)return '';
    const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
    return `<path class="conn" data-conn="${esc(c.from)}:${esc(c.to)}" d="${curve(ar.left+ar.width/2-sr.left,ar.top+ar.height/2-sr.top,br.left+br.width/2-sr.left,br.top+br.height/2-sr.top)}"></path>`;
  });
  if(state.connect&&state.tempPoint){
    const isReverse=state.connect.dir==='in';
    const selector=isReverse
      ? `[data-node-id="${CSS.escape(state.connect.to)}"] .port[data-port-dir="in"][data-port="${CSS.escape(state.connect.toPort)}"]`
      : `[data-node-id="${CSS.escape(state.connect.from)}"] .port[data-port-dir="out"][data-port="${CSS.escape(state.connect.fromPort)}"]`;
    const a=document.querySelector(selector);
    if(a){
      const ar=a.getBoundingClientRect();
      const ax=ar.left+ar.width/2-sr.left;
      const ay=ar.top+ar.height/2-sr.top;
      const tx=state.tempPoint.x-sr.left;
      const ty=state.tempPoint.y-sr.top;
      paths.push(`<path class="conn temp" d="${isReverse?curve(tx,ty,ax,ay):curve(ax,ay,tx,ty)}"></path>`);
    }
  }
  svg.innerHTML=paths.join('');
}

function curve(x1,y1,x2,y2){
  const dx=Math.max(96,Math.abs(x2-x1)*.42);
  return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
}
