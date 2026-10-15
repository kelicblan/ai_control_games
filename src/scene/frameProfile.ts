class Samples {
  values:number[]=[];
  cursor=0;
  constructor(private capacity:number) {}
  add(value:number){if(this.values.length<this.capacity)this.values.push(value);else{this.values[this.cursor]=value;this.cursor=(this.cursor+1)%this.capacity;}}
  summary(){const sorted=this.values.slice().sort((a,b)=>a-b),count=sorted.length;
    const percentile=(p:number)=>sorted[Math.max(0,Math.ceil(count*p)-1)]??0;
    return {count,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),over50:sorted.filter(n=>n>50).length,mean:count?sorted.reduce((a,b)=>a+b,0)/count:0};}
}
/** Bounded CPU timings. Renderer submission is not a GPU timer. */
export class FrameProfile {
  private last:number|undefined;
  private frames:Samples;
  private stages=new Map<string,Samples>();
  constructor(readonly enabled:boolean,readonly capacity=600) {this.frames=new Samples(capacity);}
  begin(now:number){if(!this.enabled)return;if(this.last!==undefined)this.frames.add(Math.max(0,now-this.last));this.last=now;}
  record(stage:string,ms:number){if(!this.enabled||!Number.isFinite(ms)||ms<0)return;let samples=this.stages.get(stage);if(!samples){samples=new Samples(this.capacity);this.stages.set(stage,samples);}samples.add(ms);}
  resetInterval(){this.last=undefined;}
  snapshot(){return {frames:this.frames.summary(),cpu:Object.fromEntries([...this.stages].map(([key,value])=>[key,value.summary()]))};}
}
