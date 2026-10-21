import fs from 'node:fs';
import {tsImport} from 'tsx/esm/api';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const p=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const {findGridRoute}=await tsImport('../../packages/world-core/src/navigation.ts',import.meta.url);
const m=p.newWorld,traverse=(a,b)=>p.newWorldTraverse(a,b,true);
function routeTo(target,clearance=.35,maxSegment=2){const safe=(a,b)=>[[0,0],[clearance,0],[-clearance,0],[0,clearance],[0,-clearance]].every(([x,y])=>traverse({x:a.x+x,y:a.y+y},{x:b.x+x,y:b.y+y}));const r=findGridRoute(m.spawn,target,safe,{step:.5,maxNodes:16384,maxDistance:350});if(!r.reached)throw Error('Unreachable approach '+JSON.stringify(target));let current=m.spawn,points=[current],i=0;while(i<r.points.length){let j=r.points.length-1;while(j>i&&(!safe(current,r.points[j])||Math.hypot(current.x-r.points[j].x,current.y-r.points[j].y)>maxSegment))j--;current=r.points[j];points.push(current);i=j+1;}return points;}
const bottom=m.stairRepair.bottom,top=m.stairRepair.top;
if(!traverse(bottom,top))throw Error('Green opening stairs have a blocking ledge');
const stair={success:true,approachRoute:routeTo(bottom),bottom,top,heights:[p.newWorldHeight(bottom),p.newWorldHeight(top)],expectedRise:p.newWorldHeight(top)-p.newWorldHeight(bottom),scope:'green lower opening only'};
const gateRoute=[...m.gateRepair,{x:79.7057,y:-15.5835},{x:89.374176,y:-23.21243},{x:91.94,y:-27.32}];
for(let i=1;i<gateRoute.length;i++)if(!traverse(gateRoute[i-1],gateRoute[i]))throw Error('Gate/bridge segment obstructed '+i);
const gate={success:true,approachRoute:routeTo(gateRoute[0],.75,1),gateRoute,heights:gateRoute.map(p.newWorldHeight)};
for(const [file,data]of [['stair-probe-route.json',stair],['gate-probe-route.json',gate]])fs.writeFileSync('native/CampMind.Unity/Assets/StreamingAssets/'+file,JSON.stringify(data));
fs.writeFileSync('native/Artifacts/connection-correction/map-verification.json',JSON.stringify({stair,gate},null,2));console.log(JSON.stringify({stairs:{rise:stair.expectedRise,approachPoints:stair.approachRoute.length},gate:{segments:gateRoute.length-1,heights:gate.heights,approachPoints:gate.approachRoute.length}}));
