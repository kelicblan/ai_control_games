import { coordinateRandom } from '../../../../packages/world-core/src';
import type { Point } from '../simulation/types';
import { sampleCampSurface, treeAt } from './definition';
import { insideSettlement } from './settlement';

export type ResourceKind = 'wood' | 'berries' | 'greens' | 'roots' | 'mushrooms';
export interface ResourceSite { id:string; kind:ResourceKind; position:Point; stand:Point; capacity:number; recovery:number }
export const RESOURCE_NAMES:Record<ResourceKind,string>={wood:'林地木材',berries:'浆果',greens:'野菜',roots:'块根',mushrooms:'可食菌菇'};
const cache=new Map<number,readonly ResourceSite[]>();
/** Geography-only generation: renderer and collision query the same immutable sites. */
export function wildernessSites(seed:number):readonly ResourceSite[] {
  const prior=cache.get(seed);if(prior)return prior;
  const sites:ResourceSite[]=[];
  for(const [kind,count] of [['wood',24],['berries',16],['greens',16],['roots',16],['mushrooms',12]] as const){
    for(let i=0;i<count;i++)for(let attempt=0;attempt<160;attempt++){
      const salt=i+attempt*count+({wood:1000,berries:2000,greens:3000,roots:4000,mushrooms:5000})[kind];
      const position={x:-110+coordinateRandom(salt,0,seed)*235,y:315+coordinateRandom(salt,1,seed)*225};
      const stand={x:position.x+3.4,y:position.y+1.2},surface=sampleCampSurface(position,seed),other=sampleCampSurface(stand,seed);
      if(surface.water||other.water||surface.road>.05||surface.height>30||insideSettlement(position.x,position.y,18)
        ||Math.abs(surface.height-other.height)>1.7||sites.some(s=>Math.hypot(s.position.x-position.x,s.position.y-position.y)<9))continue;
      let treeNear=false;
      for(let cy=Math.floor(position.y/20)-2;cy<=Math.floor(position.y/20)+2;cy++)for(let cx=Math.floor(position.x/20)-2;cx<=Math.floor(position.x/20)+2;cx++){
        const tree=treeAt(cx,cy,seed);if(tree&&Math.hypot(tree.point.x-position.x,tree.point.y-position.y)<7)treeNear=true;
      }
      if(treeNear)continue;
      sites.push({id:`${kind}-${i}`,kind,position,stand,capacity:kind==='wood'?12:kind==='roots'?10:8,recovery:kind==='wood'?2400:kind==='mushrooms'?480:300});break;
    }
  }
  cache.set(seed,sites);if(cache.size>4)cache.delete(cache.keys().next().value!);return sites;
}
