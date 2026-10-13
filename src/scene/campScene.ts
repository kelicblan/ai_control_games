import {
  ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight,
  MathUtils, Mesh, OrthographicCamera, PCFShadowMap, Raycaster, Scene, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import type { ActionId, GameState, NpcId, Point } from '../games/camp/simulation/types';
import { configureCamera, defaultOrbit, groundFromScreen, projectWorld, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM } from './camera';
import type { ScreenPoint } from './camera';
import { bindWorldInput } from '../../packages/world-three/src/input';
import { createWorldTerrain } from '../../packages/world-three/src/terrain';
import type { WorldTerrain } from '../../packages/world-three/src/terrain';
import { createMiniMap } from '../../packages/world-ui/src/minimap';
import type { MiniMap } from '../../packages/world-ui/src/minimap';
import { ExplorationMap, validPoint } from '../../packages/world-core/src';
import '../../packages/world-ui/src/minimap.css';
import { CAMP_CENTER, GENERATOR_VERSION, INITIAL_EXPLORED_RADIUS, sampleCampSurface, riverCenter, riverHalfWidth, treeAt } from '../games/camp/world/definition';
import { createExpandedCamp } from '../games/camp/world/environment';
import { createCompanion, updateCompanion } from './characters';
import type { CompanionRig } from './characters';
import { Shapes } from './geometry';
import { createWeatherEffects } from './weather';
import type { WeatherEffects } from './weather';

export interface SceneProjection {
  npcs: { id: NpcId; feet: ScreenPoint; head: ScreenPoint }[];
  markers: { id: string; point: ScreenPoint }[];
}
export interface SceneStats { calls:number; triangles:number; geometries:number; textures:number; fps:number }
export interface SceneCallbacks {
  onSelect:(id:NpcId)=>void; onAssign:(action:ActionId)=>void; onMove?:(point:Point)=>void;
  onProject:(projection:SceneProjection)=>void; onStatus:(status:'ready'|'error',message?:string)=>void;
  onViewDirection?:(right:Point)=>void;
}
export interface CampScene {
  update:(state:GameState)=>void; resetCamera:()=>void; zoom:(amount:number)=>void;
  locate:(point:Point)=>void; followSelected:()=>void;
  stats:()=>SceneStats; dispose:()=>void;
}

/** 场景只读取游戏状态。相机移动不修改人物位置、不推进时间，也不能揭开黑雾。 */
export function createCampScene(host:HTMLElement,initial:GameState,callbacks:SceneCallbacks):CampScene {
  let renderer:WebGLRenderer;
  try{renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch{throw new Error('无法开启立体营地。请确认浏览器支持 WebGL，或关闭省电模式后重试。');}
  const scene=new Scene(),worldRoot=new Group(),camera=new OrthographicCamera(),orbit=defaultOrbit(),shapes=new Shapes();
  const origin=new Vector3(),raycaster=new Raycaster(),ndc=new Vector2(),label=new Vector3();
  const companions=new Map<NpcId,CompanionRig>();
  let environment:ReturnType<typeof createExpandedCamp>|null=null,weather:WeatherEffects|null=null,terrain:WorldTerrain|null=null,miniMap:MiniMap|null=null;
  let exploration:ExplorationMap;
  let state=initial,width=1,height=1,frameId=0,disposed=false,contextLost=false,dirty=true;
  let lastTime=0,lastRender=0,animationTime=initial.elapsed,simulationRate=1,frames=0,fpsWindow=0,measuredFps=0;
  let followId:NpcId|null=null,observer:ResizeObserver|null=null,unbind:()=>void=()=>{};
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');let reducedMotion=reduce.matches;
  const canvas=renderer.domElement;canvas.className='scene-canvas';canvas.setAttribute('aria-hidden','true');
  canvas.dataset.renderer='three.js';canvas.dataset.dimension='3';
  const inputSurface=host.parentElement??host;
  let sun:DirectionalLight,ambient:HemisphereLight;
  const sunDay=new Color('#fff0d5'),sunNight=new Color('#b8ccdc'),sunCloud=new Color('#c8d3dd');
  const skyDay=new Color('#344b46'),skyStorm=new Color('#32454d'),fogDay=new Color('#687b70'),fogStorm=new Color('#51656b');

  function surface(point:Point){return sampleCampSurface(point,state.seed);}
  function rebuildWorld(){
    miniMap?.dispose();if(terrain){worldRoot.remove(terrain.group);terrain.dispose();}
    exploration=new ExplorationMap({seed:state.seed,generatorVersion:GENERATOR_VERSION,center:CAMP_CENTER,initialRadius:INITIAL_EXPLORED_RADIUS});
    terrain=createWorldTerrain({exploration,sample:surface,riverX:riverCenter,riverWidth:riverHalfWidth,
      treeAt:(x,y)=>treeAt(x,y,state.seed),existingRiverSpan:{minY:-110,maxY:210}});worldRoot.add(terrain.group);
    miniMap=createMiniMap(inputSurface,{home:CAMP_CENTER,exploration,onLocate:locate,onHome:resetCamera,onFollow:followSelected,
      colorAt(point){const s=surface(point);return s.water?[76,129,143]:s.biome==='mountain'?[138,139,116]:s.forest>.42?[62,91,62]:[117,137,83];}});
  }
  function cameraChanged(){
    if(!validPoint({x:orbit.focus.x+50,y:orbit.focus.z+50}))return;
    const focus={x:orbit.focus.x+50,y:orbit.focus.z+50};
    orbit.focus.y=(exploration?.isExplored(focus)?Math.max(-.05,surface(focus).height):0)+1.5;
    // 渲染坐标原点跟随视窗重定位；存档和模拟永远保留未偏移的世界坐标。
    origin.set(Math.round(orbit.focus.x/1024)*1024,0,Math.round(orbit.focus.z/1024)*1024);
    worldRoot.position.copy(origin).multiplyScalar(-1);worldRoot.updateMatrixWorld(true);
    configureCamera(camera,width,height,orbit,origin);
    const span=Math.max(camera.right-camera.left,(camera.top-camera.bottom)/Math.sin(orbit.elevation))/camera.zoom;
    terrain?.setView(focus,span,{x:origin.x,y:origin.z});
    if(sun){sun.position.set(orbit.focus.x-origin.x-38,orbit.focus.y+68,orbit.focus.z-origin.z+35);
      sun.target.position.set(orbit.focus.x-origin.x,orbit.focus.y,orbit.focus.z-origin.z);}
    canvas.dataset.focusX=focus.x.toFixed(2);canvas.dataset.focusY=focus.y.toFixed(2);canvas.dataset.cameraMode=followId?'follow':'free';
    callbacks.onViewDirection?.({x:camera.matrixWorld.elements[0],y:camera.matrixWorld.elements[2]});dirty=true;
  }
  function locate(point:Point){if(!validPoint(point))return;followId=null;orbit.focus.x=point.x-50;orbit.focus.z=point.y-50;cameraChanged();}
  function followSelected(){const npc=state.npcs.find(person=>person.id===state.selectedNpc&&person.alive);if(!npc)return;
    followId=followId===npc.id?null:npc.id;if(followId){orbit.focus.x=npc.position.x-50;orbit.focus.z=npc.position.y-50;}cameraChanged();}
  function resetCamera(){followId=null;const reset=defaultOrbit();orbit.azimuth=reset.azimuth;orbit.elevation=reset.elevation;orbit.zoom=reset.zoom;orbit.focus.copy(reset.focus);cameraChanged();}
  function resize(){if(disposed)return;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);cameraChanged();}

  try{
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,host.clientWidth<768?1.6:1.8));
    renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;
    scene.background=skyDay.clone();scene.fog=new Fog(fogDay,900,2400);scene.add(worldRoot);
    ambient=new HemisphereLight('#cbdde1','#534832',1.20);scene.add(ambient);
    sun=new DirectionalLight(sunDay,2.38);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);
    Object.assign(sun.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:220});
    sun.shadow.bias=-.00025;sun.shadow.normalBias=.095;sun.shadow.radius=3;scene.add(sun,sun.target);
    const fill=new DirectionalLight('#b4cbd6',.78);fill.position.set(28,35,-48);scene.add(fill);
    environment=createExpandedCamp(shapes,origin);worldRoot.add(environment.group);
    weather=createWeatherEffects(environment.rainSurfaces);worldRoot.add(weather.group);
    for(const npc of state.npcs){const rig=createCompanion(npc.id,shapes);companions.set(npc.id,rig);worldRoot.add(rig.root);}
    host.appendChild(canvas);rebuildWorld();
    unbind=bindWorldInput({surface:inputSurface,canvas,camera,orbit,height:()=>height,enabled:()=>!contextLost&&!disposed,
      changed:cameraChanged,releaseFollow:()=>{followId=null;},tap(target,x,y){
        if(!['playing','paused'].includes(state.status))return;
        if(target.kind==='npc')callbacks.onSelect(companionAt(x,y)??target.id as NpcId);
        else if(target.kind==='action')callbacks.onAssign(target.id as ActionId);else pick(x,y);
      }});
    canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
    document.addEventListener('visibilitychange',visibility);reduce.addEventListener('change',motionChange);
    observer=new ResizeObserver(resize);observer.observe(host);resize();callbacks.onStatus('ready');frameId=requestAnimationFrame(frame);
  }catch(error){dispose();throw error;}

  function frame(now:number){
    frameId=0;if(disposed||contextLost||document.hidden)return;
    const dt=Math.min(.06,Math.max(0,(now-(lastTime||now))/1000));lastTime=now;
    const interval=width<768?1000/30:1000/60,animated=state.status==='playing'&&!reducedMotion;
    if((animated||dirty)&&(now-lastRender>=interval-1||dirty)){
      const renderDt=Math.min(.09,Math.max(dt,(now-(lastRender||now))/1000));lastRender=now;
      if(animated)animationTime=Math.min(state.elapsed,animationTime+renderDt*simulationRate);
      else if(reducedMotion&&state.status==='playing')animationTime=state.elapsed;
      try{render(renderDt,now);dirty=false;}catch(error){contextLost=true;callbacks.onStatus('error',`地图绘制中断，进度仍保留。${error instanceof Error?error.message:''}`);return;}
    }
    frameId=requestAnimationFrame(frame);
  }
  function render(dt:number,now:number){
    if(!environment)return;
    const playing=state.status==='playing';
    if(followId){const npc=state.npcs.find(person=>person.id===followId&&person.alive);if(npc){orbit.focus.x=npc.position.x-50;orbit.focus.z=npc.position.y-50;cameraChanged();}else followId=null;}
    const night=Math.max(0,Math.sin(Math.max(0,state.elapsed/Math.max(1,state.duration)-.14)*Math.PI*1.18)),cloud=state.atmosphere.cloudCover;
    environment.update(animationTime,state,reducedMotion);
    const flash=weather?.update(animationTime,state,reducedMotion)??0;
    const cloudShadow=cloud*(reducedMotion ? .92 : .92+Math.sin(animationTime*.16)*.08);
    sun.color.copy(sunDay).lerp(sunNight,night*.64).lerp(sunCloud,cloud*.55);
    sun.intensity=(2.38-night*1.49)*(1-cloudShadow*.62)+flash*2.1;ambient.intensity=(1.20-night*.48)*(1-cloud*.19)+flash*.6;
    renderer.toneMappingExposure=1.04-night*.09+flash*.07;
    (scene.background as Color).copy(skyDay).lerp(skyStorm,cloud).multiplyScalar(1-night*.2);
    (scene.fog as Fog).color.copy(fogDay).lerp(fogStorm,cloud).multiplyScalar(1-night*.16);
    for(const npc of state.npcs){const rig=companions.get(npc.id);if(!rig)continue;
      updateCompanion(rig,npc,dt,animationTime,state.elapsed,npc.id===state.selectedNpc,playing,reducedMotion,state.atmosphere);
      rig.root.position.y=Math.max(-.045,surface(npc.position).height);rig.root.visible=exploration.isExplored(npc.position);
    }
    terrain?.update(reducedMotion?0:animationTime,{x:Math.cos(state.atmosphere.windAngle)*state.atmosphere.windStrength,y:Math.sin(state.atmosphere.windAngle)*state.atmosphere.windStrength},state.npcs.filter(n=>n.alive).map(n=>({...n.position,radius:70})));
    canvas.dataset.visualTime=animationTime.toFixed(3);canvas.dataset.lightning=flash.toFixed(3);canvas.dataset.loadedChunks=String(terrain?.stats().chunks??0);
    renderer.render(scene,camera);
    callbacks.onProject({npcs:Array.from(companions.values()).map(rig=>{
      label.copy(rig.root.position);const feet=projectWorld(camera,label,width,height,origin);feet.visible&&=rig.root.visible;
      label.y+=7.5;return {id:rig.id,feet,head:projectWorld(camera,label,width,height,origin)};
    }),markers:environment.markers.map(marker=>({id:marker.id,point:projectWorld(camera,marker.point,width,height,origin)}))});
    const viewport=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>groundFromScreen(camera,x,y,width,height,()=>orbit.focus.y-1.5,origin)).filter((p):p is Point=>p!==null);
    miniMap?.update({focus:{x:orbit.focus.x+50,y:orbit.focus.z+50},viewport,followedId:followId,
      markers:[{id:'home',kind:'home',point:CAMP_CENTER,color:'#e5c46b',label:'初始营地'},...state.npcs.filter(n=>n.alive).map(n=>({id:n.id,kind:'actor' as const,point:n.position,color:n.color,label:n.name}))]},now);
    frames++;if(!fpsWindow)fpsWindow=now;
    if(now-fpsWindow>1200){measuredFps=Math.round(frames*1000/(now-fpsWindow));frames=0;fpsWindow=now;
      canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.fps=String(measuredFps);}
  }
  function companionAt(x:number,y:number):NpcId|undefined {
    ndc.set(x/width*2-1,-(y/height)*2+1);raycaster.setFromCamera(ndc,camera);worldRoot.updateMatrixWorld(true);
    for(const hit of raycaster.intersectObjects([...companions.values()].map(rig=>rig.pivot),true)){
      let object:Object3D|null=hit.object,id:NpcId|undefined,visible=true;
      while(object){if(!object.visible)visible=false;if(object.userData.npcId)id=object.userData.npcId as NpcId;object=object.parent;}
      if(visible&&id)return id;
    }return undefined;
  }
  function pick(x:number,y:number){
    if(!environment)return;const npc=companionAt(x,y);if(npc){callbacks.onSelect(npc);return;}
    for(const object of environment.pickables){object.updateMatrix();object.matrixWorld.multiplyMatrices(worldRoot.matrixWorld,object.matrix);}
    const hit=raycaster.intersectObjects(environment.pickables,false)[0];
    if(hit?.object.userData.action&&hit.object.userData.action!=='fire'){callbacks.onAssign(hit.object.userData.action);return;}
    const point=groundFromScreen(camera,x,y,width,height,p=>exploration.isExplored(p)?surface(p).height:0,origin);if(point)callbacks.onMove?.(point);
  }
  function lost(event:Event){event.preventDefault();contextLost=true;cancelAnimationFrame(frameId);frameId=0;callbacks.onStatus('error','图形连接中断了。旅程仍然保留，点击重试即可重新绘制地图。');}
  function restored(){if(disposed)return;contextLost=false;renderer.resetState();dirty=true;lastTime=0;callbacks.onStatus('ready');if(!frameId)frameId=requestAnimationFrame(frame);}
  function visibility(){if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else if(!disposed&&!contextLost&&!frameId){lastTime=0;dirty=true;frameId=requestAnimationFrame(frame);}}
  function motionChange(event:MediaQueryListEvent){reducedMotion=event.matches;dirty=true;}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frameId);observer?.disconnect();unbind();miniMap?.dispose();terrain?.dispose();environment?.dispose();
    canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);document.removeEventListener('visibilitychange',visibility);reduce.removeEventListener('change',motionChange);
    const geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>();
    const collect=(object:Object3D)=>{const mesh=object as Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);
      if(mesh.customDepthMaterial)materials.add(mesh.customDepthMaterial);if(mesh.customDistanceMaterial)materials.add(mesh.customDistanceMaterial);};
    scene.traverse(collect);environment?.pickables.forEach(object=>object.traverse(collect));
    for(const mat of materials)for(const value of Object.values(mat))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as Texture);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());shapes.dispose();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();companions.clear();
  }
  return {update(next){const reset=next.elapsed<state.elapsed||next.seed!==state.seed;
      if(reset){animationTime=next.elapsed;simulationRate=1;companions.forEach(rig=>{rig.initialized=false;});}
      else if(next.elapsed>state.elapsed){simulationRate=MathUtils.clamp((next.elapsed-state.elapsed)*10,1,4);if(next.elapsed-animationTime>1.2)animationTime=next.elapsed-.1*simulationRate;}
      state=next;if(reset){rebuildWorld();resetCamera();}dirty=true;},resetCamera,locate,followSelected,
    zoom(amount){orbit.zoom=MathUtils.clamp(orbit.zoom*amount,CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM);cameraChanged();},
    stats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,fps:measuredFps};},dispose};
}
