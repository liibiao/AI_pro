export const WF_KEY='mjb_tapnow_workflow_v1';
export const OLD_WF_KEY='mjb_runninghub_workflow_v1';

export const PORTS={
  image:{id:'image',kind:'image',label:'图片'},
  video:{id:'video',kind:'video',label:'视频'},
  panorama:{id:'panorama',kind:'image',label:'全景图'},
  source:{id:'source',kind:'image',label:'图片参考'},
  sourceVideo:{id:'sourceVideo',kind:'video',label:'视频参考'},
  style:{id:'style',kind:'prompt',label:'风格'},
  prompt:{id:'prompt',kind:'prompt',label:'提示词'}
};

export const GENERATOR_MODES=[
  {id:'mjSmart',label:'智能MJ',short:'MJ',desc:'自然语言转 MJ-V7 英文提示词',output:'image'},
  {id:'txt2img',label:'Text Generation',short:'T',desc:'Prompt to image',output:'image'},
  {id:'img2img',label:'Image Generation',short:'I',desc:'Reference image, poster, cover',output:'image'},
  {id:'storyboard',label:'Storyboard',short:'SB',desc:'Story to production storyboard',output:'image'},
  {id:'video',label:'Video Generation',short:'V',desc:'Text / image to video',output:'video'}
];

export const NODE_DEFS={
  singleImage:{name:'图片节点',icon:'IMG',w:430,inputs:[PORTS.image],outputs:[PORTS.image]},
  singleVideo:{name:'视频节点',icon:'VID',w:520,inputs:[PORTS.video],outputs:[PORTS.video]},
  generatorHub:{name:'生成器聚合',icon:'GEN',w:760,inputs:[PORTS.source,PORTS.sourceVideo,PORTS.style],outputs:[PORTS.image,PORTS.video],executable:true},
  stylePreset:{name:'风格预设',icon:'STY',w:330,inputs:[],outputs:[PORTS.prompt]},
  imageToPanorama:{name:'360 全景图生成',icon:'360',w:380,inputs:[PORTS.image],outputs:[PORTS.panorama],executable:true},
  panoramaViewer:{name:'全景查看',icon:'PANO',w:420,inputs:[PORTS.panorama],outputs:[PORTS.panorama]}
};

export function modeDefaults(){
  return {
    txt2img:{prompt:'',modelKey:'',size:'1024x1024',aspectRatio:'1:1',resolution:'1K',background:'auto',n:'1'},
    mjSmart:{prompt:'',modelKey:'',aspectRatio:'auto',resolution:'best',background:'auto',n:'1',midjourneyParams:'',smartEnglishPrompt:'',smartFidelityCheck:'',smartWarnings:[]},
    img2img:{prompt:'',modelKey:'',size:'1024x1024',aspectRatio:'1:1',resolution:'1K',background:'auto',n:'1',strength:'0.65'},
    storyboard:{story:'',modelKey:'',size:'1536x864',aspectRatio:'16:9',resolution:'1K',background:'auto',n:'1',cutCount:'auto',layoutPreset:'standard',style:'电影写实风格，真实摄影质感，高质量影视概念设计'},
    video:{prompt:'',modelKey:'',duration:'5',resolution:'720p',aspectRatio:'16:9',refMode:'full',generateAudio:true}
  };
}

export function defaultValues(type,values={}){
  const base={
    singleImage:{images:[]},
    singleVideo:{videoUrl:'',videoDataUrl:'',name:'',duration:0,thumbnails:[]},
    generatorHub:{activeMode:'mjSmart',panelCollapsed:false,modeValues:modeDefaults()},
    stylePreset:{prompt:''},
    imageToPanorama:{size:'2048x1024',resolution:'2K',prompt:'',modelKey:''},
    panoramaViewer:{}
  }[type]||{};
  const merged={...base,...values};
  if(type==='generatorHub'){
    merged.modeValues={...modeDefaults(),...(values.modeValues||{})};
    Object.keys(modeDefaults()).forEach(mode=>{
      merged.modeValues[mode]={...modeDefaults()[mode],...(values.modeValues?.[mode]||{})};
    });
  }
  return merged;
}

export function createNodeRecord(type,x,y,values={},id='',w){
  const def=NODE_DEFS[type];
  if(!def)throw new Error(`未知节点类型：${type}`);
  return {id,type,x,y,w:w||def.w||360,values:defaultValues(type,values),status:'waiting',progress:0,error:'',data:null};
}

