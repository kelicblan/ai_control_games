import { expect, it, vi } from 'vitest';
import { AppraisalScheduler } from '../scripts/world/appraisal-scheduler';
it('coalesces each NPC, caps global concurrency and safely drains responses', async () => {
  const s = new AppraisalScheduler(); const releases: (()=>void)[]=[];
  const provider = async (_prompt:string, signal:AbortSignal) => { await new Promise<void>((r,reject)=>{ releases.push(r);signal.addEventListener('abort',()=>reject(new Error('aborted'))); }); return '{}'; };
  expect(s.schedule('p:a',{id:'1'},'prompt',provider)).toBe(true);
  expect(s.schedule('p:a',{id:'2'},'prompt',provider)).toBe(false);
  expect(s.schedule('p:b',{id:'3'},'prompt',provider)).toBe(true);
  expect(s.schedule('p:c',{id:'4'},'prompt',provider)).toBe(false);
  releases[0](); await new Promise(r=>setTimeout(r,0));
  expect(s.drain().map(r=>r.ticket.id)).toEqual(['1']);
  s.cancelPrefix('p:'); await new Promise(r=>setTimeout(r,0));
  expect(s.drain()).toEqual([]); s.close();
});
it('allows a local cold-start budget while retaining cancellation at its deadline',async()=>{
  vi.useFakeTimers();const scheduler=new AppraisalScheduler();let signal:AbortSignal|undefined;
  try{
    scheduler.schedule('p:a',{id:'native'},'prompt',async(_p,s)=>{signal=s;return new Promise<string>(()=>{});},60000);
    await vi.advanceTimersByTimeAsync(20001);expect(signal?.aborted).toBe(false);expect(scheduler.drain()).toEqual([]);
    await vi.advanceTimersByTimeAsync(39999);expect(signal?.aborted).toBe(true);expect(scheduler.drain()[0].raw).toBeNull();
  }finally{scheduler.close();vi.useRealTimers();}
});
