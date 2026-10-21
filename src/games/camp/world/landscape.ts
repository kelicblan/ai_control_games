import {seededNoise,type WorldPoint} from '../../../../packages/world-core/src';
import {VILLAGE_HOMES,VILLAGE_PATHS,VILLAGE_PLAZA,VILLAGE_FACILITIES} from './villageLayout';

export const LANDSCAPE_GRID=Object.freeze({min:-1152,max:1152,step:8,coreMin:-512,coreMax:512,coreStep:2});
export function landscapeAxis():number[]{
 const result:number[]=[];for(let x=LANDSCAPE_GRID.min;x<=LANDSCAPE_GRID.max;x+=x>=LANDSCAPE_GRID.coreMin&&x<LANDSCAPE_GRID.coreMax?LANDSCAPE_GRID.coreStep:LANDSCAPE_GRID.step)result.push(x);return result;
}
function axisCell(value:number):{base:number;step:number}{
 const core=value>=LANDSCAPE_GRID.coreMin&&value<LANDSCAPE_GRID.coreMax;
 const anchor=core?LANDSCAPE_GRID.coreMin:value<LANDSCAPE_GRID.coreMin?LANDSCAPE_GRID.min:LANDSCAPE_GRID.coreMax,step=core?LANDSCAPE_GRID.coreStep:LANDSCAPE_GRID.step;
 return {base:Math.floor((value-anchor)/step)*step+anchor,step};
}
export function landscapeCell(x:number,y:number){const a=axisCell(x),b=axisCell(y);return {x:a.base,y:b.base,stepX:a.step,stepY:b.step};}
export const LANDSCAPE_REVISION=6;
export const VILLAGE_TERRACE_HEIGHT=12;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const noise=(x:number,y:number,s=71)=>seededNoise(x,y,s);
const riverKnots=[[-1300,-390],[-1000,-330],[-780,-285],[-590,-340],[-390,-235],[-220,-205],[-120,-178],[-25,-148],[75,-164],[155,-145],[205,-111],[235,-42],[270,50],[320,164],[410,225],[550,188],[750,285],[1050,350],[1350,465]];
function cubic(a:number,b:number,c:number,d:number,t:number){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
/** A deliberately drawn drainage line, including the exact gate-bridge crossing. */
export function landscapeRiverX(y:number):number{
 let i=0;while(i<riverKnots.length-2&&y>riverKnots[i+1][0])i++;
 const b=riverKnots[i],c=riverKnots[i+1],a=riverKnots[Math.max(0,i-1)],d=riverKnots[Math.min(riverKnots.length-1,i+2)];
 const t=(y-b[0])/(c[0]-b[0]);
 if(t<0||t>1)return b[1]+(c[1]-b[1])*t;
 return cubic(a[1],b[1],c[1],d[1],t)+Math.sin(y*.18)*.8*Math.sin(Math.PI*t)**2;
}
export function landscapeRiverWidth(y:number):number{
 // Broad pools, constrictions, uneven alluvial banks; no repeatable equal-width channel.
 return 9.8+Math.sin(y/47)*2.1+Math.sin(y/113+1.4)*2.2+Math.sin(y/13)*.65;
}
export function landscapeWaterLevel(y:number):number{return -.18-Math.sign(y-50)*Math.max(0,Math.abs(y-50)-160)*.0015;}

function spline(points:readonly WorldPoint[]):WorldPoint[]{
 const result:WorldPoint[]=[];
 for(let i=0;i<points.length-1;i++){
  const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)],n=Math.max(1,Math.ceil(Math.hypot(c.x-b.x,c.y-b.y)/4));
  for(let j=0;j<n;j++){const t=j/n;result.push({x:cubic(a.x,b.x,c.x,d.x,t),y:cubic(a.y,b.y,c.y,d.y,t)});}
 }result.push({...points.at(-1)!});return result;
}
export const OUTBOUND_ROAD:readonly WorldPoint[]=[
 ...Array.from({length:88},(_,i)=>({x:50,y:-26+i*4})),
 ...spline([{x:50,y:322},{x:62,y:365},{x:115,y:440},{x:164,y:520},{x:212,y:640},{x:294,y:760},{x:360,y:900},{x:480,y:1080},{x:615,y:1250},{x:720,y:1450}]).map(p=>{
  const bank=landscapeRiverX(p.y)-landscapeRiverWidth(p.y)-30-Math.sin(p.y/70)*8;
  const blend=Math.max(0,12-Math.abs(p.x-bank))/12;
  return {x:Math.min(p.x,bank)-blend*blend*3,y:p.y};
 }),
];
const laneKnots=VILLAGE_PATHS;
// The lanes used to end at the fence gate, ten metres short of the modeled
// threshold. Join that final stretch and wear the whole frequently used yard.
const homeEntries=VILLAGE_HOMES.map(h=>({x:h.center.x,y:h.center.y+6}));
interface RoadSegment {a:WorldPoint;b:WorldPoint;width:number;dx:number;dy:number;length2:number}
const roadCells=new Map<string,RoadSegment[]>();
function indexPath(points:readonly WorldPoint[],width:number){
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,s={a,b,dx,dy,length2:dx*dx+dy*dy,width};
  if(!s.length2)continue;
  for(let cy=Math.floor((Math.min(a.y,b.y)-width-2)/32);cy<=Math.floor((Math.max(a.y,b.y)+width+2)/32);cy++)for(let cx=Math.floor((Math.min(a.x,b.x)-width-2)/32);cx<=Math.floor((Math.max(a.x,b.x)+width+2)/32);cx++){
   const key=`${cx}:${cy}`,entries=roadCells.get(key)??[];entries.push(s);roadCells.set(key,entries);
  }
 }
}
indexPath(OUTBOUND_ROAD,7);laneKnots.forEach(p=>indexPath(spline(p),4));
homeEntries.forEach((door,i)=>indexPath([laneKnots[i].at(-1)!,door],4.5));
VILLAGE_FACILITIES.forEach(f=>indexPath([{x:f.center.x,y:f.center.y+f.half.y+6},f.center],4.5));
indexPath(Array.from({length:65},(_,i)=>({x:51+Math.cos(i/64*Math.PI*2)*13,y:54+Math.sin(i/64*Math.PI*2)*13})),3.3);
/** Shared by grass clearances, terrain colour and exported ground; no road overlay. */
export function landscapeRoad(x:number,y:number):number{
 const plazaEdge=Math.max(Math.abs(x-VILLAGE_PLAZA.center.x)-VILLAGE_PLAZA.half.x,Math.abs(y-VILLAGE_PLAZA.center.y)-VILLAGE_PLAZA.half.y);
 const training=VILLAGE_FACILITIES[0],trainingEdge=Math.max(Math.abs(x-training.center.x)-training.half.x,Math.abs(y-training.center.y)-training.half.y);
 let strength=Math.max(clamp(1-plazaEdge/3),clamp(1-trainingEdge/3));
 for(const door of homeEntries){
  const edge=Math.max(Math.abs(x-door.x)-11.5,Math.abs(y-(door.y+6))-7.5);
  if(edge<2.3)strength=Math.max(strength,clamp((2-edge+(noise(x/3,y/3,921)-.5)*.4)/3));
 }
 for(const s of roadCells.get(`${Math.floor(x/32)}:${Math.floor(y/32)}`)??[]){
  const t=clamp(((x-s.a.x)*s.dx+(y-s.a.y)*s.dy)/s.length2),d=Math.hypot(x-s.a.x-t*s.dx,y-s.a.y-t*s.dy);
  const width=s.width*(.87+.2*noise(x/19,y/19,91))+(noise(x/2.3,y/2.3,519)-.5)*.7;
  strength=Math.max(strength,1-d/width);
 }return clamp(strength);
}

