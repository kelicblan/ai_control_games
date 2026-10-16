import { it,expect } from 'vitest';
import { createGame,advanceGame } from '../src/games/camp/simulation/engine';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { postMessage,respond,ensureSocialLife } from '../src/games/camp/social/state';
import { updateAppointments } from '../src/games/camp/social/appointments';
it('never speaks for the player during arrival, completion or cancellation',()=>{
 const state=createGame();state.status='playing';const npc=state.npcs[0];
 npc.position={x:50,y:110};npc.energy=90;npc.hunger=10;npc.health=100;npc.action=null;
 state.lord!.position={x:50,y:110};
 const invite=postMessage(state,'player',[npc.id],{text:'到广场聊聊吧。',intent:'invite',locationId:'plaza'},'player','v1');
 respond(state,invite.id,npc.id,{text:'好的，广场见。',intent:'accept',locationId:'plaza'},'safety','v1');
 updateAppointments(state);
 expect(state.socialLife!.messages.filter(m=>m.from==='player')).toHaveLength(1);
 state.elapsed+=65;updateAppointments(state);
 expect(state.socialLife!.messages.filter(m=>m.from==='player')).toHaveLength(1);
 expect(state.socialLife!.appointments[0].stage).toBe('expired');
});
it('walks to a meeting before starting a conversation; urgent needs cancel it',()=>{
 let state=createGame();state.status='playing';const [a,b]=state.npcs;
 a.position={x:38,y:105};b.position={x:62,y:105};
 for(const n of [a,b]){n.inventory={wood:0,food:0};n.action=null;n.energy=90;n.hunger=10;}
 const invite=postMessage(state,a.id,[b.id],{text:'去广场聊聊吧。',intent:'invite',locationId:'plaza'},'safety','v1');
 respond(state,invite.id,b.id,{text:'好，我来。',intent:'accept',locationId:'plaza'},'safety','v1');
 expect(ensureSocialLife(state).appointments[0].stage).toBe('travelling');
 for(let i=0;i<200&&ensureSocialLife(state).appointments[0].stage!=='talking';i++)state=advanceGame(state,.1,baselinePolicy);
 expect(ensureSocialLife(state).appointments[0].stage).toBe('talking');
 state.npcs[0].health=20;state=advanceGame(state,.1,baselinePolicy);
 expect(ensureSocialLife(state).appointments[0].stage).toBe('cancelled');
});
