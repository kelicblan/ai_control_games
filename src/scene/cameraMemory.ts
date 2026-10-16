import {defaultOrbit,CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM,type CameraOrbit} from '../../packages/world-three/src/camera';
import {validPoint} from '../../packages/world-core/src';
type CameraStorage=Pick<Storage,'getItem'|'setItem'>;
const key=(seed:number)=>`campmind.camera.v1:${seed}`;
function local():CameraStorage|undefined{try{return typeof window==='undefined'?undefined:window.localStorage;}catch{return undefined;}}
export function readCameraOrbit(seed:number,storage=local()):CameraOrbit{
 const orbit=defaultOrbit();
 try{
  const raw=storage?.getItem(key(seed));if(!raw)return orbit;const value=JSON.parse(raw);
  if(value.version!==1||![value.x,value.y,value.azimuth,value.elevation,value.zoom].every(v=>typeof v==='number'&&Number.isFinite(v))
   ||!validPoint({x:value.x,y:value.y})||value.elevation<.2||value.elevation>1.5||value.zoom<CAMERA_MIN_ZOOM||value.zoom>CAMERA_MAX_ZOOM)return orbit;
  orbit.focus.x=value.x-50;orbit.focus.z=value.y-50;orbit.azimuth=value.azimuth;orbit.elevation=value.elevation;orbit.zoom=value.zoom;
 }catch{/* A missing or damaged camera preference never invalidates the world. */}
 return orbit;
}
export function writeCameraOrbit(seed:number,orbit:CameraOrbit,storage=local()):void{
 try{storage?.setItem(key(seed),JSON.stringify({version:1,x:orbit.focus.x+50,y:orbit.focus.z+50,azimuth:orbit.azimuth,elevation:orbit.elevation,zoom:orbit.zoom}));}catch{/* Storage may be unavailable or full. */}
}
