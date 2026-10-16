import { it, expect } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Lexicon } from '../scripts/world/moderation/lexicon';
import { Moderation } from '../scripts/world/moderation/service';
it('uses the configured word list without model approval or a pending placeholder',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'review-')),file=path.join(dir,'words.txt');writeFileSync(file,'测试禁词');
 const lexicon=new Lexicon(file),moderation=new Moderation(lexicon);
 expect((await moderation.review('测试禁词一起聊。')).allowed).toBe(true);
 const safe=await moderation.review('测试禁词一起聊。',async()=>JSON.stringify({safe:true}));
 expect(safe.text).toBe('**一起聊。');expect(safe.allowed).toBe(true);
 let calls=0;const ordinary=await moderation.review('今天去广场聊聊。',async()=>{calls++;throw new Error('offline');});
 expect(ordinary.allowed).toBe(true);expect(ordinary.text).toBe('今天去广场聊聊。');expect(calls).toBe(0);
 expect((await moderation.review('今天去广场聊聊。',undefined,AbortSignal.abort())).allowed).toBe(false);
 lexicon.close();rmSync(dir,{recursive:true,force:true});
});
