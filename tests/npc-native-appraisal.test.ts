import { expect,it,vi } from 'vitest';
import { appraisalPrompt } from '../packages/npc-dialogue/src/appraisal-validation';
import { createAppraisalProvider } from '../scripts/world/appraisal-provider';
import { NativeAppraisal,nativeAppraisalSchema } from '../scripts/world/native-appraisal';
const prompt=appraisalPrompt({evidence:[{id:'azhuang:1',fact:'连续劳动很累。'}],knownPeers:['linlan']});
const result=JSON.stringify({version:1,summary:'劳动后想休息。',evidenceIds:['azhuang:1'],goal:'休息',emotionAssessment:{anger:.2,resentment:.2,stress:.6},preferences:{rest:.2},expression:{text:'我想休息。',targetId:null}});
it('routes native cognition locally without reading remote credentials',async()=>{
  const remote=vi.fn(()=>{throw new Error('remote is forbidden');});
  const native={generate:vi.fn(async(_id:string,_prompt:string,_signal:AbortSignal)=>result)};
  const provider=createAppraisalProvider(remote,undefined,native);
  expect(await provider('player','native:qwen3.5-0.8b',prompt,new AbortController().signal)).toBe(result);
  expect(native.generate.mock.calls[0]).toEqual(['qwen3.5-0.8b',prompt,expect.any(AbortSignal)]);expect(remote).not.toHaveBeenCalled();
});
it('serializes model switches, validates output evidence and honors cancelled queued work',async()=>{
  const selected:string[]=[];let active=0,max=0;
  const host={select:vi.fn(async(id:string)=>{selected.push(id);return {operation:selected.length,reused:false};}),
    snapshot:()=>({id:selected.at(-1)??null,operation:selected.length,stage:'ready',progress:1,startedAt:0,elapsedMs:0}),
    appraise:vi.fn(async()=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {content:result,latencyMs:1};}),dispose:vi.fn()};
  const local=new NativeAppraisal('unused',host);
  const abort=new AbortController();abort.abort();
  await Promise.all([local.generate('qwen-a',prompt,new AbortController().signal),local.generate('qwen-b',prompt,new AbortController().signal)]);
  expect(max).toBe(1);expect(selected).toEqual(['qwen-a','qwen-b']);
  await expect(local.generate('qwen-a',prompt,abort.signal)).rejects.toThrow();
  host.appraise.mockResolvedValue({content:result.replace('azhuang:1','invented'),latencyMs:1});
  await expect(local.generate('qwen-b',prompt,new AbortController().signal)).rejects.toThrow('证据');
  local.dispose();expect(host.dispose).toHaveBeenCalled();
});
it('constrains references and preferences in the native JSON schema',()=>{
  const schema=nativeAppraisalSchema(['e1'],['linlan']);
  expect(schema.properties.evidenceIds.items.enum).toEqual(['e1']);
  expect(schema.properties.expression.properties.targetId.enum).toEqual([null,'linlan']);
  expect(schema.properties.preferences.additionalProperties).toBe(false);
});
