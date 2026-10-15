import { writeFileSync } from 'node:fs';
import { createGame, advanceGameSteps } from '../src/games/camp/simulation/engine';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { isValidGameState } from '../src/games/camp/simulation/persistence';
import { getObservation } from '../src/games/camp/simulation/observation';

let state=createGame({seed:17,mode:'rules',difficulty:'cozy'});state.status='playing';
const samples=[];
for(let second=0;second<=600;second+=100){
  if(second)state=advanceGameSteps(state,1000,baselinePolicy);
  const sample={elapsed:state.elapsed,valid:isValidGameState(state),alive:state.npcs.filter(n=>n.alive).length,
    food:state.food,gatheredFood:state.stats.gatheredFood,meals:state.stats.meals,
    npcs:state.npcs.map(n=>({id:n.id,health:n.health,hunger:n.hunger,action:n.action,position:n.position,inventory:n.inventory,
      featuresValid:getObservation(state,n).features.every(x=>Number.isFinite(x)&&x>=0&&x<=1)}))};
  samples.push(sample);console.log(JSON.stringify({elapsed:sample.elapsed,valid:sample.valid,alive:sample.alive,food:sample.food,gatheredFood:sample.gatheredFood,meals:sample.meals}));
}
writeFileSync('data/nine-villagers-simulation.json',JSON.stringify(samples,null,2));
if(samples.some(s=>!s.valid||s.alive!==9||s.npcs.some(n=>!n.featuresValid)))process.exitCode=1;
