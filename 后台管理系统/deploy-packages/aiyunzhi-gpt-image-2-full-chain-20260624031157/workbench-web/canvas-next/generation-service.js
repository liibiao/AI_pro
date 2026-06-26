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
    type:item?.type||item?.modelType||item?.category||item?.modelCategory||'',
    modelType:item?.modelType||item?.type||item?.category||item?.modelCategory||'',
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
  return forceAiyunzhiGptImage2ModelConfig(forceAiyunzhiFireflyGptImageModelConfig(forceGptImage2ProModelConfig({
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
  })));
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
  if(dashed.includes('aiyunzhi-gpt-image-2')||dashed.includes('aiyunzhi-firefly-gpt-image')||dashed.includes('firefly-gpt-image')||compact.includes('aiyunzhigptimage2')||compact.includes('aiyunzhifireflygptimage')||compact.includes('fireflygptimage'))return false;
  return dashed.includes('canvas-gpt-image-2-pro')
    ||dashed.includes('gpt-image-2-pro')
    ||text.includes('gpt-image-2(pro)')
    ||compact.includes('canvasgptimage2pro')
    ||compact.includes('gptimage2pro')
    ||compact.includes('gptimage2(pro)');
}

function isGptImage2ProGenerationModel(model={}){
  if(!isGptImage2ProModel(model))return false;
  const provider=model?.provider||{};
  const text=[
    gptImage2ProIdentityText(model),
    model?.baseUrl,model?.url,model?.endpointPath,model?.endpoint_path,
    model?.protocol?.endpointPath,model?.protocol?.endpoint_path,
    provider.baseUrl,provider.url,provider.endpointPath,provider.endpoint_path,provider.defaultModel
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return text.includes('hongniaoai.com')||text.includes('hongniao')||text.includes('openai-generations')||text.includes('/images/generations')||text.includes('gpt-image-2(pro)');
}

function gptImage2ProConfiguredModelName(model={}){
  const provider=model?.provider||{};
  const direct=String(model?.model||model?.modelName||model?.realModelName||model?.upstreamModel||'').trim();
  const providerDefault=String(provider.defaultModel||'').trim();
  const selected=providerDefault&&/^gpt-image-2$/i.test(direct)?providerDefault:(direct||providerDefault||'gpt-image-2');
  return selected.replace(/-(?:1|2|3|4)k$/i,'')||'gpt-image-2';
}

function normalizeGptImage2ResolutionSuffix(value){
  const raw=String(value||'').trim().toLowerCase().replace(/\s+/g,'').replace('×','x');
  if(/^[1-4]k$/.test(raw))return raw.toUpperCase();
  const match=raw.match(/(\d{3,5})x(\d{3,5})/);
  if(match){
    const longSide=Math.max(Number(match[1]),Number(match[2]));
    if(longSide>=3500)return '4K';
    if(longSide>=2500)return '3K';
    if(longSide>=1500)return '2K';
  }
  return '1K';
}

function assembleGptImage2ProGenerationModelName(baseModel,resolution){
  const base=String(baseModel||'gpt-image-2').trim().replace(/-(?:1|2|3|4)k$/i,'')||'gpt-image-2';
  return `${base}-${normalizeGptImage2ResolutionSuffix(resolution)}`;
}

function forceGptImage2ProModelConfig(model={}){
  if(!isGptImage2ProModel(model))return model;
  const useGenerations=isGptImage2ProGenerationModel(model);
  const adapter=useGenerations?'openai-generations':'openai-edits';
  const endpointPath=useGenerations?'/v1/images/generations':'/images/edits';
  const configuredUploadMode=normalizeUploadModeOrEmpty(
    model.uploadMode||model.upload_mode||
    model.provider?.uploadMode||model.provider?.upload_mode||
    model.protocol?.uploadMode||model.protocol?.upload_mode||
    model.defaults?.uploadMode||model.defaults?.upload_mode||''
  );
  const protocol={...(model.protocol||{}),adapter,endpointPath,method:model.protocol?.method||'sync'};
  if(configuredUploadMode){
    protocol.uploadMode=configuredUploadMode;
    protocol.upload_mode=configuredUploadMode;
  }
  const provider={...(model.provider||{}),adapter,endpointPath};
  if(configuredUploadMode)provider.uploadMode=configuredUploadMode;
  return {
    ...model,
    model:useGenerations?gptImage2ProConfiguredModelName(model):'gpt-image-2',
    adapter,
    endpointPath,
    ...(configuredUploadMode?{uploadMode:configuredUploadMode,uploadStrategy:configuredUploadMode}:{}),
    protocol,
    provider
  };
}

function modelProtocol(model){
  model=forceAiyunzhiGptImage2ModelConfig(model||{});
  model=forceGptImage2ProModelConfig(model||{});
  model=forceAiyunzhiFireflyGptImageModelConfig(model||{});
  const protocol={...(model?.protocol||{})};
  if(model?.adapter&&!protocol.adapter)protocol.adapter=model.adapter;
  if(model?.endpointPath&&!protocol.endpointPath)protocol.endpointPath=model.endpointPath;
  if(model?.uploadMode&&!protocol.uploadMode)protocol.uploadMode=model.uploadMode;
  return protocol;
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
  model=forceAiyunzhiGptImage2ModelConfig(forceAiyunzhiFireflyGptImageModelConfig(forceGptImage2ProModelConfig(model||{})));
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

const FIREFLY_GPT_IMAGE_RESOLUTIONS=['1K','2K','4K'];
const FIREFLY_GPT_IMAGE_RATIOS=['16:9','1:1','21:9','2:3','3:2','3:4','4:3','4:5','5:4','9:16'];

function isAiyunzhiFireflyGptImageAdapter(adapter){
  return String(adapter||'').trim().toLowerCase()==='aiyunzhi-firefly-gpt-image';
}
function isAiyunzhiGptImage2Adapter(adapter){
  return String(adapter||'').trim().toLowerCase()==='aiyunzhi-gpt-image-2';
}

function fireflyGptImageIdentityText(model={},adapter=''){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  return [
    adapter,
    model?.id,model?.configId,model?.modelKey,model?.identityKey,model?._identityKey,
    model?.name,model?.model,model?.modelName,model?.realModelName,model?.upstreamModel,model?.defaultModel,
    model?.nick,model?.nickname,model?.modelNick,model?.displayName,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,model?.baseUrl,model?.url,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.defaultModel,provider.baseUrl
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
}

function isAiyunzhiFireflyGptImageModel(model={},adapter=''){
  const text=fireflyGptImageIdentityText(model,adapter);
  return isAiyunzhiFireflyGptImageAdapter(adapter)||
    isAiyunzhiFireflyGptImageAdapter(model?.adapter)||
    isAiyunzhiFireflyGptImageAdapter(model?.protocol?.adapter)||
    text.includes('firefly-gpt-image');
}
function isAiyunzhiGptImage2Model(model={},adapter=''){
  const text=fireflyGptImageIdentityText(model,adapter);
  return isAiyunzhiGptImage2Adapter(adapter)||
    isAiyunzhiGptImage2Adapter(model?.adapter)||
    isAiyunzhiGptImage2Adapter(model?.protocol?.adapter)||
    text.includes('aiyunzhi-gpt-image-2')||
    (text.includes('aiyunzhi')&&text.includes('gpt-image-2'));
}

function normalizeFireflyGptImageResolution(value){
  const normalized=normalizeImageResolution(value);
  return FIREFLY_GPT_IMAGE_RESOLUTIONS.includes(normalized)?normalized:'1K';
}

function normalizeFireflyGptImageRatio(value,fallback='16:9'){
  const normalized=normalizeImageAspectRatio(value,fallback);
  if(FIREFLY_GPT_IMAGE_RATIOS.includes(normalized))return normalized;
  const fallbackRatio=normalizeImageAspectRatio(fallback,'16:9');
  return FIREFLY_GPT_IMAGE_RATIOS.includes(fallbackRatio)?fallbackRatio:'16:9';
}

function assembleFireflyGptImageModelName(baseModel,resolution,aspectRatio){
  const base=String(baseModel||'firefly-gpt-image').trim().replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i,'')||'firefly-gpt-image';
  const res=normalizeFireflyGptImageResolution(resolution).toLowerCase();
  const ratio=normalizeFireflyGptImageRatio(aspectRatio,'16:9').replace(':','x');
  return `${base}-${res}-${ratio}`;
}
function shouldAssembleFireflyGptImageModelName(model={}){
  const protocol=model?.protocol&&typeof model.protocol==='object'?model.protocol:{};
  const assembly=model?.modelAssembly||model?.model_assembly||protocol.modelAssembly||protocol.model_assembly||model?.capabilities?.modelAssembly||model?.capabilities?.model_assembly||{};
  const mode=[
    model?.modelNameMode,model?.model_name_mode,model?.upstreamModelMode,model?.upstream_model_mode,
    protocol.modelNameMode,protocol.model_name_mode,protocol.upstreamModelMode,protocol.upstream_model_mode,
    model?.defaults?.modelNameMode,model?.defaults?.model_name_mode,
    assembly&&typeof assembly==='object'?(assembly.type||assembly.mode||assembly.modelNameMode||assembly.model_name_mode):assembly
  ].map(value=>String(value||'').trim().toLowerCase()).find(Boolean)||'';
  if(/^(?:literal|static|exact|raw|base|real|none|no[-_ ]?suffix|without[-_ ]?geometry)$/.test(mode))return false;
  if(/^(?:template|geometry|suffix|dynamic)$/.test(mode))return true;
  const template=String((assembly&&typeof assembly==='object'?(assembly.template||assembly.pattern||''):'')||'').toLowerCase();
  if(template.includes('{resolution}')||template.includes('{aspect')||template.includes('{imagesize}'))return true;
  const providerKey=String(model?.providerKey||model?.channelKey||model?.provider?.providerKey||model?.provider?.channelKey||'').toLowerCase();
  if(providerKey.includes('firefly-gpt-image'))return true;
  return true;
}

function forceAiyunzhiFireflyGptImageModelConfig(model={}){
  if(!isAiyunzhiFireflyGptImageModel(model))return model;
  const protocol={...(model.protocol||{}),adapter:'aiyunzhi-firefly-gpt-image',endpointPath:'/v1/chat/completions',endpoint_path:'/v1/chat/completions',method:model.protocol?.method||'sync',uploadMode:'object_storage',upload_mode:'object_storage'};
  delete protocol.imageMainModel;
  delete protocol.responsesModel;
  delete protocol.codexModel;
  return {
    ...model,
    model:'firefly-gpt-image',
    type:'image',
    modelType:'image',
    adapter:'aiyunzhi-firefly-gpt-image',
    endpointPath:'/v1/chat/completions',
    uploadMode:'object_storage',
    upload_mode:'object_storage',
    protocol,
    provider:{...(model.provider||{}),adapter:'aiyunzhi-firefly-gpt-image',endpointPath:'/v1/chat/completions',uploadMode:'object_storage'}
  };
}
function forceAiyunzhiGptImage2ModelConfig(model={}){
  if(!isAiyunzhiGptImage2Model(model))return model;
  const protocol={...(model.protocol||{}),adapter:'aiyunzhi-gpt-image-2',endpointPath:'/v1/images/generations',endpoint_path:'/v1/images/generations',editEndpointPath:'/v1/images/edits',edit_endpoint_path:'/v1/images/edits',method:model.protocol?.method||'sync',uploadMode:'object_storage',upload_mode:'object_storage',responseType:model.protocol?.responseType||'provider_url'};
  return {
    ...model,
    model:'gpt-image-2',
    type:'image',
    modelType:'image',
    adapter:'aiyunzhi-gpt-image-2',
    endpointPath:'/v1/images/generations',
    uploadMode:'object_storage',
    upload_mode:'object_storage',
    protocol,
    provider:{...(model.provider||{}),adapter:'aiyunzhi-gpt-image-2',endpointPath:'/v1/images/generations',uploadMode:'object_storage',defaultModel:'gpt-image-2'}
  };
}

function imageRequestGeometry(model,values={}){
  const fallbackSize=String(values.size||model?.defaults?.size||'1024x1024');
  const fireflyImage=isAiyunzhiFireflyGptImageModel(model);
  const aiyunzhiGptImage2=isAiyunzhiGptImage2Model(model);
  const grokImage=isGrokImageModel(model);
  const rawRatio=values.aspectRatio||values.aspect_ratio||values.requestedRatio||values.ratio||(fireflyImage?values.size:'')||model?.defaults?.aspectRatio||model?.defaults?.aspect_ratio||'';
  const aspectRatio=fireflyImage
    ? normalizeFireflyGptImageRatio(rawRatio,fallbackSize)
    : normalizeImageAspectRatio(rawRatio,fallbackSize);
  const rawImageSize=String(values.imageSize||values.image_size||'').trim();
  const explicitResolution=/^(?:1|2|3|4)\s*k$/i.test(rawImageSize)?rawImageSize:'';
  const requestedResolution=values.resolution||values.requestedResolution||explicitResolution||model?.defaults?.imageSize||model?.defaults?.image_size||model?.defaults?.resolution||'1K';
  const resolution=fireflyImage?normalizeFireflyGptImageResolution(requestedResolution):normalizeImageResolution(requestedResolution);
  const size=fireflyImage?aspectRatio:imageSizeFromRatioResolution(aspectRatio,resolution,fallbackSize);
  const finalRatio=normalizeImageAspectRatio(aspectRatio,size);
  const upstreamSize=aiyunzhiGptImage2?resolution.toLowerCase():size;
  return {
    size:upstreamSize,
    imageSize:fireflyImage||aiyunzhiGptImage2?resolution:size,
    image_size:fireflyImage||aiyunzhiGptImage2?resolution:size,
    requestedPixelSize:aiyunzhiGptImage2?'':size,
    aspectRatio:finalRatio,
    aspect_ratio:finalRatio,
    requestedRatio:finalRatio,
    resolution,
    requestedResolution:resolution
  };
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

function normalizeImageAspectRatio(value,fallbackSize=''){
  const raw=String(value||'').trim().toLowerCase().replace('×','x');
  const direct=[
    'auto','1:1','3:2','2:3','4:3','3:4','5:4','4:5',
    '16:9','9:16','2:1','1:2','21:9','9:21','3:1','1:3',
    '19.5:9','9:19.5','20:9','9:20'
  ].find(item=>item===raw);
  if(direct)return direct;
  return ratioFromImageSize(raw)||ratioFromImageSize(fallbackSize)||'1:1';
}

function normalizeImageResolution(value){
  const raw=String(value||'').trim().toUpperCase();
  if(['4K','4 K','4096','4096P','UHD'].includes(raw))return '4K';
  if(['3K','3 K','3072','3072P'].includes(raw))return '3K';
  if(['2K','2 K','2048','2048P','1440P','QHD'].includes(raw))return '2K';
  if(['1K','1 K','1024','1024P','720P','HD'].includes(raw))return '1K';
  return '1K';
}

function isGptImageV2Adapter(adapter){
  return String(adapter||'').trim().toLowerCase()==='gpt-image-v2';
}

function isGptImageV2Channel(model={},adapter=''){
  if(isGptImage2ProModel(model))return false;
  if(isAiyunzhiFireflyGptImageModel(model,adapter))return false;
  if(isGptImageV2Adapter(adapter)||isGptImageV2Adapter(model?.adapter)||isGptImageV2Adapter(model?.protocol?.adapter))return true;
  const provider=model?.provider||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.label,
    model?.channelKey,model?.providerKey,provider.providerKey,provider.name
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return /gpt[-_\s]*image[-_\s]*v[-_\s]*2|gpt[-_\s]*image[-_\s]*v2/.test(text);
}

function assembleGptImageV2ModelName(baseModel,resolution){
  const base=String(baseModel||'gpt-image-2').trim().replace(/-(?:1|2|3|4)k$/i,'')||'gpt-image-2';
  const res=String(resolution||'1K').trim().toLowerCase();
  if(/\([^)]*pro[^)]*\)|hongniao/i.test(base))return `${base}-${res.toUpperCase()}`;
  return ['2k','4k'].includes(res)?`${base}-${res}`:base;
}

function imageSizeFromRatioResolution(aspectRatio,resolution,fallbackSize){
  const ratio=normalizeImageAspectRatio(aspectRatio,fallbackSize);
  const res=normalizeImageResolution(resolution);
  const supported={
    '1K':{'auto':'auto','1:1':'1024x1024','3:2':'1152x768','2:3':'768x1152','4:3':'1024x768','3:4':'768x1024','5:4':'1280x1024','4:5':'1024x1280','16:9':'1280x720','9:16':'720x1280','2:1':'1152x576','1:2':'576x1152','21:9':'1568x672','9:21':'672x1568','3:1':'1536x512','1:3':'512x1536','19.5:9':'2219x1024','9:19.5':'1024x2219','20:9':'2276x1024','9:20':'1024x2276'},
    '2K':{'auto':'auto','1:1':'2048x2048','3:2':'1920x1280','2:3':'1280x1920','4:3':'2048x1536','3:4':'1536x2048','5:4':'1920x1536','4:5':'1536x1920','16:9':'2048x1152','9:16':'1152x2048','2:1':'2048x1024','1:2':'1024x2048','21:9':'2240x960','9:21':'960x2240','3:1':'2560x853','1:3':'853x2560','19.5:9':'4437x2048','9:19.5':'2048x4437','20:9':'4551x2048','9:20':'2048x4551'},
    '3K':{'auto':'auto','1:1':'2560x2560','3:2':'2880x1920','2:3':'1920x2880','4:3':'2560x1920','3:4':'1920x2560','5:4':'2560x2048','4:5':'2048x2560','16:9':'3072x1728','9:16':'1728x3072','2:1':'3072x1536','1:2':'1536x3072','21:9':'3136x1344','9:21':'1344x3136'},
    '4K':{'auto':'auto','1:1':'2880x2880','3:2':'3456x2304','2:3':'2304x3456','4:3':'3200x2400','3:4':'2400x3200','5:4':'3200x2560','4:5':'2560x3200','16:9':'3840x2160','9:16':'2160x3840','2:1':'3840x1920','1:2':'1920x3840','21:9':'3808x1632','9:21':'1632x3808','3:1':'3840x1280','1:3':'1280x3840'}
  };
  return supported[res]?.[ratio]||supported['1K'][ratio]||normalizeSupportedGrokImageSize(fallbackSize);
}

function normalizeSupportedGrokImageSize(value){
  const raw=String(value||'').trim().toLowerCase().replace('×','x');
  if([
    'auto','1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','21:9','9:21','3:1','1:3','19.5:9','9:19.5','20:9','9:20',
    '1024x1024','2048x2048','1792x1024','1024x1792','1536x1024','1024x1536','1280x720','720x1280','2048x1152','1152x2048','2240x960','960x2240','3840x2160','2160x3840'
  ].includes(raw))return raw;
  return imageSizeFromRatioResolution(ratioFromImageSize(raw)||'1:1','1K','1024x1024');
}

function ratioFromImageSize(value){
  const raw=String(value||'').trim().toLowerCase().replace('×','x');
  const match=raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if(!match)return '';
  const width=Number(match[1]||0);
  const height=Number(match[2]||0);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return '';
  const ratio=width/height;
  const candidates=[['3:1',3],['21:9',21/9],['20:9',20/9],['19.5:9',19.5/9],['2:1',2],['16:9',16/9],['3:2',3/2],['4:3',4/3],['5:4',5/4],['1:1',1],['4:5',4/5],['3:4',3/4],['2:3',2/3],['9:16',9/16],['1:2',1/2],['9:19.5',9/19.5],['9:20',9/20],['9:21',9/21],['1:3',1/3]];
  return candidates.reduce((best,item)=>Math.abs(item[1]-ratio)<Math.abs(best[1]-ratio)?item:best,candidates[0])[0];
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

const GROK_VIDEO_ASPECT_RATIOS=['1:1','16:9','9:16','4:3','3:4','3:2','2:3'];
const GROK_VIDEO_RESOLUTIONS=['480p','720p'];
const GROK_VIDEO_DURATIONS=Array.from({length:15},(_,i)=>String(i+1));

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

function isSoraVideoProModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  const adapter=String(protocol.adapter||model?.adapter||provider.adapter||'').trim().toLowerCase();
  return normalizeModelType(model)==='video'&&(adapter==='sora-video-pro'||/sora[-_\s]?video[-_\s]?pro/.test(text));
}

function isFullbloodVideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  const adapter=String(protocol.adapter||model?.adapter||provider.adapter||'').trim().toLowerCase();
  return normalizeModelType(model)==='video'&&(adapter==='fullblood-video'||text.includes('fullblood-video')||text.includes('canvas_fullblood-video')||text.includes('fullblood-seedance-2')||text.includes('fullblood-omni-video-2'));
}

function isSeedanceFullVideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  const adapter=String(protocol.adapter||model?.adapter||provider.adapter||'').trim().toLowerCase();
  return normalizeModelType(model)==='video'&&(adapter==='seedance-full'||text.includes('seedance-full')||text.includes('sz-seedance2'));
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
  if(isFullbloodVideoModel(model))return false;
  if(isSeedanceFullVideoModel(model))return false;
  return normalizeModelType(model)==='video'&&adapter!=='seedance2-vip'&&adapter!=='seedance2.0-vip'&&(adapter==='seedance2'||adapter==='seedance2.0'||((text.includes('seedance2')||text.includes('seedance 2'))&&(/video-(?:fast|pro)-(?:480p|720p)/.test(text))));
}

function isSeedance2SdVideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  const adapter=String(protocol.adapter||model?.adapter||provider.adapter||'').trim().toLowerCase();
  if(adapter==='sd2-internal'||text.includes('sd2-internal')||text.includes('canvas_sd2-internal'))return false;
  return normalizeModelType(model)==='video'&&(adapter==='seedance2-sd'||adapter==='canvas-sd2'||adapter==='sd2'||text.includes('canvas-sd2')||/\bsd2\b/.test(text));
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

function isZaomengSeedance2VideoModel(model={}){
  const provider=model?.provider||{};
  const protocol=model?.protocol||{};
  const text=[
    model?.id,model?.configId,model?.modelKey,model?.name,model?.model,model?.displayName,model?.modelNick,model?.label,model?.ui?.label,
    model?.adapter,model?.providerKey,model?.channelKey,model?.baseUrl,
    protocol.adapter,protocol.endpointPath,
    provider.providerKey,provider.name,provider.adapter,provider.endpointPath,provider.baseUrl
  ].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean).join(' ');
  return normalizeModelType(model)==='video'&&(text.includes('zaomeng-seedance2')||text.includes('seedance-2.0-svip')||text.includes('seedance-2.0-fast')||text.includes('winter-cell-1964.as522254919.workers.dev')||text.includes('造梦'));
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

