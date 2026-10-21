import {writeFileSync,readFileSync} from 'node:fs';
import {prepareCurriculumEpisode} from '../../src/games/camp/village/scenarios/curriculum';
import {refreshKnowledge} from '../../src/games/camp/village/systems/perception';
import {buildObservation} from '../../src/games/camp/village/ai/observation';
import {chooseReleaseLifeTeacher} from '../../src/games/camp/village/ai/release-life-teacher';
import {chooseTacticalTeacher} from '../../src/games/camp/village/ai/tactical-teacher';
import {submitCommand} from '../../src/games/camp/village/systems/commands';
import {advanceVillage} from '../../src/games/camp/village/systems/advance';
import {digest} from '../../packages/action-runtime/src/json';
import {lifeEngineHash} from '../mlp_v4/engine-hash';
const records=[];
for(const head of ['life','tactical'] as const)for(const seed of [1001,2001,9001]){
 const s=prepareCurriculumEpisode(head,'melee',seed);if(s.wildlife)throw Error('Wildlife unexpectedly present');
 for(let n=0;n<3;n++){refreshKnowledge(s);const input=buildObservation(s,'worker',s.actors.worker.personal.knowledge,head),id=head==='life'?chooseReleaseLifeTeacher(input):chooseTacticalTeacher(input),c=input.candidates.find(c=>c.id===id)!;const r=submitCommand(s,{...c,operationId:`compat-${n}`,source:'fallback'});for(let t=0;t<500&&r.accepted&&['accepted','running'].includes(s.executions[r.executionId!].status);t++)advanceVillage(s);records.push({head,seed,n,input,chosen:id,stateHash:digest(s)});}
}
const path='native/Artifacts/animals/beast-tide-v2/base-compatibility-before.json',result={engineHash:lifeEngineHash(),traceHash:digest(records),episodes:6,decisions:records.length};
if(process.argv.includes('--before'))writeFileSync(path,JSON.stringify(result,null,2));else{const before=JSON.parse(readFileSync(path,'utf8'));if(before.traceHash!==result.traceHash)throw Error('No-wildlife replay changed');writeFileSync('native/Artifacts/animals/beast-tide-v2/base-compatibility.json',JSON.stringify({passed:true,condition:'Original base scenarios contain no wildlife; action contract, teachers and normalization unchanged; six seeded three-decision executor replays have identical observations, choices and state hashes',baseEngineHash:before.engineHash,targetEngineHash:result.engineHash,traceHash:result.traceHash,episodes:6,decisions:records.length},null,2));}console.log(result);
