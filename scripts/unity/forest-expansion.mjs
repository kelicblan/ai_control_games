// Metres in Unity coordinates. Local v points out of the original wooden bridge.
export const ORIGIN = [-39.374176, .2094273, -73.21243];
export const FORWARD = [-.781, -.6245];
const length = Math.hypot(...FORWARD); FORWARD[0]/=length; FORWARD[1]/=length;
export const SIDE = [-FORWARD[1], FORWARD[0]];
export const LIMITS = { minU:-246,maxU:246,minV:-72,maxV:258,step:1.5 };
let riverBins=new Map();
export function setRiverBoundary(triangles){riverBins=new Map();for(const triangle of triangles){const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]);for(let x=Math.floor(Math.min(...xs)/8);x<=Math.floor(Math.max(...xs)/8);x++)for(let z=Math.floor(Math.min(...zs)/8);z<=Math.floor(Math.max(...zs)/8);z++){const key=`${x}:${z}`,list=riverBins.get(key)??[];list.push(triangle);riverBins.set(key,list);}}}
function inOriginalRiver(x,z){for(const [a,b,c] of riverBins.get(`${Math.floor(x/8)}:${Math.floor(z/8)}`)??[]){const cross=(p,q)=>(q[0]-p[0])*(z-p[1])-(q[1]-p[1])*(x-p[0]);const s=[cross(a,b),cross(b,c),cross(c,a)];if(s.every(n=>n>=0)||s.every(n=>n<=0))return true;}return false;}
export const CLEARINGS = [
  {id:'deer-meadow',name:'鹿鸣草甸',u:-65,v:75,radius:17,height:2.2,use:'future-farm'},
  {id:'logging-clearing',name:'溪畔伐木空地',u:36,v:148,radius:17,height:3.9,use:'future-logging-camp'},
  {id:'hunter-clearing',name:'深林猎人空地',u:-58,v:158,radius:14,height:4.5,use:'future-hunter-lodge'},
  {id:'east-outpost',name:'东侧林间据点',u:88,v:171,radius:16,height:5.2,use:'future-outpost'},
  {id:'far-clearing',name:'远林开垦空地',u:0,v:197,radius:16,height:5.8,use:'future-farm'},
];
export const PATHS = [
  [[0,0],[0,18],[-12,36],[-28,52],[-65,75]],
  [[-12,36],[13,64],[20,86],[36,148],[13,166],[0,197]],
  [[-65,75],[-83,106],[-79,133],[-58,158],[0,197]],
  [[20,86],[65,100],[87,129],[88,171],[13,166]],
  [[-65,75],[-28,82],[20,86]],
  [[-65,75],[-120,70],[-180,70],[-185,125],[-150,145],[-79,133]],
  [[20,86],[105,60],[170,50],[190,95],[150,140],[87,129]],
];
export const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export const hash=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7+64138)*43758.5453;return n-Math.floor(n);};
export function segmentDistance(u,v,a,b){const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((u-a[0])*x+(v-a[1])*y)/(x*x+y*y)));return Math.hypot(u-a[0]-x*t,v-a[1]-y*t);}
export function roadDistance(u,v){let best=Infinity;for(const path of PATHS)for(let i=1;i<path.length;i++)best=Math.min(best,segmentDistance(u,v,path[i-1],path[i]));return best;}
export const halfWidth=v=>(230+9*Math.sin(v/31))*Math.sqrt(Math.max(0,1-((v-92)/155)**2));
export function forestEdge(u,v){return 1-(u/(230+9*Math.sin(v/31)))**2-((v-92)/(150+8*Math.sin(u/39)))**2;}
export function inTerrain(u,v){
  if(v< -6-48*smooth(25,125,Math.abs(u))+5*Math.sin(u/35)||forestEdge(u,v)<0)return false;
  const p=world(u,v,0);if((p[0]/87)**2+((p[2]+8)/67)**2<1)return false;
  return !inOriginalRiver(p[0],p[2]);
}
export const streamV=u=>107+8*Math.sin(u/37)+3*Math.sin(u/16);
export const HABITATS={deer:[[-65,75],[-72,78],[-58,78],[-66,82]],boar:[[65,126],[73,130],[69,132]]};
export const WATER_STANDS=Object.values(HABITATS).flat().map(([u,v])=>[u,streamV(u)+(v>streamV(u)?4.1:-4.1)]);
const animalTrails=Object.values(HABITATS).flat().map((home,i)=>[home,WATER_STANDS[i]]);
export function waterHeight(u){return 1.9+.003*u;}
export function terrainHeight(u,v){
  const road=roadDistance(u,v),stream=Math.abs(v-streamV(u));
  let h=.21+.021*v+1.15*Math.sin(u*.031+v*.012)*Math.sin(v*.039)+.35*Math.sin(u*.12+v*.073);
  // Smooth rock hills near the outside; inner roads and clearings stay gentle.
  for(const [x,y,rise,r] of [[-110,48,10,19],[105,63,13,21],[-105,183,14,21],[65,214,17,18],[-30,217,12,17],[115,207,16,18]])h+=rise*Math.exp(-((u-x)**2+(v-y)**2)/(r*r));
  for(const pad of CLEARINGS)h=h+(pad.height-h)*(1-smooth(pad.radius,pad.radius+10,Math.hypot(u-pad.u,v-pad.v)));
  const river=1-smooth(2.5,9,stream),bed=waterHeight(u)-.8;
  h=h+(bed-h)*river;
  // Walkable gravel fords share the ground mesh. No invisible water wall/collider.
  if(stream<12&&road<5.5){const ford=(1-smooth(2.4,5.5,road))*(1-smooth(8,12,stream));const fordBed=waterHeight(u)-.035+.1*smooth(2,9,stream);h=h+(Math.max(h,fordBed)-h)*ford;}
  // Match the existing bridge landing exactly, without a separate stacked ramp.
  const approach=(1-smooth(0,15,v))*(1-smooth(6,30,Math.abs(u)));h=h+(ORIGIN[1]-h)*approach;
  return h;
}
export function world(u,v,height=terrainHeight(u,v)){return [ORIGIN[0]+SIDE[0]*u+FORWARD[0]*v,height,ORIGIN[2]+SIDE[1]*u+FORWARD[1]*v];}
export function logical(u,v){const p=world(u,v);return {x:50-p[0],y:50+p[2]};}
export function local(x,z){const dx=x-ORIGIN[0],dz=z-ORIGIN[2];return [dx*SIDE[0]+dz*SIDE[1],dx*FORWARD[0]+dz*FORWARD[1]];}
export function terrainColor(u,v){
  const road=1-smooth(1.6,3.2,roadDistance(u,v)),stream=1-smooth(3,8,Math.abs(v-streamV(u))),n=hash(Math.floor(u*2),Math.floor(v*2));
  let c=[.36+n*.09,.43+n*.08,.23+n*.05];
  for(const [weight,color] of [[stream,[.51,.49,.36]],[road,[.64+n*.06,.52+n*.04,.33+n*.03]]])c=c.map((x,i)=>x+(color[i]-x)*weight);
  return [...c,1];
}
export function buildTerrain(){
  const positions=[],normals=[],colors=[],uv=[],indices=[],stride=Math.round((LIMITS.maxU-LIMITS.minU)/LIMITS.step)+1,rows=Math.round((LIMITS.maxV-LIMITS.minV)/LIMITS.step)+1;
  for(let z=0;z<rows;z++)for(let x=0;x<stride;x++){const u=LIMITS.minU+x*LIMITS.step,v=LIMITS.minV+z*LIMITS.step;
    positions.push(...world(u,v));colors.push(...terrainColor(u,v));uv.push(u/12,v/12);
    const du=(terrainHeight(u+.25,v)-terrainHeight(u-.25,v))/.5,dv=(terrainHeight(u,v+.25)-terrainHeight(u,v-.25))/.5;
    const n=[-SIDE[0]*du-FORWARD[0]*dv,1,-SIDE[1]*du-FORWARD[1]*dv],m=Math.hypot(...n);normals.push(...n.map(x=>x/m));
  }
  for(let z=0;z<rows-1;z++)for(let x=0;x<stride-1;x++){
    const u=LIMITS.minU+x*LIMITS.step,v=LIMITS.minV+z*LIMITS.step,s=LIMITS.step;if(!inTerrain(u,v)||!inTerrain(u+s,v)||!inTerrain(u,v+s)||!inTerrain(u+s,v+s))continue;
    const a=z*stride+x,b=a+1,c=a+stride,d=c+1;indices.push(a,b,c,b,d,c);
  }
  // SIDE x FORWARD points upward for this coordinate basis.
  return {name:'Continuous forest terrain',positions,normals,colors,uv,indices};
}
export function placements(){
  const trees=[],rocks=[],logs=[],resources=[];
  for(let v=-66;v<252;v+=6.3)for(let u=-240;u<240;u+=6.3){
    const x=u+(hash(u,v)-.5)*4,y=v+(hash(v,u)-.5)*4;
    if(!inTerrain(x,y)||roadDistance(x,y)<4.2||Math.abs(y-streamV(x))<8||CLEARINGS.some(p=>Math.hypot(x-p.u,y-p.v)<p.radius+3)||animalTrails.some(([a,b])=>segmentDistance(x,y,a,b)<2))continue;
    if(hash(x+12,y)>.9*smooth(0,.18,forestEdge(x,y)))continue;
    trees.push({id:`forest-tree-${trees.length}`,u:x,v:y,height:8+hash(x,y)*7,kind:hash(x,y+1)>.65?'broadleaf':'conifer',yaw:hash(x,y+2)*360,position:logical(x,y)});
  }
  for(let n=0;n<330;n++){
    const u=-235+hash(n,51)*470,v=-55+hash(n,71)*300;
    if(!inTerrain(u,v)||roadDistance(u,v)<5||CLEARINGS.some(p=>Math.hypot(u-p.u,v-p.v)<p.radius+2)||Math.abs(v-streamV(u))<4||animalTrails.some(([a,b])=>segmentDistance(u,v,a,b)<4))continue;
    rocks.push({u,v,height:1+hash(n,7)*3.5,yaw:hash(n,8)*360});
  }
  for(const t of trees.filter((_,i)=>i%27===0))logs.push({u:t.u+2,v:t.v+1,yaw:t.yaw,length:3+hash(t.u,t.v)*2});
  // Stands lie beside a route, so collecting never depends on entering dense trunks.
  const kinds=['wood','berries','greens','roots','mushrooms'];
  for(const [pi,path] of PATHS.slice(0,5).entries())for(let seg=1;seg<path.length;seg++){
    const a=path[seg-1],b=path[seg],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let j=0;j<4;j++){
      const t=(j+1)/5,offset=j%2?4.6:-4.6,u=a[0]+(b[0]-a[0])*t-(b[1]-a[1])/len*offset,v=a[1]+(b[1]-a[1])*t+(b[0]-a[0])/len*offset;
      if(v<12||Math.abs(v-streamV(u))<10||!inTerrain(u,v)||CLEARINGS.some(p=>Math.hypot(u-p.u,v-p.v)<p.radius))continue;
      const kind=kinds[(pi+seg+j)%5],position=logical(u,v);
      if(resources.some(r=>Math.hypot(r.position.x-position.x,r.position.y-position.y)<3))continue;
      resources.push({id:`forest-${kind}-${pi}-${seg}-${j}`,kind,u,v,position,stand:{...position},capacity:kind==='wood'?12:8,recovery:kind==='wood'?2400:300});
    }
  }
  return {trees,rocks,logs,resources};
}
