import { Group, Mesh, Texture, type Material } from 'three';
import type { ThatchedHouse } from './buildings';

// Measured landmarks of Tripo task 2e186652-a740-4cf9-97c6-b01ac8d524ce.
// Fit the walls and doorway, rather than stretching the large roof overhang
// to the collision footprint. Keep the original GLB unchanged.
export function fitThatchedCottage(source:Group,house:ThatchedHouse):Group {
  const model=source.clone(true);model.name=`${house.id} Tripo cottage`;
  const axis=(value:number,inner:number,outer:number,target:number,overhang:number)=>{
    const magnitude=Math.abs(value);
    return Math.sign(value)*(magnitude<=inner?magnitude/inner*target:
      target+(magnitude-inner)/(outer-inner)*overhang);
  };
  model.traverse(object=>{
    if(!(object instanceof Mesh))return;
    object.geometry=object.geometry.clone();
    const positions=object.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const ax=Math.abs(x),doorHalf=.105,wallHalf=.378;
      const fittedX=Math.sign(x)*(ax<=doorHalf?ax/doorHalf*house.doorWidth/2:
        ax<=wallHalf?house.doorWidth/2+(ax-doorHalf)/(wallHalf-doorHalf)*(house.half.x-house.doorWidth/2):
        house.half.x+(ax-wallHalf)/(.5-wallHalf)*1.2);
      const fittedY=y<=-.04?(y+.32)/.28*house.wallHeight:
        house.wallHeight+(y+.04)/(.354970932+.04)*(house.roofHeight-house.wallHeight);
      positions.setXYZ(i,fittedX,fittedY,axis(z,.215,.382803112,house.half.y,1.2));
    }
    positions.needsUpdate=true;object.geometry.computeVertexNormals();
    object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere();
    object.castShadow=true;object.receiveShadow=true;
  });
  model.position.set(house.center.x-50,0,house.center.y-50);
  return model;
}

/** Clones own their geometry but share the generated material and textures. */
export function disposeHouseModels(roots:Group[]) {
  const geometries=new Set<Mesh['geometry']>(),materials=new Set<Material>(),textures=new Set<Texture>();
  for(const root of roots)root.traverse(object=>{
    if(!(object instanceof Mesh))return;
    geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      materials.add(material);
      for(const value of Object.values(material))if(value instanceof Texture)textures.add(value);
    }
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
