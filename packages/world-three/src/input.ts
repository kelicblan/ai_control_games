import { MathUtils, type OrthographicCamera } from 'three';
import { CAMERA_MAX_ZOOM, CAMERA_MIN_ZOOM, panOrbit, type CameraOrbit } from './camera';
export interface WorldTap { kind:'npc'|'action'|'ground'; id?:string }
export interface WorldInputOptions {
  surface:HTMLElement; canvas:HTMLCanvasElement; camera:OrthographicCamera; orbit:CameraOrbit;
  height:()=>number; enabled:()=>boolean;
  changed:()=>void; releaseFollow:()=>void; tap:(target:WorldTap,x:number,y:number)=>void;
}
/** 鼠标/触屏共享输入层：平移、捏合、双指扭转；UI按钮不进入世界手势。 */
export function bindWorldInput(options:WorldInputOptions):()=>void {
  const {surface,canvas,camera,orbit}=options;
  type Pointer={x:number;y:number;startX:number;startY:number;rotate:boolean;target:WorldTap};
  const pointers=new Map<number,Pointer>();let moved=false;
  const target=(value:EventTarget|null)=>value instanceof Element?value.closest('[data-scene-action],[data-scene-npc],.scene-canvas,.scene-host'):null;
  const local=(event:PointerEvent)=>{const box=canvas.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};};
  function down(event:PointerEvent){
    const element=target(event.target);if(!element||!options.enabled()||event.pointerType==='mouse'&&![0,2].includes(event.button))return;
    event.preventDefault();const p=local(event),npc=element.getAttribute('data-scene-npc'),action=element.getAttribute('data-scene-action');
    pointers.set(event.pointerId,{...p,startX:p.x,startY:p.y,rotate:event.button===2||event.shiftKey,
      target:npc?{kind:'npc',id:npc}:action?{kind:'action',id:action}:{kind:'ground'}});
    if(pointers.size===1)moved=event.button===2;else moved=true;
    surface.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent){
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const before=[...pointers.values()],p=local(event),dx=p.x-previous.x,dy=p.y-previous.y;
    if(Math.hypot(p.x-previous.startX,p.y-previous.startY)>6)moved=true;
    pointers.set(event.pointerId,{...previous,...p});if(!moved)return;
    options.releaseFollow();
    if(pointers.size>=2){
      const after=[...pointers.values()];
      const length=(v:Pointer[])=>Math.hypot(v[1].x-v[0].x,v[1].y-v[0].y);
      const oldLength=length(before),newLength=length(after);
      if(oldLength>1)orbit.zoom=MathUtils.clamp(orbit.zoom*newLength/oldLength,CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM);
      const oldAngle=Math.atan2(before[1].y-before[0].y,before[1].x-before[0].x),newAngle=Math.atan2(after[1].y-after[0].y,after[1].x-after[0].x);
      orbit.azimuth-=Math.atan2(Math.sin(newAngle-oldAngle),Math.cos(newAngle-oldAngle));
      panOrbit(camera,orbit,dx/2,dy/2,options.height());
    }else if(previous.rotate){orbit.azimuth-=dx*.0055;orbit.elevation=MathUtils.clamp(orbit.elevation+dy*.0034,.46,1.12);}
    else panOrbit(camera,orbit,dx,dy,options.height());
    options.changed();
  }
  function up(event:PointerEvent){
    const start=pointers.get(event.pointerId),p=local(event);
    if(start&&Math.hypot(p.x-start.startX,p.y-start.startY)>6)moved=true;
    const isTap=!!start&&!moved&&pointers.size===1;pointers.delete(event.pointerId);
    if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);
    if(isTap&&start&&options.enabled())options.tap(start.target,p.x,p.y);
  }
  function cancel(event:PointerEvent){pointers.delete(event.pointerId);moved=true;}
  function click(event:MouseEvent){if(event.detail>0&&(event.target===surface||target(event.target))){event.preventDefault();event.stopPropagation();}}
  function menu(event:MouseEvent){if(target(event.target))event.preventDefault();}
  function wheel(event:WheelEvent){if(!target(event.target)||!options.enabled())return;event.preventDefault();
    orbit.zoom=MathUtils.clamp(orbit.zoom*Math.exp(-event.deltaY*.0013),CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM);options.changed();}
  surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',up);
  surface.addEventListener('pointercancel',cancel);surface.addEventListener('lostpointercapture',cancel);surface.addEventListener('click',click,true);
  surface.addEventListener('contextmenu',menu);surface.addEventListener('wheel',wheel,{passive:false});
  return ()=>{surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerup',up);
    surface.removeEventListener('pointercancel',cancel);surface.removeEventListener('lostpointercapture',cancel);surface.removeEventListener('click',click,true);
    surface.removeEventListener('contextmenu',menu);surface.removeEventListener('wheel',wheel);pointers.clear();};
}
