import type { Lexicon } from './lexicon';
export type JsonGenerator=(prompt:string,schema:Record<string,unknown>,signal:AbortSignal)=>Promise<string>;
export const SAFE_REPLY='这次先不聊了，改天再说。';
export interface Reviewed {text:string;allowed:boolean;version:string;source:'reviewed'|'safety';}
export class Moderation {
  readonly stats={accepted:0,blocked:0,failed:0};
  constructor(readonly lexicon:Lexicon){}
  fallback():Reviewed{return {text:this.lexicon.ready?this.lexicon.mask(SAFE_REPLY):'**',allowed:false,version:this.lexicon.version,source:'safety'};}
  async review(text:string,_generate?:JsonGenerator,signal?:AbortSignal):Promise<Reviewed>{
    // Current product rule: mask the configured words, without model approval.
    // Intent/schema validation remains the caller's responsibility.
    if(!this.lexicon.ready||text.length>8000||signal?.aborted){this.stats.failed++;return this.fallback();}
    this.stats.accepted++;
    return {text:this.lexicon.mask(text),allowed:true,version:this.lexicon.version,source:'reviewed'};
  }
}
