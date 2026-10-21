import contract from './contract.json';
import type { PolicyInput } from '../../../../../packages/policy-runtime/src/types';
/** Bootstrap ranking over OWN observation only. No hidden inventory, actor role or enemy truth. */
export function chooseReleaseLifeTeacher(input:PolicyInput):string|null{
 const names=contract.life.stateGroups.flatMap(g=>contract.stateGroups[g as keyof typeof contract.stateGroups].map(f=>f.id));
 const value=(name:string)=>input.stateFeatures[names.indexOf(name)],find=(action:string)=>input.candidates.find(c=>c.action===action);
 const amount=(resource:string)=>{const v=value(`known_free_${resource}_log`);return v<0?0:Math.expm1(v*Math.log1p(1000));};
 const numeric=(c:PolicyInput['candidates'][number],name:string)=>c.features[32+contract.candidateNumeric.findIndex(f=>f.id===name)];
 const obtain=(resource:string)=>find(`GATHER_${resource.toUpperCase()}`)??input.candidates.find(c=>c.action==='EXPLORE'&&c.parameters.resource===resource);
 const result=()=>{
  if(find('SEEK_SHELTER'))return find('SEEK_SHELTER');
  if(find('ATTACK')&&value('energy')>.5&&amount('food')<20)return find('ATTACK');
  if(value('energy')<.4)return find('REST');
  if(value('hunger')>.1&&find('EAT'))return find('EAT');
  if(find('DEPOSIT'))return find('DEPOSIT');
  if(find('REQUEST_CHANGE'))return find('REQUEST_CHANGE');
  const equipped=input.candidates.filter(c=>c.action==='EQUIP').sort((a,b)=>numeric(b,'expected_yield_norm')-numeric(a,'expected_yield_norm')||a.id.localeCompare(b.id))[0];if(equipped&&numeric(equipped,'expected_yield_norm')>0)return equipped;
  if(amount('food')<Math.max(6,(Math.max(0,value('known_population_ratio'))*10+1)*3)&&find('GATHER_FOOD'))return find('GATHER_FOOD');
  if(find('REPAIR_FENCE'))return find('REPAIR_FENCE');
  if(find('GUARD'))return find('GUARD');
  if(value('goal_affiliation')>.3&&find('SOCIAL_VISIT'))return find('SOCIAL_VISIT');
  if(value('goal_exploration')>.5&&find('EXPLORE'))return find('EXPLORE');
  if(value('has_ranged_weapon')<.5){
   const bow=input.candidates.find(c=>c.action==='CRAFT'&&c.parameters.recipeId==='WPN005');if(bow)return bow;
   for(const [r,required]of [['rope',5],['stone',4],['wood',14]]as const)if(amount(r)+.001<required&&obtain(r))return obtain(r);
  }
  // A personal weapon is a milestone, not the end of the settlement's working day.
  const population=Math.max(1,Math.round(Math.max(0,value('known_population_ratio'))*10)+1);
  const needs=[['wood',Math.max(35,population*8)],['stone',Math.max(12,population*3)],['rope',Math.max(10,population*2)]] as const;
  for(const [r,target]of [...needs].sort((a,b)=>amount(a[0])/a[1]-amount(b[0])/b[1]))if(amount(r)+.001<target&&obtain(r))return obtain(r);
  if(value('energy')<.9)return find('REST');
  return find('WAIT');
 };
 return result()?.id??null;
}