function modelCapabilities(model={}){
  return model?.capabilities&&typeof model.capabilities==='object'&&!Array.isArray(model.capabilities)?model.capabilities:{};
}

function modelSoundField(model={}){
  const caps=modelCapabilities(model);
  const supports=model?.supports&&typeof model.supports==='object'?model.supports:{};
  const protocol=modelProtocol(model);
  if(supports.generateAudio===false||caps.apiSupportsGenerateAudio===false||caps.supportsGenerateAudio===false||caps.supportsGeneratedAudio===false)return '';
  const field=protocol.soundField||caps.soundField||caps.soundControlField||protocol.generateAudioField||caps.generateAudioField||'';
  if(field&&field!==false)return String(field).trim();
  const inferred=inferSd2VideoSoundField(model);
  if(inferred)return inferred;
  if(supports.generateAudio===true||caps.apiSupportsGenerateAudio===true||caps.supportsGenerateAudio===true||caps.supportsGeneratedAudio===true||caps.generateAudio===true)return 'generate_audio';
  return '';
}

function inferSd2VideoSoundField(model={}){
  const protocol=modelProtocol(model);
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

function videoResolutionAlias(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='large')return '1080p';
  if(raw==='small')return '720p';
  return raw;
}

function normalizeVideoRequestValues(model,values={}){
  const caps=modelCapabilities(model);
  const grok=isGrokVideoModel(model);
  const aspectRatios=capabilityList(caps.aspectRatios||caps.aspect_ratios||caps.ratios,grok?GROK_VIDEO_ASPECT_RATIOS:['16:9','9:16','1:1','4:3','3:4']);
  const resolutions=capabilityList(caps.resolutions,grok?GROK_VIDEO_RESOLUTIONS:['720p']);
  const durations=capabilityList(caps.durations||caps.videoDurations||caps.video_durations||caps.allowedDurations||caps.allowed_durations||caps.durationOptions||caps.duration_options,grok?GROK_VIDEO_DURATIONS:['5','10','15']).map(String);
  const aspectRatio=aspectRatios.includes(values.aspectRatio)?values.aspectRatio:(aspectRatios.includes('16:9')?'16:9':aspectRatios[0]||'16:9');
  const requestedResolution=videoResolutionAlias(values.resolution);
  const resolution=resolutions.includes(requestedResolution)?requestedResolution:(resolutions[0]||'720p');
  const duration=durations.includes(String(values.duration||''))?String(values.duration):(durations.includes('6')?'6':durations[0]||'5');
  return {aspectRatio,resolution,duration};
}

