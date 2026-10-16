import {BoxGeometry,Group,Mesh,MeshStandardMaterial,TorusGeometry} from 'three';
import {SETTLEMENT_GATE,SETTLEMENT_GATE_HALF_WIDTH} from '../games/camp/world/settlement';

/** Hinged solid timber leaves; pivots use the authoritative gate opening. */
export function createSettlementGate(base:number){
 const group=new Group();group.name='可开关的双扇寨门';
 group.position.set(SETTLEMENT_GATE.x-50,base,SETTLEMENT_GATE.y-50);
 const timber=new MeshStandardMaterial({color:'#68452c',roughness:.92});
 const grain=new MeshStandardMaterial({color:'#805738',roughness:.95});
 const iron=new MeshStandardMaterial({color:'#302d27',roughness:.73,metalness:.6});
 const box=new BoxGeometry(1,1,1),ring=new TorusGeometry(.38,.085,6,16);
 const leaves:Group[]=[];
 for(const side of [-1,1]){
  const leaf=new Group();leaf.name=side<0?'寨门左扇':'寨门右扇';leaf.position.x=side*SETTLEMENT_GATE_HALF_WIDTH;group.add(leaf);leaves.push(leaf);
  const width=SETTLEMENT_GATE_HALF_WIDTH;
  const add=(material:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>{
   const mesh=new Mesh(box,material);mesh.position.set(-side*x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=mesh.receiveShadow=true;leaf.add(mesh);return mesh;
  };
  for(let i=0;i<12;i++)add(i%3?timber:grain,(i+.5)*width/12,5.7,0,width/12-.025,11.2,.6);
  for(const y of [1.6,5.8,9.6]){
   add(timber,width/2,y,-.4,width-.15,.48,.4);
   add(iron,width/2,y,.335,width-.2,.18,.1);
   for(let i=0;i<6;i++)add(iron,(i+.5)*width/6,y,.41,.13,.13,.08);
   add(iron,.25,y,0,.5,.6,.85);
  }
  const brace=add(timber,width/2,5.6,-.65,.46,12.1,.3);brace.rotation.z=side*Math.atan2(width-1,9.2);
  const handle=new Mesh(ring,iron);handle.position.set(-side*(width-1),5.2,.55);leaf.add(handle);
 }
 let previous:number|undefined;
 return {group,update(open:boolean,time:number,reducedMotion=false){
  const target=open?Math.PI*.5:0,dt=previous===undefined?0:Math.max(0,Math.min(.1,time-previous));
  const factor=previous===undefined||reducedMotion?1:1-Math.exp(-dt*8);previous=time;
  for(let i=0;i<2;i++){const desired=i===0?target:-target;leaves[i].rotation.y+=(desired-leaves[i].rotation.y)*factor;}
  group.userData.open=open;
 },dispose(){box.dispose();ring.dispose();timber.dispose();grain.dispose();iron.dispose();group.clear();}};
}
