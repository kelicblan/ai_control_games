import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildTerrain,ORIGIN,CLEARINGS,PATHS,terrainHeight,inTerrain,world,logical,local,placements,setRiverBoundary} from '../scripts/unity/forest-expansion.mjs';

const river=JSON.parse(fs.readFileSync(new URL('../native/ArtSource/forest-expansion/original-river.json',import.meta.url),'utf8'));
setRiverBoundary(river);

test('original river remains outside the expanded ground mesh',()=>{
  assert.ok(river.length>0);
  for(const triangle of river){const x=triangle.reduce((s,p)=>s+p[0]/3,0),z=triangle.reduce((s,p)=>s+p[1]/3,0);const [u,v]=local(x,z);assert.equal(inTerrain(u,v),false);}
});

test('southern woodland covers both flanks with an irregular boundary',()=>{
  for(const [u,v] of [[-140,0],[140,-20],[-190,60],[190,60],[-180,145],[180,145]])assert.ok(inTerrain(u,v),`Missing southern flank ${u},${v}`);
  assert.equal(inTerrain(230,230),false);assert.equal(inTerrain(0,-70),false);
  const trees=placements().trees;assert.ok(trees.filter(t=>t.u< -130).length>100);assert.ok(trees.filter(t=>t.u>130).length>100);assert.ok(trees.some(t=>t.v<0));
});

test('the bridge landing, route lanes and future clearings are continuous',()=>{
  assert.equal(terrainHeight(0,0),ORIGIN[1]);
  let count=0;
  for(const path of PATHS)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(len/.2);
    for(const lane of [-.75,0,.75]){
      let previous;
      for(let j=0;j<=steps;j++){
        const u=a[0]+(b[0]-a[0])*j/steps-(b[1]-a[1])/len*lane,v=a[1]+(b[1]-a[1])*j/steps+(b[0]-a[0])/len*lane;
        if(j===0&&i===1&&v<0)continue;
        assert.ok(inTerrain(u,Math.max(v,0)),`Route outside terrain ${u},${v}`);
        const h=terrainHeight(u,v);if(previous!==undefined)assert.ok(Math.abs(h-previous)<.45,`Route ledge ${u},${v}`);previous=h;count++;
      }
    }
  }
  assert.ok(count>10000);
  for(const p of CLEARINGS)for(let angle=0;angle<360;angle+=15){const a=angle*Math.PI/180;assert.ok(Math.abs(terrainHeight(p.u+Math.cos(a)*(p.radius-1),p.v+Math.sin(a)*(p.radius-1))-p.height)<.001,p.id);}
});

test('mesh faces upwards; coordinates round-trip; props keep path and clearing clearance',()=>{
  const mesh=buildTerrain();
  for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(n=>mesh.positions.slice(n*3,n*3+3));assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0);}
  const p=world(15,70),q=local(p[0],p[2]);assert.ok(Math.abs(q[0]-15)<1e-7&&Math.abs(q[1]-70)<1e-7);assert.deepEqual(logical(15,70),{x:50-p[0],y:50+p[2]});
  const data=placements();assert.ok(data.trees.length>600);assert.ok(data.resources.length>25);
  for(const tree of data.trees)for(const pad of CLEARINGS)assert.ok(Math.hypot(tree.u-pad.u,tree.v-pad.v)>pad.radius+3);
});
