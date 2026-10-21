import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CognitionSettingsStore} from '../scripts/world/cognition-settings';
it('defaults new village players to MiniMind3 and persists Qwen 2B independently of a legacy world',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'village-cognition-')),file=path.join(dir,'world.sqlite');
 try{let store=new CognitionSettingsStore(file);
 expect(store.read('p')).toEqual({modelId:'minimind3',enabled:true,cognition:true});
 store.save('p',{modelId:'native:qwen3.5-2b',enabled:true,cognition:true});store.close();store=new CognitionSettingsStore(file);
 try{expect(store.read('p').modelId).toBe('native:qwen3.5-2b');expect(store.read('other').modelId).toBe('minimind3');expect(()=>store.save('p',{modelId:'native:qwen3-4b',enabled:true,cognition:true})).toThrow();}finally{store.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
