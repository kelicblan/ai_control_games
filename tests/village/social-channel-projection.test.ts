import {it,expect} from 'vitest';import {projectVillageChannel} from '../../scripts/world/village-social-channel';
it('acknowledged NPC-to-NPC speech reaches the existing Unity channel without exposing agreements',()=>{
 const old={state:{npcs:[],socialLife:{messages:[]}},revision:3},line={id:'world:proposal:p1',from:'worker',to:['partner'],text:'我愿意给你治疗，然后休整。',at:12,source:'village-model'};
 const result=projectVillageChannel(old,[line]);expect(result.state.socialLife.messages).toEqual([line]);expect(old.state.socialLife.messages).toEqual([]);expect(JSON.stringify(result)).not.toContain('terms');
});
