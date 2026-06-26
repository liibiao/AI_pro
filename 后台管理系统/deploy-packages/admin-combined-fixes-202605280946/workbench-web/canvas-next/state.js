import {NODE_DEFS,WF_KEY,OLD_WF_KEY,createNodeRecord,defaultValues,migrateOldWorkflow} from './node-defs.js';

export const state={
  nodes:{},
  conns:[],
  next:1,
  view:{tx:320,ty:180,scale:1},
  selected:null,
  models:[],
  drag:null,
  pan:null,
  connect:null,
  tempPoint:null
};

export function makeId(){
  while(state.nodes[`n${state.next}`])state.next++;
  return `n${state.next++}`;
}

export function addNode(type,x,y,values={},id=''){
  const nid=id||makeId();
  const node=createNodeRecord(type,x,y,values,nid);
  state.nodes[nid]=node;
  if(!id)saveWorkflow();
  return node;
}

export function removeNode(id){
  delete state.nodes[id];
  state.conns=state.conns.filter(c=>c.from!==id&&c.to!==id);
  if(state.selected===id)state.selected=null;
  saveWorkflow();
}

export function setSelected(id){
  state.selected=id&&state.nodes[id]?id:null;
}

export function addConnection(from,fromPort,to,toPort,kind){
  if(!state.nodes[from]||!state.nodes[to]||from===to)return false;
  const sourceDef=NODE_DEFS[state.nodes[from].type];
  const targetDef=NODE_DEFS[state.nodes[to].type];
  const output=sourceDef?.outputs?.find(p=>p.id===fromPort);
  const input=targetDef?.inputs?.find(p=>p.id===toPort);
  if(!output||!input)return false;
  const connKind=kind||output.kind||input.kind;
  if(input.kind!==connKind&&!(input.kind==='image'&&connKind==='image'))return false;
  if(input.kind!=='image'){
    state.conns=state.conns.filter(c=>!(c.to===to&&c.toPort===toPort));
  }else{
    const existingForInput=state.conns.filter(c=>c.to===to&&c.toPort===toPort);
    if(existingForInput.length>=10){
      const first=existingForInput[0];
      state.conns=state.conns.filter(c=>c!==first);
    }
  }
  if(state.conns.some(c=>c.from===from&&c.fromPort===fromPort&&c.to===to&&c.toPort===toPort))return false;
  state.conns.push({from,fromPort,to,toPort,kind:connKind});
  saveWorkflow();
  return true;
}

export function getInputs(id){
  const inputs={images:[],videos:[],style:null,prompt:null,text:''};
  state.conns.filter(c=>c.to===id).forEach(c=>{
    const src=state.nodes[c.from];
    if(!src)return;
    const out=getOutputData(src,c.fromPort);
    if(c.toPort==='style')inputs.style=out;
    else if(c.toPort==='prompt'||c.toPort==='text'){
      inputs.prompt=out;
      inputs.text=[inputs.text,out?.text||out?.positive||out?.prompt||''].filter(Boolean).join('\n\n');
    }else if(c.toPort==='source'||c.toPort==='image'||c.toPort==='panorama'){
      if(Array.isArray(out?.images))inputs.images.push(...out.images);
      else if(out)inputs.images.push(out);
    }else if(c.toPort==='sourceVideo'||c.toPort==='video'){
      if(out)inputs.videos.push(out);
    }
  });
  return inputs;
}

export function getOutputData(node,port){
  if(!node)return null;
  if(node.type==='stylePreset')return {text:node.values.prompt||'',positive:node.values.prompt||''};
  if(node.type==='textPromptAgent'){
    const text=node.data?.text||node.values.outputText||node.values.inputText||'';
    return {text,prompt:text,positive:text,outputType:node.values.outputType||'text'};
  }
  if(node.type==='assetDesign'){
    if(port==='image'&&node.data?.image)return node.data.image;
    const text=node.data?.prompt||node.values.outputPrompt||node.values.prompt||'';
    return {text,prompt:text,positive:text,images:node.data?.images||[]};
  }
  if(node.type==='singleImage'||node.type==='panoramaViewer'){
    return node.data||{images:node.values.images||[],url:node.values.images?.[0]?.url||node.values.images?.[0]?.dataUrl||''};
  }
  if(node.type==='singleVideo')return node.data||{videoUrl:node.values.videoUrl||node.values.videoDataUrl||'',url:node.values.videoUrl||node.values.videoDataUrl||''};
  if(node.type==='imageToPanorama')return node.data;
  if(node.type==='generatorHub'){
    if(port==='video')return node.values.activeMode==='video'?node.data:null;
    return node.values.activeMode!=='video'?node.data:null;
  }
  return node.data;
}

export function serializeWorkflow(){
  return {
    nodes:Object.values(state.nodes).map(n=>({id:n.id,type:n.type,x:n.x,y:n.y,w:n.w,values:n.values,status:n.status,data:n.data})),
    conns:state.conns,
    view:state.view,
    next:state.next
  };
}

export function saveWorkflow(){
  try{localStorage.setItem(WF_KEY,JSON.stringify(serializeWorkflow()));}catch(_){}
}

export function loadWorkflow(){
  const raw=localStorage.getItem(WF_KEY);
  if(raw){
    try{
      loadData(JSON.parse(raw));
      return 'loaded';
    }catch(_){
      localStorage.removeItem(WF_KEY);
    }
  }
  const oldRaw=localStorage.getItem(OLD_WF_KEY);
  if(oldRaw){
    try{
      const migrated=migrateOldWorkflow(JSON.parse(oldRaw));
      loadData(migrated);
      saveWorkflow();
      return 'migrated';
    }catch(_){}
  }
  loadData(createDemoWorkflow());
  saveWorkflow();
  return 'demo';
}

export function importOldWorkflow(){
  const raw=localStorage.getItem(OLD_WF_KEY);
  if(!raw)throw new Error('没有找到旧版工作流');
  const migrated=migrateOldWorkflow(JSON.parse(raw));
  loadData(migrated);
  saveWorkflow();
}

export function loadData(wf){
  state.nodes={};
  state.conns=[];
  state.next=Number(wf?.next||1);
  const validIds=new Set();
  (wf?.nodes||[]).forEach(raw=>{
    if(!NODE_DEFS[raw.type])return;
    validIds.add(raw.id);
    const numeric=Number(String(raw.id||'').replace(/^n/,''));
    if(Number.isFinite(numeric))state.next=Math.max(state.next,numeric+1);
    state.nodes[raw.id]={id:raw.id,type:raw.type,x:Number(raw.x||0),y:Number(raw.y||0),w:raw.w||NODE_DEFS[raw.type].w,values:defaultValues(raw.type,raw.values||{}),status:raw.status||'waiting',progress:Number(raw.progress||0),error:raw.error||'',data:raw.data||null};
  });
  state.conns=(wf?.conns||[]).filter(c=>validIds.has(c.from)&&validIds.has(c.to));
  state.view=wf?.view||{tx:320,ty:180,scale:1};
}

export function resetWorkflow(){
  loadData(createDemoWorkflow());
  saveWorkflow();
}

function createDemoWorkflow(){
  const image=createNodeRecord('singleImage',-220,-40,{images:[]},'n1');
  const hub=createNodeRecord('generatorHub',220,30,{activeMode:'img2img'},'n2');
  return {
    nodes:[image,hub],
    conns:[{from:'n1',fromPort:'image',to:'n2',toPort:'source',kind:'image'}],
    view:{tx:420,ty:240,scale:1},
    next:3
  };
}
