import {ECOLOGY_RULES as R,migratePopulation} from './population';
import {distance,type AnimalWorld,type Animal,type Point,type Human,SPECIES} from './engine';
export type TidePhase='calm'|'pressure'|'gathering'|'approaching'|'attacking'|'retreating'|'cooldown';
export interface TideAlert{id:string;title:string;phase:TidePhase|'breached';at:number;direction:string;severity:number;observerId:string}
export interface Tide{sequence:number;id:string;phase:TidePhase;phaseAt:number;pressureSince:number|null;cooldownUntil:number;memberIds:string[];initialCount:number;target:Point;gather:Point;pressure:number;alert:TideAlert|null;detected:boolean;breached:boolean}
export interface TideEnvironment{gate:Point;approach:Point;objective?:Point;humans:readonly Human[];visible?:(a:Point,b:Point)=>boolean;gateBreached?:boolean}
export function tideMember(w:AnimalWorld,a:Animal){return !!w.tide?.memberIds.includes(a.id)&&a.hp>0;}
export function animalHostile(w:AnimalWorld,a:Animal,id:string){if(tideMember(w,a)&&w.tide!.phase==='retreating')return a.hp>0&&a.attacker===id&&a.alertUntil>w.time;return a.hp>0&&((a.attacker===id&&a.alertUntil>w.time)||R.species[a.species].raider&&(a.hunger>=65||tideMember(w,a)&&w.tide!.phase==='attacking'));}
export function stepTide(w:AnimalWorld,env:TideEnvironment){
 migratePopulation(w);w.tide??={sequence:0,id:'none',phase:'calm',phaseAt:w.time,pressureSince:null,cooldownUntil:0,memberIds:[],initialCount:0,target:{...env.gate},gather:{...env.approach},pressure:0,alert:null,detected:false,breached:false};const t=w.tide;
 const alive=w.animals.filter(a=>a.hp>0),danger=alive.filter(a=>R.species[a.species].raider&&a.life!.matureAt<=w.time);
 t.pressure=alive.length/R.softCapacity;const pressured=t.pressure>=R.pressureRatio&&danger.length>=R.minDangerous;
 const change=(phase:TidePhase)=>{t.phase=phase;t.phaseAt=w.time;for(const a of w.animals.filter(a=>t.memberIds.includes(a.id))){a.intent=null;a.nextDecision=w.time;}w.events.push({id:++w.sequence,at:w.time,kind:'tide.'+phase,actor:t.id,target:null,amount:t.memberIds.length});if(w.events.length>128)w.events.shift();};
 if(t.phase==='cooldown'){if(w.time<t.cooldownUntil)return;change('calm');t.memberIds=[];t.alert=null;t.detected=false;t.breached=false;}
 if(t.phase==='calm'||t.phase==='pressure'){
  if(!pressured){t.pressureSince=null;if(t.phase==='pressure')change('calm');return;}
  if(t.pressureSince===null){t.pressureSince=w.time;change('pressure');}
  if(w.time-t.pressureSince<R.pressureHold||danger.length<R.minRaid)return;
  t.id=`tide-${++t.sequence}`;t.memberIds=[...danger].sort((a,b)=>distance(a.position,env.approach)-distance(b.position,env.approach)||a.id.localeCompare(b.id)).slice(0,R.maxRaid).map(a=>a.id);t.initialCount=t.memberIds.length;t.target={...(env.objective??env.gate)};t.gather={...env.approach};t.alert=null;t.detected=false;t.breached=false;change('gathering');
 }
 if(env.gateBreached&&env.objective)t.target={...env.objective};
 const members=alive.filter(a=>t.memberIds.includes(a.id));
 if(['gathering','approaching','attacking'].includes(t.phase)&&(!members.length||members.length<t.initialCount*.5||members.filter(a=>a.energy<10||a.hp<.2*SPECIES[a.species].hp).length>members.length*.6))change('retreating');
 const since=w.time-t.phaseAt;
 if(t.phase==='gathering'&&since>=R.gatherSeconds)change('approaching');
 else if(t.phase==='approaching'&&(members.some(a=>distance(a.position,env.gate)<=4)||since>=R.approachSeconds))change('attacking');
 else if(t.phase==='attacking'&&since>=R.attackSeconds)change('retreating');
 else if(t.phase==='retreating'&&(since>=R.retreatSeconds||members.every(a=>distance(a.position,a.home)<=3))){change('cooldown');t.cooldownUntil=w.time+R.cooldownSeconds;t.pressureSince=null;}
 const observer=env.humans.find(h=>h.hp>0&&members.some(a=>distance(h.position,a.position)<=24&&(env.visible?.(h.position,a.position)??true)));
 const nearGate=members.some(a=>distance(a.position,env.gate)<=12);
 if(observer||nearGate||env.gateBreached&&t.phase==='attacking')t.detected=true;
 if(!t.detected)return;
 const breached=!!env.gateBreached&&t.phase==='attacking';if(breached)t.breached=true;
 const phase=breached?'breached':t.phase;if(!['gathering','approaching','attacking','retreating','cooldown','breached'].includes(phase))return;
 const id=t.id+':'+phase;if(t.alert?.id===id)return;
 const cx=members.reduce((v,a)=>v+a.position.x,0)/Math.max(1,members.length)-env.gate.x,cy=members.reduce((v,a)=>v+a.position.y,0)/Math.max(1,members.length)-env.gate.y;
 t.alert={id,phase,at:w.time,title:phase==='breached'?'寨门失守':phase==='gathering'?'兽群聚集，准备防御':phase==='approaching'||phase==='attacking'?'兽潮来袭':phase==='retreating'?'兽群正在撤退':'兽潮结束',direction:Math.abs(cx)>Math.abs(cy)?cx>0?'东侧':'西侧':cy>0?'北侧':'南侧',severity:phase==='breached'?3:phase==='gathering'?1:phase==='approaching'||phase==='attacking'?2:0,observerId:observer?.id??'village-perimeter'};
}
