import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createNpc } from '../src/games/camp/simulation/constants';
import { createAtmosphere } from '../src/games/camp/simulation/weather';
import { NPC_IDS } from '../src/games/camp/simulation/types';
import { Shapes } from '../src/scene/geometry';
import { createSubjectCharacter, updateSubjectCharacter } from '../src/scene/subjectCharacter';
const scene = new Scene(), renderer = new WebGLRenderer({ antialias: true }), camera = new PerspectiveCamera(38,innerWidth/innerHeight,.1,100);
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);scene.background=new Color('#aeb8bf');document.body.append(renderer.domElement);
scene.add(new HemisphereLight('#ffffff','#5e6771',2));const sun=new DirectionalLight('#fff4df',3);sun.position.set(8,14,12);scene.add(sun);
camera.position.set(0,5,25);camera.lookAt(0,4,0);
const shapes=new Shapes(),weather=createAtmosphere(17,'clear',0);weather.rainIntensity=0;weather.windStrength=0;
const batch = Math.min(3, Math.max(1, Number(new URLSearchParams(location.search).get('batch')) || 1));
const entries=NPC_IDS.slice((batch-1)*3,batch*3).map((id,i)=>{const npc=createNpc(id);npc.position={x:50+(i-1)*5.5,y:50};npc.destination={...npc.position};const rig=createSubjectCharacter(id,shapes);scene.add(rig.root);return {npc,rig,base:npc.position.x};});
document.querySelector('.names')!.replaceChildren(...entries.map(({npc})=>{const label=document.createElement('span');label.textContent=npc.name;return label;}));
let action='Idle',last=performance.now(),time=0;
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-action]'))button.onclick=()=>{action=button.dataset.action!;};
document.getElementById('side')!.onclick=()=>{camera.position.set(20,7,20);camera.lookAt(0,4,0);};
document.getElementById('front')!.onclick=()=>{camera.position.set(0,5,25);camera.lookAt(0,4,0);};
function frame(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
 for(const {npc,rig,base} of entries){const moving=action==='Walk'||action==='WalkCarry';npc.position.x=base+(moving?Math.sin(time*2)*.5:0);npc.destination={x:npc.position.x+(moving?10:0),y:50};
  npc.action=action==='Work'?'wood':action==='Gather'?'food':action==='Rest'?'rest':null;npc.inventory.wood=action==='Carry'||action==='WalkCarry'?2:0;
  updateSubjectCharacter(rig,npc,dt,time,time,false,true,false,weather);rig.pivot.rotation.y=0;
 }
 renderer.domElement.dataset.model=entries.every(e=>e.rig.root.userData.modelStatus==='ready')?'ready':'loading';
 renderer.domElement.dataset.animation=entries.map(e=>e.rig.root.userData.animation??'').join(',');
 document.getElementById('status')!.textContent=entries.map(e=>`${e.npc.name}: ${e.rig.root.userData.modelStatus} · ${e.rig.root.userData.animation??''}`).join('　');
 renderer.render(scene,camera);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
