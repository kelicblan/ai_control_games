export type Pixel=[number,number];
export type Vec3=[number,number,number];
export interface ReferenceCamera {azimuth:number;elevation:number;distance:number;verticalFov:number;target:Vec3;status:string}
export interface ReferenceImage {width:number;height:number;sha256:string}
export interface Feature {id:string;label:string;kind:string;visibility:string;uncertaintyPixels:number;points:Pixel[];ridge?:Pixel[];closed?:boolean}
export interface ReferenceConstraints {source:ReferenceImage;camera:ReferenceCamera;features:Feature[];unresolved:unknown[];visualAccepted:boolean}
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i],0);
function frame(c:ReferenceCamera){
 const az=c.azimuth*Math.PI/180,el=c.elevation*Math.PI/180;
 const right:Vec3=[Math.cos(az),0,-Math.sin(az)];
 const forward:Vec3=[Math.sin(az)*Math.cos(el),-Math.sin(el),Math.cos(az)*Math.cos(el)];
 const up:Vec3=[Math.sin(az)*Math.sin(el),Math.cos(el),Math.cos(az)*Math.sin(el)];
 const eye=c.target.map((v,i)=>v-forward[i]*c.distance) as Vec3;
 return {right,forward,up,eye,tan:Math.tan(c.verticalFov*Math.PI/360)};
}
/** Perspective projection; source pixels always use top-left origin. */
export function projectReference(world:Vec3,c:ReferenceCamera,s:ReferenceImage):Pixel {
 const {right,forward,up,eye,tan}=frame(c),d=world.map((v,i)=>v-eye[i]) as Vec3;
 const z=dot(d,forward);if(z<=0)throw new Error('Point is behind camera');
 return [(dot(d,right)/(z*tan*s.width/s.height)+1)*s.width/2,(1-dot(d,up)/(z*tan))*s.height/2];
}
/** Intersect a reference pixel ray with a declared height; this does not infer the height. */
export function unprojectReference(pixel:Pixel,height:number,c:ReferenceCamera,s:ReferenceImage):Vec3 {
 const {right,forward,up,eye,tan}=frame(c),sx=(pixel[0]/s.width*2-1)*tan*s.width/s.height,sy=(1-pixel[1]/s.height*2)*tan;
 const ray=forward.map((v,i)=>v+right[i]*sx+up[i]*sy) as Vec3;
 if(Math.abs(ray[1])<1e-9)throw new Error('Reference ray is parallel to height plane');
 const t=(height-eye[1])/ray[1];if(t<=0)throw new Error('Height plane is behind reference ray');
 return eye.map((v,i)=>v+ray[i]*t) as Vec3;
}
export function validateReference(data:ReferenceConstraints):string[]{
 const errors:string[]=[],ids=new Set<string>();
 if(data.source.width!==2048||data.source.height!==1303)errors.push('Unexpected selected reference dimensions');
 if(!/^[a-f0-9]{64}$/.test(data.source.sha256))errors.push('Invalid source sha256');
 if(data.camera.distance<=0||data.camera.verticalFov<=0||data.camera.verticalFov>=179)errors.push('Invalid camera');
 for(const f of data.features){
  if(ids.has(f.id))errors.push(`Duplicate feature ${f.id}`);ids.add(f.id);
  if(!Number.isFinite(f.uncertaintyPixels)||f.uncertaintyPixels<=0)errors.push(`${f.id}: manual trace needs uncertainty`);
  if(!['visible','partially-occluded'].includes(f.visibility))errors.push(`${f.id}: unsupported visibility`);
  if(f.points.length<(f.closed?3:1))errors.push(`${f.id}: insufficient points`);
  for(const p of f.points)if(p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>data.source.width||p[1]<0||p[1]>data.source.height)errors.push(`${f.id}: point outside image`);
  if(f.ridge){
   if(f.ridge.length!==2)errors.push(`${f.id}: roof ridge needs two endpoints`);
   for(const p of f.ridge)if(p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[0]>data.source.width||p[1]<0||p[1]>data.source.height)errors.push(`${f.id}: ridge outside image`);
  }
 }
 return errors;
}
