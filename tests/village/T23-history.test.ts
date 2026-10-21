import { expect,it } from 'vitest';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { appendEvent } from '../../packages/action-runtime/src/runtime';
import { compactVillageHistory } from '../../src/games/camp/village/domain/history';
it('archives old operational events with hashes and retains social obligation proof',()=>{
 const s=createVillageState(selectWorldRules('village-v1','p4-social-content-v1'),{id:'history',worldId:'history',classification:'fixture',seed:1,actors:[],inventory:{}});
 const proof=appendEvent(s,'actor.rescued',['player'],{recipientId:'player',carrierId:'a',atShelter:true});
 s.actors.player.personal.knowledge.evidence[proof.id]={eventId:proof.id,at:0,kind:proof.kind,source:'observed',facts:proof.facts};
 s.actors.player.personal.relations.a={targetId:'a',trust:.55,affinity:.5,reciprocity:.55,rivalry:0,authority:.5,basisRefs:[proof.id]};
 for(let i=0;i<1500;i++)appendEvent(s,'policy.decision',['player'],{index:i});s.tick=20000;s.elapsed=2000;
 const batches:unknown[]=[];compactVillageHistory(s,b=>batches.push(b));expect(batches).toHaveLength(1);expect(s.events.length).toBeLessThan(600);expect(s.events.some(e=>e.id===proof.id)).toBe(true);expect(s.history!.archivedEvents).toBeGreaterThan(900);
 const before=JSON.stringify(s);expect(()=>compactVillageHistory(s,()=>{throw new Error('disk full');},0)).toThrow();expect(JSON.stringify(s)).toBe(before);
});
