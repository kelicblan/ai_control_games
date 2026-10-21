const heavy=new Set(['rawScores','stateFeatures','features','prompt','knowledge','evidence','entities']);
function facts(value:unknown,depth=0):unknown{
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(typeof value==='string')return value.slice(0,200);
 if(depth>1||!value||typeof value!=='object')return undefined;
 if(Array.isArray(value))return value.slice(0,8).map(v=>facts(v,depth+1));
 return Object.fromEntries(Object.entries(value).filter(([k])=>!heavy.has(k)).slice(0,20).map(([k,v])=>[k,facts(v,depth+1)]).filter(([,v])=>v!==undefined));
}
const evidence=(e:any)=>({eventId:e.eventId,at:e.at,kind:e.kind,source:e.source,facts:facts(e.facts)});
/** Read-only model context projection; authoritative proposals and consent checks remain intact. */
export function compactVillageSocialPrompt(prompt:string):string{
 const marker='\n数据：',at=prompt.lastIndexOf(marker),split=at>=0?at+marker.length:prompt.lastIndexOf('\n')+1;
 if(split<=0){if(prompt.length>4000)throw new Error('Social prompt lacks a bounded structured context');return prompt;}
 let data:any;try{data=JSON.parse(prompt.slice(split));}catch{throw new Error('Social context JSON is invalid');}
 const next={...data},parties:string[]=data.proposal?.parties??data.issue?.participants??[data.actorId];
 if(data.relations)next.relations=Object.fromEntries(Object.entries(data.relations).filter(([id])=>parties.includes(id)).map(([id,r])=>[id,facts(r)]));
 if(data.knownEvidence)next.knownEvidence=data.knownEvidence.map(evidence);
 if(data.evidence)next.evidence=data.evidence.slice(-8).map(evidence);
 if(data.choices)next.choices=Object.fromEntries(Object.entries(data.choices).map(([key,p]:[string,any])=>[key,{speech:p.speech,terms:p.terms}]));
 if(data.knowledge){
  const k=data.knowledge,refs=new Set<string>([...(data.proposal?.basisRefs??[]),...Object.keys(k.evidence??{}).slice(-2)]);
  next.knowledge={actorId:k.actorId,version:k.version,observedAt:k.observedAt,evidence:Object.fromEntries(Object.entries(k.evidence??{}).filter(([id])=>refs.has(id)).map(([id,e])=>[id,evidence(e)])),entities:Object.fromEntries(Object.entries(k.entities??{}).filter(([id])=>parties.includes(id)).map(([id,e])=>[id,facts(e)]))};
 }
 const result=prompt.slice(0,split)+JSON.stringify(next);
 if(result.length>4000)throw new Error(`Social context exceeds compact budget (${result.length} chars); exact proposed terms were preserved`);
 return result;
}
