import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Lexicon } from '../scripts/world/moderation/lexicon';
describe('live moderation lexicon', () => {
  it('normalizes variants, preserves offsets and masks longest literal spans', () => {
    const dir=mkdtempSync(path.join(tmpdir(),'lexicon-')),file=path.join(dir,'words.txt');
    writeFileSync(file,'\ufeff# 示例\n测试禁词\n测试禁\nabc\na+b\nabc\n');
    const words=new Lexicon(file);
    expect(words.mask('🙂测试 禁\u200b词、ＡＢＣ和a+b。')).toBe('🙂**、**和**。');
    const version=words.version;
    writeFileSync(file,'新禁词\n'); words.reload();
    expect(words.version).not.toBe(version);expect(words.mask('测试禁词新禁词')).toBe('测试禁词**');
    unlinkSync(file);words.reload();expect(words.ready).toBe(true);expect(words.mask('新禁词')).toBe('**');
    words.close();rmSync(dir,{recursive:true,force:true});
  });
  it('fails closed on missing file and accepts an explicitly empty file',()=>{
    const dir=mkdtempSync(path.join(tmpdir(),'lexicon-')),file=path.join(dir,'words.txt');
    const words=new Lexicon(file);expect(words.ready).toBe(false);
    writeFileSync(file,'# deliberately empty\n');words.reload();expect(words.ready).toBe(true);
    words.close();rmSync(dir,{recursive:true,force:true});
  });
});
