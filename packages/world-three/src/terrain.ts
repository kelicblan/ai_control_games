import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, Float32BufferAttribute,
  Group, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, RGBAFormat, Vector2,
} from 'three';
import { CHUNK_SIZE, ChunkWindow, type ExplorationMap, type Observer, type WorldPoint } from '../../world-core/src';

export interface TerrainSurface { height:number; water:boolean; waterLevel:number; forest:number; road:number; biome:string }
export interface WorldTerrainOptions {
  exploration:ExplorationMap;
  sample:(point:WorldPoint)=>TerrainSurface;
  riverX:(y:number)=>number; riverWidth:(y:number)=>number;
  treeAt:(x:number,y:number)=>{point:WorldPoint;size:number}|null;
  /** 桥位置由宿主地理定义提供，与导航通行口使用同一数据。 */
  bridges?:(chunk:WorldPoint)=>readonly {point:WorldPoint;halfLength:number;halfWidth:number;height:number}[];
  /** 已存在的精细溪流仍由原场景绘制，扩展层只接上两端。 */
  existingRiverSpan?:{minY:number;maxY:number};
}
export interface WorldTerrain {
  group:Group; setView:(center:WorldPoint,span:number,origin:WorldPoint)=>void;
  update:(time:number,wind:WorldPoint,observers:readonly Observer[])=>void;
  stats:()=>{chunks:number}; dispose:()=>void;
}
interface Tile { group:Group; geometries:BufferGeometry[]; instances:InstancedMesh[] }

