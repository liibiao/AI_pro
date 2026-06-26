import {buildPromptForMode,normalizeModelType,selectModel} from './generator-adapters.js';

const OUTPUT_DIR='runninghub_outputs/image-studio-v3';
const GENERATION_TASK_SUBMIT_TIMEOUT_MS=900000;
const GENERATION_TASK_QUERY_TIMEOUT_MS=900000;
const GENERATION_TASK_RECOVERY_MAX_MS=900000;

function generationTaskTimeoutHeaders(timeoutMs=GENERATION_TASK_QUERY_TIMEOUT_MS){
  return {'X-Upstream-Timeout-Ms':String(timeoutMs),'X-Request-Timeout-Ms':String(timeoutMs),'X-Generation-Timeout-Ms':String(timeoutMs)};
}

function generationTaskTimeoutFields(timeoutMs=GENERATION_TASK_QUERY_TIMEOUT_MS){
  return {timeoutMs,upstreamTimeoutMs:timeoutMs,requestTimeoutMs:timeoutMs,queryTimeoutMs:timeoutMs};
}

function generationTaskQueryOptions(taskId,timeoutMs=GENERATION_TASK_QUERY_TIMEOUT_MS){
  return {method:'POST',timeoutMs,headers:generationTaskTimeoutHeaders(timeoutMs),body:JSON.stringify({taskId,...generationTaskTimeoutFields(timeoutMs)})};
}

function engine(){
  if(!window.WorkbenchEngine)throw new Error('WorkbenchEngine 未加载');
  return window.WorkbenchEngine;
}

export async function loadModels(){
  const E=engine();
  if(window.CanvasAccountGate?.request){
    const data=await window.CanvasAccountGate.request('/api/models',{method:'GET'});
    const items=Array.isArray(data.items)?data.items:(Array.isArray(data.models)?data.models:[]);
    return dedupeModels(items.filter(isEnabledModelConfig).map(normalizeBackendModel)).map((m,i)=>({...m,_idx:i}));
  }
  const server=await E.loadModelsFromServer().catch(()=>[]);
  const local=E.loadLocalModels?E.loadLocalModels():[];
  const all=[...server,...local];
  return dedupeModels(all).map((m,i)=>({...m,type:normalizeModelType(m),modelType:normalizeModelType(m),_idx:i}));
}

function isEnabledModelConfig(model){
  if(!model||typeof model!=='object')return false;
  const flags=[model.enabled,model.isEnabled,model.enable,model.active,model.isActive,model.status,model.state];
  for(const flag of flags){
    if(flag===false||flag===0)return false;
    const text=String(flag??'').trim().toLowerCase();
    if(['false','0','disabled','disable','inactive','off','deleted','archived'].includes(text))return false;
  }
  return true;
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
  const type=normalizeModelType({
    ...item,
    type:item?.type||item?.modelType||item?.category||item?.modelCategory||'IMAGE',
    modelType:item?.modelType||item?.type||item?.category||item?.modelCategory||'IMAGE',
    endpointPath:item?.endpointPath||provider.endpointPath||item?.protocol?.endpointPath||'',
    adapter:item?.adapter||provider.adapter||item?.protocol?.adapter||''
  });
  const adapter=String(item?.adapter||provider.adapter||item?.protocol?.adapter||'').trim();
  const endpointPath=String(item?.endpointPath||provider.endpointPath||item?.protocol?.endpointPath||(type==='llm'?'/chat/completions':'')).trim();
  const statusEndpointPath=String(item?.statusEndpointPath||provider.statusEndpointPath||item?.protocol?.statusEndpointPath||'').trim();
  const uploadMode=String(item?.uploadMode||provider.uploadMode||item?.protocol?.uploadMode||'').trim();
  const requestMethod=String(item?.requestMethod||provider.requestMethod||item?.protocol?.method||'').trim();
  const providerKey=String(item?.providerKey||item?.channelKey||provider.providerKey||'').trim();
  const displayName=String(item?.displayName||item?.modelNick||item?.nick||item?.nickname||item?.label||item?.name||item?.model||'').trim();
  const realModel=String(item?.model||item?.realModelName||item?.upstreamModel||item?.name||'').trim();
  return forceGptImage2ProModelConfig({
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
  });
}

