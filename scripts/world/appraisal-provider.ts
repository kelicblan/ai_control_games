import { remoteCompletion } from '../native-models/remote';
import type { RemoteCredentialStore } from './remote-models';
import type { MiniMindAppraisal } from './minimind-appraisal';
import type { NativeAppraisal } from './native-appraisal';
import type { JsonGenerator } from './moderation/service';
export function createSocialModel(store:()=>RemoteCredentialStore,local:MiniMindAppraisal,native:NativeAppraisal){
  return (player:string,modelId:string):JsonGenerator=>async(prompt,schema,signal)=>{
    if(modelId==='minimind3')return local.generateJSON(prompt,schema,signal);
    if(modelId.startsWith('native:'))return native.generateJSON(modelId.slice(7),prompt,schema,signal);
    const result=await remoteCompletion({...store().credentials(player,modelId),prompt:prompt+'\n输出 JSON schema：'+JSON.stringify(schema),cognition:true},signal);
    return result.content.replace(/^```(?:json)?\s*|\s*```$/g,'').trim();
  };
}
export function createAppraisalProvider(store:()=>RemoteCredentialStore,local?:Pick<MiniMindAppraisal,'generate'>,native?:Pick<NativeAppraisal,'generate'>) {
  return async (player:string,modelId:string,prompt:string,signal:AbortSignal) => {
    if(modelId==='minimind3'){
      if(!local)throw new Error('MiniMind3 认知服务未配置');
      return local.generate(prompt,signal);
    }
    if(modelId.startsWith('native:')){
      if(!native)throw new Error('本地原生认知服务未配置');
      return native.generate(modelId.slice(7),prompt,signal);
    }
    const result=await remoteCompletion({...store().credentials(player,modelId),prompt,cognition:true},signal);
    return result.content;
  };
}
