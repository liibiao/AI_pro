from pathlib import Path
root=Path('/Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/admin-combined-fixes-202605280946')
html=root/'workbench-web/image-studio-canvas-next.html'
s=html.read_text()
old=""".vn2-prompt-input .vn2-chip.vn2-chip-img.vn2-ref-token:not(:has(img)):before{content:\"图\";display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.10);color:rgba(230,238,255,.76);font-size:11px;font-weight:900}"""
new=old+"""
.vn2-prompt-input .vn2-chip.vn2-ref-token-media{display:inline-grid!important;grid-template-columns:24px auto!important;align-items:center!important;gap:6px!important;width:auto!important;min-width:0!important;max-width:132px!important;height:34px!important;min-height:34px!important;max-height:34px!important;margin:0 4px!important;padding:3px 8px 3px 4px!important;border-radius:12px!important;vertical-align:middle!important;overflow:hidden!important;background:rgba(96,165,250,.18)!important;border:1px solid rgba(147,197,253,.34)!important;box-shadow:none!important;transform:none!important;white-space:nowrap!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-thumb{display:grid!important;place-items:center!important;position:relative!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;max-width:24px!important;max-height:24px!important;border-radius:8px!important;overflow:hidden!important;background:rgba(255,255,255,.10)!important;border:0!important;margin:0!important;padding:0!important;box-shadow:none!important;transform:none!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-thumb img,.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-thumb video,.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-thumb canvas{display:block!important;position:absolute!important;inset:0!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;max-width:24px!important;max-height:24px!important;object-fit:cover!important;object-position:center!important;border-radius:8px!important;border:0!important;pointer-events:none!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-icon{position:relative!important;z-index:2!important;display:grid!important;place-items:center!important;width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;color:rgba(230,238,255,.92)!important;font-size:11px!important;font-weight:900!important;line-height:1!important;text-shadow:0 1px 4px rgba(0,0,0,.55)!important;background:transparent!important;margin:0!important;padding:0!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-media-label{display:none!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media .vn2-ref-token-label{display:block!important;min-width:0!important;max-width:82px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:14px!important;font-weight:800!important;line-height:1!important;color:rgba(230,238,255,.92)!important}
.vn2-prompt-input .vn2-chip.vn2-ref-token-media *{box-sizing:border-box!important;max-width:100%!important}
"""
s=s.replace(old,new)
old="""function videoUrlFromPayload(payload){
  if(!payload)return '';
  const candidates=[
    payload.saved?.remoteUrl,
    payload.remoteContentUrl,
    payload.downloadUrl,
    payload.contentUrl,
    payload.videoUrl,
    payload.url,
    payload.saved?.url,
    payload.saved?.contentUrl,
    payload.proxyContentUrl,
    payload.localUrl,
    payload.saved?.localUrl,
    payload.videoDataUrl
  ].filter(Boolean).map(normalizeVideoCandidateUrl).filter(Boolean);
  return candidates.find(u=>!isVideoProxyContentUrl(u)&&!/^blob:/i.test(String(u))&&!/^data:/i.test(String(u)))||candidates.find(u=>!isVideoProxyContentUrl(u))||candidates[0]||'';
}"""
new="""function videoUrlFromPayload(payload){
  if(!payload)return '';
  const localCandidates=[payload.videoUrl,payload.url,payload.localUrl,payload.videoDataUrl,payload.saved?.localUrl].filter(Boolean).map(normalizeVideoCandidateUrl).filter(Boolean);
  const durableCandidates=[payload.saved?.remoteUrl,payload.remoteContentUrl,payload.downloadUrl,payload.contentUrl,payload.remoteUrl,payload.saved?.url,payload.saved?.contentUrl,payload.proxyContentUrl].filter(Boolean).map(normalizeVideoCandidateUrl).filter(Boolean);
  const localPlayable=localCandidates.find(u=>/^blob:/i.test(String(u))||/^data:video\//i.test(String(u)));
  if(localPlayable)return localPlayable;
  const candidates=[...durableCandidates,...localCandidates];
  return candidates.find(u=>!isVideoProxyContentUrl(u)&&!/^data:/i.test(String(u)))||candidates.find(u=>!isVideoProxyContentUrl(u))||candidates[0]||'';
}"""
s=s.replace(old,new)
old="""      const video=document.createElement('video');
      video.src=videoUrl;
      video.onloadedmetadata=()=>{
        n.values.duration=video.duration;
        n.values.width=video.videoWidth;
        n.values.height=video.videoHeight;
        n.values.videoUrl=videoUrl;
        n.data={...media,videoUrl,url:videoUrl,duration:n.values.duration,width:n.values.width,height:n.values.height,name:file.name,mediaType:'video'};
        uploadVideoMediaToObjectStorage(n.id,n.data,'video','视频参考',false).then(()=>{
          registerReferenceAssetFromEntry(n.data,'参考视频','video');
          computeNode(n.id);rerenderNode(n.id);
        }).catch(err=>toast('视频参考上传资产库失败：'+(err?.message||err),'warn'));
        generateVideoThumbnails(videoUrl,n.id);
        computeNode(n.id);
        rerenderNode(n.id);
      };
      video.onerror=()=>toast('视频加载失败','err');
      inp.value='';"""
