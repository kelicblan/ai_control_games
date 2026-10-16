import { MathUtils, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { validPoint, type WorldPoint } from '../../world-core/src';

export interface CameraOrbit { azimuth:number; elevation:number; zoom:number; focus:Vector3 }
export interface ScreenPoint { x:number; y:number; depth:number; visible:boolean }
const ray = new Raycaster(), ndc = new Vector2(), projected = new Vector3(), hit = new Vector3();
const zero = new Vector3();
export const CAMERA_MIN_ZOOM = .15;
export const CAMERA_MAX_ZOOM = 2.8;
export function defaultOrbit(): CameraOrbit { return {azimuth:-.18, elevation:.60, zoom:.16, focus:new Vector3(0,1.5,5)}; }

/** focus是可移动的世界位置，不是绑定营地的常量；origin只用于渲染重定位。 */
export function configureCamera(camera:OrthographicCamera,width:number,height:number,orbit:CameraOrbit,origin=zero):void {
  const aspect=Math.max(1,width)/Math.max(1,height), halfWidth=aspect<.85?36:Math.max(36,33*aspect);
  camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfWidth/aspect;camera.bottom=-halfWidth/aspect;
  camera.near=.1;camera.far=4000;
  camera.zoom=MathUtils.clamp(orbit.zoom,CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM)*(aspect<.85?1.55:1.08);
  // 限制的是一次绘制的视野，不是可移动范围；整张已知世界由鹰眼地图查看。
  const c=Math.abs(Math.cos(orbit.azimuth)),s=Math.abs(Math.sin(orbit.azimuth));
  const vertical=halfWidth/aspect/Math.sin(orbit.elevation);
  camera.zoom=Math.max(camera.zoom,2*Math.max(halfWidth*c+vertical*s,halfWidth*s+vertical*c)/1280);
  const distance=Math.max(180,(halfWidth/aspect/camera.zoom)*Math.cos(orbit.elevation)/Math.sin(orbit.elevation)+90),horizontal=Math.cos(orbit.elevation)*distance;
  camera.position.set(orbit.focus.x-origin.x+Math.sin(orbit.azimuth)*horizontal,
    orbit.focus.y+Math.sin(orbit.elevation)*distance,
    orbit.focus.z-origin.z+Math.cos(orbit.azimuth)*horizontal);
  hit.copy(orbit.focus).sub(origin);camera.lookAt(hit);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
export function projectWorld(camera:OrthographicCamera|PerspectiveCamera,world:Vector3,width:number,height:number,origin=zero):ScreenPoint {
  projected.copy(world).sub(origin).project(camera);
  return {x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height,depth:projected.z,
    visible:projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<=1.04&&Math.abs(projected.y)<=1.04};
}
/** 正交相机的平移按实际屏幕尺度计算；缩放后拖动速度仍与手指一致。 */
export function panOrbit(camera:OrthographicCamera,orbit:CameraOrbit,dx:number,dy:number,height:number):void {
  const units=(camera.top-camera.bottom)/camera.zoom/Math.max(1,height);
  const c=Math.cos(orbit.azimuth),s=Math.sin(orbit.azimuth),vertical=1/Math.max(.2,Math.sin(orbit.elevation));
  orbit.focus.x-=(dx*c+dy*s*vertical)*units;
  orbit.focus.z-=(-dx*s+dy*c*vertical)*units;
}
/** 高度场射线拾取；不把大地图坐标裁回0..100。默认高度0兼容纯平面调用。 */
export function groundFromScreen(camera:OrthographicCamera|PerspectiveCamera,x:number,y:number,width:number,height:number,
  heightAt:(point:WorldPoint)=>number=()=>0,origin=zero):WorldPoint|null {
  if(width<=0||height<=0)return null;
  ndc.set(x/width*2-1,-(y/height)*2+1);ray.setFromCamera(ndc,camera);
  const evaluate=(distance:number)=>{
    ray.ray.at(distance,hit);hit.add(origin);
    const p={x:hit.x+50,y:hit.z+50};
    return validPoint(p)?hit.y-heightAt(p):NaN;
  };
  let previous=evaluate(0), low=0;
  for(let step=1;step<=96;step++) {
    const high=step*camera.far/96,value=evaluate(high);
    if(!Number.isFinite(value))return null;
    if(previous>=0&&value<=0){let a=low,b=high;for(let i=0;i<28;i++){const m=(a+b)/2;if(evaluate(m)>0)a=m;else b=m;}
      evaluate((a+b)/2);return {x:hit.x+50,y:hit.z+50};}
    previous=value;low=high;
  }
  return null;
}
