export type AppraisalProvider = (prompt:string,signal:AbortSignal)=>Promise<string>;
export class AppraisalScheduler<T extends {id:string} = {id:string}> {
  private jobs = new Map<string,AbortController>();
  private ready:{key:string;ticket:T;raw:string|null}[]=[];
  schedule(key:string,ticket:T,prompt:string,provider:AppraisalProvider,timeoutMs=20000) {
    if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new Error('认知超时预算无效');
    if(this.jobs.has(key)||this.jobs.size>=2)return false;
    const controller=new AbortController(); this.jobs.set(key,controller);
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const signal=controller.signal;
    const expired=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));
    void Promise.race([provider(prompt,signal),expired]).then(raw=>{
      if(this.jobs.get(key)===controller)this.ready.push({key,ticket,raw});
    },()=>{if(this.jobs.get(key)===controller)this.ready.push({key,ticket,raw:null});})
      .finally(()=>{clearTimeout(timer);if(this.jobs.get(key)===controller)this.jobs.delete(key);});
    return true;
  }
  drain(){return this.ready.splice(0);}
  cancelPrefix(prefix:string){for(const [key,c]of this.jobs)if(key.startsWith(prefix)){this.jobs.delete(key);c.abort();}this.ready=this.ready.filter(r=>!r.key.startsWith(prefix));}
  close(){this.cancelPrefix('');}
}
