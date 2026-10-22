import {DatabaseSync} from 'node:sqlite';
import {randomUUID,timingSafeEqual} from 'node:crypto';
// @ts-expect-error Shared native map generator.
import {REGION,VILLAGE,LANDMARKS,buildings,getChunk,atlas,minimap,viewportRaster} from '../../src/games/camp/world/pixel/world.mjs';
import type {VillageRuntime} from './village-runtime';
import {PixelUiProjection} from './pixel-ui';
export class PixelGameplay{
 private db:DatabaseSync;
 readonly ui:PixelUiProjection;
 constructor(file:string,private village:VillageRuntime,private errors:ReadonlyMap<string,string>=new Map()){this.db=new DatabaseSync(file);this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pixel_formal_exploration(owner TEXT,cx INTEGER,cy INTEGER,PRIMARY KEY(owner,cx,cy))');this.ui=new PixelUiProjection(this.db);}
 authorized(value:unknown){const expected=Buffer.from(process.env.CAMP_PIXEL_TOKEN??''),actual=Buffer.from(String(value??''));return expected.length===64&&actual.length===expected.length&&timingSafeEqual(expected,actual);}
 snapshot(owner:string,view?:{x:number;y:number;span:number}){const state=this.village.read(owner);if(!state)throw Error('正式世界尚未初始化');const p=state.actors[state.playerId].position;
  if(this.errors.has('village'))throw Error('正式世界推进失败：'+this.errors.get('village'));
  const cx=Math.floor(p.x/128),cy=Math.floor(p.y/128);for(let y=Math.max(0,cy-1);y<=Math.min(249,cy+1);y++)for(let x=Math.max(0,cx-1);x<=Math.min(249,cx+1);x++)this.db.prepare('INSERT OR IGNORE INTO pixel_formal_exploration VALUES(?,?,?)').run(owner,x,y);
  return {scope:'pixel-game',map:REGION.id,revision:state.revision,player:p,gateOpen:state.combat?.gateOpen!==false||(state.economy?.fence.hp??0)<=0,formal:true,worldId:state.worldId,paused:state.paused,tick:state.tick,
   inventory:['wood','stone','rope','food','meat'].map(resource=>({resource,amount:state.inventory[resource]??0})),explored:this.db.prepare('SELECT cx,cy FROM pixel_formal_exploration WHERE owner=?').all(owner),
   actors:Object.values(state.actors).map(a=>({id:a.id,name:a.name,x:a.position.x,y:a.position.y,hp:a.body.hp,maxHp:a.body.maxHp,downed:a.body.downed})),
   nodes:[...Object.values(state.economy?.nodes??{}).filter(n=>n.remainingHp>0).map(n=>({id:n.id,resource:n.resource,x:n.position.x,y:n.position.y,amount:n.remainingHp})),...Object.values(state.economy?.foodSources??{}).filter(n=>n.remaining>0).map(n=>({id:n.id,resource:'food',x:n.position.x,y:n.position.y,amount:n.remaining}))],
   enemies:Object.values(state.combat?.enemies??{}).map(a=>({id:a.id,name:'野兽',x:a.position.x,y:a.position.y,hp:a.hp})),
   wildlife:[...new Map([...(view&&view.span>=600?state.wildlife?.ecology.animals??[]:[]),...this.village.observePixelWildlife(owner,view??p,view?.span??400)].filter(a=>a.hp>0||a.carcass>0).map(a=>[a.id,a])).values()].map(a=>({id:a.id,name:a.species,species:a.species,x:a.position.x,y:a.position.y,hp:a.hp,amount:a.carcass})),
  };
 }
 get(owner:string,route:string,query:URLSearchParams){
  const integer=(name:string,fallback?:number)=>{const raw=query.get(name);if(raw===null&&fallback!==undefined)return fallback;if(raw===null||!/^\d{1,5}$/.test(raw))throw Error('地图整数参数错误');return Number(raw);};
  if(route==='/manifest')return {protocol:1,scope:'pixel-game',region:REGION,village:VILLAGE,landmarks:LANDMARKS,buildings:buildings(),formal:true};
  if(route==='/snapshot')return this.snapshot(owner,query.has('viewX')?{x:Math.min(31999,integer('viewX')),y:Math.min(31999,integer('viewY')),span:Math.min(600,integer('viewSpan',400))}:undefined);
  if(route==='/ui-world'){const state=this.village.read(owner);if(!state)throw Error('正式世界尚未初始化');return this.ui.world(owner,state);}
  if(route==='/trigger-debug')return this.village.triggerRecords(owner,query.get('kind')??'');
  if(route==='/diagnostics')return {errors:Object.fromEntries(this.errors),movement:this.village.pixelInputDiagnostics(owner)};
  if(route==='/viewport')return viewportRaster(integer('x'),integer('y'),integer('span'),integer('size',256));
  if(route==='/atlas')return atlas(integer('size',256));
  if(route==='/minimap')return minimap(integer('x'),integer('y'));
  if(route==='/chunk'){const c=getChunk(integer('x'),integer('y')),s=this.village.read(owner);return {...c,revision:0,props:c.props.map((p:{id:string;kind:string;resource?:string})=>({...p,kind:p.id==='gate'?(s?.combat?.gateOpen!==false||(s?.economy?.fence.hp??0)<=0?'gate-open':'gate-closed'):p.kind,resource:undefined}))};}
  throw Error('没有此地图接口');
 }
 input(owner:string,value:{x:number;y:number;worldId:string}){if(typeof value.worldId!=='string')throw Error('移动缺少世界标识');this.village.setPixelInput(owner,value,value.worldId);return {ok:true};}
 interact(owner:string,operationId:string){const s=this.village.read(owner);if(!s)throw Error('世界未初始化');if(!/^[a-zA-Z0-9-]{1,80}$/.test(operationId??''))throw Error('无效操作ID');
  const p=s.actors[s.playerId].position,e=s.economy!;let action='',targetId:string|undefined;
  if(Math.hypot(p.x-VILLAGE.gate.x,p.y-VILLAGE.gate.y)<=8)action='BUILD_FENCE';
  else if(Math.hypot(p.x-e.storePosition.x,p.y-e.storePosition.y)<=6)action='DEPOSIT';
  else {const choices=[...Object.values(e.nodes).filter(n=>n.remainingHp>0).map(n=>({id:n.id,position:n.position,action:'GATHER_'+n.resource.toUpperCase()})),...Object.values(e.foodSources??{}).filter(n=>n.remaining>0).map(n=>({id:n.id,position:n.position,action:'GATHER_FOOD'}))].sort((a,b)=>Math.hypot(a.position.x-p.x,a.position.y-p.y)-Math.hypot(b.position.x-p.x,b.position.y-p.y));const nearest=choices[0];if(nearest&&Math.hypot(nearest.position.x-p.x,nearest.position.y-p.y)<=6){action=nearest.action;targetId=nearest.id;}}
  if(!action)throw Error('靠近资源、仓库或寨门后按 E；完整操作请打开营地管理');
  const receipt=this.village.command(owner,s.revision,{operationId:operationId??randomUUID(),actorId:s.playerId,issuedAtTick:s.tick,source:'player_input',action,parameters:action==='BUILD_FENCE'?{gateOpen:s.combat?.gateOpen===false}:{},readSet:{[`actor:${s.playerId}`]:s.versions[`actor:${s.playerId}`]},...(targetId?{targetId}:{})},s.worldId);
  if(!receipt.accepted)throw Error(receipt.reason);return {ok:true,message:'已提交正式玩法操作',revision:s.revision};
 }
 close(){this.db.close();}
}
