import {NODE_DEFS,getMode} from './node-defs.js';
import {state,addNode,removeNode,setSelected,addConnection,getInputs,getOutputData,loadWorkflow,saveWorkflow,resetWorkflow,importOldWorkflow} from './state.js';
import {renderPalette,renderWorld,drawConnections} from './renderers.js';
import {loadModels,runGenerator,runPanorama,runTextPromptAgent,runAssetDesign} from './generation-service.js';

const stage=document.getElementById('stage');
const world=document.getElementById('world');
const svg=document.getElementById('connSvg');
const palette=document.getElementById('palette');
const toastArea=document.getElementById('toastArea');
const FAKE_GENERATION_PROGRESS_RATE=0.3;
const FAKE_GENERATION_SLOW_TAIL_STEP=0.05*0.65;
const ACTIVE_RUNS=new Map();

function createRunToken(id){
  const token={id,cancelled:false,createdAt:Date.now()};
  ACTIVE_RUNS.set(id,token);
  return token;
}

function isActiveRun(id,token){
  return ACTIVE_RUNS.get(id)===token&&!token.cancelled;
}

function clearRunToken(id,token){
  if(ACTIVE_RUNS.get(id)===token)ACTIVE_RUNS.delete(id);
}

function cancelRun(id,message='已停止生成，可修改提示词后重新生成'){
  const token=ACTIVE_RUNS.get(id);
  if(token)token.cancelled=true;
  ACTIVE_RUNS.delete(id);
  const n=state.nodes[id];
  if(!n)return;
  n.status='failed';
  n.progress=0;
  n.error=message;
  saveWorkflow();
  render();
  toast(message,'err');
}

boot();

async function boot(){
  renderPalette(palette);
  const forceReset=new URLSearchParams(location.search).has('reset');
  const loadState=forceReset?(resetWorkflow(),'demo'):loadWorkflow();
  try{state.models=await loadModels();}catch(err){toast(`模型加载失败：${err.message}`,'err');}
  ensureVisibleWorkflow();
  render();
  bindEvents();
  if(loadState==='migrated')toast('已从旧版工作流迁移到新画布','ok');
}

function render(){
  try{
    renderWorld(world,state);
    requestAnimationFrame(()=>drawConnections(svg,state));
  }catch(err){
    console.error(err);
    resetWorkflow();
    renderWorld(world,state);
    requestAnimationFrame(()=>drawConnections(svg,state));
    toast('画布状态异常，已重建可用示例','err');
  }
}

