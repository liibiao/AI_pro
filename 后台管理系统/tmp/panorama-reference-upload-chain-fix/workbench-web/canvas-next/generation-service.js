import {buildPromptForMode,normalizeModelType,selectModel} from './generator-adapters.js';

const OUTPUT_DIR='runninghub_outputs/image-studio-v3';

function engine(){
  if(!window.WorkbenchEngine)throw new Error('WorkbenchEngine 未加载');
  return window.WorkbenchEngine;
}

export async function loadModels(){
  const E=engine();
  if(window.CanvasAccountGate?.request){
    const data=await window.CanvasAccountGate.request('/api/models',{method:'GET'});
    const items=Array.isArray(data.items)?data.items:(Array.isArray(data.models)?data.models:[]);
    return dedupeModels(items.map(normalizeBackendModel)).map((m,i)=>({...m,_idx:i}));
  }
  const server=await E.loadModelsFromServer().catch(()=>[]);
  const local=E.loadLocalModels?E.loadLocalModels():[];
  const all=[...server,...local];
  return dedupeModels(all).map((m,i)=>({...m,type:normalizeModelType(m),modelType:normalizeModelType(m),_idx:i}));
}

function dedupeModels(models){
  const seen=new Set();
  return (Array.isArray(models)?models:[]).filter(m=>{
    const key=[m.id,m.configId,m.modelKey,m._identityKey,m.identityKey,m.model,m.name,m.url,m.baseUrl].filter(Boolean).join('|');
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

function normalizeBackendModel(item){
  const provider=item?.provider||{};
  const type=String(item?.type||'IMAGE').trim().toLowerCase();
  const adapter=String(item?.adapter||provider.adapter||item?.protocol?.adapter||'').trim();
  const endpointPath=String(item?.endpointPath||provider.endpointPath||item?.protocol?.endpointPath||'').trim();
  const statusEndpointPath=String(item?.statusEndpointPath||provider.statusEndpointPath||item?.protocol?.statusEndpointPath||'').trim();
  const uploadMode=String(item?.uploadMode||provider.uploadMode||item?.protocol?.uploadMode||'').trim();
  const requestMethod=String(item?.requestMethod||provider.requestMethod||item?.protocol?.method||'').trim();
  const providerKey=String(item?.providerKey||item?.channelKey||provider.providerKey||'').trim();
  const displayName=String(item?.displayName||item?.nick||item?.label||item?.name||'').trim();
  const realModel=String(item?.name||item?.model||'').trim();
  return {
    ...item,
    id:item.id,
    configId:item.id,
    modelKey:item.id,
    name:displayName||realModel,
    displayName:displayName||realModel,
    nick:displayName||realModel,
    model:realModel,
    type,
    modelType:type,
    providerKey,
    channelKey:providerKey,
    provider,
    adapter,
    endpointPath,
    statusEndpointPath,
    uploadMode,
    requestMethod,
    url:item?.url||item?.baseUrl||provider.baseUrl||'',
    baseUrl:item?.baseUrl||item?.url||provider.baseUrl||'',
    apiKey:'',
    key:'',
    protocol:{
      ...(item?.protocol||{}),
      adapter,
      endpointPath,
      uploadMode,
      method:requestMethod,
      statusEndpointPath
    },
    supports:item?.supports||{},
    defaults:item?.defaults||{},
    capabilities:item?.capabilities||{},
    ui:item?.ui||{}
  };
}

function modelProtocol(model){
  const protocol={...(model?.protocol||{})};
  if(model?.adapter&&!protocol.adapter)protocol.adapter=model.adapter;
  if(model?.endpointPath&&!protocol.endpointPath)protocol.endpointPath=model.endpointPath;
  if(model?.uploadMode&&!protocol.uploadMode)protocol.uploadMode=model.uploadMode;
  return protocol;
}

function modelPayload(model){
  return {
    id:model?.id||model?.configId||model?.modelKey||'',
    modelId:model?.id||model?.configId||model?.modelKey||'',
    channelKey:model?.channelKey||model?.providerKey||model?.provider?.providerKey||'',
    providerKey:model?.providerKey||model?.channelKey||model?.provider?.providerKey||'',
    type:normalizeModelType(model),
    baseUrl:model?.baseUrl||model?.url||model?.apiBase||'',
    apiKey:model?.apiKey||model?.key||model?.token||'',
    model:model?.model||model?.name||'',
    protocol:modelProtocol(model)
  };
}

function modelHasBackendGateway(model){
  const payload=modelPayload(model||{});
  return !!(payload.channelKey&&payload.modelId);
}

function makeClientRequestId(){
  if(window.crypto?.randomUUID)return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
}

function taskStatus(task){
  return String(task?.status||'').toUpperCase();
}

function taskResultUrls(task){
  const urls=[];
  const push=value=>{
    const raw=normalizeGenerationResultUrl(value);
    if(raw&&!urls.includes(raw))urls.push(raw);
  };
  const visit=value=>{
    if(!value)return;
    if(typeof value==='string'){
      if(/^https?:\/\//i.test(value)||/^\/api\//i.test(value)||/^\/v1\//i.test(value)||/^file:/i.test(value))push(value);
      return;
    }
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(typeof value==='object'){
      Object.entries(value).forEach(([key,item])=>{
        if(/url|uri|output|image|video|result/i.test(key)||typeof item==='object')visit(item);
      });
    }
  };
  visit(task?.resultUrlsJson);
  visit(task?.resultUrls);
  visit(task?.resultJson);
  visit(task?.responseJson);
  return urls;
}

function normalizeGenerationResultUrl(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const localMatch=raw.match(/^https?:\/\/(?:127\.0\.0\.1|localhost):4000(\/api\/generation\/results\/[^?#\s]+(?:[?#]\S*)?)$/i);
  if(localMatch)return localMatch[1];
  try{
    const u=new URL(raw,window.location.href);
    if((u.hostname==='127.0.0.1'||u.hostname==='localhost')&&u.pathname.startsWith('/api/generation/results/')){
      return u.pathname+u.search+u.hash;
    }
  }catch(_){}
  return raw;
}

async function submitBackendGeneration({model,type,mode,prompt,inputFiles=[],params={},onProgress}){
  if(!window.CanvasAccountGate?.request)throw new Error('后台生成网关未加载');
  const modelInfo=modelPayload(model);
  if(!modelInfo.channelKey)throw new Error('后台模型缺少渠道 Key，请检查模型管理配置');
  if(!modelInfo.modelId)throw new Error('后台模型缺少模型 ID，请刷新页面后重新选择模型');
  const clientRequestId=makeClientRequestId();
  let data;
  try{
    data=await window.CanvasAccountGate.request('/api/generation/tasks',{
      method:'POST',
      body:JSON.stringify({
        channelKey:modelInfo.channelKey,
        modelId:modelInfo.modelId,
        type,
        mode,
        prompt,
        inputFiles,
        params,
        clientRequestId
      })
    });
  }catch(err){
    if(isTransientGenerationError(err)){
      data={task:await recoverBackendGenerationTaskByClientRequestId(clientRequestId)};
    }else{
      throw err;
    }
  }
  let task=data.task||data;
  for(;;){
    const status=taskStatus(task);
    if(status==='SUCCESS')return task;
    if(['FAILED','REFUNDED','CANCELLED','TIMEOUT','MANUAL_REVIEW'].includes(status)){
      throw new Error(task.errorMessage||task.error||'生成任务失败');
    }
    onProgress?.(`生成中 ${Math.round(Number(task.progress||0))}%`);
    await new Promise(resolve=>setTimeout(resolve,1800));
    try{
      const shouldQueryUpstream=!!task?.upstreamTaskId&&!task?._pollLocalOnly;
      const next=shouldQueryUpstream
        ? (await window.CanvasAccountGate.request(`/api/generation/tasks/${task.id}/query`,{method:'POST'})).task
        : (await window.CanvasAccountGate.request(`/api/generation/tasks/${encodeURIComponent(task.id)}`,{method:'GET'})).task;
      task=next;
    }catch(err){
      if(isTransientGenerationError(err))continue;
      throw err;
    }
  }
}

function transientGenerationTaskMessage(task){
  return String(task?.errorMessage||task?.error||task?.errorCode||task?._transientErrorMessage||'');
}

function isTransientGenerationTaskFailure(task){
  const msg=transientGenerationTaskMessage(task);
  return !!task?.id&&isTransientGenerationMessage(msg);
}

function isTransientGenerationError(err){
  return isTransientGenerationMessage(String(err?.message||err||''));
}

function isTransientGenerationMessage(msg){
  return /stream disconnected before completion|HTTP\s*502|internal_server_error|server_error|bad gateway|gateway timeout|upstream|timeout|timed out|failed to fetch|network|502|503|504|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset|premature close/i.test(String(msg||''));
}

async function recoverBackendGenerationTaskByClientRequestId(clientRequestId){
  const wanted=String(clientRequestId||'').trim();
  if(!wanted)return null;
  for(;;){
    try{
      const data=await window.CanvasAccountGate.request('/api/generation/tasks?limit=80',{method:'GET'});
      const items=Array.isArray(data?.items)?data.items:[];
      const task=items.find(item=>String(item?.clientRequestId||'')===wanted);
      if(task)return task;
    }catch(err){
      if(!isTransientGenerationError(err))throw err;
    }
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
}

function normalizeTransientGenerationTask(task){
  return {
    ...(task||{}),
    status:'RUNNING',
    progress:Math.max(1,Number(task?.progress||1)),
    _submitTransientFailure:true,
    _pollLocalOnly:!task?.upstreamTaskId,
    _transientErrorMessage:transientGenerationTaskMessage(task)
  };
}

function imageEntryFromTask(task,prompt,payload,{isPanorama=false}={}){
  const url=taskResultUrls(task)[0]||'';
  if(!url)throw new Error('后台任务成功，但没有返回图片 URL');
  const saved={url,remoteUrl:url,imageTaskId:task.id,taskId:task.id,status:task.status};
  const entry={url,dataUrl:url,localUrl:'',remoteUrl:url,saved,prompt,payload,width:0,height:0,isPanorama,images:[]};
  entry.images=[entry];
  return entry;
}

function videoEntryFromTask(task,prompt,payload){
  const url=taskResultUrls(task)[0]||'';
  if(!url)throw new Error('后台任务成功，但没有返回视频 URL');
  return {url,videoUrl:url,contentUrl:url,taskId:task.id,status:'completed',progress:100,prompt,payload,saved:{url,remoteUrl:url,taskId:task.id},aspectRatio:payload.aspectRatio||'16:9'};
}

function imageUrl(entry){
  if(!entry)return '';
  return entry.uploadRef||entry.providerRef||entry.fileId||entry.id||entry.remoteUrl||entry.url||entry.localUrl||entry.dataUrl||'';
}

function isProviderRef(value){
  const raw=String(value||'');
  return /^file-[\w-]+$/i.test(raw)||/^https?:\/\//i.test(raw)||/^\/api\/generation\/results\//i.test(raw);
}

function normalizeProviderRef(value){
  const raw=String(value||'').trim();
  if(/^\/api\/generation\/results\//i.test(raw)&&/^https?:$/i.test(location.protocol)){
    try{return new URL(raw,location.origin).toString();}catch(_){}
  }
  return raw;
}

async function entryToFile(entry,index){
  const E=engine();
  if(entry.file instanceof File||entry.file instanceof Blob)return entry.file;
  if(entry.dataUrl){
    const blob=E.dataUrlToBlob(entry.dataUrl);
    return new File([blob],entry.name||`reference-${index+1}.png`,{type:blob.type||'image/png'});
  }
  const url=entry.localUrl||entry.url;
  if(url){
    const resp=await fetch(url);
    const blob=await resp.blob();
    return new File([blob],entry.name||`reference-${index+1}.png`,{type:blob.type||'image/png'});
  }
  throw new Error('参考图缺少可上传的图片内容');
}

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function imageBlobSize(blob){
  if(!blob||!window.createImageBitmap)return null;
  try{
    const bitmap=await createImageBitmap(blob);
    const size={width:bitmap.width,height:bitmap.height};
    bitmap.close?.();
    return size;
  }catch(_){
    return null;
  }
}

async function prepareProviderFilesUploadFile(file){
  const E=engine();
  if(!(file instanceof Blob))return file;
  const type=String(file.type||'').toLowerCase();
  if(!type.startsWith('image/')||type==='image/gif')return file;
  const maxBytes=2.8*1024*1024;
  const size=await imageBlobSize(file);
  const maxSide=Math.max(Number(size?.width||0),Number(size?.height||0));
  if(file.size<=maxBytes&&maxSide&&maxSide<=2048)return file;
  try{
    const dataUrl=await blobToDataUrl(file);
    const steps=[
      {maxSide:2048,maxBytes,quality:.84,minQuality:.52,minSide:1024},
      {maxSide:1792,maxBytes:2.2*1024*1024,quality:.80,minQuality:.46,minSide:896},
      {maxSide:1536,maxBytes:1.7*1024*1024,quality:.76,minQuality:.40,minSide:768}
    ];
    for(const step of steps){
      const out=E.compressImageDataUrl
        ? await E.compressImageDataUrl(dataUrl,{...step,outputType:'image/jpeg'})
        : dataUrl;
      const blob=await fetch(out).then(r=>r.blob());
      if(blob.size<=step.maxBytes){
        const name=String(file.name||'reference.png').replace(/\.(png|jpe?g|webp|bmp|gif)$/i,'')+'-upload.jpg';
        return new File([blob],name,{type:'image/jpeg'});
      }
    }
  }catch(err){
    console.warn('[canvas-next] provider files upload compression failed, using original file',err);
  }
  return file;
}

export async function ensureUploadedImages(images,model,{forVideo=false,onProgress}={}){
  const E=engine();
  const protocol=modelProtocol(model);
  const uploadMode=forVideo?'object_storage':(protocol.uploadMode||model?.uploadMode||'files');
  const refs=[];
  for(let i=0;i<(images||[]).length;i++){
    const entry=images[i];
    const existing=imageUrl(entry);
    if(isProviderRef(existing)){
      const ref=normalizeProviderRef(existing);
      refs.push(ref);
      Object.assign(entry,{uploadRef:ref,providerRef:ref,fileId:ref,id:ref,remoteUrl:ref,uploaded:true,uploadMode:/^file-[\w-]+$/i.test(ref)?'files':'object_storage',status:'done'});
      continue;
    }
    onProgress?.(`上传参考图 ${i+1}/${images.length}`);
    const file=await entryToFile(entry,i);
    const uploaded=modelHasBackendGateway(model)
      ? await uploadReferenceImageToBackend(file,uploadMode,model)
      : await E.uploadReferenceImage(file,{mode:uploadMode,baseUrl:model?.baseUrl||model?.url||'',apiKey:model?.apiKey||model?.key||''});
    const ref=uploaded.uploadRef||uploaded.providerRef||uploaded.fileId||uploaded.id||uploaded.remoteUrl||uploaded.url;
    if(!ref)throw new Error('参考图上传后未返回可用引用');
    Object.assign(entry,{uploadRef:ref,providerRef:ref,fileId:uploaded.fileId||uploaded.id||ref,id:uploaded.id||ref,remoteUrl:uploaded.remoteUrl||uploaded.url||'',uploaded:true,uploadMode,status:'done'});
    refs.push(ref);
  }
  return refs;
}

async function uploadReferenceImageToBackend(file,uploadMode,model=null){
  if(!window.CanvasAccountGate?.request)throw new Error('后台账号网关未加载，无法上传参考图');
  const payload=modelPayload(model||{});
  const mode=String(uploadMode||'files').toLowerCase()==='object_storage'?'object_storage':'files';
  if(mode==='object_storage')return uploadReferenceImageToObjectStorageDirect(file);
  const uploadFile=mode==='files'?await prepareProviderFilesUploadFile(file):file;
  const form=new FormData();
  form.append('purpose','vision');
  if(payload.modelId)form.append('modelId',payload.modelId);
  if(payload.channelKey)form.append('channelKey',payload.channelKey);
  form.append('file',uploadFile,uploadFile?.name||file?.name||'reference.jpg');
  const query=new URLSearchParams();
  if(payload.modelId)query.set('modelId',payload.modelId);
  if(payload.channelKey)query.set('channelKey',payload.channelKey);
  const endpoint=mode==='object_storage'
    ? '/api/workbench/image-studio/upload-reference'
    : `/api/workbench/image-studio/upload-provider-file${query.toString()?`?${query}`:''}`;
  return window.CanvasAccountGate.request(endpoint,{method:'POST',body:form});
}

async function uploadReferenceImageToObjectStorageDirect(file){
  if(!window.CanvasAccountGate?.request)throw new Error('后台账号网关未加载，无法获取 COS 直传凭证');
  const target=await window.CanvasAccountGate.request('/api/workbench/image-studio/object-storage-upload-target',{
    method:'POST',
    body:JSON.stringify({filename:file?.name||'reference.png',contentType:file?.type||'application/octet-stream',size:file?.size||0})
  });
  const uploadUrl=String(target.uploadUrl||'');
  const publicUrl=String(target.publicUrl||target.remoteUrl||target.url||'');
  if(!uploadUrl||!publicUrl)throw new Error('COS 直传凭证缺少上传地址或公网地址');
  await new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('PUT',uploadUrl,true);
    Object.entries(target.headers||{}).forEach(([key,value])=>{
      if(/^content-length$/i.test(key))return;
      try{xhr.setRequestHeader(key,String(value));}catch(_){}
    });
    xhr.onload=()=>{xhr.status>=200&&xhr.status<300?resolve():reject(new Error('COS 直传失败 HTTP '+xhr.status));};
    xhr.onerror=()=>reject(new Error('COS 直传网络失败，请检查 COS CORS 或网络连接'));
    xhr.ontimeout=()=>reject(new Error('COS 直传超时'));
    xhr.timeout=180000;
    xhr.send(file);
  });
  return {...target,id:publicUrl,fileId:publicUrl,uploadRef:publicUrl,providerRef:publicUrl,remoteUrl:publicUrl,url:publicUrl,uploaded:true,uploadMode:'object_storage',directUpload:true};
}

export async function runGenerator(node,inputs,models,{onProgress}={}){
  const mode=node.values.activeMode||'txt2img';
  const values=node.values.modeValues?.[mode]||{};
  if(mode==='video')return runVideo(node,inputs,models,{onProgress});
  return runImage(node,inputs,models,{onProgress});
}

export async function runPanorama(node,inputs,models,{onProgress}={}){
  const E=engine();
  const model=selectModel(models,'img2img',{modelKey:node.values.modelKey||''});
  if(!model)throw new Error('没有可用生图模型');
  if(!inputs.images?.length)throw new Error('360 全景图生成需要输入图片');
  const refs=await ensureUploadedImages(inputs.images.slice(0,1),model,{onProgress});
  const modelInfo=modelPayload(model);
  const prompt=node.values.prompt||[
    '全景图任务：使用输入图片作为中心视角、空间风格和光影参考，生成单张可环绕查看的无缝 equirectangular panorama texture。',
    '输出必须是单张完整连续的 2:1 宽高比全景贴图，左右边缘必须无缝闭合，保留参考图核心场景身份、主光方向、色温、材质和氛围。',
    '不要文字、水印、边框、分割线、中央接缝、左右硬切、曝光断层、透视突变、重复建筑或拼接痕迹。'
  ].join('\n');
  onProgress?.('提交全景图任务');
  if(modelHasBackendGateway(model)){
    const payload={mode:'panorama',prompt,size:node.values.size||'2048x1024',image:refs,images:refs,outputDir:OUTPUT_DIR};
    const task=await submitBackendGeneration({model,type:'IMAGE',mode:'panorama',prompt,inputFiles:refs,params:payload,onProgress});
    return imageEntryFromTask(task,prompt,payload,{isPanorama:true});
  }
  const data=await E.generateImageStandalone({
    action:'panorama',mode:'panorama',...modelInfo,prompt,
    size:node.values.size||'2048x1024',image:refs,images:refs,background:'auto',outputDir:OUTPUT_DIR
  });
  const saved=data?.result?.saved||{};
  const url=E.resolvePreviewUrl(saved)||saved.url||saved.remoteUrl||'';
  return {url,dataUrl:url,localUrl:saved.localUrl||url,remoteUrl:saved.remoteUrl||'',saved,prompt,isPanorama:true,images:[{url,dataUrl:url,localUrl:saved.localUrl||url,saved,isPanorama:true}]};
}

async function runImage(node,inputs,models,{onProgress}={}){
  const E=engine();
  const mode=node.values.activeMode||'txt2img';
  const values=node.values.modeValues?.[mode]||{};
  const model=selectModel(models,mode,values);
  if(!model)throw new Error('没有可用生图模型');
  const prompt=buildPromptForMode(mode,values,inputs.style?.positive||inputs.style?.text||'');
  if(!prompt)throw new Error('缺少提示词');
  const refs=mode==='txt2img'?[]:await ensureUploadedImages(inputs.images||[],model,{onProgress});
  if((mode==='img2img'||mode==='storyboard')&&!refs.length)throw new Error('当前模式需要至少一张参考图');
  const modelInfo=modelPayload(model);
  if(!modelHasBackendGateway(model)&&(!modelInfo.baseUrl||!modelInfo.model))throw new Error('模型配置缺少 API 地址或模型名');
  const action=refs.length?'img2img':'txt2img';
  onProgress?.('提交生图任务');
  const payload={
    action,mode:action,...modelInfo,
    prompt,
    size:values.size||'1024x1024',
    background:values.background||'auto',
    n:values.n||'1',
    outputDir:OUTPUT_DIR,
    image:refs,
    images:refs
  };
  if(modelHasBackendGateway(model)){
    const task=await submitBackendGeneration({model,type:'IMAGE',mode:action,prompt,inputFiles:refs,params:payload,onProgress});
    return imageEntryFromTask(task,prompt,payload);
  }
  const data=await E.generateImageStandalone(payload);
  const saved=data?.result?.saved||{};
  const url=E.resolvePreviewUrl(saved)||saved.url||saved.remoteUrl||'';
  const entry={url,dataUrl:url,localUrl:saved.localUrl||url,remoteUrl:saved.remoteUrl||'',saved,prompt,payload,width:saved.width||0,height:saved.height||0,images:[]};
  entry.images=[entry];
  return entry;
}

async function runVideo(node,inputs,models,{onProgress}={}){
  const E=engine();
  const values=node.values.modeValues?.video||{};
  const model=selectModel(models,'video',values);
  if(!model)throw new Error('没有可用视频模型');
  const prompt=buildPromptForMode('video',values,inputs.style?.positive||inputs.style?.text||'');
  if(!prompt)throw new Error('缺少视频提示词');
  const imageRefs=await ensureUploadedImages(inputs.images||[],model,{forVideo:true,onProgress});
  const modelInfo=modelPayload(model);
  onProgress?.('提交视频任务');
  const backendMode=imageRefs.length?'image-to-video':'text-to-video';
  const backendPayload={
    prompt,
    videoMode:backendMode,
    refMode:values.refMode||'full',
    images:imageRefs,
    duration:values.duration||'5',
    seconds:values.duration||'5',
    resolution:values.resolution||'720p',
    quality:values.resolution||'720p',
    aspectRatio:values.aspectRatio||'16:9',
    generateAudio:values.generateAudio!==false,
    outputDir:OUTPUT_DIR
  };
  if(modelHasBackendGateway(model)){
    const task=await submitBackendGeneration({model,type:'VIDEO',mode:backendMode,prompt,inputFiles:imageRefs,params:backendPayload,onProgress});
    return videoEntryFromTask(task,prompt,backendPayload);
  }
  const start=await E.startVideoGeneration({
    baseUrl:modelInfo.baseUrl,apiKey:modelInfo.apiKey,model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'notevideo',requestMethod:modelInfo.protocol.method||'async-poll',
    prompt,videoMode:imageRefs.length?'video-to-video':'text-to-video',refMode:values.refMode||'full',
    images:imageRefs,duration:values.duration||'5',seconds:values.duration||'5',
    resolution:values.resolution||'720p',quality:values.resolution||'720p',
    aspectRatio:values.aspectRatio||'16:9',generateAudio:values.generateAudio!==false,outputDir:OUTPUT_DIR
  });
  const taskId=start.taskId||start.providerTaskId;
  if(!taskId)throw new Error('视频接口未返回 taskId');
  let status=start;
  for(let i=0;i<120;i++){
    const normalized=String(status.status||'').toLowerCase();
    if(['completed','succeeded','success'].includes(normalized))break;
    if(['failed','error','cancelled','canceled'].includes(normalized))throw new Error(status.error||'视频生成失败');
    onProgress?.(`视频生成中 ${Math.round(Number(status.progress||0))}%`);
    await new Promise(r=>setTimeout(r,1800));
    status=await E.getVideoGenerationStatus(taskId);
  }
  const url=status.localUrl||status.contentUrl||status.downloadUrl||status.saved?.localUrl||status.saved?.url||E.getVideoContentUrl(taskId);
  return {url,videoUrl:url,contentUrl:url,taskId,status:'completed',progress:100,prompt,saved:status.saved||{},aspectRatio:values.aspectRatio||'16:9'};
}