function gptImage2ProIdentityText(model={}){
  const provider=model?.provider||{};
  return [
    model?.id,model?.configId,model?.modelKey,model?.identityKey,model?._identityKey,
    model?.name,model?.model,model?.modelName,model?.realModelName,model?.upstreamModel,model?.defaultModel,
    model?.nick,model?.nickname,model?.modelNick,model?.displayName,model?.label,model?.ui?.label,
    model?.adapter,model?.protocol?.adapter,model?.channelKey,model?.providerKey,
    provider.providerKey,provider.name,provider.adapter,provider.defaultModel
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
}

function isGptImage2ProModel(model={}){
  const text=gptImage2ProIdentityText(model);
  const dashed=text.replace(/[\s_]+/g,'-');
  const compact=text.replace(/[\s_-]+/g,'');
  return dashed.includes('canvas-gpt-image-2-pro')
    ||dashed.includes('gpt-image-2-pro')
    ||compact.includes('canvasgptimage2pro')
    ||compact.includes('gptimage2pro');
}

function forceGptImage2ProModelConfig(model={}){
  if(!isGptImage2ProModel(model))return model;
  const configuredUploadMode=normalizeUploadModeOrEmpty(
    model.uploadMode||model.upload_mode||
    model.provider?.uploadMode||model.provider?.upload_mode||
    model.protocol?.uploadMode||model.protocol?.upload_mode||
    model.defaults?.uploadMode||model.defaults?.upload_mode||''
  );
  const protocol={...(model.protocol||{}),adapter:'openai-edits',endpointPath:'/images/edits',method:model.protocol?.method||'sync'};
  if(configuredUploadMode){
    protocol.uploadMode=configuredUploadMode;
    protocol.upload_mode=configuredUploadMode;
  }
  const provider={...(model.provider||{}),adapter:'openai-edits',endpointPath:'/images/edits'};
  if(configuredUploadMode)provider.uploadMode=configuredUploadMode;
  return {
    ...model,
    model:'gpt-image-2',
    adapter:'openai-edits',
    endpointPath:'/images/edits',
    ...(configuredUploadMode?{uploadMode:configuredUploadMode,uploadStrategy:configuredUploadMode}:{}),
    protocol,
    provider
  };
}

function modelProtocol(model){
  model=forceGptImage2ProModelConfig(model||{});
  const protocol={...(model?.protocol||{})};
  if(model?.adapter&&!protocol.adapter)protocol.adapter=model.adapter;
  if(model?.endpointPath&&!protocol.endpointPath)protocol.endpointPath=model.endpointPath;
  if(model?.uploadMode&&!protocol.uploadMode)protocol.uploadMode=model.uploadMode;
  return protocol;
}

function modelSoundField(model={}){
  const caps=model?.capabilities&&typeof model.capabilities==='object'&&!Array.isArray(model.capabilities)?model.capabilities:{};
  const supports=model?.supports&&typeof model.supports==='object'?model.supports:{};
  const protocol=modelProtocol(model);
  if(supports.generateAudio===false||caps.apiSupportsGenerateAudio===false||caps.supportsGenerateAudio===false||caps.supportsGeneratedAudio===false)return '';
  const field=protocol.soundField||caps.soundField||caps.soundControlField||protocol.generateAudioField||caps.generateAudioField||'';
  if(field&&field!==false)return String(field).trim();
  if(supports.generateAudio===true||caps.apiSupportsGenerateAudio===true||caps.supportsGenerateAudio===true||caps.supportsGeneratedAudio===true||caps.generateAudio===true)return 'generate_audio';
  return '';
}

function normalizeUploadMode(value){
  const raw=String(value||'').trim().toLowerCase();
  if([
    'cos','object_storage','object-storage','tencent_cos','tencent-cos',
    'local_cache_async_cos','local-cache-async-cos','async_cos','async-cos',
    'server_object_storage','server-object-storage','server_async_object_storage','server-async-object-storage',
    'backend_object_storage','backend-object-storage','backend_async_object_storage','backend-async-object-storage',
    'backend_cos','server_cos','124_cos','124_async_cos','124-server-cos',
    '124服务器转存cos','124异步转存cos','后台转存cos','后台异步转存cos'
  ].includes(raw))return 'object_storage';
  return 'files';
}
function normalizeUploadModeOrEmpty(value){
  const raw=String(value||'').trim();
  return raw?normalizeUploadMode(raw):'';
}

function modelPayload(model){
  model=forceGptImage2ProModelConfig(model||{});
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

function isSoraVideoProModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return normalizeModelType(model)==='video'&&(/sora[-_\s]?video[-_\s]?pro|video-pro-720p|artifex/.test(text)||String(protocol.adapter||model?.adapter||'').trim().toLowerCase()==='sora-video-pro');
}

function isSeedance2VideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  const adapter=String(protocol.adapter||model?.adapter||provider.adapter||'').trim().toLowerCase();
  return normalizeModelType(model)==='video'&&adapter!=='seedance2-vip'&&adapter!=='seedance2.0-vip'&&(adapter==='seedance2'||adapter==='seedance2.0'||((text.includes('seedance2')||text.includes('seedance 2'))&&(/video-(?:fast|pro)-(?:480p|720p)/.test(text))));
}