function toast(message,type=''){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=message;
  toastArea.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function ensureVisibleWorkflow(){
  const nodes=Object.values(state.nodes);
  if(!nodes.length){
    resetWorkflow();
    return;
  }
  const scale=state.view.scale||1;
  const vw=stage.clientWidth||window.innerWidth;
  const vh=stage.clientHeight||window.innerHeight;
  const visible=nodes.some(n=>{
    const w=(n.type==='generatorHub'&&!n.values.activeMode)?330:(n.type==='generatorHub'?Math.max(n.w,760):n.w);
    const h=n.type==='generatorHub'&&n.values.activeMode?560:(n.type==='generatorHub'?280:260);
    const left=n.x*scale+state.view.tx;
    const top=n.y*scale+state.view.ty;
    const right=left+w*scale;
    const bottom=top+h*scale;
    return right>80&&bottom>80&&left<vw-80&&top<vh-80;
  });
  if(visible)return;
  const minX=Math.min(...nodes.map(n=>n.x));
  const minY=Math.min(...nodes.map(n=>n.y));
  const maxX=Math.max(...nodes.map(n=>n.x+n.w));
  const maxY=Math.max(...nodes.map(n=>n.y+(n.type==='generatorHub'&&n.values.activeMode?560:260)));
  state.view.scale=1;
  state.view.tx=Math.round(vw/2-(minX+maxX)/2);
  state.view.ty=Math.round(vh/2-(minY+maxY)/2);
  saveWorkflow();
}

function bindEvents(){
  document.addEventListener('click',onClick);
  document.addEventListener('input',onInput);
  document.addEventListener('change',onChange);
  document.addEventListener('keydown',onKeyDown);
  stage.addEventListener('pointerdown',onPointerDown);
  stage.addEventListener('pointermove',onPointerMove);
  stage.addEventListener('pointerup',onPointerUp);
  stage.addEventListener('pointercancel',onPointerUp);
  stage.addEventListener('wheel',onWheel,{passive:false});
  stage.addEventListener('dblclick',e=>{
    if(e.target!==stage)return;
    const p=screenToWorld(e.clientX,e.clientY);
    addNode('generatorHub',p.x,p.y,{});
    render();saveWorkflow();
  });
}

async function onClick(e){
  const actionTarget=e.target.closest('[data-action]');
  if(actionTarget?.disabled||actionTarget?.getAttribute('aria-disabled')==='true')return;
  const action=actionTarget?.dataset.action;
  if(!action)return;
  const target=actionTarget;
  const id=target.dataset.node;
  try{
    if(action==='create-node'){
      const p=screenToWorld(stage.clientWidth/2+stage.getBoundingClientRect().left,stage.clientHeight/2+stage.getBoundingClientRect().top);
      addNode(target.dataset.type,p.x-180,p.y-80,{});
      render();
    }else if(action==='delete-node'){
      removeNode(id);render();
    }else if(action==='quick-add'){
      quickAdd(id);render();
    }else if(action==='choose-mode'){
      const n=state.nodes[id];if(!n)return;
      n.values.activeMode=target.dataset.mode;
      n.values.panelCollapsed=false;
      saveWorkflow();render();
    }else if(action==='toggle-panel'){
      const n=state.nodes[id];if(!n)return;
      n.values.panelCollapsed=!n.values.panelCollapsed;
      saveWorkflow();render();
    }else if(action==='toggle-agent-prompt'){
      const n=state.nodes[id];if(!n)return;
      n.values.promptExpanded=n.values.promptExpanded===false;
      saveWorkflow();render();
    }else if(action==='toggle-asset-prompt'){
      const n=state.nodes[id];if(!n)return;
      n.values.promptExpanded=!n.values.promptExpanded;
      saveWorkflow();render();
    }else if(action==='remove-agent-file'){
      removeAgentFile(id,target.dataset.kind,Number(target.dataset.index||0));
      render();
    }else if(action==='copy-node-output'){
      await copyNodeOutput(id);
    }else if(action==='run-node'){
      await runNode(id);
    }else if(action==='stop-node'){
      cancelRun(id);
    }else if(action==='save-workflow'){
      saveWorkflow();toast('已保存','ok');
    }else if(action==='reset-workflow'){
      resetWorkflow();render();toast('已清空并创建示例','ok');
    }else if(action==='import-old'){
      importOldWorkflow();render();toast('已从旧版导入','ok');
    }
  }catch(err){
    toast(err.message||String(err),'err');
  }
}

function onInput(e){
  const el=e.target;
  const id=el.dataset.node;
  if(!id||!state.nodes[id])return;
  const n=state.nodes[id];
  if(el.dataset.modeField){
    const mode=el.dataset.mode||n.values.activeMode;
    n.values.modeValues[mode][el.dataset.modeField]=valueOf(el);
  }else if(el.dataset.field){
    n.values[el.dataset.field]=valueOf(el);
  }
  saveWorkflow();
}

function onChange(e){
  const el=e.target;
  if(el.dataset.file==='image')return handleImageFile(el);
  if(el.dataset.file==='video')return handleVideoFile(el);
  if(el.dataset.file==='text-agent-files'||el.dataset.file==='asset-reference-files')return handleAgentFiles(el);
  if(el.dataset.modeSwitch){
    const n=state.nodes[el.dataset.node];if(!n)return;
    n.values.activeMode=el.value;
    n.values.panelCollapsed=false;
    saveWorkflow();render();
    return;
  }
  onInput(e);
  render();
}

function valueOf(el){
  return el.type==='checkbox'?el.checked:el.value;
}

async function handleAgentFiles(input){
  const n=state.nodes[input.dataset.node];if(!n||!input.files?.length)return;
  const field=input.dataset.file==='asset-reference-files'?'referenceFiles':'files';
  const current=Array.isArray(n.values[field])?n.values[field]:[];
  const slots=Math.max(0,5-current.length);
  const files=Array.from(input.files).slice(0,slots);
  if(!files.length){toast('最多只能导入 5 个文件','err');input.value='';return;}
  const entries=[];
  for(const file of files){
    entries.push({name:file.name,type:file.type||'',size:file.size||0,dataUrl:await readFile(file)});
  }
  n.values[field]=current.concat(entries).slice(0,5);
  input.value='';
  saveWorkflow();render();
}

function removeAgentFile(id,kind,index){
  const n=state.nodes[id];if(!n)return;
  const field=kind==='asset-reference-files'?'referenceFiles':'files';
  const list=Array.isArray(n.values[field])?n.values[field]:[];
  n.values[field]=list.filter((_,i)=>i!==index);
  saveWorkflow();
}

async function copyNodeOutput(id){
  const n=state.nodes[id];if(!n)return;
  const text=n.data?.text||n.data?.prompt||n.values.outputText||n.values.outputPrompt||n.values.inputText||n.values.prompt||'';
  if(!text)throw new Error('暂无可复制内容');
  await navigator.clipboard.writeText(text);
  toast('已复制','ok');
}

async function handleImageFile(input){
  const n=state.nodes[input.dataset.node];if(!n||!input.files?.length)return;
  const file=input.files[0];
  const dataUrl=await readFile(file);
  const entry={name:file.name,file,dataUrl,url:dataUrl,width:0,height:0};
  n.values.images=[entry];
  n.data={url:dataUrl,dataUrl,images:[entry]};
  n.status='success';n.progress=100;n.error='';
  propagateOutputs(n.id);
  saveWorkflow();render();
}

async function handleVideoFile(input){
  const n=state.nodes[input.dataset.node];if(!n||!input.files?.length)return;
  const file=input.files[0];
  const dataUrl=await readFile(file);
  n.values.videoDataUrl=dataUrl;
  n.values.videoUrl=dataUrl;
  n.values.name=file.name;
  n.data={url:dataUrl,videoUrl:dataUrl,contentUrl:dataUrl,name:file.name};
  n.status='success';n.progress=100;n.error='';
  propagateOutputs(n.id);
  saveWorkflow();render();
}

function readFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

function onPointerDown(e){
  const port=e.target.closest('.port');
  if(port){
    const nodeEl=port.closest('.node');
    const id=nodeEl?.dataset.nodeId;
    state.connect=port.dataset.portDir==='out'
      ? {dir:'out',from:id,fromPort:port.dataset.port,kind:port.dataset.kind,startX:e.clientX,startY:e.clientY}
      : {dir:'in',to:id,toPort:port.dataset.port,kind:port.dataset.kind,startX:e.clientX,startY:e.clientY};
    state.tempPoint={x:e.clientX,y:e.clientY};
    stage.classList.add('connecting');
    drawConnections(svg,state);
    e.preventDefault();e.stopPropagation();
    return;
  }
  const nodeEl=e.target.closest('.node');
  if(nodeEl){
    const id=nodeEl.dataset.nodeId;
    if(isInteractiveTarget(e.target)){
      setSelected(id);
      return;
    }
    setSelected(id);
    if(canDragFrom(e.target)){
      const n=state.nodes[id];
      state.drag={id,startX:e.clientX,startY:e.clientY,nodeX:n.x,nodeY:n.y};
      nodeEl.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
    render();
    return;
  }
  if(e.target===stage||e.target===world||e.target===svg){
    setSelected(null);
    state.pan={startX:e.clientX,startY:e.clientY,tx:state.view.tx,ty:state.view.ty};
    stage.classList.add('panning');
    render();
  }
}

function canDragFrom(target){
  if(isInteractiveTarget(target))return false;
  return !!target.closest('[data-drag-handle],.tap-media-card,.hub-preview,.generator-list,.tap-tool-node');
}

function isInteractiveTarget(target){
  return !!target.closest('button,input,textarea,select,label,video,a,.port,[data-action]');
}

function onPointerMove(e){
  if(state.drag){
    const n=state.nodes[state.drag.id];
    n.x=state.drag.nodeX+(e.clientX-state.drag.startX)/state.view.scale;
    n.y=state.drag.nodeY+(e.clientY-state.drag.startY)/state.view.scale;
    const el=document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
    if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}
    drawConnections(svg,state);
  }else if(state.pan){
    state.view.tx=state.pan.tx+e.clientX-state.pan.startX;
    state.view.ty=state.pan.ty+e.clientY-state.pan.startY;
    world.style.transform=`translate(${state.view.tx}px,${state.view.ty}px) scale(${state.view.scale})`;
    drawConnections(svg,state);
  }else if(state.connect){
    state.tempPoint={x:e.clientX,y:e.clientY};
    drawConnections(svg,state);
  }
}

function onPointerUp(e){
  if(state.connect){
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.port');
    const targetNode=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.node');
    if(target&&finishConnectToPort(target)){
      // finished on exact port
    }else if(targetNode&&finishConnectToNode(targetNode.dataset.nodeId)){
      // finished by dropping on node body
    }else{
      const dist=Math.hypot(e.clientX-state.connect.startX,e.clientY-state.connect.startY);
      if(dist>12)spawnFromConnection(e.clientX,e.clientY);
    }
    state.connect=null;state.tempPoint=null;stage.classList.remove('connecting');
    render();
  }
  if(state.drag||state.pan){
    state.drag=null;state.pan=null;stage.classList.remove('panning');saveWorkflow();drawConnections(svg,state);
  }
}

function finishConnectToPort(port){
  const nodeId=port.closest('.node')?.dataset.nodeId;
  if(!nodeId||!state.connect)return false;
  if(state.connect.dir==='out'&&port.dataset.portDir==='in'){
    const ok=addConnection(state.connect.from,state.connect.fromPort,nodeId,port.dataset.port,state.connect.kind);
    if(ok)afterConnectionChanged(state.connect.from,nodeId);
    return ok;
  }
  if(state.connect.dir==='in'&&port.dataset.portDir==='out'){
    const ok=addConnection(nodeId,port.dataset.port,state.connect.to,state.connect.toPort,state.connect.kind);
    if(ok)afterConnectionChanged(nodeId,state.connect.to);
    return ok;
  }
  return false;
}

function finishConnectToNode(nodeId){
  if(!nodeId||!state.nodes[nodeId]||!state.connect)return false;
  if(state.connect.dir==='out'){
    if(nodeId===state.connect.from)return false;
    const input=findCompatibleInput(nodeId,state.connect.kind,state.connect.fromPort);
    if(!input)return false;
    const ok=addConnection(state.connect.from,state.connect.fromPort,nodeId,input.id,state.connect.kind);
    if(ok)afterConnectionChanged(state.connect.from,nodeId);
    return ok;
  }
  if(nodeId===state.connect.to)return false;
  const output=findCompatibleOutput(nodeId,state.connect.kind,state.connect.toPort);
  if(!output)return false;
  const ok=addConnection(nodeId,output.id,state.connect.to,state.connect.toPort,state.connect.kind);
  if(ok)afterConnectionChanged(nodeId,state.connect.to);
  return ok;
}

function findCompatibleInput(nodeId,kind,fromPort=''){
  const def=NODE_DEFS[state.nodes[nodeId]?.type];
  if(!def)return null;
  if(state.nodes[nodeId].type==='generatorHub'){
    if(kind==='prompt')return def.inputs.find(p=>p.id==='style');
    if(kind==='video')return def.inputs.find(p=>p.id==='sourceVideo');
    if(kind==='image')return def.inputs.find(p=>p.id==='source');
  }
  return def.inputs.find(p=>p.id===fromPort&&p.kind===kind)||def.inputs.find(p=>p.kind===kind)||null;
}

function findCompatibleOutput(nodeId,kind,toPort=''){
  const def=NODE_DEFS[state.nodes[nodeId]?.type];
  if(!def)return null;
  return def.outputs.find(p=>p.id===toPort&&p.kind===kind)||def.outputs.find(p=>p.kind===kind)||null;
}

function afterConnectionChanged(fromId,toId){
  syncNodeFromInputs(toId);
  propagateOutputs(fromId);
  saveWorkflow();
}

function syncNodeFromInputs(id){
  const n=state.nodes[id];if(!n)return;
  const inputs=getInputs(id);
  if(n.type==='singleImage'&&inputs.images.length){
    const img=inputs.images[0];
    n.values.images=img.images||[img];
    n.data={...img,images:img.images||[img],url:img.url||img.dataUrl||img.images?.[0]?.url||img.images?.[0]?.dataUrl||''};
    n.status='success';n.progress=100;n.error='';
  }else if(n.type==='singleVideo'&&inputs.videos.length){
    const vid=inputs.videos[0];
    n.data=vid;
    n.values.videoUrl=vid.videoUrl||vid.url||vid.contentUrl||'';
    n.values.name=vid.name||n.values.name||'';
    n.status='success';n.progress=100;n.error='';
  }else if(n.type==='panoramaViewer'&&inputs.images.length){
    const img=inputs.images[0];
    n.data=img;
    n.status='success';n.progress=100;n.error='';
  }else if(inputs.text){
    if(n.type==='stylePreset')n.values.prompt=inputs.text;
    else if(n.type==='textPromptAgent')n.values.inputText=inputs.text;
    else if(n.type==='assetDesign')n.values.prompt=inputs.text;
    else if(n.type==='generatorHub'){
      n.values.modeValues=n.values.modeValues||{};
      Object.values(n.values.modeValues).forEach(v=>{if(v&&typeof v==='object')v.prompt=inputs.text;});
    }
  }
}

function spawnFromConnection(clientX,clientY){
  const p=screenToWorld(clientX,clientY);
  if(state.connect?.dir==='in'){
    const type=defaultUpstreamType(state.connect.to,state.connect.toPort,state.connect.kind);
    if(!type)return;
    const node=addNode(type,p.x-(NODE_DEFS[type]?.w||360)/2,p.y-90,{});
    const out=findCompatibleOutput(node.id,state.connect.kind,state.connect.toPort);
    if(out){
      addConnection(node.id,out.id,state.connect.to,state.connect.toPort,state.connect.kind);
      afterConnectionChanged(node.id,state.connect.to);
    }
    return;
  }
  const source=state.nodes[state.connect?.from];
  if(!source)return;
  if(source.type==='singleImage'||source.type==='singleVideo'){
    const hub=addNode('generatorHub',p.x,p.y,{});
    const isVideo=source.type==='singleVideo';
    addConnection(source.id,isVideo?'video':'image',hub.id,isVideo?'sourceVideo':'source',isVideo?'video':'image');
    afterConnectionChanged(source.id,hub.id);
    return;
  }
  if(source.type==='generatorHub'){
    const out=state.connect.fromPort==='video'?'video':'image';
    const type=out==='video'?'singleVideo':'singleImage';
    const target=addNode(type,p.x,p.y,{});
    addConnection(source.id,out,target.id,out,out);
    afterConnectionChanged(source.id,target.id);
    return;
  }
  if(source.type==='textPromptAgent'||source.type==='assetDesign'||state.connect.kind==='prompt'){
    const target=addNode('textPromptAgent',p.x,p.y,{});
    addConnection(source.id,state.connect.fromPort,target.id,'prompt','prompt');
    afterConnectionChanged(source.id,target.id);
    return;
  }
  const out=state.connect.kind==='video'?'video':'image';
  const type=out==='video'?'singleVideo':'singleImage';
  const target=addNode(type,p.x,p.y,{});
  addConnection(source.id,state.connect.fromPort,target.id,out,out);
  afterConnectionChanged(source.id,target.id);
}

function defaultUpstreamType(toId,toPort,kind){
  const to=state.nodes[toId];
  if(to?.type==='generatorHub'){
    if(toPort==='style')return 'stylePreset';
    if(toPort==='sourceVideo')return 'singleVideo';
    return 'singleImage';
  }
  if(kind==='prompt')return 'textPromptAgent';
  if(kind==='video')return 'singleVideo';
  return 'singleImage';
}

function onWheel(e){
  e.preventDefault();
  const oldScale=state.view.scale;
  const next=Math.max(.25,Math.min(2.2,oldScale*(e.deltaY > 0 ? 0.92 : 1.08)));
  const rect=stage.getBoundingClientRect();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  const wx=(mx-state.view.tx)/oldScale,wy=(my-state.view.ty)/oldScale;
  state.view.scale=next;
  state.view.tx=mx-wx*next;
  state.view.ty=my-wy*next;
  world.style.transform=`translate(${state.view.tx}px,${state.view.ty}px) scale(${next})`;
  drawConnections(svg,state);
  saveWorkflow();
}

function screenToWorld(x,y){
  const rect=stage.getBoundingClientRect();
  return {x:(x-rect.left-state.view.tx)/state.view.scale,y:(y-rect.top-state.view.ty)/state.view.scale};
}

function quickAdd(id){
  const n=state.nodes[id];if(!n)return;
  if(n.type==='singleImage'||n.type==='singleVideo'){
    const hub=addNode('generatorHub',n.x+n.w+120,n.y+40,{});
    addConnection(n.id,n.type==='singleVideo'?'video':'image',hub.id,n.type==='singleVideo'?'sourceVideo':'source',n.type==='singleVideo'?'video':'image');
    afterConnectionChanged(n.id,hub.id);
    return;
  }
  if(n.type==='generatorHub'){
    const out=n.values.activeMode==='video'?'video':'image';
    const type=out==='video'?'singleVideo':'singleImage';
    const target=addNode(type,n.x+n.w+120,n.y,{});
    addConnection(n.id,out,target.id,out,out);
    afterConnectionChanged(n.id,target.id);
    return;
  }
  if(n.type==='textPromptAgent'||n.type==='assetDesign'){
    const target=addNode('textPromptAgent',n.x+n.w+120,n.y,{});
    addConnection(n.id,'prompt',target.id,'prompt','prompt');
    afterConnectionChanged(n.id,target.id);
    return;
  }
  const def=NODE_DEFS[n.type];
  const out=def?.outputs?.[0];
  if(out){
    const type=out.kind==='video'?'singleVideo':'singleImage';
    const target=addNode(type,n.x+n.w+120,n.y,{});
    addConnection(n.id,out.id,target.id,out.kind,out.kind);
    afterConnectionChanged(n.id,target.id);
  }
}

function onKeyDown(e){
  const editing=e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
  if(editing)return;
  if((e.key==='Delete'||e.key==='Backspace')&&state.selected){
    removeNode(state.selected);
    render();
  }
}

async function runNode(id){
  const n=state.nodes[id];if(!n)return;
  if(n.status==='running')return;
  const token=createRunToken(id);
  n.status='running';n.progress=2;n.error='';n.data={...(n.data||{}),stageLabel:'准备生成'};saveWorkflow();render();
  try{
    const inputs=getInputs(id);
    let result;
    if(n.type==='textPromptAgent')result=await runTextPromptAgent(n,inputs,state.models,{onProgress:msg=>setProgress(n,msg,token)});
    else if(n.type==='assetDesign')result=await runAssetDesign(n,inputs,state.models,{onProgress:msg=>setProgress(n,msg,token)});
    else if(n.type==='imageToPanorama')result=await runPanorama(n,inputs,state.models,{onProgress:msg=>setProgress(n,msg,token)});
    else result=await runGenerator(n,inputs,state.models,{onProgress:msg=>setProgress(n,msg,token)});
    if(!isActiveRun(id,token))return;
    n.data=result;
    n.status='success';n.progress=100;n.error='';
    propagateOutputs(id);
    saveWorkflow();render();
    toast(`${NODE_DEFS[n.type].name} 完成`,'ok');
  }catch(err){
    if(!isActiveRun(id,token))return;
    n.status='failed';n.progress=0;n.error=err.message||String(err);
    n.data={...(n.data||{}),stageLabel:'生成失败，可修改提示词后重新生成'};
    saveWorkflow();render();
    toast(n.error,'err');
  }finally{
    clearRunToken(id,token);
  }
}

function setProgress(node,message,token=null){
  if(token&&!isActiveRun(node.id,token))return;
  const current=Math.max(0,Number(node.progress||0));
  const step=current>=90?FAKE_GENERATION_SLOW_TAIL_STEP:7*FAKE_GENERATION_PROGRESS_RATE;
  node.progress=Math.min(99,Math.max(8,current+step));
  node.data={...(node.data||{}),stageLabel:message};
  saveWorkflow();
  render();
}

function propagateOutputs(fromId,seen=new Set()){
  if(seen.has(fromId))return;
  seen.add(fromId);
  const source=state.nodes[fromId];
  state.conns.filter(c=>c.from===fromId).forEach(c=>{
    const target=state.nodes[c.to];
    if(!target)return;
    const out=getOutputData(source,c.fromPort);
    if(target.type==='singleImage'&&out){
      const images=out.images||[out];
      target.values.images=images;
      target.data={...out,images,url:out.url||images[0]?.url||images[0]?.dataUrl||''};
      target.status='success';
      propagateOutputs(target.id,seen);
    }else if(target.type==='singleVideo'&&out){
      target.data=out;
      target.values.videoUrl=out.videoUrl||out.url||'';
      target.status='success';
      propagateOutputs(target.id,seen);
    }else if(target.type==='stylePreset'&&out){
      target.values.prompt=out.text||out.positive||out.prompt||'';
      target.status='success';
      propagateOutputs(target.id,seen);
    }else if(target.type==='textPromptAgent'&&out){
      target.values.inputText=out.text||out.positive||out.prompt||'';
      target.status='success';
      propagateOutputs(target.id,seen);
    }else if(target.type==='assetDesign'&&out){
      target.values.prompt=out.text||out.positive||out.prompt||'';
      target.status='success';
      propagateOutputs(target.id,seen);
    }else if(target.type==='generatorHub'&&out&&(c.toPort==='style'||c.toPort==='prompt')){
      const text=out.text||out.positive||out.prompt||'';
      target.values.modeValues=target.values.modeValues||{};
      Object.values(target.values.modeValues).forEach(v=>{if(v&&typeof v==='object')v.prompt=text;});
      target.status=target.status||'waiting';
      propagateOutputs(target.id,seen);
    }
  });
}
