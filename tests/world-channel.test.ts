import { describe, expect, it } from 'vitest';
import { WorldMessageStore,worldMessageText,worldMessages } from '../src/gameMessages';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldChannel } from '../src/components/WorldChannel';
import { createGame, issueCommand } from '../src/games/camp/simulation/engine';
import { ensureAgency } from '../src/games/camp/npc/experience';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { updateCollectives,invitePeer } from '../src/games/camp/npc/collectives';
import { restoreGameState } from '../src/games/camp/simulation/persistence';

describe('world channel history',()=>{
 it('renders the mention before the dialogue text in the actual channel component',()=>{
  worldMessages.reset();
  try{
    worldMessages.append('npc','我想先歇一会。',0,'阿壮','minimind3',['领主']);
    const html=renderToStaticMarkup(createElement(WorldChannel));
    expect(html).toContain('@领主 我想先歇一会。');
  }finally{worldMessages.reset();}
 });
 it('prefixes an NPC conversation with @领主 without changing the saved utterance',()=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});game.status='playing';game.events=[];
  const opened=issueCommand(game,{type:'social-open',npcId:game.npcs[0].id,topic:'checkin'});
  store.capture(opened);const message=store.getSnapshot().find(m=>m.kind==='npc')!;
  expect(worldMessageText(message)).toBe(`@领主 ${message.text}`);
 });
 it('keeps explicit NPC recipients on final records even after the conversation is pruned',()=>{
  const store=new WorldMessageStore(true),game=createGame();game.social.threads=[];
  const record={id:'social:42:2',npcId:game.npcs[0].id,text:'你愿意和我一起谈谈吗？',source:'minimind3',at:0,latencyMs:1,threadId:42,lineId:2,targetIds:[game.npcs[1].id]};
  store.captureDialogues([record],game);
  expect(worldMessageText(store.getSnapshot()[0])).toBe(`@${game.npcs[1].name} ${record.text}`);
  store.captureDialogues([{id:'self',npcId:game.npcs[0].id,text:'我先静下来想一想。',source:'minimind3',at:1,latencyMs:1}],game);
  expect(worldMessageText(store.getSnapshot().at(-1)!)).toBe('我先静下来想一想。');
 });
 it('uses the actual invitee rather than all participants in an expanding collective conversation',()=>{
  const game=createGame();game.status='playing';game.events=[];ensureAgency(game);
  const from=game.npcs[0],to=game.npcs[1];to.position={...from.position};
  ensureCampMind(from).intent={kind:'recruit',since:0,until:10,actionId:'rest',reason:'想和同伴商量'};
  updateCollectives(game);const group=game.agency!.groups[0];expect(invitePeer(game,group,to.id)).toBe(true);
  const restored=restoreGameState(game);expect(restored).not.toBeNull();
  const store=new WorldMessageStore();store.capture(restored!);
  const invitation=store.getSnapshot().find(m=>m.text.includes('你愿意一起谈吗'))!;
  expect(invitation.recipients).toEqual([to.name]);expect(worldMessageText(invitation)).toContain(`@${to.name} `);
  const response=store.getSnapshot().filter(m=>m.speaker===to.name&&m.kind==='npc').at(-1)!;
  expect(response.recipients).toEqual([from.name]);
 });
 it.each(['template','minimind3','native:gamesoul','remote:custom'])('records %s provenance for ordinary NPC captions',source=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});game.status='playing';game.events=[];
  const npc=game.npcs[0];npc.speech='先把村里的事情安排好。';npc.speechUntil=8;
  if(source!=='template')npc.speechOrigin={text:npc.speech,until:npc.speechUntil,source};
  store.capture(game);
  const record=store.getSnapshot().find(message=>message.text===npc.speech)!;
  expect(record.source).toBe(source);
  npc.speech='我回自己的民居歇一会儿。';npc.speechUntil=9;store.capture(game);
  expect(store.getSnapshot().find(message=>message.text===npc.speech)?.source).toBe('template');
  expect(record.source).toBe(source);
 });
 it('uses transcript provenance for social dialogue and does not attribute player commands to a model',()=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});game.status='playing';game.events=[];
  const opened=issueCommand(game,{type:'social-open',npcId:game.npcs[0].id,topic:'checkin'});
  const line=opened.social.threads.at(-1)!.lines.find(item=>item.speaker!=='player')!;
  line.source='native:gamesoul';store.capture(opened);
  expect(store.getSnapshot().find(message=>message.kind==='npc'&&message.text===line.text)?.source).toBe('native:gamesoul');
  expect(store.getSnapshot().filter(message=>message.kind==='player').every(message=>message.source===undefined)).toBe(true);
 });
 it('retains only the newest 50 system entries in insertion order',()=>{
  const store=new WorldMessageStore();
  for(let i=0;i<125;i++)store.append('info',String(i));
  expect(store.getSnapshot()).toHaveLength(50);
  expect(store.getSnapshot()[0].text).toBe('75');
  expect(store.getSnapshot().at(-1)?.text).toBe('124');
 });
 it('copies all NPC captions and social lines without repeating snapshots or duplicating bubbles',()=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});game.status='playing';
  game.events=[];game.elapsed=10;
  for(const npc of game.npcs){npc.speech=`${npc.name}说话`;npc.speechUntil=15;}
  const opened=issueCommand(game,{type:'social-open',npcId:game.npcs[0].id,topic:'checkin'});
  store.capture(opened);const first=store.getSnapshot();store.capture(structuredClone(opened));
  expect(store.getSnapshot()).toBe(first);
  for(const npc of opened.npcs)expect(first.filter(m=>m.kind==='npc'&&m.text===npc.speech)).toHaveLength(1);
  const replied=issueCommand(opened,{type:'social-chat',threadId:opened.social.threads.at(-1)!.id,text:'先好好休息。'});
  store.capture(replied);
  expect(store.getSnapshot().filter(m=>m.kind==='player'&&m.text==='先好好休息。')).toHaveLength(1);
 });
 it('keeps commands before their replies and ignores high-frequency movement input and selection',()=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});game.status='playing';game.events=[];
  const command={type:'assign' as const,npcId:game.npcs[0].id,action:'wood' as const};
  store.command(command,game);store.capture(issueCommand(game,command));
  expect(store.getSnapshot()[0]).toMatchObject({kind:'player',speaker:'领主',text:`安排${game.npcs[0].name}：伐木`});
  const count=store.getSnapshot().length;
  store.command({type:'select',npcId:game.npcs[1].id},game);
  store.command({type:'lord-input',direction:{x:1,y:0}},game);
  expect(store.getSnapshot()).toHaveLength(count);
 });
 it('emits a persistent error once, then records it again if it resolves and returns',()=>{
  const store=new WorldMessageStore();
  store.condition('network','连接失败');store.condition('network','连接失败');
  expect(store.getSnapshot()).toHaveLength(1);
  store.condition('network','');store.condition('network','连接失败');
  expect(store.getSnapshot()).toHaveLength(2);
 });
 it('clears both history and event cursors when a world is reset',()=>{
  const store=new WorldMessageStore(),game=createGame({seed:17});
  store.capture(game);const count=store.getSnapshot().length;
  store.reset();expect(store.getSnapshot()).toHaveLength(0);
  store.capture(game);expect(store.getSnapshot()).toHaveLength(count);
 });
});
