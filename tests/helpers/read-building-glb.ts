import {readFileSync} from 'node:fs';
import {BufferAttribute,BufferGeometry,DoubleSide,Group,Mesh,MeshBasicMaterial} from 'three';

/** Geometry-only fixture: no DOM, canvas or texture decoder required. */
export function readBuildingGlb(kind:string):Group {
 const bytes=readFileSync(new URL(`../../public/assets/models/valley/${kind}/model.glb`,import.meta.url));
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
 const binary=bytes.subarray(28+length),source=new Group();
 function attribute(index:number,size:number){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],offset=binary.byteOffset+(view.byteOffset??0)+(a.byteOffset??0);
  const ArrayType=a.componentType===5126?Float32Array:a.componentType===5125?Uint32Array:Uint16Array;
  return new BufferAttribute(new ArrayType(binary.buffer,offset,a.count*size),size);
 }
 for(const node of json.nodes){
  if(node.mesh===undefined)continue;
  const group=new Group();if(node.translation)group.position.fromArray(node.translation);if(node.rotation)group.quaternion.fromArray(node.rotation);if(node.scale)group.scale.fromArray(node.scale);
  for(const primitive of json.meshes[node.mesh].primitives){
   const geometry=new BufferGeometry();geometry.setAttribute('position',attribute(primitive.attributes.POSITION,3));
   if(primitive.attributes.TEXCOORD_0!==undefined)geometry.setAttribute('uv',attribute(primitive.attributes.TEXCOORD_0,2));
   if(primitive.attributes.NORMAL!==undefined)geometry.setAttribute('normal',attribute(primitive.attributes.NORMAL,3));
   for(const name of ['_EXPOSEDROCK','_ROADWEAR'])if(primitive.attributes[name]!==undefined)geometry.setAttribute(name.toLowerCase(),attribute(primitive.attributes[name],1));
   if(primitive.indices!==undefined)geometry.setIndex(attribute(primitive.indices,1));
   group.add(new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide})));
  }
  source.add(group);
 }
 return source;
}
