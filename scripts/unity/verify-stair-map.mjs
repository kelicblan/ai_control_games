import fs from 'node:fs';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const p=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const {findGridRoute}=await tsImport('../../packages/world-core/src/navigation.ts',import.meta.url);
const m=p.newWorld;if(!m.stairRepair)throw Error('Stairs not exported');
const traverse=(a,b)=>p.newWorldTraverse(a,b);
const route=findGridRoute(m.spawn,m.stairRepair.bottom,traverse,{step:.5,maxNodes:16384,maxDistance:350});
const porch=m.stairRepair.porch??m.stairRepair.top;
const stair=findGridRoute(m.stairRepair.bottom,porch,traverse,{step:.5,maxNodes:16384,maxDistance:350});
if(!route.reached||!stair.reached)throw Error('Approach or stair landing unreachable');
let current=m.spawn,points=[current],i=0;while(i<route.points.length){let j=route.points.length-1;while(j>i&&!traverse(current,route.points[j]))j--;current=route.points[j];points.push(current);i=j+1;}
const top=porch,bottom=m.stairRepair.bottom;
if(!traverse(bottom,top))throw Error('Direct stair centreline is obstructed');
const report={success:true,approachRoute:points,bottom,top,heights:[p.newWorldHeight(bottom),p.newWorldHeight(top)],directStairTraverse:true,visited:[route.visited,stair.visited]};
fs.mkdirSync('native/CampMind.Unity/Assets/StreamingAssets',{recursive:true});fs.writeFileSync('native/CampMind.Unity/Assets/StreamingAssets/stair-probe-route.json',JSON.stringify(report));
fs.writeFileSync('native/Artifacts/main-hall-stairs/map-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
