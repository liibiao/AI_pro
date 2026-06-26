export function installCanvasTabletTouchAdapter(opts){
  const {stage,world,svg,state,drawConnections,saveWorkflow,setSelected,screenToWorld,addNode,render}=opts;
  if(!stage||stage.__tabletTouchAdapterInstalled)return;
  stage.__tabletTouchAdapterInstalled=true;
  const pointers=new Map();
  let pinch=null;
  let touchPanId=null;
  let touchPanStart=null;
  let lastBlankTap=null;
  const isTouchViewport=()=>((navigator.maxTouchPoints||0)>0)||(window.matchMedia?.('(pointer: coarse)')?.matches===true);
  window.__canvasIsTouchViewport=isTouchViewport;
  const syncClass=()=>document.documentElement.classList.toggle('canvas-tablet-touch',isTouchViewport());
  const isTouchPointer=e=>e.pointerType==='touch'||e.pointerType===''||e.pointerType==null;
  const isTouch=e=>isTouchPointer(e)&&isTouchViewport();
  const isEditable=t=>!!t?.closest?.('input,textarea,select,[contenteditable="true"]');
  const isBlank=t=>{
    if(t===stage||t===world||t===svg)return true;
    if(!t?.closest||!stage.contains(t))return false;
    return !t.closest('.node,.node-picker,.conn-target-popup,.float,.sel-bbox,.sel-toolbar,button,input,textarea,select,label,a,[data-action]');
  };
  window.__canvasIsBlankCanvasTarget=isBlank;
  const center=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)||1;
  const applyTransform=()=>{
    world.style.transform=`translate(${state.view.tx}px,${state.view.ty}px) scale(${state.view.scale})`;
    drawConnections(svg,state);
  };
  const beginPinch=()=>{
    const pts=[...pointers.values()];
    if(pts.length<2)return;
    state.drag=null;
    state.pan=null;
    state.connect=null;
    const a=pts[0],b=pts[1],c=center(a,b);
    pinch={startDist:dist(a,b),startCenter:c,startScale:state.view.scale,startTx:state.view.tx,startTy:state.view.ty};
    stage.classList.add('panning');
  };
  const updatePinch=e=>{
    if(!pinch||pointers.size<2)return;
    if(e.cancelable)e.preventDefault();
    e.stopImmediatePropagation();
    const pts=[...pointers.values()];
    const a=pts[0],b=pts[1],c=center(a,b);
    const next=Math.max(.25,Math.min(2.2,pinch.startScale*(dist(a,b)/pinch.startDist)));
    const ratio=next/pinch.startScale;
    const rect=stage.getBoundingClientRect();
    const sx=pinch.startCenter.x-rect.left,sy=pinch.startCenter.y-rect.top;
    state.view.scale=next;
    state.view.tx=c.x-rect.left-(sx-pinch.startTx)*ratio;
    state.view.ty=c.y-rect.top-(sy-pinch.startTy)*ratio;
    applyTransform();
  };
  const finish=e=>{
    pointers.delete(e.pointerId);
    if(pinch&&pointers.size<2){
      pinch=null;
      stage.classList.remove('panning');
      saveWorkflow();
    }
    if(touchPanId===e.pointerId){
      const moved=touchPanStart?Math.hypot(e.clientX-touchPanStart.x,e.clientY-touchPanStart.y):Infinity;
      const duration=touchPanStart?Date.now()-touchPanStart.t:Infinity;
      touchPanId=null;
      touchPanStart=null;
      if(moved<8&&duration<420&&isBlank(document.elementFromPoint(e.clientX,e.clientY))){
        const now=Date.now();
        if(lastBlankTap&&now-lastBlankTap.t<320&&Math.hypot(e.clientX-lastBlankTap.x,e.clientY-lastBlankTap.y)<28){
          const p=screenToWorld(e.clientX,e.clientY);
          lastBlankTap=null;
          addNode('generatorHub',p.x,p.y,{});
          render();
          saveWorkflow();
        }else{
          lastBlankTap={x:e.clientX,y:e.clientY,t:now};
        }
      }
    }
  };
  syncClass();
  window.addEventListener('resize',syncClass,{passive:true});
  window.visualViewport?.addEventListener?.('resize',syncClass,{passive:true});
  stage.addEventListener('pointerdown',e=>{
    if(!isTouch(e)||isEditable(e.target))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      if(e.cancelable)e.preventDefault();
      e.stopImmediatePropagation();
      beginPinch();
      return;
    }
    if(isBlank(e.target)&&!state.connect){
      if(e.cancelable)e.preventDefault();
      e.stopImmediatePropagation();
      setSelected(null);
      state.pan={startX:e.clientX,startY:e.clientY,tx:state.view.tx,ty:state.view.ty};
      touchPanId=e.pointerId;
      touchPanStart={x:e.clientX,y:e.clientY,t:Date.now()};
      stage.setPointerCapture?.(e.pointerId);
      stage.classList.add('panning');
      render();
    }
  },true);
  document.addEventListener('pointermove',e=>{
    if(!isTouch(e)||!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch)updatePinch(e);
  },true);
  document.addEventListener('pointerup',e=>{if(isTouch(e))finish(e);},true);
  document.addEventListener('pointercancel',e=>{if(isTouch(e))finish(e);},true);
}
