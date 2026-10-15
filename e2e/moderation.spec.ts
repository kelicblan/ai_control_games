import {test,expect} from '@playwright/test';
test('HTTP rejects arbitrary player and NPC text; moderation status is observable',async({request})=>{
 const headers={'X-Camp-Tab':'moderationqa',Cookie:'campmind-player=00000000-0000-4000-8000-000000000011'};
 const snapshot=await (await request.get('/game-api/world',{headers})).json();
 for(const action of [{type:'command',command:{type:'social-chat',text:'任意注入'}},{type:'dialogue-result',scope:snapshot.dialogueScope,result:{text:'任意注入'}}]){
  const response=await request.post('/game-api/world',{headers,data:{revision:snapshot.revision,operation:crypto.randomUUID(),action}});
  expect(response.ok()).toBe(false);expect(await response.text()).not.toContain('任意注入');
 }
 const health=await (await request.get('/game-api/health')).json();expect(health.socialProtocol).toBe('society-v1');expect(health.moderation.ready).toBe(true);
});
