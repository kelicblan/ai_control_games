import { createWorldState, NPC_SIGHT_RADIUS } from '../games/camp/world/state';
import {
  ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight,
  MathUtils, Mesh, OrthographicCamera, PerspectiveCamera, PCFShadowMap, Raycaster, Scene, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import type { ActionId, GameState, NpcId, Point } from '../games/camp/simulation/types';
import { configureCamera, defaultOrbit, groundFromScreen, projectWorld, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM } from './camera';
import type { ScreenPoint } from './camera';
import { bindWorldInput } from '../../packages/world-three/src/input';
import { createWorldTerrain } from '../../packages/world-three/src/terrain';
import {LANDSCAPE_GRID} from '../games/camp/world/landscape';
import type { WorldTerrain } from '../../packages/world-three/src/terrain';
import { createMiniMap } from '../../packages/world-ui/src/minimap';
import type { MiniMap } from '../../packages/world-ui/src/minimap';
import { ExplorationMap, validPoint } from '../../packages/world-core/src';
import '../../packages/world-ui/src/minimap.css';
import { CAMP_CENTER, sampleCampSurface, riverCenter, riverHalfWidth, treeAt, walkingHeight, bridgeAt, isOnBridge,GATE_BRIDGE } from '../games/camp/world/definition';
import { createExpandedCamp } from '../games/camp/world/environment';
import { createSubjectCharacter, updateSubjectCharacter, disposeSubjectCharacter } from './subjectCharacter';
import type { SubjectRig } from './subjectCharacter';
import { Shapes } from './geometry';
import { createWeatherEffects } from './weather';
import type { WeatherEffects } from './weather';
import { configureThirdPerson, defaultThirdPerson,LORD_CAMERA_MIN_DISTANCE,LORD_CAMERA_MAX_DISTANCE } from '../../packages/world-three/src/thirdPerson';
import { bindLordInput } from './lordInput';
import { createLordCharacter, disposeLordCharacter, updateLordCharacter } from './lordCharacter';
import { getCampClock } from '../games/camp/simulation/clock';
import { getCampLighting } from './lighting';
import {readCameraOrbit,writeCameraOrbit} from './cameraMemory';
import {scenePixelRatio,nextSceneQuality} from './renderBudget';
import {advanceVisualTime} from './visualClock';
import { createWilderness } from './wilderness';
import { RESOURCE_NAMES, ANIMAL_NAMES } from '../games/camp/world/ecology';
import { FrameProfile } from './frameProfile';

export type ViewMode = 'god' | 'lord';

export interface SceneProjection {
  lord?: ScreenPoint;
  npcs: { id: NpcId; feet: ScreenPoint; head: ScreenPoint }[];
  markers: { id: string; point: ScreenPoint }[];
}
export interface SceneStats { calls:number; triangles:number; geometries:number; textures:number; fps:number; profile?:ReturnType<FrameProfile['snapshot']> }
export interface SceneCallbacks {
  onSelect:(id:NpcId)=>void; onAssign:(action:ActionId)=>void; onMove?:(point:Point)=>void;
  onProject:(projection:SceneProjection)=>void; onStatus:(status:'ready'|'error',message?:string)=>void;
  onViewDirection?:(right:Point)=>void;
  onLordInput?:(direction:Point)=>void; onViewMode?:(mode:ViewMode)=>void;
}
export interface CampScene {
  update:(state:GameState)=>void; resetCamera:()=>void; zoom:(amount:number)=>void;
  locate:(point:Point)=>void; followSelected:()=>void;
  setViewMode:(mode:ViewMode)=>void;
  stats:()=>SceneStats; dispose:(saveView?:boolean)=>void;
}

/** 场景只读取游戏状态。相机移动不修改人物位置、不推进时间，也不能揭开黑雾。 */
export function createCampScene(host:HTMLElement,initial:GameState,callbacks:SceneCallbacks):CampScene {
  let renderer:WebGLRenderer;
  try{renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
  catch{throw new Error('无法开启立体营地。请确认浏览器支持 WebGL，或关闭省电模式后重试。');}
  const scene=new Scene(),worldRoot=new Group(),godCamera=new OrthographicCamera(),lordCamera=new PerspectiveCamera(),orbit=readCameraOrbit(initial.seed),shapes=new Shapes();
  let camera:OrthographicCamera|PerspectiveCamera=godCamera,viewMode:ViewMode='god';
  const thirdPerson=defaultThirdPerson(),cameraRay=Object.assign(new Raycaster(),{firstHitOnly:true});
  const lordRig=createLordCharacter(shapes);
  const wilderness=createWilderness(shapes);worldRoot.add(wilderness.group);
  const origin=new Vector3(),raycaster=new Raycaster(),ndc=new Vector2(),label=new Vector3();
  const companions=new Map<NpcId,SubjectRig>();
  let environment:ReturnType<typeof createExpandedCamp>|null=null,weather:WeatherEffects|null=null,terrain:WorldTerrain|null=null,miniMap:MiniMap|null=null;
  let exploration:ExplorationMap;
  let state=initial,width=1,height=1,frameId=0,disposed=false,contextLost=false,dirty=true;
  void lordRig.modelReady.then(()=>{if(!disposed)dirty=true;});
  let lastTime=0,lastRender=0,animationTime=initial.elapsed,simulationRate=1,frames=0,fpsWindow=0,measuredFps=0;
  let lastShadowRender=-Infinity;
  const profile=new FrameProfile(new URLSearchParams(window.location.search).get('profile')==='1');
  let stageStarted=0;
  function markStage(name:string){if(!profile.enabled)return;const end=performance.now();profile.record(name,end-stageStarted);stageStarted=end;}
  let qualityScale=1,qualityStarted=performance.now(),qualityWindows=0;
  let lastSnapshotTime=performance.now();
  let followId:NpcId|null=null,observer:ResizeObserver|null=null,unbind:()=>void=()=>{};
  let cameraSaveTimer:ReturnType<typeof setTimeout>|undefined;
  function saveCamera(){if(cameraSaveTimer!==undefined)clearTimeout(cameraSaveTimer);cameraSaveTimer=undefined;writeCameraOrbit(state.seed,orbit);}
  window.addEventListener('pagehide',saveCamera);
  let lordControls:ReturnType<typeof bindLordInput>|null=null;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');let reducedMotion=reduce.matches;
  const canvas=renderer.domElement;canvas.className='scene-canvas';canvas.setAttribute('aria-hidden','true');
  canvas.dataset.renderer='three.js';canvas.dataset.dimension='3';
  const inputSurface=host.parentElement??host;
  let sun:DirectionalLight,ambient:HemisphereLight,fill:DirectionalLight;
  const sunDay=new Color('#fff0d5'),sunNight=new Color('#b8ccdc'),sunCloud=new Color('#c8d3dd');
  const skyDay=new Color('#bfd9e7'),skyStorm=new Color('#647983'),fogDay=new Color('#c5d5d3'),fogStorm=new Color('#768a91');

  function surface(point:Point){return sampleCampSurface(point,state.seed);}
  function rebuildWorld(){
    miniMap?.dispose();if(terrain){worldRoot.remove(terrain.group);terrain.dispose();}
    exploration=ExplorationMap.restore((state.world ?? createWorldState(state.seed)).exploration);
    terrain=createWorldTerrain({exploration,sample:surface,riverX:riverCenter,riverWidth:riverHalfWidth,buildBudgetMs:3,maxBuildsPerFrame:2,
      groundModel:environment?.terrainModel?{source:environment.terrainModel,min:LANDSCAPE_GRID.min,max:LANDSCAPE_GRID.max}:undefined,
      treeAt:(x,y)=>treeAt(x,y,state.seed),treeModel:environment?.forestModel,treeLodModel:environment?.forestLodModel,rockTexture:environment?.rockTexture,renderTrees:true,bridges(chunk){
        const result=[];for(let index=Math.ceil((chunk.y*128-55)/640);index<=Math.floor(((chunk.y+1)*128-55)/640);index++){
          const bridge=bridgeAt(index);if(Math.floor(bridge.point.x/128)===chunk.x&&Math.floor(bridge.point.y/128)===chunk.y)result.push(bridge);
        }if(Math.floor(GATE_BRIDGE.point.x/128)===chunk.x&&Math.floor(GATE_BRIDGE.point.y/128)===chunk.y)result.push(GATE_BRIDGE);return result;
      }});worldRoot.add(terrain.group);
    miniMap=createMiniMap(inputSurface,{home:CAMP_CENTER,exploration,onLocate:locate,onHome:resetCamera,onFollow:followSelected,
      colorAt(point){const s=surface(point);return isOnBridge(point)?[168,135,87]:s.water?[76,129,143]:s.biome==='mountain'?[138,139,116]:s.forest>.42?[62,91,62]:[117,137,83];}});
  }
  function cameraChanged(){
    if(!validPoint({x:orbit.focus.x+50,y:orbit.focus.z+50}))return;
    const focus=viewMode==='lord'&&state.lord?{x:lordRig.root.position.x+50,y:lordRig.root.position.z+50}:{x:orbit.focus.x+50,y:orbit.focus.z+50};
    orbit.focus.y=(exploration?.isExplored(focus)?Math.max(-.05,surface(focus).height):0)+1.5;
    // 渲染坐标原点跟随视窗重定位；存档和模拟永远保留未偏移的世界坐标。
    origin.set(Math.round((focus.x-50)/1024)*1024,0,Math.round((focus.y-50)/1024)*1024);
    worldRoot.position.copy(origin).multiplyScalar(-1);worldRoot.updateMatrix();
    // Camera rays need current house transforms; the renderer updates the rest
    // of the world once. Avoid forcing every tree matrix twice per display frame.
    environment?.houses.group.updateWorldMatrix(true,true);
    if(viewMode==='lord') configureThirdPerson(lordCamera,width,height,focus,walkingHeight(focus,state.seed),thirdPerson,origin,
      p=>walkingHeight(p,state.seed),(from,to)=>{
        cameraRay.set(from,to.clone().sub(from).normalize());cameraRay.near=.4;cameraRay.far=from.distanceTo(to);
        return environment?cameraRay.intersectObject(environment.houses.group,true)[0]?.distance??Infinity:Infinity;
      });
    else configureCamera(godCamera,width,height,orbit,origin);
    const span=viewMode==='lord'?Math.max(120,thirdPerson.distance*6):Math.max(godCamera.right-godCamera.left,(godCamera.top-godCamera.bottom)/Math.sin(orbit.elevation))/godCamera.zoom;
    terrain?.setView(focus,span,{x:origin.x,y:origin.z});
    if(sun){sun.position.set(focus.x-50-origin.x-38,orbit.focus.y+68,focus.y-50-origin.z+35);
      sun.target.position.set(focus.x-50-origin.x,orbit.focus.y,focus.y-50-origin.z);
      const span=viewMode==='lord'?85:220;
      if(sun.shadow.camera.right!==span){Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span});sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;lastShadowRender=-Infinity;}
    }
    canvas.dataset.focusX=focus.x.toFixed(2);canvas.dataset.focusY=focus.y.toFixed(2);canvas.dataset.cameraMode=viewMode==='lord'?'lord':followId?'follow':'free';
    canvas.dataset.viewMode=viewMode;
    canvas.dataset.cameraDistance=thirdPerson.distance.toFixed(2);
    if(viewMode==='god'&&cameraSaveTimer===undefined)cameraSaveTimer=setTimeout(saveCamera,300);
    callbacks.onViewDirection?.({x:camera.matrixWorld.elements[0],y:camera.matrixWorld.elements[2]});dirty=true;
  }
  function setViewMode(mode:ViewMode){
    if(mode===viewMode)return;lordControls?.stop();viewMode=mode;camera=mode==='lord'?lordCamera:godCamera;
    cameraChanged();callbacks.onViewMode?.(mode);
  }
  function locate(point:Point){if(!validPoint(point))return;setViewMode('god');followId=null;orbit.focus.x=point.x-50;orbit.focus.z=point.y-50;cameraChanged();}
  function followSelected(){const npc=state.npcs.find(person=>person.id===state.selectedNpc&&person.alive);if(!npc)return;
    setViewMode('god');
    followId=followId===npc.id?null:npc.id;if(followId){orbit.focus.x=npc.position.x-50;orbit.focus.z=npc.position.y-50;}cameraChanged();}
  function resetCamera(){if(viewMode==='lord'){Object.assign(thirdPerson,defaultThirdPerson());cameraChanged();return;}followId=null;const reset=defaultOrbit();orbit.azimuth=reset.azimuth;orbit.elevation=reset.elevation;orbit.zoom=reset.zoom;orbit.focus.copy(reset.focus);cameraChanged();}
  function resize(){if(disposed)return;width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);const ratio=scenePixelRatio(width,height,window.devicePixelRatio||1)*qualityScale;if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);canvas.dataset.renderScale=ratio.toFixed(3);cameraChanged();}

  try{
    renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;
    renderer.shadowMap.autoUpdate=false;
    scene.background=skyDay.clone();scene.fog=new Fog(fogDay,430,1500);scene.add(worldRoot);
    ambient=new HemisphereLight('#e7f1ff','#948362',1.4);scene.add(ambient);
    sun=new DirectionalLight(sunDay,4.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-220,right:220,top:220,bottom:-220,near:1,far:550});
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias=-.00025;sun.shadow.normalBias=.095;sun.shadow.radius=3;scene.add(sun,sun.target);
    fill=new DirectionalLight('#c9def0',.45);fill.position.set(28,35,-48);scene.add(fill);
    environment=createExpandedCamp(shapes,origin,initial.seed);worldRoot.add(environment.group);
    canvas.dataset.houseModelState=environment.houses.group.userData.modelState;
    void environment.houses.ready.then(()=>{
      if(disposed||!environment)return;
      canvas.dataset.houseModelState=environment.houses.group.userData.modelState;
      qualityStarted=performance.now();
      canvas.dataset.terrainModelState=environment.terrainModel?'ready':'fallback';
      canvas.dataset.terrainRock=environment.rockTexture?'ready':'missing';
      rebuildWorld();cameraChanged();
      dirty=true; // A paused scene must redraw when the GLB finishes loading.
    });
    weather=createWeatherEffects(environment.rainSurfaces,undefined,{
      groundHeight:(x,z)=>walkingHeight({x:x+50,y:z+50},state.seed),
      focus:()=>viewMode==='lord'&&state.lord?{x:lordRig.root.position.x,y:lordRig.root.position.z}:{x:orbit.focus.x,y:orbit.focus.z},
    });worldRoot.add(weather.group);
    for(const npc of state.npcs){const rig=createSubjectCharacter(npc.id,shapes);companions.set(npc.id,rig);worldRoot.add(rig.root);void rig.modelReady.then(()=>{if(!disposed)dirty=true;});}
    worldRoot.add(lordRig.root);updateLordCharacter(lordRig,state,.016,state.elapsed,reducedMotion);
    host.appendChild(canvas);rebuildWorld();
    unbind=bindWorldInput({surface:inputSurface,canvas,camera:godCamera,orbit,height:()=>height,enabled:()=>viewMode==='god'&&!contextLost&&!disposed&&!inputSurface.closest('[inert]'),
      changed:cameraChanged,releaseFollow:()=>{followId=null;},tap(target,x,y){
        if(!['playing','paused'].includes(state.status))return;
        if(target.kind==='npc')callbacks.onSelect(companionAt(x,y)??target.id as NpcId);
        else if(target.kind==='action')callbacks.onAssign(target.id as ActionId);else pick(x,y);
      }});
    lordControls=bindLordInput({canvas,view:thirdPerson,enabled:()=>viewMode==='lord'&&state.status==='playing'&&!contextLost&&!disposed&&!inputSurface.closest('[inert]'),
      move:direction=>callbacks.onLordInput?.(direction),changed:cameraChanged});
    canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
    document.addEventListener('visibilitychange',visibility);reduce.addEventListener('change',motionChange);
    observer=new ResizeObserver(resize);observer.observe(host);resize();callbacks.onStatus('ready');frameId=requestAnimationFrame(frame);
  }catch(error){dispose();throw error;}

  function frame(now:number){
    frameId=0;if(disposed||contextLost||document.hidden)return;
    const dt=Math.min(.06,Math.max(0,(now-(lastTime||now))/1000));lastTime=now;
    const interval=width<768?1000/30:1000/60,animated=state.status==='playing'&&!reducedMotion;
    const pending=!!terrain?.stats().pending||!!miniMap?.pending();
    if((animated||dirty||pending)&&(now-lastRender>=interval-1||dirty)){
      const renderDt=Math.min(.09,Math.max(dt,(now-(lastRender||now))/1000));lastRender=now;
      if(animated)animationTime=advanceVisualTime(animationTime,state.elapsed,renderDt,simulationRate);
      else if(reducedMotion&&state.status==='playing')animationTime=state.elapsed;
      if(animated)profile.begin(now);else profile.resetInterval();
      try{render(renderDt,now);dirty=!!terrain?.stats().pending||!!miniMap?.pending();}catch(error){contextLost=true;callbacks.onStatus('error',`地图绘制中断，进度仍保留。${error instanceof Error?error.message:''}`);return;}
    }
    frameId=requestAnimationFrame(frame);
  }
  function render(dt:number,now:number){
    if(!environment)return;
    const renderStarted=profile.enabled?performance.now():0;stageStarted=renderStarted;
    const playing=state.status==='playing';
    updateLordCharacter(lordRig,state,dt,animationTime,reducedMotion);if(state.lord)lordRig.root.position.y=walkingHeight({x:lordRig.root.position.x+50,y:lordRig.root.position.z+50},state.seed);
    if(viewMode==='lord')cameraChanged();
    else if(followId){const npc=state.npcs.find(person=>person.id===followId&&person.alive);if(npc){orbit.focus.x=npc.position.x-50;orbit.focus.z=npc.position.y-50;cameraChanged();}else followId=null;}
    markStage('lordAndCamera');
    const night=1-getCampClock(state.elapsed).daylight,cloud=state.atmosphere.cloudCover;
    environment.update(animationTime,state,reducedMotion);
    markStage('environment');
    const flash=weather?.update(animationTime,state,reducedMotion)??0;
    markStage('weather');
    const effects=weather?.stats();canvas.dataset.rainParticles=String(effects?.rain??0);canvas.dataset.windParticles=String((effects?.leaves??0)+(effects?.gusts??0));
    const lighting=getCampLighting(state.elapsed,cloud,flash);
    sun.color.copy(sunDay).lerp(sunNight,night*.64).lerp(sunCloud,cloud*.55);
    sun.intensity=lighting.sun;ambient.intensity=lighting.ambient;fill.intensity=lighting.fill;
    sun.position.set(sun.target.position.x+lighting.offset.x,sun.target.position.y+lighting.offset.y,sun.target.position.z+lighting.offset.z);
    renderer.toneMappingExposure=lighting.exposure;
    (scene.background as Color).copy(skyDay).lerp(skyStorm,cloud*.65).multiplyScalar(1-night*.6);
    (scene.fog as Fog).color.copy(fogDay).lerp(fogStorm,cloud*.65).multiplyScalar(1-night*.45);
    canvas.dataset.dayPeriod=getCampClock(state.elapsed).period;canvas.dataset.sunIntensity=sun.intensity.toFixed(2);
    for(const npc of state.npcs){const rig=companions.get(npc.id);if(!rig)continue;
      updateSubjectCharacter(rig,npc,dt,animationTime,state.elapsed,npc.id===state.selectedNpc,playing,reducedMotion,state.atmosphere);
      rig.root.position.y=walkingHeight({x:rig.root.position.x+50,y:rig.root.position.z+50},state.seed);rig.root.visible=exploration.isExplored(npc.position);
    }
    markStage('lightingAndCharacters');
    wilderness.update(state,animationTime,viewMode==='lord'&&state.lord?state.lord.position:{x:orbit.focus.x+50,y:orbit.focus.z+50},reducedMotion);
    markStage('wilderness');
    canvas.dataset.visibleAnimals=String(wilderness.group.userData.visibleAnimals??0);canvas.dataset.wildernessResources=String(wilderness.group.userData.resourceCount??0);
    terrain?.update(reducedMotion?0:animationTime,{x:Math.cos(state.atmosphere.windAngle)*state.atmosphere.windStrength,y:Math.sin(state.atmosphere.windAngle)*state.atmosphere.windStrength},[...state.npcs.filter(n=>n.alive).map(n=>({...n.position,radius:NPC_SIGHT_RADIUS})),...(state.lord?[{...state.lord.position,radius:NPC_SIGHT_RADIUS}]:[])]);
    canvas.dataset.visualTime=animationTime.toFixed(3);canvas.dataset.lightning=flash.toFixed(3);canvas.dataset.loadedChunks=String(terrain?.stats().chunks??0);
    markStage('terrain');
    // Keep full-resolution shadows, but avoid redrawing every static model into
    // the 2048px shadow map on every display frame.
    if(now-lastShadowRender>=1000/10||!playing||reducedMotion){renderer.shadowMap.needsUpdate=true;lastShadowRender=now;}
    environment.houses.setCameraPosition?.({x:camera.position.x+origin.x,y:camera.position.y,z:camera.position.z+origin.z});
    markStage('shadowAndInteriors');
    const shadowFrame=renderer.shadowMap.needsUpdate;
    renderer.render(scene,camera);
    markStage(shadowFrame?'renderSubmitWithShadow':'renderSubmit');
    canvas.dataset.lordModel=lordRig.root.userData.modelStatus;canvas.dataset.lordAnimation=lordRig.root.userData.animation??'fallback';
    canvas.dataset.subjectModels=[...companions].filter(([,rig])=>rig.root.userData.modelStatus).map(([id,rig])=>`${id}:${rig.root.userData.modelStatus}`).join(',');
    if(state.lord){canvas.dataset.lordX=state.lord.position.x.toFixed(3);canvas.dataset.lordY=state.lord.position.y.toFixed(3);}
    label.copy(lordRig.root.position);label.y+=8.5;
    callbacks.onProject({lord:state.lord?projectWorld(camera,label,width,height,origin):undefined,npcs:Array.from(companions.values()).map(rig=>{
      label.copy(rig.root.position);const feet=projectWorld(camera,label,width,height,origin);feet.visible&&=rig.root.visible;
      label.y+=7.5;const head=projectWorld(camera,label,width,height,origin);head.visible&&=rig.root.visible;return {id:rig.id,feet,head};
    }),markers:environment.markers.map(marker=>({id:marker.id,point:projectWorld(camera,marker.point,width,height,origin)}))});
    markStage('labels');
    const viewport=[[0,0],[width,0],[width,height],[0,height]].map(([x,y])=>groundFromScreen(camera,x,y,width,height,()=>orbit.focus.y-1.5,origin)).filter((p):p is Point=>p!==null);
    miniMap?.update({focus:viewMode==='lord'&&state.lord?state.lord.position:{x:orbit.focus.x+50,y:orbit.focus.z+50},viewport,followedId:viewMode==='god'?followId:null,
      markers:[{id:'home',kind:'home',point:CAMP_CENTER,color:'#e5c46b',label:'初始营地'},...(state.lord?[{id:state.lord.playerId,kind:'actor' as const,point:state.lord.position,color:'#ffe5a0',label:'领主 · 你'}]:[]),...state.npcs.filter(n=>n.alive).map(n=>({id:n.id,kind:'actor' as const,point:n.position,color:n.color,label:n.name})),
        ...(state.world?.ecology?.resources.filter(r=>r.discovered&&r.remaining>0).map(r=>({id:r.id,kind:'place' as const,point:r.position,color:r.kind==='wood'?'#bd9964':'#9dc866',label:RESOURCE_NAMES[r.kind]}))??[]),
        ...(state.world?.ecology?.animals.filter(a=>a.health>0&&a.species==='tiger'&&state.npcs.some(n=>n.alive&&Math.hypot(n.position.x-a.position.x,n.position.y-a.position.y)<70)).map(a=>({id:a.id,kind:'place' as const,point:a.position,color:'#d27350',label:`发现${ANIMAL_NAMES[a.species]} · 危险`}))??[])]},now);
    markStage('minimap');
    if(profile.enabled)profile.record('totalCPU',performance.now()-renderStarted);
    frames++;if(!fpsWindow)fpsWindow=now;
    if(now-fpsWindow>1200){measuredFps=Math.round(frames*1000/(now-fpsWindow));frames=0;fpsWindow=now;
      canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.fps=String(measuredFps);
      if(profile.enabled)canvas.dataset.performance=JSON.stringify({...profile.snapshot(),terrain:terrain?.stats()});
      if(playing&&!reducedMotion&&now-qualityStarted>8000&&++qualityWindows>=2){qualityWindows=0;
        const next=nextSceneQuality(qualityScale,measuredFps);
        if(next!==qualityScale){qualityScale=next;resize();
          const shadowSize=qualityScale<.9?1024:2048;
          if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);renderer.shadowMap.needsUpdate=true;}
        }
      }
    }
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
  function visibility(){profile.resetInterval();if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}else if(!disposed&&!contextLost&&!frameId){lastTime=0;dirty=true;frameId=requestAnimationFrame(frame);}}
  function motionChange(event:MediaQueryListEvent){reducedMotion=event.matches;dirty=true;}
  function dispose(saveView=true){
    if(disposed)return;
    if(saveView)saveCamera();else if(cameraSaveTimer!==undefined)clearTimeout(cameraSaveTimer);
    window.removeEventListener('pagehide',saveCamera);disposed=true;disposeLordCharacter(lordRig);cancelAnimationFrame(frameId);observer?.disconnect();unbind();lordControls?.dispose();miniMap?.dispose();terrain?.dispose();environment?.dispose();
    canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);document.removeEventListener('visibilitychange',visibility);reduce.removeEventListener('change',motionChange);
    const geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>();
    const collect=(object:Object3D)=>{const mesh=object as Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);
      if(mesh.customDepthMaterial)materials.add(mesh.customDepthMaterial);if(mesh.customDistanceMaterial)materials.add(mesh.customDistanceMaterial);};
    scene.traverse(collect);environment?.pickables.forEach(object=>object.traverse(collect));
    for(const mat of materials)for(const value of Object.values(mat))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as Texture);
    companions.forEach(disposeSubjectCharacter);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());shapes.dispose();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();companions.clear();
  }
  return {update(next){const receivedAt=performance.now(),reset=next.elapsed<state.elapsed||next.seed!==state.seed;
    if(reset){wilderness.reset();animationTime=next.elapsed;simulationRate=1;lordRig.initialized=false;companions.forEach(rig=>{rig.initialized=false;});}
      else if(next.elapsed>state.elapsed){simulationRate=MathUtils.clamp((next.elapsed-state.elapsed)*1000/Math.max(100,receivedAt-lastSnapshotTime),1,4);if(next.elapsed-animationTime>1.2)animationTime=next.elapsed-.1*simulationRate;}
      lastSnapshotTime=receivedAt;
      const changed=(next.world?.revision??0)!==(state.world?.revision??0);
      state=next;if(reset){rebuildWorld();resetCamera();}
      else if(changed&&next.world){exploration.synchronize(next.world.exploration);cameraChanged();}
      canvas.dataset.explorationRevision=String(next.world?.revision??0);dirty=true;},resetCamera,locate,followSelected,setViewMode,
    zoom(amount){if(viewMode==='lord')thirdPerson.distance=MathUtils.clamp(thirdPerson.distance/amount,LORD_CAMERA_MIN_DISTANCE,LORD_CAMERA_MAX_DISTANCE);else orbit.zoom=MathUtils.clamp(orbit.zoom*amount,CAMERA_MIN_ZOOM,CAMERA_MAX_ZOOM);cameraChanged();},
    stats(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,fps:measuredFps,...profile.enabled?{profile:profile.snapshot()}:{}};},dispose};
}