/** 通用Three.js表现层。通过采样接口读取游戏地理，不拥有游戏模拟或揭雾权限。 */
export function createWorldTerrain(options:WorldTerrainOptions):WorldTerrain {
  const group=new Group();group.name='Streamed world terrain';
  const fogPixels=new Uint8Array(128*128*4),fogTexture=new DataTexture(fogPixels,128,128,RGBAFormat);
  fogTexture.minFilter=LinearFilter;fogTexture.magFilter=LinearFilter;fogTexture.generateMipmaps=false;
  const fogOffset={value:new Vector2()},fogSpan={value:2048},timeUniform={value:0},windUniform={value:new Vector2()};
  let focus:WorldPoint={x:50,y:55},origin:WorldPoint={x:0,y:0},fogOrigin:WorldPoint={x:-1024,y:-1024};
  let fogKey='',disposed=false,lastObservers='',tileRevision=-1;
  const groundMaterial=new MeshStandardMaterial({vertexColors:true,roughness:1});
  const trunkMaterial=new MeshStandardMaterial({color:'#65533c',roughness:1});
  const leavesMaterial=new MeshStandardMaterial({color:'#718557',roughness:.95});
  const waterMaterial=new MeshStandardMaterial({color:'#548c91',roughness:.26,metalness:.2,transparent:true,opacity:.91});
  const bridgeMaterial=new MeshStandardMaterial({color:'#9c7950',roughness:1});
  const materials=[groundMaterial,trunkMaterial,leavesMaterial,waterMaterial,bridgeMaterial];
  for(const material of materials){
    material.onBeforeCompile=shader=>{
      shader.uniforms.worldFog={value:fogTexture};shader.uniforms.worldFogOffset=fogOffset;shader.uniforms.worldFogSpan=fogSpan;
      shader.uniforms.worldTime=timeUniform;shader.uniforms.worldWind=windUniform;
      shader.vertexShader='varying vec2 worldFogUv;\nuniform vec2 worldFogOffset;\nuniform float worldFogSpan;\nuniform float worldTime;\nuniform vec2 worldWind;\n'+shader.vertexShader;
      if(material===leavesMaterial)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed.xz += worldWind * (sin(worldTime*1.5 + position.y*2.0)*.026) * (position.y+.5);`);
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 fogPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          fogPosition=instanceMatrix*fogPosition;
        #endif
        fogPosition=modelMatrix*fogPosition;
        worldFogUv=(fogPosition.xz+worldFogOffset)/worldFogSpan;`);
      shader.fragmentShader='varying vec2 worldFogUv;\nuniform sampler2D worldFog;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`
        float known=0.0;
        if(worldFogUv.x>=0.0&&worldFogUv.y>=0.0&&worldFogUv.x<=1.0&&worldFogUv.y<=1.0)known=texture2D(worldFog,worldFogUv).r;
        gl_FragColor.rgb=mix(vec3(.016,.027,.035),gl_FragColor.rgb,known);
        #include <dithering_fragment>`);
    };
    material.customProgramCacheKey=()=>material===leavesMaterial?'world-fog-wind-v1':'world-fog-v1';
  }
  const bridgeGeometry=new BoxGeometry(1,1,1);
  const trunkGeometry=new CylinderGeometry(.65,.95,1,6),crownGeometry=new ConeGeometry(1,1,7);
  const matrix=new Matrix4(),dummy=new Object3D(),tint=new Color();
  const landColors={grass:new Color('#718159'),forest:new Color('#536e4b'),mountain:new Color('#8a8973'),river:new Color('#807b60'),soil:new Color('#ae9168')};
  function makeTile(_key:string,chunk:WorldPoint):Tile {
    const tile:Tile={group:new Group(),geometries:[],instances:[]};tile.group.position.set(chunk.x*CHUNK_SIZE-50,0,chunk.y*CHUNK_SIZE-50);group.add(tile.group);
    const geometry=new PlaneGeometry(CHUNK_SIZE,CHUNK_SIZE,16,16);geometry.rotateX(-Math.PI/2);geometry.translate(CHUNK_SIZE/2,0,CHUNK_SIZE/2);
    const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const point={x:chunk.x*CHUNK_SIZE+p.getX(i),y:chunk.y*CHUNK_SIZE+p.getZ(i)};
      if(!options.exploration.isExplored(point)){p.setY(i,0);tint.set('#040709');}
      else {const s=options.sample(point);p.setY(i,s.height);
        tint.copy(s.water?landColors.river:s.biome==='mountain'?landColors.mountain:s.forest>.42?landColors.forest:landColors.grass);
        tint.lerp(landColors.soil,s.road*.65);tint.offsetHSL(0,0,Math.sin(point.x*.13+point.y*.09)*.015);}
      colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b;
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const land=new Mesh(geometry,groundMaterial);land.receiveShadow=true;land.name=`World chunk ${_key}`;
    tile.group.add(land);tile.geometries.push(geometry);
    const trees:{point:WorldPoint;size:number}[]=[];
    const minX=chunk.x*128,minY=chunk.y*128,maxX=minX+128,maxY=minY+128;
    for(let cy=Math.floor(minY/20);cy<=Math.floor(maxY/20);cy++)for(let cx=Math.floor(minX/20);cx<=Math.floor(maxX/20);cx++){
      const tree=options.treeAt(cx,cy);if(!tree||tree.point.x<minX||tree.point.x>=maxX||tree.point.y<minY||tree.point.y>=maxY||!options.exploration.isExplored(tree.point))continue;trees.push(tree);
    }
    if(trees.length){
      const trunks=new InstancedMesh(trunkGeometry,trunkMaterial,trees.length),crowns=new InstancedMesh(crownGeometry,leavesMaterial,trees.length*3);
      const close=Math.hypot(minX-focus.x,minY-focus.y)<260;trunks.castShadow=close;crowns.castShadow=close;crowns.receiveShadow=true;
      for(let i=0;i<trees.length;i++){
        const tree=trees[i],h=options.sample(tree.point).height,x=tree.point.x-minX,z=tree.point.y-minY;
        dummy.position.set(x,h+tree.size*.31,z);dummy.scale.set(tree.size*.07,tree.size*.62,tree.size*.07);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
        for(let layer=0;layer<3;layer++){
          const width=tree.size*(.30-layer*.065);dummy.position.set(x,h+tree.size*(.48+layer*.18),z);
          dummy.scale.set(width,tree.size*(.53-layer*.035),width);dummy.rotation.y=(i*.73+layer*.39);dummy.updateMatrix();matrix.copy(dummy.matrix);crowns.setMatrixAt(i*3+layer,matrix);
          tint.set('#6a8055').offsetHSL((i%5)*.003,0,(i%7)*.012+layer*.015);crowns.setColorAt(i*3+layer,tint);
        }
      }
      trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;crowns.instanceColor!.needsUpdate=true;
      tile.group.add(trunks,crowns);tile.instances.push(trunks,crowns);
    }
    const waterPositions:number[]=[],waterUvs:number[]=[];
    const rows=[minY,...Array.from({length:31},(_,i)=>minY+(i+1)*4),maxY];
    const legacy=options.existingRiverSpan;
    if(legacy)for(const edge of [legacy.minY,legacy.maxY])if(edge>minY&&edge<maxY)rows.push(edge);
    rows.sort((a,b)=>a-b);
    for(let i=0;i<rows.length-1;i++){
      const a=rows[i],b=rows[i+1];if(a===b||legacy&&a>=legacy.minY&&b<=legacy.maxY)continue;
      const xa=options.riverX(a),xb=options.riverX(b),wa=options.riverWidth(a),wb=options.riverWidth(b);
      if(Math.max(xa+wa,xb+wb)<minX||Math.min(xa-wa,xb-wb)>maxX)continue;
      if(!options.exploration.isExplored({x:(xa+xb)/2,y:(a+b)/2}))continue;
      const leftA=Math.max(minX,Math.min(maxX,xa-wa)),rightA=Math.max(minX,Math.min(maxX,xa+wa));
      const leftB=Math.max(minX,Math.min(maxX,xb-wb)),rightB=Math.max(minX,Math.min(maxX,xb+wb));
      const ha=options.sample({x:xa,y:a}).waterLevel,hb=options.sample({x:xb,y:b}).waterLevel;
      for(const [x,h,y] of [[leftA,ha,a],[leftB,hb,b],[rightA,ha,a],[rightA,ha,a],[leftB,hb,b],[rightB,hb,b]]){
        waterPositions.push(x-minX,h,y-minY);waterUvs.push(x*.04,y*.04);
      }
    }
    if(waterPositions.length){const water=new BufferGeometry();water.setAttribute('position',new Float32BufferAttribute(waterPositions,3));water.setAttribute('uv',new Float32BufferAttribute(waterUvs,2));water.computeVertexNormals();
      const mesh=new Mesh(water,waterMaterial);mesh.name='Continuous river extension';tile.group.add(mesh);tile.geometries.push(water);}
    // 每座桥只由拥有其中心点的地图块创建，重复加载与卸载不会生成双桥。
    for(const bridge of options.bridges?.(chunk)??[]){
      if(!options.exploration.isExplored(bridge.point))continue;
      const count=Math.ceil(bridge.halfLength*2),planks=new InstancedMesh(bridgeGeometry,bridgeMaterial,count+6);
      planks.name='River crossing bridge';planks.castShadow=true;planks.receiveShadow=true;
      for(let i=0;i<count;i++){
        dummy.position.set(bridge.point.x-minX-bridge.halfLength+(i+.5)*(bridge.halfLength*2/count),bridge.height-.16,bridge.point.y-minY);
        dummy.scale.set(bridge.halfLength*2/count*.95,.32,bridge.halfWidth*2);dummy.rotation.set(0,0,0);dummy.updateMatrix();planks.setMatrixAt(i,dummy.matrix);
      }
      for(let side=0;side<2;side++){
        const z=bridge.point.y-minY+(side?1:-1)*(bridge.halfWidth+.1);
        dummy.position.set(bridge.point.x-minX,bridge.height+1.25,z);dummy.scale.set(bridge.halfLength*2,.2,.2);dummy.updateMatrix();planks.setMatrixAt(count+side*3,dummy.matrix);
        for(let end=0;end<2;end++){
          dummy.position.set(bridge.point.x-minX+(end?1:-1)*(bridge.halfLength-.5),bridge.height+.4,z);dummy.scale.set(.4,2.4,.4);dummy.updateMatrix();planks.setMatrixAt(count+side*3+1+end,dummy.matrix);
        }
      }
      planks.instanceMatrix.needsUpdate=true;tile.group.add(planks);tile.instances.push(planks);
    }
    return tile;
  }
  const chunks=new ChunkWindow<Tile>(169,makeTile,tile=>{group.remove(tile.group);tile.geometries.forEach(g=>g.dispose());tile.instances.forEach(mesh=>mesh.dispose());});
  function refreshFog(observers:readonly Observer[]){
    fogOrigin={x:Math.floor((focus.x-1024)/16)*16,y:Math.floor((focus.y-1024)/16)*16};
    const key=`${fogOrigin.x}:${fogOrigin.y}:${options.exploration.revision}`;
    const actors=observers.map(o=>`${Math.floor(o.x/8)}:${Math.floor(o.y/8)}:${o.radius}`).join('|');
    fogOffset.value.set(origin.x+50-fogOrigin.x,origin.y+50-fogOrigin.y);
    if(key===fogKey&&actors===lastObservers)return;fogKey=key;lastObservers=actors;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const state=options.exploration.visibility({x:fogOrigin.x+(x+.5)*16,y:fogOrigin.y+(y+.5)*16},observers),i=(y*128+x)*4;
      const value=state==='unknown'?0:state==='visible'?255:205;fogPixels[i]=value;fogPixels[i+1]=value;fogPixels[i+2]=value;fogPixels[i+3]=255;
    }
    fogTexture.needsUpdate=true;
  }
  let observers:readonly Observer[]=[];
  return {group,setView(center,span,renderOrigin){focus={...center};origin={...renderOrigin};
    if(tileRevision!==options.exploration.revision){chunks.dispose();tileRevision=options.exploration.revision;}
    const radius=Math.max(2,Math.min(6,Math.ceil(span/256)+1));chunks.update(focus,radius);refreshFog(observers);},
    update(time,wind,nextObservers){timeUniform.value=time;windUniform.value.set(wind.x,wind.y);observers=nextObservers;refreshFog(observers);
      waterMaterial.color.set('#548c91').offsetHSL(0,0,Math.sin(time*.7)*.012);},
    stats(){return {chunks:chunks.size};},dispose(){if(disposed)return;disposed=true;chunks.dispose();bridgeGeometry.dispose();trunkGeometry.dispose();crownGeometry.dispose();materials.forEach(m=>m.dispose());fogTexture.dispose();group.clear();}};
}
