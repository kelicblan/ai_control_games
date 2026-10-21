/** 当前默认二维地图状态：旧VillageRuntime存档尚未迁移，必须保持数据隔离。 */
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {REGION,VILLAGE,getChunk,chunkAt,sweepMove,nearbyResources,isBlocked} from '../../src/games/camp/world/pixel/world.mjs';
const APPLICATION_ID=0x50495831;
const RESOURCES=['wood','stone','fiber','food','gold'];
export class MapSession{
  constructor(file){
    if(file!==':memory:')mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
    this.db=new DatabaseSync(file);this.closed=false;this.input={x:0,y:0,at:-Infinity};this.dirty=false;this.lastSave=0;
    try{
      const tables=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      const app=this.db.prepare('PRAGMA application_id').get().application_id;
      if(tables.length&&app!==APPLICATION_ID)throw new Error('拒绝写入正式游戏或其他用途的数据库');
      this.db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS pixel_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pixel_resources(id TEXT PRIMARY KEY,remaining INTEGER NOT NULL CHECK(remaining>=0));
        CREATE TABLE IF NOT EXISTS pixel_operations(id TEXT PRIMARY KEY,result TEXT NOT NULL);`);
      const row=this.db.prepare('SELECT payload FROM pixel_state WHERE id=1').get();
      this.state=row?JSON.parse(row.payload):{map:REGION.id,generator:REGION.generator,seed:REGION.seed,revision:0,player:{...VILLAGE.spawn},gateOpen:true,inventory:Object.fromEntries(RESOURCES.map(k=>[k,0])),explored:[]};
      const s=this.state;
      if(s.map!==REGION.id||s.generator!==REGION.generator||s.seed!==REGION.seed)throw new Error('地图生成版本不兼容；保留原档，禁止自动覆盖');
      if(!Number.isSafeInteger(s.revision)||s.revision<0||!s.player||![s.player.x,s.player.y].every(Number.isFinite)||typeof s.gateOpen!=='boolean'||!RESOURCES.every(k=>Number.isSafeInteger(s.inventory?.[k])&&s.inventory[k]>=0)||!Array.isArray(s.explored)||s.explored.length>62500||s.explored.some(c=>!Number.isInteger(c.cx)||!Number.isInteger(c.cy)||c.cx<0||c.cy<0||c.cx>=250||c.cy>=250))throw new Error('二维地图存档格式错误；未重置原档');
      this.changedResources=new Map(this.db.prepare('SELECT id,remaining FROM pixel_resources').all().map(r=>[r.id,r.remaining]));
      this.depleted=new Set([...this.changedResources].filter(([,n])=>n===0).map(([id])=>id));
      if(isBlocked(s.player.x,s.player.y,{gateOpen:s.gateOpen,depleted:this.depleted}))throw new Error('保存位置不再可行走；需要显式迁移，不自动重置');
      this.explored=new Map(s.explored.map(c=>[`${c.cx}:${c.cy}`,c]));this.explore();this.checkpoint();
    }catch(error){this.db.close();this.closed=true;throw error;}
  }
  setInput(input,now=Date.now()){
    if(!input||![input.x,input.y,now].every(Number.isFinite)||Math.abs(input.x)>1||Math.abs(input.y)>1)throw new RangeError('输入必须是-1到1的二维方向');
    this.input={x:input.x,y:input.y,at:now};
  }
  tick(dt,now=Date.now()){
    if(!Number.isFinite(dt)||dt<=0||dt>.25||!Number.isFinite(now))throw new RangeError('无效固定步');
    if(now-this.input.at<=300&&now>=this.input.at&&(this.input.x||this.input.y)){
      const p=sweepMove(this.state.player,this.input,4.5*dt,{gateOpen:this.state.gateOpen,depleted:this.depleted});
      if(p.x!==this.state.player.x||p.y!==this.state.player.y){this.state.player=p;this.state.revision++;this.explore();this.dirty=true;}
    }
    if(this.dirty&&now-this.lastSave>=1000){this.checkpoint();this.lastSave=now;}
  }
  explore(){
    const c=chunkAt(this.state.player.x,this.state.player.y);
    for(let cy=Math.max(0,c.y-1);cy<=Math.min(249,c.y+1);cy++)for(let cx=Math.max(0,c.x-1);cx<=Math.min(249,c.x+1);cx++)this.explored.set(`${cx}:${cy}`,{cx,cy});
  }
  remaining(id,initial){return this.changedResources.get(id)??initial??0;}
  snapshot(){return{scope:'pixel-game',map:this.state.map,revision:this.state.revision,player:{...this.state.player},gateOpen:this.state.gateOpen,inventory:RESOURCES.map(resource=>({resource,amount:this.state.inventory[resource]})),explored:[...this.explored.values()]};}
  chunk(cx,cy){const c=getChunk(cx,cy);return{...c,revision:this.state.revision,props:c.props.map(p=>({...p,amount:p.resource?this.remaining(p.id,p.amount):0,kind:p.id==='gate'?(this.state.gateOpen?'gate-open':'gate-closed'):p.resource&&this.remaining(p.id,p.amount)===0?(p.resource==='wood'?'stump':'depleted'):p.kind}))};}
  interact(operationId){
    if(typeof operationId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(operationId))throw new RangeError('无效操作ID');
    const previous=this.db.prepare('SELECT result FROM pixel_operations WHERE id=?').get(operationId);if(previous)return JSON.parse(previous.result);
    const before=structuredClone(this.state),changed=new Map(this.changedResources),depleted=new Set(this.depleted),p=this.state.player;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      let result;
      if(Math.hypot(p.x-VILLAGE.gate.x,p.y-VILLAGE.gate.y)<=8){
        if(this.state.gateOpen&&Math.abs(p.y-VILLAGE.gate.y)<1.4)throw new Error('请离开门洞后再关门');
        this.state.gateOpen=!this.state.gateOpen;result={kind:'gate',gateOpen:this.state.gateOpen,message:this.state.gateOpen?'寨门已打开':'寨门已关闭'};
      }else{
        const node=nearbyResources(p.x,p.y,5).find(n=>this.remaining(n.id,n.amount)>0&&this.reaches(n));
        if(!node)throw new Error('附近没有可采集资源，请靠近资源或寨门');
        const remaining=this.remaining(node.id,node.amount)-1;this.state.inventory[node.resource]++;
        this.changedResources.set(node.id,remaining);if(!remaining)this.depleted.add(node.id);
        this.db.prepare('INSERT INTO pixel_resources VALUES(?,?) ON CONFLICT(id) DO UPDATE SET remaining=excluded.remaining').run(node.id,remaining);
        result={kind:'gather',id:node.id,resource:node.resource,amount:1,remaining,message:'已采集（二维地图资源库存）'};
      }
      this.state.revision++;result.revision=this.state.revision;this.writeState();
      this.db.prepare('INSERT INTO pixel_operations VALUES(?,?)').run(operationId,JSON.stringify(result));this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');this.state=before;this.changedResources=changed;this.depleted=depleted;throw error;}
  }
  reaches(node){
    const p=this.state.player,steps=Math.ceil(Math.hypot(node.x-p.x,node.y-p.y)/.4),ignore=new Set(this.depleted);ignore.add(node.id);
    for(let i=1;i<=steps;i++)if(isBlocked(p.x+(node.x-p.x)*i/steps,p.y+(node.y-p.y)*i/steps,{gateOpen:this.state.gateOpen,depleted:ignore}))return false;
    return true;
  }
  writeState(){this.state.explored=[...this.explored.values()];this.db.prepare('INSERT INTO pixel_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(this.state));}
  checkpoint(){this.writeState();this.dirty=false;}
  close(){if(this.closed)return;try{this.checkpoint();}finally{this.db.close();this.closed=true;}}
}