function isLingdongSd2VipVideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,model?.baseUrl,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath,provider.baseUrl
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return normalizeModelType(model)==='video'&&(text.includes('lingdong-sd-2-vip')||text.includes('lingdongapi.com')||/\bsd-2-vip\b/.test(text));
}

function lingdongSd2VipOrientation(value){
  const ratio=String(value||'').trim();
  if(/^1\s*:\s*1$/.test(ratio))return 'square';
  const parts=ratio.split(':').map(Number);
  if(parts.length===2&&Number.isFinite(parts[0])&&Number.isFinite(parts[1])&&parts[0]>0&&parts[1]>0)return parts[0]<parts[1]?'portrait':'landscape';
  return 'portrait';
}

function lingdongSd2VipSize(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='small'||raw==='large')return raw;
  if(raw.includes('large')||raw.includes('1080'))return 'large';
  return 'small';
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
  model=forceGptImage2ProModelConfig(model||{});
  const modelInfo=modelPayload(model);
  if(!modelInfo.channelKey)throw new Error('后台模型缺少渠道 Key，请检查模型管理配置');
  if(!modelInfo.modelId)throw new Error('后台模型缺少模型 ID，请刷新页面后重新选择模型');
  const clientRequestId=makeClientRequestId();
  const gptImage2UploadMode=normalizeUploadModeOrEmpty(
    params?.uploadMode||params?.upload_mode||params?.imageUploadMode||
    params?.modelConfigOverride?.uploadMode||params?.modelConfigOverride?.upload_mode||
    params?.modelConfig?.uploadMode||params?.modelConfig?.upload_mode||
    params?.protocol?.uploadMode||params?.protocol?.upload_mode||
    model?.uploadMode||model?.upload_mode||
    model?.provider?.uploadMode||model?.provider?.upload_mode||
    model?.protocol?.uploadMode||model?.protocol?.upload_mode||
    model?.defaults?.uploadMode||model?.defaults?.upload_mode||''
  );
  const gptImage2UploadFields=gptImage2UploadMode?{uploadMode:gptImage2UploadMode,upload_mode:gptImage2UploadMode,uploadStrategy:gptImage2UploadMode}:{};
  const protocolOverrides=isGptImage2ProModel(model)?{
    model:'gpt-image-2',
    adapter:'openai-edits',
    protocolAdapter:'openai-edits',
    endpointPath:'/images/edits',
    ...gptImage2UploadFields,
    provider:{adapter:'openai-edits',endpointPath:'/images/edits',...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    modelConfig:{model:'gpt-image-2',adapter:'openai-edits',endpointPath:'/images/edits',...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    modelConfigOverride:{model:'gpt-image-2',adapter:'openai-edits',endpointPath:'/images/edits',...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    protocol:{adapter:'openai-edits',endpointPath:'/images/edits',...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode,upload_mode:gptImage2UploadMode}:{}),method:'sync'}
  }:{};
  const taskParams=isGptImage2ProModel(model)?{
    ...(params||{}),
    model:'gpt-image-2',
    adapter:'openai-edits',
    protocolAdapter:'openai-edits',
    endpointPath:'/images/edits',
    ...(gptImage2UploadMode?{...gptImage2UploadFields,imageUploadMode:gptImage2UploadMode}:{}),
    provider:{...((params||{}).provider||{}),...protocolOverrides.provider},
    modelConfig:{...((params||{}).modelConfig||{}),...protocolOverrides.modelConfig},
    modelConfigOverride:{...((params||{}).modelConfigOverride||{}),...protocolOverrides.modelConfigOverride},
    protocol:{...((params||{}).protocol||{}),...protocolOverrides.protocol},
    modelProtocol:{...((params||{}).protocol||{}),...protocolOverrides.protocol}
  }:params;
  let data;
  try{
    data=await window.CanvasAccountGate.request('/api/generation/tasks',{
      method:'POST',
      timeoutMs:GENERATION_TASK_SUBMIT_TIMEOUT_MS,
      headers:generationTaskTimeoutHeaders(GENERATION_TASK_SUBMIT_TIMEOUT_MS),
      body:JSON.stringify({
        channelKey:modelInfo.channelKey,
        modelId:modelInfo.modelId,
        type,
        mode,
        prompt,
        inputFiles,
        params:taskParams,
        ...protocolOverrides,
        clientRequestId,
        ...generationTaskTimeoutFields(GENERATION_TASK_SUBMIT_TIMEOUT_MS)
      })
    });
  }catch(err){
    if(isTransientGenerationError(err)){
      const recovered=await recoverBackendGenerationTaskByClientRequestId(clientRequestId,{delay:2500,maxMs:GENERATION_TASK_RECOVERY_MAX_MS});
      if(!recovered){
        throw new Error(`任务提交中断：后台生成接口连接中断，且已按 clientRequestId 等待 ${Math.round(GENERATION_TASK_RECOVERY_MAX_MS/1000)} 秒仍未找到入库任务。请确认后台 API / 生成队列进程仍在运行后重试；若资产库稍后出现该任务，可直接查看结果。原始错误：${err?.message||err}`);
      }
      data={task:recovered};
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
        ? (await window.CanvasAccountGate.request(`/api/generation/tasks/${task.id}/query`,generationTaskQueryOptions(task.id))).task
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

async function recoverBackendGenerationTaskByClientRequestId(clientRequestId,{delay=1500,maxMs=45000,maxAttempts=0}={}){
  const wanted=String(clientRequestId||'').trim();
  if(!wanted)return null;
  const startedAt=Date.now();
  let attempts=0;
  for(;;){
    attempts+=1;
    try{
      const data=await window.CanvasAccountGate.request('/api/generation/tasks?limit=80',{method:'GET'});
      const items=Array.isArray(data?.items)?data.items:[];
      const task=items.find(item=>String(item?.clientRequestId||'')===wanted);
      if(task)return task;
    }catch(err){
        if(!isTransientGenerationError(err))throw err;
    }
    const elapsed=Date.now()-startedAt;
    if((maxAttempts&&attempts>=maxAttempts)||(maxMs!=null&&maxMs!==Infinity&&elapsed>=maxMs))return null;
    const remaining=maxMs==null||maxMs===Infinity?delay:Math.max(0,Math.min(delay,maxMs-elapsed));
    await new Promise(resolve=>setTimeout(resolve,remaining));
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

function imageUrl(entry,mode=''){
  if(!entry)return '';
  const uploadMode=normalizeUploadMode(mode||entry.uploadMode||'files');
  if(uploadMode==='files')return entry.uploadRef||entry.providerRef||entry.fileId||entry.id||'';
  return entry.uploadRef||entry.providerRef||entry.remoteUrl||entry.url||entry.fileId||entry.id||entry.localUrl||entry.dataUrl||'';
}

function isProviderRef(value,mode=''){
  const raw=String(value||'');
  const uploadMode=normalizeUploadMode(mode||'files');
  return uploadMode==='files'?/^file-[\w-]+$/i.test(raw):/^https?:\/\//i.test(raw);
}

function isRemoteHttpUrl(value){
  const raw=String(value||'').trim();
  if(!/^https?:\/\//i.test(raw))return false;
  try{
    const u=new URL(raw,window.location.href);
    if(['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname))return false;
    return u.origin!==window.location.origin;
  }catch(_){
    return true;
  }
}

async function fetchImageBlobForUpload(url){
  const raw=normalizeGenerationResultUrl(url);
  if(!raw)throw new Error('参考图地址为空');
  if(isRemoteHttpUrl(raw)){
    try{
      const proxyResp=await fetch('/api/workbench/image-studio/proxy-image',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({remoteUrl:raw})
      });
      const contentType=String(proxyResp.headers.get('content-type')||'').toLowerCase();
      if(proxyResp.ok&&contentType.startsWith('image/'))return await proxyResp.blob();
      const result=await proxyResp.json().catch(()=>null);
      if(proxyResp.ok&&result?.ok&&result.data){
        const E=window.WorkbenchEngine;
        if(E?.base64ToBlob)return E.base64ToBlob(result.data,result.contentType||'image/png');
      }
    }catch(err){
      console.warn('[canvas-next] proxy image download failed, fallback direct fetch',err);
    }
  }
  const resp=await fetch(raw);
  if(!resp.ok)throw new Error(`参考图下载失败：HTTP ${resp.status}`);
  return await resp.blob();
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
    const blob=await fetchImageBlobForUpload(url);
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
  model=forceGptImage2ProModelConfig(model||{});
  const protocol=modelProtocol(model);
  const uploadMode=forVideo?'object_storage':normalizeUploadMode(protocol.uploadMode||model?.uploadMode||(isGptImage2ProModel(model)?'object_storage':'files'));
  const refs=[];
  for(let i=0;i<(images||[]).length;i++){
    const entry=images[i];
    const existing=imageUrl(entry,uploadMode);
    if(isProviderRef(existing,uploadMode)){
      refs.push(existing);
      continue;
    }
    onProgress?.(`上传参考图 ${i+1}/${images.length}`);
    const file=await entryToFile(entry,i);
    const uploaded=modelHasBackendGateway(model)
      ? await uploadReferenceImageToBackend(file,uploadMode,model)
      : await E.uploadReferenceImage(file,{mode:uploadMode,baseUrl:model?.baseUrl||model?.url||'',apiKey:model?.apiKey||model?.key||''});
    const ref=uploaded.uploadRef||uploaded.providerRef||uploaded.fileId||uploaded.id||uploaded.remoteUrl||uploaded.url;
    if(!ref)throw new Error('参考图上传后未返回可用引用');
    if(!isProviderRef(ref,uploadMode)){
      throw new Error(uploadMode==='files'
        ? `参考图上传后未返回 file-xxx（实际返回：${String(ref).slice(0,120)}）`
        : `参考图上传后未返回公网 URL（实际返回：${String(ref).slice(0,120)}）`);
    }
    Object.assign(entry,{uploadRef:ref,providerRef:ref,fileId:uploaded.fileId||uploaded.id||ref,id:uploaded.id||ref,remoteUrl:uploaded.remoteUrl||uploaded.url||'',uploaded:true,uploadMode,status:'done'});
    refs.push(ref);
  }
  return refs;
}

async function uploadReferenceImageToBackend(file,uploadMode,model=null){
  if(!window.CanvasAccountGate?.request)throw new Error('后台账号网关未加载，无法上传参考图');
  model=forceGptImage2ProModelConfig(model||{});
  const payload=modelPayload(model||{});
  const mode=normalizeUploadMode(uploadMode||'files');
  const uploadFile=mode==='files'?await prepareProviderFilesUploadFile(file):file;
  const form=new FormData();
  form.append('purpose','vision');
  if(payload.modelId)form.append('modelId',payload.modelId);
  if(payload.channelKey)form.append('channelKey',payload.channelKey);
  if(isGptImage2ProModel(model)){
    form.append('model','gpt-image-2');
    form.append('adapter','openai-edits');
    form.append('endpointPath','/images/edits');
    form.append('uploadMode',mode);
  }
  form.append('file',uploadFile,uploadFile?.name||file?.name||'reference.jpg');
  const query=new URLSearchParams();
  if(payload.modelId)query.set('modelId',payload.modelId);
  if(payload.channelKey)query.set('channelKey',payload.channelKey);
  if(isGptImage2ProModel(model)){
    query.set('adapter','openai-edits');
    query.set('endpointPath','/images/edits');
    query.set('uploadMode',mode);
  }
  const endpoint=mode==='object_storage'
    ? '/api/workbench/image-studio/upload-reference'
    : `/api/workbench/image-studio/upload-provider-file${query.toString()?`?${query}`:''}`;
  return window.CanvasAccountGate.request(endpoint,{method:'POST',body:form});
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
  const usesSoraVideoPro=isSoraVideoProModel(model);
  const usesSeedance2=isSeedance2VideoModel(model);
  const usesLingdongSd2Vip=isLingdongSd2VipVideoModel(model);
  const usesArtifexVideo=usesSoraVideoPro||usesSeedance2;
  const soundField=modelSoundField(model);
  const soundFields=soundField?{
    generateAudio:values.generateAudio!==false,
    generate_audio:values.generateAudio!==false,
    soundField,
    protocol:{...modelInfo.protocol,soundField}
  }:{};
  const artifexVideoImages=imageRefs.slice(0,9);
  const artifexVideoFields=usesArtifexVideo?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||(usesSeedance2?'seedance2':'sora-video-pro'),
    protocolAdapter:modelInfo.protocol.adapter||(usesSeedance2?'seedance2':'sora-video-pro'),
    requestMethod:modelInfo.protocol.method||'async-poll',
    extra_images:artifexVideoImages,
    extraImages:artifexVideoImages,
    aspect_ratio:values.aspectRatio||'16:9'
  }:{};
  const lingdongVideoFields=usesLingdongSd2Vip?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'lingdong-sd-2-vip',
    protocolAdapter:modelInfo.protocol.adapter||'lingdong-sd-2-vip',
    requestMethod:modelInfo.protocol.method||'async-poll',
    orientation:lingdongSd2VipOrientation(values.aspectRatio||'16:9'),
    size:lingdongSd2VipSize(values.resolution||'small'),
    quality:lingdongSd2VipSize(values.resolution||'small')
  }:{};
  onProgress?.('提交视频任务');
  const backendMode=imageRefs.length?'image-to-video':'text-to-video';
  const backendPayload={
    prompt,
    videoMode:backendMode,
    refMode:values.refMode||'full',
    images:imageRefs,
    duration:usesLingdongSd2Vip?(values.duration||'15'):(values.duration||'5'),
    seconds:usesLingdongSd2Vip?(values.duration||'15'):(values.duration||'5'),
    resolution:usesLingdongSd2Vip?(values.resolution||'small'):(values.resolution||'720p'),
    quality:usesLingdongSd2Vip?(values.resolution||'small'):(values.resolution||'720p'),
    aspectRatio:values.aspectRatio||'16:9',
    outputDir:OUTPUT_DIR,
    adapter:modelInfo.protocol.adapter||'',
    protocolAdapter:modelInfo.protocol.adapter||'',
    requestMethod:modelInfo.protocol.method||'async-poll',
    ...soundFields,
    ...artifexVideoFields,
    ...lingdongVideoFields
  };
  if(modelHasBackendGateway(model)){
    const task=await submitBackendGeneration({model,type:'VIDEO',mode:backendMode,prompt,inputFiles:imageRefs,params:backendPayload,onProgress});
    return videoEntryFromTask(task,prompt,backendPayload);
  }
  const start=await E.startVideoGeneration({
    baseUrl:modelInfo.baseUrl,apiKey:modelInfo.apiKey,model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'notevideo',requestMethod:modelInfo.protocol.method||'async-poll',
    prompt,videoMode:imageRefs.length?'video-to-video':'text-to-video',refMode:values.refMode||'full',
    images:imageRefs,duration:usesLingdongSd2Vip?(values.duration||'15'):(values.duration||'5'),seconds:usesLingdongSd2Vip?(values.duration||'15'):(values.duration||'5'),
    resolution:usesLingdongSd2Vip?(values.resolution||'small'):(values.resolution||'720p'),quality:usesLingdongSd2Vip?(values.resolution||'small'):(values.resolution||'720p'),
    aspectRatio:values.aspectRatio||'16:9',outputDir:OUTPUT_DIR,
    ...soundFields,
    ...artifexVideoFields,
    ...lingdongVideoFields
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
