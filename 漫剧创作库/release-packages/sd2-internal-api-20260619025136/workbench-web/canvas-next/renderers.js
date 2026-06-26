import {NODE_DEFS,GENERATOR_MODES,getMode} from './node-defs.js';
import {activeModeValues,esc,modelOptions,modeSummary,normalizeModelType,selectModel} from './generator-adapters.js';

const GROK_IMAGE_ASPECT_RATIOS=['1:1','16:9','9:16','4:3','3:4','3:2','2:3','2:1','1:2','19.5:9','9:19.5','20:9','9:20','auto'];
const GROK_IMAGE_RESOLUTIONS=['1K','2K'];
const GROK_VIDEO_ASPECT_RATIOS=['1:1','16:9','9:16','4:3','3:4','3:2','2:3'];
const GROK_VIDEO_RESOLUTIONS=['480p','720p'];
const GROK_VIDEO_DURATIONS=Array.from({length:15},(_,i)=>String(i+1));

export function renderPalette(el){
  const shown=['singleImage','singleVideo','generatorHub','stylePreset','imageToPanorama','panoramaViewer'];
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

function modeProgressLabel(mode){
  if(mode==='video')return '生视频中';
  if(mode==='storyboard')return '故事板生成中';
  if(mode==='img2img')return '图生图中';
  if(mode==='panorama')return '全景生成中';
  return '生图中';
}

function renderProgressOverlay(node,label=''){
  const visible=node?.status==='running';
  const progress=Math.max(0,Math.min(100,Number(node.progress||0)));
  const ratio=Math.max(0,Math.min(1,progress/100));
  const displayLabel=node.data?.stageLabel||label||'处理中';
  return `<div class="gen-progress-mask" style="display:${visible?'grid':'none'};--gen-progress:${progress}%;--gen-progress-ratio:${ratio}" aria-hidden="${visible?'false':'true'}">
    <div class="gen-progress-fill"></div>
    <div class="gen-progress-text"><b>${Math.round(progress)}%</b><em>${esc(displayLabel)}</em></div>
  </div>`;
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
    ${renderProgressOverlay(node,'图片生成中')}
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
    ${renderProgressOverlay(node,'视频生成中')}
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
      ${renderProgressOverlay(node,modeProgressLabel(mode))}
    </div>
    ${node.values.panelCollapsed?renderCollapsedPanel(node):renderModePanel(node,state,mode,values)}
    ${node.error?`<div class="tap-error">${esc(node.error)}</div>`:''}
  </div>`;
}

function renderGeneratorList(node){
  return `<div class="generator-list" data-drag-handle="1">
    <h3>Generate from this node</h3>
    ${GENERATOR_MODES.filter(m=>!m.hidden).map(m=>`<button class="gen-choice" data-action="choose-mode" data-node="${node.id}" data-mode="${m.id}">
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
  const selectedModel=selectModel(state.models,mode,values);
  const placeholder=mode==='storyboard'
    ? '输入主体故事内容，系统会自动拆分分镜'
    : (mode==='video'
      ? '输入视频提示词。上游生成视频后保存视频大概3-6个小时就会删除, 一定要及时下载, 或者打开自动下载功能。'
      : (mode==='mjSmart'?'输入自然语言画面描述，智能模式会自动转换为 MJ-V7 英文提示词':'Prompt'));
  const smartPreview=mode==='mjSmart'&&values.smartEnglishPrompt
    ? `<div class="smart-mj-preview"><b>MJ</b><span>${esc(values.smartEnglishPrompt)}</span></div>`
    : '';
  return `<div class="hub-panel">
    <textarea class="tap-prompt" data-node="${node.id}" data-mode="${mode}" data-mode-field="${promptField}" placeholder="${placeholder}">${esc(prompt)}</textarea>
    ${smartPreview}
    <div class="tap-toolbar">
      ${renderModeSelect(node,mode)}
      <label class="tool-pill model-pill"><span>⌘</span><select data-node="${node.id}" data-mode="${mode}" data-mode-field="modelKey">${modelOptions(state.models,mode,values.modelKey)}</select></label>
      ${renderModeControls(node,mode,values,selectedModel)}
      <button class="tool-pill ghost" data-action="toggle-panel" data-node="${node.id}">Hide</button>
      <button class="run-btn" data-action="run-node" data-node="${node.id}" ${running?'disabled aria-disabled="true"':''}>↑</button>
    </div>
  </div>`;
}

function renderModeSelect(node,mode){
  const modes=GENERATOR_MODES.filter(m=>!m.hidden||m.id===mode);
  return `<label class="tool-pill mode-pill"><span>${esc(getMode(mode).short)}</span><select data-node="${node.id}" data-mode-switch="1">${modes.map(m=>`<option value="${esc(m.id)}" ${m.id===mode?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>`;
}

function renderModeControls(node,mode,values,model){
  if(mode==='mjSmart'){
    return '';
  }
  if(mode==='video'){
    const caps=modelCapabilities(model);
    const ratioOptions=capabilityList(caps.aspectRatios||caps.aspect_ratios||caps.ratios,isGrokVideoModel(model)?GROK_VIDEO_ASPECT_RATIOS:['16:9','9:16','1:1','4:3','3:4']);
    const resolutionOptions=capabilityList(caps.resolutions,isGrokVideoModel(model)?GROK_VIDEO_RESOLUTIONS:['720p','1080p']);
    const durationOptions=capabilityList(caps.durations||caps.videoDurations||caps.video_durations||caps.allowedDurations||caps.allowed_durations||caps.durationOptions||caps.duration_options,isGrokVideoModel(model)?GROK_VIDEO_DURATIONS:['4','5','8','10','12','15']).map(String);
    const aspectRatio=ratioOptions.includes(values.aspectRatio)?values.aspectRatio:(ratioOptions.includes('16:9')?'16:9':ratioOptions[0]);
    const resolution=resolutionOptions.includes(values.resolution)?values.resolution:resolutionOptions[0];
    const duration=durationOptions.includes(String(values.duration||''))?String(values.duration):(durationOptions.includes('6')?'6':durationOptions[0]);
    const soundToggle=modelSoundField(model)?`<label class="tool-pill sound-pill" title="${values.generateAudio!==false?'声音开启':'声音关闭'}"><input type="checkbox" data-node="${node.id}" data-mode="${mode}" data-mode-field="generateAudio" ${values.generateAudio!==false?'checked':''}><span>声</span></label>`:'';
    return `${selectPill('▭','aspectRatio',ratioOptions,aspectRatio,node,mode)}
      ${selectPill('HD','resolution',resolutionOptions,resolution,node,mode)}
      ${selectPill('↻','duration',durationOptions,duration,node,mode,'s')}
      ${soundToggle}`;
  }
  if(isGrokImageModel(model)){
    const ratio=values.aspectRatio||ratioFromSize(values.size)||(mode==='storyboard'?'16:9':'1:1');
    const resolution=String(values.resolution||'1K').toUpperCase();
    const caps=modelCapabilities(model);
    const ratioOptions=capabilityList(caps.aspectRatios||caps.aspect_ratios||caps.sizes,GROK_IMAGE_ASPECT_RATIOS).filter(item=>GROK_IMAGE_ASPECT_RATIOS.includes(item));
    const resolutionOptions=capabilityList(caps.resolutions,GROK_IMAGE_RESOLUTIONS).map(item=>String(item).toUpperCase()).filter((item,index,list)=>list.indexOf(item)===index);
    const pickedRatio=ratioOptions.includes(ratio)?ratio:(ratioOptions.includes('16:9')?'16:9':ratioOptions[0]);
    const pickedResolution=resolutionOptions.includes(resolution)?resolution:resolutionOptions[0];
    const geometryControls=`${selectPill('▭','aspectRatio',ratioOptions,pickedRatio,node,mode)}
      ${selectPill('1K','resolution',resolutionOptions,pickedResolution,node,mode)}`;
    if(mode==='storyboard'){
      return `${geometryControls}
        ${selectPill('Cut','cutCount',['auto','3','4','5','6','8'],String(values.cutCount||'auto'),node,mode)}
        ${selectPill('Layout','layoutPreset',['standard','image1','image2','image3','image4','image5','image6','image7','auto'],values.layoutPreset,node,mode)}`;
    }
    return `${geometryControls}
      ${selectPill('×','n',['1','2','3','4'],String(values.n||'1'),node,mode)}`;
  }
  if(mode==='storyboard'){
    return `${selectPill('▭','size',['1536x864','1024x1024','864x1536'],values.size,node,mode)}
      ${selectPill('Cut','cutCount',['auto','3','4','5','6','8'],String(values.cutCount||'auto'),node,mode)}
      ${selectPill('Layout','layoutPreset',['standard','image1','image2','image3','image4','image5','image6','image7','auto'],values.layoutPreset,node,mode)}`;
  }
  return `${selectPill('▭','size',['1024x1024','1536x864','864x1536','1536x1536'],values.size,node,mode)}
    ${selectPill('×','n',['1','2','3','4'],String(values.n||'1'),node,mode)}`;
}

function selectPill(icon,field,values,selected,node,mode,suffix=''){
  return `<label class="tool-pill"><span>${esc(icon)}</span><select data-node="${node.id}" data-mode="${mode}" data-mode-field="${field}">${opts(values,selected,suffix)}</select></label>`;
}

function opts(values,selected,suffix=''){
  return values.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}${esc(suffix)}</option>`).join('');
}

function isGrokImageModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return normalizeModelType(model)==='image'&&/grok[-_\s]?image|grok[-_\s]?imagine|cliproxy_xai_media|xai/.test(text);
}

function isGrokVideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return normalizeModelType(model)==='video'&&/grok[-_\s]?video|grok[-_\s]?imagine|cliproxy_xai_media|xai/.test(text);
}

function modelCapabilities(model={}){
  return model?.capabilities&&typeof model.capabilities==='object'&&!Array.isArray(model.capabilities)?model.capabilities:{};
}

function modelSoundField(model={}){
  const caps=modelCapabilities(model);
  const supports=model?.supports&&typeof model.supports==='object'?model.supports:{};
  const protocol=model?.protocol&&typeof model.protocol==='object'?model.protocol:{};
  if(supports.generateAudio===false||caps.apiSupportsGenerateAudio===false||caps.supportsGenerateAudio===false||caps.supportsGeneratedAudio===false)return '';
  const field=protocol.soundField||caps.soundField||caps.soundControlField||protocol.generateAudioField||caps.generateAudioField||'';
  if(field&&field!==false)return String(field).trim();
  const inferred=inferSd2VideoSoundField(model);
  if(inferred)return inferred;
  if(supports.generateAudio===true||caps.apiSupportsGenerateAudio===true||caps.supportsGenerateAudio===true||caps.supportsGeneratedAudio===true||caps.generateAudio===true)return 'generate_audio';
  return '';
}

function inferSd2VideoSoundField(model={}){
  const protocol=model?.protocol&&typeof model.protocol==='object'?model.protocol:{};
  const provider=model?.provider&&typeof model.provider==='object'?model.provider:{};
  const adapter=String(protocol.adapter||model.adapter||provider.adapter||'').trim().toLowerCase();
  const endpoint=[model.endpointPath,model.endpoint_path,protocol.endpointPath,protocol.endpoint_path,model.url,model.baseUrl,provider.endpointPath,provider.endpoint_path,provider.baseUrl].map(x=>String(x||'').toLowerCase()).join(' ');
  const key=[
    model.displayName,model.modelNick,model.name,model.model,model.modelKey,model.id,model.configId,
    model.identityKey,model._identityKey,model.label,model.ui?.label,model.providerKey,model.channelKey,
    provider.providerKey,provider.name,adapter,endpoint
  ].map(x=>String(x||'').toLowerCase()).join(' ');
  if(key.includes('lingdong')||key.includes('sd-2-vip'))return '';
  const isSd2=adapter!=='sd2-internal'&&!key.includes('sd2-internal')&&!key.includes('canvas_sd2-internal')&&(adapter==='seedance2-sd'||adapter==='sd-seedance2'||adapter==='sd-video'||key.includes('seedance2-sd')||key.includes('canvas-sd2')||/\bsd2(?:\.0)?(?:[-_\s]?(?:720p|1080p|fast|full|standard))?\b/.test(key));
  if(!isSd2)return '';
  return 'generate_audio';
}

function capabilityList(value,fallback){
  const source=Array.isArray(value)&&value.length?value:fallback;
  const out=[];
  source.forEach(item=>{
    const text=String(item||'').trim();
    if(text&&!out.includes(text))out.push(text);
  });
  return out.length?out:fallback;
}

function ratioFromSize(value){
  const raw=String(value||'').trim().toLowerCase().replace('×','x');
  const match=raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if(!match)return '';
  const width=Number(match[1]||0);
  const height=Number(match[2]||0);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return '';
  const ratio=width/height;
  const candidates=[['16:9',16/9],['9:16',9/16],['3:2',3/2],['2:3',2/3],['1:1',1]];
  return candidates.reduce((best,item)=>Math.abs(item[1]-ratio)<Math.abs(best[1]-ratio)?item:best,candidates[0])[0];
}

function renderStylePreset(node){
  return `<div class="tap-tool-node"><textarea data-node="${node.id}" data-field="prompt" placeholder="输入风格预设提示词">${esc(node.values.prompt||'')}</textarea></div>`;
}

function renderPanoramaGenerator(node){
  const url=node.data?.url||'';
  const running=node.status==='running';
  const resolution=String(node.values.resolution||'2K').toUpperCase();
  return `<div class="tap-tool-node">
    <div class="hub-preview small-preview" data-drag-handle="1">${url?`<img src="${esc(url)}" alt="">`:'<div class="tap-empty tap-empty-output"><span>360</span></div>'}${renderProgressOverlay(node,modeProgressLabel('panorama'))}</div>
    <div class="tap-toolbar compact">
      <label class="tool-pill"><span>▭</span><select data-node="${node.id}" data-field="size">${opts(['2048x1024','4096x2048'],node.values.size||'2048x1024')}</select></label>
      <label class="tool-pill"><span>1K</span><select data-node="${node.id}" data-field="resolution">${opts(['1K','2K','3K','4K'],resolution)}</select></label>
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
    const startCenter=connectionAnchor(a,sr);
    const endCenter=connectionAnchor(b,sr);
    const start=connectionAnchor(a,sr,endCenter);
    const end=connectionAnchor(b,sr,startCenter);
    if(!start||!end)return '';
    return `<path class="conn" data-conn="${esc(c.from)}:${esc(c.to)}" d="${curve(start.x,start.y,end.x,end.y)}"></path>`;
  });
  if(state.connect&&state.tempPoint){
    const isReverse=state.connect.dir==='in';
    const selector=isReverse
      ? `[data-node-id="${CSS.escape(state.connect.to)}"] .port[data-port-dir="in"][data-port="${CSS.escape(state.connect.toPort)}"]`
      : `[data-node-id="${CSS.escape(state.connect.from)}"] .port[data-port-dir="out"][data-port="${CSS.escape(state.connect.fromPort)}"]`;
    const a=document.querySelector(selector);
    if(a){
      const tx=state.tempPoint.x-sr.left;
      const ty=state.tempPoint.y-sr.top;
      const anchor=connectionAnchor(a,sr,{x:tx,y:ty});
      if(!anchor)return;
      const ax=anchor.x;
      const ay=anchor.y;
      paths.push(`<path class="conn temp" d="${isReverse?curve(tx,ty,ax,ay):curve(ax,ay,tx,ty)}"></path>`);
    }
  }
  svg.innerHTML=paths.join('');
}

function rectCenterPoint(r){
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}

function rectFacingAnchor(r,otherPoint){
  const center=rectCenterPoint(r);
  if(!otherPoint)return center;
  const dx=otherPoint.x-center.x;
  const dy=otherPoint.y-center.y;
  if(Math.abs(dx)>=Math.abs(dy)){
    return {x:dx>=0?r.left+r.width:r.left,y:center.y};
  }
  return {x:center.x,y:dy>=0?r.top+r.height:r.top};
}

function connectionAnchor(port,stageRect,otherPoint=null){
  const node=port.closest('.node');
  const surface=node?.querySelector('.tap-media-card,.hub-preview,.generator-list,.tap-tool-node,.node-body')||node;
  if(!surface)return null;
  const r=surface.getBoundingClientRect();
  return rectFacingAnchor({left:r.left-stageRect.left,top:r.top-stageRect.top,width:r.width,height:r.height},otherPoint);
}

function curve(x1,y1,x2,y2){
  const sign=x2>=x1?1:-1;
  const dx=Math.max(96,Math.abs(x2-x1)*.42)*sign;
  return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
}
