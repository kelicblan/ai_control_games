import type { GameState, Npc, Point } from '../simulation/types';
import { coordinateRandom } from '../../../../packages/world-core/src';
import { wildernessSites, RESOURCE_NAMES, type ResourceSite } from './wildernessSites';
import { worldCanTraverse } from './navigation';
import { insideSettlement } from './settlement';

export { RESOURCE_NAMES };
export type Species='rabbit'|'pheasant'|'boar'|'tiger';
export const ANIMAL_NAMES:Record<Species,string>={rabbit:'兔子',pheasant:'野鸡',boar:'野猪',tiger:'老虎'};
export interface ResourcePatch extends ResourceSite { remaining:number; readyAt:number; discovered:boolean }
export interface Animal {id:string;species:Species;home:Point;position:Point;heading:number;health:number;mode:'idle'|'graze'|'flee'|'charge'|'dead';nextTurn:number;respawnAt:number;attackAt:number;alertUntil:number}
export interface Ecology {version:1;updatedAt:number;resources:ResourcePatch[];animals:Animal[]}
export interface WildTask {kind:'gather'|'hunt';targetId:string;label:string;phase:'travel'|'work'|'return';startedAt:number;stalledFor:number;meat:boolean}
const gap=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function createEcology(seed:number,elapsed=0):Ecology {
  const resources=wildernessSites(seed).map(s=>({...s,position:{...s.position},stand:{...s.stand},remaining:s.capacity,readyAt:0,discovered:false}));
  const animals:Animal[]=[];
  for(const [species,count] of [['rabbit',22],['pheasant',15],['boar',5],['tiger',1]] as const)for(let i=0;i<count;i++){
    let home:Point={x:-180,y:610};
    for(let attempt=0;attempt<120;attempt++){
      const n=i+attempt*count+({rabbit:110,pheasant:220,boar:330,tiger:440})[species];
      const candidate=species==='tiger'?{x:-200+coordinateRandom(n,0,seed)*50,y:660+coordinateRandom(n,1,seed)*60}
        :species==='boar'?{x:-125+coordinateRandom(n,0,seed)*60,y:490+coordinateRandom(n,1,seed)*70}
        :{x:-90+coordinateRandom(n,0,seed)*215,y:325+coordinateRandom(n,1,seed)*210};
      if(!insideSettlement(candidate.x,candidate.y,30)&&worldCanTraverse(candidate,candidate,seed)){home=candidate;break;}
    }
    animals.push({id:`${species}-${i}`,species,home,position:{...home},heading:coordinateRandom(i,count,seed)*Math.PI*2-Math.PI,health:species==='tiger'?100:species==='boar'?60:20,
      mode:'graze',nextTurn:elapsed+1+i%7,respawnAt:0,attackAt:0,alertUntil:0});
  }
  return {version:1,updatedAt:elapsed,resources,animals};
}
export function ensureEcology(state:GameState):Ecology {return state.world!.ecology??=createEcology(state.seed,state.elapsed);}
export function resourceFor(state:GameState,npc:Npc):ResourcePatch|undefined {return state.world?.ecology?.resources.find(r=>r.id===npc.wildTask?.targetId);}
export function animalFor(state:GameState,npc:Npc):Animal|undefined {return state.world?.ecology?.animals.find(a=>a.id===npc.wildTask?.targetId);}
export function threatNear(state:GameState,point:Point):Animal|undefined {
  return state.world?.ecology?.animals.find(a=>a.health>0&&((a.species==='tiger'&&gap(a.position,point)<65)||(a.species==='boar'&&a.mode==='charge'&&gap(a.position,point)<25)));
}
/** Reservations derive from living active tasks, so cancellation/death cannot leak a lock. */
export function chooseWildTask(state:GameState,npc:Npc,hunt=false):boolean {
  const ecology=ensureEcology(state);
  const busy=new Set(state.npcs.filter(n=>n.id!==npc.id&&n.alive&&n.action!==null&&n.wildTask&&n.wildTask.phase!=='return').map(n=>n.wildTask!.targetId));
  if(state.world?.gateOpen===false&&insideSettlement(npc.position.x,npc.position.y))return false;
  if(hunt){
    const target=ecology.animals.filter(a=>a.health>0&&a.species!=='tiger'&&(a.species!=='boar'||npc.personality.bravery>.7&&npc.health>75)&&!busy.has(a.id)&&!threatNear(state,a.position))
      .sort((a,b)=>gap(npc.position,a.position)-gap(npc.position,b.position))[0];
    if(!target)return false;
    npc.wildTask={kind:'hunt',targetId:target.id,label:ANIMAL_NAMES[target.species],phase:'travel',startedAt:state.elapsed,stalledFor:0,meat:false};
    npc.destination={...target.position};npc.actionDuration=target.species==='boar'?12:7;return true;
  }
  const kind=npc.action==='wood'?'wood':'food';
  const score=(r:ResourcePatch)=>{
    const via=insideSettlement(npc.position.x,npc.position.y)?gap(npc.position,{x:50,y:205})+gap({x:50,y:300},r.stand)+95:gap(npc.position,r.stand);
    return via*2/(Math.min(r.remaining,kind==='wood'?4:4))+(r.kind==='mushrooms'?25*(1-npc.personality.bravery):0);
  };
  const candidates=ecology.resources.filter(r=>(kind==='wood'?r.kind==='wood':r.kind!=='wood')&&r.remaining>0&&!busy.has(r.id)&&!threatNear(state,r.stand)).sort((a,b)=>score(a)-score(b));
  const target=candidates.find(r=>worldCanTraverse(r.stand,r.stand,state.seed,state.world?.gateOpen??true));
  if(!target)return false;
  npc.wildTask={kind:'gather',targetId:target.id,label:RESOURCE_NAMES[target.kind],phase:'travel',startedAt:state.elapsed,stalledFor:0,meat:false};
  npc.destination={...target.stand};return true;
}
export function harvestResource(state:GameState,npc:Npc):number {
  const target=resourceFor(state,npc);
  if(!target||!npc.wildTask||npc.wildTask.kind!=='gather'||npc.wildTask.phase==='return'||npc.inventory.wood||npc.inventory.food||target.remaining<=0||gap(npc.position,target.stand)>2||insideSettlement(npc.position.x,npc.position.y))return 0;
  const quantity=Math.min(target.remaining,target.kind==='wood'?(state.difficulty==='cozy'?4:3):4);
  target.remaining-=quantity;target.readyAt=state.elapsed+target.recovery;
  if(target.kind==='wood')npc.inventory.wood=quantity;else npc.inventory.food=quantity;
  npc.wildTask.phase='return';return quantity;
}
export function wildTaskLabel(npc:Npc):string|undefined {
  const task=npc.wildTask;if(!task)return undefined;
  if(task.phase==='return')return `返寨${task.meat?'处理猎物':'入库'} · ${npc.inventory.wood?`木材 ${npc.inventory.wood}`:`食物 ${npc.inventory.food}`}`;
  return `${task.kind==='hunt'?'狩猎':'采集'}${task.label} · ${task.phase==='work'?'劳作中':'前往寨外'}`;
}
/** Strict bounded decoder. Canonical resource geography is checked against the seed. */
export function validEcology(raw:unknown,seed:number):raw is Ecology {
  if(!raw||typeof raw!=='object')return false;
  const e=raw as Ecology,finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
  const point=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<2000&&Math.abs(p.y)<2000;
  if(Object.keys(e).sort().join(',')!=='animals,resources,updatedAt,version'||e.version!==1||!finite(e.updatedAt)||!Array.isArray(e.resources)||!Array.isArray(e.animals)||e.animals.length!==43)return false;
  const sites=wildernessSites(seed);if(e.resources.length!==sites.length)return false;
  if(!e.resources.every((r,i)=>{const s=sites[i];return r&&Object.keys(r).sort().join(',')==='capacity,discovered,id,kind,position,readyAt,recovery,remaining,stand'
    &&r.id===s.id&&r.kind===s.kind&&r.capacity===s.capacity&&r.recovery===s.recovery&&point(r.position)&&r.position.x===s.position.x&&r.position.y===s.position.y
    &&point(r.stand)&&r.stand.x===s.stand.x&&r.stand.y===s.stand.y&&Number.isInteger(r.remaining)&&r.remaining>=0&&r.remaining<=r.capacity&&finite(r.readyAt)&&typeof r.discovered==='boolean';}))return false;
  const counts:Record<Species,number>={rabbit:0,pheasant:0,boar:0,tiger:0};
  for(const a of e.animals){if(!a||!Object.hasOwn(counts,a.species)||a.id!==`${a.species}-${counts[a.species]++}`
    ||Object.keys(a).sort().join(',')!=='alertUntil,attackAt,heading,health,home,id,mode,nextTurn,position,respawnAt,species'
    ||!point(a.home)||!point(a.position)||!Number.isFinite(a.heading)||a.heading< -Math.PI||a.heading>Math.PI||!finite(a.health)||a.health>100
    ||!['idle','graze','flee','charge','dead'].includes(a.mode)||!finite(a.nextTurn)||!finite(a.respawnAt)||!finite(a.attackAt)||!finite(a.alertUntil)||(a.mode==='dead')!==(a.health===0))return false;}
  return counts.rabbit===22&&counts.pheasant===15&&counts.boar===5&&counts.tiger===1;
}
export function validWildTask(raw:unknown):raw is WildTask {
  if(!raw||typeof raw!=='object')return false;const t=raw as WildTask;
  return Object.keys(t).sort().join(',')==='kind,label,meat,phase,stalledFor,startedAt,targetId'&&['gather','hunt'].includes(t.kind)&&typeof t.targetId==='string'&&t.targetId.length<40
    &&typeof t.label==='string'&&t.label.length<40&&['travel','work','return'].includes(t.phase)&&Number.isFinite(t.startedAt)&&t.startedAt>=0&&Number.isFinite(t.stalledFor)&&t.stalledFor>=0&&typeof t.meat==='boolean';
}
