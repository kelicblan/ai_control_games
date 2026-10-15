import {test,expect} from '@playwright/test';
test('player opens an NPC mention from the channel and selects a server-owned safe option',async({page,context})=>{
 test.setTimeout(120000);
 await context.addCookies([{name:'campmind-player',value:'00000000-0000-4000-8000-000000000011',url:'http://127.0.0.1:5175'}]);
 const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
 let responses=0;page.on('response',r=>{if(r.url().includes('/game-api/')&&responses++<8)console.log('API',r.url(),r.status());});
 page.on('requestfailed',r=>console.log('FAILED',r.url(),r.failure()?.errorText));
 // Isolate the production dialogue and real HTTP mutations from GPU/model startup.
 await page.goto('/e2e/social-ui.html?channel=1',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('dialog',{name:'营地对话',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'回复阿野',exact:true}).first().click({timeout:60000});
 const dialog=page.getByRole('dialog',{name:'营地对话',exact:true});await expect(dialog).toBeVisible({timeout:60000});
 await expect(dialog.getByRole('heading',{name:'阿野',exact:true})).toBeVisible();
 await expect(dialog.getByRole('log',{name:'社会对话记录'}).locator('.player')).toHaveCount(0);
 await expect(dialog.locator('textarea,input[type=text]')).toHaveCount(0);
 const reply=dialog.getByRole('region',{name:'情境回复'}).getByRole('button',{name:'这次先不聊了，改天再说。',exact:true});
 await expect(reply.first()).toBeVisible({timeout:30000});
 await page.screenshot({path:'docs/screenshots/channel-reply-options.png'});
 await reply.first().click();await expect(dialog.getByRole('log',{name:'社会对话记录'}).locator('.player')).toContainText('这次先不聊了，改天再说。',{timeout:30000});
 expect(errors).toEqual([]);
});
test('NPC appointment reaches physical positions before reporting the meeting',async({request})=>{
 const headers={'X-Camp-Tab':'socialqa',Cookie:'campmind-player=00000000-0000-4000-8000-000000000012'};
 const initial=await (await request.get('/game-api/world',{headers})).json();
 await request.post('/game-api/world',{headers,data:{revision:initial.revision,operation:'resume-npcs',action:{type:'pause',paused:false}}});
 await expect.poll(async()=>{
  const response=await request.get('/game-api/world',{headers});const {state}=await response.json();
  const a=state.socialLife?.appointments[0];
  if(!a||!['talking','completed'].includes(a.stage))return false;
  return ['aye','linlan'].every(id=>{const n=a.meetingPositions?.find((n:{id:string})=>n.id===id);return n&&Math.hypot(n.x-50,n.y-110)<6;});
 },{timeout:30000}).toBe(true);
 const final=await (await request.get('/game-api/world',{headers})).json();
 await request.post('/game-api/world',{headers,data:{revision:final.revision,operation:'pause-npcs',action:{type:'pause',paused:true}}});
});
