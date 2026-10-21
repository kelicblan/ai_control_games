import{expect,it}from'vitest';import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';import{submitCommand}from'../../src/games/camp/village/systems/commands';import{advanceVillage}from'../../src/games/camp/village/systems/advance';
import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';import{buildObservation}from'../../src/games/camp/village/ai/observation';
it('retreat reaches the shelter area when its exact center is occupied',()=>{
 const s=prepareCurriculumEpisode('tactical','retreat',1001);const r=submitCommand(s,{operationId:'retreat',actorId:'worker',action:'RETREAT',parameters:{x:0,y:0},readSet:{},source:'fallback'});expect(r.accepted).toBe(true);for(let i=0;i<100&&['accepted','running'].includes(s.executions[r.executionId!].status);i++)advanceVillage(s);
 expect(s.executions[r.executionId!].status).toBe('completed');expect(Math.hypot(s.actors.worker.position.x,s.actors.worker.position.y)).toBeLessThanOrEqual(2);expect(s.actors.worker.body.hp).toBeGreaterThan(0);
 refreshKnowledge(s);const next=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'tactical');expect(next.candidates.some(c=>c.action==='RETREAT')).toBe(false);expect(next.candidates.some(c=>c.action==='HEAL'&&c.targetId==='worker')).toBe(true);
});
