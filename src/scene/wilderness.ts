import { Group, Mesh, type Material, type BufferGeometry } from 'three';
import { Shapes, StaticBatch, material, addMesh } from './geometry';
import { walkingHeight } from '../games/camp/world/definition';
import type { GameState, Point } from '../games/camp/simulation/types';
import type { Animal, ResourcePatch } from '../games/camp/world/ecology';

interface PatchRig {root:Group;crop:Group;remaining:number}
interface AnimalRig {root:Group;legs:Group[];head:Group;last:Point}
/** Snapshot projection only. No timers, random outcomes or ecology mutations live here. */
export function createWilderness(shapes:Shapes){
  const group=new Group();group.name='Wilderness resources and wildlife';
  const palette={bark:material('#76543a'),cut:material('#c9a06b'),leaf:material('#497441'),pine:material('#355b3b'),berry:material('#a72e37'),root:material('#c49b68'),mushroom:material('#d2b79c'),
    rabbit:material('#a8957f'),cream:material('#ddd1b7'),pheasant:material('#90673e'),green:material('#326b50'),red:material('#b94532'),boar:material('#635446'),tiger:material('#c48939'),black:material('#302c26')};
  const patches=new Map<string,PatchRig>(),animals=new Map<string,AnimalRig>();
  const put=(parent:Group,mat:Material,p:[number,number,number],s:[number,number,number],shape:BufferGeometry=shapes.sphere)=>addMesh(parent,shape,mat,p,s);
  function patch(r:ResourcePatch,seed:number){
    const root=new Group(),crop=new Group(),batch=new StaticBatch();root.name=r.id;root.position.set(r.position.x-50,walkingHeight(r.position,seed),r.position.y-50);
    if(r.kind==='wood'){
      // Permanent stump/collision footprint remains after the crown is felled.
      batch.add(shapes.cylinder,palette.bark,[0,.65,0],[.85,1.3,.85]);batch.add(shapes.cylinder,palette.cut,[0,1.31,0],[.77,.04,.77]);
      const tree=new StaticBatch();tree.add(shapes.taper,palette.bark,[0,5.4,0],[.8,9,.8]);
      for(let j=0;j<3;j++)tree.add(shapes.cone,palette.pine,[0,9.5+j*3,0],[5-j*.8,7,5-j*.8]);
      crop.add(tree.finish('Harvestable pine crown'));
    }else{
      const plants=new StaticBatch(),food=new StaticBatch();
      for(let j=0;j<7;j++){
        const angle=j*2.399,x=Math.cos(angle)*(1+j*.35),z=Math.sin(angle)*(1+j*.35);
        if(r.kind==='berries'){
          plants.add(shapes.sphere,palette.leaf,[x,.9,z],[1.5,1.2,1.5]);
          for(let k=0;k<4;k++)food.add(shapes.sphere,palette.berry,[x+Math.cos(k*1.8)*.85,1.45+(k%2)*.25,z+Math.sin(k*1.8)*.85],[.23,.23,.23]);
        }else if(r.kind==='mushrooms'){
          plants.add(shapes.cylinder,palette.cream,[x,.35,z],[.12,.7,.12]);food.add(shapes.halfSphere,palette.mushroom,[x,.65,z],[.6,.28,.6]);
        }else{
          for(let k=0;k<4;k++)plants.add(shapes.sphere,palette.leaf,[x+Math.cos(k*1.57)*.35,.35,z+Math.sin(k*1.57)*.35],[.22,.7,.55],[.5,0,k*1.57]);
          food.add(shapes.sphere,r.kind==='roots'?palette.root:palette.leaf,[x,.2,z],[.4,.3,.4]);
        }
      }
      root.add(plants.finish('Persistent forage leaves'));crop.add(food.finish('Ripe edible harvest'));
    }
    root.add(batch.finish('Resource ground footprint'),crop);group.add(root);
    const rig={root,crop,remaining:-1};patches.set(r.id,rig);return rig;
  }
  function animal(a:Animal){
    const root=new Group(),head=new Group(),batch=new StaticBatch(),legs:Group[]=[];
    root.name=`wildlife-${a.id}`;const bird=a.species==='pheasant',rabbit=a.species==='rabbit',tiger=a.species==='tiger';
    const size=rabbit?1:bird?1:tiger?2.7:2.2,skin=palette[a.species];root.scale.setScalar(size);
    batch.add(shapes.sphere,skin,[0,bird?1:1.05,0],[rabbit?.65:bird?.55:.72,rabbit?.65:.65,rabbit?1:bird?.9:1.5]);
    if(tiger){
      batch.add(shapes.sphere,palette.cream,[0,.85,.8],[.56,.45,.7]);
      for(let j=0;j<7;j++)for(const side of [-1,1])batch.add(shapes.box,palette.black,[side*.65,1.15,-1.05+j*.35],[.07,.73,.09],[0,0,side*.2]);
    }
    if(bird){batch.add(shapes.cone,palette.pheasant,[0,1,-1.5],[.3,2,.3],[Math.PI/2,0,0]);put(head,palette.green,[0,0,0],[.32,.4,.32]);put(head,palette.red,[.23,0,.17],[.12,.16,.17]);put(head,palette.root,[0,-.03,.36],[.14,.14,.23]);}
    else {
      put(head,skin,[0,0,0],[rabbit?.42:.58,rabbit?.45:.53,rabbit?.5:.65]);put(head,palette.cream,[0,-.2,.45],[.3,.22,.25]);
      for(const side of [-1,1]){
        put(head,skin,[side*.27,rabbit?.75:.48,-.05],rabbit?[.13,.75,.15]:[.23,.22,.13]);
        put(head,palette.black,[side*.32,.12,.35],[.065,.075,.07]);
        if(a.species==='boar')put(head,palette.cream,[side*.3,-.18,.6],[.08,.34,.08],shapes.cone);
      }
      const tail=put(root,tiger?palette.tiger:skin,[0,1,-1.6],tiger?[.15,.15,1.1]:[.22,.25,.3]);tail.rotation.x=-.3;
    }
    head.position.set(0,bird?1.65:1.25,rabbit?.9:bird?.65:1.3);root.add(batch.finish(`${a.species} body`),head);
    for(let i=0;i<(bird?2:4);i++){
      const leg=new Group();leg.position.set((i%2?1:-1)*(bird?.28:.43),.65,bird?0:(i<2?.9:-.9));
      put(leg,bird?palette.root:skin,[0,-.35,0],bird?[.08,.6,.08]:[.18,.7,.2],shapes.cylinder);root.add(leg);legs.push(leg);
    }
    const rig={root,legs,head,last:{...a.position}};animals.set(a.id,rig);group.add(root);return rig;
  }
  function update(state:GameState,time:number,focus:Point,reducedMotion:boolean){
    const e=state.world?.ecology;if(!e)return;
    const observers=[...state.npcs.filter(n=>n.alive),...(state.lord?[state.lord]:[])];
    for(const r of e.resources){
      const rig=patches.get(r.id)??patch(r,state.seed);
      rig.root.visible=Math.hypot(r.position.x-focus.x,r.position.y-focus.y)<600;
      if(rig.remaining!==r.remaining){rig.remaining=r.remaining;rig.crop.visible=r.remaining>0;rig.crop.scale.setScalar(r.kind==='wood'?1:.4+.6*r.remaining/r.capacity);}
    }
    let visible=0;
    for(const a of e.animals){
      const rig=animals.get(a.id)??animal(a),near=Math.hypot(a.position.x-focus.x,a.position.y-focus.y)<380;
      rig.root.visible=a.health>0&&near&&observers.some(n=>Math.hypot(n.position.x-a.position.x,n.position.y-a.position.y)<110);
      if(!rig.root.visible)continue;visible++;
      const moving=a.mode!=='idle',phase=reducedMotion||state.status!=='playing'?0:time*(a.mode==='flee'||a.mode==='charge'?12:5);
      rig.root.position.set(a.position.x-50,walkingHeight(a.position,state.seed)+(moving?Math.abs(Math.sin(phase))*.13:0),a.position.y-50);
      rig.root.rotation.y=Math.PI/2-a.heading;
      rig.legs.forEach((leg,i)=>leg.rotation.x=moving?Math.sin(phase+(i%2?Math.PI:0)+(i>1?Math.PI:0))*.55:0);
      rig.head.rotation.x=a.mode==='graze'?.25:0;rig.last={...a.position};
    }
    group.userData.visibleAnimals=visible;group.userData.resourceCount=e.resources.length;
  }
  function reset(){for(const child of [...group.children]){child.traverse(o=>{if(o instanceof Mesh&&!Object.values(shapes).includes(o.geometry))o.geometry.dispose();});group.remove(child);}patches.clear();animals.clear();}
  return {group,update,reset,dispose(){reset();Object.values(palette).forEach(m=>m.dispose());}};
}
