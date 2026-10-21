import {it,expect} from 'vitest';import {VillagePolicyFeedback} from '../../scripts/world/village-policy-feedback';
import {prepareCurriculumEpisode} from '../../src/games/camp/village/scenarios/curriculum';import {buildObservation} from '../../src/games/camp/village/ai/observation';import {refreshKnowledge} from '../../src/games/camp/village/systems/perception';
it('recognizes localized workshop route failures and allows a different action before retrying',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),i=o.candidates.findIndex(c=>c.action==='GATHER_ROPE'),feedback=new VillagePolicyFeedback();
 const craft={...o.candidates[i],id:'workshop-test',action:'CRAFT',parameters:{recipeId:'WPN003',recipientId:'worker'},targetId:undefined};delete craft.targetId;
 const input={...o,candidates:o.candidates.map((c,j)=>j===i?craft:c)};
 feedback.remember(s,craft,'工坊或接收人无法到达，请检查寨门与路线');expect(feedback.mask(s,input).knownLegalMask[i]).toBe(false);
 s.elapsed+=11;expect(feedback.mask(s,input).knownLegalMask[i]).toBe(true);
});
it('own stale entity rejection prevents repeated requests against changed resource nodes',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),i=o.candidates.findIndex(c=>c.action==='GATHER_ROPE'),f=new VillagePolicyFeedback();
 expect(i).toBeGreaterThanOrEqual(0);f.remember(s,o.candidates[i],'Related entity changed: node:campaign-node-4');expect(f.mask(s,o).knownLegalMask[i]).toBe(false);
});
it('own depleted-node rejection temporarily permits the model to choose another goal without granting hidden resource knowledge',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),i=o.candidates.findIndex(c=>c.action==='GATHER_ROPE'),feedback=new VillagePolicyFeedback(),before=JSON.stringify(s.actors.worker.personal.knowledge);
 expect(i).toBeGreaterThanOrEqual(0);feedback.remember(s,o.candidates[i],'Unknown or depleted node');const masked=feedback.mask(s,o);expect(masked.knownLegalMask[i]).toBe(false);expect(masked.candidates).toBe(o.candidates);expect(masked.knownLegalMask.filter(Boolean).length).toBe(o.knownLegalMask.filter(Boolean).length-1);expect(JSON.stringify(s.actors.worker.personal.knowledge)).toBe(before);
 s.elapsed+=11;expect(feedback.mask(s,o).knownLegalMask[i]).toBe(true);
});
it('one actor rejection does not mask another actor choice',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),i=o.candidates.findIndex(c=>c.action==='GATHER_ROPE'),f=new VillagePolicyFeedback();f.remember(s,{...o.candidates[i],actorId:'player'},'Node is not workable');expect(f.mask(s,o).knownLegalMask[i]).toBe(true);
});
it('stale read rejection survives retries and host reload until the actor observes a new version',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),i=o.candidates.findIndex(c=>c.action==='GATHER_ROPE'),c=o.candidates[i],key=Object.keys(c.readSet).find(k=>k.startsWith('node:'))!;
 expect(key).toBeTruthy();new VillagePolicyFeedback().remember(s,c,`Related entity changed: ${key}`);s.elapsed+=11;
 expect(new VillagePolicyFeedback().mask(s,o).knownLegalMask[i]).toBe(false);
 const fresh={...o,candidates:o.candidates.map((v,j)=>j===i?{...v,readSet:{...v.readSet,[key]:Number(v.readSet[key])+1}}:v)};
 expect(new VillagePolicyFeedback().mask(s,fresh).knownLegalMask[i]).toBe(true);
});
it('invalidated memories do not occupy the bounded candidate slots or grant hidden entity truth',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);refreshKnowledge(s);const k=s.actors.worker.personal.knowledge,o=buildObservation(s,'worker',k,'life'),c=o.candidates.find(c=>c.action==='GATHER_ROPE')!,f=new VillagePolicyFeedback(),key=Object.keys(c.readSet).find(k=>k.startsWith('node:'))!;
 const remembered=structuredClone(k.entities[c.targetId!]);f.remember(s,c,`Related entity changed: ${key}`);const projection=f.observedKnowledge(s,'worker');
 expect(projection.entities[c.targetId!]).toBeUndefined();expect(s.actors.worker.personal.knowledge.entities[c.targetId!]).toEqual(remembered);
 expect(buildObservation(s,'worker',projection,'life').candidates.some(v=>v.targetId===c.targetId)).toBe(false);
});
