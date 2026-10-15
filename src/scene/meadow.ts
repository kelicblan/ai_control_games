import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial} from 'three';
import {partitionGeometry} from '../../packages/world-three/src/spatialGeometry';
import {CAMP_HOUSES,sampleCampSurface} from '../games/camp/world/definition';
import {settlementRoad} from '../games/camp/world/settlement';
import {seeded} from './geometry';
import {villageClearance} from '../games/camp/world/villageLayout';

/** A modeled meadow of curved leaves. Bare paths and swept house yards remain clear. */
export function createMeadow(seed:number){
 const random=seeded(seed^7139),positions:number[]=[],colors:number[]=[],tint=new Color();
 for(let i=0;i<38000;i++){
  const angle=random()*Math.PI*2,r=Math.sqrt(random())*190,x=50+Math.cos(angle)*r,y=55+Math.sin(angle)*r;
  const s=sampleCampSurface({x,y},seed);
  if(villageClearance(x,y,3)||s.water||s.road>.06||settlementRoad(x,y)>.03||Math.hypot(x-51,y-54)<17
   ||CAMP_HOUSES.some(h=>Math.abs(x-h.center.x)<h.half.x+5&&Math.abs(y-h.center.y)<h.half.y+7)
   ||Math.abs(x-50)<13&&y<23&&y>-35||Math.abs(x-50)<21&&y>175)continue;
  const patch=.55+.45*Math.sin(x*.09+Math.sin(y*.07)*2);
  for(let blade=0;blade<5;blade++){
   const a=random()*Math.PI*2,bx=x-50+(random()-.5)*1.6,bz=y-50+(random()-.5)*1.6;
   const h=(.35+random()*.7)*patch,w=.09+random()*.11,bend=h*(.2+random()*.45),dx=Math.cos(a),dz=Math.sin(a);
   const base=s.height+.035,vertices=[
    [bx-dz*w,base,bz+dx*w],[bx+dz*w,base,bz-dx*w],
    [bx+dx*bend*.4-dz*w*.5,base+h*.55,bz+dz*bend*.4+dx*w*.5],
    [bx+dx*bend*.4+dz*w*.5,base+h*.55,bz+dz*bend*.4-dx*w*.5],
    [bx+dx*bend,base+h,bz+dz*bend],
   ];
   tint.set(['#4d7038','#597c40','#6c8a49','#799456'][Math.floor(random()*4)]);
   for(const k of [0,1,2,2,1,3,2,3,4]){
    positions.push(...vertices[k]);const shade=k<2?.72:k===4?1.12:1;
    colors.push(tint.r*shade,tint.g*shade,tint.b*shade);
   }
  }
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 const material=new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:1});
 const cells=partitionGeometry(geometry,48),mesh=new Group();mesh.name='自然草甸 · 弯曲叶片与踩踏空地';
 for(const cell of cells){const part=new Mesh(cell,material);part.receiveShadow=true;mesh.add(part);}
 return {mesh,dispose(){cells.forEach(cell=>cell.dispose());material.dispose();}};
}
