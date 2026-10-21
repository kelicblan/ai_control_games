import {mkdir,writeFile} from 'node:fs/promises';
import {Group,Mesh,MeshStandardMaterial} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {buildLandscapeGeometry} from './unity/asset-source/landscapeModel';
import {LANDSCAPE_GRID,LANDSCAPE_REVISION} from '../src/games/camp/world/landscape';

// GLTFExporter uses FileReader for binary buffer assembly, even without images.
class NodeFileReader {
 result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;
 readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}
 readAsDataURL(blob:Blob){void blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}
}
Object.assign(globalThis,{FileReader:NodeFileReader});
const geometry=buildLandscapeGeometry(),material=new MeshStandardMaterial({vertexColors:true,roughness:1}),model=new Group();
model.name='Authored valley terrain · mountains, riverbed and ancient tracks';
model.add(new Mesh(geometry,material));model.userData={revision:LANDSCAPE_REVISION,grid:LANDSCAPE_GRID,units:'metres',authoring:'connected ridge networks, drainage spline, embedded worn roads'};
const glb=await new GLTFExporter().parseAsync(model,{binary:true});
const output=new URL('../public/assets/models/valley/terrain/',import.meta.url);await mkdir(output,{recursive:true});
await writeFile(new URL('model.glb',output),Buffer.from(glb as ArrayBuffer));
await writeFile(new URL('manifest.json',output),JSON.stringify({...model.userData,vertices:geometry.getAttribute('position').count,triangles:geometry.index!.count/3,bytes:(glb as ArrayBuffer).byteLength},null,2));
geometry.dispose();material.dispose();console.log(`Exported terrain GLB: ${(glb as ArrayBuffer).byteLength} bytes`);
