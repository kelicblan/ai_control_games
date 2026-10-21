import {it,expect,vi} from 'vitest';
vi.hoisted(()=>{process.env.CAMP_WORLD_LAYOUT='new-world-v1';process.env.CAMP_VILLAGE_DEFAULT='1';process.env.CAMP_VILLAGE_EXPERIMENTAL='1';});
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {WorldRuntime} from '../scripts/world/runtime';
import {baselinePolicy} from '../src/games/camp/ai/policy';
import {campaignScenario} from '../src/games/camp/village/scenarios/campaign';
it('new campaign and reset restore the original nine identities alive',()=>{
 const r=new WorldRuntime(path.join(mkdtempSync(path.join(tmpdir(),'roster-')),'world.sqlite'),baselinePolicy,()=>1000,50,false);
 try{const old=r.mutate('owner',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'tab');
 const initial=r.village!.createCampaign('owner',64138);expect(Object.keys(initial.actors)).toHaveLength(10);
 expect(Object.values(initial.actors).filter(a=>a.id!=='player').map(a=>a.name)).toEqual(old.state!.npcs.map(n=>n.name));
 const reset=r.mutate('owner',old.revision,'reset',{type:'reset'},'tab');const fresh=r.village!.read('owner')!;
 expect(Object.keys(fresh.actors).sort()).toEqual(['player',...reset.state!.npcs.map(n=>n.id)].sort());
 expect(Object.values(fresh.actors).every(a=>a.body.hp===a.body.maxHp&&!a.body.downed)).toBe(true);
 }finally{r.close();}
});
it('explicit two-companion repair preserves progress and is idempotent',()=>{
 const r=new WorldRuntime(path.join(mkdtempSync(path.join(tmpdir(),'roster-repair-')),'world.sqlite'),baselinePolicy,()=>1000,50,false);
 try{const old=r.mutate('owner',0,'start',{type:'start',options:{seed:17,mode:'rules'}},'tab');
 const scenario=campaignScenario('affected-reset',64138,{x:50,y:55});scenario.actors=[{archetypeId:'H001',instanceId:'recruit-1'},{archetypeId:'H002',instanceId:'recruit-2'}];
 let before=r.village!.create('owner',scenario);before=r.village!.setPaused('owner',before.revision,false,before.worldId);r.village!.tick();before=r.village!.read('owner')!;
 const fresh=r.village!.repairInitialRoster('owner',before.worldId);expect(Object.keys(fresh.actors)).toHaveLength(10);expect(fresh.elapsed).toBe(before.elapsed);expect(fresh.inventory).toEqual(before.inventory);expect(fresh.executions).toEqual(before.executions);expect(fresh.actors['recruit-1'].body).toEqual(before.actors['recruit-1'].body);
 expect(Object.values(fresh.actors).filter(a=>a.id!=='player').map(a=>a.name)).toEqual(old.state!.npcs.map(n=>n.name));
 expect(r.village!.repairInitialRoster('owner',before.worldId).revision).toBe(fresh.revision);
 }finally{r.close();}
});
