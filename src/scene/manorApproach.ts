import {BoxGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {sampleCampSurface} from '../games/camp/world/definition';
import {Shapes,StaticBatch,seeded} from './geometry';

/** A continuous masonry entrance fitted to the actual plateau and model apron. */
export function createManorApproach(shapes:Shapes,seed:number){
 const group=new Group();group.name='领主府 · 石砌台基与完整登阶';
 const random=seeded(714032),batch=new StaticBatch();
 const materials=['#655f51','#706a5b','#797263','#595b50','#696557'].map(color=>new MeshStandardMaterial({color,roughness:1}));
 for(const material of materials){
  material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 vMasonry;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMasonry=position;');
   shader.fragmentShader='varying vec3 vMasonry;\nfloat stoneGrain(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,39.425)))*43758.5453);}\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float grain=stoneGrain(floor(vMasonry*23.0));
    float stain=stoneGrain(floor(vMasonry*1.7));
    diffuseColor.rgb*=.62+.25*grain+.13*stain;`);
  };material.customProgramCacheKey=()=> 'weathered-masonry-v1';
 }
 const dressed=new BoxGeometry(1,1,1);
 // Small chipped corners, rather than perfectly sharp white paving bars.
 const p=dressed.getAttribute('position');
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const chip=.012*(1+Math.sin(x*13+y*19+z*23));
  p.setXYZ(i,x-Math.sign(x)*chip,y-Math.sign(y)*chip*.35,z-Math.sign(z)*chip);
 }dressed.computeVertexNormals();
 const stone=(x:number,y:number,z:number,w:number,h:number,d:number,index?:number)=>batch.add(dressed,materials[index??Math.floor(random()*materials.length)],[x-50,y,z-50],[w,h,d]);
 const height=(x:number,y:number)=>sampleCampSurface({x,y},seed).height;
 const terraceTop=height(50,-45)+.17;
 // A thick foundation extends beyond the generated ground apron on every side.
 // The apron remains intact, surrounded by actual coping and retaining courses.
 for(let z=-69;z<-21;z+=3)for(let x=19;x<81;x+=3){
  const w=Math.min(3,81-x),d=Math.min(3,-21-z),cx=x+w/2,cz=z+d/2;
  const bottom=Math.min(height(cx,cz)-.35,terraceTop-.5);
  stone(cx,(bottom+terraceTop)/2,cz,w+.025,terraceTop-bottom,d+.025);
 }
 // The level forecourt overlaps the model's own entrance steps and reaches
 // the head of the staircase: no strip of exposed grass between them.
 for(let z=-27;z<-14;z+=1.3)for(let x=39;x<61;x+=2.75){
  stone(x+1.375,terraceTop-.19,z+.65,2.78,.38,1.34);
 }
 const steps:{front:number;back:number;top:number;bottom:number}[]=[];
 for(let i=0;i<34;i++){
  const front=20-i,back=front-1,top=height(50,back)+.17,bottom=Math.min(height(50,front)-.32,top-.45);
  steps.push({front,back,top,bottom});
  // Full-depth risers, tightly joined staggered stones and a projecting nose.
  for(let j=0;j<6;j++){
   const x=41+(j+.5)*3;
   stone(x,(top+bottom)/2,(front+back)/2,3.015,top-bottom,1.08);
   stone(x,top-.09,front-.04,3.03,.18,.2,2);
  }
  for(const side of [-1,1]){
   const x=50+side*9.65,base=Math.min(height(x,front),height(x,back))-.35,cap=top+.52;
   stone(x,(base+cap)/2,(front+back)/2,1.3,cap-base,1.08,3);
   stone(x,cap-.12,(front+back)/2,1.52,.24,1.1);
  }
 }
 // Worn arrival paving tapers into the dirt avenue rather than stopping in a
 // clean rectangular cut. Sparse partly buried rubble grounds the plinth.
 for(let row=0;row<4;row++)for(let col=-4;col<=4;col++){
  if(random()<row*.18)continue;
  const x=50+col*2+(random()-.5)*.3,z=20.5+row*1.15;
  stone(x,height(x,z)-.055,z,1.9,.2,1.15);
 }
 for(let i=0;i<80;i++){
  const side=i%2?-1:1,x=50+side*(31+random()*2.4),z=-69+random()*47;
  const size=.22+random()*.6;
  batch.add(shapes.rock,materials[3],[x-50,height(x,z)-size*.15,z-50],[size,size*.4,size*.8],[random(),random()*6.28,0]);
 }
 group.add(batch.finish('风化石阶、砌石台基与压顶石'));
 return {group,steps,terraceTop,dispose(){group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});dressed.dispose();materials.forEach(m=>m.dispose());group.clear();}};
}
