import {it,expect} from 'vitest';
import {villagePolicyFingerprint} from '../../scripts/world/village-policy-context';
import {createVillageState} from '../../src/games/camp/village/domain/state';
import {selectWorldRules} from '../../src/games/camp/village/config/load';
import {campaignScenario} from '../../src/games/camp/village/scenarios/campaign';
import {submitCommand} from '../../src/games/camp/village/systems/commands';
import {advanceVillage} from '../../src/games/camp/village/systems/advance';
it('task completion wakes the policy even when a short wait changes no body or knowledge',()=>{
 const s=createVillageState(selectWorldRules('village-v1','p4-social-content-v1'),campaignScenario('wake-test',64138,{x:0,y:0}));
 const actorId=Object.keys(s.actors).find(id=>id!==s.playerId)!;
 expect(submitCommand(s,{operationId:'wait-one',actorId,action:'WAIT',parameters:{seconds:.5},readSet:{},source:'scripted_test'}).accepted).toBe(true);
 const before=villagePolicyFingerprint(s,actorId);s.paused=false;for(let i=0;i<6;i++)advanceVillage(s);
 expect(villagePolicyFingerprint(s,actorId)).not.toBe(before);
});
