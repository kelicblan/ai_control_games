import { expect, it } from 'vitest';
import { createGame, issueCommand, advanceGameSteps } from '../src/games/camp/simulation/engine';
import { ensureAgency, remember } from '../src/games/camp/npc/experience';
import { restoreGameState } from '../src/games/camp/simulation/persistence';
import { recordMindEvent } from '../src/games/camp/npc/bridge';
import { WorldRuntime } from '../scripts/world/runtime';
import { baselinePolicy } from '../src/games/camp/ai/policy';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
it('reads legacy states, retains unresolved concerns and rejects malformed/future memory state',()=>{
  const s=createGame();expect(restoreGameState(s)).not.toBeNull();ensureAgency(s);
  for(let i=0;i<60;i++)remember(s,'azhuang','self',`第${i}次表达。`,'azhuang',['azhuang'],'self');
  expect(restoreGameState(s)!.agency!.people.azhuang!.memory.recent).toHaveLength(48);
  const invalid=structuredClone(s);invalid.agency!.version=2 as 1;expect(restoreGameState(invalid)).toBeNull();
});
it('imports surviving legacy dialogue and preserves original experience times',()=>{
  let s=createGame();s.status='playing';recordMindEvent(s,s.npcs[0],'praised','领主肯定了我的付出。');
  s=issueCommand(s,{type:'social-open',npcId:'azhuang',topic:'checkin'});
  s=issueCommand(s,{type:'social-chat',threadId:s.social.threads.at(-1)!.id,text:'记得之前的交流。'});
  s=advanceGameSteps(s,10,baselinePolicy);
  const dir=mkdtempSync(path.join(tmpdir(),'legacy-memory-')),r=new WorldRuntime(path.join(dir,'world.sqlite'),baselinePolicy,()=>10000);
  try{r.mutate('p',0,'import',{type:'import',state:s},'t');
    const migrated=r.mutate('p',1,'select',{type:'command',command:{type:'select',npcId:'azhuang'}},'t').state!;
    const memories=migrated.agency!.people.azhuang!.memory.recent;
    expect(memories.some(e=>e.fact.includes('记得之前的交流')&&e.at===0)).toBe(true);
    expect(memories.some(e=>e.fact.includes('肯定了我的付出')&&e.at===0)).toBe(true);
  }finally{r.close();rmSync(dir,{recursive:true,force:true});}
});
