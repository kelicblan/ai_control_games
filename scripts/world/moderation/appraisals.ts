import type { Moderation,JsonGenerator } from './service';
/** Review before cognition affects emotions, preferences, memories or SQLite. */
export class ReviewedAppraisals {
 private approved=new Map<string,string>();
 constructor(private moderation:Moderation){}
 accepts(raw:string|null){return typeof raw==='string'&&this.approved.get(raw)===this.moderation.lexicon.version;}
 async review(raw:string,generate:JsonGenerator,signal:AbortSignal){
  const result=await this.moderation.review(raw,generate,signal);
  if(!result.allowed)throw new Error('认知内容未通过审核');
  const value=JSON.parse(raw);
  for(const key of ['summary','goal'])if(typeof value[key]==='string')value[key]=this.moderation.lexicon.mask(value[key]);
  if(typeof value.expression?.text==='string')value.expression.text=this.moderation.lexicon.mask(value.expression.text);
  const safe=JSON.stringify(value);this.approved.set(safe,result.version);
  while(this.approved.size>256)this.approved.delete(this.approved.keys().next().value!);
  return safe;
 }
}
