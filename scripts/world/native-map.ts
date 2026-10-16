import {ExplorationMap,type MapView} from '../../packages/world-core/src';
import {MiniMapRaster} from '../../packages/world-ui/src/minimapRaster';
import {isOnBridge,sampleCampSurface} from '../../src/games/camp/world/definition';
import type {GameState} from '../../src/games/camp/simulation/types';
export class NativeMapProjection {
  private rasters=new Map<string,MiniMapRaster>();
  project(state:GameState,view:MapView){
    if(!Number.isFinite(view.center.x)||!Number.isFinite(view.center.y)||Math.abs(view.center.x)>1e7||Math.abs(view.center.y)>1e7||!Number.isFinite(view.span)||view.span<128||view.span>16384)throw new Error('地图范围无效');
    if(!state.world)throw new Error('世界尚未初始化');
    const key=JSON.stringify(state.world.exploration);let raster=this.rasters.get(key);const cached=!!raster;
    if(!raster){raster=new MiniMapRaster(ExplorationMap.restore(state.world.exploration,[1]),point=>{
      const surface=sampleCampSurface(point,state.seed);
      return isOnBridge(point)?[168,135,87]:surface.water?[76,129,143]:surface.biome==='mountain'?[138,139,116]:surface.forest>.42?[62,91,62]:[117,137,83];
    });this.rasters.set(key,raster);while(this.rasters.size>4)this.rasters.delete(this.rasters.keys().next().value!);}
    const result=raster.render(view,20000,8);
    return {width:130,height:130,rgba:Buffer.from(result.pixels).toString('base64'),pending:result.pending,x:result.x,y:result.y,step:result.step,cached};
  }
}
