import{mkdirSync,writeFileSync}from'node:fs';
import{performance}from'node:perf_hooks';
import{createVillageState,restoreVillageState}from'../../src/games/camp/village/domain/state';
import{campaignScenario}from'../../src/games/camp/village/scenarios/campaign';
import{selectWorldRules}from'../../src/games/camp/village/config/load';
import{initializeEconomy}from'../../src/games/camp/village/systems/resources';
import{initializeCombat}from'../../src/games/camp/village/systems/combat';
import{advanceIdleVillage}from'../../src/games/camp/village/systems/catchup';
import{compactVillageHistory}from'../../src/games/camp/village/domain/history';
import{digest,ensure}from'../../packages/action-runtime/src/json';
const rules=selectWorldRules('village-v1','p4-social-content-v1');
let state=createVillageState(rules,campaignScenario('endurance-idle',1701,{x:0,y:0}));initializeEconomy(state,rules);initializeCombat(state,{center:{x:0,y:0},radius:8});state.paused=false;
const records:unknown[]=[],archives:unknown[]=[],start=performance.now();let stepped=0,skipped=0;
for(let day=1;day<=175;day++){
 const r=advanceIdleVillage(state,7200);stepped+=r.steppedTicks;skipped+=r.skippedTicks;
 compactVillageHistory(state,b=>archives.push(b));
 const hash=digest(state),restored=restoreVillageState(JSON.parse(JSON.stringify(state)),rules);ensure(digest(restored)===hash,'Save/load changed world');state=restored;
 records.push({day,tick:state.tick,waves:Object.keys(state.combat!.waves).length,enemies:Object.keys(state.combat!.enemies).length,inventory:{...state.inventory},alive:Object.values(state.actors).filter(a=>a.body.hp>0).length,events:state.events.length,stateHash:hash});
}
ensure(Object.keys(state.combat!.waves).length===10,'Ten source waves were not triggered');
ensure(Object.keys(state.combat!.enemies).length===110,'Source wave population mismatch');
const before=digest(state);state.paused=true;const paused=digest(state);advanceIdleVillage(state,7200);ensure(digest(state)===paused,'Pause advanced time');state.paused=false;ensure(digest(state)===before,'Pause altered non-clock state');
const report={passed:true,classification:'idle-logical-replay-no-autonomous-policy-no-survival-claim',days:175,logicalTicks:state.tick,steppedTicks:stepped,skippedTicks:skipped,milliseconds:performance.now()-start,ruleHash:rules.ruleHash,archiveSegments:archives.length,records};
mkdirSync('native/Artifacts/village/P5',{recursive:true});writeFileSync('native/Artifacts/village/P5/endurance-idle.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,records:records.slice(-1)}));
