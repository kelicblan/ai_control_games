import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

test('expanded village geography does not change legacy ecology or reject its depleted save',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'camp-forest-compat-'));
  try{
    const base={version:1,id:'new-world-v1',minX:200,minY:-100,width:61,height:61,step:.5,heights:Array(61*61).fill(0),walkable:Array(61*61).fill(1),spawn:{x:205,y:-95},center:{x:0,y:0},gate:{x:0,y:0},locations:{},npcSpawns:[],restPoints:[],outline:[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}]};
    const baseline=path.join(dir,'old.json'),expanded=path.join(dir,'expanded.json'),ecology=path.join(dir,'ecology.json');fs.writeFileSync(baseline,JSON.stringify(base));
    fs.writeFileSync(expanded,JSON.stringify({...base,width:91,height:91,heights:Array(91*91).fill(0),walkable:Array(91*91).fill(0),forestExpansion:{id:'forest-expansion-v1',clearings:[],habitats:{deer:[],boar:[]},resources:[{id:'forest-berries-1',kind:'berries',position:{x:250,y:-100},stand:{x:250,y:-100},capacity:8,recovery:300}],resourceGrid:base}}));
    const run=(file,code)=>execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,CAMP_WORLD_LAYOUT:'new-world-v1',CAMP_NEW_WORLD_DATA:file,FOREST_ECOLOGY_TEST:ecology}}).trim();
    const imports='import fs from "node:fs";import {tsImport} from "tsx/esm/api";const e=await tsImport("./src/games/camp/world/ecology.ts",import.meta.url);';
    run(baseline,imports+'const old=e.createEcology(17);old.resources[0].remaining=0;old.resources[0].readyAt=100;fs.writeFileSync(process.env.FOREST_ECOLOGY_TEST,JSON.stringify(old));');
    const result=JSON.parse(run(expanded,imports+'const old=JSON.parse(fs.readFileSync(process.env.FOREST_ECOLOGY_TEST));console.log(JSON.stringify({valid:e.validEcology(old,17),depleted:old.resources[0].remaining,count:e.createEcology(17).resources.length}));'));
    assert.equal(result.valid,true);assert.equal(result.depleted,0);assert.equal(result.count,84);
  }finally{assert.equal(path.dirname(dir).toLowerCase(),path.resolve(os.tmpdir()).toLowerCase());assert.ok(path.basename(dir).startsWith('camp-forest-compat-'));fs.rmSync(dir,{recursive:true,force:true});}
});
