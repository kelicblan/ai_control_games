import {getSocialChoices} from '../../src/games/camp/simulation/social';
import type {GameState} from '../../src/games/camp/simulation/types';
import {environmentalMix,thunderMix} from '../../src/games/camp/simulation/ambient';
import type {Point} from '../../src/games/camp/simulation/types';
export interface NativeAudioContext {listener:Point;right:Point}
export function nativeAudioContext(header:string|string[]|undefined):NativeAudioContext|undefined {
  if(header===undefined)return undefined;
  if(typeof header!=='string'||header.length>240)throw new Error('声音监听参数无效');
  const values:unknown=JSON.parse(header);
  if(!Array.isArray(values)||values.length!==4||!values.every(x=>typeof x==='number'&&Number.isFinite(x))||Math.abs(values[0])>1e7||Math.abs(values[1])>1e7||Math.abs(values[2])>1||Math.abs(values[3])>1)throw new Error('声音监听参数无效');
  return {listener:{x:values[0],y:values[1]},right:{x:values[2],y:values[3]}};
}
export class NativeProtocolError extends Error {
  constructor(){super('Unsupported native wire protocol; this service supports version 1');}
}
/** Opt-in adaptation preserves the existing Web protocol byte shape. */
export function nativeProtocol(header:string|string[]|undefined):boolean {
  if(header===undefined)return false;
  if(header!=='1')throw new NativeProtocolError();
  return true;
}
export function nativeSnapshot<T extends object>(snapshot:T,native:boolean,context?:NativeAudioContext):T|T&{schemaVersion:1}{
  if(!native)return snapshot;
  const state=(snapshot as {state?:GameState|null}).state;
  const environment=state?{fire:state.fire,listener:context?.listener??state.npcs.find(n=>n.id===state.selectedNpc)?.position??{x:50,y:55},listenerRight:context?.right,seed:state.seed,timeScale:(snapshot as {speed?:number}).speed}:undefined;
  return {...snapshot,schemaVersion:1 as const,...(state?.social?{presentation:{socialChoices:state.social.threads.filter(t=>t.status==='open').map(t=>({threadId:t.id,npcId:t.initiator,options:getSocialChoices(state,t)})),audio:{ambient:environmentalMix(state.atmosphere,state.elapsed,environment),thunder:thunderMix(state.atmosphere,state.elapsed,environment)}}}:{})};
}
