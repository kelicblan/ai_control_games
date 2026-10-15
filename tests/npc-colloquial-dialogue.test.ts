import { expect,it } from 'vitest';
import { buildCaptionPrompt,buildFallbackPrompt,cleanCaption,CAMP_PROMPT_BUDGET } from '../src/games/camp/dialogue/language';
import { createGame } from '../src/games/camp/simulation/engine';
import { ensureCampMind } from '../src/games/camp/npc/bridge';
import { createDialogueTicket } from '../src/games/camp/dialogue/context';
import type { DialoguePayload } from '../packages/npc-dialogue/src/types';
const payload:DialoguePayload={requestId:'test',npcId:'linlan',name:'林枫',persona:'冲动、耐心少',action:'rest',emotion:'annoyed',event:'不想再加班',facts:['精力很低','休息诉求已被拒绝3次'],memories:['刚才领主又催我干活'],recentLines:[],publicExpression:{kind:'refusal',tone:'angry',reason:'反复被催促',allowDeception:false}};
it('rejects the reported motivational, analytical and ceremonial model replies',()=>{
  for(const text of ['面对当前情况，保持积极乐观的心态至关重要。','尊敬的村民们，您好！','在这样的情况下，我需要保持冷静和理性，确保自己能够按照要求行动。','在生存任务中，通过合理的分配和优先级管理，确保每个任务都能得到及时、有效的关注和完成。','你描述的情绪状态是积极的，但同时也需要面对现实挑战。','在面对不满时，保持冷静和理智的态度至关重要。','这把手是个很好的选择，既实用又心态稳健。','我理解您希望在一段时间内尽快恢复健康，但请记住，健康是长期的过程，而不是一蹴而就。','这句诗表达了一种对未来的承诺和对责任的承担。'])expect(cleanCaption(text,{...payload,publicExpression:undefined})).toBe('');
});
it('allows ordinary anger and swearing without turning refusal into cooperation',()=>{
  for(const text of ['妈的，累成这样还催，老子不干了！','烦死了，凭什么脏活都甩给我？','少来这套，我得先歇一会儿。','他妈的，你哪来的命令？'])expect(cleanCaption(text,payload)).toBe(text);
  expect(cleanCaption('妈的，我马上继续干活。',payload)).toBe('');
});
it('rejects actual small-model narration instead of mistaking emotion words for dialogue',()=>{
  expect(cleanCaption('这段文字描述了一个场景，其中一个人在休息时感到极度疲惫和焦虑。',{...payload,publicExpression:undefined})).toBe('');
  expect(cleanCaption('这句话充满了深思熟虑和希望，同时也带着一种淡淡的忧伤。',{...payload,publicExpression:undefined})).toBe('');
});
it('gives both preferred and fallback models spoken, non-coaching instructions',()=>{
  for(const prompt of [buildCaptionPrompt(payload),buildFallbackPrompt(payload)]){
    expect(prompt).toContain('骂');expect(prompt).toContain('鸡汤');expect(prompt).toContain('林枫');
  }
});
it('does not teach the model to imitate its old coaching replies',()=>{
  const prompt=buildCaptionPrompt({...payload,conversation:[{speaker:'阿壮',text:'保持积极乐观的心态至关重要。'}]});
  expect(prompt).not.toContain('保持积极乐观的心态至关重要');
});
it('requires a published trigger for references to another person having spoken',()=>{
  const isolated={...payload,publicExpression:undefined,replyContext:{targetNames:['阿野']}};
  expect(cleanCaption('你的想法很好！',isolated)).toBe('');
  expect(cleanCaption('你说得很有道理。',isolated)).toBe('');
  const contextual={...isolated,replyContext:{targetNames:['阿野'],trigger:{id:'social:1:1',speakerId:'aye',speaker:'阿野',text:'我们一起谈谈分工，好吗？'}}};
  expect(cleanCaption('你的想法很好！',contextual)).toBe('你的想法很好！');
  expect(cleanCaption('你的想法很好！',{...contextual,replyContext:{...contextual.replyContext,act:'decline-invitation'}})).toBe('');
  expect(cleanCaption('你们先谈，我暂时不加入。',{...contextual,replyContext:{...contextual.replyContext,act:'decline-invitation'}})).toBe('你们先谈，我暂时不加入。');
  expect(buildCaptionPrompt(contextual)).toContain('阿野已说：我们一起谈谈分工');
  expect(buildFallbackPrompt(contextual)).toContain('阿野已说：我们一起谈谈分工');
});
it('keeps grounded reply metadata inside the prompt budget with a long player turn',()=>{
  const question='请听我把事情说完，'.repeat(20).slice(0,160);
  const prompt=buildCaptionPrompt({...payload,playerText:question,persona:'人物的性格描述。'.repeat(30),facts:Array.from({length:8},()=> '当前场景已经确认的情况。'.repeat(4)),worldContext:Array.from({length:8},()=> '现在的村寨情况。'.repeat(4)),replyContext:{targetNames:['领主'],trigger:{id:'social:1:1',speakerId:'player',speaker:'领主',text:question}}});
  expect(prompt.length).toBeLessThanOrEqual(CAMP_PROMPT_BUDGET);expect(prompt).toContain(question);expect(prompt).toContain('回应对象：领主');
});
it('keeps an impulsive angry character distinct from a patient caring one',()=>{
  const game=createGame();const angry=game.npcs.find(n=>n.id==='linlan')!,gentle=game.npcs.find(n=>n.id==='aling')!;
  for(const npc of [angry,gentle]){const mind=ensureCampMind(npc);mind.emotions.anger=.8;mind.expression.tone='angry';}
  expect(createDialogueTicket(game,angry).payload.speechStyle).toContain('粗话');
  expect(createDialogueTicket(game,gentle).payload.speechStyle).toContain('克制');
});
