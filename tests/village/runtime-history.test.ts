import {it,expect} from 'vitest';
import {createVillageState,restoreVillageState} from '../../src/games/camp/village/domain/state';import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {appendEvent} from '../../packages/action-runtime/src/runtime';import {submitCommand} from '../../src/games/camp/village/systems/commands';
import {compactRuntimeHistory} from '../../scripts/world/village-history';
it('archives a busy short session while preserving ongoing work, social evidence and rollback',()=>{
 const rules=selectWorldRules('village-v1','p4-social-content-v1'),s=createVillageState(rules,{id:'busy',worldId:'busy',classification:'fixture',seed:1,actors:[],inventory:{}});
 const task=submitCommand(s,{operationId:'long-wait',actorId:'player',action:'WAIT',parameters:{seconds:60},readSet:{},issuedAtTick:0,source:'scripted_test'});expect(task.accepted).toBe(true);
 const proof=appendEvent(s,'actor.rescued',['player'],{recipientId:'player',carrierId:'a',atShelter:true});s.actors.player.personal.knowledge.evidence[proof.id]={eventId:proof.id,at:0,kind:proof.kind,source:'observed',facts:proof.facts};s.actors.player.personal.relations.a={targetId:'a',trust:.55,affinity:.5,reciprocity:.55,rivalry:0,authority:.5,basisRefs:[proof.id]};
 for(let i=0;i<1500;i++)appendEvent(s,'policy.decision',['player'],{index:i});s.tick=200;s.elapsed=20;
 const batches:unknown[]=[];compactRuntimeHistory(s,b=>batches.push(b),256);expect(batches).toHaveLength(1);expect(s.events.length).toBeLessThan(270);expect(s.events.some(e=>e.id===proof.id)).toBe(true);expect(s.executions[task.executionId!].status).toBe('accepted');expect(s.operations['long-wait']).toBeTruthy();expect(()=>restoreVillageState(s,rules)).not.toThrow();
 const before=JSON.stringify(s);expect(()=>compactRuntimeHistory(s,()=>{throw new Error('disk full');},0)).toThrow('disk full');expect(JSON.stringify(s)).toBe(before);
});
