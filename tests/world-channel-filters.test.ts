import { describe, expect, it } from 'vitest';
import { WorldMessageStore, type WorldMessage } from '../src/gameMessages';
import { filterWorldMessages } from '../src/worldMessageFilters';

describe('world channel tabs',()=>{
 const messages:WorldMessage[]=['npc','player','info','good','warning','danger','error'].map((kind,index)=>({id:index+1,kind:kind as WorldMessage['kind'],speaker:'测试',text:String(index),time:index}));
 it('shows every type in All, including warnings and failures',()=>{
  expect(filterWorldMessages(messages,'all')).toEqual(messages);
 });
 it('separates every system severity from NPC and player conversations',()=>{
  expect(filterWorldMessages(messages,'system').map(m=>m.kind)).toEqual(['info','good','warning','danger','error']);
  expect(filterWorldMessages(messages,'channel').map(m=>m.kind)).toEqual(['npc','player']);
  expect([...filterWorldMessages(messages,'system'),...filterWorldMessages(messages,'channel')]).toHaveLength(messages.length);
 });
 it('preserves original order with independent system and conversation boundaries',()=>{
  const store=new WorldMessageStore();
  for(let i=0;i<110;i++)store.append(i%2?'npc':'info',String(i));
  const before=store.getSnapshot();
  const conversation=filterWorldMessages(before,'channel');
  expect(conversation.map(m=>m.text)).toEqual(Array.from({length:55},(_,i)=>String(1+i*2)));
  expect(conversation[0]).toBe(before[0]);
  expect(filterWorldMessages(before,'system')).toHaveLength(50);
  expect(store.getSnapshot()).toBe(before);
  expect(filterWorldMessages([],'channel')).toEqual([]);
 });
 it('keeps 100 conversations and 50 system messages without either category displacing the other',()=>{
  const store=new WorldMessageStore();
  for(let i=0;i<130;i++)store.append(i%2?'npc':'player',`talk-${i}`);
  for(let i=0;i<75;i++)store.append('warning',`system-${i}`);
  expect(store.getSnapshot()).toHaveLength(150);
  expect(filterWorldMessages(store.getSnapshot(),'channel')).toHaveLength(100);
  expect(filterWorldMessages(store.getSnapshot(),'channel')[0].text).toBe('talk-30');
  expect(filterWorldMessages(store.getSnapshot(),'system')).toHaveLength(50);
  expect(filterWorldMessages(store.getSnapshot(),'system')[0].text).toBe('system-25');
  for(let i=0;i<90;i++)store.waiting(`pending-${i}`,'伙伴',0,'加载失败');
  expect(filterWorldMessages(store.getSnapshot(),'system')).toHaveLength(50);
  expect(filterWorldMessages(store.getSnapshot(),'channel')).toHaveLength(100);
 });
});
