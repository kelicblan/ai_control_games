import { build } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='docs/steam-performance-2026-10-16';
const resultName=process.argv.includes('--followup')?'followup-results':'results';
await mkdir(out,{recursive:true});
if(process.argv.includes('--build')) {
 await build({base:'/',plugins:[{name:'isolated-benchmark-controls',enforce:'pre',transform(code,id){
  if(id.endsWith('/src/scene/campScene.ts')) return code
   .replace('function render(dt:number,now:number){','function render(dt:number,now:number){ (window as any).__bench={renderer,scene,worldRoot,environment,terrain,weather,companions,state};')
   .replace('renderer.render(scene,camera);',`const opts=(window as any).__opts??{}; renderer.shadowMap.enabled=!opts.noShadows; if(!opts.noDraw)renderer.render(scene,camera);`)
   .replace('const next=nextSceneQuality(qualityScale,measuredFps);','const next=qualityScale;');
  if(id.endsWith('/scripts/performance-preview.ts')) return code
   .replace('state = advanceGame(state, .1, baselinePolicy); weather(); scene.update(state);','weather(); scene.update(state);')
   +'\n(window as any).__preview={scene,get state(){return state;}};';
 }}],build:{outDir:'dist',emptyOutDir:false,copyPublicDir:false,rollupOptions:{input:'scripts/performance-preview.html'}}});
 process.exit(0);
}
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results={date:new Date().toISOString(),viewport:{width:1920,height:1080},errors,scenarios:[]};
try{
 await page.goto('http://127.0.0.1:4173/scripts/performance-preview.html?profile=1');
 await page.waitForFunction(()=>window.__bench&&document.querySelector('canvas.scene-canvas')?.dataset.lordModel==='ready',null,{timeout:90000});
 await page.waitForTimeout(18000);
 results.gpu=await page.evaluate(()=>{const gl=window.__bench.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:ext&&gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),renderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),version:gl.getParameter(gl.VERSION)};});
 results.inventory=await page.evaluate(()=>{const b=window.__bench,arr=[];b.scene.traverse(o=>{if(o.isMesh)arr.push({name:o.name,parent:o.parent?.name,triangles:(o.geometry.index?.count??o.geometry.attributes.position.count)/3,instances:o.count??1,visible:o.visible,castShadow:o.castShadow,type:o.type});});return {npcs:b.state.npcs.length,groups:b.worldRoot.children.map(o=>({name:o.name,type:o.type,children:o.children.length})),meshes:arr};});
 const cases=process.argv.includes('--followup')?[['god-baseline',{}],['god-no-ground',{noGround:true}],['god-no-forest',{noForest:true}],['god-no-weather',{noWeather:true}],['god-repeat',{}],['lord-warm',{lord:true}],['lord-shadow-off-repeat',{lord:true,noShadows:true}]]:[['god-storm',{}],['god-clear',{clear:true}],['god-no-shadows',{noShadows:true}],['god-half-resolution',{ratio:.5}],['god-no-terrain',{noTerrain:true}],['god-no-instanced',{noInstanced:true}],['god-no-draw',{noDraw:true}],['lord-storm',{lord:true}],['lord-no-shadows',{lord:true,noShadows:true}],['god-storm-repeat',{}]];
 for(const [name,opts] of cases){
  await page.evaluate(opts=>{const b=window.__bench;window.__opts=opts;for(const [o,v]of window.__hidden??[])o.visible=v;window.__hidden=[];
   window.__preview.scene.setViewMode(opts.lord?'lord':'god');b.renderer.setPixelRatio(opts.ratio??Math.sqrt(1800000/(1920*1080)));b.renderer.setSize(1920,1080,false);
   if(opts.noTerrain){window.__hidden.push([b.terrain.group,b.terrain.group.visible]);b.terrain.group.visible=false;}
   if(opts.noInstanced)b.scene.traverse(o=>{if(o.isInstancedMesh){window.__hidden.push([o,o.visible]);o.visible=false;}});
   if(opts.noGround||opts.noForest)b.terrain.group.traverse(o=>{if(opts.noGround&&o.name==='Visible landscape cell'||opts.noForest&&o.isInstancedMesh&&/forest/i.test(o.name)){window.__hidden.push([o,o.visible]);o.visible=false;}});
   window.__weatherOriginal??=b.weather.update;b.weather.update=opts.noWeather?()=>0:window.__weatherOriginal;
   if(opts.noWeather){window.__hidden.push([b.weather.group,b.weather.group.visible]);b.weather.group.visible=false;}
   document.getElementById(opts.clear?'clear':'rain').click();
  },opts);
  await page.waitForTimeout(4500);
  const data=await page.evaluate(async()=>{const times=[];let last;await new Promise(resolve=>{const start=performance.now();function frame(t){if(last)times.push(t-last);last=t;if(t-start<12000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});times.sort((a,b)=>a-b);const q=p=>times[Math.ceil(times.length*p)-1];const c=document.querySelector('canvas.scene-canvas');return {frames:times.length,fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),p50:q(.5),p95:q(.95),p99:q(.99),over50:times.filter(t=>t>50).length,dataset:{...c.dataset},buffer:{width:c.width,height:c.height},stats:window.__preview.scene.stats()};});
  results.scenarios.push({name,opts,...data});console.log(JSON.stringify({name,fps:data.fps,p95:data.p95,calls:data.stats.calls,triangles:data.stats.triangles}));
  if(name==='god-storm'||name==='lord-storm')await page.screenshot({path:`${out}/${name}.png`});
  await writeFile(`${out}/${resultName}.json`,JSON.stringify(results,null,2));
 }
}finally{await writeFile(`${out}/${resultName}.json`,JSON.stringify(results,null,2));await browser.close();}
