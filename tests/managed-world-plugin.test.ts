import { afterEach, expect, it, vi } from 'vitest';
import { persistentWorldPlugin } from '../scripts/world/plugin';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('leaves managed world readiness to the owning launcher instead of failing on a second short probe',async()=>{
  vi.stubEnv('CAMP_WORLD_MANAGED','1');
  const fetch=vi.fn().mockRejectedValue(new DOMException('Busy world health probe timed out','TimeoutError'));
  vi.stubGlobal('fetch',fetch);
  const plugin=persistentWorldPlugin();
  const configure=plugin.configureServer as ()=>Promise<void>;
  await expect(configure()).resolves.toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
it('still verifies and reuses a healthy world in the independent development entry',async()=>{
  vi.stubEnv('CAMP_WORLD_MANAGED','');
  const root=process.cwd();
  const fetch=vi.fn().mockResolvedValue({json:async()=>({service:'campmind-world-v1',root})});
  vi.stubGlobal('fetch',fetch);
  const plugin=persistentWorldPlugin();
  (plugin.configResolved as (config:{root:string})=>void)({root});
  await expect((plugin.configureServer as ()=>Promise<void>)()).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});
