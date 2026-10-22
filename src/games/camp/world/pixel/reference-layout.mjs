/** Traced from the approved 1536x1024 design; left map panel bounds [14,78]-[1032,1007]. */
import {routeRoads} from './road-routing.mjs';
import {segmentDistance,smoothLine,lineIndex} from '../../../../../packages/pixel-world-core/src/spatial.mjs';
export const REFERENCE_BOUNDS={x:14,y:78,width:1018,height:929};
export const point=([x,y])=>[(x-14)/1018*32000,(y-78)/929*32000];
export const VILLAGE_ANCHOR=point([441,526]);
const poly=points=>points.map(point);
export const MOUNTAIN_MASKS=[
 poly([[16,80],[414,80],[422,111],[394,139],[418,176],[404,211],[361,219],[341,251],[301,267],[281,291],[235,285],[204,262],[164,288],[120,278],[93,309],[48,290],[16,316]]),
 poly([[159,300],[212,293],[252,314],[290,329],[305,369],[279,395],[232,411],[175,399],[145,360]]),
 poly([[15,472],[64,463],[101,488],[121,529],[151,552],[182,574],[221,598],[245,642],[229,682],[190,696],[156,665],[128,649],[95,671],[50,658],[15,689]]),
 poly([[17,734],[57,741],[88,772],[119,794],[145,834],[187,848],[211,879],[257,894],[297,927],[325,942],[363,954],[391,988],[362,1007],[16,1007]]),
 poly([[435,104],[475,91],[520,114],[544,143],[575,146],[584,177],[561,204],[529,190],[503,173],[466,169],[440,148]]),
 poly([[430,473],[465,460],[496,476],[517,500],[554,508],[568,535],[544,556],[510,539],[482,515],[447,507]]),
 poly([[843,388],[870,374],[903,394],[922,418],[938,451],[918,476],[890,462],[879,437],[851,424]]),
];
export const FOREST_MASKS=[
 poly([[602,80],[1032,80],[1032,408],[979,399],[932,353],[863,369],[804,323],[744,300],[714,251],[644,222],[670,165]]),
 poly([[286,346],[378,315],[462,336],[505,386],[463,443],[392,480],[315,456],[274,408]]),
 poly([[18,325],[92,292],[139,330],[135,414],[99,473],[42,460],[18,488]]),
 poly([[217,510],[312,486],[360,514],[401,555],[489,556],[551,592],[602,625],[576,658],[499,641],[440,610],[363,625],[287,590],[225,565]]),
 poly([[816,470],[917,488],[1005,535],[1032,594],[1032,684],[963,671],[904,635],[834,605],[792,565]]),
];
export const WETLAND_MASK=poly([[779,700],[851,694],[928,706],[1032,685],[1032,1007],[590,1007],[633,940],[690,907],[710,859],[729,809]]);
export const LAKE_MASK=poly([[500,281],[526,274],[547,281],[568,299],[593,307],[616,321],[629,341],[606,351],[580,348],[563,338],[539,332],[514,325],[492,315],[490,296]]);
export const REFERENCE_RIVERS=[
 {width:210,points:poly([[630,65],[648,121],[628,177],[635,211],[591,238],[544,266],[527,300],[554,327],[615,341],[671,358],[725,381],[779,411],[817,430],[844,465],[820,491],[789,520],[806,551],[770,579],[715,605],[657,625],[617,655],[629,679],[680,699],[731,691],[790,707],[809,738],[773,774],[748,805],[721,839],[704,875],[664,895],[628,922],[616,950],[571,969],[551,1025]])},
 {width:125,points:poly([[454,65],[454,85],[455,142],[473,187],[471,222],[495,260],[527,300]])},
 {width:140,points:poly([[810,735],[856,702],[909,700],[964,681],[1045,673]])},
];
const AUTHORED_ROADS=[
 poly([[96,180],[155,222],[222,248],[285,278],[330,320],[362,367],[354,415],[390,465],[441,526],[472,565],[523,591],[580,604],[626,597],[668,571],[721,544],[775,514],[827,470],[873,440],[950,360],[922,306],[869,224]]),
 poly([[441,526],[412,565],[361,597],[339,641],[354,688],[396,731],[441,764],[467,810],[454,857],[429,908],[450,964],[454,1024]]),
 poly([[441,526],[463,480],[471,432],[488,390],[509,348],[550,365],[600,354],[648,349],[695,320],[740,300],[788,279],[843,303],[922,306],[1035,342]]),
 poly([[362,367],[306,387],[261,417],[219,444],[173,470],[105,450],[14,450]]),
 poly([[339,641],[293,662],[253,690],[233,724],[204,758],[178,799],[139,827],[88,856],[12,865]]),
 poly([[471,432],[439,391],[421,350],[428,307],[445,264],[456,223],[455,168],[480,130],[515,78]]),
 poly([[396,731],[478,721],[537,735],[591,760],[640,795],[677,838],[695,891],[669,939],[540,930],[429,908]]),
 poly([[224,355],[245,365],[272,371],[306,382],[340,377],[362,367]]),
];
export const REFERENCE_LANDMARKS={village:[441,526],goldmine:[96,180],quarry:[224,355],pass:[480,155],forest:[386,432],deepforest:[869,224],meadow:[673,496],plain:[446,814],wetland:[874,784],ruins:[320,664],eastbridge:[648,349]};
export function contains(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!=(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const bounded=polygons=>polygons.map(points=>({points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))}));
const mountains=bounded(MOUNTAIN_MASKS),forests=bounded(FOREST_MASKS);
const inside=(x,y,list)=>list.some(p=>x>=p.minX&&x<=p.maxX&&y>=p.minY&&y<=p.maxY&&contains(x,y,p.points));
// Authored open mine/quarry access valleys, broad enough for a visible hillside approach.
const ACCESS_VALLEYS=[poly([[96,180],[115,220],[155,222],[222,248],[285,278],[330,320]]),poly([[224,355],[224,420]])];
const inAccessValley=(x,y)=>ACCESS_VALLEYS.some(r=>r.some((p,i)=>i>0&&segmentDistance(x,y,r[i-1],p)<150));
export const inMountain=(x,y)=>inside(x,y,mountains)&&!inAccessValley(x,y);
export const inForest=(x,y)=>inside(x,y,forests);
export const inWetland=(x,y)=>contains(x,y,WETLAND_MASK);
export const inLake=(x,y)=>contains(x,y,LAKE_MASK);

