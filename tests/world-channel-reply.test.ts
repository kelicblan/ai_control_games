import {it,expect} from 'vitest';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SocialDialog} from '../src/components/SocialDialog';
import {postMessage} from '../src/games/camp/social/state';
import {WorldMessageStore} from '../src/gameMessages';
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
it('opens the addressed NPC and offers continuation after an acknowledged arrangement',()=>{
 let game=createGame();game.status='playing';game=issueCommand(game,{type:'social-open',npcId:'xiaoman',topic:'checkin'});
 const thread=game.social.threads.at(-1)!;expect(thread).toBeDefined();thread.status='resolved';thread.choiceId='promise-meal';
 const html=renderToStaticMarkup(createElement(SocialDialog,{game,thread,npcId:'xiaoman',onCommand:()=>{},onTopic:()=>{},onClose:()=>{}}));
 expect(html).toContain('<h3>小满</h3>');expect(html).toContain('>继续聊聊</button>');
});