new="""      const applyLocalVideo=()=>{
        n.values.videoUrl=videoUrl;
        n.values.localUrl=videoUrl;
        n.values.mediaType='video';
        n.data={...media,videoUrl,url:videoUrl,localUrl:videoUrl,duration:n.values.duration||0,width:n.values.width||0,height:n.values.height||0,name:file.name,mediaType:'video'};
        computeNode(n.id);
        rerenderNode(n.id);
      };
      applyLocalVideo();
      const video=document.createElement('video');
      video.preload='metadata';
      video.muted=true;
      video.src=videoUrl;
      video.onloadedmetadata=()=>{
        n.values.duration=Number.isFinite(video.duration)?video.duration:0;
        n.values.width=video.videoWidth||0;
        n.values.height=video.videoHeight||0;
        applyLocalVideo();
        const uploadMedia={...media,videoUrl:'',url:'',localUrl:'',_objectUrl:'',saved:{...(media.saved||{})}};
        uploadVideoMediaToObjectStorage(n.id,uploadMedia,'video','视频参考',false).then((publicUrl)=>{
          const cur=S.nodes[n.id];
          if(publicUrl&&cur){
            Object.assign(cur.values,{remoteUrl:publicUrl,contentUrl:publicUrl,downloadUrl:publicUrl,mediaType:'video'});
            cur.data={...(cur.data||{}),remoteUrl:publicUrl,contentUrl:publicUrl,downloadUrl:publicUrl,mediaType:'video',saved:{...(cur.data?.saved||{}),remoteUrl:publicUrl,url:publicUrl}};
          }
          registerReferenceAssetFromEntry(uploadMedia,'参考视频','video');
          computeNode(n.id);rerenderNode(n.id);
        }).catch(err=>toast('视频参考上传资产库失败：'+(err?.message||err),'warn'));
        generateVideoThumbnails(videoUrl,n.id);
      };
      video.onerror=()=>{applyLocalVideo();toast('已导入本地视频；浏览器暂未读到元数据，但可继续播放/连接','warn');};
      inp.value='';"""
