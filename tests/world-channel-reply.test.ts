import { expect,it } from 'vitest';
import { WorldMessageStore } from '../src/gameMessages';
import { createGame } from '../src/games/camp/simulation/engine';
import { postMessage } from '../src/games/camp/social/state';
it('keeps stable NPC reply targets for new mentions and old saved dialogue',()=>{
 const game=createGame(),store=new WorldMessageStore(true);
 postMessage(game,'aye',['player'],{text:'广场聊聊？',intent:'invite',locationId:'plaza'},'safety','v1');
 postMessage(game,'linlan',['aye'],{text:'我在这里。',intent:'end'},'safety','v1');
 store.capture(game);
 expect(store.getSnapshot().find(m=>m.text==='广场聊聊？')?.replyTo).toEqual({npcId:'aye'});
 expect(store.getSnapshot().find(m=>m.text==='我在这里。')?.replyTo).toBeUndefined();
 store.captureDialogues([{id:'old-reply',npcId:'xiaoman',text:'那我们说好了。',source:'minimind3',at:0,latencyMs:0,targetIds:['player'],threadId:42}],game);
 expect(store.getSnapshot().find(m=>m.text==='那我们说好了。')?.replyTo).toEqual({npcId:'xiaoman',threadId:42});
});
