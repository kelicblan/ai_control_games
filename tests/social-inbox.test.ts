import {it,expect} from 'vitest';import {createGame} from '../src/games/camp/simulation/engine';
import {postMessage,respond,ensureSocialLife} from '../src/games/camp/social/state';
it('does not schedule a reply for a different NPC or reply forever',()=>{
 const state=createGame();let message=postMessage(state,'aye',['linlan'],{text:'想聊聊吗？',intent:'ask'},'safety','v1');
 expect(respond(state,message.id,'azhuang',{text:'收到你的话了。',intent:'say'},'safety','v1')).toBeUndefined();
 for(let i=0;i<8;i++){
  const next=respond(state,message.id,message.to[0],{text:'听见了，你接着说。',intent:'say'},'safety','v1');if(next)message=next;
 }
 expect(ensureSocialLife(state).messages).toHaveLength(7);
 expect(Object.values(message.replies)).not.toContain('pending');
});
