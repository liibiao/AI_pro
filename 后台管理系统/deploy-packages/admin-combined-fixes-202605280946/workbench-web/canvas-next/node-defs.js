export const WF_KEY='mjb_tapnow_workflow_v1';
export const OLD_WF_KEY='mjb_runninghub_workflow_v1';

export const PORTS={
  image:{id:'image',kind:'image',label:'图片'},
  video:{id:'video',kind:'video',label:'视频'},
  panorama:{id:'panorama',kind:'image',label:'全景图'},
  source:{id:'source',kind:'image',label:'图片参考'},
  sourceVideo:{id:'sourceVideo',kind:'video',label:'视频参考'},
  style:{id:'style',kind:'prompt',label:'风格'},
  prompt:{id:'prompt',kind:'prompt',label:'提示词'},
  text:{id:'text',kind:'prompt',label:'文本'}
};

export const TEXT_AGENT_MODES=[
  {id:'default',label:'默认'},
  {id:'script',label:'剧本生成'},
  {id:'reverse',label:'提示词反推'},
  {id:'parse',label:'文件解析'},
  {id:'optimize',label:'提示词AI优化'}
];

export const TEXT_AGENT_OUTPUTS=[
  {id:'text',label:'文本'},
  {id:'script',label:'剧本'},
  {id:'prompt',label:'提示词'},
  {id:'storyboard',label:'故事板输入'}
];

export const ASSET_TYPES=[
  {id:'character',label:'角色设计'},
  {id:'prop',label:'道具设计'},
  {id:'scene',label:'场景设计'}
];

export const CHARACTER_TEMPLATES=[
  {id:'character_view_1',label:'模板1',desc:'三视图 + 全身照 + 脸部特写 + 5组表情',ratios:['3:4','2:3','4:5','9:16'],fixed:false},
  {id:'character_view_2',label:'模板2',desc:'三视图 + 全身照 + 近景半身照',ratios:['4:5','3:4','2:3'],fixed:false},
  {id:'character_ref_layout',label:'模板3',desc:'参考图式白底细线分栏设定稿',ratios:['2:3 固定'],fixed:true}
];

export const PROP_TEMPLATES=[
  {id:'prop_default_sheet',label:'默认道具模板',desc:'三视图 + 局部细节 + 特写全貌'}
];

export const SCENE_STYLE_WORDLISTS=['写实电影','古风仙侠','赛博朋克','废土末世','科幻工业','中式奇幻','日漫漫画','暗黑哥特','轻奢现代','HZW 大师风格','自定义'];
export const SCENE_PRESETS=['宫殿 / 大殿','街道 / 市集','森林 / 山谷','地下城 / 遗迹','科技实验室','战场 / 废墟','房间 / 室内','宗门 / 学院','城市天际线','自定义场景'];
export const SCENE_REFERENCE_MODES=['保持空间结构','保持光影氛围','保持建筑风格','保持色彩基调','只参考局部元素','重绘为新场景'];

export const GENERATOR_MODES=[
  {id:'txt2img',label:'Text Generation',short:'T',desc:'Prompt to image',output:'image'},
  {id:'img2img',label:'Image Generation',short:'I',desc:'Reference image, poster, cover',output:'image'},
  {id:'storyboard',label:'Storyboard',short:'SB',desc:'Story to production storyboard',output:'image'},
  {id:'video',label:'Video Generation',short:'V',desc:'Text / image to video',output:'video'}
];

export const NODE_DEFS={
  singleImage:{name:'图片节点',icon:'IMG',w:430,inputs:[PORTS.image],outputs:[PORTS.image]},
  singleVideo:{name:'视频节点',icon:'VID',w:520,inputs:[PORTS.video],outputs:[PORTS.video]},
  generatorHub:{name:'生成器聚合',icon:'GEN',w:760,inputs:[PORTS.source,PORTS.sourceVideo,PORTS.style],outputs:[PORTS.image,PORTS.video],executable:true},
  textPromptAgent:{name:'文本提示词节点',icon:'TXT',w:640,inputs:[PORTS.prompt,PORTS.image,PORTS.video],outputs:[PORTS.prompt],executable:true},
  assetDesign:{name:'资产设计节点',icon:'AST',w:660,inputs:[PORTS.prompt,PORTS.image],outputs:[PORTS.prompt,PORTS.image],executable:true},
  stylePreset:{name:'风格预设',icon:'STY',w:330,inputs:[],outputs:[PORTS.prompt]},
  imageToPanorama:{name:'360 全景图生成',icon:'360',w:380,inputs:[PORTS.image],outputs:[PORTS.panorama],executable:true},
  panoramaViewer:{name:'全景查看',icon:'PANO',w:420,inputs:[PORTS.panorama],outputs:[PORTS.panorama]}
};

