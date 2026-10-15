import type {WorldPoint} from '../../../../packages/world-core/src';

/** Stable first-five ordering also preserves the existing NPC housing bindings. */
export const VILLAGE_HOMES = [
 {id:'crew-house',name:'属民居所·阿壮',center:{x:-68,y:-5}},
 {id:'subject-house-2',name:'属民居所·小米',center:{x:-68,y:65}},
 {id:'subject-house-3',name:'属民居所·老周',center:{x:-20,y:125}},
 {id:'subject-house-4',name:'属民居所·林枫',center:{x:170,y:80}},
 {id:'subject-house-5',name:'属民居所·阿野',center:{x:170,y:135}},
 {id:'subject-house-6',name:'属民居所·铁生',center:{x:-68,y:125}},
 {id:'subject-house-7',name:'属民居所·阿绫',center:{x:-68,y:180}},
 {id:'subject-house-8',name:'属民居所·小满',center:{x:-20,y:180}},
 {id:'subject-house-9',name:'属民居所·沈砚',center:{x:170,y:180}},
] as const;
export interface VillageFacility {
 id:'training-ground'|'warehouse'|'weaponsmith';name:string;center:WorldPoint;half:WorldPoint;
 height:number;doorWidth:number;wallHeight:number;
}
export const VILLAGE_FACILITIES:readonly VillageFacility[] = [
 {id:'training-ground',name:'练武场',center:{x:145,y:-25},half:{x:48,y:43},height:8,doorWidth:12,wallHeight:0},
 {id:'warehouse',name:'仓库',center:{x:-20,y:-5},half:{x:17,y:13},height:32,doorWidth:10,wallHeight:18},
 {id:'weaponsmith',name:'兵器铺',center:{x:-20,y:65},half:{x:17,y:13},height:30,doorWidth:18,wallHeight:17},
];
export const VILLAGE_PLAZA = {center:{x:50,y:110},half:{x:40,y:50}} as const;
/** Delivered GLB wall landmarks exclude the overhanging roofs and ground aprons. */
export const FACILITY_COLLISION_PROFILES = {
 'training-ground':{offset:{x:.40,y:.04},half:{x:42.17,y:41.01},sideThickness:3.57,endThickness:1.67},
 warehouse:{offset:{x:-.85,y:-.11},half:{x:16.22,y:9.95},sideThickness:.45,endThickness:.45},
 weaponsmith:{offset:{x:-1.84,y:-.12},half:{x:11.91,y:9.55},sideThickness:.45,endThickness:.45},
} as const;
export const FACILITY_WALLS=VILLAGE_FACILITIES.flatMap(f=>{
 const profile=FACILITY_COLLISION_PROFILES[f.id],cx=f.center.x+profile.offset.x,cy=f.center.y+profile.offset.y;
 const left=cx-profile.half.x,right=cx+profile.half.x,front=cy+profile.half.y;
 const doorLeft=f.center.x-f.doorWidth/2,doorRight=f.center.x+f.doorWidth/2;
 return [
  {id:'west',center:{x:left,y:cy},half:{x:profile.sideThickness/2,y:profile.half.y}},
  {id:'east',center:{x:right,y:cy},half:{x:profile.sideThickness/2,y:profile.half.y}},
  {id:'back',center:{x:cx,y:cy-profile.half.y},half:{x:profile.half.x,y:profile.endThickness/2}},
  {id:'front-west',center:{x:(left+doorLeft)/2,y:front},half:{x:(doorLeft-left)/2,y:profile.endThickness/2}},
  {id:'front-east',center:{x:(doorRight+right)/2,y:front},half:{x:(right-doorRight)/2,y:profile.endThickness/2}},
 ].map(w=>({...w,id:`${f.id}-${w.id}`,facilityId:f.id,name:f.name}));
});
/** Straight side streets join every south-facing threshold without crossing a building. */
export const VILLAGE_PATHS:readonly (readonly [WorldPoint,WorldPoint])[]=[
 ...VILLAGE_HOMES.map(h=>[{x:50,y:h.center.y+16},{x:h.center.x,y:h.center.y+16}] as const),
 ...VILLAGE_FACILITIES.map(f=>[{x:50,y:f.center.y+f.half.y+6},{x:f.center.x,y:f.center.y+f.half.y+6}] as const),
];
export function villageClearance(x:number,y:number,margin=0):boolean {
 const inside=(center:WorldPoint,half:WorldPoint)=>Math.abs(x-center.x)<=half.x+margin&&Math.abs(y-center.y)<=half.y+margin;
 return inside(VILLAGE_PLAZA.center,VILLAGE_PLAZA.half)
  ||VILLAGE_FACILITIES.some(f=>inside(f.center,{x:f.half.x+4,y:f.half.y+8}))
  ||VILLAGE_HOMES.some(h=>inside({x:h.center.x,y:h.center.y+4},{x:19,y:20}));
}
