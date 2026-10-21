import { expect, it, vi } from 'vitest';
import { StartupModels } from '../scripts/world/startup-models';

it('keeps the gate closed until fallback and selected model both finish', async () => {
  let miniDone!:()=>void, preferredDone!:()=>void;
  const mini={prepare:vi.fn(()=>new Promise<void>(r=>{miniDone=r;})),status:()=>({stage:'load',progress:.4})};
  const preferred={prepare:vi.fn(()=>new Promise<void>(r=>{preferredDone=r;})),status:()=>({stage:'load',progress:.2})};
  const startup=new StartupModels(mini,()=>preferred);
  startup.begin('player','native:qwen');startup.begin('player','native:qwen');
  expect(mini.prepare).toHaveBeenCalledTimes(1);expect(preferred.prepare).toHaveBeenCalledTimes(1);
  expect(startup.snapshot('player','native:qwen').stage).toBe('loading');
  preferredDone();await new Promise(r=>setTimeout(r,0));
  expect(startup.snapshot('player','native:qwen').stage).toBe('loading');
  miniDone();await new Promise(r=>setTimeout(r,0));
  expect(startup.snapshot('player','native:qwen')).toMatchObject({stage:'ready',progress:1});
  expect(startup.snapshot('player','native:other').stage).toBe('idle');
});

it('shows failures and retries without substituting fallback for the selected model',async()=>{
  const mini={prepare:vi.fn(async()=>{}),status:()=>({stage:'ready',progress:1})};
  const preferred={prepare:vi.fn(async():Promise<void>=>{throw new Error('所选模型不可用');}),status:()=>({stage:'error',progress:null})};
  const startup=new StartupModels(mini,()=>preferred);startup.begin('player','remote:model');
  await new Promise(r=>setTimeout(r,0));
  expect(startup.snapshot('player','remote:model')).toMatchObject({stage:'error',error:'所选模型不可用'});
  preferred.prepare.mockImplementation(async()=>{});startup.begin('player','remote:model');
  await new Promise(r=>setTimeout(r,0));expect(startup.snapshot('player','remote:model').stage).toBe('ready');
});

it('loads only MiniMind3 when no preferred model is selected',async()=>{
  const preferred=vi.fn();const startup=new StartupModels({prepare:async()=>{},status:()=>({stage:'ready',progress:1})},preferred);
  startup.begin('player','minimind3');await new Promise(r=>setTimeout(r,0));
  expect(startup.snapshot('player','minimind3').stage).toBe('ready');expect(preferred).not.toHaveBeenCalled();
});

it('keeps verification, initialization and weight-loading progress in order',()=>{
  let stage='verify',progress:number|null=1;
  const mini={prepare:()=>new Promise<void>(()=>{}),status:()=>({stage,progress})};
  const startup=new StartupModels(mini,()=>mini);startup.begin('player','minimind3');
  const verify=startup.snapshot('player','minimind3').progress;
  stage='initialize';progress=null;expect(startup.snapshot('player','minimind3').progress).toBeGreaterThanOrEqual(verify);
  stage='load';progress=.5;expect(startup.snapshot('player','minimind3').progress).toBeGreaterThan(verify);
  expect(startup.snapshot('player','minimind3').stage).toBe('loading');
});
