let key='';
const listeners=new Set<()=>void>();
export const publication={
 getSnapshot:()=>key,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
 update:(scope:string|undefined,version:string|undefined)=>{const next=`${scope??''}:${version??''}`;if(next!==key){key=next;listeners.forEach(fn=>fn());}},
};
