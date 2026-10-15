import './world-hud.css';
import { TERRAIN } from '../simulation/terrain';
import { Group,Mesh, MeshBasicMaterial, Vector3,TextureLoader,RepeatWrapping,SRGBColorSpace,type Texture } from 'three';
import { createEnvironment as createCampEnvironment } from '../../../scene/environment';
import type { CampEnvironment } from '../../../scene/environment';
import { RainSurfaces } from '../../../scene/rainSurfaces';
import { Shapes } from '../../../scene/geometry';
import type { HouseVisuals } from '../../../../packages/world-three/src/buildings';
import {createSettlementHomes,type SettlementAsset} from '../../../scene/settlementHomes';
import {createSettlementScenery} from '../../../scene/settlementScenery';
import {createSettlementFacilities} from '../../../scene/settlementFacilities';
import { CAMP_HOUSES } from './definition';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {LANDSCAPE_REVISION} from './landscape';

/** 只适配营地特有的布景和动作标签，公共世界/房屋模块不依赖游戏状态。 */
export function createExpandedCamp(shapes:Shapes,origin:Vector3,seed=0):CampEnvironment & {houses:HouseVisuals;terrainModel?:Group;forestModel?:Group;forestLodModel?:Group;rockTexture?:Texture;dispose:()=>void} {
  const load=typeof window==='undefined'?undefined:async(kind:SettlementAsset)=>{
      const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/valley/${kind}/model.glb${kind==='terrain'?`?revision=${LANDSCAPE_REVISION}`:''}`);
      return gltf.scene;
    };
  const camp=createCampEnvironment(shapes,{terrain:TERRAIN,legacyShelter:false,legacyRiver:false,legacyGathering:false});
  const houses=createSettlementHomes(CAMP_HOUSES,load),scenery=createSettlementScenery(shapes,load,seed),facilities=createSettlementFacilities(load,seed);
  camp.group.add(houses.group,scenery.group,facilities.group);
  houses.roofs.push(...facilities.roofs);
  const homeCamera=houses.setCameraPosition;
  houses.setCameraPosition=point=>{homeCamera?.(point);facilities.setCameraPosition(point);};
  let terrainModel:Group|undefined,bedrock:Texture|undefined,disposed=false;
  const bedrockReady=typeof window==='undefined'?Promise.resolve():new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/valley/terrain/bedrock-albedo.png`).then(texture=>{
    if(disposed){texture.dispose();return;}texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;bedrock=texture;
  }).catch(error=>console.warn('Terrain albedo unavailable; model rock texture remains active.',error));
  const terrainReady=load?load('terrain').then(source=>{
    if(source.children[0]?.userData.revision!==LANDSCAPE_REVISION)throw Error('Terrain model revision differs from its physics blueprint');
    if(disposed){source.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});return;}
    terrainModel=source;
  }).catch(error=>{console.warn('Unified terrain unavailable; shared-height fallback remains active.',error);}):Promise.resolve();
  const homeReady=houses.ready;houses.ready=Promise.all([homeReady,scenery.ready,facilities.ready,terrainReady,bedrockReady]).then(()=>{
    // Facility loading replaces its procedural roofs; keep the existing rain list live.
    houses.roofs.splice(0,houses.roofs.length,...houses.roofs.filter(roof=>roof.userData.facilityRoof!==true),...facilities.roofs);
    if(scenery.group.userData.modelState==='error'||facilities.group.userData.modelState==='error')houses.group.userData.modelState='error';
  });
  // 保留原天气、火焰、近景植被和精细溪流；地面由连续地形接管。
  for(const name of ['Continuous modeled earth','Rest shelter canvas awning','Fluttering awning hem','Detailed living woodland']){
    const object=camp.group.getObjectByName(name);if(object)object.visible=false;
  }
  const crew=CAMP_HOUSES[1];
  camp.markers.push({id:'rest',action:'rest',name:'属民居所',point:new Vector3(crew.center.x-50,crew.roofHeight+1.2,crew.center.y-50)});
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
  // Keep the stable eave envelope while rain hits the generated mesh itself.
  const surfaces=new WorldRainSurfaces(houses.roofs,houses.roofs[1].userData.under as Mesh);
  return {...camp,houses,get terrainModel(){return terrainModel;},get rockTexture(){return bedrock??scenery.rockTexture;},get forestModel(){return scenery.forestSource;},get forestLodModel(){return scenery.forestLodSource;},rainSurfaces:surfaces,update(time,game,reducedMotion){
    camp.update(time,game,reducedMotion);
    scenery.update(game.world?.gateOpen??true,time,reducedMotion||game.status!=='playing',game.atmosphere.windStrength,game.atmosphere.windAngle);
    houses.setSelectedPosition(game.npcs.find(npc=>npc.id===game.selectedNpc&&npc.alive)?.position??null);
    surfaces.refresh();
  },dispose(){disposed=true;bedrock?.dispose();houses.dispose();scenery.dispose();facilities.dispose();terrainModel?.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});}};
}