function assembleVideoRequestModelName(model={},baseModel='',normalizedVideo={}){
  const base=String(baseModel||model?.model||model?.name||'').trim();
  const resolution=String(normalizedVideo.resolution||'720p').trim().toLowerCase()||'720p';
  const duration=String(normalizedVideo.duration||'').trim();
  const aspectRatio=String(normalizedVideo.aspectRatio||'16:9').trim();
  const assembly=model?.modelAssembly&&typeof model.modelAssembly==='object'?model.modelAssembly:{};
  if(assembly.type==='template'&&assembly.template){
    return String(assembly.template)
      .replaceAll('{baseModel}',base)
      .replaceAll('{model}',base)
      .replaceAll('{resolution}',resolution)
      .replaceAll('{duration}',duration)
      .replaceAll('{aspectRatio}',aspectRatio);
  }
  if(/^video-(?:fast|pro)$/i.test(base)&&['480p','720p','1080p'].includes(resolution))return `${base}-${resolution}`.toLowerCase();
  if(/^video-(?:fast|pro)-(?:480p|720p|1080p)$/i.test(base)&&['480p','720p','1080p'].includes(resolution)){
    return base.replace(/-(?:480p|720p|1080p)$/i,`-${resolution}`).toLowerCase();
  }
  return base;
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
  model=forceAiyunzhiGptImage2ModelConfig(forceAiyunzhiFireflyGptImageModelConfig(forceGptImage2ProModelConfig(model||{})));
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
  const gptImage2UseGenerations=isGptImage2ProGenerationModel(model);
  const gptImage2Adapter=gptImage2UseGenerations?'openai-generations':'openai-edits';
  const gptImage2EndpointPath=gptImage2UseGenerations?'/v1/images/generations':'/images/edits';
  const gptImage2BaseModel=gptImage2UseGenerations?gptImage2ProConfiguredModelName(model):'gpt-image-2';
  const gptImage2RequestModel=gptImage2UseGenerations
    ? assembleGptImage2ProGenerationModelName(gptImage2BaseModel,params?.resolution||params?.requestedResolution||params?.imageSize||params?.requestedPixelSize||params?.size)
    : 'gpt-image-2';
  const protocolOverrides=isGptImage2ProModel(model)?{
    model:gptImage2RequestModel,
    adapter:gptImage2Adapter,
    protocolAdapter:gptImage2Adapter,
    endpointPath:gptImage2EndpointPath,
    ...gptImage2UploadFields,
    provider:{adapter:gptImage2Adapter,endpointPath:gptImage2EndpointPath,defaultModel:gptImage2BaseModel,...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    modelConfig:{model:gptImage2RequestModel,adapter:gptImage2Adapter,endpointPath:gptImage2EndpointPath,...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    modelConfigOverride:{model:gptImage2RequestModel,adapter:gptImage2Adapter,endpointPath:gptImage2EndpointPath,...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode}:{})},
    protocol:{adapter:gptImage2Adapter,endpointPath:gptImage2EndpointPath,...(gptImage2UploadMode?{uploadMode:gptImage2UploadMode,upload_mode:gptImage2UploadMode}:{}),method:'sync'}
  }:{};
  const taskParams=isGptImage2ProModel(model)?{
    ...(params||{}),
    model:gptImage2RequestModel,
    adapter:gptImage2Adapter,
    protocolAdapter:gptImage2Adapter,
    endpointPath:gptImage2EndpointPath,
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
      const localPollOnly=!!task?._pollLocalOnly||isMidjourneyLocalPollOnlyTask(task);
      const shouldQueryUpstream=!!task?.upstreamTaskId&&!localPollOnly;
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

function parseTaskJson(value,fallback={}){
  if(value&&typeof value==='object')return value;
  if(typeof value==='string'){
    try{return JSON.parse(value)||fallback;}catch(_){}
  }
  return fallback;
}

function isMidjourneyLocalPollOnlyTask(task){
  const params=parseTaskJson(task?.paramsJson||task?.params,{})||{};
  const result=parseTaskJson(task?.resultJson||task?.result,{})||{};
  const saved=task?.saved||result?.saved||{};
  const adapterHay=[
    params.adapter,params.protocolAdapter,params.protocol?.adapter,params.modelConfig?.adapter,params.modelConfigOverride?.adapter,
    task?.adapter,task?.providerKey,task?.channelKey,task?.provider?.adapter,saved.adapter
  ].map(value=>String(value||'')).join(' ').toLowerCase();
  const kindHay=[
    params.mjTaskKind,params.taskKind,params.taskType,params.mode,params.actionCode,params.customId,params.custom_id,
    task?.mode,task?.taskType,task?.actionCode,task?.mjActionCode,saved.mjTaskKind,saved.actionCode
  ].map(value=>String(value||'')).join(' ').toLowerCase();
  return /midjourney|mj[-_\s]*imagine/.test(`${adapterHay} ${kindHay}`)&&/midjourney[-_\s]*(action|modal)|\b(action|modal)\b/.test(kindHay);
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
    _pollLocalOnly:!task?.upstreamTaskId||isMidjourneyLocalPollOnlyTask(task),
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

function requestFormDataWithProgress(endpoint,form,{onProgress,timeoutMs=240000}={}){
  if(typeof XMLHttpRequest!=='function')return window.CanvasAccountGate.request(endpoint,{method:'POST',body:form});
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    let settled=false;
    const finish=(fn,value)=>{
      if(settled)return;
      settled=true;
      fn(value);
    };
    xhr.open('POST',endpoint,true);
    xhr.timeout=timeoutMs;
    xhr.upload.onprogress=evt=>{
      const total=Number(evt?.total||0)||0;
      const loaded=Number(evt?.loaded||0)||0;
      const percent=total>0?Math.max(0,Math.min(100,Math.round(loaded/total*100))):0;
      if(percent>=100)onProgress?.({phase:'confirming',percent:99,loaded,total});
      else onProgress?.({phase:'uploading',percent,loaded,total});
    };
    xhr.onload=()=>{
      let data={};
      try{data=JSON.parse(xhr.responseText||'{}');}
      catch(_){finish(reject,new Error('参考图上传返回了无效 JSON'));return;}
      if(xhr.status<200||xhr.status>=300||data?.ok===false){
        finish(reject,new Error(data?.error||data?.message||data?.msg||`HTTP ${xhr.status}`));
        return;
      }
      onProgress?.({phase:'done',percent:100});
      finish(resolve,data);
    };
    xhr.onerror=()=>finish(reject,new Error('上传参考图失败，网络连接中断'));
    xhr.onabort=()=>finish(reject,new Error('上传参考图已取消'));
    xhr.ontimeout=()=>finish(reject,new Error('上传参考图超时，请检查上传服务'));
    xhr.send(form);
  });
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
  model=forceAiyunzhiGptImage2ModelConfig(forceAiyunzhiFireflyGptImageModelConfig(forceGptImage2ProModelConfig(model||{})));
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
    onProgress?.({label:`上传参考图 ${i+1}/${images.length}`,percent:Math.max(8,Math.round(i/Math.max(1,images.length)*82))});
    const file=await entryToFile(entry,i);
    const uploaded=modelHasBackendGateway(model)
      ? await uploadReferenceImageToBackend(file,uploadMode,model,{onProgress:evt=>{
          const raw=Number(evt?.percent||0);
          const base=i/Math.max(1,images.length)*82;
          const span=82/Math.max(1,images.length);
          const phase=String(evt?.phase||'');
          const label=phase==='confirming'||raw>=99
            ? `确认参考图 ${i+1}/${images.length}`
            : `上传参考图 ${i+1}/${images.length}`;
          onProgress?.({label,percent:Math.max(8,Math.min(92,Math.round(8+base+span*(phase==='confirming'?0.92:raw/100))))});
        }})
      : await E.uploadReferenceImage(file,{mode:uploadMode,baseUrl:model?.baseUrl||model?.url||'',apiKey:model?.apiKey||model?.key||'',onProgress:evt=>{
          const raw=Number(evt?.percent||0);
          const base=i/Math.max(1,images.length)*82;
          const span=82/Math.max(1,images.length);
          const phase=String(evt?.phase||'');
          const label=phase==='confirming'||raw>=99
            ? `确认参考图 ${i+1}/${images.length}`
            : `上传参考图 ${i+1}/${images.length}`;
          onProgress?.({label,percent:Math.max(8,Math.min(92,Math.round(8+base+span*(phase==='confirming'?0.92:raw/100))))});
        }});
    const ref=uploaded.uploadRef||uploaded.providerRef||uploaded.fileId||uploaded.id||uploaded.remoteUrl||uploaded.url;
    if(!ref)throw new Error('参考图上传后未返回可用引用');
    if(!isProviderRef(ref,uploadMode)){
      throw new Error(uploadMode==='files'
        ? `参考图上传后未返回 file-xxx（实际返回：${String(ref).slice(0,120)}）`
        : `参考图上传后未返回公网 URL（实际返回：${String(ref).slice(0,120)}）`);
    }
    Object.assign(entry,{uploadRef:ref,providerRef:ref,fileId:uploaded.fileId||uploaded.id||ref,id:uploaded.id||ref,remoteUrl:uploaded.remoteUrl||uploaded.url||'',uploaded:true,uploadMode,status:'done'});
    refs.push(ref);
    onProgress?.({label:`参考图已就绪 ${i+1}/${images.length}`,percent:Math.max(12,Math.min(94,Math.round(((i+1)/Math.max(1,images.length))*88)))});
  }
  return refs;
}

