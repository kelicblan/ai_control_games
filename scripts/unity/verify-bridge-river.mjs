import fs from 'node:fs';
import {tsImport} from 'tsx/esm/api';
process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {newWorldTraverse,newWorldHeight}=await tsImport('../../src/games/camp/world/newWorldProfile.ts',import.meta.url);
const a={x:70.0373554,y:-7.9547272},b={x:89.374176,y:-23.21243};
const length=Math.hypot(b.x-a.x,b.y-a.y),axis={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
const at=(s,side)=>({x:a.x+axis.x*s-axis.y*side,y:a.y+axis.y*s+axis.x*side});
const failures=[];
let segments=0;
for(const lateral of [-.75,-.35,0,.35,.75])for(let s=-2;s<length+2;s+=.25){
 const from=at(s,lateral),to=at(Math.min(length+2,s+.25),lateral);segments++;
 if(!newWorldTraverse(from,to,true))failures.push({s,lateral,from,to,heights:[newWorldHeight(from),newWorldHeight(to)]});
}
const report={success:failures.length===0,segments,failures};
fs.mkdirSync('native/Artifacts/bridge-river',{recursive:true});
fs.writeFileSync('native/Artifacts/bridge-river/authority-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({success:report.success,segments,blockedSegments:failures.length,firstFailure:failures[0]}));
if(!report.success)process.exitCode=1;
