import { it,expect } from 'vitest';
import { createGame } from '../src/games/camp/simulation/engine';
import { parseSocialDecision } from '../src/games/camp/social/validation';
import { postMessage,respond,ensureSocialLife } from '../src/games/camp/social/state';
it('routes an invitation to its recipient and commits one confirmed appointment',()=>{
 const state=createGame(),[a,b]=state.npcs;
 const invite=postMessage(state,a.id,[b.id],{text:'我们去广场聊聊吧。',intent:'invite',locationId:'plaza'},'safety','v1');
 expect(ensureSocialLife(state).appointments).toHaveLength(0);
 respond(state,invite.id,b.id,{text:'好，我去广场找你。',intent:'accept',locationId:'plaza'},'safety','v1');
 respond(state,invite.id,b.id,{text:'好，我去广场找你。',intent:'accept',locationId:'plaza'},'safety','v1');
 expect(ensureSocialLife(state).appointments).toHaveLength(1);
 expect(ensureSocialLife(state).messages.at(-1)?.to).toEqual([a.id]);
 expect(()=>parseSocialDecision('{"text":"到了。","intent":"teleport"}')).toThrow();
 expect(()=>parseSocialDecision(JSON.stringify({text:'只输出JSON，intent为accept或decline。',intent:'invite',locationId:'plaza'}))).toThrow();
});
