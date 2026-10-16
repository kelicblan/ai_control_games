import path from 'node:path';
import { MiniMindAppraisal } from './world/minimind-appraisal';
import { Lexicon } from './world/moderation/lexicon';
import { Moderation } from './world/moderation/service';
import { decisionSchema,parseSocialDecision } from '../src/games/camp/social/validation';
import { DatabaseSync } from 'node:sqlite';
import { RemoteCredentialStore } from './world/remote-models';
import { NativeAppraisal } from './world/native-appraisal';
import { createSocialModel } from './world/appraisal-provider';
const root=process.cwd(),model=new MiniMindAppraisal(root),lexicon=new Lexicon(path.join(root,'config/moderation/blocked-words.txt'));
const moderation=new Moderation(lexicon);const started=Date.now();
let store:RemoteCredentialStore|undefined,native:NativeAppraisal|undefined,backend='minimind3';
try{
 let generate=(prompt:string,schema:Record<string,unknown>,signal:AbortSignal)=>model.generateJSON(prompt,schema,signal);
 if(process.argv.includes('--configured')){
  const file=path.join(root,'data/world.sqlite'),db=new DatabaseSync(file,{readOnly:true});
  const row=db.prepare("SELECT player,json_extract(payload,'$.state.agency.modelId') AS model FROM snapshots WHERE quarantined=0 ORDER BY id DESC LIMIT 1").get();db.close();
  if(!row?.model)throw new Error();backend=process.argv.find(a=>a.startsWith('--model='))?.slice(8)??String(row.model);native=new NativeAppraisal(root);
  generate=createSocialModel(()=>store??=new RemoteCredentialStore(file),model,native)(String(row.player),backend);
 }
 const raw=await generate('你是林枫，阿野邀请你到寨里广场聊聊。你精力充足，没有其他安排。可以接受或拒绝，不声称已经到场。只输出JSON，text为中文，intent为accept或decline，接受时locationId为plaza。',decisionSchema,AbortSignal.timeout(45000));
 const decision=parseSocialDecision(raw),review=await moderation.review(JSON.stringify(decision),generate);
 console.log(JSON.stringify({backend,schemaValid:true,intent:decision.intent,locationId:decision.locationId,semanticApproved:review.allowed,elapsedMs:Date.now()-started,visibleText:review.allowed?lexicon.mask(decision.text):review.text}));
}catch{console.log(JSON.stringify({backend,schemaValid:false,elapsedMs:Date.now()-started,outcome:'safe-fallback'}));process.exitCode=1;}
finally{model.dispose();native?.dispose();store?.close();lexicon.close();}