const [vx,vy]=VILLAGE_ANCHOR;
export const VILLAGE_JUNCTION=[vx,vy+400];
export const VILLAGE_SPRING={x:point([448,489])[0],y:point([448,489])[1],radius:70};
// Mountain spring -> village north bank -> valley south of the ridge -> main river.
// Retain the existing village/bridge section; endpoints are now real water-system nodes.
export const VILLAGE_CREEK={width:19,points:[point([448,489]),point([427,501]),[vx-400,vy-200],[vx-150,vy-130],[vx+110,vy-115],[vx+400,vy-130],[vx+900,vy-270],...poly([[485,550],[550,570],[620,580],[715,605]])]};
const obstructed=(x,y)=>inLake(x,y)||Math.hypot(x-vx,y-vy)<350||[[0,0],[80,0],[-80,0],[0,80],[0,-80]].some(([dx,dy])=>inMountain(x+dx,y+dy));
export const REFERENCE_ROADS=routeRoads(AUTHORED_ROADS.map(r=>r.map(p=>Math.hypot(p[0]-vx,p[1]-vy)<1?VILLAGE_JUNCTION:[Math.max(0,Math.min(32000,p[0])),Math.max(0,Math.min(32000,p[1]))])),obstructed);
// Local bridge approach rejoins a regional road north-east of the settlement.
const bridgeExit=[vx+110,vy-170];
const regionJoin=REFERENCE_ROADS.flat().filter(p=>p[1]<vy-350).sort((a,b)=>Math.hypot(a[0]-bridgeExit[0],a[1]-bridgeExit[1])-Math.hypot(b[0]-bridgeExit[0],b[1]-bridgeExit[1]))[0];
const connector=routeRoads([[ [vx+400,vy-400],regionJoin ]],(x,y)=>inLake(x,y)||inMountain(x,y))[0];
export const LOCAL_ROADS=[[[vx,vy-32],VILLAGE_JUNCTION],[[vx,vy+140],[vx+140,vy+140],[vx+140,vy-60],[vx+110,vy-60],bridgeExit,[vx+400,vy-400],...connector.slice(1)]];
// Scan the full water band, including curved banks and roads whose turn lies in water.
const waterDistance=lineIndex([...REFERENCE_RIVERS,VILLAGE_CREEK].map(r=>({...r,points:smoothLine(r.points)})),512,40);
export const REFERENCE_CROSSINGS=[];
for(const road of [...REFERENCE_ROADS,...LOCAL_ROADS])for(let i=1;i<road.length;i++){
 const a=road[i-1],b=road[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.01)continue;
 const n=Math.ceil(length/8),dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length;let begin=null;
 const emit=end=>{const start=begin-8,finish=end+8,mid=(start+finish)/2;
  REFERENCE_CROSSINGS.push({id:`reference-bridge-${REFERENCE_CROSSINGS.length}`,kind:'bridge',name:'古道木桥',x:a[0]+dx*mid,y:a[1]+dy*mid,width:finish-start,depth:12,angle:Math.atan2(dy,dx)});begin=null;};
 for(let j=0;j<=n;j++){const d=j*length/n,wet=waterDistance(a[0]+dx*d,a[1]+dy*d)<6;if(wet&&begin===null)begin=d;if(!wet&&begin!==null)emit(d);}
 if(begin!==null)emit(length);
}
