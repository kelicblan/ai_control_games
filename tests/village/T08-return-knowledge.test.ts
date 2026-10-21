import{expect,it}from'vitest';import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';import{buildObservation}from'../../src/games/camp/village/ai/observation';import{refreshKnowledge}from'../../src/games/camp/village/systems/perception';
it('a carrier can return to its known home without inventing remote store inventory facts',()=>{
 const s=prepareCurriculumEpisode('life','return',1001);refreshKnowledge(s);expect(s.actors.worker.personal.knowledge.entities['inventory:public']).toBeUndefined();const input=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life');expect(input.candidates.some(c=>c.action==='DEPOSIT')).toBe(true);expect(input.stateFeatures[48]).toBe(-1);
});
