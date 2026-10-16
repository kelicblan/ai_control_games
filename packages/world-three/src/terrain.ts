import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, Float32BufferAttribute,
  Group, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, RGBAFormat, RepeatWrapping, Vector2,type Texture,
} from 'three';
import { CHUNK_SIZE, ChunkWindow, type ExplorationMap, type Observer, type WorldPoint } from '../../world-core/src';
import {prepareModelTemplate,instanceModel,templateMaterials} from './modelInstances';
import {partitionGeometry} from './spatialGeometry';

export interface TerrainSurface { height:number; water:boolean; waterLevel:number; forest:number; road:number; biome:string }
export interface WorldTerrainOptions {
  buildBudgetMs?:number;
  maxBuildsPerFrame?:number;
  exploration:ExplorationMap;
  sample:(point:WorldPoint)=>TerrainSurface;
  riverX:(y:number)=>number; riverWidth:(y:number)=>number;
  treeAt:(x:number,y:number)=>{point:WorldPoint;size:number}|null;
  treeModel?:Group;
  treeLodModel?:Group;
  rockTexture?:Texture;
  groundModel?:{source:Group;min:number;max:number};
  renderTrees?:boolean;
  /** 桥位置由宿主地理定义提供，与导航通行口使用同一数据。 */
  bridges?:(chunk:WorldPoint)=>readonly {point:WorldPoint;halfLength:number;halfWidth:number;height:number;axis?:'x'|'y'}[];
  /** 已存在的精细溪流仍由原场景绘制，扩展层只接上两端。 */
  existingRiverSpan?:{minY:number;maxY:number};
}
export interface WorldTerrain {
  group:Group; setView:(center:WorldPoint,span:number,origin:WorldPoint)=>void;
  update:(time:number,wind:WorldPoint,observers:readonly Observer[])=>void;
  stats:()=>{chunks:number;pending:number;created:number;released:number}; dispose:()=>void;
}
interface Tile { group:Group; geometries:BufferGeometry[]; instances:InstancedMesh[]; chunk:WorldPoint; signature:string;
 forest?:{trees:{point:WorldPoint;size:number}[];point:WorldPoint;near:boolean;group:Group} }

