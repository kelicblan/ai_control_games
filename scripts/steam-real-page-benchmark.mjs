import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const out='docs/steam-performance-2026-10-16';
const sustained=process.argv.includes('--sustained'),resultName=sustained?'real-page-sustained':'real-page';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'no-preference'});
const page=await context.newPage();const evidence={errors:[],responses:[],scenarios:[]};
page.on('pageerror',e=>evidence.errors.push(e.message));
page.on('response',r=>{if(r.url().includes('/game-api/world'))void r.body().then(b=>evidence.responses.push({bytes:b.length,status:r.status()})).catch(()=>{});});
try{
 await page.goto('http://127.0.0.1:4174/?profile=1');
 await page.waitForTimeout(5000);
 evidence.initial=await page.locator('body').innerText();console.log('Initial page loaded');
 await writeFile(`${out}/${resultName}.json`,JSON.stringify(evidence,null,2));
 const start=page.getByRole('button',{name:'进入村寨',exact:true});
 await start.waitFor({state:'visible',timeout:60000});await start.click();
 await page.waitForFunction(()=>Number(document.querySelector('canvas.scene-canvas')?.dataset.visualTime)>2,null,{timeout:90000});
 await page.waitForTimeout(sustained?90000:20000);
 for(const mode of ['god','lord']){
  if(mode==='lord'){
   const buttons=await page.getByRole('button').allTextContents();evidence.buttons=buttons;
   const lord=page.getByRole('button',{name:/切换.*领主|领主视角/});if(await lord.count()===1)await lord.click();
  }
  const result=await page.evaluate(async()=>{const samples=[];let last;await new Promise(resolve=>{const start=performance.now();function frame(t){if(last)samples.push(t-last);last=t;if(t-start<15000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});samples.sort((a,b)=>a-b);const c=document.querySelector('canvas.scene-canvas');return {fps:1000/(samples.reduce((a,b)=>a+b,0)/samples.length),p50:samples[Math.ceil(samples.length*.5)-1],p95:samples[Math.ceil(samples.length*.95)-1],p99:samples[Math.ceil(samples.length*.99)-1],over50:samples.filter(t=>t>50).length,frames:samples.length,dataset:{...c.dataset},buffer:{width:c.width,height:c.height},profile:JSON.parse(c.dataset.performance??'null')};});
  evidence.scenarios.push({mode,...result});console.log(JSON.stringify({mode,fps:result.fps,p95:result.p95,scale:result.dataset.renderScale,rain:result.dataset.rainParticles}));
  if(mode==='lord'&&result.dataset.viewMode==='lord'){
   await page.locator('canvas.scene-canvas').click({position:{x:800,y:500}});
   await page.evaluate(()=>{const c=document.querySelector('canvas.scene-canvas'),x=c.dataset.lordX,y=c.dataset.lordY,start=performance.now();window.__inputProbe=new Promise(resolve=>{function check(){if(c.dataset.lordX!==x||c.dataset.lordY!==y)resolve({latency:performance.now()-start,from:{x,y},to:{x:c.dataset.lordX,y:c.dataset.lordY}});else if(performance.now()-start>5000)resolve({timeout:true});else requestAnimationFrame(check);}requestAnimationFrame(check);});});
   await page.keyboard.down('KeyD');evidence.input=await page.evaluate(()=>window.__inputProbe);await page.waitForTimeout(1000);await page.keyboard.up('KeyD');
  }
  await page.screenshot({path:`${out}/${resultName}-${mode}.png`});
 }
 evidence.final=await page.locator('body').innerText();
}finally{await writeFile(`${out}/${resultName}.json`,JSON.stringify(evidence,null,2));await browser.close();}
