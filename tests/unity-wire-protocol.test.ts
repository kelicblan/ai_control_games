import { describe, expect, it } from 'vitest';
import { nativeProtocol, nativeSnapshot, NativeProtocolError } from '../scripts/world/native-protocol';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {getSocialChoices} from '../src/games/camp/simulation/social';
import {environmentalMix} from '../src/games/camp/simulation/ambient';

describe('versioned native wire adaptation',()=>{
  it('projects original environmental audio from the listener without changing simulation',()=>{
    const state=createGame({seed:17}),context={listener:{x:51,y:54},right:{x:0,y:1}},snapshot={revision:1,state,speed:2};
    const result=nativeSnapshot(snapshot,true,context) as unknown as {presentation:{audio:{ambient:unknown}}};
    expect(result.presentation.audio.ambient).toEqual(environmentalMix(state.atmosphere,state.elapsed,{fire:state.fire,listener:context.listener,listenerRight:context.right,seed:state.seed,timeScale:2}));
  });
  it('projects actual legal social replies without mutating authoritative state',()=>{
    const state=issueCommand({...createGame({seed:17}),status:'paused'},{type:'social-open',npcId:'azhuang'});
    const before=JSON.stringify(state),snapshot={revision:1,state};
    const projected=nativeSnapshot(snapshot,true) as typeof snapshot&{presentation:{socialChoices:{threadId:number;options:unknown[]}[]}};
    const thread=state.social.threads.find(t=>t.initiator==='azhuang')!;
    expect(projected.presentation.socialChoices.find(s=>s.threadId===thread.id)?.options).toEqual(getSocialChoices(state,thread));
    expect(JSON.stringify(state)).toBe(before);expect(nativeSnapshot(snapshot,false)).toBe(snapshot);
  });
  it('preserves existing Web responses and explicitly versions native snapshots',()=>{
    const snapshot={revision:4,state:null};
    expect(nativeProtocol(undefined)).toBe(false);expect(nativeSnapshot(snapshot,false)).toBe(snapshot);
    expect(nativeProtocol('1')).toBe(true);expect(nativeSnapshot(snapshot,true)).toEqual({schemaVersion:1,revision:4,state:null});
  });
  it('rejects unknown and ambiguous versions before world mutation',()=>{
    for(const version of ['0','2','1, 2',['1','2']])expect(()=>nativeProtocol(version)).toThrow(NativeProtocolError);
  });
});
