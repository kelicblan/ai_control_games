import { NativeModelHost } from '../native-models/host';
import { APPRAISAL_INTENTS, parseAppraisal } from '../../packages/npc-dialogue/src/appraisal-validation';
export function nativeAppraisalSchema(evidence:string[],targets:string[]) {
  const text=(maxLength:number)=>({type:'string',minLength:1,maxLength});
  const level={type:'number',minimum:0,maximum:1};
  return {type:'object',additionalProperties:false,required:['version','summary','evidenceIds','goal','emotionAssessment','preferences','expression'],properties:{
    version:{type:'integer',const:1},summary:text(100),
    evidenceIds:{type:'array',minItems:1,maxItems:12,items:{type:'string',enum:evidence}},goal:text(60),
    emotionAssessment:{type:'object',additionalProperties:false,required:['anger','resentment','stress'],properties:{anger:level,resentment:level,stress:level}},
    preferences:{type:'object',additionalProperties:false,properties:Object.fromEntries(APPRAISAL_INTENTS.map(intent=>[intent,{type:'number',minimum:-.25,maximum:.25}]))},
    expression:{type:'object',additionalProperties:false,required:['text','targetId'],properties:{text:text(60),targetId:{enum:[null,...targets]}}},
  }};
}
type Host=Pick<NativeModelHost,'select'|'snapshot'|'appraise'|'dispose'>&Partial<Pick<NativeModelHost,'catalog'>>;
export class NativeAppraisal {
  private host:Host;
  private queue:Promise<unknown>=Promise.resolve();
  constructor(root:string,host?:Host){this.host=host??new NativeModelHost(root,{cacheName:`npc-native-cognition-${process.pid}`});}
  async metadata(){const models=await this.host.catalog?.()??[];return {models:models.map(({id,name,available,bytes,threads,context})=>({id:`native:${id}`,name,available,bytes,threads,context})),status:this.host.snapshot()};}
  generate(id:string,prompt:string,signal:AbortSignal):Promise<string> {
    const work=this.queue.catch(()=>{}).then(async()=>{
      signal.throwIfAborted();
      if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)||prompt.length>6000)throw new Error('本地认知模型或上下文无效');
      const marker='\n数据：',start=prompt.indexOf(marker);
      if(start<0)throw new Error('本地认知缺少上下文');
      const context=JSON.parse(prompt.slice(start+marker.length));
      const evidence:string[]=context.evidence?.map((e:{id:string})=>e.id)??[],targets:string[]=context.knownPeers??[];
      if(!evidence.length||evidence.length>12||evidence.some(e=>typeof e!=='string'))throw new Error('本地认知缺少证据');
      const selection=await this.host.select(id);
      while(this.host.snapshot().stage!=='ready'){
        signal.throwIfAborted();const status=this.host.snapshot();
        if(status.stage==='error')throw new Error(status.error??'本地认知模型加载失败');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      signal.throwIfAborted();
      const result=await this.host.appraise(id,selection.operation,prompt,nativeAppraisalSchema(evidence,targets),signal);
      parseAppraisal(result.content,evidence,targets);
      return result.content;
    });
    this.queue=work;return work;
  }
  dispose(){this.host.dispose();}
  status(){return this.host.snapshot();}
  prepare(id:string):Promise<void>{
    const work=this.queue.catch(()=>{}).then(async()=>{
      await this.host.select(id);const deadline=Date.now()+180000;
      while(this.host.snapshot().stage!=='ready'){
        const status=this.host.snapshot();
        if(status.stage==='error')throw new Error(status.error??'所选模型加载失败');
        if(Date.now()>deadline)throw new Error('所选模型加载超时');
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    });this.queue=work;return work;
  }
  generateJSON(id:string,prompt:string,schema:Record<string,unknown>,signal:AbortSignal):Promise<string>{
    const work=this.queue.catch(()=>{}).then(async()=>{
      signal.throwIfAborted();const selection=await this.host.select(id);
      while(this.host.snapshot().stage!=='ready'){
        signal.throwIfAborted();if(this.host.snapshot().stage==='error')throw new Error('本地模型加载失败');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      return (await this.host.appraise(id,selection.operation,prompt,schema,signal,true)).content;
    });this.queue=work;return work;
  }
}
