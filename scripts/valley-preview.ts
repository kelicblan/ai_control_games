import {createCampScene} from '../src/scene/campScene';
import {createGame,issueCommand} from '../src/games/camp/simulation/engine';
import {createAtmosphere} from '../src/games/camp/simulation/weather';
import {CAMP_HOUSES} from '../src/games/camp/world/definition';
import {VILLAGE_FACILITIES,VILLAGE_PLAZA} from '../src/games/camp/world/villageLayout';
const host=document.getElementById('preview')!,status=document.getElementById('status')!;
const style=document.createElement('style');style.textContent='.world-atlas{display:none!important}.views{position:fixed;right:24px;bottom:20px;max-width:75vw;flex-wrap:wrap;justify-content:flex-end;font-size:11px}';document.head.append(style);
const initial=createGame({seed:17,difficulty:'cozy',scenario:'standard',mode:'rules'});
initial.elapsed=65;initial.status='playing';initial.weather='clear';initial.atmosphere=createAtmosphere(17,'clear',65);
initial.atmosphere.cloudCover=.05;initial.atmosphere.rainIntensity=0;
let state=initial;
const scene=createCampScene(host,state,{onSelect(){},onAssign(){},onProject(){},onStatus(value,message){if(value==='error')status.textContent=message??'场景错误';}});
for(const [label,index,inside] of [['领主府入口',0,false],['领主府室内',0,true],['民居入口',1,false],['民居室内',1,true]] as const){
 const button=document.createElement('button');button.textContent=label;document.querySelector('.views')!.append(button);
 button.onclick=()=>{const house=CAMP_HOUSES[index];state={...state,lord:{...state.lord!,position:{x:house.center.x,y:house.center.y+(inside?0:house.half.y+30)},input:{x:0,y:0}}};scene.update(state);scene.setViewMode('lord');scene.resetCamera();if(!inside)scene.zoom(.8);};
}
document.getElementById('overview')!.onclick=()=>{scene.setViewMode('god');scene.resetCamera();scene.locate({x:50,y:55});scene.zoom(1.5);};
for(const place of [...VILLAGE_FACILITIES,{...VILLAGE_PLAZA,name:'村寨广场'}]){
 const button=document.createElement('button');button.textContent=place.name;document.querySelector('.views')!.append(button);
 button.onclick=()=>{scene.setViewMode('god');scene.resetCamera();scene.locate(place.center);scene.zoom(2.5);};
}
document.getElementById('manor')!.onclick=()=>{scene.resetCamera();scene.locate({x:50,y:-40});scene.zoom(3);};
const cottageYard=document.createElement('button');cottageYard.textContent='民居院落';document.querySelector('.views')!.append(cottageYard);
cottageYard.onclick=()=>{scene.setViewMode('god');scene.resetCamera();const house=CAMP_HOUSES[1];scene.locate({x:house.center.x,y:house.center.y+10});scene.zoom(6);};
document.getElementById('gate')!.onclick=()=>{scene.resetCamera();scene.locate({x:50,y:170});scene.zoom(3.4);};
const gateToggle=document.createElement('button');gateToggle.textContent='关闭寨门';document.querySelector('.views')!.append(gateToggle);
gateToggle.onclick=()=>{state=issueCommand(state,{type:'gate-toggle'});gateToggle.textContent=state.world?.gateOpen===false?'打开寨门':'关闭寨门';scene.update(state);};
const landscape=document.createElement('button');landscape.textContent='山脉与林地';document.querySelector('.views')!.append(landscape);
landscape.onclick=()=>{scene.resetCamera();scene.locate({x:50,y:-320});};
const riverView=document.createElement('button');riverView.textContent='河湾与村外道路';document.querySelector('.views')!.append(riverView);
riverView.onclick=()=>{scene.resetCamera();scene.locate({x:75,y:360});scene.zoom(1.3);};
for(const [label,elapsed] of [['正午光照',210],['夜间光照',500]] as const){
 const button=document.createElement('button');button.textContent=label;document.querySelector('.views')!.append(button);
 button.onclick=()=>{state={...state,elapsed,atmosphere:createAtmosphere(17,'clear',elapsed)};state.atmosphere.cloudCover=.05;state.atmosphere.rainIntensity=0;scene.update(state);};
}
const timer=setInterval(()=>{
 scene.update(state);
 const canvas=host.querySelector('canvas'),loading=canvas?.dataset.houseModelState;
 if(loading==='ready'){const stats=scene.stats();status.textContent=`${canvas?.dataset.terrainModelState==='ready'?'整体地形 GLB 已加载':'地形回退模式'} · ${stats.calls} 次绘制 · ${(stats.triangles/10000).toFixed(1)} 万三角面 · ${stats.fps} FPS`;}
 else if(loading==='error')status.textContent='部分场景模型加载失败，请检查控制台';
},100);
window.addEventListener('pagehide',()=>{clearInterval(timer);scene.dispose();},{once:true});
