import { mapToWorld, worldToMap, type ExplorationMap, type MapView, type WorldPoint } from '../../world-core/src';

export interface MapMarker { id:string; point:WorldPoint; color:string; label:string; kind:'home'|'actor'|'place' }
export interface MiniMapFrame { focus:WorldPoint; viewport:WorldPoint[]; markers:MapMarker[]; followedId:string|null }
export interface MiniMapOptions {
  home:WorldPoint; exploration:ExplorationMap;
  colorAt:(point:WorldPoint)=>readonly[number,number,number];
  onLocate:(point:WorldPoint)=>void; onHome:()=>void; onFollow:()=>void;
}
export interface MiniMap { update:(frame:MiniMapFrame,now:number)=>void; dispose:()=>void }

/** 只显示地图并发出明确的相机操作。这里没有角色移动或揭雾权限。 */
export function createMiniMap(host:HTMLElement,options:MiniMapOptions):MiniMap {
  const panel=document.createElement('section');panel.className='world-atlas';panel.setAttribute('aria-label','世界鹰眼地图');
  panel.dataset.worldUi='true';
  const head=document.createElement('div');head.className='world-atlas-head';
  const title=document.createElement('span');title.textContent='N ↑ 鹰眼';
  const button=(label:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=text;
    b.title=label;b.setAttribute('aria-label',label);b.onclick=action;return b;};
  const expand=button('展开世界地图','⛶',()=>setExpanded(!expanded));
  head.append(title,expand);
  const canvas=document.createElement('canvas');canvas.className='world-atlas-canvas';canvas.width=256;canvas.height=256;
  canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','鹰眼地图，点击定位镜头，方向键平移，Escape收起');
  const context=canvas.getContext('2d');if(!context)throw new Error('浏览器不能创建鹰眼地图画布');
  const ctx:CanvasRenderingContext2D=context;
  const raster=document.createElement('canvas');raster.width=128;raster.height=128;
  const rasterContext=raster.getContext('2d');if(!rasterContext)throw new Error('鹰眼地形缓冲区创建失败');
  const rctx:CanvasRenderingContext2D=rasterContext;
  const footer=document.createElement('div');footer.className='world-atlas-footer';
  const home=button('镜头返回营地','⌂',()=>{options.onHome();view.center={...options.home};invalid=true;});
  const follow=button('跟随选中的伙伴','◎',()=>{options.onFollow();invalid=true;});
  const out=button('扩大鹰眼范围','−',()=>zoom(1.5)),inside=button('缩小鹰眼范围','+',()=>zoom(1/1.5));
  footer.append(home,follow,out,inside);
  const scale=document.createElement('div');scale.className='world-atlas-scale';
  const legend=document.createElement('p');legend.className='world-atlas-legend';legend.textContent='点击地图定位镜头 · 黑色为未知区域 · 拖动镜头不会探索';
  panel.append(head,canvas,footer,scale,legend);host.append(panel);
  let expanded=false,collapsed=false,invalid=true,disposed=false,lastDraw=-Infinity,lastRasterKey='';
  let frame:MiniMapFrame={focus:{...options.home},viewport:[],markers:[],followedId:null};
  let view:MapView={center:{...options.home},span:800};
  let pointer:{id:number;x:number;y:number;center:WorldPoint;span:number;moved:boolean}|null=null;
  function zoom(factor:number){view.span=Math.max(128,Math.min(16384,view.span*factor));invalid=true;draw(performance.now(),true);}
  function setExpanded(next:boolean){expanded=next;panel.classList.toggle('is-expanded',expanded);expand.setAttribute('aria-expanded',String(expanded));
    expand.setAttribute('aria-label',expanded?'收起世界地图':'展开世界地图');view.span=expanded?Math.max(view.span,2400):800;
    panel.setAttribute('aria-label',expanded?'世界地图':'世界鹰眼地图');invalid=true;draw(performance.now(),true);if(expanded)canvas.focus();else expand.focus();}
  const toggle=button('折叠鹰眼地图','▾',()=>{collapsed=!collapsed;panel.classList.toggle('is-collapsed',collapsed);toggle.textContent=collapsed?'▸':'▾';
    toggle.setAttribute('aria-expanded',String(!collapsed));});head.append(toggle);
  function coordinates(event:PointerEvent):WorldPoint{const box=canvas.getBoundingClientRect();return {x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};}
  function down(event:PointerEvent){if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,center:{...view.center},span:view.span,moved:false};canvas.setPointerCapture(event.pointerId);}
  function move(event:PointerEvent){if(!pointer||event.pointerId!==pointer.id)return;event.preventDefault();event.stopPropagation();
    const rect=canvas.getBoundingClientRect(),dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(Math.hypot(dx,dy)>5)pointer.moved=true;
    if(!pointer.moved)return;
    const target={x:pointer.center.x-dx/rect.width*pointer.span,y:pointer.center.y-dy/rect.height*pointer.span};
    view.center=target;options.onLocate(target);invalid=true;draw(performance.now(),true);}
  function up(event:PointerEvent){if(!pointer||event.pointerId!==pointer.id)return;event.preventDefault();event.stopPropagation();
    const selected=pointer;pointer=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(!selected.moved){const target=mapToWorld(coordinates(event),view);options.onLocate(target);view.center=target;invalid=true;draw(performance.now(),true);}}
  function cancel(event:PointerEvent){if(pointer?.id===event.pointerId)pointer=null;}
  function wheel(event:WheelEvent){event.preventDefault();event.stopPropagation();zoom(Math.exp(event.deltaY*.001));}
  function key(event:KeyboardEvent){if(event.key==='Escape'&&expanded){event.preventDefault();setExpanded(false);return;}
    const delta:Record<string,WorldPoint>={ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0},ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1}};
    const direction=delta[event.key];if(!direction)return;event.preventDefault();view.center={x:view.center.x+direction.x*view.span*.15,y:view.center.y+direction.y*view.span*.15};
    options.onLocate(view.center);invalid=true;draw(performance.now(),true);}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('wheel',wheel,{passive:false});panel.addEventListener('keydown',key);
  function draw(now:number,force=false){if(disposed||collapsed||!force&&now-lastDraw<180)return;lastDraw=now;
    const rasterKey=`${Math.round(view.center.x/4)}:${Math.round(view.center.y/4)}:${view.span}:${options.exploration.revision}`;
    if(invalid||rasterKey!==lastRasterKey){const image=rctx.createImageData(128,128);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){const p=mapToWorld({x:(x+.5)/128,y:(y+.5)/128},view),i=(y*128+x)*4;
        const color=options.exploration.isExplored(p)?options.colorAt(p):[4,7,9];image.data[i]=color[0];image.data[i+1]=color[1];image.data[i+2]=color[2];image.data[i+3]=255;}
      rctx.putImageData(image,0,0);lastRasterKey=rasterKey;invalid=false;}
    const size=canvas.width;ctx.clearRect(0,0,size,size);ctx.imageSmoothingEnabled=true;ctx.drawImage(raster,0,0,size,size);
    if(frame.viewport.length>=3){ctx.beginPath();frame.viewport.forEach((p,index)=>{const uv=worldToMap(p,view);if(index===0)ctx.moveTo(uv.x*size,uv.y*size);else ctx.lineTo(uv.x*size,uv.y*size);});
      ctx.closePath();ctx.fillStyle='rgba(255,242,179,.10)';ctx.fill();ctx.strokeStyle='rgba(255,242,179,.9)';ctx.lineWidth=1.5;ctx.stroke();}
    // 展开地图中密集人物的名称不能互相叠字；优先保留调用方排在前面的重要地点。
    const labels:{left:number;right:number;top:number;bottom:number}[]=[];
    for(const marker of frame.markers){if(!options.exploration.isExplored(marker.point))continue;const uv=worldToMap(marker.point,view);if(uv.x<0||uv.y<0||uv.x>1||uv.y>1)continue;
      const x=uv.x*size,y=uv.y*size;ctx.fillStyle=marker.color;ctx.strokeStyle='#121b17';ctx.lineWidth=2;
      if(marker.kind==='home'){ctx.fillRect(x-5,y-5,10,10);ctx.strokeRect(x-5,y-5,10,10);}else{ctx.beginPath();ctx.arc(x,y,marker.kind==='actor'?4:3,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(expanded){ctx.font='11px sans-serif';
        const box={left:x+8,right:x+8+ctx.measureText(marker.label).width,top:y-16,bottom:y-3};
        if(box.left>=2&&box.top>=2&&box.right<=size-2&&box.bottom<=size-2&&!labels.some(a=>
          box.left<a.right+4&&box.right>a.left-4&&box.top<a.bottom+4&&box.bottom>a.top-4)){
          labels.push(box);ctx.fillStyle='#fff8df';ctx.fillText(marker.label,x+8,y-5);
        }
      }}
    canvas.dataset.labelCount=String(labels.length);
    follow.classList.toggle('is-active',!!frame.followedId);follow.setAttribute('aria-pressed',String(!!frame.followedId));
    const metres=Math.round(view.span/4);scale.textContent=`└────┘ ${metres>=1000?(metres/1000).toFixed(1)+' km':metres+' m'}`;
    canvas.dataset.centerX=view.center.x.toFixed(1);canvas.dataset.centerY=view.center.y.toFixed(1);canvas.dataset.span=String(view.span);
  }
  draw(0,true);
  return {update(next,now){frame=next;if(!pointer)view.center={...next.focus};draw(now);},dispose(){if(disposed)return;disposed=true;
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);
    canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('wheel',wheel);panel.removeEventListener('keydown',key);panel.remove();}};
}
