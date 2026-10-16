import {createGame,advanceGame} from '../src/games/camp/simulation/engine';
import {ACTIONS,type PolicyFunction} from '../src/games/camp/simulation/types';
import {baselinePolicy} from '../src/games/camp/ai/policy';
let state=createGame({seed:17,difficulty:'cozy'});state.status='playing';
const wood:PolicyFunction=()=>({action:'wood',emotion:'calm',scores:ACTIONS.map(a=>Number(a==='wood')),source:'rules',latencyMs:0});
const policy=process.argv.includes('--wood')?wood:baselinePolicy;
const days=process.argv.includes('--days');
for(let i=0;i<(days?180:24);i++){
  state=advanceGame(state,10,policy);
  if(days?i%60===59:i%3===2)console.log(JSON.stringify({time:state.elapsed,wood:state.wood,food:state.food,gathered:[state.stats.gatheredWood,state.stats.gatheredFood],npcs:state.npcs.map(n=>({id:n.id,alive:n.alive,health:+n.health.toFixed(1),action:n.action,xy:[+n.position.x.toFixed(1),+n.position.y.toFixed(1)],energy:+n.energy.toFixed(1),hunger:+n.hunger.toFixed(1),task:n.wildTask,inventory:n.inventory}))}));
}