async function uploadReferenceImageToBackend(file,uploadMode,model=null,{onProgress}={}){
  if(!window.CanvasAccountGate?.request)throw new Error('后台账号网关未加载，无法上传参考图');
  model=forceAiyunzhiGptImage2ModelConfig(forceAiyunzhiFireflyGptImageModelConfig(forceGptImage2ProModelConfig(model||{})));
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
  return requestFormDataWithProgress(endpoint,form,{onProgress});
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
  const resolution=String(node.values.resolution||'2K').toUpperCase();
  const requestModel=isGptImageV2Channel(model,modelInfo.protocol?.adapter)
    ? assembleGptImageV2ModelName(modelInfo.model,resolution)
    : modelInfo.model;
  if(modelHasBackendGateway(model)){
    const payload={mode:'panorama',prompt,size:node.values.size||'2048x1024',resolution,model:requestModel,image:refs,images:refs,outputDir:OUTPUT_DIR};
    const task=await submitBackendGeneration({model,type:'IMAGE',mode:'panorama',prompt,inputFiles:refs,params:payload,onProgress});
    return imageEntryFromTask(task,prompt,payload,{isPanorama:true});
  }
  const data=await E.generateImageStandalone({
    action:'panorama',mode:'panorama',...modelInfo,prompt,
    model:requestModel,size:node.values.size||'2048x1024',resolution,image:refs,images:refs,background:'auto',outputDir:OUTPUT_DIR
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
  const styleText=inputs.style?.positive||inputs.style?.text||'';
  const smart=mode==='mjSmart'
    ? await prepareSmartMidjourneyPrompt(values,model,styleText,{onProgress})
    : null;
  const prompt=smart?.prompt||buildPromptForMode(mode,values,styleText);
  if(!prompt)throw new Error('缺少提示词');
  const refs=mode==='txt2img'?[]:await ensureUploadedImages(inputs.images||[],model,{onProgress});
  if((mode==='img2img'||mode==='storyboard')&&!refs.length)throw new Error('当前模式需要至少一张参考图');
  const modelInfo=modelPayload(model);
  if(!modelHasBackendGateway(model)&&(!modelInfo.baseUrl||!modelInfo.model))throw new Error('模型配置缺少 API 地址或模型名');
  const action=refs.length?'img2img':'txt2img';
  const geometry=imageRequestGeometry(model,values);
  const fireflyImage=isAiyunzhiFireflyGptImageModel(model,modelInfo.protocol?.adapter);
  const requestModel=fireflyImage
    ? (shouldAssembleFireflyGptImageModelName(modelInfo)
      ? assembleFireflyGptImageModelName(modelInfo.model,geometry.resolution,geometry.aspectRatio)
      : String(modelInfo.model||modelInfo.name||'firefly-gpt-image').trim().replace(/-(?:1|2|4)k-[0-9]+x[0-9]+(?:-(?:1|2|4)k)*$/i,'')||'firefly-gpt-image')
    : (isGptImageV2Channel(model,modelInfo.protocol?.adapter)
      ? assembleGptImageV2ModelName(modelInfo.model,geometry.resolution)
      : modelInfo.model);
  onProgress?.('提交生图任务');
  const payload={
    action,mode:action,...modelInfo,
    model:requestModel,
    prompt,
    ...geometry,
    background:values.background||'auto',
    n:values.n||'1',
    ...(smart?.params?{mjParams:smart.params,midjourneyParams:smart.params,midjourney_params:smart.params}:{}),
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

async function prepareSmartMidjourneyPrompt(values,model,styleText='',{onProgress}={}){
  const naturalPrompt=String(values.prompt||'').trim();
  if(!naturalPrompt)throw new Error('请先输入自然语言画面描述');
  onProgress?.('智能优化 MJ 提示词');
  const payload={
    prompt:naturalPrompt,
    styleText:String(styleText||'').trim(),
    imageModel:modelPayload(model),
    imageModelLabel:model?.displayName||model?.label||model?.name||model?.model||'',
    requestedAspectRatio:values.aspectRatio||'auto',
    requestedQualityProfile:'high',
    targetModel:'v7'
  };
  const data=await requestSmartMidjourneyPrompt(payload);
  const result=data?.result||data||{};
  const prompt=String(result.prompt||result.englishPrompt||'').trim();
  if(!prompt)throw new Error('智能模式未返回可用英文提示词');
  const params=String(result.params||result.midjourneyParams||'').trim();
  values.smartEnglishPrompt=prompt;
  values.midjourneyParams=params;
  values.aspectRatio=String(result.aspectRatio||values.aspectRatio||'auto');
  values.smartFidelityCheck=String(result.fidelityCheck||'');
  values.smartWarnings=Array.isArray(result.warnings)?result.warnings:[];
  return {prompt,params,aspectRatio:values.aspectRatio};
}

async function requestSmartMidjourneyPrompt(payload){
  const endpoint='/api/workbench/image-studio/smart-midjourney-prompt';
  if(window.CanvasAccountGate?.request){
    return window.CanvasAccountGate.request(endpoint,{
      method:'POST',
      timeoutMs:180000,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
  }
  const resp=await fetch(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const data=await resp.json().catch(()=>null);
  if(!resp.ok||!data?.ok)throw new Error(data?.error||`智能提示词接口失败：HTTP ${resp.status}`);
  return data;
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
  const normalizedVideo=normalizeVideoRequestValues(model,values);
  const usesFullbloodVideo=isFullbloodVideoModel(model);
  const usesSeedanceFull=isSeedanceFullVideoModel(model);
  const usesSoraVideoPro=isSoraVideoProModel(model);
  const usesSeedance2=!usesFullbloodVideo&&!usesSeedanceFull&&isSeedance2VideoModel(model);
  const usesSeedance2Sd=isSeedance2SdVideoModel(model);
  const usesLingdongSd2Vip=isLingdongSd2VipVideoModel(model);
  const usesZaomengSeedance2=isZaomengSeedance2VideoModel(model);
  const usesArtifexVideo=(usesSoraVideoPro||usesSeedance2)&&!usesSeedance2Sd&&!usesFullbloodVideo&&!usesSeedanceFull;
  const artifexRequestModel=usesArtifexVideo?assembleVideoRequestModelName(model,modelInfo.model,normalizedVideo):modelInfo.model;
  const soundField=modelSoundField(model);
  const soundFields=soundField?{
    generateAudio:values.generateAudio!==false,
    generate_audio:values.generateAudio!==false,
    soundField,
    protocol:{...modelInfo.protocol,soundField}
  }:{};
  const artifexVideoImages=imageRefs.slice(0,9);
  const artifexVideoFields=usesArtifexVideo?{
    model:artifexRequestModel,
    adapter:modelInfo.protocol.adapter||(usesSeedance2?'seedance2':'sora-video-pro'),
    protocolAdapter:modelInfo.protocol.adapter||(usesSeedance2?'seedance2':'sora-video-pro'),
    requestMethod:modelInfo.protocol.method||'async-poll',
    images:artifexVideoImages,
    reference_image_urls:artifexVideoImages,
    referenceImageUrls:artifexVideoImages,
    referenceImages:artifexVideoImages,
    reference_images:artifexVideoImages,
    extra_images:artifexVideoImages,
    extraImages:artifexVideoImages,
    aspect_ratio:normalizedVideo.aspectRatio
  }:{};
  const fullbloodVideoFields=usesFullbloodVideo?{
    model:modelInfo.model,
    adapter:'fullblood-video',
    protocolAdapter:'fullblood-video',
    requestMethod:modelInfo.protocol.method||'async-poll',
    images:imageRefs.slice(0,9),
    aspect_ratio:normalizedVideo.aspectRatio
  }:{};
  const seedanceFullImages=imageRefs.slice(0,9);
  const seedanceFullFields=usesSeedanceFull?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'seedance-full',
    protocolAdapter:modelInfo.protocol.adapter||'seedance-full',
    requestMethod:modelInfo.protocol.method||'async-poll',
    images:seedanceFullImages,
    image_url:seedanceFullImages[0]||'',
    reference_image_urls:seedanceFullImages,
    referenceImageUrls:seedanceFullImages,
    referenceImages:seedanceFullImages,
    reference_images:seedanceFullImages,
    aspect_ratio:normalizedVideo.aspectRatio
  }:{};
  const seedance2SdImages=imageRefs.slice(0,9);
  const seedance2SdFields=usesSeedance2Sd?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'seedance2-sd',
    protocolAdapter:modelInfo.protocol.adapter||'seedance2-sd',
    requestMethod:modelInfo.protocol.method||'async-poll',
    images:seedance2SdImages,
    reference_image_urls:seedance2SdImages,
    referenceImages:seedance2SdImages,
    reference_images:seedance2SdImages,
    aspect_ratio:normalizedVideo.aspectRatio,
    enableSound:false
  }:{};
  const lingdongVideoFields=usesLingdongSd2Vip?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'lingdong-sd-2-vip',
    protocolAdapter:modelInfo.protocol.adapter||'lingdong-sd-2-vip',
    requestMethod:modelInfo.protocol.method||'async-poll',
    orientation:lingdongSd2VipOrientation(normalizedVideo.aspectRatio),
    size:lingdongSd2VipSize(normalizedVideo.resolution),
    quality:lingdongSd2VipSize(normalizedVideo.resolution)
  }:{};
  const zaomengVideoFields=usesZaomengSeedance2?{
    model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'zaomeng-seedance2',
    protocolAdapter:modelInfo.protocol.adapter||'zaomeng-seedance2',
    requestMethod:modelInfo.protocol.method||'async-poll',
    aspect_ratio:normalizedVideo.aspectRatio,
    files:imageRefs.slice(0,9),
    images:imageRefs.slice(0,9),
    reference_image_urls:imageRefs.slice(0,9)
  }:{};
  onProgress?.('提交视频任务');
  const backendMode=imageRefs.length>1?'reference-to-video':(imageRefs.length?'image-to-video':'text-to-video');
  const backendPayload={
    prompt,
    videoMode:backendMode,
    refMode:values.refMode||'full',
    images:imageRefs,
    duration:normalizedVideo.duration,
    seconds:normalizedVideo.duration,
    resolution:normalizedVideo.resolution,
    quality:normalizedVideo.resolution,
    aspectRatio:normalizedVideo.aspectRatio,
    outputDir:OUTPUT_DIR,
    adapter:modelInfo.protocol.adapter||'',
    protocolAdapter:modelInfo.protocol.adapter||'',
    requestMethod:modelInfo.protocol.method||'async-poll',
    ...soundFields,
    ...fullbloodVideoFields,
    ...seedanceFullFields,
    ...artifexVideoFields,
    ...seedance2SdFields,
    ...lingdongVideoFields,
    ...zaomengVideoFields
  };
  if(modelHasBackendGateway(model)){
    const task=await submitBackendGeneration({model,type:'VIDEO',mode:backendMode,prompt,inputFiles:imageRefs,params:backendPayload,onProgress});
    return videoEntryFromTask(task,prompt,backendPayload);
  }
  const start=await E.startVideoGeneration({
    baseUrl:modelInfo.baseUrl,apiKey:modelInfo.apiKey,model:modelInfo.model,
    adapter:modelInfo.protocol.adapter||'notevideo',requestMethod:modelInfo.protocol.method||'async-poll',
    prompt,videoMode:backendMode,refMode:values.refMode||'full',
    images:imageRefs,duration:normalizedVideo.duration,seconds:normalizedVideo.duration,
    resolution:normalizedVideo.resolution,quality:normalizedVideo.resolution,
    aspectRatio:normalizedVideo.aspectRatio,outputDir:OUTPUT_DIR,
    ...soundFields,
    ...seedanceFullFields,
    ...artifexVideoFields,
    ...seedance2SdFields,
    ...lingdongVideoFields,
    ...zaomengVideoFields
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
  return {url,videoUrl:url,contentUrl:url,taskId,status:'completed',progress:100,prompt,saved:status.saved||{},aspectRatio:normalizedVideo.aspectRatio};
}
