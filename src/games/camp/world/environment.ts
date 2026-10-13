import { TERRAIN } from '../simulation/terrain';
import { Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createEnvironment as createCampEnvironment } from '../../../scene/environment';
import type { CampEnvironment } from '../../../scene/environment';
import { RainSurfaces } from '../../../scene/rainSurfaces';
import { Shapes } from '../../../scene/geometry';
import { createThatchedHouses } from '../../../../packages/world-three/src/buildings';
import { CAMP_HOUSES } from './definition';

/** 只适配营地特有的布景和动作标签，公共世界/房屋模块不依赖游戏状态。 */
export function createExpandedCamp(shapes:Shapes,origin:Vector3):CampEnvironment & {dispose:()=>void} {
  const camp=createCampEnvironment(shapes,{terrain:TERRAIN,legacyShelter:false}),houses=createThatchedHouses(CAMP_HOUSES);
  camp.group.add(houses.group);
  // 保留原天气、火焰、近景植被和精细溪流；地面由连续地形接管。
  for(const name of ['Continuous modeled earth','Rest shelter canvas awning','Fluttering awning hem']){
    const object=camp.group.getObjectByName(name);if(object)object.visible=false;
  }
  const crew=CAMP_HOUSES[1];
  camp.markers.push({id:'rest',action:'rest',name:'伙伴长屋',point:new Vector3(crew.center.x-50,crew.roofHeight+1.2,crew.center.y-50)});
  const proxy=new Mesh(shapes.box,new MeshBasicMaterial());
  proxy.position.set(crew.center.x-50,crew.wallHeight/2,crew.center.y-50);
  proxy.scale.set(crew.half.x*2,crew.wallHeight,crew.half.y*2);proxy.userData.action='rest';proxy.updateMatrixWorld();camp.pickables.push(proxy);
  // 雨滴使用真实茅草屋顶，不再落到已隐藏的旧布棚上。
  // 旧天气粒子仍以营地世界坐标工作，射线查询时显式换算渲染原点。
  class WorldRainSurfaces extends RainSurfaces {
    override intersect(x:number,z:number,leanX:number,leanZ:number,point:Vector3,normal?:Vector3):boolean {
      const hit=super.intersect(x-origin.x,z-origin.z,leanX,leanZ,point,normal);
      if(hit){point.x+=origin.x;point.z+=origin.z;}return hit;
    }
    override eave(fraction:number,point:Vector3){super.eave(fraction,point);point.x+=origin.x;point.z+=origin.z;}
  }
  const surfaces=new WorldRainSurfaces(houses.roofs,houses.roofs[1]);
  return {...camp,rainSurfaces:surfaces,update(time,game,reducedMotion){
    camp.update(time,game,reducedMotion);
    houses.setSelectedPosition(game.npcs.find(npc=>npc.id===game.selectedNpc&&npc.alive)?.position??null);
    surfaces.refresh();
  },dispose(){houses.dispose();}};
}