s=s.replace(old,new)
old="""async function createAudioNodeFromVideoNode(videoId,videoEl=null){
  const srcNode=S.nodes[videoId];
  if(!srcNode){toast('未找到视频节点','err');return '';}
  const videoUrl=getVideoUrlFromNode(srcNode)||videoEl?.currentSrc||videoEl?.src||'';
  if(!videoUrl){toast('没有可分离的视频','warn');return '';}
  const metaDuration=Number(videoEl?.duration||0)||Number(srcNode.values?.duration||srcNode.data?.duration||0)||0;
  const audioMeta=metaDuration?{duration:metaDuration}:await readAudioMetadata(videoUrl);
  const name=audioNameFromVideoName(srcNode.values?.name||srcNode.data?.name||'video');
  const nid=makeNode('singleAudio',(srcNode.x||0)+(srcNode.w||380)+48,srcNode.y||0,{audioUrl:videoUrl,url:videoUrl,remoteUrl:videoUrl,contentUrl:videoUrl,downloadUrl:videoUrl,duration:audioMeta.duration||metaDuration||0,name,type:'audio/mp4',mediaType:'audio'});
  const audioNode=S.nodes[nid];
  if(audioNode){
    audioNode.data={audioUrl:videoUrl,url:videoUrl,remoteUrl:videoUrl,contentUrl:videoUrl,downloadUrl:videoUrl,duration:audioNode.values.duration,name,type:'audio/mp4',mediaType:'audio',sourceVideoNodeId:videoId,extractedFromVideoUrl:videoUrl,saved:{remoteUrl:videoUrl,url:videoUrl,filename:name,mediaType:'audio'}};
    computeNode(nid);
    rerenderNode(nid);
    selectNode(nid);
  }
  toast('已分离为音频节点','ok');
  return nid;
}"""
new="""async function createAudioNodeFromVideoNode(videoId,videoEl=null){
  const srcNode=S.nodes[videoId];
  if(!srcNode){toast('未找到视频节点','err');return '';}
  const videoUrl=getVideoUrlFromNode(srcNode)||videoEl?.currentSrc||videoEl?.src||'';
  if(!videoUrl){toast('没有可分离的视频','warn');return '';}
  const name=audioNameFromVideoName(srcNode.values?.name||srcNode.data?.name||'video');
  const canRecord=!!(window.MediaRecorder&&videoEl?.captureStream);
  if(!canRecord){
    toast('当前浏览器不支持本地抽取音轨，已创建音轨引用节点；如需独立音频请上传音频文件','warn');
    return createAudioReferenceNodeFromVideo(srcNode,videoUrl,name,videoEl);
  }
  try{
    const stream=videoEl.captureStream();
    const audioTracks=stream.getAudioTracks();
    if(!audioTracks.length){toast('当前视频没有可读取的音轨，已创建音轨引用节点','warn');return createAudioReferenceNodeFromVideo(srcNode,videoUrl,name,videoEl);}
    const audioStream=new MediaStream(audioTracks);
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':(MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':'audio/webm');
    const chunks=[];
    const rec=new MediaRecorder(audioStream,{mimeType:mime});
    const ended=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};rec.onerror=e=>reject(e.error||new Error('音频录制失败'));rec.onstop=resolve;});
    const oldTime=videoEl.currentTime;
    videoEl.currentTime=0;
    rec.start();
    await videoEl.play();
    const duration=Number.isFinite(videoEl.duration)?videoEl.duration:0;
    await new Promise(resolve=>{const timer=setTimeout(resolve,Math.min(Math.max(duration*1000+500,1500),300000));videoEl.onended=()=>{clearTimeout(timer);resolve();};});
    if(rec.state!=='inactive')rec.stop();
    await ended;
    videoEl.pause();
    if(Number.isFinite(oldTime))videoEl.currentTime=oldTime;
    if(!chunks.length)throw new Error('没有录到音频数据');
    const blob=new Blob(chunks,{type:mime.split(';')[0]});
    const file=new File([blob],name+(mime.includes('mp4')?'.m4a':'.webm'),{type:blob.type});
    const nid=makeNode('singleAudio',(srcNode.x||0)+(srcNode.w||380)+48,srcNode.y||0);
    await readAudioFileToNode(nid,file);
    selectNode(nid);
    toast('已分离为可播放音频节点','ok');
    return nid;
  }catch(err){
    console.warn('[音频分离] 浏览器抽取失败，降级为音轨引用：',err);
    toast('音频抽取失败，已创建音轨引用节点；建议直接上传音频文件','warn');
    return createAudioReferenceNodeFromVideo(srcNode,videoUrl,name,videoEl);
  }
}
function createAudioReferenceNodeFromVideo(srcNode,videoUrl,name,videoEl=null){
  const duration=Number(videoEl?.duration||srcNode.values?.duration||srcNode.data?.duration||0)||0;
  const nid=makeNode('singleAudio',(srcNode.x||0)+(srcNode.w||380)+48,srcNode.y||0,{audioUrl:'',url:'',duration,name,type:'video-track-reference',mediaType:'audio',sourceVideoNodeId:srcNode.id,sourceVideoUrl:videoUrl,note:'音轨引用：未生成独立音频文件'});
  const audioNode=S.nodes[nid];
  if(audioNode){
    audioNode.data={duration,name,type:'video-track-reference',mediaType:'audio',sourceVideoNodeId:srcNode.id,sourceVideoUrl:videoUrl,note:'音轨引用：未生成独立音频文件'};
    audioNode.error='当前为视频音轨引用，不是独立音频文件；请上传音频文件或使用支持抽轨的浏览器重试。';
    computeNode(nid);rerenderNode(nid);selectNode(nid);
  }
  return nid;
}"""
s=s.replace(old,new)
# docs modal visible section insertion
marker="""        <h2 style=\"font-size:16px;color:#f8fafc\">可复制 JSON 请求示例</h2>"""
insert="""        <h2 style=\"font-size:16px;color:#f8fafc\">参考图上传接口</h2>
        <p style=\"color:#aebbd0\">推荐先把本地参考图上传到 <code>/v1/files</code>，再把返回的公网 URL 写入生成任务的 <code>inputFiles</code>、<code>params.images</code>、<code>params.referenceImages</code>、<code>firstFrame</code> 或 <code>frames</code>。</p>
        <div style=\"overflow:auto;border:1px solid rgba(148,163,184,.18);border-radius:12px;margin-bottom:16px\"><table style=\"width:100%;border-collapse:collapse;min-width:940px;background:rgba(15,23,42,.45)\"><thead><tr><th style=\"padding:10px;border:1px solid rgba(148,163,184,.16);text-align:left\">字段</th><th style=\"padding:10px;border:1px solid rgba(148,163,184,.16);text-align:left\">必填</th><th style=\"padding:10px;border:1px solid rgba(148,163,184,.16);text-align:left\">类型</th><th style=\"padding:10px;border:1px solid rgba(148,163,184,.16);text-align:left\">说明</th></tr></thead><tbody><tr><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>file</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">是</td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>multipart file</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">本地图片文件，支持 png/jpg/webp。</td></tr><tr><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>purpose</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">否</td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>string</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">建议传 <code>reference_image</code>。</td></tr><tr><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>role</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">否</td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\"><code>referenceImage|firstFrame|frame</code></td><td style=\"padding:10px;border:1px solid rgba(148,163,184,.16)\">后续写入 <code>inputFiles[].role</code>。</td></tr></tbody></table></div>
        <pre style=\"${codeStyle}\">${copyBtn}<code>curl -X POST \"$BASE_URL/v1/files\" \\
  -H \"Authorization: Bearer $PERSONAL_API_KEY\" \\
  -F \"file=@/path/to/reference.png\" \\
  -F \"purpose=reference_image\" \\
  -F \"role=referenceImage\"</code></pre>
        <p style=\"color:#94a3b8;font-size:12px\">上传成功后，取响应中的 <code>url</code> / <code>downloadUrl</code> / <code>contentUrl</code> 作为 <code>inputFiles[].url</code>。</p>

"""
s=s.replace(marker,insert+marker)
md_marker="""## 5. 文生图 JSON"""
md_insert="""## 5. 参考图上传接口

推荐先把本地参考图上传到 `/v1/files`，再把返回的公网 URL 写入生成任务的 `inputFiles`、`params.images`、`params.referenceImages`、`firstFrame` 或 `frames`。

| 字段 | 必填 | 类型 | 说明 |
|---|---:|---|---|
| file | 是 | multipart file | 本地图片文件，支持 png/jpg/webp。 |
| purpose | 否 | string | 建议传 `reference_image`。 |
| role | 否 | `referenceImage` / `firstFrame` / `frame` | 后续写入 `inputFiles[].role`。 |

```bash
curl -X POST "$BASE_URL/v1/files" \\
  -H "Authorization: Bearer $PERSONAL_API_KEY" \\
  -F "file=@/path/to/reference.png" \\
  -F "purpose=reference_image" \\
  -F "role=referenceImage"
```

上传成功后，取响应中的 `url` / `downloadUrl` / `contentUrl` 作为 `inputFiles[].url`。

## 6. 文生图 JSON"""
s=s.replace(md_marker,md_insert)
html.write_text(s)
