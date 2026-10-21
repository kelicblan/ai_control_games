import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('native/CampMind.Unity/Assets/CampMind/Content/Animals');
const reports = [];
for (const species of fs.readdirSync(root)) {
  const file = path.join(root, species, `${species}Actions.glb`);
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${file}`);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const primitives = doc.meshes.flatMap(mesh => mesh.primitives);
  const triangles = primitives.reduce((total, primitive) => total + doc.accessors[primitive.indices].count / 3, 0);
  const joints = doc.skins?.reduce((total, skin) => total + skin.joints.length, 0) ?? 0;
  if (!joints || !triangles || primitives.some(primitive => primitive.attributes.JOINTS_0 === undefined || primitive.attributes.WEIGHTS_0 === undefined)) throw new Error(`Missing skin data: ${file}`);
  const materials = doc.materials ?? [];
  if (!materials.length || materials.some(material => material.pbrMetallicRoughness?.baseColorTexture === undefined)) throw new Error(`Missing base color texture: ${file}`);
  const nodes = doc.nodes;
  for (const skin of doc.skins) if (skin.joints.some(index => !nodes[index])) throw new Error(`Invalid joint index: ${file}`);
  const clips=doc.animations?.map(animation=>animation.name)??[];
  for(const required of ['Idle','Walk','Run','Attack','Hurt','Death'])if(!clips.includes(required))throw new Error(`Missing ${required}: ${file}`);
  const report = { species, bytes: bytes.length, triangles, joints, images: doc.images?.length ?? 0, animations: clips, passed: true };
  reports.push(report);
}
if (reports.length !== 7) throw new Error(`Expected seven animal rigs; found ${reports.length}`);
const output = path.resolve('native/AnimalAssetSources/wildlife-structure-audit.json');
fs.writeFileSync(output, JSON.stringify({ passed: true, animals: reports }, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, animals: reports }, null, 2));
