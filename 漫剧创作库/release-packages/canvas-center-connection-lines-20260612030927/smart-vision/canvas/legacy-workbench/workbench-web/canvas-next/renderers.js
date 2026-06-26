import {NODE_DEFS,GENERATOR_MODES,getMode} from './node-defs.js';
import {activeModeValues,esc,modelOptions,modeSummary,selectModel} from './generator-adapters.js';

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
  const selectedModel=selectModel(state.models,mode,values);
  return `<div class="hub-panel">
    <textarea class="tap-prompt" data-node="${node.id}" data-mode="${mode}" data-mode-field="${promptField}" placeholder="${mode==='storyboard'?'输入主体故事内容，系统会自动拆分分镜':'Prompt'}">${esc(prompt)}</textarea>
    <div class="tap-toolbar">
      ${renderModeSelect(node,mode)}
      <label class="tool-pill model-pill"><span>⌘</span><select data-node="${node.id}" data-mode="${mode}" data-mode-field="modelKey">${modelOptions(state.models,mode,values.modelKey)}</select></label>
      ${renderModeControls(node,mode,values,selectedModel)}
      <button class="tool-pill ghost" data-action="toggle-panel" data-node="${node.id}">Hide</button>
      <button class="run-btn" data-action="run-node" data-node="${node.id}">↑</button>
    </div>
  </div>`;
}

function renderModeSelect(node,mode){
  return `<label class="tool-pill mode-pill"><span>${esc(getMode(mode).short)}</span><select data-node="${node.id}" data-mode-switch="1">${GENERATOR_MODES.map(m=>`<option value="${esc(m.id)}" ${m.id===mode?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>`;
}

function renderModeControls(node,mode,values,model){
  if(mode==='video'){
    const durationOptions=videoDurationOptions(model);
    const duration=durationOptions.includes(String(values.duration||''))?String(values.duration):(durationOptions[0]||'5');
    const soundToggle=modelSoundField(model)?`<label class="tool-pill sound-pill" title="${values.generateAudio!==false?'声音开启':'声音关闭'}"><input type="checkbox" data-node="${node.id}" data-mode="${mode}" data-mode-field="generateAudio" ${values.generateAudio!==false?'checked':''}><span>声</span></label>`:'';
    return `${selectPill('▭','aspectRatio',['16:9','9:16','1:1','4:3','3:4'],values.aspectRatio,node,mode)}
      ${selectPill('HD','resolution',['720p','1080p'],values.resolution,node,mode)}
      ${selectPill('↻','duration',durationOptions,duration,node,mode,'s')}
      ${soundToggle}`;
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

function videoDurationOptions(model={}){
  const caps=model?.capabilities&&typeof model.capabilities==='object'&&!Array.isArray(model.capabilities)?model.capabilities:{};
  const source=caps.durations||caps.videoDurations||caps.video_durations||caps.allowedDurations||caps.allowed_durations||caps.durationOptions||caps.duration_options;
  const values=(Array.isArray(source)&&source.length?source:['4','5','8','10','12','15'])
    .map(value=>String(value||'').trim().replace(/s$/i,''))
    .filter(Boolean);
  return Array.from(new Set(values));
}

function modelSoundField(model={}){
  const caps=model?.capabilities&&typeof model.capabilities==='object'&&!Array.isArray(model.capabilities)?model.capabilities:{};
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
  const isSd2=adapter==='seedance2-sd'||adapter==='sd-seedance2'||adapter==='sd-video'||key.includes('seedance2-sd')||key.includes('canvas-sd2')||/\bsd2(?:\.0)?(?:[-_\s]?(?:720p|1080p|fast|full|standard))?\b/.test(key);
  if(!isSd2)return '';
  return 'generate_audio';
}

function renderStylePreset(node){
  return `<div class="tap-tool-node"><textarea data-node="${node.id}" data-field="prompt" placeholder="输入风格预设提示词">${esc(node.values.prompt||'')}</textarea></div>`;
}

function renderPanoramaGenerator(node){
  const url=node.data?.url||'';
  return `<div class="tap-tool-node">
    <div class="hub-preview small-preview" data-drag-handle="1">${url?`<img src="${esc(url)}" alt="">`:'<div class="tap-empty tap-empty-output"><span>360</span></div>'}</div>
    <div class="tap-toolbar compact">
      <label class="tool-pill"><span>▭</span><select data-node="${node.id}" data-field="size">${opts(['2048x1024','4096x2048'],node.values.size||'2048x1024')}</select></label>
      <button class="run-btn" data-action="run-node" data-node="${node.id}">↑</button>
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
    const start=connectionAnchor(a,sr);
    const end=connectionAnchor(b,sr);
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
      const anchor=connectionAnchor(a,sr);
      if(!anchor)return;
      const ax=anchor.x;
      const ay=anchor.y;
      const tx=state.tempPoint.x-sr.left;
      const ty=state.tempPoint.y-sr.top;
      paths.push(`<path class="conn temp" d="${isReverse?curve(tx,ty,ax,ay):curve(ax,ay,tx,ty)}"></path>`);
    }
  }
  svg.innerHTML=paths.join('');
}

function connectionAnchor(port,stageRect){
  const node=port.closest('.node');
  const surface=node?.querySelector('.tap-media-card,.hub-preview,.generator-list,.tap-tool-node,.node-body')||node;
  if(!surface)return null;
  const r=surface.getBoundingClientRect();
  return {x:r.left+r.width/2-stageRect.left,y:r.top+r.height/2-stageRect.top};
}

function curve(x1,y1,x2,y2){
  const sign=x2>=x1?1:-1;
  const dx=Math.max(96,Math.abs(x2-x1)*.42)*sign;
  return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
}
