import {it,expect} from 'vitest';
import {prepareCurriculumEpisode} from '../../src/games/camp/village/scenarios/curriculum';
import {buildObservation} from '../../src/games/camp/village/ai/observation';
import {chooseReleaseLifeTeacher} from '../../src/games/camp/village/ai/release-life-teacher';
import {refreshKnowledge} from '../../src/games/camp/village/systems/perception';
import {submitCommand} from '../../src/games/camp/village/systems/commands';
import {advanceVillage} from '../../src/games/camp/village/systems/advance';
it('does not offer purposeless visits just because companions stand nearby',()=>{
 const s=prepareCurriculumEpisode('life','companionship',1001);s.actors.worker.personal.goals=[];refreshKnowledge(s);
 expect(buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life').candidates.some(c=>c.action==='SOCIAL_VISIT')).toBe(false);
});
it('explores for a missing production input when remembered nearby nodes are exhausted',()=>{
 const s=prepareCurriculumEpisode('life','production',1001);s.inventory={wood:24,stone:4,rope:3,food:30};s.actors.worker.body.energy=100;
 for(const node of Object.values(s.economy!.nodes))node.remainingHp=0;refreshKnowledge(s);
 const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),c=o.candidates.find(c=>c.id===chooseReleaseLifeTeacher(o))!;
 expect(c.action).toBe('EXPLORE');expect(c.parameters.resource).toBe('rope');
 const searches=o.candidates.filter(c=>c.action==='EXPLORE');expect(new Set(searches.map(c=>JSON.stringify(c.features))).size).toBeGreaterThan(1);
});
it('an equipped worker replenishes communal reserves instead of waiting forever',()=>{
 const s=prepareCurriculumEpisode('life','craft',1001);s.inventory.food=100;s.actors.worker.body.energy=100;
 const craft=submitCommand(s,{operationId:'craft',actorId:'worker',action:'CRAFT',parameters:{recipeId:'WPN005',recipientId:'worker',agreementId:null},readSet:{},source:'scripted_test'});expect(craft.accepted).toBe(true);for(let i=0;i<2000&&s.executions[craft.executionId!].status!=='completed';i++)advanceVillage(s);
 const item=Object.values(s.economy!.items)[0];expect(item).toBeTruthy();const equip=submitCommand(s,{operationId:'equip',actorId:'worker',action:'EQUIP',parameters:{itemId:item.id},readSet:{},source:'scripted_test'});expect(equip.accepted).toBe(true);for(let i=0;i<10;i++)advanceVillage(s);
 refreshKnowledge(s);const o=buildObservation(s,'worker',s.actors.worker.personal.knowledge,'life'),c=o.candidates.find(c=>c.id===chooseReleaseLifeTeacher(o))!;
 expect(['GATHER_WOOD','GATHER_STONE','GATHER_ROPE','EXPLORE']).toContain(c.action);
});
