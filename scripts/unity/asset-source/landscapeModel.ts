import {BufferAttribute,BufferGeometry,Color,Float32BufferAttribute} from 'three';
import {seededNoise} from '../../../packages/world-core/src/index';
import {LANDSCAPE_GRID,landscapeAxis,landscapeVertexHeight,landscapeRoad,landscapeRiverX,landscapeRiverWidth} from '../../../src/games/camp/world/landscape';

/** One indexed, connected mesh: slopes, riverbed and worn roads share vertices. */
export function buildLandscapeGeometry(grid:{min:number;max:number;step:number}=LANDSCAPE_GRID):BufferGeometry{
 const axis=grid===LANDSCAPE_GRID?landscapeAxis():Array.from({length:Math.round((grid.max-grid.min)/grid.step)+1},(_,i)=>grid.min+i*grid.step);
 const count=axis.length-1,side=count+1,total=side*side;
 const positions=new Float32Array(total*3),colors=new Float32Array(total*3),uv=new Float32Array(total*2),wear=new Float32Array(total),rock=new Float32Array(total),indices=new Uint32Array(count*count*6);
 const tint=new Color(),grass=new Color('#627448'),soil=new Color('#a18a62'),stone=new Color('#8c8b7f'),silt=new Color('#898365');
 for(let j=0;j<=count;j++)for(let i=0;i<=count;i++){
  const k=j*side+i,x=axis[i],y=axis[j],h=landscapeVertexHeight(x,y);
  positions.set([x-50,h,y-50],k*3);uv.set([x/128,y/128],k*2);
  const slope=Math.hypot(landscapeVertexHeight(x+2,y)-h,landscapeVertexHeight(x,y+2)-h)/2;
  const cliff=Math.min(1,Math.max(0,(slope-.45)/1.5)+Math.max(0,(h-90)/150));rock[k]=cliff;
  const ground=seededNoise(x/23,y/23,791),micro=seededNoise(x/3,y/3,53);
  tint.copy(grass).offsetHSL((ground-.5)*.025,0,(ground-.5)*.07).lerp(stone,cliff);
  const bank=Math.abs(x-landscapeRiverX(y))-landscapeRiverWidth(y);
  if(bank<8)tint.lerp(silt,Math.max(0,Math.min(1,(8-bank)/11)));
  const road=landscapeRoad(x,y);wear[k]=road;
  // Worn track with irregular fading shoulders; it remains part of the ground mesh.
  const exposed=Math.min(1,Math.max(0,(road-.10)/.63));
  tint.lerp(soil,exposed*(.77+micro*.23));tint.multiplyScalar(.94+micro*.12);
  colors.set([tint.r,tint.g,tint.b],k*3);
 }
 let n=0;for(let j=0;j<count;j++)for(let i=0;i<count;i++){
  const a=j*side+i,b=a+1,c=a+side,d=c+1;indices.set([a,c,b,b,c,d],n);n+=6;
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(new Float32Array(total*3),3));
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
 geometry.setAttribute('roadWear',new Float32BufferAttribute(wear,1));geometry.setAttribute('exposedRock',new Float32BufferAttribute(rock,1));geometry.setIndex(new BufferAttribute(indices,1));
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
