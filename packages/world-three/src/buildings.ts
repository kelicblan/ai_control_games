import { BoxGeometry, DataTexture, RGBAFormat, SRGBColorSpace, InstancedMesh, Matrix4, Object3D, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping } from 'three';
import { buildingWalls, type BuildingFootprint } from '../../world-core/src/buildings';
import type { WorldPoint } from '../../world-core/src';

export interface ThatchedHouse extends BuildingFootprint {
  id:string; name:string; wallHeight:number; roofHeight:number; beds:readonly WorldPoint[];
}
export interface HouseVisuals {
  group:Group; roofs:Mesh[]; setSelectedPosition:(point:WorldPoint|null)=>void; dispose:()=>void;
}
/** 简单茅草屋：木骨、泥墙、厚屋顶、床铺和桌子。无游戏角色/任务依赖。 */
export function createThatchedHouses(houses:readonly ThatchedHouse[]):HouseVisuals {
  const group=new Group();group.name='Thatched camp homes';
  const box=new BoxGeometry(1,1,1),roofGeometries:PlaneGeometry[]=[],roofs:Mesh[]=[];
  // 确定性茅草纹理不依赖DOM，渲染、服务端测试和未来Worker均使用同一材质数据。
  const pixels=new Uint8Array(256*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const grain=Math.sin(x*2.71+Math.floor(y/29)*.6)*15+Math.sin(x*.47+y*.13)*9-(y%64<3?16:0);
    const offset=(y*256+x)*4;pixels[offset]=160+grain;pixels[offset+1]=139+grain;pixels[offset+2]=84+grain;pixels[offset+3]=255;
  }
  const texture=new DataTexture(pixels,256,256,RGBAFormat);texture.colorSpace=SRGBColorSpace;
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(3,3);texture.needsUpdate=true;
  const wood=new MeshStandardMaterial({color:'#70543a',roughness:1});
  const walls=new MeshStandardMaterial({color:'#baa079',roughness:1});
  const floor=new MeshStandardMaterial({color:'#87724f',roughness:1});
  const bedding=new MeshStandardMaterial({color:'#aaa478',roughness:1});
  const dark=new MeshStandardMaterial({color:'#353c32',roughness:1});
  const materials:MeshStandardMaterial[]=[wood,walls,floor,bedding,dark];
  const batches=new Map<Group,Map<MeshStandardMaterial,Matrix4[]>>(),instances:InstancedMesh[]=[],dummy=new Object3D();
  const add=(parent:Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:MeshStandardMaterial)=>{
    let byMaterial=batches.get(parent);if(!byMaterial){byMaterial=new Map();batches.set(parent,byMaterial);}
    let transforms=byMaterial.get(mat);if(!transforms){transforms=[];byMaterial.set(mat,transforms);}
    dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();transforms.push(dummy.matrix.clone());
  };
  for(const house of houses){
    const home=new Group();home.name=house.name;group.add(home);
    const x=house.center.x-50,z=house.center.y-50,hx=house.half.x,hz=house.half.y;
    // 薄地板不抬高人物逻辑地面；物理墙体直接取同一布局函数。
    add(home,x,-.06,z,hx*2,.1,hz*2,floor);
    for(const wall of buildingWalls(house))add(home,wall.center.x-50,house.wallHeight/2,wall.center.y-50,wall.half.x*2,house.wallHeight,wall.half.y*2,walls);
    for(const side of [-1,1])for(const end of [-1,1])add(home,x+side*hx,house.wallHeight/2,z+end*hz,.6,house.wallHeight+.3,.6,wood);
    for(const side of [-1,1]){
      add(home,x+side*house.doorWidth/2,house.wallHeight/2,z+hz,.4,house.wallHeight,.6,wood);
      add(home,x+side*hx,house.wallHeight*.57,z-.4,.5,1.35,2.5,dark);
      add(home,x+side*(hx+.03),house.wallHeight*.57,z-.4,.53,1.4,.15,wood);
    }
    add(home,x,house.wallHeight-.25,z+hz,house.doorWidth,.5,.65,wood);
    const roofGeometry=new PlaneGeometry(hx*2+2,hz*2+2,24,16);roofGeometry.rotateX(-Math.PI/2);
    const vertices=roofGeometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++)vertices.setY(i,house.wallHeight+(house.roofHeight-house.wallHeight)*(1-Math.abs(vertices.getX(i))/(hx+1)));
    roofGeometry.computeVertexNormals();roofGeometries.push(roofGeometry);
    const roofMaterial=new MeshStandardMaterial({color:new Color('#d2bd8a'),map:texture,roughness:1,side:DoubleSide});materials.push(roofMaterial);
    const roof=new Mesh(roofGeometry,roofMaterial);roof.name=`${house.id} thatched roof`;roof.position.set(x,0,z);roof.castShadow=true;roof.receiveShadow=true;home.add(roof);roofs.push(roof);
    // 两层檐口给茅草屋顶厚度；独立模型仍共享纹理和几何，避免大量绘制调用。
    const under=new Mesh(roofGeometry,roofMaterial);under.position.set(x,-.3,z);home.add(under);roof.userData.under=under;
    add(home,x,house.roofHeight-.05,z,.55,.45,hz*2+2.4,wood);
    for(const bed of house.beds){
      add(home,bed.x-50,.2,bed.y-50,2.6,.4,3.3,wood);
      add(home,bed.x-50,.49,bed.y-50,2.4,.2,3.05,bedding);
      add(home,bed.x-50,.65,bed.y-51.05,1.9,.22,.6,walls);
    }
    add(home,x-hx+2.2,1.5,z+hz-2.8,2.8,.3,1.7,wood);
    for(const side of [-1,1])add(home,x-hx+2.2+side, .7,z+hz-2.8,.2,1.4,1.2,wood);
  }
  // 墙体、木骨与家具按材质合批，手机不需要为每根柱子单独绘制。
  for(const [parent,byMaterial] of batches)for(const [mat,transforms] of byMaterial){
    const mesh=new InstancedMesh(box,mat,transforms.length);mesh.name='Batched house structure and furniture';
    transforms.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);instances.push(mesh);
  }
  let disposed=false;
  return {group,roofs,setSelectedPosition(point){houses.forEach((house,i)=>{
      // 只在选中屋内角色时剖开屋顶；实体墙、雨水遮挡与模拟均不改变。
      const inside=!!point&&Math.abs(point.x-house.center.x)<house.half.x&&Math.abs(point.y-house.center.y)<house.half.y;
      roofs[i].visible=!inside;const under=roofs[i].userData.under as Mesh;under.visible=!inside;
    });},dispose(){if(disposed)return;disposed=true;instances.forEach(mesh=>mesh.dispose());box.dispose();roofGeometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();group.clear();}};
}
