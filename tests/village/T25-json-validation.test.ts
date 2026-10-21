import{expect,it}from'vitest';import{assertFiniteJson,canonical}from'../../packages/action-runtime/src/json';
it('fast mutation validation accepts the canonical JSON domain and rejects invalid nested effects',()=>{
 for(const value of [null,true,3,'中文',[1,{x:2}],{position:{x:0,y:1},events:[{kind:'actor.rescued',facts:{amount:1}}]}]){expect(()=>canonical(value)).not.toThrow();expect(()=>assertFiniteJson(value)).not.toThrow();}
 for(const value of [undefined,NaN,Infinity,{x:NaN},{a:undefined},new Date(),new Map(),[1,()=>0]])expect(()=>assertFiniteJson(value)).toThrow();
 const cycle:Record<string,unknown>={};cycle.self=cycle;expect(()=>assertFiniteJson(cycle)).toThrow();
});
