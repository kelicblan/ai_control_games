process.env.CAMP_WORLD_LAYOUT='new-world-v1';
const {VillageRuntime}=await import('../world/village-runtime');const r=new VillageRuntime(':memory:',Date.now,false);
try{const s=r.createCampaign('profile',64138);r.setPaused('profile',s.revision,false,s.worldId);const times=[];for(let i=0;i<240;i++){const t=performance.now();r.tick();times.push(performance.now()-t);}times.sort((a,b)=>a-b);console.log(JSON.stringify({ticks:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}));}finally{r.close();}