export function getMode(id){
  return GENERATOR_MODES.find(mode=>mode.id===id)||GENERATOR_MODES[0];
}

function oldModeValues(type,values={}){
  const modes=modeDefaults();
  if(type==='txt2img'){
    const size=values.size||modes.txt2img.size;
    modes.txt2img={...modes.txt2img,prompt:values.positive||'',modelKey:String(values._modelIdx||''),size,aspectRatio:values.aspectRatio||ratioFromSize(size)||modes.txt2img.aspectRatio,resolution:values.resolution||values.requestedResolution||modes.txt2img.resolution,background:values.background||'auto',n:String(values.n||'1')};
    return {activeMode:'txt2img',modeValues:modes};
  }
  if(type==='img2imgAll'){
    const size=values.size||modes.img2img.size;
    modes.img2img={...modes.img2img,prompt:values.i2iDraft||values.positive||'',modelKey:String(values._modelIdx||''),size,aspectRatio:values.aspectRatio||ratioFromSize(size)||modes.img2img.aspectRatio,resolution:values.resolution||values.requestedResolution||modes.img2img.resolution,background:values.background||'auto',n:String(values.n||'1')};
    return {activeMode:'img2img',modeValues:modes};
  }
  if(type==='storyboard'){
    const size=values.size||modes.storyboard.size;
    modes.storyboard={...modes.storyboard,story:values.i2iDraft||values.story||'',modelKey:String(values._modelIdx||''),size,aspectRatio:values.aspectRatio||ratioFromSize(size)||modes.storyboard.aspectRatio,resolution:values.resolution||values.requestedResolution||modes.storyboard.resolution,cutCount:values.cutCount||'auto',layoutPreset:values.layoutPreset||'standard',style:values.style||modes.storyboard.style};
    return {activeMode:'storyboard',modeValues:modes};
  }
  if(type==='seedanceVideo'){
    modes.video={...modes.video,prompt:values.vn2Draft||values.positive||'',modelKey:String(values._modelIdx||''),duration:String(values.duration||'5'),resolution:values.resolution||values.quality||'720p',aspectRatio:values.aspectRatio||'16:9',refMode:values.refMode||'full',generateAudio:values.generateAudio!==false};
    return {activeMode:'video',modeValues:modes};
  }
  return {activeMode:'',modeValues:modes};
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

export function migrateOldWorkflow(oldWorkflow){
  const supported=new Set(['singleImage','singleVideo','imagePreview','stylePreset','imageToPanorama','panoramaViewer','txt2img','img2imgAll','storyboard','seedanceVideo']);
  const typeMap={imagePreview:'singleImage',txt2img:'generatorHub',img2imgAll:'generatorHub',storyboard:'generatorHub',seedanceVideo:'generatorHub'};
  const sourceNodes=Array.isArray(oldWorkflow?.nodes)?oldWorkflow.nodes:[];
  const validIds=new Set();
  const nodes=[];
  sourceNodes.forEach(raw=>{
    if(!supported.has(raw.type))return;
    const nextType=typeMap[raw.type]||raw.type;
    const values=typeMap[raw.type]?oldModeValues(raw.type,raw.values||{}):raw.values||{};
    validIds.add(raw.id);
    nodes.push({
      id:raw.id,type:nextType,x:Number(raw.x||0),y:Number(raw.y||0),w:raw.w||NODE_DEFS[nextType]?.w||360,
      values:defaultValues(nextType,values),status:raw.status||'waiting',progress:0,error:'',data:raw.data||null
    });
  });
  const generatorIds=new Set(nodes.filter(n=>n.type==='generatorHub').map(n=>n.id));
  const conns=(Array.isArray(oldWorkflow?.conns)?oldWorkflow.conns:[]).filter(c=>validIds.has(c.from)&&validIds.has(c.to)).map(c=>{
    const next={...c};
    if(generatorIds.has(next.to)){
      if(['images','image','source'].includes(next.toPort))next.toPort='source';
      if(['style','prompt'].includes(next.toPort))next.toPort='style';
      if(['video','sourceVideo'].includes(next.toPort))next.toPort='sourceVideo';
    }
    if(generatorIds.has(next.from)){
      const fromNode=nodes.find(n=>n.id===next.from);
      next.fromPort=fromNode?.values?.activeMode==='video'?'video':'image';
      next.kind=next.fromPort==='video'?'video':'image';
    }
    return next;
  });
  return {nodes,conns,view:oldWorkflow?.view||{tx:300,ty:180,scale:1},next:oldWorkflow?.next||nodes.length+1,muted:[]};
}
