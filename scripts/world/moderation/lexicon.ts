import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Map normalized code units back to original spans, including surrogate pairs. */
function normalize(text:string) {
  let value='';const spans:{start:number;end:number}[]=[];let offset=0;
  for(const char of text){
    const start=offset;offset+=char.length;
    for(const normalized of char.normalize('NFKC').toLowerCase()){
      if(/[\s\u200b-\u200f\u202a-\u202e\u2060\ufeff·._-]/u.test(normalized))continue;
      value+=normalized;for(let i=0;i<normalized.length;i++)spans.push({start,end:offset});
    }
  }
  return {value,spans};
}
export class Lexicon {
  ready=false;version='unavailable';error:string|null=null;
  private words:string[]=[];private timer?:ReturnType<typeof setInterval>;
  private pendingVersion?:string;
  constructor(readonly file:string){this.reload();}
  watch(){this.timer??=setInterval(()=>this.reload(true),1000);this.timer.unref();return this;}
  reload(requireStable=false){
    try{
      if(statSync(this.file).size>512_000)throw new Error();
      const bytes=readFileSync(this.file),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const version=createHash('sha256').update(bytes).digest('hex').slice(0,16);
      if(version===this.version){this.error=null;return;}
      // Editors may truncate before writing. Publish only after two identical polls.
      if(requireStable&&version!==this.pendingVersion){this.pendingVersion=version;return;}
      const words=[...new Set(text.replace(/^\ufeff/,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>{
        if(s.length>128)throw new Error();const word=normalize(s).value;if(!word)throw new Error();return word;
      }))];
      if(words.length>10000)throw new Error();
      this.words=words.sort((a,b)=>b.length-a.length);this.version=version;this.ready=true;this.error=null;
    }catch{this.pendingVersion=undefined;this.error='词库读取失败，保留上次有效版本';}
  }
  mask(text:string){
    const {value,spans}=normalize(text),ranges:{start:number;end:number}[]=[];
    for(const word of this.words){let at=0;while((at=value.indexOf(word,at))>=0){ranges.push({start:spans[at].start,end:spans[at+word.length-1].end});at++;}}
    ranges.sort((a,b)=>a.start-b.start||b.end-a.end);
    const merged:typeof ranges=[];
    for(const range of ranges){const last=merged.at(-1);if(last&&range.start<last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
    let result='',end=0;for(const range of merged){result+=text.slice(end,range.start)+'**';end=range.end;}return result+text.slice(end);
  }
  close(){clearInterval(this.timer);this.timer=undefined;}
}
