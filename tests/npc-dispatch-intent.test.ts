import { describe, expect, it } from 'vitest';
import { NpcDispatchIntent } from '../src/npcDispatchIntent';

describe('explicit NPC dispatch intent',()=>{
 it('never moves a selected NPC without arming dispatch first',()=>{
  expect(new NpcDispatchIntent().take('azhuang',{x:50,y:110})).toBeNull();
 });
 it('allows exactly one destination for the explicitly armed NPC',()=>{
  const intent=new NpcDispatchIntent();intent.arm('xiaomi');
  const target={x:70,y:120};
  expect(intent.take('xiaomi',target)).toEqual({type:'move',npcId:'xiaomi',target});
  expect(intent.take('xiaomi',{x:20,y:150})).toBeNull();
 });
 it('cancels without issuing a command and never carries intent to a different NPC',()=>{
  const intent=new NpcDispatchIntent();intent.arm('xiaomi');intent.cancel();
  expect(intent.take('xiaomi',{x:50,y:110})).toBeNull();
  intent.arm('xiaomi');expect(intent.take('aye',{x:50,y:110})).toBeNull();
  expect(intent.take('xiaomi',{x:50,y:110})).toBeNull();
 });
 it('rejects invalid destinations and copies the chosen coordinate',()=>{
  const intent=new NpcDispatchIntent();intent.arm('azhuang');
  expect(intent.take('azhuang',{x:NaN,y:20})).toBeNull();
  intent.arm('azhuang');const target={x:50,y:110},command=intent.take('azhuang',target)!;
  target.x=99;expect(command.target).toEqual({x:50,y:110});
 });
});
