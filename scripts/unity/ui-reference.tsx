import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export default {}',shortCircuit:true};return next(url,context);}});
const {createGame}=await import('../../src/games/camp/simulation/engine');
const {Header}=await import('../../src/components/Header');
const {CrewPanel}=await import('../../src/components/CrewPanel');
const {CommandDock}=await import('../../src/components/CommandDock');
const {JourneyDialog}=await import('../../src/components/JourneyDialog');
const {WorldChannel}=await import('../../src/components/WorldChannel');
const {CampDrawer}=await import('../../src/components/CampDrawer');
const {HelpDialog}=await import('../../src/components/HelpDialog');
const {JournalDrawer}=await import('../../src/components/JournalDrawer');
const {WeatherDialog}=await import('../../src/components/WeatherPanel');
const {SocialDialog}=await import('../../src/components/SocialDialog');
const {DecisionPanel}=await import('../../src/components/DecisionPanel');
const {GameSettingsDialog}=await import('../../src/components/GameSettingsDialog');
const {BookOpen,House}=await import('lucide-react');
const game=createGame({seed:17});game.status='playing';game.elapsed=70;
const noop=()=>{};
const styles=['fonts','game','mobile-game','weather','compact-hud','nine-villagers','world-channel','camp-tabs','dialogue','social','npc-memory','model-settings','scene'];
const server=createServer((req,res)=>{
 try{
  const url=new URL(req.url!,'http://localhost');
  if(url.pathname==='/'){
   const page=url.searchParams.get('page')||'hud';
   const extra=page==='help'?<HelpDialog onClose={noop}/>:page==='journal'?<JournalDrawer game={game} onClose={noop} onObserve={noop}/>:page==='weather'?<WeatherDialog game={game} sound={true} soundPending={false} onSound={noop} onWeather={noop} onObserve={noop} onClose={noop}/>:page==='social'?<SocialDialog game={game} npcId={game.selectedNpc} thread={undefined} onCommand={noop} onTopic={noop} onClose={noop}/>:page==='decisions'?<DecisionPanel game={game} model={null} onClose={noop} onExperiment={noop}/>:page==='settings'?<GameSettingsDialog onClose={noop} onReset={async()=>{}} game={game}/>:null;
   const markup=renderToStaticMarkup(<>{extra}<div className="game-shell"><Header game={game} speed={1} sound={true} soundPending={false} onPause={noop} onSpeed={noop} onSound={noop} onHelp={noop} onWeather={noop} onSettings={noop}/><CrewPanel game={game} onSelect={noop}/>{page==='selected'?<CommandDock game={game} onAssign={noop} onDetails={noop} onDispatch={noop} onHunt={noop}/>:null}<nav className="hud-utilities"><button className="hud-utility-button"><BookOpen size={23}/><span>手记</span></button><button className="hud-utility-button"><House size={23}/><span>营地</span></button></nav></div><WorldChannel onMore={noop}/>{page==='welcome'?<JourneyDialog loading={false} modelError="" onStart={noop} onSettings={noop} onGameSettings={noop}/>:null}{page==='camp'?<CampDrawer game={game} saveStatus="saved" offlineReady={true} dialogue={{enabled:false,mode:'off',generated:0,cached:0,poolSize:0} as any} onToggleDialogue={noop} onRetryDialogue={noop} onCommand={noop} onObserve={noop} onTalk={noop} onNew={noop} onClose={noop}/>:null}</>);
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>原版 UI 源组件对照 · ${page}</title>${styles.map(s=>`<link rel="stylesheet" href="/src/styles/${s}.css">`).join('')}<style>body{background:#65805b!important}</style><div id="root">${markup}</div>`);return;
  }
  const base=url.pathname.startsWith('/assets/')?path.resolve('public'):url.pathname.startsWith('/src/styles/')?path.resolve('src/styles'):null;
  if(!base){res.writeHead(404).end();return;}const file=path.resolve(url.pathname.startsWith('/assets/')?'public'+url.pathname:'.'+url.pathname);
  if(!file.startsWith(base+path.sep)||!existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(readFileSync(file));
 }catch(error){res.writeHead(500).end(String(error));}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:(server.address() as any).port,kind:'read-only-original-ui-reference'})));
