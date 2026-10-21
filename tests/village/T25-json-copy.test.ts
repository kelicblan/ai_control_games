import{expect,it}from'vitest';import{copyFiniteJson}from'../../packages/action-runtime/src/json';import{prepareCurriculumEpisode}from'../../src/games/camp/village/scenarios/curriculum';
it('preserves full world values and aliases while detaching execution rollback branches',()=>{
 const state=prepareCurriculumEpisode('tactical','cooperation',1001),copy=copyFiniteJson(state);expect(copy).toEqual(structuredClone(state));copy.actors.worker.body.hp=0;expect(state.actors.worker.body.hp).toBeGreaterThan(0);
 const shared={hp:10},graph={a:shared,b:shared},cloned=copyFiniteJson(graph);expect(cloned.a).toBe(cloned.b);expect(cloned.a).not.toBe(shared);
});
it('rejects non-JSON values and cycles, and keeps a data __proto__ key without altering prototypes',()=>{
 const cycle:Record<string,unknown>={};cycle.self=cycle;for(const value of [cycle,{hp:NaN},{at:new Date()},{fn:()=>0}])expect(()=>copyFiniteJson(value)).toThrow();
 const value=JSON.parse('{"__proto__":{"polluted":true},"hp":10}'),copy=copyFiniteJson(value);expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);expect(Object.hasOwn(copy,'__proto__')).toBe(true);expect(({}as Record<string,unknown>).polluted).toBeUndefined();
});
