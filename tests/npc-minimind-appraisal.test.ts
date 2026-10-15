import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AgencySettings } from '../src/components/AgencySettings';
import { createGame } from '../src/games/camp/simulation/engine';
import { MiniMindAppraisal, miniMindAppraisalRequest } from '../scripts/world/minimind-appraisal';
import { createAppraisalProvider } from '../scripts/world/appraisal-provider';
import { appraisalPrompt } from '../packages/npc-dialogue/src/appraisal-validation';
const prompt=appraisalPrompt({name:'林枫',body:{energy:20},evidence:[{id:'linfeng:1',fact:'连续工作后很疲劳。',source:'experienced'}]});
it('offers built-in MiniMind cognition without a remote configuration',()=>{
  const html=renderToStaticMarkup(createElement(AgencySettings,{game:createGame(),onSave:async()=>{}}));
  expect(html).toContain('认知已默认开启');expect(html).toContain('MiniMind3');
});
it('grounds local structured generation in supplied evidence and rejects empty evidence',()=>{
  const request=miniMindAppraisalRequest(prompt);
  expect(request.prompt).toContain('连续工作后很疲劳');expect(request.candidates[4].evidenceIds).toEqual(['linfeng:1']);
  expect(request.prompt).toContain('<|im_start|>');
  expect(()=>miniMindAppraisalRequest(appraisalPrompt({evidence:[]}))).toThrow();
});
it('routes local cognition without opening remote credentials and serializes its inference slot',async()=>{
  let active=0,max=0;
  const host={select:vi.fn(async()=>({operation:1,reused:true})),snapshot:()=>({id:'minimind3',stage:'ready',operation:1,progress:1,startedAt:0,elapsedMs:0}),
    generate:vi.fn(async()=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,10));active--;return {content:'5',latencyMs:10};}),dispose:vi.fn()};
  const local=new MiniMindAppraisal('unused',host);
  const credentials=vi.fn(()=>{throw new Error('must not read remote keys');});
  const provider=createAppraisalProvider(credentials,local);
  const results=await Promise.all([provider('a','minimind3',prompt,new AbortController().signal),provider('b','minimind3',prompt,new AbortController().signal)]);
  expect(JSON.parse(results[0]).preferences).toEqual({rest:.2});
  expect(JSON.parse(results[0]).summary).toContain('希望先照顾身体');
  expect(max).toBe(1);expect(credentials).not.toHaveBeenCalled();
  const abort=new AbortController();abort.abort();
  await expect(provider('a','minimind3',prompt,abort.signal)).rejects.toThrow();
  expect(host.generate).toHaveBeenCalledTimes(2);local.dispose();expect(host.dispose).toHaveBeenCalled();
});
it('rejects invalid model selections rather than accepting fabricated cognition',async()=>{
  const host={select:async()=>({operation:1,reused:true}),snapshot:()=>({id:'minimind3',stage:'ready',operation:1,progress:1,startedAt:0,elapsedMs:0}),
    generate:async()=>({content:'我已经让领主答应了',latencyMs:1}),dispose:()=>{}};
  const local=new MiniMindAppraisal('unused',host);
  await expect(local.generate(prompt,new AbortController().signal)).rejects.toThrow('有效的认知选择');local.dispose();
});
it('never presents a previous generated interpretation as an experienced fact',()=>{
  const request=miniMindAppraisalRequest(appraisalPrompt({evidence:[{id:'azhuang:2',source:'self',fact:'此前理解：没人愿意回应。'}]}));
  expect(request.prompt).toContain('自述或先前理解（主观看法，不是外部事实）：此前理解');
  expect(request.prompt).not.toContain('本人经历：此前理解');
});
