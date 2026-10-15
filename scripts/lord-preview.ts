import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createGame } from '../src/games/camp/simulation/engine';
import { Shapes } from '../src/scene/geometry';
import { createLordCharacter, updateLordCharacter } from '../src/scene/lordCharacter';
const scene = new Scene(), renderer = new WebGLRenderer({ antialias: true }), camera = new PerspectiveCamera(35, innerWidth/innerHeight,.1,100);
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);scene.background=new Color('#aeb8bf');document.body.append(renderer.domElement);
scene.add(new HemisphereLight('#ffffff','#5e6771',2));const sun=new DirectionalLight('#fff4df',3);sun.position.set(8,14,12);scene.add(sun);
const state=createGame({seed:17});state.status='playing';state.lord!.position={x:50,y:50};state.atmosphere.rainIntensity=0;state.atmosphere.windStrength=0;
state.lord!.heading=0;
const rig=createLordCharacter(new Shapes());scene.add(rig.root);
let moving=false,last=performance.now();camera.position.set(0,4.2,18);camera.lookAt(0,4,0);
for(const [id,x,z] of [['front',0,18],['side',18,0],['back',0,-18]] as const)document.getElementById(id)!.onclick=()=>{camera.position.set(x,4.2,z);camera.lookAt(0,4,0);};
document.getElementById('idle')!.onclick=()=>{moving=false;};document.getElementById('walk')!.onclick=()=>{moving=true;};
document.getElementById('pause')!.onclick=()=>{state.status=state.status==='playing'?'paused':'playing';};
function frame(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;
 if(state.status==='playing'){state.elapsed+=dt;state.lord!.input={x:moving?1:0,y:0};if(moving)state.lord!.position.x+=dt*8;}
 updateLordCharacter(rig,state,dt,state.elapsed,false);rig.root.position.set(0,0,0);
 renderer.domElement.dataset.model=rig.root.userData.modelStatus;renderer.domElement.dataset.animation=rig.root.userData.animation??'';
 document.getElementById('status')!.textContent=`${rig.root.userData.modelStatus} · ${rig.root.userData.animation??''}`;
 renderer.render(scene,camera);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
