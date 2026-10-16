import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CampMap} from '../src/components/CampMap';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {createAtmosphere} from '../src/games/camp/simulation/weather';
import '../src/styles/game.css';
import '../src/styles/compact-hud.css';
function Preview(){
 const [game,setGame]=useState(()=>{const g=createGame({seed:17});g.status='playing';g.elapsed=210;g.weather='clear';g.atmosphere=createAtmosphere(17,'clear',210);g.atmosphere.cloudCover=.05;return g;});
 const clock=(elapsed:number)=>setGame(g=>({...g,elapsed,atmosphere:{...createAtmosphere(17,'clear',elapsed),cloudCover:.05,rainIntensity:0}}));
 return <div className="game-shell"><CampMap game={game} onSelect={()=>{}} onAssign={()=>{}} onResume={()=>{}} onCommand={c=>setGame(g=>issueCommand(g,c))}/><div className="validation-clock"><button onClick={()=>clock(210)}>正午 12:00</button><button onClick={()=>clock(500)}>夜间 22:00</button></div></div>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
