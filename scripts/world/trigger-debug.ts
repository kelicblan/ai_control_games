import type {DatabaseSync} from 'node:sqlite';
export type TriggerKind='mlp'|'dialogue';
const actions:Record<string,string>={GATHER_WOOD:'采集木材',GATHER_STONE:'采集石料',GATHER_ROPE:'采集麻料',GATHER_FOOD:'采集食物',REST:'休息',EAT:'进食',DEPOSIT:'搬运入库',ATTACK:'战斗',REPOSITION:'移动',RESCUE:'救援',HEAL:'治疗',GUARD:'值守',CRAFT:'制作装备',BUILD_WORKSHOP:'建设工坊',REPAIR_FENCE:'修复围栏',EXPLORE:'探索',SOCIAL_VISIT:'拜访伙伴',RETREAT:'撤退',SEEK_SHELTER:'避雨'};
export const triggerEventName=(kind:string)=>({'actor.said':'听到伙伴讲话','wildlife.warning':'发现野生动物危险','wildlife.harvested':'取得猎物','node.depleted':'资源耗尽','item.crafted':'装备制作完成','exploration.completed':'探索完成','resources.deposited':'物资入库','resources.transferred':'转交物资','resource.transferred':'转交物资','agreement.fulfilled':'约定完成','actor.rescued':'救援完成','actor.healed':'治疗完成'} as Record<string,string>)[kind]??kind;
export const actionName=(s:string)=>actions[s]??s;
export const safeDebugError=(error:unknown)=>String(error instanceof Error?error.message:error).replace(/https?:\/\/[^\s]+/g,'[服务地址]').replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_.-]+/gi,'[凭据已隐藏]').slice(0,240);
/** Append-only diagnostics in the authoritative SQLite transaction. Never compact with world history. */
export class TriggerDebugLog{
 constructor(private db:DatabaseSync,readonly file:string){db.exec(`CREATE TABLE IF NOT EXISTS trigger_debug_v1(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,world_id TEXT NOT NULL,kind TEXT NOT NULL,wall_ms INTEGER NOT NULL,elapsed REAL NOT NULL,summary TEXT NOT NULL,details TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS trigger_debug_scope_v1 ON trigger_debug_v1(owner,world_id,kind,id DESC);`);}
 append(owner:string,worldId:string,kind:TriggerKind,elapsed:number,summary:string,details:unknown={}){this.db.prepare('INSERT INTO trigger_debug_v1(owner,world_id,kind,wall_ms,elapsed,summary,details) VALUES(?,?,?,?,?,?,?)').run(owner,worldId,kind,Date.now(),elapsed,summary,JSON.stringify(details));}
 latest(owner:string,worldId:string,kind:string){if(kind!=='mlp'&&kind!=='dialogue')throw Error('无效调试日志类别');return {kind,worldId,path:this.file+' · 表 trigger_debug_v1（完整历史）',items:this.db.prepare('SELECT id,wall_ms AS wallMs,elapsed,summary FROM trigger_debug_v1 WHERE owner=? AND world_id=? AND kind=? ORDER BY id DESC LIMIT 100').all(owner,worldId,kind)};}
}
