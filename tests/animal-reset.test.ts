import {it,expect,vi} from 'vitest';
vi.hoisted(()=>{process.env.CAMP_WORLD_LAYOUT='new-world-v1';process.env.CAMP_VILLAGE_EXPERIMENTAL='1';process.env.CAMP_VILLAGE_DEFAULT='1';});
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {WorldRuntime} from '../scripts/world/runtime';import {baselinePolicy} from '../src/games/camp/ai/policy';
function fixture(){const file=path.join(mkdtempSync(path.join(tmpdir(),'campmind-reset-village-')),'world.sqlite');const r=new WorldRuntime(file,baselinePolicy,()=>1000,50,false);const old=r.mutate('owner',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'tab');r.village!.ensureUpgraded('owner',old.state,old.dialogueScope!);return {file,r};}
it('reset starts both MLP controllers automatically; explicit pause still freezes both',()=>{
 const {file,r}=fixture();try{
 const old=r.read('owner');r.mutate('owner',old.revision,'reset-running',{type:'reset'},'tab');
 const initial=r.village!.read('owner') as any;expect(initial.paused).toBe(false);
 for(let i=0;i<40;i++)r.tick();
 const running=r.village!.read('owner') as any;expect(running.elapsed).toBeGreaterThan(3);expect(Object.keys(running.actors)).toHaveLength(10);
 expect(running.policyErrors).toEqual({});expect(running.ecology.policyError).toBe('');expect(running.ecology.metrics.mlp).toBeGreaterThan(0);
 expect(running.ecology.animals.some((a:any)=>Math.hypot(a.position.x-initial.ecology.animals.find((b:any)=>b.id===a.id).position.x,a.position.y-initial.ecology.animals.find((b:any)=>b.id===a.id).position.y)>.2)).toBe(true);
 const db=new DatabaseSync(file,{readOnly:true});try{const s=JSON.parse(String(db.prepare('SELECT payload FROM village_worlds_v1 WHERE owner=?').get('owner')!.payload));
 expect(s.events.some((e:any)=>e.kind==='policy.decision'&&e.facts?.source==='mlp')).toBe(true);
 expect(Object.values(s.executions).some((e:any)=>e.command.actorId!=='player'&&e.command.action.startsWith('GATHER_'))).toBe(true);
 }finally{db.close();}
 const frozen=r.village!.setPaused('owner',running.revision,true,running.worldId) as any;for(let i=0;i<20;i++)r.tick();const after=r.village!.read('owner') as any;
 expect(after.tick).toBe(frozen.tick);expect(after.ecology).toEqual(frozen.ecology);
 }finally{r.close();}
},30000);
it('reset in formal mode replaces all village/ecology/history generations and preserves model settings, once',()=>{
 const {file,r}=fixture();try{let old=r.read('owner');old=r.mutate('owner',old.revision,'model-choice',{type:'agency-model',modelId:'native:retained-choice'},'tab');const before=r.village!.read('owner')!;r.village!.setSpeed('owner',before.revision,4,before.worldId);
 const reset=r.mutate('owner',old.revision,'reset-one',{type:'reset'},'tab');expect(reset.dialogueScope).not.toBe(old.dialogueScope);expect(reset.state!.elapsed).toBe(0);expect(reset.state!.agency!.modelId).toBe('native:retained-choice');
 const fresh=r.village!.read('owner') as any;expect(fresh.worldId).not.toBe(before.worldId);expect(fresh.tick).toBe(0);expect(fresh.paused).toBe(false);expect(fresh.speed).toBe(1);expect(fresh.inventory).toMatchObject({wood:35,stone:5,rope:5,food:30,meat:0});expect(Object.values(fresh.actors).every((a:any)=>a.body.hp>0&&!a.body.incapacitated&&!a.equipment)).toBe(true);expect(fresh.ecology.animals).toHaveLength(22);expect(fresh.ecology.time).toBe(0);expect(fresh.ecology.hunt).toBeNull();expect(fresh.social.proposals).toEqual({});expect(fresh.executions).toEqual({});
 expect(()=>r.village!.setSpeed('owner',fresh.revision,4,before.worldId)).toThrow('world changed');
 const repeated=r.mutate('owner',reset.revision,'reset-one',{type:'reset'},'tab');expect(repeated.dialogueScope).toBe(reset.dialogueScope);expect(r.village!.read('owner')!.worldId).toBe(fresh.worldId);
 const db=new DatabaseSync(file,{readOnly:true});try{expect(db.prepare('SELECT count(*) AS n FROM village_migration_v1 WHERE owner=?').get('owner')!.n).toBe(0);expect(db.prepare('SELECT count(*) AS n FROM village_animals_v1 WHERE world_id=?').get(before.worldId)!.n).toBe(0);expect(db.prepare('SELECT count(*) AS n FROM snapshots WHERE player=?').get('owner')!.n).toBe(1);}finally{db.close();}
 r.close();const restarted=new WorldRuntime(file,baselinePolicy,()=>1000,50,false);try{expect(restarted.village!.read('owner')!.worldId).toBe(fresh.worldId);expect(restarted.read('owner').state!.agency!.modelId).toBe('native:retained-choice');}finally{restarted.close();}
 }finally{r.close();}
});
it('failed reset save rolls back legacy and new village deletion together',()=>{const {file,r}=fixture();const db=new DatabaseSync(file);try{const old=r.read('owner'),before=r.village!.read('owner')!;db.exec("CREATE TRIGGER reject_reset BEFORE INSERT ON snapshots BEGIN SELECT RAISE(ABORT,'reset write failed'); END");expect(()=>r.mutate('owner',old.revision,'failed-reset',{type:'reset'},'tab')).toThrow('reset write failed');expect(r.village!.read('owner')!.worldId).toBe(before.worldId);expect(r.read('owner').dialogueScope).toBe(old.dialogueScope);expect(db.prepare('SELECT count(*) AS n FROM village_migration_v1 WHERE owner=?').get('owner')!.n).toBe(1);}finally{db.close();r.close();}});
