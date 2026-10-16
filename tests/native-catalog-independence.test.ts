import { expect,it,vi } from 'vitest';
import * as native from '../src/integrations/models/native';
import { modelManager,refreshModelCatalog,remoteModels } from '../src/integrations/models/runtime';
it('publishes local model discovery while remote test metadata is still pending',async()=>{
  let release!:()=>void;const before=modelManager.catalog();
  vi.spyOn(native,'nativeCatalog').mockResolvedValue([{id:'local-test',name:'Local',backend:'native',available:true}]);
  vi.spyOn(remoteModels,'refresh').mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
  const refresh=refreshModelCatalog();
  try{
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(modelManager.catalog().some(m=>m.id==='local-test')).toBe(true);
  }finally{release();await refresh;vi.restoreAllMocks();modelManager.setCatalog(before);}
});
