import {it,expect,vi} from 'vitest';
vi.hoisted(()=>{process.env.CAMP_WORLD_LAYOUT='new-world-v1';});
import {VillageRuntime} from '../scripts/world/village-runtime';
import {VillageAnimals} from '../scripts/world/village-animals';
import {DatabaseSync} from 'node:sqlite';
import {createVillageState} from '../src/games/camp/village/domain/state';
import {selectWorldRules} from '../src/games/camp/village/config/load';
import {campaignScenario} from '../src/games/camp/village/scenarios/campaign';
import {initializeEconomy} from '../src/games/camp/village/systems/resources';
import {initializeCombat} from '../src/games/camp/village/systems/combat';
import {wildernessSites} from '../src/games/camp/world/wildernessSites';
import {SPECIES} from '../src/games/camp/animals/engine';
import {supplement} from '../src/games/camp/village/systems/resources';
import {submitCommand} from '../src/games/camp/village/systems/commands';
import {advanceVillage} from '../src/games/camp/village/systems/advance';
it('formal new world exposes six species, pauses ecology and keeps human models valid',()=>{const r=new VillageRuntime(':memory:',()=>1000,false);try{let s=r.createCampaign('owner',64138) as any;expect(s.ecology.animals).toHaveLength(22);expect(new Set(s.ecology.animals.map((a:any)=>a.species)).size).toBe(6);const before=structuredClone(s.ecology);r.tick();expect((r.read('owner')as any).ecology).toEqual(before);s=r.setPaused('owner',s.revision,false,s.worldId);for(let i=0;i<5;i++)r.tick();s=r.read('owner');expect(s.ecology.time).toBeCloseTo(s.elapsed);expect(s.models.life).toBeTruthy();expect(s.models.tactical).toBeTruthy();expect(s.policyErrors).toEqual({});}finally{r.close();}});
it('hunt validates sensing, respects obstacles, persists damage, collects finite carcass and reloads',()=>{
 const db=new DatabaseSync(':memory:');try{const rules=selectWorldRules('village-v1','p4-social-content-v1'),site=wildernessSites(64138).find(p=>p.kind==='wood')!;
 const s=createVillageState(rules,{...campaignScenario('animal-hunt-test',64138,site.position),navigationMode:'shared-world'});initializeEconomy(s,rules);initializeCombat(s,{center:site.position,radius:10});s.navigation={mode:'shared-world',routes:{}};s.combat!.gateOpen=true;
 s.economy!.storePosition={...site.position};s.actors.player.position={...site.position};s.paused=false;
 expect(submitCommand(s,{operationId:'craft-bow',actorId:'player',action:'CRAFT',parameters:{recipeId:'WPN005',recipientId:'player',agreementId:null},readSet:{},source:'scripted_test'}).accepted).toBe(true);
 for(let i=0;i<710;i++)advanceVillage(s);
 const item=Object.values(s.economy!.items)[0];expect(item).toBeTruthy();
 expect(submitCommand(s,{operationId:'equip-bow',actorId:'player',action:'EQUIP',parameters:{itemId:item.id},readSet:{},source:'scripted_test'}).accepted).toBe(true);advanceVillage(s);expect(s.actors.player.equipment).toBe(item.id);
 const host=new VillageAnimals(db);const first=host.publicState(s)!;const target=first.animals[0];s.actors.player.position={...target.position};
 expect(()=>host.hunt(s,'animal-missing','missing')).toThrow();host.hunt(s,target.id,'hunt-1');expect(()=>host.hunt(s,target.id,'hunt-2')).toThrow('busy');
 // Production resolver and physical stepping; no direct HP/loot edits.
 for(let i=0;i<1000&&host.busy(s);i++){s.tick++;s.elapsed=s.tick*.1;host.step(s);}
 const final=host.publicState(s)!;expect(final.animals[0].hp).toBe(0);
 const reloaded=new VillageAnimals(db).publicState(s)!;expect(reloaded.animals).toEqual(final.animals);expect(reloaded.time).toBe(final.time);expect(s.actors.player.carried.meat??0).toBeGreaterThan(0);expect((s.actors.player.carried.meat??0)+final.animals[0].carcass).toBe(SPECIES[target.species].food);expect(Object.values(s.actors.player.carried).reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(supplement<{carryCapacity:number}>(rules,'D17').carryCapacity);
 const completed=s.events.find(e=>e.kind==='wildlife.hunt_completed')!;expect(completed).toBeTruthy();expect(s.actors.player.personal.knowledge.evidence[completed.id]).toBeTruthy();
 }finally{db.close();}
});