export function modeDefaults(){
  return {
    txt2img:{prompt:'',modelKey:'',size:'1024x1024',background:'auto',n:'1'},
    img2img:{prompt:'',modelKey:'',size:'1024x1024',background:'auto',n:'1',strength:'0.65'},
    storyboard:{story:'',modelKey:'',size:'1536x864',background:'auto',n:'1',cutCount:'auto',layoutPreset:'standard',style:'电影写实风格，真实摄影质感，高质量影视概念设计'},
    video:{prompt:'',modelKey:'',duration:'5',resolution:'720p',aspectRatio:'16:9',refMode:'full',generateAudio:true}
  };
}

export function defaultValues(type,values={}){
  const base={
    singleImage:{images:[]},
    singleVideo:{videoUrl:'',videoDataUrl:'',name:'',duration:0,thumbnails:[]},
    generatorHub:{activeMode:'',panelCollapsed:false,modeValues:modeDefaults()},
    textPromptAgent:{mode:'default',llmModelKey:'',agentPackId:'manga-writer',outputType:'text',toolbarExpanded:true,promptExpanded:true,inputText:'',outputText:'',files:[],maxFiles:5},
    assetDesign:{assetType:'character',templateId:'character_view_1',ratio:'3:4',toolbarExpanded:true,promptExpanded:false,prompt:'',outputPrompt:'',referenceFiles:[],styleWordlist:'写实电影',scenePreset:'宫殿 / 大殿',sceneReferenceMode:'保持空间结构',propType:'武器',materialStyle:'金属',designGoal:'设定稿',replaceTarget:'subject'},
    stylePreset:{prompt:''},
    imageToPanorama:{size:'2048x1024',prompt:'',modelKey:''},
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
    modes.txt2img={...modes.txt2img,prompt:values.positive||'',modelKey:String(values._modelIdx||''),size:values.size||modes.txt2img.size,background:values.background||'auto',n:String(values.n||'1')};
    return {activeMode:'txt2img',modeValues:modes};
  }
  if(type==='img2imgAll'){
    modes.img2img={...modes.img2img,prompt:values.i2iDraft||values.positive||'',modelKey:String(values._modelIdx||''),size:values.size||modes.img2img.size,background:values.background||'auto',n:String(values.n||'1')};
    return {activeMode:'img2img',modeValues:modes};
  }
  if(type==='storyboard'){
    modes.storyboard={...modes.storyboard,story:values.i2iDraft||values.story||'',modelKey:String(values._modelIdx||''),size:values.size||modes.storyboard.size,cutCount:values.cutCount||'auto',layoutPreset:values.layoutPreset||'standard',style:values.style||modes.storyboard.style};
    return {activeMode:'storyboard',modeValues:modes};
  }
  if(type==='seedanceVideo'){
    modes.video={...modes.video,prompt:values.vn2Draft||values.positive||'',modelKey:String(values._modelIdx||''),duration:String(values.duration||'5'),resolution:values.resolution||values.quality||'720p',aspectRatio:values.aspectRatio||'16:9',refMode:values.refMode||'full',generateAudio:values.generateAudio!==false};
    return {activeMode:'video',modeValues:modes};
  }
  return {activeMode:'',modeValues:modes};
}

export function migrateOldWorkflow(oldWorkflow){
  const supported=new Set(['singleImage','singleVideo','imagePreview','stylePreset','textPromptAgent','assetDesign','imageToPanorama','panoramaViewer','txt2img','img2imgAll','storyboard','seedanceVideo']);
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