interface RidgeNode extends WorldPoint {height:number;width:number}
/** Connected crests and descending spurs, with explicit saddles between summits. */
const ridgeChains:RidgeNode[][]=[
 [[-1050,-580,280,200],[-780,-430,340,180],[-610,-470,180,170],[-430,-370,310,155],[-260,-410,190,150],[-70,-350,355,145],[110,-420,215,155],[300,-340,330,155],[470,-430,190,150],[690,-380,390,170],[980,-530,310,200]],
 [[-780,-430,290,150],[-610,-225,190,120],[-530,0,95,100],[-490,230,30,75]],
 [[-430,-370,265,130],[-365,-170,115,110],[-300,-15,15,70]],
 [[300,-340,295,130],[380,-140,150,115],[420,55,58,90],[520,220,16,75]],
 [[690,-380,340,160],[770,-120,200,135],[680,140,80,100],[600,370,22,80]],
 [[-1050,-900,390,220],[-700,-790,420,200],[-350,-860,310,180],[0,-720,440,180],[390,-850,330,200],[850,-760,460,240]],
 // Near cliffs flank the river valley; foreground spurs frame the playable plateau.
 [[-610,-150,155,100],[-430,-30,135,85],[-350,130,175,82],[-410,300,115,100],[-330,430,155,90],[-500,620,90,110]],
 [[420,-160,170,100],[390,45,205,85],[465,180,145,95],[420,390,170,95],[610,580,110,115]],
 [[-330,430,155,90],[-230,560,95,75],[-115,690,70,70]],
 [[420,390,170,95],[540,640,120,110],[390,850,90,120]],
].map(chain=>chain.map(([x,y,height,width])=>({x,y,height,width})));
function ridges(x:number,y:number):number{
 let height=0;
 for(const chain of ridgeChains)for(let i=0;i<chain.length-1;i++){
  const a=chain[i],b=chain[i+1],dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy));
  const cx=a.x+dx*t,cy=a.y+dy*t,d=Math.hypot(x-cx,y-cy),width=a.width+(b.width-a.width)*t;
  if(d>width*2.2)continue;
  const crest=a.height+(b.height-a.height)*t;
  const shoulder=Math.max(0,1-d/(width*2.2));
  const profile=Math.pow(shoulder,2.8);
  const gullies=(noise(x/37,y/37,537)-.5)*.25+(noise(x/13,y/13,719)-.5)*.13;
  height=Math.max(height,crest*profile*(1+gullies));
 }return height;
}
function manor(x:number,y:number){
 return 8*clamp((43-Math.abs(x-50))/12)*clamp((y+90)/16)*clamp((20-y)/34);
}
/** Raw authored mesh vertices; never the old circular lift into a raised blanket. */
export function landscapeVertexHeight(x:number,y:number):number{
 const radius=Math.hypot(x-50,y-55),mountain=ridges(x,y);
 const floor=(noise(x/83,y/83,417)*6+noise(x/25,y/25,717)*1.5-.8)*smooth((radius-151)/65);
 let height=floor+mountain;
 // The inhabited clearing and its platform stay deterministic and level.
 if(radius<157)height=VILLAGE_TERRACE_HEIGHT-.045+manor(x,y);
 else if(radius<201){const blend=smooth((radius-157)/44);height=height*blend+(VILLAGE_TERRACE_HEIGHT-.045)*(1-blend);}
 // The new outer cottage rows occupy the rectangle's corners beyond the old circular clearing.
 const villageBlend=smooth((x+130)/25)*smooth((230-x)/25)*smooth((y+125)/24)*smooth((240-y)/30);
 height=height*(1-villageBlend)+(VILLAGE_TERRACE_HEIGHT-.045+manor(x,y))*villageBlend;
 const center=landscapeRiverX(y),width=landscapeRiverWidth(y),riverDistance=Math.abs(x-center);
 const basin=18+Math.min(115,Math.max(0,height)*.8),bank=smooth((riverDistance-width)/basin);
 const level=landscapeWaterLevel(y),bed=level-1.9+noise(x/9,y/9,619)*.7;
 if(riverDistance<=width)height=bed+(level-bed)*smooth(riverDistance/width);
 else height=level+(height-level)*bank+(1-bank)*.12*smooth((riverDistance-width)/4);
 // A flood terrace supports the old gate bridge and its gently graded approaches.
 if(y>210&&y<380&&Math.abs(x-50)<16&&riverDistance>width+1){
  const blend=(1-smooth((Math.abs(x-50)-7)/9))*smooth((y-210)/35)*(1-smooth((y-340)/40));height=height*(1-blend)+.15*blend;
 }
 const bridgeY=55+Math.round((y-55)/640)*640;
 if(Math.abs(y-bridgeY)<14&&riverDistance>width+.5){
  const bridgeX=landscapeRiverX(bridgeY),length=landscapeRiverWidth(bridgeY)+9;
  const blend=(1-smooth((Math.abs(y-bridgeY)-6)/8))*(1-smooth((Math.abs(x-bridgeX)-length)/80));
  const deck=landscapeWaterLevel(bridgeY)+.5;height=height*(1-blend)+deck*blend;
 }
 return height;
}
const vertexCache=new Map<string,number>();
function vertex(x:number,y:number){const key=`${x}:${y}`;let value=vertexCache.get(key);if(value===undefined){value=landscapeVertexHeight(x,y);if(vertexCache.size>100000)vertexCache.clear();vertexCache.set(key,value);}return value;}
/** Exact barycentric interpolation of the two exported triangles, not another height formula. */
export function landscapeHeight(x:number,y:number):number{
 const {x:gx,y:gy,stepX,stepY}=landscapeCell(x,y),fx=(x-gx)/stepX,fy=(y-gy)/stepY;
 if(fx+fy<=1){const a=vertex(gx,gy);return a+(vertex(gx+stepX,gy)-a)*fx+(vertex(gx,gy+stepY)-a)*fy;}
 const d=vertex(gx+stepX,gy+stepY);return d+(vertex(gx,gy+stepY)-d)*(1-fx)+(vertex(gx+stepX,gy)-d)*(1-fy);
}
