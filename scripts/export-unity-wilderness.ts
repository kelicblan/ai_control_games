import { createHash } from 'node:crypto';
import { Mesh, Object3D, MeshStandardMaterial } from 'three';
import { Shapes } from '../src/scene/geometry';
import { createWilderness } from '../src/scene/wilderness';
import type { GameState } from '../src/games/camp/simulation/types';
import { sampleCampSurface } from '../src/games/camp/world/definition';

interface NativeNode {name:string;position:number[];rotation:number[];scale:number[];role?:string;mesh?:string;material?:string;children:NativeNode[]}
/** Preserve the existing procedural art; Unity does not regenerate ecology rules. */
export function exportNativeWilderness(state:GameState){
  const shapes=new Shapes(),art=createWilderness(shapes);art.update(state,0,{x:50,y:65},true);
  const meshes:Record<string,{positions:number[];normals:number[];uv:number[];indices:number[]}>= {};
  const materials:Record<string,{color:string;roughness:number;metalness:number}>= {};
  const templates:Record<string,NativeNode>={};
  const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  function node(object:Object3D):NativeNode{
    const result:NativeNode={name:object.name||'Source geometry',position:object.position.toArray(),rotation:object.quaternion.toArray(),scale:object.scale.toArray(),children:object.children.map(node)};
    if(object instanceof Mesh){
      if(Array.isArray(object.material)||!(object.material instanceof MeshStandardMaterial)||object.material.map)throw new Error('Unsupported procedural ecology material');
      const g=object.geometry;
      const geometry={positions:Array.from(g.getAttribute('position').array,Number),normals:Array.from(g.getAttribute('normal').array,Number),uv:g.getAttribute('uv')?Array.from(g.getAttribute('uv').array,Number):[],indices:g.index?Array.from(g.index.array,Number):Array.from({length:g.getAttribute('position').count},(_,i)=>i)};
      const material={color:'#'+object.material.color.getHexString(),roughness:object.material.roughness,metalness:object.material.metalness};
      result.mesh=fingerprint(geometry);meshes[result.mesh]=geometry;result.material=fingerprint(material);materials[result.material]=material;
    }
    return result;
  }
  try{
    const ecology=state.world!.ecology!;
    for(const resource of ecology.resources)if(!templates[resource.kind]){
      const root=art.group.children.find(c=>c.name===resource.id)!;const template=node(root);template.name=resource.kind;template.position=[0,0,0];template.children.at(-1)!.role='crop';templates[resource.kind]=template;
    }
    for(const animal of ecology.animals)if(!templates[animal.species]){
      const root=art.group.children.find(c=>c.name===`wildlife-${animal.id}`)!;const template=node(root);template.name=animal.species;template.position=[0,0,0];template.rotation=[0,0,0,1];
      const count=animal.species==='pheasant'?2:4;for(const leg of template.children.slice(-count))leg.role='leg';template.children[template.children.length-count-1].role='head';templates[animal.species]=template;
    }
    const resources=ecology.resources.map(r=>({...r,height:sampleCampSurface(r.position,state.seed).height}));
    const animals=ecology.animals.map(a=>({...a,height:sampleCampSurface(a.position,state.seed).height}));
    return {version:1,source:'src/scene/wilderness.ts',meshes,materials,templates,resources,animals};
  }finally{art.dispose();shapes.dispose();}
}
