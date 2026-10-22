import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {conversationPage} from './conversation-history';
import {readExperiences} from './memory-store';
import type {Journal} from './memory-store';
// @ts-expect-error Shared map generation module.
import {REGION,terrainAt} from '../../src/games/camp/world/pixel/world.mjs';
/** Read-only adapter for the original UI. No simulation, synthetic actors or resource mutations. */
export class PixelUiProjection{
 invalidate(owner:string){this.archived.delete(owner);}
 private archived=new Map<string,Record<string,any>>();
 constructor(private db:DatabaseSync){}
 checkpoint(owner:string):Record<string,any>{
  if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='pixel_ui_resets'").get()&&this.db.prepare('SELECT 1 FROM pixel_ui_resets WHERE owner=? LIMIT 1').get(owner))return {state:{}};
  if(this.archived.has(owner))return this.archived.get(owner)!;
  for(const row of this.db.prepare('SELECT payload,checksum FROM snapshots WHERE player=? ORDER BY id DESC LIMIT 32').all(owner)){
   if(typeof row.payload!=='string'||createHash('sha256').update(row.payload).digest('hex')!==row.checksum)continue;
   try{const value=JSON.parse(row.payload);if(value?.state){this.archived.set(owner,value);return value;}}catch{/* Preserve unsupported historical bytes. */}
  }
  const empty={state:{}};this.archived.set(owner,empty);return empty;
 }
 world(owner:string,v:Record<string,any>){
  const prior=this.checkpoint(owner).state,actors=Object.entries(v.actors) as [string,any][],old=(prior.npcs??[]) as Record<string,any>[];
  const actions:Record<string,string>={GATHER_WOOD:'wood',GATHER_FOOD:'food',REST:'rest',EAT:'eat',HEAL:'help',EXPLORE:'explore',DEPOSIT:'camp'};
  const npcs=actors.filter(([id])=>id!==v.playerId).map(([id,a])=>({...old.find(n=>n.id===id),id,name:a.name,position:a.position,alive:a.body.hp>0,health:a.body.hp/a.body.maxHp*100,energy:a.body.energy,hunger:a.body.hunger,wetness:a.body.wetness,activityAction:a.activity?.action??'',downed:a.body.downed===true,action:actions[a.activity?.action]??'camp',progress:0,carrying:Object.values(a.carried).some(n=>Number(n)>0)}));
  const p=v.actors[v.playerId];return {...prior,revision:v.revision,dialogueScope:v.worldId+':pixel',status:v.paused?'paused':'playing',seed:v.seed,elapsed:v.elapsed,wood:v.inventory.wood??0,food:v.inventory.food??0,fire:prior.fire??0,npcs,lord:{...(prior.lord??{}),position:p.position},weather:v.weather,weatherUntil:v.weatherUntil,atmosphere:v.atmosphere,
   events:[...(prior.events??[]),...(v.events??[]).filter((e:any)=>e.kind!=='entity.observed').map((e:any)=>({id:Number(String(e.id).match(/(?:ev)?(\d+)$/)?.[1]??0),time:e.at??v.elapsed,kind:'info',text:e.kind+' · '+Object.entries(e.facts??{}).filter(([,x])=>typeof x==='string'||typeof x==='number').map(([k,x])=>k+': '+x).join(' ')}))],
   decisions:[...(prior.decisions??[]),...(v.events??[]).filter((e:any)=>e.kind==='policy.decision').map((e:any)=>({npcId:e.participants?.[0],action:e.facts.selectedCandidateId,source:e.facts.source,scores:e.facts.rawScores}))],
  };
 }
 raster(owner:string,x:number,y:number,span:number){
  if(![x,y,span].every(Number.isFinite)||span<128||span>32000)throw Error('地图范围无效');
  const size=130,step=span/size,left=x-span/2,top=y-span/2,rgba=Buffer.alloc(size*size*4),explored=new Set(this.db.prepare('SELECT cx,cy FROM pixel_formal_exploration WHERE owner=?').all(owner).map(c=>c.cx+':'+c.cy));
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){const px=left+(col+.5)*step,py=top+(row+.5)*step,offset=(row*size+col)*4;rgba[offset+3]=255;
   if(px<0||py<0||px>=32000||py>=32000||!explored.has(Math.floor(px/128)+':'+Math.floor(py/128)))continue;
   const color=REGION.palette[terrainAt(px,py).index];rgba[offset]=parseInt(color.slice(1,3),16);rgba[offset+1]=parseInt(color.slice(3,5),16);rgba[offset+2]=parseInt(color.slice(5,7),16);
  }return {width:size,height:size,rgba:rgba.toString('base64'),x:left,y:top,step,pending:false,cached:false};
 }
 conversations(owner:string,page:number,through?:number,scope?:string){const journal=this.checkpoint(owner).journal as Journal|undefined;if(!journal)return {items:[],total:0,npc:0,player:0,page:1,pages:1,pageSize:20,through:0,scope:'pixel:current'};
  if(scope&&scope!==journal.generation+':'+journal.branch)throw Error('对话分页所属存档已变化');return conversationPage(this.db,owner,journal,page,through);
 }
 memories(owner:string,npc:string,before?:number){const journal=this.checkpoint(owner).journal as Journal|undefined;const items=journal?readExperiences(this.db,owner,journal,npc,before,30):[];return {items,cursor:items.at(-1)?.sequence??null,generation:journal?.generation??null,branch:journal?.branch??null};}
}