/** 通用Three.js表现层。通过采样接口读取游戏地理，不拥有游戏模拟或揭雾权限。 */
export function createWorldTerrain(options:WorldTerrainOptions):WorldTerrain {
  const group=new Group();group.name='Streamed world terrain';
  const fogPixels=new Uint8Array(128*128*4),fogTexture=new DataTexture(fogPixels,128,128,RGBAFormat);
  fogTexture.minFilter=LinearFilter;fogTexture.magFilter=LinearFilter;fogTexture.generateMipmaps=false;
  const fogOffset={value:new Vector2()},renderOffset={value:new Vector2()},fogSpan={value:2048},timeUniform={value:0},windUniform={value:new Vector2()};
  let focus:WorldPoint={x:50,y:55},origin:WorldPoint={x:0,y:0},fogOrigin:WorldPoint={x:-1024,y:-1024},viewSpan=1000,detailed=false;
  let fogKey='',disposed=false,lastObservers='',tileRevision=-1;
  let created=0,released=0;
  const groundPixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const n=Math.sin(x*127.1+y*311.7)*43758.5453,grain=(n-Math.floor(n)-.5)*36;
    const value=220+grain+Math.sin(x*.39+Math.sin(y*.21)*2)*9,i=(y*128+x)*4;
    groundPixels.set([value,value,value,255],i);
  }
  const groundTexture=new DataTexture(groundPixels,128,128,RGBAFormat);groundTexture.wrapS=groundTexture.wrapT=RepeatWrapping;
  groundTexture.repeat.set(24,24);groundTexture.needsUpdate=true;
  const groundMaterial=new MeshStandardMaterial({map:groundTexture,vertexColors:true,roughness:1});
  const trunkMaterial=new MeshStandardMaterial({color:'#65533c',roughness:1});
  const leavesMaterial=new MeshStandardMaterial({color:'#436751',roughness:.95});
  const waterMaterial=new MeshStandardMaterial({color:'#608b87',roughness:.37,metalness:.05,transparent:true,opacity:.93});
  const bridgeMaterial=new MeshStandardMaterial({color:'#9c7950',roughness:1});
  const treeTemplate=options.treeModel?prepareModelTemplate(options.treeModel,true):null;
  const treeLodTemplate=options.treeLodModel?prepareModelTemplate(options.treeLodModel,true):null;
  const modelTreeMaterials=new Set([...treeTemplate?templateMaterials(treeTemplate):[],...treeLodTemplate?templateMaterials(treeLodTemplate):[]]);
  const materials=[groundMaterial,trunkMaterial,leavesMaterial,waterMaterial,bridgeMaterial,...treeTemplate?templateMaterials(treeTemplate):[],...treeLodTemplate?templateMaterials(treeLodTemplate):[]];
  for(const material of materials){
    material.onBeforeCompile=shader=>{
      shader.uniforms.worldFog={value:fogTexture};shader.uniforms.worldFogOffset=fogOffset;shader.uniforms.worldFogSpan=fogSpan;
      shader.uniforms.worldTime=timeUniform;shader.uniforms.worldWind=windUniform;
      shader.uniforms.worldRenderOrigin=renderOffset;
      shader.vertexShader='varying vec2 worldFogUv;\nuniform vec2 worldFogOffset;\nuniform float worldFogSpan;\nuniform float worldTime;\nuniform vec2 worldWind;\n'+shader.vertexShader;
      if(material===waterMaterial){
        shader.vertexShader='attribute float riverAcross; varying float bankAcross; varying vec2 riverWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          transformed.y += sin((position.z+modelMatrix[3].z)*.55-worldTime*1.8)*.055;
          bankAcross=riverAcross;`);
      }
      if(material===leavesMaterial)shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        transformed.xz += worldWind * (sin(worldTime*1.5 + position.y*2.0)*.026) * (position.y+.5);`);
      if(modelTreeMaterials.has(material))shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        #ifdef USE_INSTANCING
          transformed.xz+=worldWind*pow(clamp(position.y,0.0,1.0),2.0)*sin(worldTime*1.9+instanceMatrix[3].x*.12+instanceMatrix[3].z*.09)*.035;
        #endif`);
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 fogPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          fogPosition=instanceMatrix*fogPosition;
        #endif
        fogPosition=modelMatrix*fogPosition;
        worldFogUv=(fogPosition.xz+worldFogOffset)/worldFogSpan;`);
      if(material===waterMaterial)shader.vertexShader=shader.vertexShader.replace('worldFogUv=(fogPosition.xz+worldFogOffset)/worldFogSpan;',
        'worldFogUv=(fogPosition.xz+worldFogOffset)/worldFogSpan; riverWorld=fogPosition.xz;');
      shader.fragmentShader='varying vec2 worldFogUv;\nuniform sampler2D worldFog;\n'+shader.fragmentShader;
      if(material===groundMaterial){
        shader.vertexShader='attribute float roadWear; varying float trackWear; varying vec2 trackPosition; uniform vec2 trackOrigin;\n'+shader.vertexShader;
        shader.uniforms.trackOrigin=renderOffset;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n trackWear=roadWear; trackPosition=position.xz+modelMatrix[3].xz+trackOrigin;');
        shader.fragmentShader=`varying float trackWear; varying vec2 trackPosition;
          float soilNoise(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
            vec4 h=fract(sin(vec4(dot(a,vec2(127.1,311.7)),dot(a+vec2(1,0),vec2(127.1,311.7)),dot(a+vec2(0,1),vec2(127.1,311.7)),dot(a+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
            return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
          `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float bare=smoothstep(.25,.57,trackWear+(soilNoise(trackPosition*.8)-.5)*.12);
          float rut=exp(-pow((trackWear-.65)/.07,2.0))*.12;
          vec3 earth=vec3(.34,.25,.15)*(.8+soilNoise(trackPosition*3.5)*.26+soilNoise(trackPosition*.3)*.12-rut);
          diffuseColor.rgb=mix(diffuseColor.rgb,earth,bare*.92);`);
      }
      if(material===groundMaterial&&options.rockTexture){
        shader.uniforms.mountainRockMap={value:options.rockTexture};
        shader.vertexShader='attribute float exposedRock; uniform vec2 worldRenderOrigin; varying float rockCoverage; varying vec3 rockPosition; varying vec3 rockNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n rockCoverage=exposedRock; rockPosition=position+modelMatrix[3].xyz+vec3(worldRenderOrigin.x,0.0,worldRenderOrigin.y); rockNormal=normalize(mat3(modelMatrix)*normal);');
        shader.fragmentShader='uniform sampler2D mountainRockMap; varying float rockCoverage; varying vec3 rockPosition; varying vec3 rockNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec3 weights=pow(abs(normalize(rockNormal)),vec3(4.0));weights/=max(.001,weights.x+weights.y+weights.z);
          vec3 crag=texture2D(mountainRockMap,rockPosition.yz*.055).rgb*weights.x
            +texture2D(mountainRockMap,rockPosition.xz*.055).rgb*weights.y
            +texture2D(mountainRockMap,rockPosition.xy*.055).rgb*weights.z;
          diffuseColor.rgb*=mix(vec3(1.0),vec3(.48)+crag*1.8,rockCoverage*.9);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          float relief=dot(crag,vec3(.299,.587,.114))*rockCoverage;
          vec3 sx=normalize(dFdx(-vViewPosition)),sy=normalize(dFdy(-vViewPosition));
          vec3 r1=cross(sy,normal),r2=cross(normal,sx);float determinant=dot(sx,r1);
          normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(relief)*r1+dFdy(relief)*r2)*.7);`);
      }
      if(material===waterMaterial){
        shader.fragmentShader='varying float bankAcross; varying vec2 riverWorld; uniform float worldTime;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float thread=pow(max(0.0,sin(riverWorld.y*.81+sin(riverWorld.x*.61)*2.4-worldTime*1.7)),25.0);
          float edge=smoothstep(.72,.99,abs(bankAcross));
          float breakup=.5+.5*sin(riverWorld.y*.37+sin(riverWorld.x*.29)*3.0);
          float foam=(thread*.12+edge*.28)*breakup*(.65+.35*sin(riverWorld.y*2.7-worldTime*3.0));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.98,1.0),clamp(foam,0.0,.85));`);
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`
        float known=0.0;
        if(worldFogUv.x>=0.0&&worldFogUv.y>=0.0&&worldFogUv.x<=1.0&&worldFogUv.y<=1.0)known=texture2D(worldFog,worldFogUv).r;
        gl_FragColor.rgb=mix(vec3(.016,.027,.035),gl_FragColor.rgb,known);
        #include <dithering_fragment>`);
    };
    material.customProgramCacheKey=()=>material===groundMaterial?'world-fog-rock-v2':material===leavesMaterial?'world-fog-wind-v1':modelTreeMaterials.has(material)?'world-model-tree-wind-v1':'world-fog-v1';
  }
  const initialGeometries:BufferGeometry[]=[];
  if(options.groundModel){
    const model=options.groundModel.source.clone(true);model.name='Unified valley terrain GLB';
    const groundMeshes:Mesh[]=[];model.traverse(o=>{if(o instanceof Mesh)groundMeshes.push(o);});
    for(const o of groundMeshes){
      o.geometry=o.geometry.clone();
      const rock=o.geometry.getAttribute('exposedRock')??o.geometry.getAttribute('_exposedrock');
      o.geometry.setAttribute('exposedRock',rock??new Float32BufferAttribute(new Float32Array(o.geometry.getAttribute('position').count),1));
      const road=o.geometry.getAttribute('roadWear')??o.geometry.getAttribute('_roadwear');
      o.geometry.setAttribute('roadWear',road??new Float32BufferAttribute(new Float32Array(o.geometry.getAttribute('position').count),1));
      const cells=partitionGeometry(o.geometry,128);initialGeometries.push(...cells);
      for(const geometry of cells){const mesh=new Mesh(geometry,groundMaterial);mesh.name='Visible landscape cell';mesh.position.copy(o.position);mesh.quaternion.copy(o.quaternion);mesh.scale.copy(o.scale);mesh.receiveShadow=true;o.parent!.add(mesh);}
      o.parent!.remove(o);
    }group.add(model);
  }
  const bridgeGeometry=new BoxGeometry(1,1,1);
  const trunkGeometry=new CylinderGeometry(.65,.95,1,7),crownGeometry=new ConeGeometry(1,1,9,2);
  const matrix=new Matrix4(),dummy=new Object3D(),tint=new Color();
  const landColors={grass:new Color('#64814c'),forest:new Color('#49683f'),mountain:new Color('#8c9288'),river:new Color('#999581'),soil:new Color('#a88d65')};
  function makeTile(_key:string,chunk:WorldPoint):Tile {
    created++;
    const tile:Tile={group:new Group(),geometries:[],instances:[],chunk,signature:options.exploration.tileSignature(chunk)};tile.group.position.set(chunk.x*CHUNK_SIZE-50,0,chunk.y*CHUNK_SIZE-50);group.add(tile.group);
    const bounds=options.groundModel,covered=bounds&&chunk.x*128>=bounds.min&&chunk.y*128>=bounds.min&&(chunk.x+1)*128<=bounds.max&&(chunk.y+1)*128<=bounds.max;
    if(!covered){
    const geometry=new PlaneGeometry(CHUNK_SIZE,CHUNK_SIZE,32,32);geometry.rotateX(-Math.PI/2);geometry.translate(CHUNK_SIZE/2,0,CHUNK_SIZE/2);
    const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3),rockCoverage=new Float32Array(p.count),roadWear=new Float32Array(p.count);
    for(let i=0;i<p.count;i++){
      const point={x:chunk.x*CHUNK_SIZE+p.getX(i),y:chunk.y*CHUNK_SIZE+p.getZ(i)};
      if(!options.exploration.isExplored(point)){p.setY(i,0);tint.set('#040709');}
      else {const s=options.sample(point);p.setY(i,s.height);roadWear[i]=s.road;
        tint.copy(s.water?landColors.river:landColors.grass);
        if(!s.water){
          tint.lerp(landColors.forest,Math.min(.75,s.forest*.7));
          const slope=Math.hypot(options.sample({x:point.x+2,y:point.y}).height-s.height,options.sample({x:point.x,y:point.y+2}).height-s.height)/2;
          const rock=Math.min(1,Math.max(0,(s.height-50)/70))*Math.min(1,.7+slope*.35);
          tint.lerp(landColors.mountain,rock);
          rockCoverage[i]=rock;
          tint.multiplyScalar(1+rock*Math.sin(s.height*.27+point.x*.045)*.07);
        }
        tint.lerp(landColors.soil,s.road*.65);tint.offsetHSL(0,0,Math.sin(point.x*.13+point.y*.09)*.025);}
      colors[i*3]=tint.r;colors[i*3+1]=tint.g;colors[i*3+2]=tint.b;
    }
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('exposedRock',new Float32BufferAttribute(rockCoverage,1));geometry.setAttribute('roadWear',new Float32BufferAttribute(roadWear,1));geometry.computeVertexNormals();
    const land=new Mesh(geometry,groundMaterial);land.receiveShadow=true;land.name=`World chunk ${_key}`;
    tile.group.add(land);tile.geometries.push(geometry);
    }
    const trees:{point:WorldPoint;size:number}[]=[];
    const minX=chunk.x*128,minY=chunk.y*128,maxX=minX+128,maxY=minY+128;
    for(let cy=Math.floor(minY/20)-1;cy<=Math.floor(maxY/20)+1;cy++)for(let cx=Math.floor(minX/20)-1;cx<=Math.floor(maxX/20)+1;cx++){
      const tree=options.treeAt(cx,cy);if(!tree||tree.point.x<minX||tree.point.x>=maxX||tree.point.y<minY||tree.point.y>=maxY||!options.exploration.isExplored(tree.point))continue;trees.push(tree);
    }
    if(trees.length&&treeTemplate){
      const near=detailed&&Math.hypot(minX-focus.x,minY-focus.y)<220,template=near?treeTemplate:treeLodTemplate??treeTemplate;
      const forest=instanceModel(template,trees.map(t=>({x:t.point.x-minX,y:options.sample(t.point).height,z:t.point.y-minY,scale:t.size,angle:t.point.x*.17+t.point.y*.31})),
        'Instanced Tripo alpine forest',near);
      forest.userData.forestDetail=near?'full':'lod';tile.forest={trees,point:{x:minX,y:minY},near,group:forest};
      forest.traverse(o=>{if(o instanceof InstancedMesh)tile.instances.push(o);});tile.group.add(forest);
    }else if(trees.length&&options.renderTrees!==false){
      const trunks=new InstancedMesh(trunkGeometry,trunkMaterial,trees.length),crowns=new InstancedMesh(crownGeometry,leavesMaterial,trees.length*5);
      const close=Math.hypot(minX-focus.x,minY-focus.y)<260;trunks.castShadow=close;crowns.castShadow=close;crowns.receiveShadow=true;
      for(let i=0;i<trees.length;i++){
        const tree=trees[i],h=options.sample(tree.point).height,x=tree.point.x-minX,z=tree.point.y-minY;
        dummy.position.set(x,h+tree.size*.31,z);dummy.scale.set(tree.size*.07,tree.size*.62,tree.size*.07);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
        for(let layer=0;layer<5;layer++){
          const width=tree.size*(.30-layer*.047);dummy.position.set(x,h+tree.size*(.34+layer*.145),z);
          dummy.scale.set(width,tree.size*(.42-layer*.025),width);dummy.rotation.y=(i*.73+layer*.39);dummy.updateMatrix();matrix.copy(dummy.matrix);crowns.setMatrixAt(i*5+layer,matrix);
          tint.set('#587650').offsetHSL((i%5)*.003,0,(i%7)*.01+layer*.012);crowns.setColorAt(i*5+layer,tint);
        }
      }
      trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;crowns.instanceColor!.needsUpdate=true;
      tile.group.add(trunks,crowns);tile.instances.push(trunks,crowns);
    }
    const waterPositions:number[]=[],waterUvs:number[]=[],waterAcross:number[]=[];
    const rows=[minY,...Array.from({length:63},(_,i)=>minY+(i+1)*2),maxY];
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
        waterAcross.push((x-options.riverX(y))/options.riverWidth(y));
      }
    }
    if(waterPositions.length){const water=new BufferGeometry();water.setAttribute('position',new Float32BufferAttribute(waterPositions,3));water.setAttribute('uv',new Float32BufferAttribute(waterUvs,2));water.setAttribute('riverAcross',new Float32BufferAttribute(waterAcross,1));water.computeVertexNormals();
      const mesh=new Mesh(water,waterMaterial);mesh.name='Continuous river extension';tile.group.add(mesh);tile.geometries.push(water);}
    // 每座桥只由拥有其中心点的地图块创建，重复加载与卸载不会生成双桥。
    for(const bridge of options.bridges?.(chunk)??[]){
      if(!options.exploration.isExplored(bridge.point))continue;
      const count=Math.ceil(bridge.halfLength*2),planks=new InstancedMesh(bridgeGeometry,bridgeMaterial,count+6);
      planks.name='River crossing bridge';planks.castShadow=true;planks.receiveShadow=true;
      for(let i=0;i<count;i++){
        const along=-bridge.halfLength+(i+.5)*(bridge.halfLength*2/count);
        dummy.position.set(bridge.point.x-minX+(bridge.axis==='y'?0:along),bridge.height-.16,bridge.point.y-minY+(bridge.axis==='y'?along:0));
        dummy.scale.set(bridge.halfLength*2/count*.95,.32,bridge.halfWidth*2);dummy.rotation.set(0,bridge.axis==='y'?Math.PI/2:0,0);dummy.updateMatrix();planks.setMatrixAt(i,dummy.matrix);
      }
      for(let side=0;side<2;side++){
        const offset=(side?1:-1)*(bridge.halfWidth+.1),z=bridge.point.y-minY+(bridge.axis==='y'?0:offset);
        dummy.position.set(bridge.point.x-minX+(bridge.axis==='y'?offset:0),bridge.height+1.25,z);dummy.rotation.set(0,0,0);dummy.scale.set(bridge.axis==='y'?.2:bridge.halfLength*2,.2,bridge.axis==='y'?bridge.halfLength*2:.2);dummy.updateMatrix();planks.setMatrixAt(count+side*3,dummy.matrix);
        for(let end=0;end<2;end++){
          const along=(end?1:-1)*(bridge.halfLength-.5);
          dummy.position.set(bridge.point.x-minX+(bridge.axis==='y'?offset:along),bridge.height+.4,z+(bridge.axis==='y'?along:0));dummy.scale.set(.4,2.4,.4);dummy.updateMatrix();planks.setMatrixAt(count+side*3+1+end,dummy.matrix);
        }
      }
      planks.instanceMatrix.needsUpdate=true;tile.group.add(planks);tile.instances.push(planks);
    }
    return tile;
  }
  const chunks=new ChunkWindow<Tile>(169,makeTile,tile=>{released++;group.remove(tile.group);tile.geometries.forEach(g=>g.dispose());tile.instances.forEach(mesh=>mesh.dispose());});
  function refreshForest(tile:Tile){
    const forest=tile.forest;if(!forest||!treeTemplate)return;
    const near=detailed&&Math.hypot(forest.point.x-focus.x,forest.point.y-focus.y)<220;if(near===forest.near)return;
    const retired=new Set<InstancedMesh>();forest.group.traverse(o=>{if(o instanceof InstancedMesh){retired.add(o);o.dispose();}});
    tile.instances=tile.instances.filter(o=>!retired.has(o));tile.group.remove(forest.group);
    const template=near?treeTemplate:treeLodTemplate??treeTemplate;
    const replacement=instanceModel(template,forest.trees.map(t=>({x:t.point.x-forest.point.x,y:options.sample(t.point).height,z:t.point.y-forest.point.y,scale:t.size,angle:t.point.x*.17+t.point.y*.31})),
      'Instanced Tripo alpine forest',near);replacement.userData.forestDetail=near?'full':'lod';
    replacement.traverse(o=>{if(o instanceof InstancedMesh)tile.instances.push(o);});tile.group.add(replacement);forest.group=replacement;forest.near=near;
  }
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
  return {group,setView(center,span,renderOrigin){focus={...center};origin={...renderOrigin};renderOffset.value.set(origin.x,origin.y);
    viewSpan=span;detailed=viewSpan<360;
    if(tileRevision!==options.exploration.revision){chunks.invalidate((_key,tile)=>tile.signature!==options.exploration.tileSignature(tile.chunk));tileRevision=options.exploration.revision;}
    const radius=Math.max(2,Math.min(6,Math.ceil(span/256)+1));chunks.update(focus,radius,options.maxBuildsPerFrame===undefined?Infinity:0,options.buildBudgetMs);for(const tile of chunks.values())refreshForest(tile);refreshFog(observers);},
    update(time,wind,nextObservers){timeUniform.value=time;windUniform.value.set(wind.x,wind.y);observers=nextObservers;refreshFog(observers);
      chunks.update(focus,Math.max(2,Math.min(6,Math.ceil(viewSpan/256)+1)),options.maxBuildsPerFrame,options.buildBudgetMs);
      waterMaterial.color.set('#608b87').offsetHSL(0,0,Math.sin(time*.7)*.008);},
    stats(){return {chunks:chunks.size,pending:chunks.pendingCount,created,released};},dispose(){if(disposed)return;disposed=true;chunks.dispose();initialGeometries.forEach(g=>g.dispose());treeTemplate?.dispose();treeLodTemplate?.dispose();bridgeGeometry.dispose();trunkGeometry.dispose();crownGeometry.dispose();materials.forEach(m=>m.dispose());groundTexture.dispose();fogTexture.dispose();group.clear();}};
}
