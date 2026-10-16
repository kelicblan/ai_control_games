import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial,Raycaster,ShaderLib, Vector3,type WebGLRenderer } from 'three';
import { createSettlementHomes } from '../src/scene/settlementHomes';
import { CAMP_HOUSES, sampleCampSurface } from '../src/games/camp/world/definition';
import { readBuildingGlb } from './helpers/read-building-glb';
import { worldCanTraverse } from '../src/games/camp/world/navigation';

describe('full-size habitable houses', () => {
  it('provides standing headroom, a room across the footprint, and a closed back wall', async () => {
    const homes = createSettlementHomes(CAMP_HOUSES, async kind => readBuildingGlb(kind)); await homes.ready;
    homes.group.updateMatrixWorld(true);
    const ray = Object.assign(new Raycaster(), { firstHitOnly: true });
    for (const house of CAMP_HOUSES) {
      const base = sampleCampSurface(house.center, 17).height;
      expect(house.wallHeight).toBeGreaterThanOrEqual(14);
      for(const dx of [-1.2,0,1.2])for(const height of [3,8]){
        ray.set(new Vector3(house.center.x-50+dx,base+height,house.center.y-50+house.half.y+3),new Vector3(0,0,-1));
        expect(ray.intersectObject(homes.group,true)[0]?.distance).toBeGreaterThan(house.half.y*2+1);
      }
      // At head height, one can cross the room sideways, not merely its doorway corridor.
      for (const z of [-house.half.y * .5, 0, house.half.y * .5]) {
        const origin = new Vector3(house.center.x - 50, base + 8, house.center.y - 50 + z);
        ray.set(origin, new Vector3(1, 0, 0));
        const hit = ray.intersectObjects(homes.group.children, true)[0];
        expect(hit?.distance).toBeGreaterThanOrEqual(house.half.x - 1);
        expect(worldCanTraverse({ x: house.center.x - house.half.x * .6, y: house.center.y + z },
          { x: house.center.x + house.half.x * .6, y: house.center.y + z }, 17)).toBe(true);
      }
      ray.set(new Vector3(house.center.x - 50, base + 8, house.center.y - 50), new Vector3(0, 0, -1));
      expect(Math.abs(ray.intersectObjects(homes.group.children, true)[0]!.distance-house.half.y)).toBeLessThan(.6);
      const room = homes.group.getObjectByName(`${house.id} full-size room`);
      expect(room).toBeDefined();
      const exterior=homes.group.getObjectByName(`${house.id} Tripo model`)!;
      const material=(exterior.children[0] as Mesh).material as MeshStandardMaterial;
      const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}} as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader,{} as WebGLRenderer);
      expect(shader.fragmentShader).toContain('uniform float roomView');
      expect(shader.fragmentShader).not.toMatch(/roomPoint\.\w<[0-9]+(?:&&|\))/);
      homes.setCameraPosition?.({x:house.center.x-50,y:base+8,z:house.center.y-50});expect(shader.uniforms.roomView.value).toBe(1);
      homes.setCameraPosition?.({x:0,y:200,z:0});expect(shader.uniforms.roomView.value).toBe(0);
      for(const dx of [-.6,0,.6])for(const dz of [-.5,0,.5]){
        ray.set(new Vector3(house.center.x-50+dx*house.half.x,base+house.roofHeight+10,house.center.y-50+dz*house.half.y),new Vector3(0,-1,0));
        expect(ray.intersectObject(exterior,true)[0]?.point.y).toBeGreaterThan(base+house.wallHeight+.2);
      }
    }
    const sign = homes.group.getObjectByName('lord-house nameplate') as Mesh;
    expect(sign?.userData.text).toBe('领主府');
    let meshes=0;homes.group.traverse(object=>{if(object instanceof Mesh)meshes++;});expect(meshes).toBeLessThan(CAMP_HOUSES.length*20);
    homes.dispose();
  }, 20000);
});
