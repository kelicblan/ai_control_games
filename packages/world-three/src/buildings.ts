import { BoxGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping } from 'three';
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
  const straw=document.createElement('canvas');straw.width=256;straw.height=256;
  const ctx=straw.getContext('2d');
  if(ctx){ctx.fillStyle='#96804d';ctx.fillRect(0,0,256,256);
    for(let i=0;i<1800;i++){const x=(i*73.31)%256,y=(i*29.79)%256;
      ctx.strokeStyle=i%3===0?'#c2ab71':i%3===1?'#807044':'#ab955e';ctx.lineWidth=i%5===0?2:1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(i)*2,y+11+i%19);ctx.stroke();}}
  const texture=new CanvasTexture(straw);texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(3,3);
  const wood=new MeshStandardMaterial({color:'#70543a',roughness:1});
  const walls=new MeshStandardMaterial({color:'#baa079',roughness:1});
  const floor=new MeshStandardMaterial({color:'#87724f',roughness:1});
  const bedding=new MeshStandardMaterial({color:'#aaa478',roughness:1});
  const dark=new MeshStandardMaterial({color:'#353c32',roughness:1});
  const materials:MeshStandardMaterial[]=[wood,walls,floor,bedding,dark];
  const add=(parent:Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:MeshStandardMaterial)=>{
    const mesh=new Mesh(box,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
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
  let disposed=false;
  return {group,roofs,setSelectedPosition(point){houses.forEach((house,i)=>{
      // 只在选中屋内角色时剖开屋顶；实体墙、雨水遮挡与模拟均不改变。
      const inside=!!point&&Math.abs(point.x-house.center.x)<house.half.x&&Math.abs(point.y-house.center.y)<house.half.y;
      roofs[i].visible=!inside;const under=roofs[i].userData.under as Mesh;under.visible=!inside;
    });},dispose(){if(disposed)return;disposed=true;box.dispose();roofGeometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();group.clear();}};
}
