import { expect,it } from 'vitest';
import { selectWorldRules } from '../../src/games/camp/village/config/load';
import { createVillageState } from '../../src/games/camp/village/domain/state';
import { initializeEconomy } from '../../src/games/camp/village/systems/resources';
import { advanceVillage } from '../../src/games/camp/village/systems/advance';
import { advanceIdleVillage } from '../../src/games/camp/village/systems/catchup';
it('event-boundary idle catchup is identical to 100ms stepping over two days',()=>{
 const r=selectWorldRules('village-v1','p4-social-content-v1');const s=createVillageState(r,{id:'idle',worldId:'idle',classification:'fixture',seed:1,actors:[],inventory:{food:10}});initializeEconomy(s,r);s.paused=false;
 const slow=structuredClone(s),fast=structuredClone(s);for(let i=0;i<14402;i++)advanceVillage(slow);
 const report=advanceIdleVillage(fast,14402);expect(report.skippedTicks).toBeGreaterThan(14000);expect(fast).toEqual(slow);
});
